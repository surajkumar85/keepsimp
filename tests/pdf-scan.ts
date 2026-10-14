/**
 * Scanned pages for OCR tests: words set in a font, drawn to grey pixels,
 * and only that picture put on a page, as a scanner hands a page over.
 * The page has no text of its own; what the words were and where they
 * stood is known, to check what is read against.
 */
import { degrees, PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"

/** The lines on a scanned page, each at its place: points from the page's top left. */
export interface ScanLine {
  text: string
  x: number
  /** Where the line's letters stand, from the top. */
  y: number
  size: number
}

export const SCAN_SIZE = { width: 612, height: 792 }

/** Lines of a letter, large and plain enough to be read the same each time. */
export const SCAN_LINES: ScanLine[] = [
  { text: "KeepSimp reads scanned pages", x: 72, y: 120, size: 22 },
  {
    text: "The quick brown fox jumps over thirteen lazy dogs",
    x: 72,
    y: 180,
    size: 16,
  },
  { text: "Invoice number 4821 is due on Friday", x: 72, y: 220, size: 16 },
  { text: "Please call Morgan about the delivery", x: 72, y: 260, size: 16 },
]

/** The picture of a page of words, as a PNG, drawn at some dots to the inch. */
async function pictureOf(lines: readonly ScanLine[], dpi: number) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([SCAN_SIZE.width, SCAN_SIZE.height])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const line of lines)
    page.drawText(line.text, {
      x: line.x,
      y: SCAN_SIZE.height - line.y,
      size: line.size,
      font,
    })
  const drawn = mupdf.Document.openDocument(await doc.save(), "application/pdf")
  try {
    const pixels = drawn
      .loadPage(0)
      .toPixmap(
        mupdf.Matrix.scale(dpi / 72, dpi / 72),
        mupdf.ColorSpace.DeviceGray,
        false
      )
    return pixels.asPNG()
  } finally {
    drawn.destroy()
  }
}

/**
 * A file of scanned pages: the first upright, then (when asked) one that
 * is turned: written on its side and shown the right way up, as a page a
 * scanner took in sideways and a viewer was told to turn.
 */
export async function scannedPdf(
  options: { turned?: boolean; lines?: readonly ScanLine[]; dpi?: number } = {}
) {
  const lines = options.lines ?? SCAN_LINES
  const png = await pictureOf(lines, options.dpi ?? 200)
  const doc = await PDFDocument.create()
  const picture = await doc.embedPng(png)
  const { width, height } = SCAN_SIZE
  doc.addPage([width, height]).drawImage(picture, { x: 0, y: 0, width, height })
  if (options.turned) {
    // Written on its side, and turned a quarter clockwise to be shown.
    const page = doc.addPage([height, width])
    page.setRotation(degrees(90))
    page.drawImage(picture, {
      x: height,
      y: 0,
      width,
      height,
      rotate: degrees(90),
    })
  }
  return doc.save()
}
