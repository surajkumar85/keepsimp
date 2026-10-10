import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { FileFacts } from "./files"
import type { BookmarkPolicy } from "./outline"
import type { PictureMargin, PicturePage } from "./picture"

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
