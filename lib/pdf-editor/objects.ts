/**
 * The things a person adds to a page: what each is, and how it changes when
 * it is moved, pulled, turned or restyled. Nothing here knows about the
 * engine or the screen.
 */
import {
  boundsOf,
  centreOf,
  handlePoint,
  pullHandle,
  SMALLEST,
  turnAbout,
  turnedBounds,
  wholeTurn,
  type Box,
  type Handle,
  type Point,
} from "./geometry"
import {
  LARGEST_SCALE,
  lengthOf,
  measured,
  MEASURE_ROOM,
  MEASURE_TEXT,
  MEASURE_UNITS,
  SMALLEST_SCALE,
  type MeasureUnit,
} from "./measure"

/** Red, green and blue, each from 0 to 1. */
export type Colour = readonly [number, number, number]

export const BLACK: Colour = [0, 0, 0]
export const WHITE: Colour = [1, 1, 1]

/** Fonts that look written by hand, for signatures. Each has one style: there is no bold or italic of them. */
export const HAND_FAMILIES = [
  "greatvibes",
  "sacramento",
  "kalam",
  "aurore",
] as const
export type HandFamily = (typeof HAND_FAMILIES)[number]
export type FontFamily = "sans" | "serif" | "mono" | HandFamily
export const FONT_FAMILIES: readonly FontFamily[] = [
  "sans",
  "serif",
  "mono",
  ...HAND_FAMILIES,
]
export const isHand = (font: FontFamily): font is HandFamily =>
  (HAND_FAMILIES as readonly string[]).includes(font)
export type TextAlign = "left" | "centre" | "right"

interface Base {
  /** Its own name on its page; never shown. */
  id: string
  /** Where it is before its turn. */
  box: Box
  /** Its turn about its centre, clockwise, in degrees. */
  rotation: number
  /** From 0 (not there) to 1 (solid). */
  opacity: number
}

export interface TextObject extends Base {
  kind: "text"
  text: string
  /** The text as it is broken into lines for the box's width. */
  lines: string[]
  font: FontFamily
  bold: boolean
  italic: boolean
  /** In points. */
  size: number
  colour: Colour
  align: TextAlign
  /**
   * What a call-out points at. With it, the box has a frame round it and a
   * line from the frame to this point; the point stays where it is when the
   * box is moved.
   */
  tip?: Point
}

export interface PictureObject extends Base {
  kind: "picture"
  /** Which picture, by the name the worker gave it. */
  picture: string
}

export interface ShapeObject extends Base {
  kind: "box" | "ellipse"
  /** The colour of its edge; null for none. */
  stroke: Colour | null
  /** The colour inside it; null for none. */
  fill: Colour | null
  /** How thick its edge is, in points. */
  weight: number
}

export interface LineObject extends Base {
  kind: "line" | "arrow"
  from: Point
  /** An arrow points here. */
  to: Point
  stroke: Colour
  weight: number
}

export interface InkObject extends Base {
  kind: "ink"
  /** Each stroke of the pen, as the points it passed through. */
  strokes: Point[][]
  stroke: Colour
  weight: number
}

/** A line that says how long it is, between two marks. */
export interface MeasureObject extends Base {
  kind: "measure"
  from: Point
  to: Point
  stroke: Colour
  weight: number
  unit: MeasureUnit
  /** One on the page is this many in the world. */
  scale: number
}

/** A word or two in capitals inside a frame, as a rubber stamp leaves them. */
export interface StampObject extends Base {
  kind: "stamp"
  label: string
  colour: Colour
}

/** A filled box laid over something. It hides; it does not remove. */
export interface CoverObject extends Base {
  kind: "cover"
  fill: Colour
}

export type EditorObject =
  | TextObject
  | PictureObject
  | ShapeObject
  | LineObject
  | MeasureObject
  | InkObject
  | StampObject
  | CoverObject

export type ObjectKind = EditorObject["kind"]

