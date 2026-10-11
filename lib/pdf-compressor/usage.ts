/**
 * How large a picture is drawn on its pages. A picture has more pixels than
 * it needs when it is drawn small; how small is read from the matrix it is
 * drawn with.
 */
import type { Size } from "@/lib/image-compressor/geometry"

/** The matrix a picture is drawn with: its unit square, placed on the page in points. */
export type DrawMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
]

const POINTS_PER_INCH = 72
/** A picture drawn smaller than this, in points, tells nothing about the size it needs. */
const TOO_SMALL_TO_JUDGE = 1

/** The width and height, in points, of a picture drawn with `matrix`, however it is turned or skewed. */
export function drawnSize(matrix: DrawMatrix): Size {
  const [a, b, c, d] = matrix
  return { width: Math.hypot(a, b), height: Math.hypot(c, d) }
}

/** The larger of two drawn sizes, side by side: a picture must serve its largest use. */
export function largest(known: Size | undefined, next: Size): Size {
  if (!known) return next
  return {
    width: Math.max(known.width, next.width),
    height: Math.max(known.height, next.height),
  }
}

/**
 * Pixels per inch of a picture at the size it is drawn, along its less
 * detailed side. Null when it is drawn too small to judge.
 */
export function resolution(pixels: Size, drawn: Size) {
  if (drawn.width < TOO_SMALL_TO_JUDGE || drawn.height < TOO_SMALL_TO_JUDGE)
    return null
  return Math.min(
    (pixels.width * POINTS_PER_INCH) / drawn.width,
    (pixels.height * POINTS_PER_INCH) / drawn.height
  )
}

/** Where nothing may change, a picture with more pixels per inch than this, where it is drawn, is not given a palette. */
export const PALETTE_DPI = 150

/**
 * Whether a picture may be stored with a palette in place of its colours.
 * The pixels are the same either way, but a viewer built on MuPDF draws a
 * palette picture differently once it is shown at half its size or less:
 * it picks single pixels where it would blend several, and edges turn
 * rough. Up to 150 dpi a picture is shown above half its size on any
 * ordinary screen, so only those are changed. Measured on a 500 dpi figure:
 * no difference down to 53% of its size, and visible ones from 47%.
 */
export function paletteSuits(pixels: Size, drawn: Size | null) {
  if (!drawn) return false
  const dpi = resolution(pixels, drawn)
  // Two pixels an inch of room, for a size that was rounded to whole pixels.
  return dpi !== null && dpi < PALETTE_DPI + 2
}

/**
 * The size a picture should be brought down to so that it has `dpi` pixels
 * per inch where it is drawn largest. Null when it is not worth doing: the
 * picture is at most `slack` times over, or nothing is known of its use.
 */
export function sizeFor(
  pixels: Size,
  drawn: Size | null,
  dpi: number,
  slack: number
): Size | null {
  if (!drawn) return null
  const has = resolution(pixels, drawn)
  if (has === null || has <= dpi * slack) return null
  const scale = dpi / has
  return {
    width: Math.max(1, Math.round(pixels.width * scale)),
    height: Math.max(1, Math.round(pixels.height * scale)),
  }
}
