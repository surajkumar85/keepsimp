/**
 * The pictures a page already has: moved, made larger or smaller, turned,
 * cut to a part, exchanged for another, or taken out.
 *
 * A page draws a picture with one instruction in its content: the name of
 * the picture and "Do", after the page's measure has been set so that the
 * picture's unit square lands where the picture is to be. To change the
 * picture, that one instruction is written again: with another measure in
 * front of it, with a clip, with another name, or not at all. Nothing else
 * of the page's content is touched.
 *
 * This is the part that needs no engine: finding those instructions in a
 * page's content, what is written in their place, and where a picture is.
 */
import type { Box, Point } from "./geometry"
import { concat, inverse, type Matrix } from "./retext"

/** A part of a picture that shows, in the picture's own measure: from its left and from its bottom, each from 0 to 1. */
export type Part = [left: number, bottom: number, width: number, height: number]

/** A picture as a page's content draws it. */
export interface Drawn {
  /** The name the page knows the picture by, as the content writes it, without its stroke. */
  name: string
  /** Where the instruction that draws it starts in the content and where it ends, a clip that is ours before it included. */
  from: number
  to: number
  /** The page's measure when it is drawn: the picture's unit square goes through it. */
  ctm: Matrix
  /** The part of it that shows, when it was cut to one here. */
  part: Part | null
}

const SPACE = new Set([0, 9, 10, 12, 13, 32])
const isSpace = (code: number) => SPACE.has(code)
const DELIMITERS = "()<>[]{}/%"
const isBreak = (text: string, at: number) =>
  at >= text.length ||
  isSpace(text.charCodeAt(at)) ||
  DELIMITERS.includes(text[at])

/** A name as it is meant, without the way a content stream writes odd letters in it (#20 for a space). */
const nameOf = (written: string) =>
  written.replace(/#([0-9a-fA-F]{2})/g, (_all, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  )

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/**
 * The pictures a page's content draws, in the order it draws them. The
 * content is read as its bytes, a letter for each. Pictures that are drawn
 * inside something else the page draws, and pictures written into the
 * content itself, are not among them.
 * @param isPicture Whether a name the content draws is a picture's.
 */
export function picturesIn(
  content: string,
  isPicture: (name: string) => boolean
): Drawn[] {
  const found: Drawn[] = []
  /** What stands before the instruction that is being read: numbers and names, with where each starts. */
  let operands: { text: string; at: number }[] = []
  /** The instructions before this one, the nearest last: what they were and where their first operand started. */
  let recent: { op: string; at: number; numbers: number[] }[] = []
  const saved: Matrix[] = []
  let ctm: Matrix = IDENTITY
  let at = 0
  const { length } = content

  while (at < length) {
    const code = content.charCodeAt(at)
    if (isSpace(code)) {
      at++
      continue
    }
    const letter = content[at]
    if (letter === "%") {
      while (at < length && content[at] !== "\n" && content[at] !== "\r") at++
      continue
    }
    if (letter === "(") {
      // A string: brackets in it are counted, and a stroke takes the next letter with it.
      let depth = 0
      do {
        if (content[at] === "\\") at++
        else if (content[at] === "(") depth++
        else if (content[at] === ")") depth--
        at++
      } while (at < length && depth > 0)
      operands = []
      continue
    }
    if (letter === "<" && content[at + 1] !== "<") {
      while (at < length && content[at] !== ">") at++
      at++
      operands = []
      continue
    }
    if (letter === "<" || letter === ">") {
      at += 2
      operands = []
      continue
    }
    if ("[]{})".includes(letter)) {
      at++
      operands = []
      continue
    }
    const start = at
    at++
    while (!isBreak(content, at)) at++
    const text = content.slice(start, at)
    if (letter === "/" || /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) {
      operands.push({ text, at: start })
      continue
    }

    // An instruction.
    const numbers = operands.map((one) => Number(one.text))
    if (text === "q") saved.push(ctm)
    else if (text === "Q") ctm = saved.pop() ?? ctm
    else if (
      text === "cm" &&
      numbers.length >= 6 &&
      numbers.slice(-6).every(Number.isFinite)
    )
      ctm = concat(numbers.slice(-6) as Matrix, ctm)
    else if (text === "BI") {
      // A picture written into the content itself: its bytes are passed
      // over, to where "EI" stands alone behind them.
      const data = content.indexOf("ID", at)
      let end = data < 0 ? length : data + 2
      for (;;) {
        end = content.indexOf("EI", end + 1)
        if (end < 0) {
          end = length
          break
        }
        if (isSpace(content.charCodeAt(end - 1)) && isBreak(content, end + 2)) {
          end += 2
          break
        }
      }
      at = end
    } else if (text === "Do") {
      const drawn = operands[operands.length - 1]
      const name = drawn?.text.startsWith("/")
        ? nameOf(drawn.text.slice(1))
        : ""
      if (name && isPicture(name)) {
        // A clip of ours stands right before it: a box, "W", "n".
        const [box, clip, end] = recent.slice(-3)
        const cut =
          recent.length >= 3 &&
          box.op === "re" &&
          box.numbers.length === 4 &&
          clip.op === "W" &&
          end.op === "n" &&
          operands.length === 1
        found.push({
          name,
          from: cut ? box.at : drawn.at,
          to: at,
          ctm,
          part: cut ? (box.numbers as Part) : null,
        })
      }
    }
    recent = [
      ...recent.slice(-2),
      { op: text, at: operands[0]?.at ?? start, numbers },
    ]
    operands = []
  }
  return found
}

/** A number as a page's content writes it: no more figures than matter, and never in the form of 1e-7. */
const number = (value: number) =>
  String(Math.round(value * 100_000) / 100_000 || 0)

/** A name as a content stream writes it: anything but plain letters and figures by its number. */
const written = (name: string) =>
  name.replace(
    /[^A-Za-z0-9_.+-]/g,
    (letter) => `#${letter.charCodeAt(0).toString(16).padStart(2, "0")}`
  )

/**
 * What is written into a page's content to draw a picture: its name and
 * "Do", with whatever is to stand before it. Anything before it is closed
 * off (`q … Q`) so that it holds for this picture alone.
 * @param lead Measures the page's own is to go through first, the nearest to the picture last.
 * @param part The part of the picture that is to show.
 */
export function drawing(
  name: string,
  lead: readonly Matrix[] = [],
  part: Part | null = null
) {
  const draw = `/${written(name)} Do`
  if (!lead.length && !part) return draw
  return [
    "q",
    ...lead.map((matrix) => `${matrix.map(number).join(" ")} cm`),
    ...(part ? [`${part.map(number).join(" ")} re W n`] : []),
    draw,
    "Q",
  ].join(" ")
}

/** Where a point of a picture's own measure is on the page. */
const through = (matrix: Matrix, x: number, y: number): Point => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
})

