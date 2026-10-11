import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Part } from "./parts"

/**
 * How easily a page counts as blank.
 * - strict: nothing on it at all
 * - normal: nothing but specks, such as dust on a scanner's glass, or a page number
 * - loose: also punch holes, a running header, or a short line such as "left blank"
 */
export type Sensitivity = "strict" | "normal" | "loose"

/**
 * The share of a page that may hold marks for it still to count as blank.
 * Measured on A4 pages: a speck is 0.003%, a page number 0.01%, a punch hole
 * 0.07%, a short line of small print 0.13%, and one full line of text 0.22%,
 * which no setting takes for blank.
 */
export const BLANK_BELOW: Record<Sensitivity, number> = {
  strict: 0.00002,
  normal: 0.0003,
  loose: 0.0018,
}

/** How far from the paper's own brightness, of 255, a spot must be to count as a mark. */
const MARK = 48
/** The edge of a page is left out: scans have shadows and dark borders there. */
const EDGE = 0.04

/**
 * The share of a page that holds marks, from a small picture of it. The
 * paper's brightness is taken to be the commonest one, so cream paper and
 * the grain of a scan do not count as marks.
 */
export function inkShare(pixels: Pixels) {
  const { data, width, height } = pixels
  const left = Math.floor(width * EDGE)
  const top = Math.floor(height * EDGE)
  const right = width - left
  const bottom = height - top
  const area = (right - left) * (bottom - top)
  if (area <= 0) return 0
  const tally = new Uint32Array(256)
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const at = (y * width + x) * 4
      tally[
        Math.round(
          (data[at] * 299 + data[at + 1] * 587 + data[at + 2] * 114) / 1000
        )
      ]++
    }
  // The commonest brightness, counted with its near neighbours so that grain does not split the vote.
  let paper = 0
  let most = -1
  for (let level = 0; level < 256; level++) {
    let votes = 0
    for (
      let near = Math.max(0, level - 4);
      near <= Math.min(255, level + 4);
      near++
    )
      votes += tally[near]
    if (votes > most) {
      most = votes
      paper = level
    }
  }
  let marks = 0
  for (let level = 0; level < 256; level++)
    if (Math.abs(level - paper) > MARK) marks += tally[level]
  return marks / area
}

/** The pages that count as blank, counted from 0, given each page's share of marks. */
export const blankPages = (
  shares: readonly number[],
  sensitivity: Sensitivity
) =>
  shares.flatMap((share, page) =>
    share < BLANK_BELOW[sensitivity] ? [page] : []
  )

/**
 * The pages treated as blank: those found to be, with any page turned round
 * by hand, so a page found blank can be kept and any page can be called blank.
 */
export function blanksOf(
  shares: readonly number[],
  sensitivity: Sensitivity,
  flipped: ReadonlySet<number>
) {
  const blanks = new Set(blankPages(shares, sensitivity))
  for (const page of flipped)
    if (!blanks.delete(page) && page >= 0 && page < shares.length)
      blanks.add(page)
  return blanks
}

/**
 * What blank pages do to a file.
 * - drop: the file is cut at them and they are left out
 * - keep: the file is cut after them and they stay at the end of their part
 * - remove: they are left out and the rest stays one file
 */
export type BlankChoice = "drop" | "keep" | "remove"

/** The parts a file falls into at its blank pages. Blank pages side by side count as one place. */
export function partsAtBlanks(
  count: number,
  blanks: ReadonlySet<number>,
  how: BlankChoice
): Part[] {
  const parts: Part[] = []
  let pages: number[] = []
  const close = () => {
    if (pages.length) parts.push({ pages })
    pages = []
  }
  for (let page = 0; page < count; page++) {
    const blank = blanks.has(page)
    if (blank && how !== "keep") {
      if (how === "drop") close()
      continue
    }
    pages.push(page)
    // A run of blank pages ends a part when the next page is not blank.
    if (blank && !blanks.has(page + 1)) close()
  }
  close()
  return parts
}
