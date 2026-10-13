/**
 * What is put on many pages at once: page numbers, headers and footers,
 * numbers that run through a set of files (Bates numbers), and watermarks.
 * Each becomes an ordinary thing on each page, a line of text or a
 * picture, made here and added in one step; afterwards any of them can be
 * moved, changed or deleted like anything else that was added.
 *
 * This is the part that needs no engine: what is written on each page,
 * and where it lies.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import { wholeTurn } from "./geometry"
import {
  LARGEST_TEXT,
  SMALLEST_TEXT,
  textHeight,
  type BuiltIn,
  type Colour,
  type PictureObject,
  type TextObject,
} from "./objects"
import type { Change } from "./tools"

/** Where on a page a line is written. */
export const SPOTS = [
  "top-left",
  "top-centre",
  "top-right",
  "bottom-left",
  "bottom-centre",
  "bottom-right",
] as const
export type Spot = (typeof SPOTS)[number]

export const SPOT_NAMES: Record<Spot, string> = {
  "top-left": "Top left",
  "top-centre": "Top middle",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-centre": "Bottom middle",
  "bottom-right": "Bottom right",
}

/**
 * What stands for something else in a line: the page's number, how many
 * pages there are, today's date, the file's name, and a number that runs
 * on from page to page with a fixed count of figures.
 */
export const TOKENS = ["{page}", "{pages}", "{date}", "{name}", "{number}"]

/** A line written at the same spot of many pages. */
export interface RepeatedLine {
  /** What is written, with what stands for something else in braces. */
  text: string
  spot: Spot
  /** How far from the page's edges, in points. */
  margin: number
  font: BuiltIn
  bold: boolean
  size: number
  colour: Colour
  /** The number the first of the pages gets where `{page}` stands. */
  from: number
  /** For `{number}`: the first number, and how many figures it is written with. */
  first: number
  figures: number
}

/** A word or a picture laid over the middle of many pages. */
export interface Watermark {
  text: string
  /** A picture instead of words: the name the worker knows it by, and its size in pixels. */
  picture?: { name: string; size: Size }
  /** From the lower left to the upper right, or level. */
  slanted: boolean
  /** From 0.05 (hardly there) to 1 (solid). */
  opacity: number
  /** How much of the page's width, or of its corner-to-corner length, it takes: 0.2 to 1. */
  share: number
  font: BuiltIn
  bold: boolean
  colour: Colour
}

export const FEWEST_FIGURES = 1
export const MOST_FIGURES = 12
export const LARGEST_MARGIN = 200
/** The longest line that is written on every page. */
export const LONGEST_LINE = 200

export const defaultLine: RepeatedLine = {
  text: "{page}",
  spot: "bottom-centre",
  margin: 28,
  font: "sans",
  bold: false,
  size: 10,
  colour: [0.2, 0.2, 0.2],
  from: 1,
  first: 1,
  figures: 6,
}

export const defaultWatermark: Watermark = {
  text: "DRAFT",
  slanted: true,
  opacity: 0.2,
  share: 0.7,
  font: "sans",
  bold: true,
  colour: [0.5, 0.5, 0.5],
}

/** What is known when a line is written on one page. */
export interface Facts {
  /** Which of the chosen pages this is, counted from 0. */
  nth: number
  /** How many pages the file has. */
  pages: number
  date: string
  name: string
}

/** A line as it reads on one page. */
export function wordsOn(line: RepeatedLine, facts: Facts) {
  const figures = Math.min(MOST_FIGURES, Math.max(FEWEST_FIGURES, line.figures))
  return line.text
    .replaceAll("{page}", String(line.from + facts.nth))
    .replaceAll("{pages}", String(facts.pages))
    .replaceAll("{date}", facts.date)
    .replaceAll("{name}", facts.name)
    .replaceAll(
      "{number}",
      String(line.first + facts.nth).padStart(figures, "0")
    )
}

/** Why a line cannot be written; "" when it can. */
export function lineProblem(line: RepeatedLine) {
  if (!line.text.trim()) return "Type what is to be written."
  if (line.text.length > LONGEST_LINE)
    return `That is longer than ${LONGEST_LINE} letters.`
  return ""
}

