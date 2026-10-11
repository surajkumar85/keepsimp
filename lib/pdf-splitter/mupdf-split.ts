/**
 * Splitting with MuPDF. A part is a merge of some pages of one file, so the
 * merging engine does the work: it copies whole pages, keeps the links,
 * bookmarks and fields that still have somewhere to point, and gives each
 * part only the fonts and pictures its own pages use.
 */
import type * as MuPDF from "mupdf"
import {
  mergePages,
  type Merged,
  type OpenedPdf,
} from "@/lib/pdf-merger/mupdf-engine"

export interface SplitOptions {
  /** Carry the file's attachments in this part. One part is enough to keep them. */
  attachments?: boolean
  /** Called between pages; it may pause, or throw to stop. */
  checkpoint?: () => Promise<void>
  /** How many of the part's pages are in place. */
  progress?: (done: number, total: number) => void
  /** The time written into the part; now, unless a test fixes it. */
  now?: Date
}

/** One part of a split: these pages of an opened file, counted from 0, as a PDF of their own. */
export function splitPart(
  mupdf: typeof MuPDF,
  pdf: OpenedPdf,
  pages: readonly number[],
  options: SplitOptions = {}
): Promise<Merged> {
  if (!pages.length) throw new Error("A part needs at least one page.")
  const { facts } = pdf
  return mergePages(
    mupdf,
    new Map([["file", { pdf, name: "" }]]),
    pages.map((index) => ({ source: "file", index, rotation: 0 })),
    {
      bookmarks: "keep",
      forms: "keep",
      // A file that numbers its own pages keeps those numbers; any other counts from 1.
      labels: pdf.labels ? "keep" : "continuous",
      attachments: options.attachments ?? false,
      details: {
        title: facts.title,
        author: facts.author ?? "",
        subject: facts.subject ?? "",
        keywords: facts.keywords ?? "",
      },
      checkpoint: options.checkpoint,
      progress: options.progress,
      now: options.now,
    }
  )
}
