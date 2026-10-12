/**
 * Changing the words that are already in a file. A line of a page is read
 * with the font, size and colour of each of its letters; when it is
 * changed, the old letters are taken out of the page and the new ones are
 * written in their place, each in the font of the letter it stands beside.
 *
 * The file's own font is used for every letter it has. A letter it lacks is
 * set in the closest of the editor's fonts, and the page says so.
 *
 * This is the part that needs no engine: which look each new letter takes,
 * where the letters go, and the text of what is written into the page.
 */
import type { Box, Point } from "./geometry"
import { FONT_KEYS, LARGEST_TEXT, SMALLEST_TEXT, type Colour } from "./objects"

/** The look some letters of a line have. */
export interface LineStyle {
  /** The font's name in the file. */
  font: string
  /** In points. */
  size: number
  colour: Colour
  /** How far the letters stand above the line they are written on, in points: above zero for a raised mark. */
  rise: number
  /** The editor's font that stands in for letters this font lacks, by its key. */
  standIn: string
  /** Every letter the file's font can write. Empty when it can write none: a font that is drawn, not typed. */
  letters: string
}

/** A line of a page as it can be changed. */
export interface PageLine {
  /** What it says. */
  text: string
  /** Where it is, in the page's points as the page is shown. */
  box: Box
  /** Where its first letter starts, on the line it is written on. */
  origin: Point
  /** The way it runs, as the page is shown: one point along it. Across the page from the left is 1, 0. */
  along: Point
  /** The looks its letters have. */
  styles: LineStyle[]
  /** Which of them each letter has, a number for every letter of `text`. */
  looks: number[]
  /** Why its words cannot be changed, when they cannot. It can still be taken out. */
  fixed?: string
}

/** Another look for a whole line. What is left out stays as it is. */
export interface LineLook {
  /** The size of its letters, in points. Letters of another size on the line, a raised mark, change in proportion. */
  size?: number
  colour?: Colour
  /** One of the editor's fonts, by its key: the whole line is set in it, and no longer in the file's. */
  font?: string
}

/**
 * Change a line: what it says, how it looks, where it is. With nothing to
 * say, the line is taken out.
 */
export interface TextOp {
  do: "retext"
  page: number
  /** Where the line is, by which it is found again. */
  box: Box
  /** What it says now, to be sure of changing the line that was meant. */
  was: string
  text: string
  look?: LineLook
  /** How far to move it, in points as the page is shown. */
  move?: Point
}

export interface TextChange {
  label: string
  ops: TextOp[]
  /**
   * The editor's fonts the change was written with, by key: said by the
   * engine once it has made the change, so that a draft knows which fonts
   * to have ready before it makes the change again.
   */
  fonts?: string[]
}

/** The longest a line is made, and the furthest it is moved at once. */
export const LONGEST_LINE = 2000
export const FURTHEST_MOVE = 5000

const isPart = (value: unknown) => isNumber(value) && value >= 0 && value <= 1

/** Another look for a line as it arrives, with only what a look is; undefined when there is nothing of one in it. */
function readLook(value: unknown): LineLook | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const given = value as Record<string, unknown>
  const look: LineLook = {}
  if (isNumber(given.size))
    look.size = Math.min(LARGEST_TEXT, Math.max(SMALLEST_TEXT, given.size))
  if (
    Array.isArray(given.colour) &&
    given.colour.length === 3 &&
    given.colour.every(isPart)
  )
    look.colour = [given.colour[0], given.colour[1], given.colour[2]]
  if (typeof given.font === "string" && FONT_KEYS.includes(given.font))
    look.font = given.font
  return Object.keys(look).length ? look : undefined
}

/** How far to move a line as it arrives; undefined when it is nowhere or nothing. */
function readMove(value: unknown): Point | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const { x, y } = value as Record<string, unknown>
  if (!isNumber(x) || !isNumber(y) || (!x && !y)) return undefined
  const within = (by: number) =>
    Math.min(FURTHEST_MOVE, Math.max(-FURTHEST_MOVE, by))
  return { x: within(x), y: within(y) }
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/** A change to a line as it arrives from the page or from a draft, or null when it is not one. */
export function readTextOp(value: unknown): TextOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  const box = op.box as Record<string, unknown> | null
  if (
    op.do !== "retext" ||
    !Number.isInteger(op.page) ||
    (op.page as number) < 0 ||
    typeof op.was !== "string" ||
    typeof op.text !== "string" ||
    op.was.length > LONGEST_LINE ||
    op.text.length > LONGEST_LINE ||
    typeof box !== "object" ||
    box === null ||
    !isNumber(box.x) ||
    !isNumber(box.y) ||
    !isNumber(box.width) ||
    !isNumber(box.height)
  )
    return null
  const look = readLook(op.look)
  const move = readMove(op.move)
  return {
    do: "retext",
    page: op.page as number,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    was: op.was,
    // A line is one line.
    text: op.text.replace(/[\r\n]+/g, " "),
    ...(look ? { look } : null),
    ...(move ? { move } : null),
  }
}

