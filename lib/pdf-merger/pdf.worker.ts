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
import { jpegOrientation, quarterTurns } from "./picture"
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

const TOO_LARGE =
  "This is more than this device can handle at once. Remove some files, reload the page and try again."

const UNREADABLE_PICTURE = "This picture could not be read. It may be damaged."

class Cancelled extends Error {}

/** Files held open, by the id the page gave them. */
const files = new Map<string, OpenedPdf>()
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
    const previous = files.get(request.id)
    if (previous) closePdf(previous)
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

// One thing at a time: the engine is a single body of memory.
let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<PdfRequest>) => {
  const request = event.data
  // A cancel must not wait behind the merge it is meant to stop.
  if (request.type === "cancel") {
    cancelled = Math.max(cancelled, request.job)
    return
  }
  queue = queue.then(() => {
    if (request.type === "open") return open(request)
    if (request.type === "thumbnail") return thumbnail(request)
    if (request.type === "merge") return merge(request)
    const pdf = files.get(request.id)
    if (pdf) closePdf(pdf)
    files.delete(request.id)
  })
}
