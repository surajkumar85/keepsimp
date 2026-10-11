import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { FileFacts } from "./files"
import type { Bookmark, BookmarkPolicy } from "./outline"
import type { PictureMargin, PicturePage } from "./picture"
import type { FooterPlace, NumberStyle, SheetChoice } from "./print"
import type { ContentsChoice, FormsChoice, LabelsChoice } from "./settings"

/** One page of the result, as the worker is asked for it. */
export type WantedPage =
  { file: string; page: number; rotation: Rotation } | { blank: Size }

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
    }
  | { type: "split-done"; job: number }
  | { type: "split-error"; job: number; message: string }
  | { type: "cancelled"; job: number }
