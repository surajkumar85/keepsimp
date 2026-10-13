/**
 * Taking things out of a file for good. A place is marked first, by an
 * area, by words that are looked for, or by a pattern such as an e-mail
 * address; marks can be looked over and taken away again. Applying them
 * removes what is under each mark from the file (the letters, the pixels
 * of pictures, the drawings) and puts a black box where it was.
 *
 * This is the part that needs no engine: what a mark is, where words and
 * patterns are on a page, and the look at the page afterwards that says
 * whether anything is still drawn under a mark.
 */
import { quadBox, type Quad } from "@/lib/pdf-reader/text"
import type { LetterLine } from "./comments"
import type { Box } from "./geometry"

/** A place marked to be taken out: one box for each line of words it lies on, or one for an area. */
export interface RedactMark {
  /** Its own name on its page; never shown. */
  id: string
  quads: Quad[]
}

export type RedactOp =
  | { do: "mark"; page: number; id: string; quads: Quad[] }
  | { do: "unmark"; page: number; id: string }
  /** Every mark on every page is applied. With `touched`, drawings a mark only touches go whole. */
  | { do: "apply"; touched?: boolean }

/** What applying the marks of one page did. */
export interface Applied {
  page: number
  /** The places that were emptied, as boxes on the page as it is shown. */
  boxes: Box[]
  /** Under how many of them something is still drawn: a drawing that reaches beyond its mark. */
  residue: number
  /** How many notes and how many form fields lay under the marks and went with what they lay on. */
  notes: number
  fields: number
}

export interface RedactChange {
  label: string
  ops: RedactOp[]
  /** What the engine said applying did, for each change: kept so that a download can say it and look again. */
  done?: Applied[][]
}

/**
 * What a download leaves out besides: things a file carries that are not
 * on its pages, and that tell more than its pages do.
 */
export interface Clean {
  /** Title, author, the app that made the file and when. */
  details: boolean
  /** Files attached to the document or pinned to a page. */
  attachments: boolean
  /** Scripts that run when the file is opened or a field is used. */
  scripts: boolean
}

export const CLEAN_NOTHING: Clean = {
  details: false,
  attachments: false,
  scripts: false,
}

/** What is to be left out as it arrives from the page: only what is plainly asked for. */
export const readClean = (value: unknown): Clean => {
  const asked =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  return {
    details: asked.details === true,
    attachments: asked.attachments === true,
    scripts: asked.scripts === true,
  }
}

/** Whether anything is to be left out at all. */
export const cleans = (clean: Clean) =>
  clean.details || clean.attachments || clean.scripts

export const MOST_MARK_QUADS = 2000
/** The most places one search may mark. */
export const MOST_FOUND = 5000

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
const isPage = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0
const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)

/** A change to the marks as it arrives from the page or from a draft, or null when it is not one. */
export function readRedactOp(value: unknown): RedactOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (op.do === "apply")
    return op.touched === true
      ? { do: "apply", touched: true }
      : { do: "apply" }
  if (!isPage(op.page) || !isId(op.id)) return null
  if (op.do === "unmark") return { do: "unmark", page: op.page, id: op.id }
  if (op.do !== "mark" || !Array.isArray(op.quads)) return null
  const quads = op.quads
    .filter(
      (quad): quad is number[] =>
        Array.isArray(quad) && quad.length === 8 && quad.every(isNumber)
    )
    .slice(0, MOST_MARK_QUADS)
    .map((quad) => [...quad] as unknown as Quad)
  return quads.length ? { do: "mark", page: op.page, id: op.id, quads } : null
}

/** What applying did as it comes out of a draft: for every change, the pages it emptied places on; or nothing. */
export function readApplied(
  value: unknown,
  ops: number
): Applied[][] | undefined {
  if (!Array.isArray(value) || value.length !== ops) return undefined
  const all: Applied[][] = []
  for (const pages of value as unknown[]) {
    if (!Array.isArray(pages)) return undefined
    const read: Applied[] = []
    for (const one of pages as Record<string, unknown>[]) {
      if (typeof one !== "object" || one === null) return undefined
      const { page, boxes, residue, notes, fields } = one
      if (!isPage(page) || !Array.isArray(boxes)) return undefined
      if (![residue, notes, fields].every(isPage)) return undefined
      const places: Box[] = []
      for (const box of boxes as Record<string, unknown>[]) {
        if (typeof box !== "object" || box === null) return undefined
        const { x, y, width, height } = box
        if (![x, y, width, height].every(isNumber)) return undefined
        places.push({ x, y, width, height } as Box)
      }
      read.push({
        page,
        boxes: places,
        residue: residue as number,
        notes: notes as number,
        fields: fields as number,
      })
    }
    all.push(read)
  }
  return all
}

