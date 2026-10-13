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

/** The size of the pages of the file of paragraphs, in points. */
export const PARAGRAPH_PAGE: [number, number] = [460, 640]

/** What the paragraphs of `makeParagraphPdf` say. A soft hyphen marks where a word may be broken. */
export const PARAGRAPHS = {
  heading: "Terms of the loan",
  /** Set to the left, in Helvetica, with two words in bold. */
  ragged:
    "The lender agrees to lend the sum named above to the borrower, who agrees to repay it in full within twelve months of the day on which this paper is signed by both of them, together with the interest that is set out in the table on the last page.",
  /** The words of it that are bold. */
  bold: "in full",
  /** The words of it that a link lies over, which leads to the second page. */
  linked: "last page",
  /** Set to both edges, in a serif font that is embedded with only its letters, its first line set in. */
  justified:
    "Should the borrower fail to make a pay­ment when it falls due, the lender may ask for the whole of what is still owed at once, and the bor­rower will bear the reason­able costs of col­lecting it, which in­clude the fees of a law­yer and of the court.",
  /** Three short lines, one under the other: not running text. */
  address: ["Ada Lovelace", "12 St James's Square", "London SW1Y 4JH"],
  /** Set about its middle. */
  centred:
    "Signed in London on the first day of March by both parties to this agreement, each of whom has kept a copy",
  /** Close under the centred lines: what a paragraph that grows must not run over. */
  below: "Witnessed by Charles Babbage",
  /** Two columns side by side on the second page. */
  left: "The left column is running text of its own, which has nothing to do with the column beside it although their lines stand at the same height on the page.",
  right:
    "The right column begins where the left one does and is read after it, from its first line to its last, and never across the gap between them.",
} as const

/** Words broken into lines no wider than a width, greedily, as a word processor does. */
function linesFor(
  text: string,
  widthOf: (words: string) => number,
  width: (line: number) => number
) {
  const lines: string[] = []
  let line = ""
  const fits = (words: string) => widthOf(words) <= width(lines.length)
  for (const word of text.split(" ")) {
    const parts = word.split("­")
    const whole = parts.join("")
    const tried = line ? `${line} ${whole}` : whole
    if (fits(tried)) {
      line = tried
      continue
    }
    // As much of a word that may be broken as fits, with a hyphen; the rest begins the next line.
    let cut = 0
    for (let upTo = parts.length - 1; upTo > 0; upTo--) {
      const head = `${parts.slice(0, upTo).join("")}-`
      if (line && fits(`${line} ${head}`)) {
        cut = upTo
        line = `${line} ${head}`
        break
      }
    }
    lines.push(line)
    line = parts.slice(cut).join("")
  }
  if (line) lines.push(line)
  return lines
}

/**
 * A PDF of running text: a paragraph set to the left with bold words in
 * it, one set to both edges with words broken at line ends, an address,
 * lines set about their middle with a line close under them, and two
 * columns side by side.
 * @returns The file, and the lines each paragraph was broken into.
 */
