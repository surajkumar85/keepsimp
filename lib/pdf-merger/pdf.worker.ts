/// <reference lib="webworker" />
import { decodeImageFile, TOO_MANY_PIXELS } from "@/lib/image-compressor/decode"
import { sniffFormat } from "@/lib/image-compressor/formats"
import {
  bookmarksOf,
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
import {
  addFont,
  addPicture,
  applyChange,
  editingOf,
  exportEdited,
  historyOf,
  letGo,
  lettersLacking,
  objectsOn,
  pageSizes as editSizes,
  waitingMarks,
  stepBack,
  stepForward,
  takeUp,
  type EditSession,
} from "@/lib/pdf-editor/mupdf-edit"
import {
  applyComments,
  commentsOn,
  lettersOn,
} from "@/lib/pdf-editor/mupdf-comments"
import { HelperCodecs, type HelperPort } from "@/lib/pdf-compressor/helpers"
import { auditPdf, type Audit } from "@/lib/pdf-compressor/mupdf-audit"
import type { Stage } from "@/lib/pdf-compressor/report"
import type { LetterLine } from "@/lib/pdf-editor/comments"
import { applyFields, fieldsOn, formFacts } from "@/lib/pdf-editor/mupdf-forms"
import { applyMakeFields, fieldNames } from "@/lib/pdf-editor/mupdf-form-fields"
import { readDraft } from "@/lib/pdf-editor/draft"
import { applyDocument, documentOf } from "@/lib/pdf-editor/mupdf-document"
import {
  applyRedact,
  redactFind,
  redactMarksOn,
} from "@/lib/pdf-editor/mupdf-redact"
import { suggestOn } from "@/lib/pdf-editor/mupdf-form-suggest"
import { applyOcr, ocrPicture } from "@/lib/pdf-editor/mupdf-ocr"
import { readCertifyOptions } from "@/lib/pdf-editor/certify"
import {
  readClean,
  readSought,
  type RedactChange,
  type RedactMark,
} from "@/lib/pdf-editor/redact"
import { canWriteAfter, exportAfter } from "@/lib/pdf-editor/mupdf-signed"
import type { PageLink } from "@/lib/pdf-editor/links"
import { applyLinks, linksOn } from "@/lib/pdf-editor/mupdf-links"
import {
  addInsert,
  applyPages,
  exportPart,
  prepareInsert,
} from "@/lib/pdf-editor/mupdf-pages"
import { applyPictures, picturesOn } from "@/lib/pdf-editor/mupdf-pictures"
import { readQuery, type Found } from "@/lib/pdf-editor/find"
import {
  applyText,
  findText,
  linesOn,
  replaceText,
} from "@/lib/pdf-editor/mupdf-text"
import type { PagePicture } from "@/lib/pdf-editor/page-pictures"
import type { PageLine } from "@/lib/pdf-editor/retext"
import {
  compressCustom,
  compressPdf,
  compressToSize,
} from "@/lib/pdf-compressor/mupdf-compress"
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

/** The picture codecs: on helper workers when the page has started some, here otherwise. */
const helpers = new HelperCodecs(codecs)

/** Files held open, by the id the page gave them. */
const files = new Map<string, OpenedPdf>()
/** Files as they were before their double pages were cut in half. */
const originals = new Map<string, OpenedPdf>()

/** Let go of a file, and of the file it was cut from. */
/** Files that are being edited: each is the very document in `files`, with its fonts, pictures and list of changes. */
const editing = new Map<string, EditSession>()
/** Which lie of the pages each session's page was last told of (`laidOut`). */
const toldOf = new WeakMap<EditSession, number>()
/** And which state of the file as a whole (`described`). */
const describedOf = new WeakMap<EditSession, number>()

function closeFile(id: string) {
  const pdf = files.get(id)
  const original = originals.get(id)
  const session = editing.get(id)
  if (session) letGo(session)
  editing.delete(id)
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
    const bytes = request.picture
      ? null
      : new Uint8Array(await request.file.arrayBuffer())
    const pdf = bytes
      ? openPdf(mupdf, bytes, request.password, request.edit)
      : await picture(mupdf, request.file)
    files.set(request.id, pdf)
    if (bytes && request.edit) {
      const session = editingOf(mupdf, pdf.doc, bytes, request.password)
      // After an undo the working copy is another document: the reader
      // draws its pages from the same one.
      session.moved = (doc) => {
        pdf.doc = doc
      }
      editing.set(request.id, session)
    }
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
    const { how } = request
    const bytes = new Uint8Array(await request.file.arrayBuffer())
    const stopIfCancelled = () => {
      if (job <= cancelled) throw new Cancelled()
    }
    // With pictures out at the helpers, the worker is free to hear a cancel
    // at any moment, so every step asks, and not only the pauses.
    const asking =
      <A extends unknown[], R>(codec: (...args: A) => Promise<R>) =>
      async (...args: A) => {
        stopIfCancelled()
        return codec(...args)
      }
    const options = {
      codecs: {
        jpeg: asking(helpers.codecs.jpeg),
        resize: asking(helpers.codecs.resize),
        png: asking(helpers.codecs.png),
        deflate: asking(helpers.codecs.deflate),
      },
      lanes: () => helpers.lanes,
      scans: request.scans,
      remove: request.remove ?? undefined,
      lock: request.lock ?? undefined,
      password: request.password,
      pristine: pdf.doc,
      maxPixels: request.maxPixels,
      checkpoint: async () => {
        stopIfCancelled()
        if (performance.now() - paused < 16) return
        await new Promise((resolve) => setTimeout(resolve, 0))
        paused = performance.now()
        stopIfCancelled()
      },
      progress: (now: Stage, done: number, total: number, attempt?: number) => {
        const time = performance.now()
        // Every new part of the work is told at once; steps within it now and then.
        const part = `${attempt}/${now}`
        if (part === stage && time - last <= 80) return
        stage = part
        last = time
        post({ type: "stage", job, stage: now, done, total, attempt })
      },
    }
    const result =
      typeof how === "string"
        ? await compressPdf(mupdf, bytes, { ...options, level: how })
        : "custom" in how
          ? await compressCustom(mupdf, bytes, { ...options, ...how })
          : await compressToSize(mupdf, bytes, { ...options, ...how })
    const out = result.bytes ? (result.bytes.buffer as ArrayBuffer) : null
    post(
      { type: "compressed", job, bytes: out, report: result.report },
      out ? [out] : []
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

const EDIT_FAILED =
  "That change could not be made. Undo the last step, or add the file once more."
const EXPORT_FAILED =
  "The file could not be written. Try again, or add the file once more."

/** The steps that were made, for a draft to keep. */
function editDraft(request: Extract<PdfRequest, { type: "edit-draft" }>) {
  const session = editing.get(request.id)
  post({
    type: "edit-draft",
    request: request.request,
    draft: session
      ? { steps: session.steps, position: session.position }
      : null,
  })
}

function editState(
  request: Extract<PdfRequest, { type: "edit-state" | "edit-take-up" }>
) {
  const session = editing.get(request.id)
  const pdf = files.get(request.id)
  let state: Extract<PdfResponse, { type: "edit-state" }>["state"] = null
  try {
    if (session && pdf) {
      // A draft is taken up before the file is told about: its steps are
      // checked like changes that arrive from the page, and made again.
      if (request.type === "edit-take-up") {
        const draft = readDraft({
          name: "draft",
          size: 1,
          when: 0,
          steps: request.steps,
          position: request.position,
        })
        if (!draft) throw new Error("That is not a draft.")
        takeUp(session, draft.steps, draft.position)
      }
      const sizes = editSizes(session)
      const fields = sizes.map((_, page) => fieldsOn(session, page))
      state = {
        sizes,
        objects: sizes.map((_, page) => objectsOn(session, page)),
        comments: sizes.map((_, page) => commentsOn(session, page)),
        fields,
        form: formFacts(session.doc, fields),
        after: canWriteAfter(session),
        history: historyOf(session),
        // A draft may have put the pages in another order: the bookmarks are read as they lead now.
        bookmarks: session.laidOut ? bookmarksOf(session.doc) : pdf.bookmarks,
        document: documentOf(session),
        waiting: waitingMarks(session.doc),
        formNames: fieldNames(session.doc),
      }
      toldOf.set(session, session.laidOut ?? 0)
      describedOf.set(session, session.described ?? 0)
    }
  } catch {
    // The page says that the file could not be opened for editing.
  }
  post({ type: "edit-state", request: request.request, state })
}

/** What to tell the page after a change: the pages to draw again, and the list of changes. */
function newsOf(
  session: EditSession,
  pages: readonly number[],
  change?: { ops: readonly { do: string; object?: unknown }[] }
) {
  const lacking = new Set<string>()
  for (const op of change?.ops ?? []) {
    const object = (op as { object?: { kind?: string } }).object
    if (object?.kind === "text")
      try {
        for (const letter of lettersLacking(session, object as never))
          lacking.add(letter)
      } catch {
        // A font that is missing has already failed the change itself.
      }
  }
  // The list of pages is another than the page knows: it is told of all of it.
  const laid = session.laidOut ?? 0
  const layout =
    (toldOf.get(session) ?? 0) === laid
      ? undefined
      : { sizes: editSizes(session), bookmarks: bookmarksOf(session.doc) }
  toldOf.set(session, laid)
  // The file as a whole is told of when it changed, and when its pages were
  // put otherwise: its bookmarks lead to other places then.
  const said = session.described ?? 0
  const document =
    layout || (describedOf.get(session) ?? 0) !== said
      ? documentOf(session)
      : undefined
  describedOf.set(session, said)
  const count = session.doc.countPages()
  return {
    // A place past the end holds nothing; that it is gone is said by the sizes.
    pages: pages
      .filter((page) => page < count)
      .map((page) => ({
        page,
        objects: objectsOn(session, page),
        comments: commentsOn(session, page),
        fields: fieldsOn(session, page),
      })),
    history: historyOf(session),
    lacking: [...lacking],
    ...(layout ? { layout } : null),
    ...(document ? { document } : null),
    waiting: waitingMarks(session.doc),
    formNames: fieldNames(session.doc),
  }
}

async function editMakeFields(
  request: Extract<PdfRequest, { type: "edit-make-fields" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyMakeFields(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editOcr(request: Extract<PdfRequest, { type: "edit-ocr" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyOcr(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editOcrPicture(
  request: Extract<PdfRequest, { type: "edit-ocr-picture" }>
) {
  const session = editing.get(request.id)
  try {
    if (
      !session ||
      !Number.isInteger(request.page) ||
      request.page < 0 ||
      request.page >= session.doc.countPages()
    )
      throw new Error(EDIT_FAILED)
    const picture = ocrPicture(await engine, session, request.page)
    // A copy of its own, to be handed over rather than copied again.
    const png = picture.png.slice()
    post(
      {
        type: "edit-ocr-picture",
        request: request.request,
        picture: { ...picture, png },
      },
      [png.buffer]
    )
  } catch {
    post({ type: "edit-ocr-picture", request: request.request, picture: null })
  }
}

async function editRedact(
  request: Extract<PdfRequest, { type: "edit-redact" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyRedact(await engine, session, request.change)
    // What applying did, as the step that was just made keeps it.
    const made = session.steps[session.position - 1]?.done.change as
      RedactChange | undefined
    const applied = made?.done?.flat() ?? []
    post({
      type: "edit-news",
      request: request.request,
      news: {
        ...newsOf(session, pages),
        ...(applied.length ? { applied } : null),
      },
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

function editRedactMarks(
  request: Extract<PdfRequest, { type: "edit-redact-marks" }>
) {
  const session = editing.get(request.id)
  let marks: RedactMark[] | null = null
  try {
    if (session) marks = redactMarksOn(session, request.page)
  } catch {
    // The page says that the marks could not be read.
  }
  post({ type: "edit-redact-marks", request: request.request, marks })
}

async function editSuggestFields(
  request: Extract<PdfRequest, { type: "edit-suggest-fields" }>
) {
  const session = editing.get(request.id)
  try {
    if (
      !session ||
      !Number.isInteger(request.page) ||
      request.page < 0 ||
      request.page >= session.doc.countPages()
    )
      throw new Error(EDIT_FAILED)
    const suggestions = suggestOn(await engine, session, request.page)
    post({
      type: "edit-fields-suggested",
      request: request.request,
      suggestions,
    })
  } catch {
    post({
      type: "edit-fields-suggested",
      request: request.request,
      suggestions: null,
    })
  }
}

function editRedactFind(
  request: Extract<PdfRequest, { type: "edit-redact-find" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const sought = readSought(request.sought)
    if (!sought) throw new Error(EDIT_FAILED)
    const { found, more } = redactFind(session, sought)
    post({ type: "edit-redact-found", request: request.request, found, more })
  } catch {
    post({
      type: "edit-redact-found",
      request: request.request,
      found: null,
      more: false,
    })
  }
}

async function editDocument(
  request: Extract<PdfRequest, { type: "edit-document" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyDocument(await engine, session, request.change)
    const news = newsOf(session, pages)
    // Whoever reads the file's bookmarks from here reads them as they are now.
    const pdf = files.get(request.id)
    if (pdf && news.document) pdf.bookmarks = news.document.bookmarks
    post({ type: "edit-news", request: request.request, news })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editPages(request: Extract<PdfRequest, { type: "edit-pages" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyPages(await engine, session, request.change)
    const news = newsOf(session, pages)
    // Whoever reads the file's bookmarks from here reads them as they are now.
    const pdf = files.get(request.id)
    if (pdf && news.layout) pdf.bookmarks = news.layout.bookmarks
    post({ type: "edit-news", request: request.request, news })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editApply(request: Extract<PdfRequest, { type: "edit-apply" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyChange(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages, request.change),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editComment(
  request: Extract<PdfRequest, { type: "edit-comment" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyComments(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editField(request: Extract<PdfRequest, { type: "edit-field" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyFields(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editText(request: Extract<PdfRequest, { type: "edit-text" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyText(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editFind(request: Extract<PdfRequest, { type: "edit-find" }>) {
  const session = editing.get(request.id)
  let found: Found[] | null = null
  let more = false
  try {
    const query = readQuery(request.query)
    if (session && query)
      ({ found, more } = findText(await engine, session, query))
    else if (session) found = []
  } catch {
    // The page says that the file could not be looked through.
  }
  post({ type: "edit-found", request: request.request, found, more })
}

async function editReplace(
  request: Extract<PdfRequest, { type: "edit-replace" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const { pages, refused } = replaceText(
      await engine,
      session,
      request.change
    )
    post({
      type: "edit-news",
      request: request.request,
      news: { ...newsOf(session, pages), refused },
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editPageLink(
  request: Extract<PdfRequest, { type: "edit-page-link" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyLinks(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

function editPageLinks(
  request: Extract<PdfRequest, { type: "edit-page-links" }>
) {
  const session = editing.get(request.id)
  let links: PageLink[] | null = null
  try {
    if (session && request.page < session.doc.countPages())
      links = linksOn(session, request.page)
  } catch {
    // The page says that the links of this page could not be read.
  }
  post({ type: "edit-page-links", request: request.request, links })
}

async function editPagePicture(
  request: Extract<PdfRequest, { type: "edit-page-picture" }>
) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = applyPictures(await engine, session, request.change)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

function editPagePictures(
  request: Extract<PdfRequest, { type: "edit-page-pictures" }>
) {
  const session = editing.get(request.id)
  let pictures: PagePicture[] | null = null
  try {
    if (session && request.page < session.doc.countPages())
      pictures = picturesOn(session, request.page)
  } catch {
    // The page says that the pictures of this page could not be read.
  }
  post({ type: "edit-page-pictures", request: request.request, pictures })
}

async function editLines(request: Extract<PdfRequest, { type: "edit-lines" }>) {
  const session = editing.get(request.id)
  let lines: PageLine[] | null = null
  try {
    if (session && request.page < session.doc.countPages())
      lines = linesOn(await engine, session, request.page)
  } catch {
    // The page says that the words of this page could not be read.
  }
  post({ type: "edit-lines", request: request.request, lines })
}

function editLetters(request: Extract<PdfRequest, { type: "edit-letters" }>) {
  const session = editing.get(request.id)
  let lines: LetterLine[] | null = null
  try {
    if (session && request.page < session.doc.countPages())
      lines = lettersOn(session, request.page)
  } catch {
    // The page says that the words of this page could not be read.
  }
  post({ type: "edit-letters", request: request.request, lines })
}

function editStep(request: Extract<PdfRequest, { type: "edit-step" }>) {
  const session = editing.get(request.id)
  try {
    if (!session) throw new Error(EDIT_FAILED)
    const pages = request.back ? stepBack(session) : stepForward(session)
    post({
      type: "edit-news",
      request: request.request,
      news: newsOf(session, pages ?? []),
    })
  } catch (error) {
    post({
      type: "edit-news",
      request: request.request,
      news: null,
      message: readable(error, EDIT_FAILED),
    })
  }
}

async function editPicture(
  request: Extract<PdfRequest, { type: "edit-picture" }>
) {
  let size: Size | null = null
  try {
    const session = editing.get(request.id)
    if (session) {
      const { file } = request
      const head = new Uint8Array(
        await file.slice(0, 1024 * 1024).arrayBuffer()
      )
      const format = sniffFormat(head)
      // A PNG, and a JPEG that is stored the way up it is shown, go in as
      // they are. Anything else is drawn first and kept as a PNG, which
      // also keeps see-through parts.
      const asItIs =
        format === "png" ||
        (format === "jpeg" && quarterTurns(jpegOrientation(head)) === 0)
      if (format && format !== "svg") {
        const bytes = asItIs
          ? new Uint8Array(await file.arrayBuffer())
          : await helpers.codecs.png(await decodeImageFile(file, format))
        size = addPicture(await engine, session, request.name, bytes)
      }
    }
  } catch {
    // The page says that the picture could not be read.
  }
  post({ type: "edit-picture", request: request.request, size })
}

/** Another PDF whose pages are to be added: made ready, unless it was before, and kept for the steps that add its pages. */
async function editInsert(
  request: Extract<PdfRequest, { type: "edit-insert" }>
) {
  const answer = (
    rest: Omit<
      Extract<PdfResponse, { type: "edit-insert" }>,
      "type" | "request"
    >
  ) => post({ type: "edit-insert", request: request.request, ...rest })
  try {
    const session = editing.get(request.id)
    if (!session) throw new Error(EDIT_FAILED)
    const mupdf = await engine
    const given = new Uint8Array(await request.file.arrayBuffer())
    const ready = request.ready
      ? given
      : await prepareInsert(mupdf, given, request.password)
    const pages = addInsert(mupdf, session, request.name, ready)
    // The page keeps a copy for a draft; the session keeps its own.
    answer({ pages, bytes: request.ready ? undefined : ready.slice().buffer })
  } catch (error) {
    if (error instanceof PasswordNeeded)
      answer({ pages: null, locked: true, wrong: error.wrong })
    else
      answer({
        pages: null,
        message: readable(error, "That file could not be read as a PDF."),
      })
  }
}

async function editExport(
  request: Extract<PdfRequest, { type: "edit-export" }>
) {
  const { job } = request
  try {
    const session = editing.get(request.id)
    if (!session) throw new Error(EXPORT_FAILED)
    let paused = performance.now()
    const checkpoint = async () => {
      if (job <= cancelled) throw new Cancelled()
      if (performance.now() - paused < 16) return
      await new Promise((resolve) => setTimeout(resolve, 0))
      paused = performance.now()
      if (job <= cancelled) throw new Cancelled()
    }
    const result = request.only
      ? await exportPart(await engine, session, request.only, {
          keepEditable: request.keepEditable,
          comments: request.comments,
          fields: request.fields,
          lock: request.lock ?? undefined,
          clean: readClean(request.clean),
          checkpoint,
        })
      : request.after
        ? await exportAfter(await engine, session, { checkpoint })
        : await exportEdited(await engine, session, {
            keepEditable: request.keepEditable,
            comments: request.comments,
            fields: request.fields,
            lock: request.lock ?? undefined,
            clean: readClean(request.clean),
            checkpoint,
          })
    let { bytes, report } = result
    if (request.certify) {
      await checkpoint()
      const options = readCertifyOptions(request.certify.options)
      if (!options) throw new Error(EXPORT_FAILED)
      // Loaded only when a file is signed: the cryptography is large.
      const [{ readIdentity }, { certify }] = await Promise.all([
        import("@/lib/pdf-editor/certificate"),
        import("@/lib/pdf-editor/mupdf-certify"),
      ])
      const identity = await readIdentity(
        request.certify.file,
        request.certify.password
      )
      const signed = await certify(await engine, bytes, identity, options)
      bytes = signed.bytes
      report = {
        ...report,
        certified: {
          signer: signed.checked.signer ?? identity.signer,
          field: signed.field,
          page: signed.page,
          intact: signed.checked.intact,
        },
      }
    }
    const out = bytes.buffer as ArrayBuffer
    post({ type: "edit-exported", job, bytes: out, report }, [out])
  } catch (error) {
    if (error instanceof Cancelled) post({ type: "cancelled", job })
    else
      post({
        type: "edit-export-error",
        job,
        message: readable(error, EXPORT_FAILED),
      })
  }
}

async function editCertificate(
  request: Extract<PdfRequest, { type: "edit-certificate" }>
) {
  const session = editing.get(request.id)
  let places: string[] = []
  try {
    const { emptyPlaces } = await import("@/lib/pdf-editor/mupdf-certify")
    if (session) places = [...emptyPlaces(session.doc).keys()]
  } catch {
    places = []
  }
  try {
    const { readIdentity } = await import("@/lib/pdf-editor/certificate")
    const { validityProblem } = await import("@/lib/pdf-editor/certify")
    const { signer } = await readIdentity(request.file, request.password)
    post({
      type: "edit-certificate",
      request: request.request,
      signer,
      problem: validityProblem(signer, new Date()),
      places,
    })
  } catch (error) {
    post({
      type: "edit-certificate",
      request: request.request,
      signer: null,
      problem: readable(error, "This certificate file cannot be read."),
      places,
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
  // Helpers come and go while a file is being compressed.
  if (request.type === "helper") {
    helpers.add(request.port as HelperPort)
    return
  }
  if (request.type === "helpers-lost") {
    helpers.clear()
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
  else if (request.type === "edit-state" || request.type === "edit-take-up")
    enqueue({ run: async () => editState(request) })
  else if (request.type === "edit-draft")
    enqueue({ run: async () => editDraft(request) })
  else if (request.type === "edit-font")
    enqueue({
      run: async () => {
        const session = editing.get(request.id)
        if (session)
          addFont(
            await engine,
            session,
            request.key,
            new Uint8Array(request.bytes),
            request.name
          )
      },
    })
  else if (request.type === "edit-picture")
    enqueue({ run: () => editPicture(request) })
  else if (request.type === "edit-apply")
    enqueue({ run: () => editApply(request) })
  else if (request.type === "edit-comment")
    enqueue({ run: () => editComment(request) })
  else if (request.type === "edit-field")
    enqueue({ run: () => editField(request) })
  else if (request.type === "edit-text")
    enqueue({ run: () => editText(request) })
  else if (request.type === "edit-lines")
    enqueue({ run: () => editLines(request) })
  else if (request.type === "edit-find")
    enqueue({ run: () => editFind(request) })
  else if (request.type === "edit-replace")
    enqueue({ run: () => editReplace(request) })
  else if (request.type === "edit-page-links")
    enqueue({ run: async () => editPageLinks(request) })
  else if (request.type === "edit-pages") void editPages(request)
  else if (request.type === "edit-document") void editDocument(request)
  else if (request.type === "edit-make-fields") void editMakeFields(request)
  else if (request.type === "edit-redact") void editRedact(request)
  else if (request.type === "edit-redact-marks") editRedactMarks(request)
  else if (request.type === "edit-redact-find") editRedactFind(request)
  else if (request.type === "edit-suggest-fields")
    void editSuggestFields(request)
  else if (request.type === "edit-ocr-picture") void editOcrPicture(request)
  else if (request.type === "edit-ocr") void editOcr(request)
  else if (request.type === "edit-certificate") void editCertificate(request)
  else if (request.type === "edit-insert") void editInsert(request)
  else if (request.type === "edit-page-link")
    enqueue({ run: () => editPageLink(request) })
  else if (request.type === "edit-page-pictures")
    enqueue({ run: async () => editPagePictures(request) })
  else if (request.type === "edit-page-picture")
    enqueue({ run: () => editPagePicture(request) })
  else if (request.type === "edit-letters")
    enqueue({ run: async () => editLetters(request) })
  else if (request.type === "edit-step")
    enqueue({ run: async () => editStep(request) })
  else if (request.type === "edit-export")
    enqueue({ run: () => editExport(request) })
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
