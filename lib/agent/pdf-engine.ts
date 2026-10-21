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
import type { EditState, Inserted } from "@/lib/pdf-merger/client"
import type { EditNews } from "@/lib/pdf-merger/protocol"
import type { Change } from "@/lib/pdf-editor/tools"
import type { PagesChange } from "@/lib/pdf-editor/pages"
import type { DocumentChange } from "@/lib/pdf-editor/document"
import type { FieldChange } from "@/lib/pdf-editor/forms"
import type {
  Clean,
  FoundPlace,
  RedactChange,
  Sought,
} from "@/lib/pdf-editor/redact"
import type { Found, Query } from "@/lib/pdf-editor/find"
import type { TextChange } from "@/lib/pdf-editor/retext"
import type { OcrPicture } from "@/lib/pdf-editor/mupdf-ocr"
import type { OcrChange } from "@/lib/pdf-editor/ocr"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import type { FoundSignature } from "@/lib/pdf-editor/signature-report"
import type { Size } from "@/lib/image-compressor/geometry"
import { ToolError } from "./registry"

export type MergeOrder = Omit<
  Extract<PdfRequest, { type: "merge" }>,
  "type" | "job"
>

export interface ExportOrder {
  keepEditable: boolean
  comments: "keep" | "flatten" | "remove"
  fields: "keep" | "flatten"
  after: boolean
  lock: Lock | null
  clean?: Clean
}

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
  editState(id: string): Promise<EditState | null>
  editFont(id: string, key: string, bytes: ArrayBuffer): void
  editPicture(id: string, name: string, file: Blob): Promise<Size | null>
  editInsert(
    id: string,
    name: string,
    file: Blob,
    how?: { password?: string }
  ): Promise<Inserted>
  editApply(id: string, change: Change): Promise<EditNews>
  editPages(id: string, change: PagesChange): Promise<EditNews>
  editDocument(id: string, change: DocumentChange): Promise<EditNews>
  editField(id: string, change: FieldChange): Promise<EditNews>
  signatures(
    id: string,
    trusted?: Uint8Array[]
  ): Promise<FoundSignature[] | null>
  redactFind(
    id: string,
    sought: Sought
  ): Promise<{ found: (FoundPlace & { page: number })[]; more: boolean } | null>
  editRedact(id: string, change: RedactChange): Promise<EditNews>
  editFind(
    id: string,
    query: Query
  ): Promise<{ found: Found[]; more: boolean } | null>
  editReplace(id: string, change: TextChange): Promise<EditNews>
  ocrPicture(id: string, page: number): Promise<OcrPicture | null>
  editOcr(id: string, change: OcrChange): Promise<EditNews>
  editExport(
    id: string,
    options: ExportOrder
  ): Job<{ bytes: ArrayBuffer; report: ExportReport } | null>
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
    options: { password?: string; picture?: boolean; edit?: boolean } = {}
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

  /**
   * Opens a file to be changed by steps, as the editor does: untouched, with
   * what its pages hold. Closed again with `close`.
   */
  async openForEdit(file: Blob, name: string, password?: string) {
    const { id, facts } = await this.open(file, name, { password, edit: true })
    const state = await this.client.editState(id)
    if (!state) {
      this.client.close(id)
      throw new ToolError(`${name} could not be opened for editing.`)
    }
    return { id, facts, state }
  }

  /** The editor's calls, one at a time: each is awaited before the next is made. */
  editFont(id: string, key: string, bytes: ArrayBuffer) {
    this.client.editFont(id, key, bytes)
  }
  async editPicture(id: string, name: string, file: Blob) {
    const size = await this.client.editPicture(id, name, file)
    if (!size)
      throw new ToolError(
        "This picture could not be read. PNG, JPEG, WebP and AVIF can be used."
      )
    return size
  }
  async editInsert(
    id: string,
    name: string,
    file: Blob,
    shown: string,
    password?: string
  ) {
    const taken = await this.client.editInsert(id, name, file, { password })
    if ("locked" in taken)
      throw new ToolError(
        taken.wrong
          ? `The password for ${shown} is wrong.`
          : `${shown} is locked with a password: give it as "insertPassword".`
      )
    if ("failed" in taken) throw new ToolError(taken.failed)
    return taken.pages
  }
  editApply(id: string, change: Change) {
    return this.client.editApply(id, change)
  }
  editPages(id: string, change: PagesChange) {
    return this.client.editPages(id, change)
  }
  editDocument(id: string, change: DocumentChange) {
    return this.client.editDocument(id, change)
  }
  editField(id: string, change: FieldChange) {
    return this.client.editField(id, change)
  }
  async signatures(id: string) {
    const found = await this.client.signatures(id, [])
    if (!found)
      throw new ToolError("The signatures of this file could not be read.")
    return found
  }
  async redactFind(id: string, sought: Sought) {
    const found = await this.client.redactFind(id, sought)
    if (!found) throw new ToolError("The file could not be looked through.")
    return found
  }
  editRedact(id: string, change: RedactChange) {
    return this.client.editRedact(id, change)
  }
  async editFind(id: string, query: Query) {
    const found = await this.client.editFind(id, query)
    if (!found) throw new ToolError("The file could not be looked through.")
    return found
  }
  editReplace(id: string, change: TextChange) {
    return this.client.editReplace(id, change)
  }
  ocrPicture(id: string, page: number) {
    return this.client.ocrPicture(id, page)
  }
  editOcr(id: string, change: OcrChange) {
    return this.client.editOcr(id, change)
  }

  /** Writes the edited file out, with the editor's read-back checks. */
  exportEdit(id: string, options: ExportOrder, signal: AbortSignal) {
    return stoppable(this.client.editExport(id, options), signal)
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
