/**
 * A tagged PDF with a fault in how it says it is built, written by pdf-lib.
 */
import {
  PDFDocument,
  PDFName,
  PDFOperator,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"

/** The size of its page, in points. */
const PAGE: [number, number] = [400, 600]

/** What the lines of `makeTaggedPdf` say. */
export const TAGGED = [
  "A heading that is where it belongs",
  "A line in a story that hangs loose",
] as const

/**
 * A PDF that says how it is built (a tagged one) and does not say it quite
 * rightly: the story its second line belongs to is itself part of nothing.
 * Programs that write such files exist (a long report of the United
 * Nations has a story that hangs loose in just this way), and a reader
 * mends the fault as it goes from one part of the page to the next.
 */
export async function makeTaggedPdf() {
  const doc = await PDFDocument.create()
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage(PAGE)
  const { context } = doc
  const root = context.nextRef()
  const whole = context.nextRef()
  const heading = context.nextRef()
  const story = context.nextRef()
  const body = context.nextRef()
  context.assign(
    heading,
    context.obj({ S: "H1", P: whole, Pg: page.ref, K: 0 })
  )
  context.assign(body, context.obj({ S: "P", P: story, Pg: page.ref, K: 1 }))
  // A story that names no parent, and that nothing names as its child.
  context.assign(story, context.obj({ S: "Sect", K: body }))
  context.assign(whole, context.obj({ S: "Document", P: root, K: [heading] }))
  context.assign(
    root,
    context.obj({
      Type: "StructTreeRoot",
      K: whole,
      ParentTree: { Nums: [0, [heading, body]] },
      ParentTreeNextKey: 1,
    })
  )
  doc.catalog.set(PDFName.of("StructTreeRoot"), root)
  doc.catalog.set(PDFName.of("MarkInfo"), context.obj({ Marked: true }))
  page.node.set(PDFName.of("StructParents"), context.obj(0))
  TAGGED.forEach((line, at) => {
    page.pushOperators(
      PDFOperator.of(
        "BDC" as never,
        [PDFName.of(at ? "P" : "H1"), context.obj({ MCID: at })] as never
      )
    )
    page.drawText(line, {
      x: 40,
      y: 540 - at * 30,
      size: 12,
      font: plain,
      color: rgb(0, 0, 0),
    })
    page.pushOperators(PDFOperator.of("EMC" as never))
  })
  // Written as most programs write a file today: with its objects packed
  // together, which is how the report's are.
  return doc.save()
}