/** The box round a mark's quad, on the page as it is shown. */
export const boxOf = (quad: Quad): Box => {
  const { left, top, width, height } = quadBox(quad)
  return { x: left, y: top, width, height }
}

/** A box as the quad of a mark. */
export const quadOf = (box: Box): Quad => [
  box.x,
  box.y,
  box.x + box.width,
  box.y,
  box.x,
  box.y + box.height,
  box.x + box.width,
  box.y + box.height,
]

/** Kinds of thing that are looked for by their shape, not by their words. */
export const PATTERNS = {
  email: {
    name: "E-mail addresses",
    find: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
  },
  phone: {
    name: "Phone numbers",
    // Seven to fifteen figures, with the spaces, dots, dashes and brackets phone numbers are written with.
    find: /(?<![\w.])\+?\(?\d[\d ().\-/]{5,18}\d(?![\w])/g,
  },
  card: {
    name: "Card numbers",
    // Thirteen to nineteen figures in groups: kept only when the check figure is right.
    find: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g,
  },
} as const
export type PatternName = keyof typeof PATTERNS

/** Whether a row of figures passes the check a card number carries in its last figure (Luhn). */
export function passesCardCheck(figures: string) {
  const digits = figures.replace(/\D/g, "")
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let at = 0; at < digits.length; at++) {
    let digit = Number(digits[digits.length - 1 - at])
    if (at % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** A day, a month and a year in figures, whichever comes first. */
const DATE = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/

/** How many figures some text has. */
const figuresIn = (text: string) => text.replace(/\D/g, "").length

/**
 * What is looked for: some words, things of a kind, or a shape of one's
 * own, in which `#` stands for a figure, `@` for a letter, `?` for any one
 * character and `*` for a run of letters and figures.
 */
export type Sought =
  | { words: string; matchCase?: boolean }
  | { pattern: PatternName }
  | { shape: string }

export const LONGEST_SOUGHT = 200
/** The most runs (`*`) a shape may have: each more makes the search slower by the length of a line. */
export const MOST_RUNS = 2

/**
 * The search a shape stands for, or null when it is none: it has to name
 * something besides runs, and may have two runs at most.
 */
export function shapeSearch(shape: string): RegExp | null {
  const text = shape.trim().replace(/\*+/g, "*").replace(/\s+/g, " ")
  if (!text || text.length > LONGEST_SOUGHT) return null
  if (text.split("*").length - 1 > MOST_RUNS) return null
  if (!/[^*?\s]/.test(text)) return null
  const source = Array.from(text, (sign) =>
    sign === "#"
      ? "\\d"
      : sign === "@"
        ? "\\p{L}"
        : sign === "?"
          ? "."
          : sign === "*"
            ? "[\\p{L}\\p{N}]+"
            : sign === " "
              ? "\\s+"
              : sign.replace(/[.+^${}()|[\]\\/]/g, "\\$&")
  ).join("")
  return new RegExp(source, "giu")
}

/** What is looked for as it arrives from the page, or null when it is nothing that can be looked for. */
export function readSought(value: unknown): Sought | null {
  if (typeof value !== "object" || value === null) return null
  const sought = value as Record<string, unknown>
  if (typeof sought.pattern === "string")
    return Object.hasOwn(PATTERNS, sought.pattern)
      ? { pattern: sought.pattern as PatternName }
      : null
  if (typeof sought.shape === "string")
    return shapeSearch(sought.shape) ? { shape: sought.shape } : null
  if (typeof sought.words !== "string") return null
  const words = sought.words.trim()
  if (!words || words.length > LONGEST_SOUGHT) return null
  return sought.matchCase === true ? { words, matchCase: true } : { words }
}

/** A place where what was looked for is, with what it says there. */
export interface FoundPlace {
  text: string
  quad: Quad
}

/** The box round some letters of a line that follow one another, as one quad. */
function around(quads: readonly Quad[]): Quad {
  const boxes = quads.map(quadBox)
  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))
  const right = Math.max(...boxes.map((box) => box.left + box.width))
  const bottom = Math.max(...boxes.map((box) => box.top + box.height))
  return [left, top, right, top, left, bottom, right, bottom]
}

/**
 * Where some words, or things of a kind, are in the lines of a page. Each
 * is looked for within a line: what a line break parts is not found.
 * @returns Every place, with the box round its letters.
 */
export function foundIn(
  lines: readonly LetterLine[],
  sought: Sought
): FoundPlace[] {
  const found: FoundPlace[] = []
  for (const line of lines) {
    const text = line.letters.map((letter) => letter || " ").join("")
    // Where each unit of the text is among the letters: a letter may be two units long.
    const letterAt: number[] = []
    line.letters.forEach((letter, at) => {
      for (let unit = 0; unit < (letter || " ").length; unit++)
        letterAt.push(at)
    })
    const spans: [number, number][] = []
    if ("pattern" in sought) {
      const { find } = PATTERNS[sought.pattern]
      for (const match of text.matchAll(new RegExp(find.source, "g"))) {
        const said = match[0]
        if (sought.pattern === "card" && !passesCardCheck(said)) continue
        if (sought.pattern === "phone") {
          const figures = figuresIn(said)
          // A date is no phone number, and neither is a card number.
          if (
            figures < 7 ||
            figures > 15 ||
            passesCardCheck(said) ||
            DATE.test(said)
          )
            continue
        }
        spans.push([match.index, match.index + said.length])
      }
    } else if ("shape" in sought) {
      const search = shapeSearch(sought.shape)
      if (!search) return []
      for (const match of text.matchAll(search))
        spans.push([match.index, match.index + match[0].length])
    } else {
      const words = sought.words.trim()
      if (!words) return []
      const hay = sought.matchCase ? text : text.toLowerCase()
      const needle = sought.matchCase ? words : words.toLowerCase()
      let from = 0
      for (;;) {
        const at = hay.indexOf(needle, from)
        if (at < 0) break
        spans.push([at, at + needle.length])
        from = at + needle.length
      }
    }
    for (const [start, end] of spans) {
      const first = letterAt[start]
      const last = letterAt[end - 1]
      found.push({
        text: text.slice(start, end),
        quad: around(line.quads.slice(first, last + 1)),
      })
      if (found.length >= MOST_FOUND) return found
    }
  }
  return found
}

/**
 * Under how many marks something is still drawn, in a picture of the page
 * made after their content was taken out and before their boxes are put
 * on. Where a mark emptied the page there is nothing (see-through), or the
 * white a picture's pixels are made. One colour all over the mark is the
 * ground something stood on (the tint of a table's row, the fill of a
 * form's box) and shows nothing of what stood there. Anything else is
 * something that was not taken out: a drawing that reaches beyond the mark.
 * @param pixels Red, green, blue and how solid, for each pixel, row by row.
 * @param scale Pixels to a point.
 * @param boxes The marks, on the page as it is shown, in points.
 */
/** How far two pixels of one flat colour may differ, in each part. */
const FLAT = 6

export function residueIn(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
  boxes: readonly Box[]
) {
  let residue = 0
  for (const box of boxes) {
    // A point inside the mark's edge: what lies beside a mark may touch its edge.
    const inset = 1
    const left = Math.max(0, Math.ceil((box.x + inset) * scale))
    const top = Math.max(0, Math.ceil((box.y + inset) * scale))
    const right = Math.min(
      width,
      Math.floor((box.x + box.width - inset) * scale)
    )
    const bottom = Math.min(
      height,
      Math.floor((box.y + box.height - inset) * scale)
    )
    // The first pixel with something on it, whether any pixel is empty,
    // and whether another pixel is of another colour than the first.
    let first = -1
    let empty = false
    let varied = false
    for (let y = top; y < bottom && !(first >= 0 && (empty || varied)); y++)
      for (let x = left; x < right; x++) {
        const at = (y * width + x) * 4
        // Nothing there, or white.
        if (
          pixels[at + 3] <= 8 ||
          (pixels[at] >= 247 && pixels[at + 1] >= 247 && pixels[at + 2] >= 247)
        ) {
          empty = true
          continue
        }
        if (first < 0) first = at
        else if (
          [0, 1, 2, 3].some(
            (part) => Math.abs(pixels[at + part] - pixels[first + part]) > FLAT
          )
        )
          varied = true
      }
    // One colour all over is a ground something stood on, and shows nothing of it.
    if (first >= 0 && (empty || varied)) residue++
  }
  return residue
}

/** Whether a point lies in one of some boxes. */
export const inBoxes = (
  boxes: readonly Box[],
  x: number,
  y: number,
  inset = 0
) =>
  boxes.some(
    (box) =>
      x >= box.x + inset &&
      x <= box.x + box.width - inset &&
      y >= box.y + inset &&
      y <= box.y + box.height - inset
  )

/** Whether two boxes lie over one another. */
export const overlaps = (one: Box, two: Box) =>
  one.x < two.x + two.width &&
  two.x < one.x + one.width &&
  one.y < two.y + two.height &&
  two.y < one.y + one.height

/** What applying did in some changes, added up. */
export function appliedIn(changes: readonly RedactChange[]) {
  const sum = { places: 0, pages: 0, residue: 0, notes: 0, fields: 0 }
  for (const change of changes)
    for (const pages of change.done ?? [])
      for (const page of pages) {
        sum.places += page.boxes.length
        sum.pages++
        sum.residue += page.residue
        sum.notes += page.notes
        sum.fields += page.fields
      }
  return sum
}