/** Line height as a share of the size of the letters. */
export const LINE_HEIGHT = 1.2
export const SMALLEST_TEXT = 4
export const LARGEST_TEXT = 288
export const THICKEST = 24
/** The longest a stamp's words may be. */
export const LONGEST_STAMP = 40
/** How far a call-out's frame stands off its words, how thick it and its line are, and the room its arrow's head takes. */
export const CALLOUT_PAD = 4
export const CALLOUT_WEIGHT = 1.5
const CALLOUT_HEAD = 6

const clamp = (value: number, least: number, most: number) =>
  Math.min(most, Math.max(least, value))

/** How tall a text box is for its lines. */
export const textHeight = (lines: number, size: number) =>
  Math.max(1, lines) * size * LINE_HEIGHT

type Pointed = LineObject | MeasureObject | InkObject

/** A line, an arrow or a measuring line: a thing with two ends. */
export const isLine = (
  object: EditorObject
): object is LineObject | MeasureObject =>
  object.kind === "line" || object.kind === "arrow" || object.kind === "measure"

/** Things made of points have no box of their own: it follows the points. */
function fitted<T extends Pointed>(object: T): T {
  const points =
    object.kind === "ink" ? object.strokes.flat() : [object.from, object.to]
  return { ...object, box: boundsOf(points), rotation: 0 }
}

const mapPoints = <T extends Pointed>(
  object: T,
  change: (point: Point) => Point
): T =>
  fitted(
    object.kind === "ink"
      ? { ...object, strokes: object.strokes.map((s) => s.map(change)) }
      : { ...object, from: change(object.from), to: change(object.to) }
  )

const made = (object: EditorObject): object is Pointed =>
  isLine(object) || object.kind === "ink"

/** How thick a stamp's frame is: it grows with the stamp. */
export const stampWeight = (box: Box) =>
  clamp(Math.min(box.width, box.height) * 0.08, 1, 6)

/** The frame of a call-out: its box with room round the words. */
export const calloutFrame = (box: Box): Box => ({
  x: box.x - CALLOUT_PAD,
  y: box.y - CALLOUT_PAD,
  width: box.width + CALLOUT_PAD * 2,
  height: box.height + CALLOUT_PAD * 2,
})

/**
 * The line from a call-out's frame to what it points at: from the place on
 * the frame nearest the point. There is none when the point is inside the frame.
 */
export function calloutLine(
  object: TextObject
): { from: Point; to: Point } | null {
  if (!object.tip) return null
  const frame = calloutFrame(object.box)
  const from = {
    x: clamp(object.tip.x, frame.x, frame.x + frame.width),
    y: clamp(object.tip.y, frame.y, frame.y + frame.height),
  }
  return from.x === object.tip.x && from.y === object.tip.y
    ? null
    : { from, to: { ...object.tip } }
}

/** The upright box that holds all of an object, turn and edge included. */
export function reach(object: EditorObject): Box {
  if (object.kind === "text" && object.tip) {
    // The frame, and the point with room for the arrow's head.
    const frame = calloutFrame(object.box)
    const half = CALLOUT_WEIGHT / 2
    return boundsOf([
      { x: frame.x - half, y: frame.y - half },
      {
        x: frame.x + frame.width + half,
        y: frame.y + frame.height + half,
      },
      { x: object.tip.x - CALLOUT_HEAD, y: object.tip.y - CALLOUT_HEAD },
      { x: object.tip.x + CALLOUT_HEAD, y: object.tip.y + CALLOUT_HEAD },
    ])
  }
  const box = turnedBounds(object.box, object.rotation)
  const edge =
    object.kind === "stamp"
      ? stampWeight(object.box) / 2
      : object.kind === "measure"
        ? // Its end marks and its label stand off the line, and on a short
          // line the label is longer than the line itself.
          MEASURE_ROOM +
          object.weight / 2 +
          Math.max(
            0,
            (measured(object.from, object.to, object.unit, object.scale)
              .length *
              MEASURE_TEXT *
              0.62 -
              lengthOf(object.from, object.to)) /
              2
          )
        : "weight" in object && (made(object) || object.stroke)
          ? // An arrow's head is wider than its line.
            object.kind === "arrow"
            ? Math.max(6, object.weight * 4) * 0.45
            : object.weight / 2
          : 0
  return {
    x: box.x - edge,
    y: box.y - edge,
    width: box.width + edge * 2,
    height: box.height + edge * 2,
  }
}

