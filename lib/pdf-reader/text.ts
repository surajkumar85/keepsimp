/**
 * Four corners in page points, measured from the page's top left corner:
 * upper left, upper right, lower left, lower right, each as x then y.
 */
export type Quad = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

/** One line of a page's text, as the engine reads it. */
export interface TextLine {
  text: string
  /** The line's box, which may be turned. */
  quad: Quad
  /** The size of its letters, in points. */
  size: number
}

/** A link on a page that leads to another page of the same file. */
export interface PageLink {
  /** Left, top, right, bottom in page points. */
  rect: readonly [number, number, number, number]
  /** The page it opens, counted from 0. */
  page: number
}

export interface PageText {
  lines: TextLine[]
  links: PageLink[]
}

/** The box of a whole line, from the boxes of its first and last letters. */
export const lineQuad = (first: Quad, last: Quad): Quad => [
  first[0],
  first[1],
  last[2],
  last[3],
  first[4],
  first[5],
  last[6],
  last[7],
]

export interface Placement {
  /** Where the line's upper left corner sits, in page points. */
  left: number
  top: number
  /** How long the line runs and how tall it is, in page points. */
  length: number
  height: number
  /** Its turn about the upper left corner, in degrees, clockwise. */
  angle: number
}

/** Where to lay a line of text over the picture of its page. */
export function placeLine(line: TextLine): Placement {
  const [ulx, uly, urx, ury, llx, lly] = line.quad
  const angle = (Math.atan2(ury - uly, urx - ulx) * 180) / Math.PI
  return {
    left: ulx,
    top: uly,
    length: Math.hypot(urx - ulx, ury - uly),
    height: Math.hypot(llx - ulx, lly - uly),
    // Keep "-0" and rounding noise out of the page.
    angle: Math.abs(angle) < 0.01 ? 0 : Math.round(angle * 100) / 100,
  }
}

/**
 * How much to stretch a line sideways so that the browser's letters end
 * where the page's do. A line with no measurable width is left alone.
 */
export const stretch = (natural: number, wanted: number) =>
  natural > 0 && wanted > 0 ? Math.min(20, Math.max(0.05, wanted / natural)) : 1

/** The box around a quad, for a highlight: left, top, width, height in page points. */
export function quadBox(quad: Quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]]
  const ys = [quad[1], quad[3], quad[5], quad[7]]
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    left,
    top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

/** A page's text in reading order, a line to a line. */
export const plainText = (lines: readonly TextLine[]) =>
  lines
    .map((line) => line.text.trimEnd())
    .filter(Boolean)
    .join("\n")