/** The box a picture, or the part of it that shows, takes up on the page. */
export function boxOf(matrix: Matrix, part: Part | null = null): Box {
  const [left, bottom, width, height] = part ?? [0, 0, 1, 1]
  const corners = [
    through(matrix, left, bottom),
    through(matrix, left + width, bottom),
    through(matrix, left, bottom + height),
    through(matrix, left + width, bottom + height),
  ]
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/**
 * Whether a picture stands upright on the page as it is shown, neither
 * turned nor mirrored: its left is on the left and its top at the top.
 * (The page is shown with y running down, and a picture's own measure has
 * its bottom at 0.)
 */
export function isUpright(matrix: Matrix) {
  const [a, b, c, d] = matrix
  const size = Math.max(Math.abs(a), Math.abs(d), 1e-9)
  return (
    a > 0 && d < 0 && Math.abs(b) < size * 0.001 && Math.abs(c) < size * 0.001
  )
}

/** Whether two places of a picture are the same place, to within what reading and writing lose. */
export function sameMatrix(one: Matrix, two: Matrix) {
  const size = Math.max(...one.slice(0, 4).map(Math.abs), 1)
  return one.every(
    (value, at) => Math.abs(value - two[at]) <= (at < 4 ? size * 0.002 : 0.5)
  )
}

/** A move of everything on the page as it is shown, by so many points. */
export const moved = (by: Point): Matrix => [1, 0, 0, 1, by.x, by.y]

/** Everything larger or smaller about a point that stays where it is. */
export const scaledAbout = (centre: Point, by: number): Matrix => [
  by,
  0,
  0,
  by,
  centre.x * (1 - by),
  centre.y * (1 - by),
]

/** Everything turned by quarters of a full turn, clockwise as the page is shown, about a point that stays where it is. */
export function turnedAbout(centre: Point, quarters: number): Matrix {
  const turn = ((Math.round(quarters) % 4) + 4) % 4
  const [cos, sin] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ][turn]
  return [
    cos,
    sin,
    -sin,
    cos,
    centre.x - cos * centre.x + sin * centre.y,
    centre.y - sin * centre.x - cos * centre.y,
  ]
}

/**
 * The measure that is written before a picture to put it somewhere else:
 * what its unit square goes through first, so that it ends where it would
 * if everything on the page were moved by `by` after it was drawn.
 * @param at Where the picture is, as the page is shown.
 */
export const leadFor = (at: Matrix, by: Matrix): Matrix =>
  concat(concat(at, by), inverse(at))

