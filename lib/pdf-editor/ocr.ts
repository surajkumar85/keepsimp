/**
 * Words read from a picture of a page (OCR), laid unseen over the page so
 * that it can be searched, selected, marked and redacted by its words.
 *
 * The reading is done on the device by Tesseract; this part needs no
 * engine. It takes what Tesseract found, in the pixels of the picture it
 * was given, to the page's points as the page is shown, from its top left
 * corner, and writes the content that lays the words on the page: letters
 * of a font that draws nothing (text that is never painted, `3 Tr`), each
 * word stretched to the width it has in the picture. That is how Tesseract
 * itself writes a PDF, and how a reader finds each word where it is seen.
 */
import type { Point } from "./geometry"
import { concat, type Matrix } from "./retext"

/** One word, from where it starts along its line, and how wide it is there. */
export interface OcrWord {
  text: string
  x: number
  width: number
}

/**
 * A line of words, in the page's points as the page is shown. `y` is the
 * bottom of the line (under the letters that reach down) where it starts,
 * at `x`; a line that is not quite level goes down `slope` for each point
 * across. `size` is how high the line is.
 */
export interface OcrLine {
  x: number
  y: number
  size: number
  slope: number
  words: OcrWord[]
}

/** What one page was read to hold: one op of a step. */
export interface OcrOp {
  page: number
  lines: OcrLine[]
}

export interface OcrChange {
  label: string
  ops: OcrOp[]
}

/** How finely a page is drawn to be read, in dots to the inch. */
export const OCR_DPI = 300
/** The most pixels a page is drawn with to be read: more takes a phone's memory and does not read better. */
export const MOST_PIXELS = 12_000_000
/** The longest side of a page as it is drawn to be read. */
export const LONGEST_SIDE = 5000
/** The most lines and words one page may be given, and the longest word. */
export const MOST_LINES = 4000
export const MOST_WORDS = 20_000
export const LONGEST_WORD = 200
/** Below this, a word was read with little certainty; it is kept, and counted. */
export const UNSURE = 60
/** Below this on average, what was read is not to be relied on: the pages are seldom printed words in English. */
export const DOUBTFUL = 50

/**
 * How much larger than its points a page is drawn to be read: 300 dots to
 * the inch, less for a large page so that it stays within what a phone
 * can hold.
 */
export function ocrZoom(width: number, height: number) {
  const zoom = OCR_DPI / 72
  if (!(width > 0) || !(height > 0)) return zoom
  return Math.min(
    zoom,
    Math.sqrt(MOST_PIXELS / (width * height)),
    LONGEST_SIDE / Math.max(width, height)
  )
}

/** A word's letters as they are kept: no control or formatting characters, nor spaces, and not too long. */
export function cleanWord(text: string) {
  return Array.from(
    text.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Z}\s]/gu, "")
  )
    .slice(0, LONGEST_WORD)
    .join("")
}

/** A box as Tesseract gives one, in pixels from the picture's top left corner. */
export interface TesseractBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** What Tesseract gives for a page, as far as it is needed here. */
export interface TesseractBlock {
  paragraphs: {
    lines: {
      bbox: TesseractBox
      baseline: TesseractBox
      words: { text: string; bbox: TesseractBox; confidence: number }[]
    }[]
  }[]
}

/** What a page was read to hold, with how sure the reading was. */
export interface PageReading {
  lines: OcrLine[]
  words: number
  /** Words read with little certainty. */
  unsure: number
  /** How sure the reading was over all its words, from 0 to 100. */
  confidence: number
}

/**
 * The lines Tesseract read in a picture of a page, in the page's points.
 * @param scale The page's points to one pixel of the picture.
 */
