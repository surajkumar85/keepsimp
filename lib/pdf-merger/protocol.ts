import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { FileFacts } from "./files"
import type { BookmarkPolicy } from "./outline"
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
    }
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
  | { type: "cancel"; job: number }

export type PdfResponse =
  | { type: "opened"; id: string; facts: FileFacts }
  /** The file needs a password; `wrong` when one was tried. */
  | { type: "locked"; id: string; wrong: boolean }
  | { type: "open-error"; id: string; message: string }
  | { type: "thumbnail"; request: number; bitmap: ImageBitmap | null }
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
  | { type: "cancelled"; job: number }