/** The look most letters of a line have: the one its size and colour are told by. */
export function mainStyle(line: Pick<PageLine, "styles" | "looks">) {
  const counts = new Map<number, number>()
  for (const look of line.looks) counts.set(look, (counts.get(look) ?? 0) + 1)
  const [most] = [...counts].sort((a, b) => b[1] - a[1])
  return line.styles[most?.[0] ?? 0]
}

/**
 * The looks of a line with another look laid over them: a new size scales
 * every look by as much as it scales the main one, so that a raised mark
 * stays as small and as high beside its letters; a colour is for all.
 */
export function restyled(
  line: Pick<PageLine, "styles" | "looks">,
  look: LineLook | undefined
): LineStyle[] {
  if (!look) return line.styles
  const main = mainStyle(line)
  const by = look.size && main ? look.size / main.size : 1
  return line.styles.map((style) => ({
    ...style,
    size: Math.round(style.size * by * 100) / 100,
    rise: Math.round(style.rise * by * 100) / 100,
    colour: look.colour ?? style.colour,
  }))
}

/** Text with every run of spaces as one, and none at its ends: how two readings of a line are compared. */
export const squeezed = (text: string) => text.replace(/\s+/g, " ").trim()

/** Whether a line is the one a change was meant for: at the same place, saying the same. */
export function isLine(line: Pick<PageLine, "box" | "text">, op: TextOp) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  return (
    near(line.box.x, op.box.x) &&
    near(line.box.y, op.box.y) &&
    near(line.box.width, op.box.width) &&
    near(line.box.height, op.box.height) &&
    squeezed(line.text) === squeezed(op.was)
  )
}

/**
 * Which look each letter of the new words takes. Letters that were there
 * before keep theirs: the start and the end that the old and the new words
 * share. Letters that were typed take the look of the letter before them,
 * as in any editor; at the very start, of the letter after.
 * @param looks A look for each letter of the old words.
 */
export function spreadLooks(
  was: string,
  now: string,
  looks: readonly number[]
): number[] {
  const old = Array.from(was)
  const next = Array.from(now)
  let start = 0
  while (
    start < old.length &&
    start < next.length &&
    old[start] === next[start]
  )
    start++
  let end = 0
  while (
    end < old.length - start &&
    end < next.length - start &&
    old[old.length - 1 - end] === next[next.length - 1 - end]
  )
    end++
  const typed = looks[start - 1] ?? looks[start] ?? looks[0] ?? 0
  return next.map((_, at) =>
    at < start
      ? (looks[at] ?? typed)
      : at >= next.length - end
        ? (looks[old.length - (next.length - at)] ?? typed)
        : typed
  )
}

/** The letters of some words that a font cannot write, each once, in the order they come. */
export function lacking(text: string, letters: string) {
  const has = new Set(Array.from(letters))
  return [
    ...new Set(
      Array.from(text).filter((letter) => letter.trim() && !has.has(letter))
    ),
  ]
}

/** The letters of a line's new words that will be set in a stand-in font, each once. None when the whole line is set in one of the editor's. */
export function standIns(line: PageLine, text: string, look?: LineLook) {
  if (look?.font) return []
  const looks = spreadLooks(line.text, text, line.looks)
  const letters = Array.from(text)
  return [
    ...new Set(
      letters.filter(
        (letter, at) =>
          letter.trim() &&
          !Array.from(line.styles[looks[at]]?.letters ?? "").includes(letter)
      )
    ),
  ]
}

const MONO = /mono|courier|consol|typewriter|sftt|menlo|fixed/i
const SANS =
  /sans|nimbussan|helvet|arial|frutiger|gothic|grotesk|verdana|tahoma|calibri|roboto|inter\b|segoe|univers|futura|avenir|gill|myriad|lato|din\b|akzidenz|optima/i
const SERIF =
  /serif|times|roman|nimbusrom|georgia|garamond|minion|palatino|baskerville|bodoni|caslon|century|cambria|book|didot/i

/**
 * Which of the editor's three kinds of font is closest to a font of the
 * file: by its name when the name is one that is known, and by what the
 * file says of it when it is not.
 */
export function familyOf(
  name: string,
  mono: boolean,
  serif: boolean
): "mono" | "sans" | "serif" {
  if (MONO.test(name)) return "mono"
  // "Sans" is looked for first: it is in "Sans Serif" too.
  if (SANS.test(name)) return "sans"
  if (SERIF.test(name)) return "serif"
  return mono ? "mono" : serif ? "serif" : "sans"
}

