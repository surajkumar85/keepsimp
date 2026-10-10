import type { Size } from "@/lib/image-compressor/geometry"

/** One line of a contents page: what it is called and the page it starts on. */
export interface ContentsEntry {
  title: string
  /** Page number in the result, from 1. */
  page: number
}

export interface ContentsLine {
  /** The title as drawn, shortened with "…" when it would not fit. */
  title: string
  number: string
  /** Where the text sits, in points from the page's bottom-left corner. */
  titleX: number
  numberX: number
  y: number
  /** The dotted line from the title to the number, when there is room for one. */
  leader: { from: number; to: number } | null
  /** The area that leads to the page when pressed: left, bottom, right, top. */
  area: [number, number, number, number]
  /** The page it leads to, counted from 0. */
  target: number
}

export interface ContentsPage {
  /** "Contents", on the first page only. */
  heading: { text: string; x: number; y: number; size: number } | null
  lines: ContentsLine[]
}

export const CONTENTS_HEADING = "Contents"
export const HEADING_SIZE = 20
export const LINE_SIZE = 11
const LINE_HEIGHT = 22
const HEADING_SPACE = 44
const GAP = 8

/** Space kept clear around the text: a tenth of the page's width, within reason. */
const marginOf = (page: Size) =>
  Math.max(24, Math.min(64, Math.round(page.width / 10)))

const linesOn = (page: Size, first: boolean) =>
  Math.max(
    1,
    Math.floor(
      (page.height - marginOf(page) * 2 - (first ? HEADING_SPACE : 0)) /
        LINE_HEIGHT
    )
  )

/** How many pages a list of this many entries takes. */
export function contentsPageCount(entries: number, page: Size) {
  if (entries <= 0) return 0
  const first = linesOn(page, true)
  return entries <= first
    ? 1
    : 1 + Math.ceil((entries - first) / linesOn(page, false))
}

/**
 * Lay out contents pages.
 * @param measure The width of some text at a size, in points.
 */
export function layoutContents(
  entries: readonly ContentsEntry[],
  page: Size,
  measure: (text: string, size: number) => number
): ContentsPage[] {
  const margin = marginOf(page)
  const right = page.width - margin
  const pages: ContentsPage[] = []
  let at = 0
  while (at < entries.length) {
    const first = pages.length === 0
    const top = page.height - margin - (first ? HEADING_SPACE : 0)
    const lines = entries
      .slice(at, at + linesOn(page, first))
      .map((entry, row): ContentsLine => {
        const number = String(entry.page)
        const numberX = right - measure(number, LINE_SIZE)
        const room = numberX - GAP - margin
        let title = entry.title.trim() || "Untitled"
        if (measure(title, LINE_SIZE) > room) {
          // Shorten a letter at a time until the title and its "…" fit.
          const letters = [...title]
          while (
            letters.length > 1 &&
            measure(`${letters.join("").trimEnd()}…`, LINE_SIZE) > room
          )
            letters.pop()
          title = `${letters.join("").trimEnd()}…`
        }
        const y = top - LINE_SIZE - row * LINE_HEIGHT
        const end = margin + measure(title, LINE_SIZE)
        return {
          title,
          number,
          titleX: margin,
          numberX,
          y,
          leader:
            numberX - end > GAP * 3
              ? { from: end + GAP, to: numberX - GAP }
              : null,
          area: [margin, y - 5, right, y + LINE_SIZE + 3],
          target: entry.page - 1,
        }
      })
    pages.push({
      heading: first
        ? {
            text: CONTENTS_HEADING,
            x: margin,
            y: page.height - margin - HEADING_SIZE,
            size: HEADING_SIZE,
          }
        : null,
      lines,
    })
    at += lines.length
  }
  return pages
}

const number = (value: number) => String(Math.round(value * 100) / 100)

/**
 * The drawing commands for one contents page.
 * @param show The command that draws some text at a size, given where it starts.
 */
export function drawContents(
  page: ContentsPage,
  show: (text: string, size: number, x: number, y: number) => string
) {
  const commands: string[] = []
  if (page.heading)
    commands.push(
      show(page.heading.text, page.heading.size, page.heading.x, page.heading.y)
    )
  for (const line of page.lines) {
    commands.push(show(line.title, LINE_SIZE, line.titleX, line.y))
    commands.push(show(line.number, LINE_SIZE, line.numberX, line.y))
    if (line.leader)
      // A grey dotted line, a little above the foot of the letters.
      commands.push(
        `q 0.55 G 0.6 w [0.6 3] 0 d 1 J ${number(line.leader.from)} ${number(line.y + 2)} m ${number(line.leader.to)} ${number(line.y + 2)} l S Q`
      )
  }
  return commands.join("\n")
}

/** The command that draws text already turned into a font's glyph numbers, as hexadecimal. */
export function showGlyphs(
  font: string,
  glyphs: string,
  size: number,
  x: number,
  y: number
) {
  return `BT /${font} ${number(size)} Tf ${number(x)} ${number(y)} Td <${glyphs}> Tj ET`
}
