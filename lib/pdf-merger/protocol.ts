import type { MakeFieldChange } from "@/lib/pdf-editor/form-fields"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { Audit } from "@/lib/pdf-compressor/mupdf-audit"
import type { CompressReport, Stage } from "@/lib/pdf-compressor/mupdf-compress"
import type { Lock, Removal } from "@/lib/pdf-compressor/options"
import type {
  CustomChoice,
  Level,
  ScanChoice,
} from "@/lib/pdf-compressor/settings"
import type {
  Comment,
  CommentChange,
  LetterLine,
} from "@/lib/pdf-editor/comments"
import type { FieldChange, FormFacts, FormField } from "@/lib/pdf-editor/forms"
import type { History } from "@/lib/pdf-editor/history"
import type { ExportReport, Step } from "@/lib/pdf-editor/mupdf-edit"
import type { Found } from "@/lib/pdf-editor/find"
import type { LinkChange, PageLink } from "@/lib/pdf-editor/links"
import type { PagePicture, PictureChange } from "@/lib/pdf-editor/page-pictures"
import type { DocumentChange } from "@/lib/pdf-editor/document"
import type { DocumentFacts } from "@/lib/pdf-editor/mupdf-document"
import type { PagesChange } from "@/lib/pdf-editor/pages"
import type {
  Applied,
  Clean,
  FoundPlace,
  RedactChange,
  RedactMark,
  Sought,
} from "@/lib/pdf-editor/redact"
import type { PageLine, TextChange } from "@/lib/pdf-editor/retext"
import type { EditorObject } from "@/lib/pdf-editor/objects"
import type { Change } from "@/lib/pdf-editor/tools"
import type { PageText, Quad } from "@/lib/pdf-reader/text"
import type { HalveChoice } from "@/lib/pdf-splitter/halves"
import type { Area } from "@/lib/pdf-splitter/text-rule"
import type { FileFacts } from "./files"
import type { Suggestion } from "@/lib/pdf-editor/form-suggest"
import type { OcrPicture } from "@/lib/pdf-editor/mupdf-ocr"
import type { OcrChange } from "@/lib/pdf-editor/ocr"
import type { Signer } from "@/lib/pdf-editor/certificate"
import type { CertifyOptions } from "@/lib/pdf-editor/certify"
import type { Bookmark, BookmarkPolicy } from "./outline"
import type { PictureMargin, PicturePage } from "./picture"
import type { FooterPlace, NumberStyle, SheetChoice } from "./print"
import type { ContentsChoice, FormsChoice, LabelsChoice } from "./settings"

