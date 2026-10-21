/**
 * A stand-in for the PDF worker in unit tests, so that the tools' choices can
 * be seen: what it was asked, and plain answers. A "PDF" here is "%PDF-"
 * and JSON that says what the file holds. The real worker is tested by the
 * browser tests and the PDF tools' own.
 */
import type { FileEvent, SplitPart } from "@/lib/pdf-merger/client"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import type {
  CompressOrder,
  MergeOrder,
  PdfClientLike,
} from "@/lib/agent/pdf-engine"

export interface FakeFile {
  pages: number
  title?: string
  password?: string
  broken?: boolean
  signed?: boolean
  bookmarks?: Bookmark[]
  /** Pages (from 0) with no text. */
  empty?: number[]
  /** Words and the pages (from 0) that hold them. */
  words?: Record<string, number[]>
  /** Each page's share of marks. */
  ink?: number[]
}

export const fakePdf = (file: FakeFile) =>
  new Blob([`%PDF-${JSON.stringify(file)}`], { type: "application/pdf" })

const read = async (blob: Blob): Promise<FakeFile> =>
  JSON.parse((await blob.text()).slice(5))

export class FakePdfClient implements PdfClientLike {
  readonly onFile: (event: FileEvent) => void
  readonly held = new Map<string, FakeFile>()
  readonly closed: string[] = []
  merges: MergeOrder[] = []
  splits: { parts?: number[][]; limit?: number; keep: unknown }[] = []
  compressions: CompressOrder[] = []
  /** Jobs hold until released, to be stopped. */
  hold = false
  private releases: (() => void)[] = []
  cancelled = 0

  constructor(onFile: (event: FileEvent) => void) {
    this.onFile = onFile
  }

  release() {
    for (const go of this.releases.splice(0)) go()
  }

  open(
    id: string,
    file: Blob,
    options: { password?: string; picture?: boolean } = {}
  ) {
    void (async () => {
      if (options.picture) {
        this.held.set(id, { pages: 1 })
        this.onFile({
          type: "opened",
          id,
          facts: this.facts({ pages: 1 }, true),
        })
        return
      }
      const facts = await read(file)
      if (facts.broken)
        return this.onFile({ type: "open-error", id, message: "it is damaged" })
      if (facts.password && options.password !== facts.password)
        return this.onFile({
          type: "locked",
          id,
          wrong: options.password !== undefined,
        })
      this.held.set(id, facts)
      this.onFile({ type: "opened", id, facts: this.facts(facts, false) })
    })()
  }

  private facts(file: FakeFile, picture: boolean) {
    return {
      pages: file.pages,
      width: 595,
      height: 842,
      title: file.title ?? "",
      bookmarks: file.bookmarks?.length ?? 0,
      repaired: false,
      unlocked: Boolean(file.password),
      restricted: false,
      signed: Boolean(file.signed),
      tagged: false,
      forms: false,
      ...(picture ? { picture: { width: 10, height: 10 } } : {}),
    }
  }

  close(id: string) {
    this.closed.push(id)
  }

  async layout(id: string) {
    const file = this.held.get(id)
    if (!file) return null
    return {
      sizes: Array.from({ length: file.pages }, () => ({
        width: 595.28,
        height: 841.89,
      })),
      bookmarks: file.bookmarks ?? [],
    }
  }

  text(id: string, page: number) {
    const file = this.held.get(id)!
    return {
      promise: Promise.resolve(
        page === 99
          ? null
          : {
              lines: file.empty?.includes(page)
                ? []
                : [
                    {
                      text: `Page ${page + 1}`,
                      quad: [0, 0, 0, 0, 0, 0, 0, 0],
                      size: 12,
                    },
                    {
                      text: "x".repeat(file.title === "long" ? 150_000 : 3),
                      quad: [0, 0, 0, 0, 0, 0, 0, 0],
                      size: 12,
                    },
                  ],
              links: [],
            }
      ) as never,
    }
  }

  search(
    needle: string,
    pages: { id: string; page: number }[],
    onNews: (news: never) => void
  ) {
    const file = this.held.get(pages[0].id)!
    const at = file.words?.[needle] ?? []
    let stopped = false
    queueMicrotask(() => {
      if (stopped || this.hold) return
      // First what was found so far, then the rest.
      onNews({
        found: [],
        done: 0,
        withText: 0,
        total: pages.length,
      } as never)
      onNews({
        found: pages.map((_, index) => ({
          at: index,
          hits: at.includes(index) ? [[]] : [],
        })),
        done: pages.length,
        withText: pages.length,
        total: pages.length,
      } as never)
    })
    return { stop: () => (stopped = true) }
  }

