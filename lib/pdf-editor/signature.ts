/**
 * Signatures and the small marks of paper forms. A signature is drawn,
 * typed in a font that looks written by hand, or taken from a picture of
 * one; a paper form is ticked, crossed and dotted. All of them are placed
 * on a page as the kinds of thing the editor already has: a drawing, a
 * text box or a picture.
 *
 * A signature made here shows that a page was signed, as ink on paper
 * does. It is not a certificate signature, which proves who signed and
 * that nothing changed since.
 */
import { boundsOf, type Box, type Point } from "./geometry"
import {
  HAND_FAMILIES,
  LINE_HEIGHT,
  MOST_POINTS,
  type Colour,
  type HandFamily,
  type InkObject,
  type TextObject,
} from "./objects"

/** Which of a person's two marks it is: the whole name, or the letters it begins with. */
export type SignatureSlot = "signature" | "initials"

/** A signature before it is placed: how it was made, without where it goes. */
export type Signature =
  | { kind: "draw"; strokes: Point[][] }
  | { kind: "type"; text: string; font: HandFamily }
  /** A picture with the paper taken out, as the address of a PNG. */
  | { kind: "picture"; data: string; width: number; height: number }

/** How wide each is placed, in points, and how tall at most. */
export const SIGNATURE_SIZE: Record<
  SignatureSlot,
  { width: number; height: number }
> = {
  signature: { width: 170, height: 64 },
  initials: { width: 64, height: 44 },
}
/** How thick the pen of a drawn signature is, and how large a typed one's letters are. */
export const SIGNATURE_PEN = 1.6
export const SIGNATURE_TEXT: Record<SignatureSlot, number> = {
  signature: 30,
  initials: 24,
}
/** The longest a typed signature may be, and the largest picture of one that is remembered, as letters of its address. */
export const LONGEST_SIGNATURE = 80
export const LARGEST_REMEMBERED = 400_000

/**
 * Strokes moved and scaled to fit inside a box, in proportion and in its
 * middle. Strokes with no size (a single dot) are put in the middle as they are.
 */
export function fitStrokes(strokes: readonly Point[][], box: Box): Point[][] {
  const all = strokes.flat()
  if (!all.length) return []
  const was = boundsOf(all)
  const scale = Math.min(
    was.width > 0 ? box.width / was.width : Infinity,
    was.height > 0 ? box.height / was.height : Infinity
  )
  const by = Number.isFinite(scale) ? scale : 1
  const left = box.x + (box.width - was.width * by) / 2
  const top = box.y + (box.height - was.height * by) / 2
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: left + (point.x - was.x) * by,
      y: top + (point.y - was.y) * by,
    }))
  )
}

/** A drawn signature as a drawing on a page, about a point. */
export function drawnSignature(
  strokes: readonly Point[][],
  slot: SignatureSlot,
  centre: Point,
  colour: Colour,
  id: string
): InkObject {
  const size = SIGNATURE_SIZE[slot]
  const fitted = fitStrokes(strokes, {
    x: centre.x - size.width / 2,
    y: centre.y - size.height / 2,
    ...size,
  })
  return {
    id,
    kind: "ink",
    rotation: 0,
    opacity: 1,
    box: boundsOf(fitted.flat()),
    strokes: fitted,
    stroke: colour,
    weight: SIGNATURE_PEN,
  }
}

/**
 * A typed signature as a text box on a page, about a point: one line, as
 * wide as its letters.
 * @param width How wide the words are in the font, at the size they are set in.
 */
export function typedSignature(
  text: string,
  font: HandFamily,
  slot: SignatureSlot,
  centre: Point,
  colour: Colour,
  id: string,
  width: number
): TextObject {
  const size = SIGNATURE_TEXT[slot]
  const words = text.trim().slice(0, LONGEST_SIGNATURE)
  // A little room, so that the last letter's flourish is not broken onto a second line.
  const wide = Math.max(20, width + size * 0.4)
  const height = size * LINE_HEIGHT
  return {
    id,
    kind: "text",
    rotation: 0,
    opacity: 1,
    box: {
      x: centre.x - wide / 2,
      y: centre.y - height / 2,
      width: wide,
      height,
    },
    text: words,
    lines: [words],
    font,
    bold: false,
    italic: false,
    size,
    colour,
    align: "left",
  }
}

/** The marks a paper form is filled with. */
export const CHECK_SHAPES = ["tick", "cross", "dot"] as const
export type CheckShape = (typeof CHECK_SHAPES)[number]
export const CHECK_NAMES: Record<CheckShape, string> = {
  tick: "tick",
  cross: "cross",
  dot: "dot",
}
/** How large a mark is when it is placed, in points. */
export const CHECK_SIZE = 12

/** Points along a straight way, close enough together that a smoothed line through them stays straight. */
function straight(from: Point, to: Point, steps = 6): Point[] {
  return Array.from({ length: steps + 1 }, (_, at) => ({
    x: from.x + ((to.x - from.x) * at) / steps,
    y: from.y + ((to.y - from.y) * at) / steps,
  }))
}

