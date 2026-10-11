/// <reference lib="webworker" />
import { decodeImageFile, TOO_MANY_PIXELS } from "@/lib/image-compressor/decode"
import { sniffFormat } from "@/lib/image-compressor/formats"
import {
  closePdf,
  mergePages,
  openPdf,
  openPicture,
  PasswordNeeded,
  renderPage,
  UNREADABLE,
  type MergeSource,
  type OpenedPdf,
} from "./mupdf-engine"
import { pageSizes, readPage, searchPage } from "@/lib/pdf-reader/mupdf-read"
import {
  areaTexts,
  halvePdf,
  pageInk,
  splitBySize,
  splitPart,
} from "@/lib/pdf-splitter/mupdf-split"
import { codecs } from "@/lib/pdf-compressor/codecs"
import { auditPdf, type Audit } from "@/lib/pdf-compressor/mupdf-audit"
import { compressPdf } from "@/lib/pdf-compressor/mupdf-compress"
import { jpegOrientation, quarterTurns } from "./picture"
import type { Size } from "@/lib/image-compressor/geometry"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { Bookmark } from "./outline"
import { carriesAttachments } from "@/lib/pdf-splitter/options"
import type { PdfRequest, PdfResponse } from "./protocol"

declare const self: DedicatedWorkerGlobalScope

/**
 * The engine waits for its WebAssembly file as it is imported. It is loaded
 * here, not with an import at the top: a worker that is still waiting on its
 * imports has no message handler yet, and loses what it is sent.
 */
const engine = import("mupdf")
// A failure is reported by whichever request needs the engine first.
engine.catch(() => {})
const ENGINE_FAILED =
  "The PDF engine could not be loaded. Check your connection and reload the page."

const FAILED =
  "The files could not be merged. Try again, or remove the last file you added."

const SPLIT_FAILED =
  "The file could not be split. Try again, or add the file once more."

const COMPRESS_FAILED =
  "The file could not be compressed. Try again, or add the file once more."

const TOO_LARGE =
  "This is more than this device can handle at once. Remove some files, reload the page and try again."

const UNREADABLE_PICTURE = "This picture could not be read. It may be damaged."

class Cancelled extends Error {}

/** Files held open, by the id the page gave them. */
const files = new Map<string, OpenedPdf>()
/** Files as they were before their double pages were cut in half. */
const originals = new Map<string, OpenedPdf>()

/** Let go of a file, and of the file it was cut from. */
function closeFile(id: string) {
  const pdf = files.get(id)
  const original = originals.get(id)
  if (pdf) closePdf(pdf)
  if (original && original !== pdf) closePdf(original)
  files.delete(id)
  originals.delete(id)
}
/** Jobs at or below this number have been called off. */
let cancelled = 0

const post = (message: PdfResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

/** Messages we wrote for the page are passed on; anything else gets a plain one. */
const readable = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ""
  // The engine, or the browser on its behalf, ran out of memory.
  if (error instanceof RangeError || /memory|malloc|alloc/i.test(message))
    return TOO_LARGE
  return /^[A-Z].*[.!]$/.test(message) && message.length < 200
    ? message
    : fallback
}

/** A picture as a one-page file. A JPEG is kept as it is where its orientation allows. */
async function picture(mupdf: Awaited<typeof engine>, file: Blob) {
  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())
  const format = sniffFormat(head)
  if (!format) throw new Error("This picture could not be read.")
  // SVG needs the page to draw it, which a worker cannot ask for.
  if (format === "svg")
    throw new Error("SVG cannot be added as a page. Convert it to PNG first.")
  if (format === "jpeg") {
    const turn = quarterTurns(jpegOrientation(head))
    // A mirrored photograph has to be redrawn; a turned one does not.
    if (turn !== null)
      return openPicture(mupdf, {
        jpeg: new Uint8Array(await file.arrayBuffer()),
        turn,
      })
  }
  let pixels
  try {
    pixels = await decodeImageFile(file, format)
  } catch (error) {
    // Each browser words a failed decode its own way; the page says one thing.
    throw new Error(
      (error as Error).message === TOO_MANY_PIXELS
        ? TOO_MANY_PIXELS
        : UNREADABLE_PICTURE
    )
  }
  return openPicture(mupdf, {
    pixels: { data: pixels.data, width: pixels.width, height: pixels.height },
  })
}

