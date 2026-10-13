/**
 * Paragraphs: lines of a page that were set as one piece of running text,
 * changed as one. The words flow again within the width the paragraph had,
 * with its alignment and the distance between its lines.
 *
 * A file does not say which lines belong together; it only places letters.
 * So paragraphs are found by what running text looks like: lines in one
 * font, one under the other at one distance, each of them full, which is to
 * say that the first word of the next would not have fitted behind it. A
 * stack of short lines (an address, the cells of a table) is not a
 * paragraph, and its lines stay lines.
 *
 * This is the part that needs no engine: which lines are a paragraph, what
 * it says as one text, and where the letters of its new words go.
 */
import type { Box, Point } from "./geometry"
import {
  LONGEST_LINE,
  mainStyle,
  readLook,
  readMove,
  readTextOp,
  SOFT,
  SPACE,
  type Glyph,
  type LineLook,
  type PageLine,
  type TextOp,
  type Wrote,
} from "./retext"

export { SOFT }

export const ALIGNS = ["left", "centre", "right", "justify"] as const
/** How the lines of a paragraph stand between its edges. */
export type Align = (typeof ALIGNS)[number]

/** The most lines a paragraph has, and the longest its text is. */
export const MOST_LINES = 200
export const LONGEST_BLOCK = 20_000

/** Lines of a page that are one paragraph. */
export interface Block {
  /** Which lines of the page, from the top down. */
  lines: number[]
  /** Where it is, in the page's points as the page is shown. */
  box: Box
}

/** How a paragraph is set. */
export interface Shape {
  /** Its left and right edges. */
  left: number
  right: number
  /** How far its first line starts to the right of the others; less than nothing when it hangs out to the left. */
  indent: number
  /** From one line to the next, in points. */
  leading: number
  align: Align
}

/** As near as edges of lines are when they are meant to be the same, in points. */
const NEAR = 1.5
/**
 * How wide running text is at the least, in letters' heights. Two lines
 * say little: the first of any two is "full" when it is the longer, so two
 * lines are only taken for running text when they are as wide as a column
 * of it. Three and more, each full, say it themselves.
 */
const NARROWEST = 12
const NARROWEST_PAIR = 18

const rightOf = (line: PageLine) => line.box.x + line.box.width
const middleOf = (line: PageLine) => line.box.x + line.box.width / 2
const sizeOf = (line: PageLine) => mainStyle(line)?.size ?? 0
/** How far apart the least and the most of some values are; there is always one. */
const spread = (values: readonly number[]) =>
  Math.max(...values) - Math.min(...values)
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** What a line begins with when it begins something: a capital letter, a figure, a mark. */
const HEAD = /[\p{Lu}\p{N}\p{P}\p{S}]/u

/** A line that can be part of a paragraph: one that runs across, whose words can be changed. */
const flows = (line: PageLine) =>
  line.along.x === 1 && !line.fixed && sizeOf(line) > 0

/**
 * How lines that are one paragraph are set: their edges, how far the first
 * line is set in, the distance between lines, and whether they are set to
 * the left, to the right, about their middle, or to both edges.
 * @param lines From the top down; at least one.
 */
export function shapeOf(lines: readonly PageLine[]): Shape {
  const [first] = lines
  const size = sizeOf(first) || 12
  const lefts = lines.map((line) => line.box.x)
  const rights = lines.map(rightOf)
  const right = Math.max(...rights)
  const steps = lines
    .slice(1)
    .map((line, at) => line.origin.y - lines[at].origin.y)
  const leading = steps.length ? median(steps) : Math.round(size * 120) / 100
  if (lines.length === 1)
    return { left: lefts[0], right, indent: 0, leading, align: "left" }

  // Every line but the first begins at the left edge, and every line but
  // the last ends at the right one, in text that is set to that edge.
  const rest = lefts.slice(1)
  const full = rights.slice(0, -1)
  const toLeft =
    spread(rest) <= NEAR * 2 &&
    // Two lines say nothing about a left edge unless they share it or the first is set in.
    (lines.length > 2 || lefts[0] >= lefts[1] - NEAR)
  const toRight = spread(full) <= NEAR * 2
  let align: Align = "left"
  if (toLeft && toRight && lines.length > 2) align = "justify"
  else if (toLeft) align = "left"
  else if (spread(rights) <= NEAR * 2) align = "right"
  else if (spread(lines.map(middleOf)) <= NEAR * 2) align = "centre"

  if (align === "left" || align === "justify") {
    const left = Math.min(...rest)
    return { left, right, indent: lefts[0] - left, leading, align }
  }
  return { left: Math.min(...lefts), right, indent: 0, leading, align }
}