export async function makeParagraphPdf() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit as never)
  const serif = await doc.embedFont(
    readFileSync("public/fonts/editor/LiberationSerif-Regular.ttf"),
    { subset: true }
  )
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage(PARAGRAPH_PAGE)
  const black = rgb(0, 0, 0)
  const [, tall] = PARAGRAPH_PAGE
  /** Words written one by one from a place, each in its font, a space or more apart. */
  const write = (
    target: typeof page,
    words: string[],
    x: number,
    y: number,
    size: number,
    gap: number,
    fontOf: (word: string, at: number) => typeof plain = () => plain
  ) => {
    let far = x
    words.forEach((word, at) => {
      const font = fontOf(word, at)
      target.drawText(word, { x: far, y, size, font, color: black })
      far += font.widthOfTextAtSize(word, size) + gap
    })
  }

  page.drawText(PARAGRAPHS.heading, {
    x: 50,
    y: tall - 60,
    size: 14,
    font: bold,
    color: black,
  })

  // Set to the left: 300 points wide, 13 points from line to line.
  const ragged = linesFor(
    PARAGRAPHS.ragged,
    (words) => plain.widthOfTextAtSize(words, 10),
    () => 300
  )
  let inBold = 0
  const boldWords = PARAGRAPHS.bold.split(" ")
  ragged.forEach((line, at) =>
    write(
      page,
      line.split(" "),
      50,
      tall - 90 - at * 13,
      10,
      plain.widthOfTextAtSize(" ", 10),
      (word) => {
        // "in full" is bold where it follows "repay it".
        if (word === boldWords[inBold] && (inBold > 0 || word === "in")) {
          inBold = inBold === boldWords.length - 1 ? -99 : inBold + 1
          return bold
        }
        if (inBold > 0) inBold = 0
        return plain
      }
    )
  )

  // A link over two words of its last line.
  const lastLine = ragged[ragged.length - 1]
  const before = lastLine.slice(0, lastLine.indexOf(PARAGRAPHS.linked))
  const linkLeft = 50 + plain.widthOfTextAtSize(before, 10)
  const linkBase = tall - 90 - (ragged.length - 1) * 13
  const link = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [
        linkLeft - 1,
        linkBase - 3,
        linkLeft + plain.widthOfTextAtSize(PARAGRAPHS.linked, 10) + 1,
        linkBase + 9,
      ],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of("https://example.org/table"),
      },
    })
  )
  // And one over the heading, which comes after it in the file.
  const headingLink = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [48, tall - 64, 170, tall - 46],
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of("https://example.org/terms"),
      },
    })
  )
  page.node.set(PDFName.of("Annots"), doc.context.obj([link, headingLink]))

  // Set to both edges: every line but the last is spread to 300 points; the first is set in by 14.
  const top = tall - 90 - ragged.length * 13 - 26
  const justified = linesFor(
    PARAGRAPHS.justified,
    (words) => serif.widthOfTextAtSize(words, 10),
    (line) => (line === 0 ? 286 : 300)
  )
  justified.forEach((line, at) => {
    const words = line.split(" ")
    const natural = serif.widthOfTextAtSize(" ", 10)
    const width = at === 0 ? 286 : 300
    const spare =
      width -
      words.reduce((sum, word) => sum + serif.widthOfTextAtSize(word, 10), 0)
    write(
      page,
      words,
      at === 0 ? 64 : 50,
      top - at * 12.5,
      10,
      at === justified.length - 1 ? natural : spare / (words.length - 1),
      () => serif
    )
  })

  const addressTop = top - justified.length * 12.5 - 30
  PARAGRAPHS.address.forEach((line, at) =>
    page.drawText(line, {
      x: 50,
      y: addressTop - at * 13,
      size: 10,
      font: plain,
      color: black,
    })
  )

  // Set about the middle of the page, with a line one line's distance and a half under it.
  const centredTop = addressTop - 3 * 13 - 30
  const centred = linesFor(
    PARAGRAPHS.centred,
    (words) => plain.widthOfTextAtSize(words, 11),
    () => 300
  )
  const middle = PARAGRAPH_PAGE[0] / 2
  centred.forEach((line, at) =>
    page.drawText(line, {
      x: middle - plain.widthOfTextAtSize(line, 11) / 2,
      y: centredTop - at * 14,
      size: 11,
      font: plain,
      color: black,
    })
  )
  page.drawText(PARAGRAPHS.below, {
    x: 50,
    y: centredTop - centred.length * 14 - 14,
    size: 9,
    font: bold,
    color: black,
  })

  const second = doc.addPage(PARAGRAPH_PAGE)
  const column = (text: string, x: number) => {
    const lines = linesFor(
      text,
      (words) => plain.widthOfTextAtSize(words, 9),
      () => 180
    )
    lines.forEach((line, at) =>
      second.drawText(line, {
        x,
        y: tall - 70 - at * 11,
        size: 9,
        font: plain,
        color: black,
      })
    )
    return lines
  }
  const left = column(PARAGRAPHS.left, 40)
  const right = column(PARAGRAPHS.right, 240)

  return {
    bytes: await doc.save({ useObjectStreams: false }),
    lines: { ragged, justified, centred, left, right },
  }
}
