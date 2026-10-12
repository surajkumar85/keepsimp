"use client"

import { poolSize } from "@/lib/image-batch/pool"
import type { Size } from "@/lib/image-compressor/geometry"
import type { CommentChange, LetterLine } from "@/lib/pdf-editor/comments"
import type { FieldChange } from "@/lib/pdf-editor/forms"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import type { Change } from "@/lib/pdf-editor/tools"
import type { Audit } from "@/lib/pdf-compressor/mupdf-audit"
import type { CompressReport, Stage } from "@/lib/pdf-compressor/mupdf-compress"
import type { Lock, Removal } from "@/lib/pdf-compressor/options"
import type { ScanChoice } from "@/lib/pdf-compressor/settings"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { HalveChoice } from "@/lib/pdf-splitter/halves"
import type { Area } from "@/lib/pdf-splitter/text-rule"
import type { Bookmark } from "./outline"
import type {
  CompressHow,
  EditNews,
  PdfRequest,
  PdfResponse,
  SplitKeep,
} from "./protocol"

/** Where a file being edited stands when it is opened. */
export type EditState = NonNullable<
  Extract<PdfResponse, { type: "edit-state" }>["state"]
>

/** A change that could not be made, with the reason for the page. */
export class EditFailed extends Error {}

interface ExportJob {
  resolve: (result: { bytes: ArrayBuffer; report: ExportReport } | null) => void
  reject: (error: Error) => void
}

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

/** A compressed file: `bytes` is null when the original is already as small. */
export interface CompressResult {
  bytes: ArrayBuffer | null
  report: CompressReport
}