/**
 * The paragraphs among the lines of a page: every run of two lines or more
 * that was set as one piece of running text.
 * @param lines From the top of the page down.
 */
export function blocksOf(lines: readonly PageLine[]): Block[] {
  // Lines that follow each other in one column, in one font, at one distance.
  const chains: number[][] = []
  lines.forEach((line, index) => {
    if (!flows(line)) return
    const size = sizeOf(line)
    const font = mainStyle(line)?.font
    for (let at = chains.length - 1; at >= 0; at--) {
      const chain = chains[at]
      const above = lines[chain[chain.length - 1]]
      const step = line.origin.y - above.origin.y
      const shared =
        Math.min(rightOf(line), rightOf(above)) -
        Math.max(line.box.x, above.box.x)
      if (
        mainStyle(above)?.font !== font ||
        Math.abs(sizeOf(above) - size) > 0.25 ||
        step < size * 0.8 ||
        step > size * 2.2 ||
        shared < Math.min(line.box.width, above.box.width) / 2
      )
        continue
      // A third line is as far from the second as the second from the first.
      const before =
        chain.length > 1
          ? above.origin.y - lines[chain[chain.length - 2]].origin.y
          : step
      if (Math.abs(step - before) > size * 0.12) continue
      chain.push(index)
      return
    }
    chains.push([index])
  })

  const blocks: Block[] = []
  for (const chain of chains) {
    if (chain.length < 2) continue
    const of = chain.map((index) => lines[index])
    const size = sizeOf(of[0])
    const left = Math.min(...of.map((line) => line.box.x))
    const right = Math.max(...of.map(rightOf))
    const width = right - left
    // Running text is wide. A stack of short lines is something else.
    if (width < size * NARROWEST) continue
    // Which edge the lines keep to tells how much room a line had left.
    const share = (values: number[], edge: number) =>
      values.filter((value) => Math.abs(value - edge) <= NEAR).length /
      values.length
    const lefts = of.map((line) => line.box.x)
    // Lines set about their middle share neither edge; lines of one width
    // share all three, and are set to the left like most text.
    const centred =
      spread(of.map(middleOf)) <= NEAR * 2 && spread(lefts) > NEAR * 2
    const keepsLeft = !centred && share(lefts, left) >= 0.5
    if (!centred && !keepsLeft && share(of.map(rightOf), right) < 0.5) continue
    const gap = SPACE * size
    /** Whether a line is full: the first word of the next would not have fitted behind it. */
    const full = (at: number) => {
      const room = keepsLeft
        ? right - rightOf(of[at])
        : width - of[at].box.width
      return room < gap + (of[at + 1].first ?? of[at + 1].box.width) - 0.5
    }
    /** Whether a line begins a paragraph by being set in, where the one above it is not. */
    const setIn = (at: number) =>
      keepsLeft &&
      of[at].box.x - left > size * 0.5 &&
      of[at - 1].box.x - left <= NEAR
    let run: number[] = [chain[0]]
    const end = () => {
      // Lines that each begin with a capital, a figure or a mark are a list,
      // a poem or the rows of a table: in running text a line begins where
      // the one before it ran out of room, in the middle of a sentence.
      const listed =
        run.length > 2 &&
        run
          .slice(1)
          .every((index) => HEAD.test(Array.from(lines[index].text)[0]))
      if (
        !listed &&
        (run.length > 2 || (run.length === 2 && width >= size * NARROWEST_PAIR))
      ) {
        const these = run.map((index) => lines[index])
        const x = Math.min(...these.map((line) => line.box.x))
        const y = Math.min(...these.map((line) => line.box.y))
        blocks.push({
          lines: run,
          box: {
            x,
            y,
            width: Math.max(...these.map(rightOf)) - x,
            height:
              Math.max(...these.map((line) => line.box.y + line.box.height)) -
              y,
          },
        })
      }
    }
    for (let at = 1; at < chain.length; at++) {
      if (full(at - 1) && !setIn(at) && run.length < MOST_LINES)
        run.push(chain[at])
      else {
        end()
        run = [chain[at]]
      }
    }
    end()
  }
  return blocks.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

const LETTER = /\p{L}/u
const SMALL = /\p{Ll}/u
/** A word without what stands around it: brackets, quotation marks, full stops and commas. */
const bare = (word: string) =>
  word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase()

/**
 * The words of a page that stand whole on a line, each as it is written:
 * what tells whether a word that was broken at the end of a line has a
 * hyphen of its own. A page that writes "long-term" somewhere on a line
 * means "long-term" where a line ends in "long-" and the next begins with
 * "term".
 */
export function wordsOf(lines: readonly Pick<PageLine, "text">[]) {
  const words = new Set<string>()
  for (const { text } of lines) {
    const all = text.split(/\s+/)
    all.forEach((word, at) => {
      // The last word of a line that ends in a hyphen is half a word.
      if (at === all.length - 1 && word.endsWith("-")) return
      const known = bare(word)
      if (known) words.add(known)
    })
  }
  return words
}

/**
 * What the lines of a paragraph say as one text. Lines are joined by a
 * space. A word that was broken at the end of a line (a hyphen after a
 * letter, and a small letter beginning the next line) is joined into one
 * word with a soft hyphen where it was broken. It keeps its hyphen when
 * the word has hyphens of its own before or behind that one
 * (state-of-the-art, English-to-German), or when the page writes it with
 * that hyphen somewhere on a line.
 * @param words The words of the page that stand whole on a line (`wordsOf`).
 * @returns The text; a look for each of its letters, as numbers into the
 * looks of all the lines, one line's after another's; and where in the text
 * each line begins. All are counted in letters, not in the units a string
 * is stored in.
 */
export function joined(
  lines: readonly Pick<PageLine, "text" | "looks" | "styles">[],
  words: ReadonlySet<string> = new Set()
) {
  const letters: string[] = []
  const looks: number[] = []
  const starts: number[] = []
  let offset = 0
  lines.forEach((line, index) => {
    starts.push(letters.length)
    const own = Array.from(line.text)
    own.forEach((letter, at) => {
      letters.push(letter)
      looks.push(offset + (line.looks[at] ?? 0))
    })
    offset += line.styles.length
    const next = lines[index + 1]
    if (!next) return
    const last = looks[looks.length - 1] ?? 0
    const word = line.text.slice(line.text.lastIndexOf(" ") + 1)
    const broken =
      own.length > 1 &&
      own[own.length - 1] === "-" &&
      LETTER.test(own[own.length - 2])
    if (!broken) {
      letters.push(" ")
      looks.push(last)
      return
    }
    const rest = next.text.split(" ")[0]
    if (
      SMALL.test(Array.from(next.text)[0] ?? "") &&
      !word.slice(0, -1).includes("-") &&
      !rest.includes("-") &&
      !words.has(bare(word + rest))
    ) {
      // The hyphen was only there because the line ended.
      letters[letters.length - 1] = SOFT
    }
    // A hyphen that is the word's own stays, and the word goes on behind it.
  })
  return { text: letters.join(""), looks, starts }
}

/**
 * A paragraph as one line, for everything that is asked of a line: what it
 * says, where it is and the looks of its letters.
 * @param lines From the top down; at least one.
 */
export function asLine(
  lines: readonly PageLine[],
  words?: ReadonlySet<string>
): PageLine {
  const { text, looks } = joined(lines, words)
  const x = Math.min(...lines.map((line) => line.box.x))
  const y = Math.min(...lines.map((line) => line.box.y))
  return {
    text,
    box: {
      x,
      y,
      width: Math.max(...lines.map(rightOf)) - x,
      height:
        Math.max(...lines.map((line) => line.box.y + line.box.height)) - y,
    },
    origin: lines[0].origin,
    along: lines[0].along,
    styles: lines.flatMap((line) => line.styles),
    looks,
  }
}

/** The words of a text that a soft hyphen joined, each once, as they read when they are not broken. */
export const joinedWords = (text: string) => [
  ...new Set(
    text
      .split(/\s+/)
      .filter((word) => word.includes(SOFT))
      .map((word) => bare(word.replaceAll(SOFT, "")))
      .filter(Boolean)
  ),
]

/**
 * The first line of a paragraph that a change touches: the lines before it
 * say what they said, and are left as they are in the file.
 * @param starts Where in the old text each line begins, in letters.
 * @returns The number of the line, or of lines when nothing was changed.
 */
export function firstChanged(
  starts: readonly number[],
  was: string,
  now: string
) {
  const old = Array.from(was)
  const next = Array.from(now)
  let same = 0
  while (same < old.length && same < next.length && old[same] === next[same])
    same++
  if (same === old.length && same === next.length) return starts.length
  let line = 0
  while (line + 1 < starts.length && starts[line + 1] <= same) line++
  return line
}

/**
 * Change a paragraph: what it says, how it looks, how it is set, where it
 * is. With nothing to say, its lines are taken out.
 */
export interface FlowOp {
  do: "reflow"
  page: number
  /** Its lines from the top down: where each is and what it says, by which they are found again. */
  lines: { box: Box; was: string }[]
  /** What it says now, as one text; a new line where one is to begin whatever the width. */
  text: string
  look?: LineLook
  align?: Align
  /** How far to move it, in points as the page is shown. */
  move?: Point
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/** A change to a paragraph as it arrives from the page or from a draft, or null when it is not one. */
export function readFlowOp(value: unknown): FlowOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (
    op.do !== "reflow" ||
    !Number.isInteger(op.page) ||
    (op.page as number) < 0 ||
    typeof op.text !== "string" ||
    op.text.length > LONGEST_BLOCK ||
    !Array.isArray(op.lines) ||
    !op.lines.length ||
    op.lines.length > MOST_LINES
  )
    return null
  const lines: FlowOp["lines"] = []
  for (const given of op.lines as unknown[]) {
    const line = (given ?? {}) as Record<string, unknown>
    const box = (line.box ?? {}) as Record<string, unknown>
    if (
      typeof line.was !== "string" ||
      line.was.length > LONGEST_LINE ||
      !isNumber(box.x) ||
      !isNumber(box.y) ||
      !isNumber(box.width) ||
      !isNumber(box.height)
    )
      return null
    lines.push({
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      was: line.was,
    })
  }
  const look = readLook(op.look)
  const move = readMove(op.move)
  return {
    do: "reflow",
    page: op.page as number,
    lines,
    // Line ends of every kind are one kind; a tab is a space.
    text: op.text.replace(/\r\n?/g, "\n").replace(/\t/g, " "),
    ...(look ? { look } : null),
    ...(ALIGNS.includes(op.align as Align)
      ? { align: op.align as Align }
      : null),
    ...(move ? { move } : null),
  }
}

/** A change to a page's own text as it arrives, a line's or a paragraph's, or null when it is neither. */
export const readTextChange = (value: unknown): TextOp | FlowOp | null =>
  readTextOp(value) ?? readFlowOp(value)

/** What changes to paragraphs wrote, as it comes out of storage: one for each change, or nothing when it is not that. */
export function readWrote(value: unknown, count: number) {
  if (!Array.isArray(value) || value.length !== count) return undefined
  const all: (Wrote | null)[] = []
  for (const given of value as unknown[]) {
    if (given === null) {
      all.push(null)
      continue
    }
    const wrote = (given ?? {}) as Record<string, unknown>
    if (
      !Number.isInteger(wrote.from) ||
      (wrote.from as number) < 0 ||
      !Array.isArray(wrote.lines) ||
      wrote.lines.length > MOST_LINES * 4
    )
      return undefined
    const lines: Wrote["lines"] = []
    for (const one of wrote.lines as unknown[]) {
      const line = (one ?? {}) as Record<string, unknown>
      const box = (line.box ?? {}) as Record<string, unknown>
      if (
        typeof line.text !== "string" ||
        line.text.length > LONGEST_LINE ||
        !isNumber(box.x) ||
        !isNumber(box.y) ||
        !isNumber(box.width) ||
        !isNumber(box.height)
      )
        return undefined
      lines.push({
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        text: line.text,
      })
    }
    all.push({ from: wrote.from as number, lines })
  }
  return all
}

/** A letter of a paragraph's new words, as it will be written. */
export interface Piece extends Glyph {
  /** The letter it writes. */
  letter: string
  /** For a soft hyphen: the hyphen that is written when a line ends there. */
  soft?: Glyph
}

/** A line of a paragraph as it was laid out. */
export interface Flowed {
  /** What is written, from the line's start. Room no font writes is among it. */
  glyphs: Glyph[]
  /** What it says. */
  text: string
  /** How wide it is. */
  width: number
  /** How far from the paragraph's left edge it starts, beyond what its first line is set in. */
  shift: number
  /** Where each letter that was given stands on the line: which letter it is, how far from the line's start, how wide. */
  places: { at: number; x: number; advance: number }[]
}

/** What is written for a letter, without what the letter is. */
export const glyphOf = (piece: Glyph): Glyph => ({
  font: piece.font,
  code: piece.code,
  advance: piece.advance,
  size: piece.size,
  colour: piece.colour,
  rise: piece.rise,
})

const isBlank = (piece: Piece) => !piece.letter.trim()
const WORD = /[\p{L}\p{N}]/u

/**
 * Lay the letters of a paragraph out in lines. A line is broken at a
 * space, at a soft hyphen (which then shows) or behind a hyphen in a word,
 * and where the text has a new line. A word wider than the line stays
 * whole and runs over.
 * @param widthOf How wide a line may be, by its number from 0.
 * @param widest The widest a gap between words is made to spread a line to
 * both edges. A line that would need wider ones is left as wide as its
 * words are: gaps that wide read as the end of the line.
 */
export function flow(
  pieces: readonly Piece[],
  widthOf: (line: number) => number,
  align: Align,
  widest = Infinity
): Flowed[] {
  /** A letter with which of the letters given it is. */
  type Placed = Piece & { at: number }
  const lines: Flowed[] = []
  const sum = (some: readonly Glyph[]) =>
    some.reduce((far, glyph) => far + glyph.advance, 0)

  /** Put a line down. A line the text itself ends is not spread to both edges. */
  const close = (line: Placed[], ended: boolean, hyphen?: Glyph) => {
    // Spaces at a line's end are not written. (It never begins with one.)
    let to = line.length
    while (to > 0 && isBlank(line[to - 1])) to--
    const shown = line.slice(0, to).filter((piece) => piece.letter !== SOFT)
    const available = widthOf(lines.length)
    const natural = sum(shown) + (hyphen?.advance ?? 0)
    const blanks = shown.filter(isBlank)
    const gaps = blanks.length
    const spare = available - natural
    const share = gaps ? spare / gaps : 0
    const each =
      align === "justify" &&
      !ended &&
      share > 0 &&
      blanks.every((blank) => blank.advance + share <= widest)
        ? share
        : 0
    const glyphs: Glyph[] = []
    const places: Flowed["places"] = []
    let far = 0
    for (const piece of shown) {
      const glyph = glyphOf(piece)
      glyphs.push(glyph)
      places.push({ at: piece.at, x: far, advance: glyph.advance })
      far += glyph.advance
      // The room that spreads a line to both edges follows each of its spaces.
      if (each && isBlank(piece)) {
        glyphs.push({ ...glyph, font: "", code: "", advance: each })
        far += each
      }
    }
    if (hyphen) glyphs.push(hyphen)
    lines.push({
      glyphs,
      text: shown.map((piece) => piece.letter).join("") + (hyphen ? "-" : ""),
      width: natural + each * gaps,
      shift: align === "right" ? spare : align === "centre" ? spare / 2 : 0,
      places,
    })
  }

  let line: Placed[] = []
  /** The last place the line may be broken: which piece, and whether that piece goes (a space, a soft hyphen) or stays (a hyphen). */
  let split: { at: number; stays: boolean } | null = null
  pieces.forEach((given, at) => {
    const piece = { ...given, at }
    if (piece.letter === "\n") {
      close(line, true)
      line = []
      split = null
      return
    }
    // A line does not begin with a space.
    if (isBlank(piece) && !line.length) return
    line.push(piece)
    if (isBlank(piece) || piece.letter === SOFT) {
      split = { at: line.length - 1, stays: false }
      return
    }
    while (split && sum(line) > widthOf(lines.length) + 0.5) {
      const mark = line[split.at]
      close(
        line.slice(0, split.at + (split.stays ? 1 : 0)),
        false,
        mark.letter === SOFT ? mark.soft : undefined
      )
      // What is left begins with a letter: a space behind the break would have been the break.
      line = line.slice(split.at + 1)
      split = null
    }
    const before = line[line.length - 2]
    if (piece.letter === "-" && before && WORD.test(before.letter))
      split = { at: line.length - 1, stays: true }
  })
  if (line.length) close(line, true)
  return lines
}

/**
 * Where the letters of some words are after a change: a letter of the
 * start and of the end that the old and the new words share is the letter
 * it was, at the place it now has. A letter between was typed over.
 * @returns For a letter of the old words, by its number, its number in the new ones, or null when it is gone.
 */
export function carry(was: string, now: string) {
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
  return (at: number) =>
    at < 0 || at >= old.length
      ? null
      : at < start
        ? at
        : at >= old.length - end
          ? at + next.length - old.length
          : null
}
