/**
 * Reading chosen pages one after another and gathering what was found, as
 * one step to lay on them. The editor's OCR panel and the agent tool both
 * run this, each with its own Tesseract (`tesseract.ts`) and its own way of
 * being stopped; the words go into the file only through `editOcr`.
 */
import type { OcrPicture } from "./mupdf-ocr"
import {
  readingOf,
  type OcrOp,
  type OcrTally,
  type TesseractBlock,
} from "./ocr"

export interface OcrRunHooks {
  /** The page drawn in grey to be read; null when it could not be drawn. */
  picture(page: number): Promise<OcrPicture | null>
  /** What Tesseract read on it; null when the run was stopped. Throws when Tesseract failed on the page. */
  read(png: Uint8Array): Promise<TesseractBlock[] | null>
  /** Whether Stop was asked for. */
  stopped(): boolean
  /** Told before each page: how many are done, of how many, and which page is next. */
  onPage(done: number, total: number, page: number): void
}

/** Reads the pages, in the order given; pages that have text already are left unless `alsoText`. */
export async function readPages(
  pages: readonly number[],
  alsoText: boolean,
  hooks: OcrRunHooks
): Promise<{ ops: OcrOp[]; tally: Omit<OcrTally, "stopped"> }> {
  const ops: OcrOp[] = []
  const tally = {
    read: [] as number[],
    words: 0,
    unsure: 0,
    hadText: [] as number[],
    blank: [] as number[],
    failed: [] as number[],
  }
  let sure = 0
  for (const [done, page] of pages.entries()) {
    if (hooks.stopped()) break
    hooks.onPage(done, pages.length, page)
    const picture = await hooks.picture(page)
    if (hooks.stopped()) break
    if (!picture) {
      tally.failed.push(page)
      continue
    }
    if (picture.letters > 0 && !alsoText) {
      tally.hadText.push(page)
      continue
    }
    let blocks: TesseractBlock[] | null
    try {
      blocks = await hooks.read(picture.png)
    } catch {
      // Stopping lets Tesseract go in the middle of a page.
      if (hooks.stopped()) break
      tally.failed.push(page)
      continue
    }
    if (!blocks) break
    const reading = readingOf(blocks, picture.scale)
    if (!reading.words) {
      tally.blank.push(page)
      continue
    }
    ops.push({ page, lines: reading.lines })
    tally.read.push(page)
    tally.words += reading.words
    tally.unsure += reading.unsure
    sure += reading.confidence * reading.words
  }
  return {
    ops,
    tally: {
      ...tally,
      confidence: tally.words ? Math.round(sure / tally.words) : 0,
    },
  }
}

/** The step's name, as the editor's list of changes shows it. */
export const ocrLabel = (ops: readonly OcrOp[]) =>
  ops.length === 1
    ? `Recognise text on page ${ops[0].page + 1}`
    : `Recognise text on ${ops.length.toLocaleString("en")} pages`