  ink(id: string, onNews: (news: never) => void) {
    const file = this.held.get(id)!
    const shares = file.ink ?? []
    let stopped = false
    queueMicrotask(() => {
      if (stopped || this.hold) return
      const half = Math.ceil(shares.length / 2)
      onNews({
        from: 0,
        found: shares.slice(0, half),
        total: shares.length,
      } as never)
      onNews({
        from: half,
        found: shares.slice(half),
        total: shares.length,
      } as never)
    })
    return { stop: () => (stopped = true) }
  }

  private job<T>(answer: () => T, empty: T) {
    let cancelled = false
    const promise = new Promise<T>((resolve) => {
      const go = () => resolve(cancelled ? empty : answer())
      if (this.hold) this.releases.push(go)
      else queueMicrotask(go)
    })
    return {
      promise,
      cancel: () => {
        cancelled = true
        this.cancelled++
        this.release()
      },
    }
  }

  merge(
    order: MergeOrder,
    onProgress: (done: number, total: number | null) => void
  ) {
    this.merges.push(order)
    onProgress(1, order.pages.length)
    onProgress(order.pages.length, null)
    const pages =
      order.details.title === "short"
        ? order.pages.length - 1
        : order.pages.length
    return this.job(
      () => ({
        bytes: new TextEncoder().encode(
          `%PDF-${JSON.stringify({ pages, password: order.lock?.password })}`
        ).buffer as ArrayBuffer,
        pages: order.pages.length,
        bookmarks: order.bookmarks === "none" ? 0 : 2,
      }),
      null
    )
  }

  private parts(
    pages: number[][],
    onPart: (part: SplitPart) => void,
    wrong: boolean
  ) {
    pages.forEach((part, index) =>
      onPart({
        index,
        bytes: new TextEncoder().encode(`%PDF-{"pages":${part.length}}`)
          .buffer as ArrayBuffer,
        pages: wrong && index === 0 ? part.length + 1 : part.length,
        bookmarks: 0,
      })
    )
  }

  split(
    id: string,
    parts: number[][],
    keep: unknown,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ) {
    this.splits.push({ parts, keep })
    onProgress(1, 2)
    const wrong = this.held.get(id)!.title === "wrong"
    return this.job(() => {
      // Parts arrive out of order, as they may from the worker.
      this.parts(
        [...parts].reverse(),
        (part) => onPart({ ...part, index: parts.length - 1 - part.index }),
        wrong
      )
      return true
    }, false)
  }

  splitBySize(
    id: string,
    limit: number,
    keep: unknown,
    onPart: (part: SplitPart) => void,
    onProgress: (done: number, total: number) => void
  ) {
    this.splits.push({ limit, keep })
    onProgress(0, 0)
    const count = this.held.get(id)!.pages
    return this.job(() => {
      for (let start = 0; start < count; start += 2)
        onPart({
          index: start / 2,
          bytes: new ArrayBuffer(8),
          pages: Math.min(2, count - start),
          bookmarks: 0,
          start,
          over: start % 4 === 0,
        })
      return true
    }, false)
  }

  audit() {
    return Promise.resolve(null)
  }

  compress(
    id: string,
    file: Blob,
    order: CompressOrder,
    onStage: (
      stage: "reading" | "pictures" | "writing" | "checking",
      done: number,
      total: number,
      attempt?: number
    ) => void
  ) {
    this.compressions.push(order)
    onStage("pictures", 1, 2)
    onStage("writing", 1, 1, 2)
    const lossless = order.how === "lossless"
    const target =
      typeof order.how === "object" && "target" in order.how
        ? order.how.target
        : null
    return this.job(
      () => ({
        bytes: lossless ? null : (new ArrayBuffer(400_000) as ArrayBuffer),
        report: {
          before: 1_000_000,
          after: lossless ? 1_000_000 : 400_000,
          smaller: !lossless,
          pictures: { found: 3, changed: 2, resized: 1 },
          fontsCut: true,
          dropped: { thumbnails: 0, private: 0 },
          check: {
            checked: this.held.get(id)!.title === "unchecked" ? 0 : 4,
            changed: 4,
            low:
              this.held.get(id)!.title === "changed"
                ? [{ page: 1, score: 0.5 }]
                : [],
          },
          audit: null,
          ...(target
            ? { target: { wanted: target, met: target > 500_000, writes: 2 } }
            : {}),
          ...(order.remove ? { taken: ["details" as const] } : {}),
          ...(order.lock ? { locked: true } : {}),
        },
      }),
      null
    ) as never
  }
}