async function open(request: Extract<PdfRequest, { type: "open" }>) {
  let mupdf: Awaited<typeof engine>
  try {
    mupdf = await engine
  } catch {
    post({ type: "open-error", id: request.id, message: ENGINE_FAILED })
    return
  }
  try {
    closeFile(request.id)
    const pdf = request.picture
      ? await picture(mupdf, request.file)
      : openPdf(
          mupdf,
          new Uint8Array(await request.file.arrayBuffer()),
          request.password
        )
    files.set(request.id, pdf)
    post({ type: "opened", id: request.id, facts: pdf.facts })
  } catch (error) {
    if (error instanceof PasswordNeeded)
      post({ type: "locked", id: request.id, wrong: error.wrong })
    else
      post({
        type: "open-error",
        id: request.id,
        message: readable(
          error,
          request.picture ? UNREADABLE_PICTURE : UNREADABLE
        ),
      })
  }
}

async function thumbnail(request: Extract<PdfRequest, { type: "thumbnail" }>) {
  let bitmap: ImageBitmap | null = null
  try {
    const pdf = files.get(request.id)
    if (pdf) {
      const picture = renderPage(await engine, pdf, request.page, request.edge)
      bitmap = await createImageBitmap(
        new ImageData(picture.data, picture.width, picture.height)
      )
    }
  } catch {
    // A page that cannot be drawn still merges; the page shows a plain tile.
  }
  post(
    { type: "thumbnail", request: request.request, bitmap },
    bitmap ? [bitmap] : []
  )
}

/**
 * Text as a picture, for a contents line in a script the engine's own font
 * cannot write. The browser's fonts can. The picture is `height` pixels tall
 * with the foot of the letters 0.3 text sizes above its bottom edge, which is
 * where the engine expects it.
 */
function textPicture(text: string, height: number) {
  if (typeof OffscreenCanvas === "undefined") return null
  const size = height / 1.4
  const font = `${size}px sans-serif`
  const probe = new OffscreenCanvas(1, 1).getContext("2d")
  if (!probe) return null
  probe.font = font
  const width = Math.max(1, Math.ceil(probe.measureText(text).width) + 2)
  const context = new OffscreenCanvas(width, height).getContext("2d", {
    willReadFrequently: true,
  })
  if (!context) return null
  context.font = font
  context.textBaseline = "alphabetic"
  context.fillText(text, 1, height - size * 0.3)
  const image = context.getImageData(0, 0, width, height)
  return { data: image.data, width, height }
}

async function merge(request: Extract<PdfRequest, { type: "merge" }>) {
  const { job } = request
  try {
    const sources = new Map<string, MergeSource>()
    const wanted = request.pages.map((page) => {
      if ("blank" in page) return page
      const pdf = files.get(page.file)
      if (!pdf) throw new Error(FAILED)
      sources.set(page.file, { pdf, name: request.names[page.file] ?? "" })
      return { source: page.file, index: page.page, rotation: page.rotation }
    })
    let last = 0
    let paused = performance.now()
    const result = await mergePages(await engine, sources, wanted, {
      bookmarks: request.bookmarks,
      picturePage: request.picturePage,
      pictureMargin: request.pictureMargin,
      contents: request.contents,
      cover: request.cover,
      forms: request.forms,
      labels: request.labels,
      attachments: request.attachments,
      details: request.details,
      lock: request.lock ?? undefined,
      print: request.print,
      textPicture,
      checkpoint: async () => {
        // Let a cancel message in now and then; a pause after every page
        // would cost more time than the pages themselves.
        if (performance.now() - paused < 16) return
        await new Promise((resolve) => setTimeout(resolve, 0))
        paused = performance.now()
        if (job <= cancelled) throw new Cancelled()
      },
      progress: (done, total) => {
        // Often enough to look alive, seldom enough not to flood the page.
        const now = performance.now()
        if (done === total) post({ type: "writing", job })
        else if (now - last > 80) {
          last = now
          post({ type: "progress", job, done, total })
        }
      },
    })
    const bytes = result.bytes.buffer as ArrayBuffer
    post(
      {
        type: "merged",
        job,
        bytes,
        pages: result.pages,
        bookmarks: result.bookmarks,
      },
      [bytes]
    )
  } catch (error) {
    if (error instanceof Cancelled) post({ type: "cancelled", job })
    else post({ type: "merge-error", job, message: readable(error, FAILED) })
  }
}