/** A tick, a cross or a dot as a drawing, about a point. */
export function checkMark(
  shape: CheckShape,
  centre: Point,
  colour: Colour,
  id: string,
  size = CHECK_SIZE
): InkObject {
  const half = size / 2
  const at = (x: number, y: number): Point => ({
    x: centre.x + (x - 0.5) * size,
    y: centre.y + (y - 0.5) * size,
  })
  const strokes =
    shape === "dot"
      ? [[{ ...centre }]]
      : shape === "cross"
        ? [straight(at(0, 0), at(1, 1)), straight(at(1, 0), at(0, 1))]
        : [
            [
              ...straight(at(0, 0.55), at(0.36, 0.95)),
              ...straight(at(0.36, 0.95), at(1, 0.05)).slice(1),
            ],
          ]
  return {
    id,
    kind: "ink",
    rotation: 0,
    opacity: 1,
    box:
      shape === "dot"
        ? { x: centre.x, y: centre.y, width: 0, height: 0 }
        : boundsOf(strokes.flat()),
    strokes,
    stroke: colour,
    // A dot is as wide as its pen; a tick and a cross are drawn with a pen in proportion.
    weight: shape === "dot" ? half : Math.max(1, size / 8),
  }
}

/** A picture as its pixels: red, green, blue and how solid, a byte each. */
export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

const brightness = (data: Uint8ClampedArray, at: number) =>
  0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2]

/**
 * A picture of a signature with the paper taken out: what is as bright as
 * the paper becomes see-through, what is as dark as the ink stays solid,
 * and the shades between are see-through in proportion, so that the edges
 * of the strokes stay smooth. The ink keeps its own colour.
 *
 * The paper is taken to be the bright end of the picture and the ink the
 * dark end; a picture with no difference between them comes back empty.
 */
export function inkOnly(picture: Pixels): Pixels {
  const { data, width, height } = picture
  const count = width * height
  // How often each brightness occurs, to find the paper and the ink.
  const tally = new Uint32Array(256)
  for (let at = 0; at < count; at++)
    tally[Math.round(brightness(data, at * 4))]++
  /** The brightness that a share of the picture is no brighter than. */
  const level = (share: number) => {
    let value = 0
    for (let seen = tally[0]; seen < count * share && value < 255;)
      seen += tally[++value]
    return value
  }
  // Most of a picture of a signature is paper.
  const paper = level(0.6)
  const ink = level(0.01)
  const out = new Uint8ClampedArray(data.length)
  const range = paper - ink
  if (range < 24) return { data: out, width, height }
  for (let at = 0; at < count; at++) {
    const from = at * 4
    // A margin under the paper's own brightness, so that its grain does not show.
    const dark = (paper - range * 0.15 - brightness(data, from)) / (range * 0.6)
    const solid = Math.min(1, Math.max(0, dark)) * (data[from + 3] / 255)
    if (solid < 0.08) continue
    out[from] = data[from]
    out[from + 1] = data[from + 1]
    out[from + 2] = data[from + 2]
    out[from + 3] = Math.round(solid * 255)
  }
  return { data: out, width, height }
}

/** The smallest box that holds everything of a picture that can be seen; null when nothing can. */
export function seenBox(picture: Pixels): Box | null {
  const { data, width, height } = picture
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/**
 * A signature read back from where the browser kept it, or null when what
 * is there is not one. What was kept is not taken on trust any more than a
 * file is.
 */
export function readSignature(value: unknown): Signature | null {
  if (typeof value !== "object" || value === null) return null
  const data = value as Record<string, unknown>
  if (data.kind === "type") {
    const text = typeof data.text === "string" ? data.text.trim() : ""
    return text &&
      text.length <= LONGEST_SIGNATURE &&
      HAND_FAMILIES.includes(data.font as HandFamily)
      ? { kind: "type", text, font: data.font as HandFamily }
      : null
  }
  if (data.kind === "picture")
    return typeof data.data === "string" &&
      data.data.startsWith("data:image/png;base64,") &&
      data.data.length <= LARGEST_REMEMBERED &&
      isNumber(data.width) &&
      isNumber(data.height) &&
      data.width > 0 &&
      data.height > 0
      ? {
          kind: "picture",
          data: data.data,
          width: data.width,
          height: data.height,
        }
      : null
  if (data.kind === "draw" && Array.isArray(data.strokes)) {
    const strokes: Point[][] = []
    let points = 0
    for (const stroke of data.strokes) {
      if (!Array.isArray(stroke)) return null
      const read: Point[] = []
      for (const point of stroke) {
        if (
          typeof point !== "object" ||
          point === null ||
          !isNumber((point as Point).x) ||
          !isNumber((point as Point).y)
        )
          return null
        read.push({ x: (point as Point).x, y: (point as Point).y })
      }
      points += read.length
      if (points > MOST_POINTS) return null
      if (read.length) strokes.push(read)
    }
    return strokes.length ? { kind: "draw", strokes } : null
  }
  return null
}
