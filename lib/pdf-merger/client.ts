"use client"

import type { Size } from "@/lib/image-compressor/geometry"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { HalveChoice } from "@/lib/pdf-splitter/halves"
import type { Area } from "@/lib/pdf-splitter/text-rule"
import type { Bookmark } from "./outline"
import type { PdfRequest, PdfResponse, SplitKeep } from "./protocol"

/** Everything a merge is asked for. */
export type MergeOrder = Omit<
  Extract<PdfRequest, { type: "merge" }>,
  "type" | "job"
>

export const ENGINE_FAILED =
  "The PDF engine could not start. Reload the page and try again."

export type FileEvent = Extract<
  PdfResponse,
  { type: "opened" | "locked" | "open-error" }
>

export interface MergeResult {
  bytes: ArrayBuffer
  pages: number
  bookmarks: number
}

/** What a reader needs to lay a file out. */
export interface FileLayout {
  sizes: Size[]
  bookmarks: Bookmark[]
}

/** News from a search: what more was found, and how far it has got. */
export interface SearchNews {
  found: { at: number; hits: Quad[][] }[]
  done: number
  withText: number
  total: number
}

/** One part of a split, as it arrives. */
export interface SplitPart {
  index: number
  bytes: ArrayBuffer
  pages: number
  bookmarks: number
  /** In a split by size: the part's first page, counted from 0, and whether it is one page over the size. */
  start?: number
  over?: boolean
}

/** News from a look through a file's pages: what a run of them came to. */
export interface ScanNews<Found> {
  from: number
  found: Found[]
  total: number
}

