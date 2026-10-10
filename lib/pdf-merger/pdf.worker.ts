/// <reference lib="webworker" />
import {
  closePdf,
  mergePdfs,
  openPdf,
  PasswordNeeded,
  renderPage,
  type OpenedPdf,
} from "./mupdf-engine"
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

async function open(request: Extract<PdfRequest, { type: "open" }>) {
  try {
    const mupdf = await engine
    const bytes = new Uint8Array(await request.file.arrayBuffer())
    const previous = files.get(request.id)
    if (previous) closePdf(previous)
    const pdf = openPdf(mupdf, bytes, request.password)
    files.set(request.id, pdf)
    post({ type: "opened", id: request.id, facts: pdf.facts })
  } catch (error) {
    if (error instanceof PasswordNeeded)
      post({ type: "locked", id: request.id, wrong: error.wrong })
    else
      post({
        type: "open-error",
        id: request.id,
        message: readable(error, ENGINE_FAILED),
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

async function merge(request: Extract<PdfRequest, { type: "merge" }>) {
  const { job } = request
  try {
    const inputs = request.parts.map((part) => {
      const pdf = files.get(part.id)
      if (!pdf) throw new Error(FAILED)
      return {
        pdf,
        name: part.name,
        pages: part.pages,
        rotation: part.rotation,
      }
    })
    let last = 0
    let paused = performance.now()
    const result = await mergePdfs(await engine, inputs, {
      bookmarks: request.bookmarks,
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
