/**
 * A tagged PDF with a fault in how it says it is built, written by pdf-lib.
 */
import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFString,
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

/** What the pages of `makeTaggedPages` say, and what the picture of each is said to show. */
export const taggedLine = (page: number) => `Tagged page ${page}`
export const taggedAlt = (page: number) => `What page ${page} shows`

/**
 * Three tagged pages. Each has a paragraph and a figure with words that
 * say what it shows, under a section of its own; one more paragraph runs
 * from the first page over to the second.
 */
export async function makeTaggedPages() {
  const doc = await PDFDocument.create()
  const plain = await doc.embedFont(StandardFonts.Helvetica)
  const { context } = doc
  const root = context.nextRef()
  const whole = context.nextRef()
  const running = context.nextRef()
  const sections = []
  const parents = []
  const pages = [1, 2, 3].map(() => doc.addPage(PAGE))
  for (const [at, page] of pages.entries()) {
    const section = context.nextRef()
    const words = context.nextRef()
    const figure = context.nextRef()
    context.assign(
      words,
      context.obj({ S: "P", P: section, Pg: page.ref, K: 0 })
    )
    context.assign(
      figure,
      context.obj({
        S: "Figure",
        P: section,
        Alt: PDFString.of(taggedAlt(at + 1)),
        K: { Type: "MCR", Pg: page.ref, MCID: 1 },
      })
    )
    context.assign(
      section,
      context.obj({ S: "Sect", P: whole, K: [words, figure] })
    )
    sections.push(section)
    // The parts of the page, by the number each is marked with.
    parents.push(at, at < 2 ? [words, figure, running] : [words, figure])
    page.node.set(PDFName.of("StructParents"), context.obj(at))
    const marked = (tag: string, id: number, draw: () => void) => {
      page.pushOperators(
        PDFOperator.of(
          "BDC" as never,
          [PDFName.of(tag), context.obj({ MCID: id })] as never
        )
      )
      draw()
      page.pushOperators(PDFOperator.of("EMC" as never))
    }
    marked("P", 0, () =>
      page.drawText(taggedLine(at + 1), {
        x: 40,
        y: 540,
        size: 12,
        font: plain,
      })
    )
    marked("Figure", 1, () =>
      page.drawRectangle({
        x: 40,
        y: 400,
        width: 80,
        height: 60,
        color: rgb(0.2, 0.4, 0.8),
      })
    )
    if (at < 2)
      marked("P", 2, () =>
        page.drawText(`Running on ${at + 1}`, {
          x: 40,
          y: 300,
          size: 12,
          font: plain,
        })
      )
  }
  context.assign(
    running,
    context.obj({
      S: "P",
      P: whole,
      K: [
        { Type: "MCR", Pg: pages[0].ref, MCID: 2 },
        { Type: "MCR", Pg: pages[1].ref, MCID: 2 },
      ],
    })
  )
  context.assign(
    whole,
    context.obj({ S: "Document", P: root, K: [...sections, running] })
  )
  context.assign(
    root,
    context.obj({
      Type: "StructTreeRoot",
      K: whole,
      ParentTree: { Nums: parents },
      ParentTreeNextKey: 3,
    })
  )
  doc.catalog.set(PDFName.of("StructTreeRoot"), root)
  doc.catalog.set(PDFName.of("MarkInfo"), context.obj({ Marked: true }))
  return doc.save()
}

/**
 * The parts a tagged file says it is built of, read with pdf-lib: for
 * each, what it is, what it is said to show, and how many marked pieces of
 * which pages it holds (pages by their place, -1 for one that is not in
 * the file).
 */
export async function readTags(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  const { context } = doc
  const places = new Map(
    doc.getPages().map((page, at) => [page.ref.toString(), at])
  )
  type Dict = { get(key: PDFName): unknown; has?(key: PDFName): boolean }
  const dict = (value: unknown) =>
    context.lookup(value as never) as unknown as Dict | undefined
  const name = (value: unknown) => String(value ?? "").replace(/^\//, "")
  const placeOf = (ref: unknown) =>
    ref === undefined ? null : (places.get(String(ref)) ?? -1)
  const parts: { is: string; alt: string; pieces: (number | null)[] }[] = []
  const walk = (ref: unknown, depth: number) => {
    const part = dict(ref)
    if (!part || depth > 20) return
    const own = placeOf(part.get(PDFName.of("Pg")))
    const pieces: (number | null)[] = []
    const kids = context.lookup(part.get(PDFName.of("K")) as never) as unknown
    const list =
      kids && typeof (kids as { asArray?: unknown }).asArray === "function"
        ? (kids as { asArray(): unknown[] }).asArray()
        : kids === undefined
          ? []
          : [part.get(PDFName.of("K"))]
    const beneath: unknown[] = []
    for (const kid of list) {
      const held = context.lookup(kid as never) as unknown
      if (typeof (held as { asNumber?: unknown })?.asNumber === "function")
        pieces.push(own)
      else if (name((held as Dict).get(PDFName.of("Type"))) === "MCR")
        pieces.push(placeOf((held as Dict).get(PDFName.of("Pg"))) ?? own)
      else beneath.push(kid)
    }
    const alt = part.get(PDFName.of("Alt")) as
      { decodeText(): string } | undefined
    parts.push({
      is: name(part.get(PDFName.of("S"))),
      alt: alt ? alt.decodeText() : "",
      pieces,
    })
    for (const kid of beneath) walk(kid, depth + 1)
  }
  const root = dict(doc.catalog.get(PDFName.of("StructTreeRoot")))
  if (root) walk(root.get(PDFName.of("K")), 0)
  const tree = dict(root?.get(PDFName.of("ParentTree")))
  const numbers = tree
    ? (
        context.lookup(tree.get(PDFName.of("Nums")) as never) as unknown as {
          asArray(): unknown[]
        }
      )
        .asArray()
        .filter((_, at) => at % 2 === 0)
        .map((key) => Number(String(key)))
    : []
  return { parts, numbers }
}