async function split(request: Extract<PdfRequest, { type: "split" }>) {
  const { job } = request
  try {
    const pdf = files.get(request.id)
    if (!pdf) throw new Error(SPLIT_FAILED)
    const total = request.parts.reduce((sum, part) => sum + part.length, 0)
    let before = 0
    let last = 0
    let paused = performance.now()
    for (const [index, pages] of request.parts.entries()) {
      const { keep } = request
      const result = await splitPart(await engine, pdf, pages, {
        bookmarks: keep.bookmarks,
        labels: keep.labels,
        details: keep.details,
        lock: keep.lock ?? undefined,
        // Attached files are stored whole in every part that carries them.
        attachments: carriesAttachments(keep.attachments, index === 0),
        checkpoint: async () => {
          if (performance.now() - paused < 16) return
          await new Promise((resolve) => setTimeout(resolve, 0))
          paused = performance.now()
          if (job <= cancelled) throw new Cancelled()
        },
        progress: (done) => {
          const now = performance.now()
          if (now - last > 80) {
            last = now
            post({ type: "progress", job, done: before + done, total })
          }
        },
      })
      before += pages.length
      // A cancel that arrived while small parts were being written counts from
      // here. The pause is taken only now and then: browsers stretch each one
      // to several milliseconds, which thousands of parts would add up.
      if (performance.now() - paused >= 16) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        paused = performance.now()
      }
      if (job <= cancelled) throw new Cancelled()
      const bytes = result.bytes.buffer as ArrayBuffer
      post(
        {
          type: "split-part",
          job,
          index,
          bytes,
          pages: result.pages,
          bookmarks: result.bookmarks,
        },
        [bytes]
      )
      // With thousands of small parts, news of every one would flood the page.
      const now = performance.now()
      if (now - last > 80) {
        last = now
        post({ type: "progress", job, done: before, total })
      }
    }
    post({ type: "split-done", job })
  } catch (error) {
    if (error instanceof Cancelled) post({ type: "cancelled", job })
    else
      post({
        type: "split-error",
        job,
        message: readable(error, SPLIT_FAILED),
      })
  }
}

async function splitSize(request: Extract<PdfRequest, { type: "split-size" }>) {
  const { job } = request
  try {
    const pdf = files.get(request.id)
    if (!pdf) throw new Error(SPLIT_FAILED)
    let index = 0
    let paused = performance.now()
    const { keep } = request
    await splitBySize(await engine, pdf, request.limit, {
      keep: {
        bookmarks: keep.bookmarks,
        labels: keep.labels,
        details: keep.details,
        lock: keep.lock ?? undefined,
      },
      attaches: (start) => carriesAttachments(keep.attachments, start === 0),
      checkpoint: async () => {
        if (performance.now() - paused < 16) return
        await new Promise((resolve) => setTimeout(resolve, 0))
        paused = performance.now()
        if (job <= cancelled) throw new Cancelled()
      },
      onPart: async (part) => {
        // Writing a part cannot be stopped half-way; a cancel counts from here.
        await new Promise((resolve) => setTimeout(resolve, 0))
        paused = performance.now()
        if (job <= cancelled) throw new Cancelled()
        const bytes = part.written.bytes.buffer as ArrayBuffer
        post(
          {
            type: "split-part",
            job,
            index: index++,
            bytes,
            pages: part.written.pages,
            bookmarks: part.written.bookmarks,
            start: part.start,
            over: part.over,
          },
          [bytes]
        )
      },
      progress: (done, total) => post({ type: "progress", job, done, total }),
    })
    post({ type: "split-done", job })
  } catch (error) {
    if (error instanceof Cancelled) post({ type: "cancelled", job })
    else
      post({
        type: "split-error",
        job,
        message: readable(error, SPLIT_FAILED),
      })
  }
}

function audit(request: Extract<PdfRequest, { type: "audit" }>) {
  const pdf = files.get(request.id)
  let found: Audit | null = null
  try {
    if (pdf) found = auditPdf(pdf.doc, request.size)
  } catch {
    // The page goes without the breakdown.
  }
  post({ type: "audit", request: request.request, audit: found })
}

