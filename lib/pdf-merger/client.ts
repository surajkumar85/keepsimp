"use client"

import type { MergePart } from "./files"
import type { BookmarkPolicy } from "./outline"
import type { PdfRequest, PdfResponse } from "./protocol"

export const ENGINE_FAILED =
  "The PDF engine could not start. Reload the page and try again."

type FileEvent = Extract<
  PdfResponse,
  { type: "opened" | "locked" | "open-error" }
>

export interface MergeResult {
  bytes: ArrayBuffer
  pages: number
  bookmarks: number
}

interface MergeJob {
  resolve: (result: MergeResult | null) => void
  reject: (error: Error) => void
  onProgress: (done: number, total: number | null) => void
}

/**
 * The page's side of the PDF worker. Files stay open in the worker between
 * requests; everything they contain stays on this device.
 */
export class PdfClient {
  private worker: Worker | null = null
  /**
   * Files sent to be opened, so a worker that failed to load can be started
   * again. Passwords are not remembered: one is only ever sent to a worker
   * that has already answered, and such a worker is never started again.
   */
  private readonly sent = new Map<string, Blob>()
  private readonly thumbnails = new Map<
    number,
    (bitmap: ImageBitmap | null) => void
  >()
  private readonly merges = new Map<number, MergeJob>()
  private requests = 0
  private jobs = 0
  private answered = false
  private restarts = 0

  constructor(private readonly onFile: (event: FileEvent) => void) {}

  private send(request: PdfRequest) {
    if (!this.worker) {
      this.worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
        type: "module",
      })
      this.worker.onmessage = (event: MessageEvent<PdfResponse>) =>
        this.receive(event.data)
      this.worker.onerror = () => this.failed()
    }
    this.worker.postMessage(request)
  }

  private receive(message: PdfResponse) {
    this.answered = true
    if (message.type === "thumbnail") {
      const done = this.thumbnails.get(message.request)
      this.thumbnails.delete(message.request)
      if (done) done(message.bitmap)
      else message.bitmap?.close()
    } else if (message.type === "progress")
      this.merges.get(message.job)?.onProgress(message.done, message.total)
    else if (message.type === "writing")
      this.merges.get(message.job)?.onProgress(0, null)
    else if (
      message.type === "merged" ||
      message.type === "merge-error" ||
      message.type === "cancelled"
    ) {
      const job = this.merges.get(message.job)
      this.merges.delete(message.job)
      if (!job) return
      if (message.type === "merged")
        job.resolve({
          bytes: message.bytes,
          pages: message.pages,
          bookmarks: message.bookmarks,
        })
      else if (message.type === "cancelled") job.resolve(null)
      else job.reject(new Error(message.message))
    } else this.onFile(message)
  }

  /** The worker stopped: start it again if it never ran, otherwise say so. */
  private failed() {
    this.worker?.terminate()
    this.worker = null
    for (const done of this.thumbnails.values()) done(null)
    this.thumbnails.clear()
    for (const job of this.merges.values()) job.reject(new Error(ENGINE_FAILED))
    this.merges.clear()
    // Offline, some browsers fail to load a worker's scripts the first time (see WorkerPool).
    if (!this.answered && this.restarts < 2) {
      this.restarts++
      for (const [id, file] of this.sent) this.send({ type: "open", id, file })
      return
    }
    for (const id of this.sent.keys())
      this.onFile({ type: "open-error", id, message: ENGINE_FAILED })
    this.sent.clear()
  }

  open(id: string, file: Blob, password?: string) {
    this.sent.set(id, file)
    this.send({ type: "open", id, file, password })
  }

  close(id: string) {
    this.sent.delete(id)
    if (this.worker) this.send({ type: "close", id })
  }

  /** A picture of one page, or null when it cannot be drawn. */
  thumbnail(id: string, page: number, edge: number) {
    return new Promise<ImageBitmap | null>((resolve) => {
      const request = ++this.requests
      this.thumbnails.set(request, resolve)
      this.send({ type: "thumbnail", id, page, edge, request })
    })
  }

  /**
   * Merge parts of the open files. The promise gives null when the merge was
   * cancelled. `onProgress` is given a null total once the file is being written.
   */
  merge(
    parts: (MergePart & { name: string })[],
    bookmarks: BookmarkPolicy,
    onProgress: (done: number, total: number | null) => void
  ) {
    const job = ++this.jobs
    const promise = new Promise<MergeResult | null>((resolve, reject) => {
      this.merges.set(job, { resolve, reject, onProgress })
      this.send({ type: "merge", job, parts, bookmarks })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    for (const done of this.thumbnails.values()) done(null)
    for (const job of this.merges.values()) job.resolve(null)
    this.thumbnails.clear()
    this.merges.clear()
    this.sent.clear()
  }
}
