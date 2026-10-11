import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { PageText, Quad } from "@/lib/pdf-reader/text"

/** One page as the reader shows it. */
export type ReaderEntry =
  | {
      kind: "page"
      key: string
      /** Which open file it comes from, and its page there counted from 0. */
      file: string
      page: number
      /** A turn added to the page's own. */
      rotation: Rotation
      /** The page as the file shows it, in points. */
      size: Size
      /** What it is, in words: "report.pdf, page 3". */
      label: string
    }
  | { kind: "blank"; key: string; size: Size; label: string }

/** Where the reader gets pages from. Everything is asked of the worker that holds the files. */
export interface ReaderSource {
  /** A picture of a page, `edge` pixels on its longer side. Urgent pictures are drawn first. */
  draw(
    file: string,
    page: number,
    edge: number,
    urgent: boolean
  ): { request: number; promise: Promise<ImageBitmap | null> }
  text(
    file: string,
    page: number
  ): { request: number; promise: Promise<PageText | null> }
  search(
    needle: string,
    pages: { id: string; page: number }[],
    onNews: (news: {
      found: { at: number; hits: Quad[][] }[]
      done: number
      withText: number
      total: number
    }) => void
  ): { stop(): void }
  /** Stop waiting for pictures and text that are no longer wanted. */
  forget(requests: number[]): void
}
