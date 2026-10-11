import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { Audit } from "@/lib/pdf-compressor/mupdf-audit"
import type { CompressReport, Stage } from "@/lib/pdf-compressor/mupdf-compress"
import type { Level } from "@/lib/pdf-compressor/settings"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { HalveChoice } from "@/lib/pdf-splitter/halves"
import type { Area } from "@/lib/pdf-splitter/text-rule"
import type { FileFacts } from "./files"
import type { Bookmark, BookmarkPolicy } from "./outline"
import type { PictureMargin, PicturePage } from "./picture"
import type { FooterPlace, NumberStyle, SheetChoice } from "./print"
import type { ContentsChoice, FormsChoice, LabelsChoice } from "./settings"

/** One page of the result, as the worker is asked for it. */
export type WantedPage =
  { file: string; page: number; rotation: Rotation } | { blank: Size }

/** What every part of a split keeps of its file, and whether it is locked. */
export interface SplitKeep {
  bookmarks: boolean
  labels: boolean
  details: boolean
  /** Which parts carry the files attached to the PDF. */
  attachments: "first" | "all" | "none"
  lock: { password: string; ownerPassword: string; permissions: number } | null
}

export type PdfRequest =
  | {
      type: "open"
      id: string
      file: Blob
      password?: string
      /** The file is a picture, to become a one-page file. */
      picture?: boolean
    }
  | { type: "close"; id: string }
  | {
      type: "thumbnail"
      id: string
      /** Page counted from 0. */
      page: number
      /** Longest side in pixels. */
      edge: number
      /** Echoed back, so answers can be matched to their requests. */
      request: number
      /** A page someone is waiting to read: drawn before anything that is not. */
      urgent?: boolean
    }
  /** What a reader needs to lay a file out: the size of every page, and its bookmarks. */
  | { type: "layout"; id: string; request: number }
  /** The text of one page and its links, for selecting, copying and following. */
  | { type: "text"; id: string; page: number; request: number }
  | {
      type: "search"
      request: number
      needle: string
      /** The pages to look through, in order; answers name a page by its place in this list. */
      pages: { id: string; page: number }[]
    }
  /** Answers no longer wanted: pages that scrolled away, or a search that was replaced. */
  | { type: "forget"; requests: number[] }
  | {
      type: "merge"
      /** Echoed back; a newer job or a cancel stops this one. */
      job: number
      pages: WantedPage[]
      /** What each file is called in the result's bookmarks, by its id. */
      names: Record<string, string>
      bookmarks: BookmarkPolicy
      picturePage: PicturePage
      pictureMargin: PictureMargin
      contents: ContentsChoice
      cover: boolean
      forms: FormsChoice
      labels: LabelsChoice
      attachments: boolean
      details: {
        title: string
        author: string
        subject: string
        keywords: string
      }
      /** Getting the result ready for paper: one page size, and what is printed at the foot of pages. */
      print: {
        duplex: boolean
        sheet: SheetChoice
        enlarge: boolean
        footerName: boolean
        numbers: NumberStyle
        numbersAt: FooterPlace
        numbersFrom: number
      }
      /** A password for the result, a second one that lifts its limits, and the limits; null for no lock. */
      lock: {
        password: string
        ownerPassword: string
        permissions: number
      } | null
    }
  | {
      type: "split"
      /** Echoed back; a cancel stops it, as it stops a merge. */
      job: number
      id: string
      /** The pages of each part, counted from 0, in the order they go in. */
      parts: number[][]
      keep: SplitKeep
    }
  /** Split a file into parts that each stay under a size in bytes. The parts are found as it goes. */
  | {
      type: "split-size"
      job: number
      id: string
      limit: number
      keep: SplitKeep
    }
  /** How much of each page of a file holds marks, to find its blank pages. Answers come a run of pages at a time. */
  | { type: "ink"; id: string; request: number }
  /** The text found in one area of each page of a file, likewise. */
  | { type: "area-text"; id: string; request: number; area: Area }
  /**
   * Cut a file's double pages in half, or, with no choice, put the file back
   * as it was. The file keeps its id and is answered as newly opened.
   */
  | { type: "halve"; id: string; choice: HalveChoice | null }
  /** What an open file's bytes are spent on. `size` is the file's size in bytes. */
  | { type: "audit"; id: string; request: number; size: number }
  /**
   * Compress a file. It is sent once more as it is: the copy that is open
   * must stay untouched, since "before" is drawn from it.
   */
  | {
      type: "compress"
      job: number
      id: string
      file: Blob
      password?: string
      level: Level
      /** Pictures with more pixels than this are left as they are. */
      maxPixels: number
    }
  | { type: "cancel"; job: number }

export type PdfResponse =
  | { type: "opened"; id: string; facts: FileFacts }
  /** The file needs a password; `wrong` when one was tried. */
  | { type: "locked"; id: string; wrong: boolean }
  | { type: "open-error"; id: string; message: string }
  | { type: "thumbnail"; request: number; bitmap: ImageBitmap | null }
  | {
      type: "layout"
      request: number
      /** Null when the file is not open. */
      layout: { sizes: Size[]; bookmarks: Bookmark[] } | null
    }
  | { type: "text"; request: number; text: PageText | null }
  | {
      type: "found"
      request: number
      /** What the pages searched since the last answer hold. */
      found: { at: number; hits: Quad[][] }[]
      /** How many pages have been searched, and how many of them hold any text. */
      done: number
      withText: number
      total: number
    }
  | { type: "progress"; job: number; done: number; total: number }
  /** Every page is in place and the file is being written, which cannot be stopped. */
  | { type: "writing"; job: number }
  | {
      type: "merged"
      job: number
      bytes: ArrayBuffer
      pages: number
      bookmarks: number
    }
  | { type: "merge-error"; job: number; message: string }
  /** One part of a split is written. Parts arrive in order. */
  | {
      type: "split-part"
      job: number
      index: number
      bytes: ArrayBuffer
      pages: number
      bookmarks: number
      /** In a split by size: the part's first page, counted from 0, and whether it is one page over the size. */
      start?: number
      over?: boolean
    }
  | { type: "split-done"; job: number }
  /** The share of marks on a run of pages, starting at `from`. */
  | {
      type: "ink"
      request: number
      from: number
      shares: number[]
      total: number
    }
  | {
      type: "area-text"
      request: number
      from: number
      texts: string[]
      total: number
    }
  | { type: "split-error"; job: number; message: string }
  /** Null when the file is not open or cannot be gone through. */
  | { type: "audit"; request: number; audit: Audit | null }
  /** How far a compression is, and in which part of the work. */
  | { type: "stage"; job: number; stage: Stage; done: number; total: number }
  /** `bytes` is null when the file is already as small: the original is the answer. */
  | {
      type: "compressed"
      job: number
      bytes: ArrayBuffer | null
      report: CompressReport
    }
  | { type: "compress-error"; job: number; message: string }
  | { type: "cancelled"; job: number }