/** A line as a thing on a page of a size: as wide as the page between its margins, set to the side its spot is on. */
export function lineObject(
  line: RepeatedLine,
  id: string,
  page: Size,
  words: string
): TextObject {
  const size = Math.min(LARGEST_TEXT, Math.max(SMALLEST_TEXT, line.size))
  // A margin never takes more than a third of a small page.
  const margin = Math.max(
    0,
    Math.min(line.margin, LARGEST_MARGIN, page.width / 3, page.height / 3)
  )
  const height = textHeight(1, size)
  const [edge, side] = line.spot.split("-") as [
    "top" | "bottom",
    "left" | "centre" | "right",
  ]
  return {
    id,
    kind: "text",
    box: {
      x: margin,
      y: edge === "top" ? margin : page.height - margin - height,
      width: page.width - margin * 2,
      height,
    },
    rotation: 0,
    opacity: 1,
    text: words,
    lines: [words],
    font: line.font,
    bold: line.bold,
    italic: false,
    size,
    colour: line.colour,
    align: side,
  }
}

/** How wide a letter is on average, as a share of its size: a little more than it is, so that the words surely fit. */
const WIDE = 0.62
const WIDE_BOLD = 0.67

/** Why a watermark cannot be made; "" when it can. */
export function markProblem(mark: Watermark) {
  if (mark.picture) return ""
  if (!mark.text.trim()) return "Type the words of the watermark."
  if (mark.text.length > 60) return "A watermark is 60 letters at most."
  return ""
}

/** A watermark as a thing on a page of a size: in the middle, as large as its share of the page. */
export function markObject(
  mark: Watermark,
  id: string,
  page: Size
): TextObject | PictureObject {
  const opacity = Math.min(1, Math.max(0.05, mark.opacity))
  const share = Math.min(1, Math.max(0.2, mark.share))
  if (mark.picture) {
    const { name, size } = mark.picture
    // As wide as its share of the page, and no taller than the same share of its height.
    const scale = Math.min(
      (page.width * share) / size.width,
      (page.height * share) / size.height
    )
    const width = size.width * scale
    const height = size.height * scale
    return {
      id,
      kind: "picture",
      picture: name,
      box: {
        x: (page.width - width) / 2,
        y: (page.height - height) / 2,
        width,
        height,
      },
      rotation: 0,
      opacity,
    }
  }
  const words = mark.text.trim()
  const along = mark.slanted ? Math.hypot(page.width, page.height) : page.width
  const width = along * share
  const size = Math.min(
    LARGEST_TEXT,
    Math.max(
      SMALLEST_TEXT,
      width / ((mark.bold ? WIDE_BOLD : WIDE) * Array.from(words).length)
    )
  )
  const height = textHeight(1, size)
  return {
    id,
    kind: "text",
    box: {
      x: (page.width - width) / 2,
      y: (page.height - height) / 2,
      width,
      height,
    },
    // Up towards the right, along the line from corner to corner.
    rotation: mark.slanted
      ? wholeTurn(-(Math.atan2(page.height, page.width) * 180) / Math.PI)
      : 0,
    opacity,
    text: words,
    lines: [words],
    font: mark.font,
    bold: mark.bold,
    italic: false,
    size,
    colour: mark.colour,
    align: "centre",
  }
}

/**
 * The step that puts a line or a watermark on some pages: one thing added
 * to each.
 * @param pages The pages, counted from 0, in the order they are numbered in.
 * @param sizes Every page's size as it is shown.
 * @param newId A name for each thing, never the same twice.
 */
export function repeatedChange(
  what: { line: RepeatedLine } | { mark: Watermark },
  pages: readonly number[],
  sizes: readonly Size[],
  facts: Pick<Facts, "date" | "name">,
  newId: () => string
): Change {
  const count = pages.length
  const named = `${count.toLocaleString("en")} page${count === 1 ? "" : "s"}`
  return {
    label: "line" in what ? `Write on ${named}` : `Add a watermark to ${named}`,
    ops: pages.map((page, nth) => ({
      do: "add" as const,
      page,
      object:
        "line" in what
          ? lineObject(
              what.line,
              newId(),
              sizes[page] as Size,
              wordsOn(what.line, { ...facts, nth, pages: sizes.length })
            )
          : markObject(what.mark, newId(), sizes[page] as Size),
    })),
  }
}
