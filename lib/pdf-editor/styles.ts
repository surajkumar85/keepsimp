/**
 * Colours and looks offered in the editor, and how a selected thing takes a
 * new look. Colours are kept as three numbers from 0 to 1, the way a PDF
 * holds them.
 */
import { LARGEST_SCALE, SMALLEST_SCALE, type MeasureUnit } from "./measure"
import type { CheckShape } from "./signature"
import {
  LONGEST_STAMP,
  retyped,
  THICKEST,
  type Colour,
  type EditorObject,
  type FontFamily,
  type InkObject,
  type LineObject,
  type MeasureObject,
  type ShapeObject,
  type TextAlign,
} from "./objects"
import type { Styles, Tool } from "./tools"

/** The colours offered, in the order they are shown. */
export const PALETTE: readonly { name: string; colour: Colour }[] = [
  { name: "Black", colour: [0, 0, 0] },
  { name: "Grey", colour: [0.4, 0.4, 0.4] },
  { name: "Red", colour: [0.86, 0.15, 0.15] },
  { name: "Orange", colour: [0.92, 0.45, 0.05] },
  { name: "Yellow", colour: [0.98, 0.8, 0.08] },
  { name: "Green", colour: [0.09, 0.56, 0.24] },
  { name: "Blue", colour: [0.1, 0.25, 0.75] },
  { name: "Purple", colour: [0.49, 0.23, 0.75] },
  { name: "White", colour: [1, 1, 1] },
]

/** A colour as a browser writes it. */
export const cssColour = (colour: Colour) =>
  `rgb(${colour.map((part) => Math.round(part * 255)).join(" ")})`

export const sameColour = (a: Colour | null, b: Colour | null) =>
  a === b || (a !== null && b !== null && a.every((part, at) => part === b[at]))

/** What a colour is called: its name in the palette, or "Custom". */
export const colourName = (colour: Colour) =>
  PALETTE.find((entry) => sameColour(entry.colour, colour))?.name ?? "Custom"

/** The line weights and letter sizes offered. */
export const WEIGHTS = [1, 2, 4, 8] as const
export const TEXT_SIZES = [8, 10, 12, 14, 18, 24, 36, 48] as const

/** One part of a look, as the bar offers it. */
export type Look =
  | { stroke: Colour | null }
  | { fill: Colour | null }
  | { weight: number }
  | { font: FontFamily }
  | { size: number }
  | { bold: boolean }
  | { italic: boolean }
  | { align: TextAlign }
  | { opacity: number }
  | { label: string }
  | { unit: MeasureUnit }
  | { scale: number }
  | { shape: CheckShape }

/** Which parts of a look a kind of thing has. */
export type LookPart =
  | "stroke"
  | "fill"
  | "weight"
  | "font"
  | "size"
  | "bold"
  | "italic"
  | "align"
  | "opacity"
  | "label"
  | "unit"
  | "scale"
  | "shape"

const PARTS: Record<EditorObject["kind"], LookPart[]> = {
  text: ["font", "size", "bold", "italic", "align", "stroke", "opacity"],
  picture: ["opacity"],
  box: ["stroke", "fill", "weight", "opacity"],
  ellipse: ["stroke", "fill", "weight", "opacity"],
  line: ["stroke", "weight", "opacity"],
  arrow: ["stroke", "weight", "opacity"],
  ink: ["stroke", "weight", "opacity"],
  cover: ["fill"],
  stamp: ["label", "stroke", "opacity"],
  measure: ["unit", "scale", "stroke", "weight", "opacity"],
}

/** The parts of a look that can be set for a tool about to make something. */
const TOOL_PARTS: Record<Tool, LookPart[]> = {
  select: [],
  text: ["font", "size", "bold", "italic", "align", "stroke"],
  box: ["stroke", "fill", "weight"],
  ellipse: ["stroke", "fill", "weight"],
  line: ["stroke", "weight"],
  arrow: ["stroke", "weight"],
  ink: ["stroke", "weight"],
  cover: ["fill"],
  stamp: ["label", "stroke"],
  measure: ["unit", "scale", "stroke", "weight"],
  callout: ["font", "size", "bold", "italic", "align", "stroke"],
  check: ["shape", "stroke"],
}

/** The words a stamp may say, kept to a length; empty when there are none. */
const stampWords = (value: string) => value.trim().slice(0, LONGEST_STAMP)

/** The parts every one of some things has; those of the tool when there are none. */
export function partsFor(objects: readonly EditorObject[], tool: Tool) {
  if (!objects.length) return TOOL_PARTS[tool]
  return PARTS[objects[0].kind].filter((part) =>
    objects.every((object) => PARTS[object.kind].includes(part))
  )
}

const clamp = (value: number, least: number, most: number) =>
  Math.min(most, Math.max(least, value))

/**
 * A thing with one part of its look changed. The thing itself comes back
 * when it has no such part, or already looks that way. For text, "stroke" is
 * the colour of its letters. A text box whose letters change size or shape
 * has to have its lines broken again by whoever asked.
 */
