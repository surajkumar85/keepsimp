/**
 * The PDF tools' way to the PDF worker: the same `PdfClient` every PDF page
 * uses, with a file's opening turned into a promise, and a job's progress and
 * Stop joined to the call that asked for it.
 */
import type { FileFacts } from "@/lib/pdf-merger/files"
import type {
  CompressResult,
  FileEvent,
  FileLayout,
  MergeResult,
  ScanNews,
  SearchNews,
  SplitPart,
} from "@/lib/pdf-merger/client"
import type {
  CompressHow,
  PdfRequest,
  SplitKeep,
} from "@/lib/pdf-merger/protocol"
import type { Lock, Removal } from "@/lib/pdf-compressor/options"
import type { ScanChoice } from "@/lib/pdf-compressor/settings"
import type { Stage } from "@/lib/pdf-compressor/report"
import type { PageText } from "@/lib/pdf-reader/text"
import { ToolError } from "./registry"

export type MergeOrder = Omit<
  Extract<PdfRequest, { type: "merge" }>,
  "type" | "job"
>

export interface CompressOrder {
  how: CompressHow
  scans: ScanChoice
  remove: Removal | null
  lock: Lock | null
  password?: string
  maxPixels: number
}

interface Job<T> {
  promise: Promise<T>
  cancel: () => void
}

/** What of `PdfClient` the tools use; the class itself, or a stand-in in tests. */
export interface PdfClientLike {
  open(
    id: string,
    file: Blob,
    options?: { password?: string; picture?: boolean }
  ): void
  close(id: string): void
  layout(id: string): Promise<FileLayout | null>
  text(id: string, page: number): { promise: Promise<PageText | null> }
  search(
    needle: string,
    pages: { id: string; page: number }[],
    onNews: (news: SearchNews) => void
  ): { stop: () => void }
  ink(
    id: string,
    onNews: (news: ScanNews<number>) => void
  ): { stop: () => void }
  merge(
    order: MergeOrder,
    onProgress: (done: number, total: number | null) => void
  ): Job<MergeResult | null>
  split(
    id: string,
    parts: number[][],
    keep: SplitKeep,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ): Job<boolean>
  splitBySize(
    id: string,
    limit: number,
    keep: SplitKeep,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ): Job<boolean>
  audit(id: string, size: number): Promise<unknown>
  compress(
    id: string,
    file: Blob,
    order: CompressOrder,
    onStage: (
      stage: Stage,
      done: number,
      total: number,
      attempt?: number
    ) => void
  ): Job<CompressResult | null>
}

/** A job's answer, or an AbortError when it was stopped (as the engine says with null or false). */
async function stoppable<T>(
  job: Job<T>,
  signal: AbortSignal
): Promise<Exclude<T, null | false>> {
  const stop = () => job.cancel()
  signal.addEventListener("abort", stop)
  if (signal.aborted) job.cancel()
  try {
    const answer = await job.promise
    if (answer === null || answer === false || signal.aborted)
      throw new DOMException("Stopped.", "AbortError")
    return answer as Exclude<T, null | false>
  } finally {
    signal.removeEventListener("abort", stop)
  }
}

export class PdfEngine {
  private readonly client: PdfClientLike
  private readonly waiting = new Map<
    string,
    {
      resolve: (facts: FileFacts) => void
      reject: (error: Error) => void
      name: string
    }
  >()
  private count = 0

  constructor(make: (onFile: (event: FileEvent) => void) => PdfClientLike) {
    this.client = make((event) => this.opened(event))
  }

  private opened(event: FileEvent) {
    const waiting = this.waiting.get(event.id)
    if (!waiting) return
    this.waiting.delete(event.id)
    if (event.type === "opened") waiting.resolve(event.facts)
    else {
      this.client.close(event.id)
      waiting.reject(
        new ToolError(
          event.type === "locked"
            ? event.wrong
              ? `The password for ${waiting.name} is wrong.`
              : `${waiting.name} is locked with a password: give it as "password".`
            : `${waiting.name} could not be opened: ${event.message}`
        )
      )
    }
  }

  /** Opens a file in the worker; closes it again with `close`. */
  open(
    file: Blob,
    name: string,
    options: { password?: string; picture?: boolean } = {}
  ) {
    const id = `agent-${++this.count}`
    const facts = new Promise<FileFacts>((resolve, reject) =>
      this.waiting.set(id, { resolve, reject, name })
    )
    this.client.open(id, file, options)
    return facts.then((found) => ({ id, facts: found }))
  }

  close(id: string) {
    this.client.close(id)
  }

  async layout(id: string) {
    const layout = await this.client.layout(id)
    if (!layout)
      throw new ToolError("The pages of this file could not be read.")
    return layout
  }

  /** The text of a page, line by line; empty for a page that has none. */
  async text(id: string, page: number) {
    const text = await this.client.text(id, page).promise
    return text ? text.lines.map((line) => line.text).join("\n") : ""
  }

  /** The pages, counted from 0, that hold `needle`. */
  search(id: string, pages: number, needle: string, signal: AbortSignal) {
    return new Promise<number[]>((resolve, reject) => {
      const found = new Set<number>()
      const search = this.client.search(
        needle,
        Array.from({ length: pages }, (_, page) => ({ id, page })),
        (news) => {
          for (const hit of news.found) if (hit.hits.length) found.add(hit.at)
          if (news.done >= news.total) {
            signal.removeEventListener("abort", stop)
            resolve([...found].sort((a, b) => a - b))
          }
        }
      )
      const stop = () => {
        search.stop()
        reject(new DOMException("Stopped.", "AbortError"))
      }
      signal.addEventListener("abort", stop)
    })
  }

  /** How much of each page holds marks, from 0 to 1, to find blank pages. */
  ink(id: string, pages: number, signal: AbortSignal) {
    return new Promise<number[]>((resolve, reject) => {
      const shares: number[] = new Array(pages).fill(0)
      const scan = this.client.ink(id, (news) => {
        news.found.forEach((share, at) => (shares[news.from + at] = share))
        if (news.from + news.found.length >= news.total) {
          signal.removeEventListener("abort", stop)
          resolve(shares)
        }
      })
      const stop = () => {
        scan.stop()
        reject(new DOMException("Stopped.", "AbortError"))
      }
      signal.addEventListener("abort", stop)
    })
  }

  merge(
    order: MergeOrder,
    signal: AbortSignal,
    onProgress: (done: number, total: number | null) => void
  ) {
    return stoppable(this.client.merge(order, onProgress), signal)
  }

  async split(
    id: string,
    how: { parts: number[][] } | { limit: number },
    keep: SplitKeep,
    signal: AbortSignal,
    onProgress: (done: number, total: number) => void
  ) {
    const parts: SplitPart[] = []
    const onPart = (part: SplitPart) => parts.push(part)
    await stoppable(
      "parts" in how
        ? this.client.split(id, how.parts, keep, onPart, onProgress)
        : this.client.splitBySize(id, how.limit, keep, onPart, onProgress),
      signal
    )
    return parts.sort((a, b) => a.index - b.index)
  }

  async compress(
    id: string,
    file: Blob,
    order: CompressOrder,
    signal: AbortSignal,
    onStage: (
      stage: Stage,
      done: number,
      total: number,
      attempt?: number
    ) => void
  ) {
    // Asking what the bytes are spent on also starts the picture helpers.
    await this.client.audit(id, file.size)
    return stoppable(this.client.compress(id, file, order, onStage), signal)
  }
}