/** An object moved by some distance. */
export function moved<T extends EditorObject>(
  object: T,
  dx: number,
  dy: number
): T {
  if (made(object))
    return mapPoints(object, (point) => ({
      x: point.x + dx,
      y: point.y + dy,
    })) as T
  return {
    ...object,
    box: { ...object.box, x: object.box.x + dx, y: object.box.y + dy },
  }
}

/** Something a thing is taken hold of by: one of its handles, or the point a call-out points at. */
export type Grip = Handle | "tip"

/** Which handles a kind of object has. Text keeps its height to its lines; a line has only its two ends. */
export function handlesOf(object: EditorObject): Grip[] {
  if (isLine(object)) return ["w", "e"]
  if (object.kind === "text") return object.tip ? ["w", "e", "tip"] : ["w", "e"]
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
}

/** Where on the page one of a thing's handles is. */
export function handleSpot(object: EditorObject, grip: Grip): Point {
  if (isLine(object)) return grip === "w" ? object.from : object.to
  if (grip === "tip")
    return object.kind === "text" && object.tip
      ? object.tip
      : centreOf(object.box)
  return handlePoint(object.box, object.rotation, grip)
}

/**
 * An object after one of its handles was pulled to a point.
 * @param keepShape Keep its proportions. Pictures keep theirs unless told not to.
 */
export function pulled<T extends EditorObject>(
  object: T,
  handle: Grip,
  to: Point,
  keepShape = object.kind === "picture"
): T {
  if (isLine(object))
    return fitted(
      handle === "w" ? { ...object, from: to } : { ...object, to }
    ) as T
  if (handle === "tip")
    return object.kind === "text" && object.tip
      ? { ...object, tip: { ...to } }
      : object
  const box = pullHandle(object.box, object.rotation, handle, to, keepShape)
  if (object.kind === "ink") {
    const was = object.box
    // A dot or a straight stroke has no width or height to scale by.
    const sx = was.width > 0 ? box.width / was.width : 1
    const sy = was.height > 0 ? box.height / was.height : 1
    return mapPoints(object, (point) => ({
      x: box.x + (point.x - was.x) * sx,
      y: box.y + (point.y - was.y) * sy,
    })) as T
  }
  return { ...object, box }
}

/** An object turned to an angle about its centre. Things made of points are turned point by point. */
export function turnedTo<T extends EditorObject>(
  object: T,
  degrees: number
): T {
  if (made(object)) {
    const centre = centreOf(object.box)
    return mapPoints(object, (point) =>
      turnAbout(point, centre, degrees - object.rotation)
    ) as T
  }
  return { ...object, rotation: wholeTurn(degrees) }
}

/** A text box with other words, lines or size: its height follows. */
export function retyped(
  object: TextObject,
  change: Partial<Pick<TextObject, "text" | "lines" | "size">>
): TextObject {
  const next = { ...object, ...change }
  next.size = clamp(next.size, SMALLEST_TEXT, LARGEST_TEXT)
  return {
    ...next,
    box: { ...next.box, height: textHeight(next.lines.length, next.size) },
  }
}

