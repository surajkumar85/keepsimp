/**
 * Find and replace in the words a file already has. Words are looked for
 * line by line and, where lines are one paragraph, in the paragraph as one
 * text, so that words a line break parted are found too. Each place is
 * changed as a line or a paragraph is changed by hand: the old letters are
 * taken out of the file and the new ones written in the same font.
 *
 * This is the part that needs no engine: where some words are in a text,
 * what the text says with others in their place, and what is shown of a
 * place before it is changed.
 */
import type { Box } from "./geometry"
import type { FlowOp } from "./paragraphs"
import { SOFT, type TextOp } from "./retext"

/** What is looked for, and how. */
export interface Query {
  /** The words that are looked for. */
  find: string
  /** Capitals and small letters are told apart. */
  matchCase: boolean
  /** Only whole words are found: "art" not in "part". */
  wholeWords: boolean
}

/** The longest words that are looked for or put in their place, and the most places that are listed. */
export const LONGEST_FIND = 500
export const MOST_FOUND = 5000

/** A stretch of a text: from a letter up to, and not with, another. Counted in letters, not in the units a string is stored in. */
export type Span = [start: number, end: number]

/** A line, or the lines of a paragraph, in which the words were found. */
export interface Found {
  page: number
  /** A line by itself, or lines that are one paragraph. */
  kind: "line" | "block"
  /** Its lines from the top down: where each is and what it says, by which they are found again. */
  lines: { box: Box; was: string }[]
  /** What it says as one text. */
  text: string
  /** Where in that text the words are, each place once, from the start. */
  spans: Span[]
  /** The editor's fonts that stand in for letters its own fonts lack, by key: to be ready before anything is written. */
  fonts: string[]
}

const WORD = /[\p{L}\p{N}_]/u

/** What was asked for as it arrives from the page, or null when nothing can be looked for. */
export function readQuery(value: unknown): Query | null {
  if (typeof value !== "object" || value === null) return null
  const { find, matchCase, wholeWords } = value as Record<string, unknown>
  if (typeof find !== "string" || !find.trim() || find.length > LONGEST_FIND)
    return null
  return {
    find,
    matchCase: matchCase === true,
    wholeWords: wholeWords === true,
  }
}

/**
 * Where some words are in a text. A place where a word may be broken (a
 * soft hyphen) is no letter: "borrower" is found in a word that a line
 * break parted. Runs of spaces in what is looked for match any run of
 * spaces and line ends.
 * @returns The places, from the start, none lying over another.
 */
export function findIn(text: string, query: Query): Span[] {
  const fold = (letter: string) => {
    if (query.matchCase) return letter
    const small = letter.toLowerCase()
    // A letter whose small form is more than one letter is left as it is.
    return Array.from(small).length === 1 ? small : letter
  }
  // The text without its soft hyphens, each letter with where it is in the text.
  const letters: string[] = []
  const places: number[] = []
  Array.from(text).forEach((letter, at) => {
    if (letter === SOFT) return
    letters.push(/\s/.test(letter) ? " " : fold(letter))
    places.push(at)
  })
  const wanted = Array.from(query.find.trim().replace(/\s+/g, " ")).map(fold)
  const spans: Span[] = []
  if (!wanted.length) return spans
  let from = 0
  while (from + wanted.length <= letters.length) {
    // Letter by letter; a space in what is looked for takes every space that is there.
    let at = from
    let ok = true
    for (const letter of wanted) {
      if (letter === " ") {
        if (letters[at] !== " ") {
          ok = false
          break
        }
        while (letters[at] === " ") at++
      } else if (letters[at] === letter) at++
      else {
        ok = false
        break
      }
    }
    const whole =
      !query.wholeWords ||
      (!(
        from > 0 &&
        WORD.test(letters[from - 1]) &&
        WORD.test(letters[from])
      ) &&
        !(
          at < letters.length &&
          WORD.test(letters[at]) &&
          WORD.test(letters[at - 1])
        ))
    if (ok && whole) {
      spans.push([places[from], places[at - 1] + 1])
      from = at
    } else from++
  }
  return spans
}

/**
 * A text with other words in the place of some. A soft hyphen inside what
 * is replaced goes with it.
 * @param spans The places, from the start, none lying over another.
 */
export function replaced(
  text: string,
  spans: readonly Span[],
  replacement: string
) {
  const letters = Array.from(text)
  let result = ""
  let at = 0
  for (const [start, end] of spans) {
    result += letters.slice(at, start).join("") + replacement
    at = end
  }
  return result + letters.slice(at).join("")
}

/** How many letters are shown before and after a place. */
const AROUND = 28

/**
 * A place as it is shown before it is changed: the words around it, what
 * is there and what will be.
 */
export function preview(text: string, span: Span, replacement: string) {
  const letters = Array.from(text).map((letter) =>
    /\s/.test(letter) ? " " : letter
  )
  const clean = (some: string[]) => some.filter((one) => one !== SOFT).join("")
  const from = Math.max(0, span[0] - AROUND)
  const to = Math.min(letters.length, span[1] + AROUND)
  return {
    before: (from > 0 ? "…" : "") + clean(letters.slice(from, span[0])),
    was: clean(letters.slice(span[0], span[1])),
    now: replacement,
    after: clean(letters.slice(span[1], to)) + (to < letters.length ? "…" : ""),
  }
}

/** How many places some finds hold together. */
export const placesIn = (found: readonly Found[]) =>
  found.reduce((count, one) => count + one.spans.length, 0)

/**
 * Which line or paragraph, and which place in it, the place with a number
 * is: places are counted through all that was found, from 0.
 */
export function placeAt(found: readonly Found[], number: number) {
  let left = number
  for (const [unit, one] of found.entries()) {
    if (left < one.spans.length) return { unit, span: left }
    left -= one.spans.length
  }
  return null
}

/** What is said of how much was found. */
export function foundLine(found: readonly Found[], more: boolean) {
  const places = placesIn(found)
  if (!places) return "Not found in the words of this file."
  const pages = new Set(found.map((one) => one.page)).size
  return `${more ? "More than " : ""}${places.toLocaleString("en")} place${places === 1 ? "" : "s"} on ${pages.toLocaleString("en")} page${pages === 1 ? "" : "s"}`
}

/**
 * The change that puts other words in some places of a line or paragraph
 * that was found: the same change as typing them there by hand.
 * @param spans The places of it that are to be changed.
 */
export function opFor(
  found: Found,
  spans: readonly Span[],
  replacement: string
): TextOp | FlowOp {
  const text = replaced(found.text, spans, replacement)
  return found.kind === "block"
    ? { do: "reflow", page: found.page, lines: found.lines, text }
    : {
        do: "retext",
        page: found.page,
        box: found.lines[0].box,
        was: found.lines[0].was,
        text,
      }
}