/** How a file is to be compressed. */
export type CompressHow =
  Level | { target: number; further: boolean } | { custom: CustomChoice }

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
      /** The file is to be edited: it is opened untouched, and what is opened is the copy that changes. */
      edit?: boolean
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
      /** A level, a size in bytes to come out under and whether to go past what is easy to read, or settings of one's own. */
      how: CompressHow
      /** Things to take out besides, and a password for the result; null for none. */
      remove: Removal | null
      lock: Lock | null
      /** What to do with scanned pages. */
      scans: ScanChoice
      /** Pictures with more pixels than this are left as they are. */
      maxPixels: number
    }
  | { type: "cancel"; job: number }
  /** Where a file being edited stands: its pages, what was added to them, and its list of changes. */
  | { type: "edit-state"; id: string; request: number }
  /** A font file for text boxes, by its key. */
  | {
      type: "edit-font"
      id: string
      key: string
      bytes: ArrayBuffer
      /** What a font of one's own is called. */
      name?: string
    }
  /** A picture to be placed, under a name. */
  | {
      type: "edit-picture"
      id: string
      request: number
      name: string
      file: Blob
    }
  /** Make a change to the file, as one step. */
  | { type: "edit-apply"; id: string; request: number; change: Change }
  /** Make a change to comments, as one step. */
  | { type: "edit-comment"; id: string; request: number; change: CommentChange }
  /** Fill fields of a form in, as one step. */
  | { type: "edit-field"; id: string; request: number; change: FieldChange }
  | {
      type: "edit-make-fields"
      id: string
      request: number
      change: MakeFieldChange
    }
  /** The letters of a page with their boxes, for marks to be laid on words. */
  | { type: "edit-letters"; id: string; request: number; page: number }
  /** The lines of a page's own text, with the look of their letters, for their words to be changed. */
  | { type: "edit-lines"; id: string; request: number; page: number }
  /** Change the words of lines of a page, as one step. */
  | { type: "edit-text"; id: string; request: number; change: TextChange }
  /** The pictures a page already has, with where they are, for them to be changed. */
  | { type: "edit-page-pictures"; id: string; request: number; page: number }
  /** Every place some words are in the file's own text. What is asked is checked before it is looked for. */
  | { type: "edit-find"; id: string; request: number; query: unknown }
  /** Change the words of many lines and paragraphs as one step, leaving out those that cannot be changed. */
  | { type: "edit-replace"; id: string; request: number; change: TextChange }
  /** The links of a page, with where they lie and lead. */
  | { type: "edit-page-links"; id: string; request: number; page: number }
  /** Add, change or take away links of a page, as one step. */
  | { type: "edit-page-link"; id: string; request: number; change: LinkChange }
  /**
   * Hand over another PDF whose pages are to be added, under a name. It is
   * made ready first, unless it is one that was made ready before and kept
   * with a draft.
   */
  | {
      type: "edit-insert"
      id: string
      request: number
      name: string
      file: Blob
      password?: string
      ready?: boolean
    }
  /** Mark places to be taken out for good, take marks away, or apply them all, as one step. */
  | { type: "edit-redact"; id: string; request: number; change: RedactChange }
  /** The marks of a page that are waiting to be applied. */
  | { type: "edit-redact-marks"; id: string; request: number; page: number }
  /** Where some words, or things of a kind, are on the pages, to be marked. */
  | { type: "edit-redact-find"; id: string; request: number; sought: Sought }
  /** The fields a page seems to ask for, from the lines and boxes it draws. Nothing is changed. */
  | { type: "edit-suggest-fields"; id: string; request: number; page: number }
  /** A page drawn in grey for its words to be recognised. */
  | { type: "edit-ocr-picture"; id: string; request: number; page: number }
  /** Lay recognised words on pages, unseen, as one step. */
  | { type: "edit-ocr"; id: string; request: number; change: OcrChange }
  /** Change the file's bookmarks, its details or its own page numbers, as one step. */
  | {
      type: "edit-document"
      id: string
      request: number
      change: DocumentChange
    }
  /** Move, take out, copy, turn or add pages, as one step. */
  | { type: "edit-pages"; id: string; request: number; change: PagesChange }
  /** Change pictures a page already has, as one step. */
  | {
      type: "edit-page-picture"
      id: string
      request: number
      change: PictureChange
    }
  /** The steps that were made, as a draft keeps them. */
  | { type: "edit-draft"; id: string; request: number }
  /** Take a draft up: steps as they were kept, checked before they are made again. */
  | {
      type: "edit-take-up"
      id: string
      request: number
      steps: unknown
      position: number
    }
  /** Undo the last change, or make it again. */
  | { type: "edit-step"; id: string; request: number; back: boolean }
  /** Write the file out as it stands. */
  | {
      type: "edit-export"
      id: string
      job: number
      keepEditable: boolean
      /** What becomes of comments: kept as comments, drawn into their pages, or left out. */
      comments: "keep" | "flatten" | "remove"
      /** What becomes of a form's fields: kept as fields, or drawn into their pages. */
      fields: "keep" | "flatten"
      /**
       * A signed file: its changes are written after it, so that the
       * signature stays valid, and nothing else is done to it.
       */
      after: boolean
      lock: Lock | null
      /** Things the file carries besides its pages that the result is to be without. */
      clean?: Clean
      /** Only these pages, counted from 0, as a file of their own. */
      only?: number[]
      /**
       * Sign the written file with a certificate, as an update after it:
       * the certificate file and its password, which are not kept, and
       * where the signature shows.
       */
      certify?: { file: Uint8Array; password: string; options: CertifyOptions }
    }
  /** Open a certificate file to sign with: who it names, and the file's empty places for a signature. */
  | {
      type: "edit-certificate"
      id: string
      request: number
      file: Uint8Array
      password: string
    }
  /** One end of a line to a helper that runs the picture codecs on a core of its own. */
  | { type: "helper"; port: MessagePort }
  /** The helpers have stopped; what they were doing is done in the worker itself. */
  | { type: "helpers-lost" }

