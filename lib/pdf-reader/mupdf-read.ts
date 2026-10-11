/**
 * What the reader asks of MuPDF: how large pages are, the text on them and
 * where words are found. Like the merging engine, it is handed opened files
 * and runs the same in the browser worker and in Node.
 */
import type * as MuPDF from "mupdf"
import type { Size } from "@/lib/image-compressor/geometry"
import type { OpenedPdf } from "@/lib/pdf-merger/mupdf-engine"
import {
  lineQuad,
  type PageLink,
  type PageText,
  type Quad,
  type TextLine,
} from "./text"

type Obj = MuPDF.PDFObject

/** The size the engine gives a page that names none: US Letter. */
const FALLBACK = [0, 0, 612, 792]

/** A box as the file writes it, with its corners put in order; null when it is not a usable box. */
function boxOf(value: Obj) {
  if (!value.isArray() || value.length < 4) return null
  const numbers = [0, 1, 2, 3].map((at) =>
    value.get(at).isNumber() ? value.get(at).asNumber() : NaN
  )
  if (numbers.some((number) => !Number.isFinite(number))) return null
  const box = [
    Math.min(numbers[0], numbers[2]),
    Math.min(numbers[1], numbers[3]),
    Math.max(numbers[0], numbers[2]),
    Math.max(numbers[1], numbers[3]),
  ]
  return box[2] - box[0] >= 1 && box[3] - box[1] >= 1 ? box : null
}

/**
 * The size every page is shown at, in points, without drawing any of them:
 * the part of the sheet that is shown, turned as the page asks. This is the
 * size the engine draws the page at.
 */
export function pageSizes(opened: OpenedPdf): Size[] {
  return opened.pages.map((page) => {
    const sheet = boxOf(page.get("MediaBox")) ?? FALLBACK
    const crop = boxOf(page.get("CropBox"))
    let box = sheet
    if (crop) {
      // Only the part of the crop that is on the sheet counts.
      const shown = [
        Math.max(crop[0], sheet[0]),
        Math.max(crop[1], sheet[1]),
        Math.min(crop[2], sheet[2]),
        Math.min(crop[3], sheet[3]),
      ]
      if (shown[2] - shown[0] >= 1 && shown[3] - shown[1] >= 1) box = shown
    }
    const unit = page.get("UserUnit")
    const scale = unit.isNumber() && unit.asNumber() > 0 ? unit.asNumber() : 1
    const turn = page.get("Rotate")
    const sideways =
      turn.isNumber() && Math.abs(Math.round(turn.asNumber() / 90)) % 2 === 1
    const width = (box[2] - box[0]) * scale
    const height = (box[3] - box[1]) * scale
    return sideways ? { width: height, height: width } : { width, height }
  })
}

/** The text of one page line by line, and its links to other pages of the file. */
export function readPage(opened: OpenedPdf, index: number): PageText {
  const page = opened.doc.loadPage(index)
  try {
    const lines: TextLine[] = []
    const text = page.toStructuredText("preserve-whitespace")
    try {
      let letters = ""
      let first: Quad | null = null
      let last: Quad | null = null
      let size = 0
      text.walk({
        beginLine() {
          letters = ""
          first = null
          last = null
          size = 0
        },
        onChar(letter, _origin, _font, letterSize, quad) {
          letters += letter
          // Spaces carry no box worth trusting at the ends of a line.
          if (!letter.trim()) return
          first ??= quad as unknown as Quad
          last = quad as unknown as Quad
          size = Math.max(size, letterSize)
        },
        endLine() {
          if (first && last)
            lines.push({
              text: letters.trim(),
              quad: lineQuad(first, last),
              size,
            })
        },
      })
    } finally {
      text.destroy()
    }
    const links: PageLink[] = []
    for (const link of page.getLinks()) {
      if (link.isExternal()) continue
      let target = -1
      try {
        target = opened.doc.resolveLink(link)
      } catch {
        // A link that leads nowhere is simply not a link.
      }
      if (target < 0 || target >= opened.pages.length) continue
      const [left, top, right, bottom] = link.getBounds()
      links.push({ rect: [left, top, right, bottom], page: target })
    }
    return { lines, links }
  } finally {
    page.destroy()
  }
}

/**
 * Where words are found on one page, and whether the page holds any text at
 * all. Capitals and accents make no difference.
 */
export function searchPage(
  opened: OpenedPdf,
  index: number,
  needle: string
): { hits: Quad[][]; text: boolean } {
  const page = opened.doc.loadPage(index)
  try {
    const text = page.toStructuredText("preserve-whitespace")
    try {
      return {
        hits: text.search(
          needle,
          "ignore-case,ignore-diacritics"
        ) as unknown as Quad[][],
        text: text.asText().trim().length > 0,
      }
    } finally {
      text.destroy()
    }
  } finally {
    page.destroy()
  }
}