interface SplitJob {
  /** True when every part was written; false when the split was cancelled. */
  resolve: (finished: boolean) => void
  reject: (error: Error) => void
  onPart: (part: SplitPart) => void
  onProgress: (done: number, total: number) => void
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
  private readonly sent = new Map<string, { file: Blob; picture: boolean }>()
  private readonly thumbnails = new Map<
    number,
    (bitmap: ImageBitmap | null) => void
  >()
  private readonly layouts = new Map<
    number,
    (layout: FileLayout | null) => void
  >()
  private readonly texts = new Map<number, (text: PageText | null) => void>()
  private readonly searches = new Map<number, (news: SearchNews) => void>()
  /** Looks through files that are under way. Each knows what kind of news it is given. */
  private readonly scans = new Map<number, (news: ScanNews<never>) => void>()
  private readonly merges = new Map<number, MergeJob>()
  private readonly splits = new Map<number, SplitJob>()
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
    } else if (message.type === "layout") {
      this.layouts.get(message.request)?.(message.layout)
      this.layouts.delete(message.request)
    } else if (message.type === "text") {
      this.texts.get(message.request)?.(message.text)
      this.texts.delete(message.request)
    } else if (message.type === "found") {
      const { request, found, done, withText, total } = message
      this.searches.get(request)?.({ found, done, withText, total })
      if (done >= total) this.searches.delete(request)
    } else if (message.type === "ink" || message.type === "area-text") {
      const { request, from, total } = message
      const found = message.type === "ink" ? message.shares : message.texts
      this.scans.get(request)?.({ from, found, total } as ScanNews<never>)
      if (from + found.length >= total) this.scans.delete(request)
    } else if (message.type === "split-part") {
      const { index, bytes, pages, bookmarks, start, over } = message
      this.splits
        .get(message.job)
        ?.onPart({ index, bytes, pages, bookmarks, start, over })
    } else if (
      message.type === "split-done" ||
      message.type === "split-error"
    ) {
      const job = this.splits.get(message.job)
      this.splits.delete(message.job)
      if (message.type === "split-done") job?.resolve(true)
      else job?.reject(new Error(message.message))
    } else if (message.type === "progress") {
      this.splits.get(message.job)?.onProgress(message.done, message.total)
      this.merges.get(message.job)?.onProgress(message.done, message.total)
    } else if (message.type === "writing")
      this.merges.get(message.job)?.onProgress(0, null)
    else if (
      message.type === "merged" ||
      message.type === "merge-error" ||
      message.type === "cancelled"
    ) {
      const split = this.splits.get(message.job)
      if (split && message.type === "cancelled") {
        this.splits.delete(message.job)
        split.resolve(false)
        return
      }
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
    this.dropReading()
    for (const job of this.merges.values()) job.reject(new Error(ENGINE_FAILED))
    this.merges.clear()
    for (const job of this.splits.values()) job.reject(new Error(ENGINE_FAILED))
    this.splits.clear()
    // Offline, some browsers fail to load a worker's scripts the first time (see WorkerPool).
    if (!this.answered && this.restarts < 2) {
      this.restarts++
      for (const [id, { file, picture }] of this.sent)
        this.send({ type: "open", id, file, picture })
      return
    }
    for (const id of this.sent.keys())
      this.onFile({ type: "open-error", id, message: ENGINE_FAILED })
    this.sent.clear()
  }

  /** Answer everything a reader is waiting for with nothing. */
  private dropReading() {
    for (const done of this.thumbnails.values()) done(null)
    for (const done of this.layouts.values()) done(null)
    for (const done of this.texts.values()) done(null)
    // A search that ends with nothing searched has, as far as it knows, no more to say.
    for (const tell of this.searches.values())
      tell({ found: [], done: 0, withText: 0, total: 0 })
    this.thumbnails.clear()
    this.layouts.clear()
    this.texts.clear()
    this.searches.clear()
    this.scans.clear()
  }

  open(
    id: string,
    file: Blob,
    options: { password?: string; picture?: boolean } = {}
  ) {
    const picture = Boolean(options.picture)
    this.sent.set(id, { file, picture })
    this.send({ type: "open", id, file, password: options.password, picture })
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
   * A picture of one page for someone who is reading it: drawn ahead of
   * thumbnails, and given up with `forget` when the page scrolls away.
   */
  draw(id: string, page: number, edge: number, urgent = true) {
    const request = ++this.requests
    const promise = new Promise<ImageBitmap | null>((resolve) => {
      this.thumbnails.set(request, resolve)
      this.send({ type: "thumbnail", id, page, edge, request, urgent })
    })
    return { request, promise }
  }

  /** The size of every page of an open file and its bookmarks; null when it cannot be read. */
  layout(id: string) {
    return new Promise<FileLayout | null>((resolve) => {
      const request = ++this.requests
      this.layouts.set(request, resolve)
      this.send({ type: "layout", id, request })
    })
  }

  /** The text and links of one page; null when they cannot be read. */
  text(id: string, page: number) {
    const request = ++this.requests
    const promise = new Promise<PageText | null>((resolve) => {
      this.texts.set(request, resolve)
      this.send({ type: "text", id, page, request })
    })
    return { request, promise }
  }

  /**
   * Look for words on pages of the open files. News arrives as pages are
   * searched; `stop` ends it early.
   */
  search(
    needle: string,
    pages: { id: string; page: number }[],
    onNews: (news: SearchNews) => void
  ) {
    const request = ++this.requests
    this.searches.set(request, onNews)
    this.send({ type: "search", request, needle, pages })
    return {
      stop: () => {
        if (this.searches.delete(request)) this.forget([request])
      },
    }
  }

  /**
   * How much of each page of an open file holds marks, to find its blank
   * pages. News arrives a run of pages at a time; `stop` ends it early.
   */
  ink(id: string, onNews: (news: ScanNews<number>) => void) {
    const request = ++this.requests
    this.scans.set(request, onNews)
    this.send({ type: "ink", id, request })
    return {
      stop: () => {
        if (this.scans.delete(request)) this.forget([request])
      },
    }
  }

  /** The text found in one area of each page of an open file, likewise. */
  areaTexts(id: string, area: Area, onNews: (news: ScanNews<string>) => void) {
    const request = ++this.requests
    this.scans.set(request, onNews)
    this.send({ type: "area-text", id, request, area })
    return {
      stop: () => {
        if (this.scans.delete(request)) this.forget([request])
      },
    }
  }

  /**
   * Cut an open file's double pages in half, or, with no choice, put it back
   * as it was. The file keeps its id; what it now holds arrives as a file event.
   */
  halve(id: string, choice: HalveChoice | null) {
    this.send({ type: "halve", id, choice })
  }

  /** Stop waiting for answers that are no longer wanted. */
  forget(requests: number[]) {
    for (const request of requests) {
      this.thumbnails.get(request)?.(null)
      this.thumbnails.delete(request)
      this.texts.get(request)?.(null)
      this.texts.delete(request)
    }
    if (this.worker && requests.length) this.send({ type: "forget", requests })
  }

  /**
   * Merge pages of the open files. The promise gives null when the merge was
   * cancelled. `onProgress` is given a null total once the file is being written.
   */
  merge(
    order: MergeOrder,
    onProgress: (done: number, total: number | null) => void
  ) {
    const job = ++this.jobs
    const promise = new Promise<MergeResult | null>((resolve, reject) => {
      this.merges.set(job, { resolve, reject, onProgress })
      this.send({ type: "merge", job, ...order })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
  }

  /**
   * Split an open file into parts. Parts are handed over as they are
   * written. The promise gives false when the split was cancelled.
   */
  split(
    id: string,
    parts: number[][],
    keep: SplitKeep,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ) {
    const job = ++this.jobs
    const promise = new Promise<boolean>((resolve, reject) => {
      this.splits.set(job, { resolve, reject, onPart, onProgress })
      this.send({ type: "split", job, id, parts, keep })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
  }

  /**
   * Split an open file into parts that each stay under a size in bytes.
   * Which pages a part holds is only known when it arrives.
   */
  splitBySize(
    id: string,
    limit: number,
    keep: SplitKeep,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ) {
    const job = ++this.jobs
    const promise = new Promise<boolean>((resolve, reject) => {
      this.splits.set(job, { resolve, reject, onPart, onProgress })
      this.send({ type: "split-size", job, id, limit, keep })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.dropReading()
    for (const job of this.merges.values()) job.resolve(null)
    this.merges.clear()
    for (const job of this.splits.values()) job.resolve(false)
    this.splits.clear()
    this.sent.clear()
  }
}