/** What changed in a file being edited: the pages to draw again with what is now on them, and the list of changes. */
export interface EditNews {
  formNames?: string[]
  pages: {
    page: number
    objects: EditorObject[]
    comments: Comment[]
    /** The places of a form on the page, with what each now holds. */
    fields: FormField[]
  }[]
  history: History
  /** Letters a text box holds that its font has no shape for. */
  lacking: string[]
  /** After words were replaced in many places: why each place that was left out could not be changed. */
  refused?: string[]
  /**
   * When the list of pages is another than before: every page's size, and
   * the bookmarks as they lead now. `pages` then names the places that
   * hold another page than before, also places that are no more.
   */
  layout?: { sizes: Size[]; bookmarks: Bookmark[] }
  /** When the file as a whole is another than before: its details, its bookmarks and its own page numbers. */
  document?: DocumentFacts
  /** How many marks for taking something out are waiting to be applied, on all pages together. */
  waiting: number
  /** After marks were applied: what that did on each page. */
  applied?: Applied[]
}

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
  | {
      type: "stage"
      job: number
      stage: Stage
      done: number
      total: number
      /** When the file is written several times to reach a size: which time this is, from 1. */
      attempt?: number
    }
  /** `bytes` is null when the file is already as small: the original is the answer. */
  | {
      type: "compressed"
      job: number
      bytes: ArrayBuffer | null
      report: CompressReport
    }
  | { type: "compress-error"; job: number; message: string }
  | {
      type: "edit-state"
      request: number
      /** Null when the file is not open for editing. */
      state: {
        sizes: Size[]
        objects: EditorObject[][]
        /** The comments on each page, the file's own among them. */
        comments: Comment[][]
        /** The places of a form on each page, and what the form is as a whole. */
        fields: FormField[][]
        form: FormFacts
        formNames?: string[]
        /** Changes to this file can be written after it, which keeps a signature in it valid. */
        after: boolean
        history: History
        bookmarks: Bookmark[]
        /** The file's details, its bookmarks and its own page numbers. */
        document: DocumentFacts
        /** How many marks for taking something out are waiting to be applied. */
        waiting: number
      } | null
    }
  /** Null when the file is not open for editing. */
  | {
      type: "edit-draft"
      request: number
      draft: { steps: Step[]; position: number } | null
    }
  /** A picture's size in pixels; null when it could not be read. */
  | { type: "edit-picture"; request: number; size: Size | null }
  /** Null when the page could not be read. */
  | { type: "edit-letters"; request: number; lines: LetterLine[] | null }
  | { type: "edit-lines"; request: number; lines: PageLine[] | null }
  | {
      type: "edit-page-pictures"
      request: number
      pictures: PagePicture[] | null
    }
  | { type: "edit-page-links"; request: number; links: PageLink[] | null }
  /** `found` is null when the file could not be looked through; `more` when there are more places than are listed. */
  | {
      type: "edit-found"
      request: number
      found: Found[] | null
      more: boolean
    }
  /**
   * `pages` is how many pages the file has; null when it could not be
   * taken, and then `locked` says that it wants a password (`wrong` that
   * the one given is not it) or `message` says why. `bytes` is the file as
   * it was made ready, for a draft to keep.
   */
  | {
      type: "edit-insert"
      request: number
      pages: number | null
      bytes?: ArrayBuffer
      locked?: boolean
      wrong?: boolean
      message?: string
    }
  /** `marks` is null when the page could not be read. */
  | { type: "edit-redact-marks"; request: number; marks: RedactMark[] | null }
  /** `signer` is null when the certificate cannot sign, and `problem` says why. */
  | {
      type: "edit-certificate"
      request: number
      signer: Signer | null
      problem: string
      places: string[]
    }
  /** `picture` is null when the page could not be drawn. */
  | { type: "edit-ocr-picture"; request: number; picture: OcrPicture | null }
  /** `suggestions` is null when the page could not be read. */
  | {
      type: "edit-fields-suggested"
      request: number
      suggestions: Suggestion[] | null
    }
  /** `found` is null when the file could not be looked through; `more` when there are more places than are given. */
  | {
      type: "edit-redact-found"
      request: number
      found: (FoundPlace & { page: number })[] | null
      more: boolean
    }
  /** `news` is null when the change could not be made; `message` then says why. */
  | {
      type: "edit-news"
      request: number
      news: EditNews | null
      message?: string
    }
  | {
      type: "edit-exported"
      job: number
      bytes: ArrayBuffer
      report: ExportReport
    }
  | { type: "edit-export-error"; job: number; message: string }
  | { type: "cancelled"; job: number }