interface CompressJob {
  /** Null when the compression was cancelled. */
  resolve: (result: CompressResult | null) => void
  reject: (error: Error) => void
  onStage: (stage: Stage, done: number, total: number, attempt?: number) => void
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
  private readonly sent = new Map<
    string,
    { file: Blob; picture: boolean; edit?: boolean }
  >()
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
  private readonly audits = new Map<number, (audit: Audit | null) => void>()
  private readonly compressions = new Map<number, CompressJob>()
  private readonly editStates = new Map<
    number,
    (state: EditState | null) => void
  >()
  private readonly editPictures = new Map<number, (size: Size | null) => void>()
  private readonly editLetters = new Map<
    number,
    (lines: LetterLine[] | null) => void
  >()
  private readonly editNews = new Map<
    number,
    { resolve: (news: EditNews) => void; reject: (error: Error) => void }
  >()
  private readonly exports = new Map<number, ExportJob>()
  private requests = 0
  private jobs = 0
  private answered = false
  private restarts = 0
  /** Workers that run the compressor's picture codecs, each on a core of its own. */
  private helpers: Worker[] = []
  private helpersAsked = false

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
    } else if (message.type === "audit") {
      this.audits.get(message.request)?.(message.audit)
      this.audits.delete(message.request)
      // Only the compressor asks for this, and by now the worker has loaded.
      this.startHelpers()
    } else if (message.type === "edit-state") {
      this.editStates.get(message.request)?.(message.state)
      this.editStates.delete(message.request)
    } else if (message.type === "edit-picture") {
      this.editPictures.get(message.request)?.(message.size)
      this.editPictures.delete(message.request)
    } else if (message.type === "edit-letters") {
      this.editLetters.get(message.request)?.(message.lines)
      this.editLetters.delete(message.request)
    } else if (message.type === "edit-news") {
      const waiting = this.editNews.get(message.request)
      this.editNews.delete(message.request)
      if (message.news) waiting?.resolve(message.news)
      else waiting?.reject(new EditFailed(message.message ?? ""))
    } else if (
      message.type === "edit-exported" ||
      message.type === "edit-export-error"
    ) {
      const job = this.exports.get(message.job)
      this.exports.delete(message.job)
      if (message.type === "edit-exported")
        job?.resolve({ bytes: message.bytes, report: message.report })
      else job?.reject(new Error(message.message))
    } else if (message.type === "stage") {
      this.compressions
        .get(message.job)
        ?.onStage(message.stage, message.done, message.total, message.attempt)
    } else if (
      message.type === "compressed" ||
      message.type === "compress-error"
    ) {
      const job = this.compressions.get(message.job)
      this.compressions.delete(message.job)
      if (message.type === "compressed")
        job?.resolve({ bytes: message.bytes, report: message.report })
      else job?.reject(new Error(message.message))
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
      const exporting = this.exports.get(message.job)
      if (exporting && message.type === "cancelled") {
        this.exports.delete(message.job)
        exporting.resolve(null)
        return
      }
      const compression = this.compressions.get(message.job)
      if (compression && message.type === "cancelled") {
        this.compressions.delete(message.job)
        compression.resolve(null)
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

  /**
   * Start the helpers that encode pictures while the worker goes on to the
   * next one. They start one after another (see `WorkerPool`), and each is
   * given a line of its own to the worker. Without them, and on a device
   * with too few cores for them, the worker encodes pictures itself.
   */
  private startHelpers() {
    if (this.helpersAsked) return
    this.helpersAsked = true
    const wanted = poolSize(navigator.hardwareConcurrency)
    // One helper would only move the work, not share it.
    if (wanted < 2) return
    const next = () => {
      if (this.helpers.length >= wanted) return
      const helper = new Worker(
        new URL("../pdf-compressor/codec.worker.ts", import.meta.url),
        { type: "module" }
      )
      this.helpers.push(helper)
      helper.onmessage = () => {
        if (!this.worker || !this.helpers.includes(helper)) return
        const line = new MessageChannel()
        helper.postMessage({ port: line.port1 }, [line.port1])
        this.worker.postMessage({ type: "helper", port: line.port2 }, [
          line.port2,
        ])
        next()
      }
      // The worker does itself what a helper that stopped was doing.
      helper.onerror = () => this.stopHelpers(true)
    }
    next()
  }

  /** @param tell Let the worker know, so it stops waiting for them. */
  private stopHelpers(tell: boolean) {
    for (const helper of this.helpers) helper.terminate()
    this.helpers = []
    if (tell) this.worker?.postMessage({ type: "helpers-lost" })
  }

  /** The worker stopped: start it again if it never ran, otherwise say so. */
  private failed() {
    this.worker?.terminate()
    this.worker = null
    // Their lines led to the worker that is gone; a new one gets new helpers.
    this.stopHelpers(false)
    this.helpersAsked = false
    this.dropReading()
    for (const job of this.merges.values()) job.reject(new Error(ENGINE_FAILED))
    this.merges.clear()
    for (const job of this.splits.values()) job.reject(new Error(ENGINE_FAILED))
    this.splits.clear()
    for (const job of this.compressions.values())
      job.reject(new Error(ENGINE_FAILED))
    this.compressions.clear()
    this.dropEditing(new EditFailed(ENGINE_FAILED))
    // Offline, some browsers fail to load a worker's scripts the first time (see WorkerPool).
    if (!this.answered && this.restarts < 2) {
      this.restarts++
      for (const [id, { file, picture, edit }] of this.sent)
        this.send({ type: "open", id, file, picture, edit })
      return
    }
    for (const id of this.sent.keys())
      this.onFile({ type: "open-error", id, message: ENGINE_FAILED })
    this.sent.clear()
  }

  /** Answer everything an editor is waiting for: nothing, or the reason given. */
  private dropEditing(reason: Error | null) {
    for (const done of this.editStates.values()) done(null)
    this.editStates.clear()
    for (const done of this.editPictures.values()) done(null)
    this.editPictures.clear()
    for (const done of this.editLetters.values()) done(null)
    this.editLetters.clear()
    for (const waiting of this.editNews.values())
      waiting.reject(reason ?? new EditFailed(""))
    this.editNews.clear()
    for (const job of this.exports.values())
      if (reason) job.reject(reason)
      else job.resolve(null)
    this.exports.clear()
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
    for (const done of this.audits.values()) done(null)
    this.audits.clear()
  }

  open(
    id: string,
    file: Blob,
    options: { password?: string; picture?: boolean; edit?: boolean } = {}
  ) {
    const picture = Boolean(options.picture)
    const edit = Boolean(options.edit)
    this.sent.set(id, { file, picture, edit })
    this.send({
      type: "open",
      id,
      file,
      password: options.password,
      picture,
      edit,
    })
  }

  /** Where a file opened for editing stands; null when it is not open for that. */
  editState(id: string) {
    return new Promise<EditState | null>((resolve) => {
      const request = ++this.requests
      this.editStates.set(request, resolve)
      this.send({ type: "edit-state", id, request })
    })
  }

  /** Hand the worker a font file for text boxes. */
  editFont(id: string, key: string, bytes: ArrayBuffer) {
    this.send({ type: "edit-font", id, key, bytes })
  }

  /** Hand the worker a picture to place; its size in pixels, or null when it cannot be read. */
  editPicture(id: string, name: string, file: Blob) {
    return new Promise<Size | null>((resolve) => {
      const request = ++this.requests
      this.editPictures.set(request, resolve)
      this.send({ type: "edit-picture", id, request, name, file })
    })
  }

  /**
   * Make a change to a file being edited.
   * @throws EditFailed with words for the page when it could not be made.
   */
  editApply(id: string, change: Change) {
    return new Promise<EditNews>((resolve, reject) => {
      const request = ++this.requests
      this.editNews.set(request, { resolve, reject })
      this.send({ type: "edit-apply", id, request, change })
    })
  }

  /**
   * Make a change to the comments of a file being edited.
   * @throws EditFailed with words for the page when it could not be made.
   */
  editComment(id: string, change: CommentChange) {
    return new Promise<EditNews>((resolve, reject) => {
      const request = ++this.requests
      this.editNews.set(request, { resolve, reject })
      this.send({ type: "edit-comment", id, request, change })
    })
  }

  /** Fill fields of a form in, as one step; what the pages hold afterwards. */
  editField(id: string, change: FieldChange) {
    return new Promise<EditNews>((resolve, reject) => {
      const request = ++this.requests
      this.editNews.set(request, { resolve, reject })
      this.send({ type: "edit-field", id, request, change })
    })
  }

  /** The letters of a page with their boxes; null when the page cannot be read. */
  lettersOf(id: string, page: number) {
    return new Promise<LetterLine[] | null>((resolve) => {
      const request = ++this.requests
      this.editLetters.set(request, resolve)
      this.send({ type: "edit-letters", id, request, page })
    })
  }

  /** Undo the last change (`back`), or make it again. */
  editStep(id: string, back: boolean) {
    return new Promise<EditNews>((resolve, reject) => {
      const request = ++this.requests
      this.editNews.set(request, { resolve, reject })
      this.send({ type: "edit-step", id, request, back })
    })
  }

  /** Write an edited file out. The promise gives null when it was cancelled. */
  editExport(
    id: string,
    options: {
      keepEditable: boolean
      comments: "keep" | "flatten" | "remove"
      fields: "keep" | "flatten"
      after: boolean
      lock: Lock | null
    }
  ) {
    const job = ++this.jobs
    const promise = new Promise<{
      bytes: ArrayBuffer
      report: ExportReport
    } | null>((resolve, reject) => {
      this.exports.set(job, { resolve, reject })
      this.send({ type: "edit-export", id, job, ...options })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
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

  /** What an open file's bytes are spent on; null when it cannot be told. */
  audit(id: string, size: number) {
    return new Promise<Audit | null>((resolve) => {
      const request = ++this.requests
      this.audits.set(request, resolve)
      this.send({ type: "audit", id, request, size })
    })
  }

  /**
   * Compress an open file. The file is handed over once more, so the open
   * copy stays as it was. The promise gives null when it was cancelled.
   */
  compress(
    id: string,
    file: Blob,
    order: {
      how: CompressHow
      scans: ScanChoice
      remove: Removal | null
      lock: Lock | null
      password?: string
      maxPixels: number
    },
    onStage: (
      stage: Stage,
      done: number,
      total: number,
      attempt?: number
    ) => void
  ) {
    const job = ++this.jobs
    const promise = new Promise<CompressResult | null>((resolve, reject) => {
      this.compressions.set(job, { resolve, reject, onStage })
      this.send({ type: "compress", job, id, file, ...order })
    })
    return {
      promise,
      cancel: () => this.worker?.postMessage({ type: "cancel", job }),
    }
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.stopHelpers(false)
    this.helpersAsked = false
    this.dropReading()
    for (const job of this.compressions.values()) job.resolve(null)
    this.compressions.clear()
    this.dropEditing(null)
    for (const job of this.merges.values()) job.resolve(null)
    this.merges.clear()
    for (const job of this.splits.values()) job.resolve(false)
    this.splits.clear()
    this.sent.clear()
  }
}