export function withLook(object: EditorObject, look: Look): EditorObject {
  const [part, value] = Object.entries(look)[0] as [LookPart, never]
  if (!PARTS[object.kind].includes(part)) return object
  if (part === "opacity") {
    const opacity = clamp(value as number, 0.05, 1)
    return opacity === object.opacity ? object : { ...object, opacity }
  }
  if (object.kind === "stamp") {
    if (part === "label") {
      const label = stampWords(value as string)
      return !label || label === object.label ? object : { ...object, label }
    }
    // A stamp has one colour, for its frame and its words.
    const colour = value as Colour | null
    return colour === null || sameColour(colour, object.colour)
      ? object
      : { ...object, colour }
  }
  if (object.kind === "measure" && (part === "unit" || part === "scale")) {
    if (part === "unit")
      return object.unit === value ? object : { ...object, unit: value }
    const scale = clamp(value as number, SMALLEST_SCALE, LARGEST_SCALE)
    return scale === object.scale ? object : { ...object, scale }
  }
  if (object.kind === "text") {
    if (part === "stroke") {
      const colour = value as Colour | null
      return colour === null || sameColour(colour, object.colour)
        ? object
        : { ...object, colour }
    }
    if (part === "size") {
      const next = retyped(object, { size: value as number })
      return next.size === object.size ? object : next
    }
    const key = part as "font" | "bold" | "italic" | "align"
    return object[key] === value ? object : { ...object, [key]: value }
  }
  if (part === "weight") {
    const weight = clamp(value as number, 0.25, THICKEST)
    return "weight" in object && object.weight !== weight
      ? { ...object, weight }
      : object
  }
  const colour = value as Colour | null
  if (part === "fill") {
    if (object.kind === "cover")
      return colour === null || sameColour(colour, object.fill)
        ? object
        : { ...object, fill: colour }
    // Only shapes are left: a cover was dealt with, and nothing else has an inside.
    const shape = object as ShapeObject
    // A shape with neither edge nor inside could not be seen or found again.
    if (colour === null && shape.stroke === null) return object
    return sameColour(colour, shape.fill) ? object : { ...shape, fill: colour }
  }
  // The stroke.
  if (object.kind === "box" || object.kind === "ellipse") {
    if (colour === null && object.fill === null) return object
    return sameColour(colour, object.stroke)
      ? object
      : { ...object, stroke: colour }
  }
  // Lines and drawings are left, which always have a colour.
  const drawn = object as LineObject | MeasureObject | InkObject
  return colour === null || sameColour(colour, drawn.stroke)
    ? object
    : { ...drawn, stroke: colour }
}

/** The styles for new things after a part of a look was chosen while a tool is in hand. */
export function stylesWith(styles: Styles, tool: Tool, look: Look): Styles {
  const [part, value] = Object.entries(look)[0] as [LookPart, never]
  if (!TOOL_PARTS[tool].includes(part)) return styles
  if (tool === "text" || tool === "callout") {
    // A call-out takes the colour of arrows and lines; text has its own.
    if (part === "stroke")
      return value === null
        ? styles
        : { ...styles, [tool === "text" ? "textColour" : "stroke"]: value }
    return { ...styles, [part]: value }
  }
  if (tool === "check") {
    if (part === "shape") return { ...styles, checkShape: value }
    return value === null ? styles : { ...styles, checkColour: value }
  }
  if (tool === "stamp") {
    if (part === "stroke")
      return value === null ? styles : { ...styles, stampColour: value }
    const label = stampWords(value as string)
    return label ? { ...styles, stampLabel: label } : styles
  }
  if (part === "unit") return { ...styles, unit: value }
  if (part === "scale")
    return {
      ...styles,
      scale: clamp(value as number, SMALLEST_SCALE, LARGEST_SCALE),
    }
  if (tool === "ink") {
    if (part === "stroke")
      return value === null ? styles : { ...styles, inkColour: value }
    return { ...styles, inkWeight: clamp(value as number, 0.25, THICKEST) }
  }
  if (tool === "cover")
    return value === null ? styles : { ...styles, coverFill: value }
  if (part === "weight")
    return { ...styles, weight: clamp(value as number, 0.25, THICKEST) }
  if (part === "fill") return { ...styles, fill: value }
  // Lines have to have a colour; shapes may go without an edge when they are filled.
  if (
    value === null &&
    (tool === "line" ||
      tool === "arrow" ||
      tool === "measure" ||
      styles.fill === null)
  )
    return styles
  return value === null ? styles : { ...styles, stroke: value }
}

/** What the bar shows for each part: the look of the selected thing, or of what the tool would make. */
export function lookOf(
  objects: readonly EditorObject[],
  tool: Tool,
  styles: Styles
): {
  stroke: Colour | null
  fill: Colour | null
  weight: number
  font: FontFamily
  size: number
  bold: boolean
  italic: boolean
  align: TextAlign
  opacity: number
  label: string
  unit: MeasureUnit
  scale: number
  shape: CheckShape
} {
  const [first] = objects
  const base = {
    stroke:
      tool === "text"
        ? styles.textColour
        : tool === "ink"
          ? styles.inkColour
          : tool === "stamp"
            ? styles.stampColour
            : tool === "check"
              ? styles.checkColour
              : styles.stroke,
    fill: tool === "cover" ? styles.coverFill : styles.fill,
    weight: tool === "ink" ? styles.inkWeight : styles.weight,
    font: styles.font,
    size: styles.size,
    bold: styles.bold,
    italic: styles.italic,
    align: styles.align,
    opacity: 1,
    label: styles.stampLabel,
    unit: styles.unit,
    scale: styles.scale,
    shape: styles.checkShape,
  }
  if (!first) return base
  const seen = { ...base, opacity: first.opacity }
  if (first.kind === "text")
    return {
      ...seen,
      stroke: first.colour,
      font: first.font,
      size: first.size,
      bold: first.bold,
      italic: first.italic,
      align: first.align,
    }
  if (first.kind === "cover") return { ...seen, fill: first.fill }
  if (first.kind === "picture") return seen
  if (first.kind === "stamp")
    return { ...seen, stroke: first.colour, label: first.label }
  if (first.kind === "measure")
    return {
      ...seen,
      stroke: first.stroke,
      weight: first.weight,
      unit: first.unit,
      scale: first.scale,
    }
  return {
    ...seen,
    stroke: first.stroke,
    weight: first.weight,
    fill: "fill" in first ? first.fill : null,
  }
}