async function compress(request: Extract<PdfRequest, { type: "compress" }>) {
  const { job } = request
  try {
    const pdf = files.get(request.id)
    if (!pdf) throw new Error(COMPRESS_FAILED)
    const mupdf = await engine
    let last = 0
    let stage = ""
    let paused = performance.now()
    const result = await compressPdf(
      mupdf,
      new Uint8Array(await request.file.arrayBuffer()),
      {
        level: request.level,
        codecs,
        password: request.password,
        pristine: pdf.doc,
        maxPixels: request.maxPixels,
        checkpoint: async () => {
          if (performance.now() - paused < 16) return
          await new Promise((resolve) => setTimeout(resolve, 0))
          paused = performance.now()
          if (job <= cancelled) throw new Cancelled()
        },
        progress: (now, done, total) => {
          const time = performance.now()
          // Every new part of the work is told at once; steps within it now and then.
          if (now === stage && time - last <= 80) return
          stage = now
          last = time
          post({ type: "stage", job, stage: now, done, total })
        },
      }
    )
    const bytes = result.bytes ? (result.bytes.buffer as ArrayBuffer) : null
    post(
      { type: "compressed", job, bytes, report: result.report },
      bytes ? [bytes] : []
    )
  } catch (error) {
    if (error instanceof Cancelled) post({ type: "cancelled", job })
    else
      post({
        type: "compress-error",
        job,
        message: readable(error, COMPRESS_FAILED),
      })
  }
}

async function halve(request: Extract<PdfRequest, { type: "halve" }>) {
  const { id } = request
  const current = files.get(id)
  if (!current) return
  const whole = originals.get(id) ?? current
  try {
    const mupdf = await engine
    if (current !== whole) closePdf(current)
    // Should the cutting fail, the file is whole again.
    files.set(id, whole)
    originals.delete(id)
    if (request.choice) {
      const halved = await halvePdf(mupdf, whole, request.choice)
      originals.set(id, whole)
      files.set(id, halved)
    }
    post({ type: "opened", id, facts: files.get(id)!.facts })
  } catch (error) {
    post({
      type: "open-error",
      id,
      message: readable(error, "The pages could not be cut in half."),
    })
  }
}

/**
 * Look at a file page by page for a while, then go to the back of the queue
 * for the rest, as a search does. `look` is given a page and says what it
 * found; `tell` posts what a run of pages came to.
 */
function scan<Found>(
  request: { request: number; id: string },
  look: (pdf: OpenedPdf, page: number) => Found,
  tell: (from: number, found: Found[], total: number) => void,
  from = 0
) {
  if (forgotten.has(request.request)) {
    forgotten.delete(request.request)
    return
  }
  const pdf = files.get(request.id)
  const total = pdf?.pages.length ?? 0
  const started = performance.now()
  const found: Found[] = []
  let at = from
  while (pdf && at < total && performance.now() - started < SEARCH_SLICE)
    found.push(look(pdf, at++))
  tell(from, found, total)
  if (at < total)
    enqueue({
      request: request.request,
      run: () => scan(request, look, tell, at),
    })
}

function layout(request: Extract<PdfRequest, { type: "layout" }>) {
  const pdf = files.get(request.id)
  let found: { sizes: Size[]; bookmarks: Bookmark[] } | null = null
  try {
    if (pdf) found = { sizes: pageSizes(pdf), bookmarks: pdf.bookmarks }
  } catch {
    // The reader says the file cannot be shown.
  }
  post({ type: "layout", request: request.request, layout: found })
}

function text(request: Extract<PdfRequest, { type: "text" }>) {
  const pdf = files.get(request.id)
  let found: PageText | null = null
  try {
    if (pdf) found = readPage(pdf, request.page)
  } catch {
    // A page whose text cannot be read is still shown; it just cannot be selected.
  }
  post({ type: "text", request: request.request, text: found })
}

/** How long a search may hold the engine before letting other work in, in milliseconds. */
const SEARCH_SLICE = 24

/**
 * Search some pages, then go to the back of the queue for the rest, so that
 * pages being read are still drawn while a long file is searched.
 */