/** How much of what shows of a picture is to be cut away at each side, each from 0 to 1. */
export interface Cut {
  left: number
  top: number
  right: number
  bottom: number
}

/** The least of a picture that is left showing, across and down. */
export const LEAST_PART = 0.02

/** The part of a picture that shows after some of what shows now is cut away at its sides. */
export function cutPart(part: Part | null, cut: Cut): Part {
  const [left, bottom, width, height] = part ?? [0, 0, 1, 1]
  const across = Math.max(LEAST_PART, 1 - cut.left - cut.right)
  const down = Math.max(LEAST_PART, 1 - cut.top - cut.bottom)
  return [
    left + width * Math.min(cut.left, 1 - across),
    bottom + height * Math.min(cut.bottom, 1 - down),
    width * across,
    height * down,
  ]
}

/**
 * The measure that sets another picture into the place of one, whole and
 * undistorted: as large as fits where the old one showed, in its middle.
 * @param shown How wide and high the old picture shows on the page.
 * @param size How wide and high the new picture is, in its own dots.
 */
export function fitInto(
  shown: { width: number; height: number },
  size: {
    width: number
    height: number
  }
): Matrix {
  const old = shown.width / Math.max(shown.height, 1e-9)
  const next = size.width / Math.max(size.height, 1e-9)
  const across = Math.min(1, next / old)
  const down = Math.min(1, old / next)
  return [across, 0, 0, down, (1 - across) / 2, (1 - down) / 2]
}

/** A picture of a page as the editor offers it. */
export interface PagePicture {
  /** Which of the pictures the page draws it is, from 0 in the order they are drawn. */
  index: number
  /** Where it is: what its unit square goes through, as the page is shown. */
  at: Matrix
  /** The box that what shows of it takes up on the page, in points as the page is shown. */
  box: Box
  /** It stands upright, and can be cut to a part. */
  upright: boolean
  /** Only a part of it shows. */
  cut: boolean
  /** How many dots it has across and down. */
  width: number
  height: number
}

/**
 * Change a picture of a page: one of putting it somewhere else, cutting it
 * to a part or showing it whole again, another picture in its place, or
 * taking it out.
 */
export interface PictureOp {
  do: "picture"
  page: number
  index: number
  /** Where it is, to be sure of changing the picture that was meant. */
  at: Matrix
  /** Its new place: what everything goes through after it is where it was, as the page is shown. */
  by?: Matrix
  /** How much of what shows is cut away at each side; null to show the whole picture again. */
  cut?: Cut | null
  /** Another picture in its place, by the name it was handed over under. */
  picture?: string
  remove?: true
}

export interface PictureChange {
  label: string
  ops: PictureOp[]
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/** The furthest a place is from the page's corner, and the largest a measure is. */
const FURTHEST = 100_000

function readMatrix(value: unknown): Matrix | null {
  if (!Array.isArray(value) || value.length !== 6) return null
  if (!value.every((one) => isNumber(one) && Math.abs(one) <= FURTHEST))
    return null
  const [a, b, c, d] = value as number[]
  // A measure that flattens everything onto a line is no place for a picture.
  if (Math.abs(a * d - b * c) < 1e-9) return null
  return value.slice() as Matrix
}

function readCut(value: unknown): Cut | null {
  if (typeof value !== "object" || value === null) return null
  const { left, top, right, bottom } = value as Record<string, unknown>
  const sides = [left, top, right, bottom]
  if (!sides.every((side) => isNumber(side) && side >= 0 && side < 1))
    return null
  const cut = sides as number[]
  if (cut[0] + cut[2] >= 1 || cut[1] + cut[3] >= 1 || !cut.some(Boolean))
    return null
  return { left: cut[0], top: cut[1], right: cut[2], bottom: cut[3] }
}

/** A change to a picture as it arrives from the page or from a draft, or null when it is not one. */
export function readPictureOp(value: unknown): PictureOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  const at = readMatrix(op.at)
  if (
    op.do !== "picture" ||
    !Number.isInteger(op.page) ||
    (op.page as number) < 0 ||
    !Number.isInteger(op.index) ||
    (op.index as number) < 0 ||
    !at
  )
    return null
  const base = {
    do: "picture" as const,
    page: op.page as number,
    index: op.index as number,
    at,
  }
  // One thing at a time, the first that is said.
  if (op.remove === true) return { ...base, remove: true }
  if (op.by !== undefined) {
    const by = readMatrix(op.by)
    return by ? { ...base, by } : null
  }
  if (op.cut === null) return { ...base, cut: null }
  if (op.cut !== undefined) {
    const cut = readCut(op.cut)
    return cut ? { ...base, cut } : null
  }
  if (typeof op.picture === "string" && op.picture && op.picture.length <= 64)
    return { ...base, picture: op.picture }
  return null
}
