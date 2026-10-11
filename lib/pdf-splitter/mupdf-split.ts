/**
 * Splitting with MuPDF. A part is a merge of some pages of one file, so the
 * merging engine does the work: it copies whole pages, keeps the links,
 * bookmarks and fields that still have somewhere to point, and gives each
 * part only the fonts and pictures its own pages use.
 */
import type * as MuPDF from "mupdf"
import {
  boxOf,
  mergePages,
  openPdf,
  renderPage,
  turnOf,
  type Merged,
  type OpenedPdf,
} from "@/lib/pdf-merger/mupdf-engine"
import { pageSizes, readPage } from "@/lib/pdf-reader/mupdf-read"
import { inkShare } from "./blank"
import {
  areaToBox,
  halfAreas,
  halvedPages,
  pagesToHalve,
  type HalveChoice,
} from "./halves"
import { partsBySize, type SizedPart } from "./size"
import { textInArea, type Area } from "./text-rule"

export interface SplitOptions {
  /** Carry the file's attachments in this part. One part is enough to keep them. */
  attachments?: boolean
  /** Keep the bookmarks of the part's pages; kept unless turned off. */
  bookmarks?: boolean
  /** Keep the page numbers the file gives its own pages; kept unless turned off. */
  labels?: boolean
  /** Keep the title, author, subject and keywords; kept unless turned off. */
  details?: boolean
  /** Lock the part: the password to open it, a second one that lifts the limits, and the limits. */
  lock?: { password: string; ownerPassword: string; permissions: number }
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
  const keeps = options.details !== false
  return mergePages(
    mupdf,
    new Map([["file", { pdf, name: "" }]]),
    pages.map((index) => ({ source: "file", index, rotation: 0 })),
    {
      bookmarks: options.bookmarks === false ? "none" : "keep",
      forms: "keep",
      // A file that numbers its own pages keeps those numbers; any other counts from 1.
      labels: pdf.labels && options.labels !== false ? "keep" : "continuous",
      attachments: options.attachments ?? false,
      details: {
        title: keeps ? facts.title : "",
        author: keeps ? (facts.author ?? "") : "",
        subject: keeps ? (facts.subject ?? "") : "",
        keywords: keeps ? (facts.keywords ?? "") : "",
      },
      lock: options.lock,
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
    /** What every part keeps, and its lock. Which parts carry the attached files is decided by `attaches`. */
    keep?: Pick<SplitOptions, "bookmarks" | "labels" | "details" | "lock">
    /** Whether the part that starts at a page carries the attached files; the first only, unless told otherwise. */
    attaches?: (start: number) => boolean
    checkpoint?: () => Promise<void>
    /** How many of the file's pages are in a settled part. */
    progress?: (done: number, total: number) => void
  }
) {
  const count = pdf.pages.length
  const attaches = options.attaches ?? ((start: number) => start === 0)
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
        {
          ...options.keep,
          attachments: attaches(start),
          checkpoint: options.checkpoint,
        }
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

/** How large a page is drawn to look for marks, in pixels on its longer side. */
const INK_EDGE = 240

/** The share of a page that holds marks (see `inkShare`); 1 for a page that cannot be drawn, which is then never taken for blank. */
export function pageInk(mupdf: typeof MuPDF, pdf: OpenedPdf, index: number) {
  try {
    return inkShare(renderPage(mupdf, pdf, index, INK_EDGE))
  } catch {
    return 1
  }
}

/**
 * The text found in one area of every page of a run, for splitting where it
 * changes. A page whose text cannot be read counts as having none there.
 */
export function areaTexts(
  pdf: OpenedPdf,
  area: Area,
  from: number,
  to: number
) {
  const sizes = pageSizes(pdf)
  const texts: string[] = []
  for (let index = from; index < to; index++)
    try {
      texts.push(textInArea(readPage(pdf, index).lines, sizes[index], area))
    } catch {
      texts.push("")
    }
  return texts
}

/**
 * A file whose double pages are cut into single ones: each page that is cut
 * appears twice, shown through one half of its sheet. Nothing is drawn again
 * or compressed again; the two halves share the page's content. Links and
 * notes go with the half they lie on.
 */
export async function halvePdf(
  mupdf: typeof MuPDF,
  pdf: OpenedPdf,
  choice: HalveChoice
): Promise<OpenedPdf> {
  const plan = halvedPages(pagesToHalve(pageSizes(pdf), choice))
  const areas = halfAreas(choice)
  const { facts } = pdf
  const written = await mergePages(
    mupdf,
    new Map([["file", { pdf, name: "" }]]),
    plan.map(({ page }) => ({ source: "file", index: page, rotation: 0 })),
    {
      bookmarks: "keep",
      forms: "keep",
      // Twice as many pages have no use for the numbers the file gave them.
      labels: "continuous",
      attachments: true,
      details: {
        title: facts.title,
        author: facts.author ?? "",
        subject: facts.subject ?? "",
        keywords: facts.keywords ?? "",
      },
      adjust: (out, pages) =>
        pages.forEach((page, index) => {
          const { half } = plan[index]
          if (half === null) return
          const box = areaToBox(boxOf(page), turnOf(page), areas[half])
          const stored = out.newArray()
          for (const side of box) stored.push(side)
          page.put("MediaBox", stored)
          page.put("CropBox", stored)
          // Narrower boxes that were set for the whole sheet no longer fit.
          for (const other of ["TrimBox", "BleedBox", "ArtBox"])
            page.delete(other)
          const notes = page.get("Annots")
          if (!notes.isArray()) return
          for (let at = notes.length - 1; at >= 0; at--) {
            const place = notes.get(at).get("Rect")
            if (!place.isArray() || place.length < 4) continue
            const [left, bottom, right, top] = [0, 1, 2, 3].map((side) =>
              place.get(side).asNumber()
            )
            const x = (left + right) / 2
            const y = (bottom + top) / 2
            // A link or note stays with the half its middle lies on.
            if (x < box[0] || x > box[2] || y < box[1] || y > box[3])
              notes.delete(at)
          }
        }),
    }
  )
  const halved = openPdf(mupdf, written.bytes)
  // What was true of the file is true of its halves.
  halved.facts = {
    ...halved.facts,
    repaired: facts.repaired,
    unlocked: facts.unlocked,
    restricted: facts.restricted,
    signed: facts.signed,
    tagged: facts.tagged,
  }
  return halved
}