/** A copy with another name, a little down and to the right. */
export function copyOf<T extends EditorObject>(
  object: T,
  id: string,
  shift = 12
): T {
  return { ...moved(object, shift, shift), id }
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isPoint = (value: unknown): value is Point =>
  typeof value === "object" &&
  value !== null &&
  isNumber((value as Point).x) &&
  isNumber((value as Point).y)

const isColour = (value: unknown): value is Colour =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((part) => isNumber(part) && part >= 0 && part <= 1)

const isBox = (value: unknown): value is Box =>
  typeof value === "object" &&
  value !== null &&
  isNumber((value as Box).x) &&
  isNumber((value as Box).y) &&
  isNumber((value as Box).width) &&
  isNumber((value as Box).height) &&
  (value as Box).width >= 0 &&
  (value as Box).height >= 0

/** The most a file may claim for itself: points in a drawing, letters in a box. */
export const MOST_POINTS = 200_000
export const MOST_LETTERS = 100_000

/**
 * An object read back from a file, or null when it is not one. What a file
 * says about itself is never taken on trust: every part is checked, and
 * anything out of bounds is brought back in.
 */
export function readObject(value: unknown): EditorObject | null {
  if (typeof value !== "object" || value === null) return null
  const data = value as Record<string, unknown>
  if (typeof data.id !== "string" || !data.id || data.id.length > 64)
    return null
  if (!isBox(data.box)) return null
  const base = {
    id: data.id,
    box: {
      x: data.box.x,
      y: data.box.y,
      width: data.box.width,
      height: data.box.height,
    },
    rotation: isNumber(data.rotation) ? wholeTurn(data.rotation) : 0,
    opacity: isNumber(data.opacity) ? clamp(data.opacity, 0, 1) : 1,
  }
  const weight = isNumber(data.weight) ? clamp(data.weight, 0.25, THICKEST) : 1
  switch (data.kind) {
    case "text": {
      if (typeof data.text !== "string" || data.text.length > MOST_LETTERS)
        return null
      if (
        !Array.isArray(data.lines) ||
        !data.lines.every((line) => typeof line === "string") ||
        data.lines.join("").length > MOST_LETTERS
      )
        return null
      return {
        ...base,
        kind: "text",
        text: data.text,
        lines: data.lines as string[],
        font: FONT_FAMILIES.includes(data.font as FontFamily)
          ? (data.font as FontFamily)
          : "sans",
        bold: data.bold === true,
        italic: data.italic === true,
        size: isNumber(data.size)
          ? clamp(data.size, SMALLEST_TEXT, LARGEST_TEXT)
          : 12,
        colour: isColour(data.colour) ? data.colour : BLACK,
        align:
          data.align === "centre" || data.align === "right"
            ? data.align
            : "left",
        // A call-out stands upright: its frame and its line are worked out that way.
        ...(isPoint(data.tip)
          ? { tip: { x: data.tip.x, y: data.tip.y }, rotation: 0 }
          : null),
      }
    }
    case "stamp": {
      const label =
        typeof data.label === "string"
          ? data.label.trim().slice(0, LONGEST_STAMP)
          : ""
      if (!label) return null
      return {
        ...base,
        kind: "stamp",
        label,
        colour: isColour(data.colour) ? data.colour : BLACK,
      }
    }
    case "measure":
      if (!isPoint(data.from) || !isPoint(data.to)) return null
      return fitted({
        ...base,
        kind: "measure",
        from: { x: data.from.x, y: data.from.y },
        to: { x: data.to.x, y: data.to.y },
        stroke: isColour(data.stroke) ? data.stroke : BLACK,
        weight,
        unit: MEASURE_UNITS.includes(data.unit as MeasureUnit)
          ? (data.unit as MeasureUnit)
          : "mm",
        scale:
          isNumber(data.scale) && data.scale > 0
            ? clamp(data.scale, SMALLEST_SCALE, LARGEST_SCALE)
            : 1,
      })
    case "picture":
      if (typeof data.picture !== "string" || !data.picture) return null
      return { ...base, kind: "picture", picture: data.picture }
    case "box":
    case "ellipse":
      return {
        ...base,
        kind: data.kind,
        stroke: isColour(data.stroke) ? data.stroke : null,
        fill: isColour(data.fill) ? data.fill : null,
        weight,
      }
    case "line":
    case "arrow":
      if (!isPoint(data.from) || !isPoint(data.to)) return null
      return fitted({
        ...base,
        kind: data.kind,
        from: { x: data.from.x, y: data.from.y },
        to: { x: data.to.x, y: data.to.y },
        stroke: isColour(data.stroke) ? data.stroke : BLACK,
        weight,
      })
    case "ink": {
      if (!Array.isArray(data.strokes)) return null
      const strokes: Point[][] = []
      let points = 0
      for (const stroke of data.strokes) {
        if (!Array.isArray(stroke) || !stroke.every(isPoint)) return null
        points += stroke.length
        if (points > MOST_POINTS) return null
        if (stroke.length)
          strokes.push(stroke.map((point) => ({ x: point.x, y: point.y })))
      }
      if (!strokes.length) return null
      return fitted({
        ...base,
        kind: "ink",
        strokes,
        stroke: isColour(data.stroke) ? data.stroke : BLACK,
        weight,
      })
    }
    case "cover":
      return {
        ...base,
        kind: "cover",
        fill: isColour(data.fill) ? data.fill : WHITE,
      }
    default:
      return null
  }
}

/** Which of the font files a text box is written with. */
export const fontKey = (text: Pick<TextObject, "font" | "bold" | "italic">) =>
  isHand(text.font)
    ? text.font
    : `${text.font}${text.bold ? "-bold" : ""}${text.italic ? "-italic" : ""}`

/** Every font file there is, by its key. */
export const FONT_KEYS: readonly string[] = FONT_FAMILIES.flatMap((font) =>
  isHand(font)
    ? [font]
    : [false, true].flatMap((bold) =>
        [false, true].map((italic) => fontKey({ font, bold, italic }))
      )
)

/**
 * The three corners of an arrow's head: its tip at the end of the line, and
 * the two behind it. The head grows with the line's weight.
 */
export function arrowHead(from: Point, to: Point, weight: number): Point[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
  const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
  const size = Math.max(6, weight * 4)
  const back = { x: to.x - along.x * size, y: to.y - along.y * size }
  const half = size * 0.45
  return [
    { ...to },
    { x: back.x - along.y * half, y: back.y + along.x * half },
    { x: back.x + along.y * half, y: back.y - along.x * half },
  ]
}

/** Where an arrow's line stops, so that it does not show beyond the point of its head. */
export function arrowShaft(from: Point, to: Point, weight: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const size = Math.max(6, weight * 4)
  if (length <= size) return { ...from }
  const cut = (size * 0.8) / length
  return { x: to.x - (to.x - from.x) * cut, y: to.y - (to.y - from.y) * cut }
}

/** What each kind is called, for labels and for the undo list. */
export const KIND_NAMES: Record<ObjectKind, string> = {
  text: "text box",
  picture: "picture",
  box: "box",
  ellipse: "ellipse",
  line: "line",
  arrow: "arrow",
  ink: "drawing",
  cover: "cover",
  stamp: "stamp",
  measure: "measuring line",
}

/** The fonts stamps and the labels of measuring lines are set in. */
export const STAMP_FONT = "sans-bold"
export const MEASURE_FONT = "sans"

/** What a thing is called: its kind, or "call-out" for a text box that points at something. */
export const nameOf = (object: EditorObject) =>
  object.kind === "text" && object.tip ? "call-out" : KIND_NAMES[object.kind]

/** The font files a thing is drawn with, by their keys: none for what has no letters. */
export function fontsFor(object: EditorObject): string[] {
  if (object.kind === "text") return [fontKey(object)]
  if (object.kind === "stamp") return [STAMP_FONT]
  if (object.kind === "measure") return [MEASURE_FONT]
  return []
}

/**
 * Where a stamp's words go and how large they are: as large as the frame
 * has room for, in its middle.
 * @param width How wide the words are at a size of one point.
 * @returns The size of the letters and where their baseline starts.
 */
export function stampLayout(box: Box, width: number) {
  const edge = stampWeight(box) * 2.5
  const room = {
    width: Math.max(1, box.width - edge * 2),
    height: Math.max(1, box.height - edge * 2),
  }
  // Capitals are about seven tenths of the size of the letters tall.
  const size = Math.max(
    1,
    Math.min(room.height / 0.9, room.width / (width || 1))
  )
  const centre = centreOf(box)
  return {
    size,
    x: centre.x - (width * size) / 2,
    y: centre.y + size * 0.36,
  }
}

/** A box no smaller than the smallest in either direction. */
export const atLeast = (box: Box): Box => ({
  ...box,
  width: Math.max(SMALLEST, box.width),
  height: Math.max(SMALLEST, box.height),
})