/** How wide a space is where a font has none of its own, as a share of the size of its letters. */
export const SPACE = 0.27

/** A matrix as a page's content writes one: six numbers. */
export type Matrix = [number, number, number, number, number, number]

/** One matrix after another: a point goes through the first, then the second. */
export const concat = (one: Matrix, two: Matrix): Matrix => [
  one[0] * two[0] + one[1] * two[2],
  one[0] * two[1] + one[1] * two[3],
  one[2] * two[0] + one[3] * two[2],
  one[2] * two[1] + one[3] * two[3],
  one[4] * two[0] + one[5] * two[2] + two[4],
  one[4] * two[1] + one[5] * two[3] + two[5],
]

/** The matrix that undoes one. A matrix that flattens everything onto a line has none, and is undone by nothing. */
export function inverse(matrix: Matrix): Matrix {
  const [a, b, c, d, e, f] = matrix
  const by = a * d - b * c
  if (!by) return [1, 0, 0, 1, 0, 0]
  return [
    d / by,
    -b / by,
    -c / by,
    a / by,
    (c * f - d * e) / by,
    (b * e - a * f) / by,
  ]
}

/** Some letters to be written with one font at one size and colour, from one place. */
export interface Run {
  /** The name the page knows the font by. */
  font: string
  size: number
  colour: Colour
  /** Where the first letter starts, in the page's points as the page is shown. */
  at: Point
  /** The way the letters run, as the page is shown. Left out, they run across from the left. */
  along?: Point
  /** The letters, as the numbers the font knows them by, in hexadecimal. */
  codes: string
}

/** A number as a page's content writes it: no more figures than matter, and never in the form of 1e-7. */
const number = (value: number) =>
  String(Math.round(value * 10_000) / 10_000 || 0)

/**
 * What is written into a page for some runs of letters. It asks for
 * everything it needs itself (the colour, plain filled letters set no
 * wider or narrower than they are), so that it reads the same whatever the
 * page's own content left behind.
 * @param toPage From the page as it is shown to the page's own measure.
 */
export function contentFor(runs: readonly Run[], toPage: Matrix) {
  if (!runs.length) return ""
  const lines = ["q", "BT", "0 Tr 0 Tc 0 Tw 100 Tz 0 Ts"]
  for (const run of runs) {
    // Letters stand upright on the line they run along, on a page that is
    // shown with y running down.
    const { x, y } = run.along ?? { x: 1, y: 0 }
    const place = concat([x, y, y, -x, run.at.x, run.at.y], toPage)
    lines.push(
      `${run.colour.map(number).join(" ")} rg`,
      `/${run.font} ${number(run.size)} Tf`,
      `${place.map(number).join(" ")} Tm`,
      `<${run.codes}> Tj`
    )
  }
  lines.push("ET", "Q")
  return `${lines.join("\n")}\n`
}

/** A letter to be written: which font writes it, how, and how far it moves on. */
export interface Glyph {
  /** The name the page knows its font by; empty for a space no font writes. */
  font: string
  /** Its number in that font, in hexadecimal. */
  code: string
  /** How far it moves on, in points. */
  advance: number
  size: number
  colour: Colour
  rise: number
}

/**
 * Letters as runs: each letter stands where the ones before it end, and
 * letters that follow each other in one font, size, colour and height are
 * written together. A space no font writes is only room.
 * @param origin Where the first letter starts.
 * @param along The way the line runs, as the page is shown; across from the left when left out.
 */
export function runsOf(
  glyphs: readonly Glyph[],
  origin: Point,
  along: Point = { x: 1, y: 0 }
): Run[] {
  const runs: Run[] = []
  const turned = along.x !== 1 || along.y !== 0
  let far = 0
  let last: Glyph | null = null
  for (const glyph of glyphs) {
    const same =
      last !== null &&
      last.font === glyph.font &&
      last.size === glyph.size &&
      last.rise === glyph.rise &&
      last.colour.every((part, at) => part === glyph.colour[at])
    if (glyph.font) {
      if (same) runs[runs.length - 1].codes += glyph.code
      else
        runs.push({
          font: glyph.font,
          size: glyph.size,
          colour: glyph.colour,
          // Along the line, and above it by as much as the letter is raised:
          // "above" is to the left of the way the line runs.
          at: {
            x: origin.x + along.x * far + along.y * glyph.rise,
            y: origin.y + along.y * far - along.x * glyph.rise,
          },
          ...(turned ? { along } : null),
          codes: glyph.code,
        })
    }
    // After room that no font wrote, the next letters begin anew.
    last = glyph.font ? glyph : null
    far += glyph.advance
  }
  return runs
}