export function readingOf(
  blocks: readonly TesseractBlock[] | null | undefined,
  scale: number
): PageReading {
  const lines: OcrLine[] = []
  let words = 0
  let unsure = 0
  let sure = 0
  for (const block of blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        const kept: typeof line.words = []
        for (const word of line.words
          .map((word) => ({ ...word, text: cleanWord(word.text) }))
          .filter((word) => word.text && word.bbox.x1 > word.bbox.x0)
          .sort((a, b) => a.bbox.x0 - b.bbox.x0)) {
          // A mark that Tesseract gives as a word of its own (a Thai vowel,
          // say) belongs to the letter before it.
          const before = kept[kept.length - 1]
          if (before && /^\p{M}/u.test(word.text)) {
            kept[kept.length - 1] = {
              text: cleanWord(before.text + word.text),
              confidence: Math.min(before.confidence, word.confidence),
              bbox: {
                x0: before.bbox.x0,
                y0: Math.min(before.bbox.y0, word.bbox.y0),
                x1: Math.max(before.bbox.x1, word.bbox.x1),
                y1: Math.max(before.bbox.y1, word.bbox.y1),
              },
            }
          } else kept.push(word)
        }
        if (!kept.length || lines.length >= MOST_LINES) continue
        const { bbox, baseline } = line
        const run = baseline.x1 - baseline.x0
        const slope =
          run > 0
            ? Math.max(-1, Math.min(1, (baseline.y1 - baseline.y0) / run))
            : 0
        const wide = bbox.x1 - bbox.x0
        // A line that slopes takes more height in its box than it is high.
        const high = Math.max(1, bbox.y1 - bbox.y0 - Math.abs(slope) * wide)
        // The bottom of the box is the bottom of the line where it is lowest.
        const bottom = bbox.y1 - Math.max(0, slope) * wide
        const taken = kept.slice(0, Math.max(0, MOST_WORDS - words))
        if (!taken.length) continue
        lines.push({
          x: bbox.x0 * scale,
          y: bottom * scale,
          size: high * scale,
          slope,
          words: taken.map((word) => ({
            text: word.text,
            x: word.bbox.x0 * scale,
            width: (word.bbox.x1 - word.bbox.x0) * scale,
          })),
        })
        for (const word of taken) {
          words++
          sure += word.confidence
          if (word.confidence < UNSURE) unsure++
        }
      }
  return {
    lines,
    words,
    unsure,
    confidence: words ? Math.round(sure / words) : 0,
  }
}

const isPage = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < 1e5

const isNumber = (value: unknown, most = 1e5): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= most

/** A page's reading as it comes from the page or out of a draft, or null when it is not one. */
export function readOcrOp(value: unknown): OcrOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (!isPage(op.page) || !Array.isArray(op.lines)) return null
  if (op.lines.length > MOST_LINES) return null
  const lines: OcrLine[] = []
  let words = 0
  for (const item of op.lines) {
    if (typeof item !== "object" || item === null) return null
    const line = item as Record<string, unknown>
    if (!isNumber(line.x) || !isNumber(line.y) || !isNumber(line.slope, 1))
      return null
    if (!isNumber(line.size, 5000) || line.size <= 0) return null
    if (!Array.isArray(line.words) || !line.words.length) return null
    const kept: OcrWord[] = []
    for (const one of line.words) {
      if (typeof one !== "object" || one === null) return null
      const word = one as Record<string, unknown>
      if (typeof word.text !== "string") return null
      const text = cleanWord(word.text)
      if (!text || text !== word.text) return null
      if (!isNumber(word.x) || !isNumber(word.width) || word.width <= 0)
        return null
      kept.push({ text, x: word.x, width: word.width })
    }
    words += kept.length
    if (words > MOST_WORDS) return null
    lines.push({
      x: line.x,
      y: line.y,
      size: line.size,
      slope: line.slope,
      words: kept,
    })
  }
  return { page: op.page, lines }
}

/** A number as a page's content writes it. */
const number = (value: number) => String(Math.round(value * 1000) / 1000 || 0)

/** Letters as the font that draws nothing knows them: each part of UTF-16 by its own number. */
export const hexOf = (text: string) =>
  Array.from({ length: text.length }, (_, at) =>
    text.charCodeAt(at).toString(16).padStart(4, "0")
  ).join("")

/** Letters of the scripts written from right to left. */
const RIGHT_TO_LEFT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u

/**
 * A word's letters in the order they stand on the page, from the left. A
 * reader takes the letters of a page in that order and turns a run of
 * right-to-left letters round itself, one character at a time (marks
 * included), so such a word is written the other way round in the same way.
 */
export function inDrawnOrder(text: string) {
  if (!RIGHT_TO_LEFT.test(text)) return text
  return Array.from(text).reverse().join("")
}

/** Letters of the scripts written without spaces between words, and marks that belong to the letter before them. */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\u3000-\u303F\u30FC\uFF00-\uFFEF]/u

/**
 * Whether two words that follow each other on a line are written with a
 * space between them. Tesseract parts Chinese, Japanese and Thai into words
 * that the languages write together, and a search for two of them together
 * must find them; a word that begins with a mark belongs to the one before.
 */
export function spaced(before: string, after: string) {
  const last = Array.from(before).pop() ?? ""
  const first = Array.from(after)[0] ?? ""
  if (/^\p{M}/u.test(first)) return false
  return !(UNSPACED.test(last) && UNSPACED.test(first))
}

/** How wide one letter of the font that draws nothing is, for each point of its size. */
export const LETTER_WIDTH = 0.5

/**
 * What is written into a page to lay words on it unseen. Each word is
 * stretched to its width; a space between two words fills the room up to
 * the next, so that a reader joins them with one.
 * @param font The name the page knows the font that draws nothing by.
 * @param toPage From the page as it is shown to the page's own measure.
 */