function search(
  request: Extract<PdfRequest, { type: "search" }>,
  from = 0,
  withText = 0
) {
  if (forgotten.has(request.request)) {
    forgotten.delete(request.request)
    return
  }
  const started = performance.now()
  const found: { at: number; hits: Quad[][] }[] = []
  let at = from
  while (
    at < request.pages.length &&
    performance.now() - started < SEARCH_SLICE
  ) {
    const { id, page } = request.pages[at]
    const pdf = files.get(id)
    try {
      if (pdf) {
        const result = searchPage(pdf, page, request.needle)
        if (result.text) withText++
        if (result.hits.length) found.push({ at, hits: result.hits })
      }
    } catch {
      // A page that cannot be read has no matches.
    }
    at++
  }
  post({
    type: "found",
    request: request.request,
    found,
    done: at,
    withText,
    total: request.pages.length,
  })
  if (at < request.pages.length)
    enqueue({
      request: request.request,
      run: () => search(request, at, withText),
    })
}

interface Task {
  run: () => Promise<void> | void
  /** Done before anything that is not urgent. */
  urgent?: boolean
  /** The request it answers, so it can be dropped when the answer is no longer wanted. */
  request?: number
}

// One thing at a time: the engine is a single body of memory.
const waiting: Task[] = []
/** Searches called off while they were between two slices. */
const forgotten = new Set<number>()
let busy = false

async function work() {
  if (busy) return
  busy = true
  while (waiting.length) {
    const urgent = waiting.findIndex((task) => task.urgent)
    const [task] = waiting.splice(Math.max(urgent, 0), 1)
    try {
      await task.run()
    } catch {
      // Each kind of work reports its own failures.
    }
  }
  busy = false
}

function enqueue(task: Task) {
  waiting.push(task)
  void work()
}

self.onmessage = (event: MessageEvent<PdfRequest>) => {
  const request = event.data
  // A cancel must not wait behind the merge it is meant to stop.
  if (request.type === "cancel") {
    cancelled = Math.max(cancelled, request.job)
    return
  }
  if (request.type === "forget") {
    // The page has already stopped waiting for these, so nothing is answered.
    const gone = new Set(request.requests)
    for (let at = waiting.length - 1; at >= 0; at--) {
      const task = waiting[at]
      if (task.request !== undefined && gone.has(task.request)) {
        waiting.splice(at, 1)
        gone.delete(task.request)
      }
    }
    // What is left is running now; only a search looks here before it goes on.
    for (const left of gone) forgotten.add(left)
    return
  }
  if (request.type === "open") enqueue({ run: () => open(request) })
  else if (request.type === "thumbnail")
    enqueue({
      run: () => thumbnail(request),
      urgent: request.urgent,
      request: request.request,
    })
  else if (request.type === "layout")
    enqueue({ run: () => layout(request), urgent: true })
  else if (request.type === "text")
    enqueue({
      run: () => text(request),
      urgent: true,
      request: request.request,
    })
  else if (request.type === "search")
    enqueue({ run: () => search(request), request: request.request })
  else if (request.type === "ink")
    enqueue({
      request: request.request,
      run: async () => {
        const mupdf = await engine
        scan(
          request,
          (pdf, page) => pageInk(mupdf, pdf, page),
          (from, shares, total) =>
            post({ type: "ink", request: request.request, from, shares, total })
        )
      },
    })
  else if (request.type === "area-text")
    enqueue({
      request: request.request,
      run: () =>
        scan(
          request,
          (pdf, page) => areaTexts(pdf, request.area, page, page + 1)[0],
          (from, texts, total) =>
            post({
              type: "area-text",
              request: request.request,
              from,
              texts,
              total,
            })
        ),
    })
  else if (request.type === "halve") enqueue({ run: () => halve(request) })
  else if (request.type === "audit") enqueue({ run: () => audit(request) })
  else if (request.type === "compress")
    enqueue({ run: () => compress(request) })
  else if (request.type === "merge") enqueue({ run: () => merge(request) })
  else if (request.type === "split") enqueue({ run: () => split(request) })
  else if (request.type === "split-size")
    enqueue({ run: () => splitSize(request) })
  else
    enqueue({
      run: () => closeFile(request.id),
    })
}
