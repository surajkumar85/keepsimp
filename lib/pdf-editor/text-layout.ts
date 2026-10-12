/**
 * Breaking the words of a text box into lines. The page measures the words
 * with the font it shows them in, so the lines a person sees while typing
 * are the lines that are written into the file.
 */
import type { TextAlign } from "./objects"

/** How wide some text is, in the same units as the width it has to fit. */
export type Measure = (text: string) => number

/** A word longer than the line is broken where it runs out of room; at least one letter stays on a line. */
function breakWord(word: string, width: number, measure: Measure) {
  const parts: string[] = []
  let part = ""
  // By letter as a person sees it, so that a letter and its accent stay together.
  for (const letter of Array.from(word)) {
    if (part && measure(part + letter) > width) {
      parts.push(part)
      part = letter
    } else part += letter
  }
  parts.push(part)
  return parts
}

/**
 * The lines some text takes in a box of a given width. A line ends where the
 * person pressed Enter, and before the word that would not fit. Spaces where
 * a line was broken are dropped, and so are spaces at the end of a line;
 * spaces at the start of a paragraph stay, and an empty line stays empty.
 */
export function breakLines(text: string, width: number, measure: Measure) {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = ""
    for (const token of paragraph.match(/\s+|\S+/g) ?? []) {
      if (!token.trim()) {
        // Spaces follow a word, or indent a paragraph. A line that is broken
        // starts with its word, so spaces at a break go with the line before.
        line += token
        continue
      }
      if (measure(line + token) <= width) {
        line += token
        continue
      }
      if (line.trim()) lines.push(line.trimEnd())
      const parts =
        measure(token) <= width ? [token] : breakWord(token, width, measure)
      lines.push(...parts.slice(0, -1))
      line = parts[parts.length - 1]
    }
    lines.push(line.trimEnd())
  }
  return lines
}

/** How far from the left of its box a line starts. */
export function lineStart(
  align: TextAlign,
  lineWidth: number,
  boxWidth: number
) {
  if (align === "centre") return (boxWidth - lineWidth) / 2
  if (align === "right") return boxWidth - lineWidth
  return 0
}

/** Where the letters of a line stand: this far below the top of the line, as a share of their size. */
export const BASELINE = 0.95