export function layerOf(
  lines: readonly OcrLine[],
  font: string,
  toPage: Matrix
) {
  if (!lines.length) return ""
  const out = ["q", "BT", "3 Tr 0 Tc 0 Tw 0 Ts"]
  for (const line of lines) {
    const across = Math.hypot(1, line.slope)
    const along: Point = { x: 1 / across, y: line.slope / across }
    const at = (x: number) => line.y + line.slope * (x - line.x)
    out.push(`/${font} ${number(line.size)} Tf`)
    // Tz is a share of the letters' own width: this much for one point.
    const stretch = (length: number, letters: number) =>
      number((100 * length) / (LETTER_WIDTH * line.size * letters))
    // Words are written from the left, as they stand, whichever way they
    // read: readers put a line of right-to-left words in order themselves.
    line.words.forEach((word, index) => {
      const next = line.words[index + 1]
      const apart = !next || spaced(word.text, next.text)
      // A word never reaches into the next (Tesseract sometimes gives one the
      // width of its line), and words written together reach to the next, so
      // that no reader sees room between them.
      const room = next ? next.x - word.x : Infinity
      const width =
        room <= 0 ? word.width : apart ? Math.min(word.width, room) : room
      const place = concat(
        [along.x, along.y, along.y, -along.x, word.x, at(word.x)],
        toPage
      )
      out.push(
        `${place.map(number).join(" ")} Tm`,
        `${stretch(width * across, word.text.length)} Tz <${hexOf(inDrawnOrder(word.text))}> Tj`
      )
      if (next && apart) {
        const gap = Math.max(next.x - word.x - width, line.size / 100)
        out.push(`${stretch(gap * across, 1)} Tz <0020> Tj`)
      }
    })
  }
  out.push("ET", "Q")
  return `${out.join("\n")}\n`
}

/** How many words a step lays on its pages. */
export const wordsIn = (ops: readonly OcrOp[]) =>
  ops.reduce(
    (sum, op) =>
      sum + op.lines.reduce((all, line) => all + line.words.length, 0),
    0
  )

/** Pages counted from 0, as they are named: "page 3", "pages 2, 5 and 7", and the first ten of more. */
export function pagesNamed(pages: readonly number[]) {
  const named = pages
    .slice(0, 10)
    .map((page) => (page + 1).toLocaleString("en"))
  const more = pages.length - named.length
  if (more > 0) named.push(`${more.toLocaleString("en")} more`)
  if (named.length === 1) return `page ${named[0]}`
  return `pages ${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`
}

/** What a run of recognising came to. */
export interface OcrTally {
  /** Pages on which words were found. */
  read: number[]
  words: number
  unsure: number
  /** How sure the reading was over all its words, from 0 to 100. */
  confidence: number
  /** Pages left as they were because they have text already. */
  hadText: number[]
  /** Pages read on which no words were found. */
  blank: number[]
  /** Pages that could not be drawn or read. */
  failed: number[]
  /** Stopped before every page chosen was read. */
  stopped: boolean
}

/** What is said when recognising is done: what was laid, and what was not and why. */
export function ocrSummary(tally: OcrTally): { text: string; good: boolean } {
  const parts: string[] = []
  const { read, words } = tally
  if (read.length) {
    const count = `${words.toLocaleString("en")} word${words === 1 ? "" : "s"}`
    const unsure = tally.unsure
      ? `; ${tally.unsure.toLocaleString("en")} of them read with little certainty`
      : ""
    parts.push(
      `Words were recognised on ${pagesNamed(read)}: ${count}, ${tally.confidence}% sure on average${unsure}. They lie unseen over the pages: search or select them now, and Undo takes them all away.`
    )
  }
  const doubtful = read.length > 0 && tally.confidence < DOUBTFUL
  if (doubtful)
    parts.push(
      "Most words were read with little certainty: the pages may be handwriting, shorthand, pictures or in another language, and what was read is not to be relied on. Undo takes it away."
    )
  if (tally.stopped)
    parts.push(
      read.length
        ? "Stopped: the pages read so far are laid."
        : "Stopped before any words were found."
    )
  if (tally.hadText.length)
    parts.push(
      `${capital(pagesNamed(tally.hadText))} already ${tally.hadText.length === 1 ? "has" : "have"} text and ${tally.hadText.length === 1 ? "was" : "were"} left as ${tally.hadText.length === 1 ? "it is" : "they are"}. Turn on “Pages that have text too” to read them as well.`
    )
  if (tally.blank.length)
    parts.push(`No words were found on ${pagesNamed(tally.blank)}.`)
  if (tally.failed.length)
    parts.push(`${capital(pagesNamed(tally.failed))} could not be read.`)
  return {
    text: parts.join(" ") || "There were no pages to read.",
    good: read.length > 0 && !tally.failed.length && !doubtful,
  }
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1)
