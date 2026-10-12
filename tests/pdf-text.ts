/**
 * A PDF with text of the kinds an editor meets, written by pdf-lib: a font
 * that is embedded cut down to the letters it is used for, fonts that are
 * not embedded at all, two looks on one line, colour, a raised mark, a
 * link, lines set close together, turned text and a page that is shown
 * turned.
 */
import { readFileSync } from "node:fs"
import {
  degrees,
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import * as fontkit from "@cantoo/fontkit"

/** The size of its pages, in points. */
export const TEXT_PAGE: [number, number] = [400, 600]

/** What its lines say, by a name for each. */
export const TEXT = {
  /** In Kalam, embedded with only these letters. */
  title: "Quarterly report",
  /** In Helvetica, which is not embedded. */
  total: "Total due: 120 euros",
  /** Bold, then regular, on one line. */
  paidBold: "Paid in full",
  paidPlain: " by Ada Lovelace",
  /** In red. */
  warning: "Overdue since March",
  /** With a raised 2 after it, smaller. */
  area: "Area in m",
  /** Under a link. */
  linked: "Read the terms online",
  /** Three lines set as close as their letters are tall. */
  tight: [
    "First of three lines",
    "Second of three lines",
    "Third of three lines",
  ],
  /** Running up the page. */
  turned: "Printed sideways",
  /** On the second page, which the file shows turned by a quarter. */
  second: "A page shown on its side",
} as const

export async function makeTextPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit as never)
  const hand = await doc.embedFont(
    readFileSync("public/fonts/editor/Kalam-Regular.ttf"),
    { subset: true }
  )
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(TEXT_PAGE)
  const black = rgb(0, 0, 0)
  page.drawText(TEXT.title, {
    x: 40,
    y: 540,
    size: 18,
    font: hand,
    color: black,
  })
  page.drawText(TEXT.total, {
    x: 40,
    y: 500,
    size: 11,
    font: plain,
    color: black,
  })
  page.drawText(TEXT.paidBold, {
    x: 40,
    y: 470,
    size: 11,
    font: bold,
    color: black,
  })
  page.drawText(TEXT.paidPlain, {
    x: 40 + bold.widthOfTextAtSize(TEXT.paidBold, 11),
    y: 470,
    size: 11,
    font: plain,
    color: black,
  })
  page.drawText(TEXT.warning, {
    x: 40,
    y: 440,
    size: 11,
    font: plain,
    color: rgb(0.8, 0, 0),
  })
  page.drawText(TEXT.area, {
    x: 40,
    y: 410,
    size: 11,
    font: plain,
    color: black,
  })
  page.drawText("2", {
    x: 40 + plain.widthOfTextAtSize(TEXT.area, 11),
    y: 414,
    size: 7,
    font: plain,
    color: black,
  })
  page.drawText(TEXT.linked, {
    x: 40,
    y: 380,
    size: 11,
    font: plain,
    color: rgb(0, 0, 0.8),
  })
  const link = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [38, 376, 160, 392],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of("https://example.org/terms"),
      },
    })
  )
  page.node.set(PDFName.of("Annots"), doc.context.obj([link]))
  TEXT.tight.forEach((line, at) =>
    page.drawText(line, {
      x: 40,
      y: 340 - at * 10,
      size: 10,
      font: plain,
      color: black,
    })
  )
  page.drawText(TEXT.turned, {
    x: 380,
    y: 100,
    size: 11,
    font: plain,
    color: black,
    rotate: degrees(90),
  })
  // A drawn line and a filled box, which no change to text may touch.
  page.drawLine({
    start: { x: 40, y: 490 },
    end: { x: 200, y: 490 },
    thickness: 1,
  })
  page.drawRectangle({
    x: 300,
    y: 500,
    width: 40,
    height: 40,
    color: rgb(0.1, 0.5, 0.3),
  })

  const second = doc.addPage(TEXT_PAGE)
  second.node.set(PDFName.of("Rotate"), doc.context.obj(90))
  // Turned in the file by as much as the page is turned when it is shown, so that it reads upright on the screen.
  second.drawText(TEXT.second, {
    x: 100,
    y: 60,
    size: 12,
    font: plain,
    color: black,
    rotate: degrees(90),
  })
  return doc.save({ useObjectStreams: false })
}
