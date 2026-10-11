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
import { partsBySize, type SizedPart } from "./size"

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

/** A part of a split by size, with the file that was written for it. */
export interface SizedWritten extends SizedPart {
  written: Merged
}

/**
 * Split a file into runs of pages that each stay under a size. The only way
 * to know what a run of pages weighs is to write it, so parts are found by
 * writing; the writing that settles a part is the part that is handed over.
 */
export async function splitBySize(
  mupdf: typeof MuPDF,
  pdf: OpenedPdf,
  limit: number,
  options: {
    onPart: (part: SizedWritten) => Promise<void> | void
    checkpoint?: () => Promise<void>
    /** How many of the file's pages are in a settled part. */
    progress?: (done: number, total: number) => void
  }
) {
  const count = pdf.pages.length
  /** The longest run from the current start that has fitted, as it was written. */
  let best: { length: number; written: Merged } | null = null
  return partsBySize(
    count,
    limit,
    async (start, length) => {
      const written = await splitPart(
        mupdf,
        pdf,
        Array.from({ length }, (_, at) => start + at),
        { attachments: start === 0, checkpoint: options.checkpoint }
      )
      // One page is kept whatever it weighs: a page cannot be made smaller here.
      if (length === 1 || written.bytes.length <= limit)
        if (!best || length > best.length) best = { length, written }
      return written.bytes.length
    },
    async (part) => {
      const settled = best!
      best = null
      await options.onPart({ ...part, written: settled.written })
      options.progress?.(part.start + part.length, count)
    }
  )
}
