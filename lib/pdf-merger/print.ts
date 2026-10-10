import type { Size } from "@/lib/image-compressor/geometry"

/** One size for every page: each page's own, a sheet, the first page's or the largest page's. */
export type SheetChoice = "keep" | "a4" | "letter" | "first" | "largest"
export type NumberStyle = "none" | "number" | "of"
export type FooterPlace = "left" | "centre" | "right"

export const sheets: Record<"a4" | "letter", Size> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
}

/** A page's box as the file stores it: left, bottom, right, top. */
export type Box = [number, number, number, number]
/** The six numbers of a PDF "cm" matrix. */
export type Matrix = [number, number, number, number, number, number]

const round = (value: number) => Math.round(value * 1000) / 1000
/** A turn as 0, 90, 180 or 270, whatever multiple of 90 the file wrote. */
export const quarter = (degrees: number) => ((degrees % 360) + 360) % 360

/** The size a page is shown at, once its turn is applied. */
export function shownSize(box: Box, turn: number): Size {
  const size = {
    width: Math.abs(box[2] - box[0]),
    height: Math.abs(box[3] - box[1]),
  }
  return quarter(turn) % 180 === 90
    ? { width: size.height, height: size.width }
    : size
}

/**
 * The sheet every page should become: the one chosen, or the first or the
 * largest of the pages as they are shown. Null leaves pages as they are.
 */
export function targetSheet(
  choice: SheetChoice,
  pages: readonly Size[]
): Size | null {
  if (choice === "keep" || !pages.length) return null
  if (choice === "a4" || choice === "letter") return sheets[choice]
  if (choice === "first") return pages[0]
  return pages.reduce((largest, page) =>
    page.width * page.height > largest.width * largest.height ? page : largest
  )
}

/**
 * Fit a page onto a sheet. The sheet is turned to suit the page, so an
 * upright sheet does not shrink a page that lies on its side.
 * @param enlarge Whether a page smaller than the sheet is made larger.
 * @returns The page's new box, the matrix that moves its content there, and the scale; null when the page already fits exactly.
 */
export function fitToSheet(
  box: Box,
  turn: number,
  sheet: Size,
  enlarge: boolean
): { box: Box; matrix: Matrix; scale: number } | null {
  const shown = shownSize(box, turn)
  const [short, long] = [
    Math.min(sheet.width, sheet.height),
    Math.max(sheet.width, sheet.height),
  ]
  const target =
    shown.width > shown.height
      ? { width: long, height: short }
      : { width: short, height: long }
  if (
    Math.abs(target.width - shown.width) < 0.5 &&
    Math.abs(target.height - shown.height) < 0.5
  )
    return null
  let scale = Math.min(target.width / shown.width, target.height / shown.height)
  if (!enlarge) scale = Math.min(1, scale)
  // The box is stored before the turn, so a page on its side gets a sheet on its side.
  const sideways = quarter(turn) % 180 === 90
  const width = sideways ? target.height : target.width
  const height = sideways ? target.width : target.height
  const own = {
    width: Math.abs(box[2] - box[0]),
    height: Math.abs(box[3] - box[1]),
  }
  const left = Math.min(box[0], box[2])
  const bottom = Math.min(box[1], box[3])
  return {
    box: [0, 0, round(width), round(height)],
    matrix: [
      round(scale),
      0,
      0,
      round(scale),
      round((width - own.width * scale) / 2 - left * scale),
      round((height - own.height * scale) / 2 - bottom * scale),
    ],
    scale,
  }
}

/** Where a point lands under a matrix. */
export function applyMatrix(matrix: Matrix, x: number, y: number) {
  return [
    round(matrix[0] * x + matrix[2] * y + matrix[4]),
    round(matrix[1] * x + matrix[3] * y + matrix[5]),
  ] as const
}

/**
 * The matrix for drawing on a page as it is seen: with it, (0, 0) is the
 * bottom-left corner the reader sees and x runs to their right, whatever
 * turn the page has and wherever its box starts.
 */
export function visualMatrix(box: Box, turn: number): Matrix {
  const left = Math.min(box[0], box[2])
  const right = Math.max(box[0], box[2])
  const bottom = Math.min(box[1], box[3])
  const top = Math.max(box[1], box[3])
  switch (quarter(turn)) {
    case 90:
      return [0, 1, -1, 0, right, bottom]
    case 180:
      return [-1, 0, 0, -1, right, top]
    case 270:
      return [0, -1, 1, 0, left, top]
    default:
      return [1, 0, 0, 1, left, bottom]
  }
}

/** The page number to print: "3", or "3 of 12". */
export function numberText(
  style: NumberStyle,
  index: number,
  total: number,
  from: number
) {
  if (style === "none") return ""
  const number = index + from
  return style === "of" ? `${number} of ${total + from - 1}` : String(number)
}

export const FOOTER_SIZE = 9
/** How far the footer's text sits above the bottom edge. */
const FOOTER_RISE = 20
const FOOTER_SIDE = 28

export interface FooterText {
  text: string
  x: number
  y: number
}

/**
 * Where a footer's texts go on a page as it is seen: the page number in the
 * place chosen, and the file name at the left, or at the right when the
 * number has the left. A name too long for its share of the line is shortened.
 * @param measure The width of some text at the footer's size.
 */
export function footerLayout(
  page: Size,
  name: string,
  number: string,
  place: FooterPlace,
  measure: (text: string) => number
): FooterText[] {
  const texts: FooterText[] = []
  const side = Math.min(FOOTER_SIDE, page.width / 10)
  const y = Math.min(FOOTER_RISE, page.height / 12)
  const at = (text: string, where: FooterPlace) =>
    where === "left"
      ? side
      : where === "right"
        ? page.width - side - measure(text)
        : (page.width - measure(text)) / 2
  if (number) texts.push({ text: number, x: round(at(number, place)), y })
  if (name) {
    // The name may take the width up to the middle, or all of it when it stands alone.
    const room = (number ? page.width / 2 : page.width - side) - side - 8
    let shown = name
    if (measure(shown) > room) {
      const letters = [...name]
      while (letters.length > 1 && measure(`${letters.join("")}…`) > room)
        letters.pop()
      shown = `${letters.join("")}…`
    }
    texts.push({
      text: shown,
      x: round(at(shown, place === "left" && number ? "right" : "left")),
      y,
    })
  }
  return texts
}
