// @vitest-environment node
/**
 * Paragraphs with the real engine: found among the lines of a page, changed
 * as one, and laid out again. Results are read back by pdf.js and pdf-lib.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import {
  danglingRefs,
  embeddedFonts,
  linkBoxes,
  readPdf,
  textPlaces,
} from "@/tests/pdf-reader"
import { makeParagraphPdf, PARAGRAPHS } from "@/tests/pdf-text"
import { fontsOf, readDraft } from "./draft"
import { fontUrls } from "./fonts"
import {
  addFont,
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyText, linesOn } from "./mupdf-text"
import {
  blocksOf,
  joined,
  shapeOf,
  SOFT,
  type Align,
  type FlowOp,
} from "./paragraphs"
import type { LineLook, PageLine, TextChange } from "./retext"

const plain = (text: string) => text.replaceAll(SOFT, "")
const squeezed = (text: string) => text.replace(/\s+/g, "")

/** The paragraphs of a page, each with its lines. */
function paragraphs(session: EditSession, page = 0) {
  const lines = linesOn(mupdf, session, page)
  return blocksOf(lines).map((block) => block.lines.map((at) => lines[at]))
}

/** The paragraph that begins with some words. */
const paragraph = (session: EditSession, start: string, page = 0) =>
  paragraphs(session, page).find((lines) => lines[0].text.startsWith(start))!

const said = (lines: PageLine[]) => plain(joined(lines).text)

function change(
  session: EditSession,
  lines: PageLine[],
  text: string,
  more: {
    look?: LineLook
    align?: Align
    move?: { x: number; y: number }
  } = {},
  page = 0
) {
  const op: FlowOp = {
    do: "reflow",
    page,
    lines: lines.map((line) => ({ box: line.box, was: line.text })),
    text,
    ...more,
  }
  return applyText(mupdf, session, { label: "Change text", ops: [op] })
}

const lastChange = (session: EditSession) =>
  session.steps[session.position - 1].done.change as TextChange

async function start() {
  const made = await makeParagraphPdf()
  return { ...made, session: startEditing(mupdf, made.bytes) }
}

describe("finding the paragraphs of a page", () => {
  it("takes full lines in one font at one distance for a paragraph, and nothing else", async () => {
    const { session, lines } = await start()
    const found = paragraphs(session)
    expect(found.map((block) => block.map((line) => line.text))).toEqual([
      lines.ragged,
      lines.justified,
      lines.centred,
    ])
    // The heading, the address and the line under the centred ones are lines of their own.
    const [ragged, justified, centred] = found
    expect(shapeOf(ragged)).toMatchObject({
      left: 50,
      indent: 0,
      leading: 13,
      align: "left",
    })
    const shape = shapeOf(justified)
    expect(shape).toMatchObject({ left: 50, leading: 12.5, align: "justify" })
    expect(shape.indent).toBeCloseTo(14, 0)
    expect(shape.right).toBeCloseTo(350, 0)
    expect(shapeOf(centred).align).toBe("centre")
    // A word the file broke at the end of a line is one word again.
    expect(joined(justified).text).toContain(`bor${SOFT}rower`)
    expect(said(justified)).toBe(plain(PARAGRAPHS.justified))
    expect(said(ragged)).toBe(PARAGRAPHS.ragged)
    stopEditing(session)
  })

  it("keeps two columns apart", async () => {
    const { session, lines } = await start()
    expect(
      paragraphs(session, 1).map((block) => block.map((line) => line.text))
    ).toEqual([lines.left, lines.right])
    stopEditing(session)
  })
})

describe("changing a paragraph", () => {
  it("lays the words out again from the line that was changed, and leaves the lines before it alone", async () => {
    const { session, bytes: original } = await start()
    const ragged = paragraph(session, "The lender")
    const text = PARAGRAPHS.ragged.replace(
      "signed by both of them",
      "signed and dated by both of them in the presence of a witness"
    )
    expect(change(session, ragged, text)).toEqual([0])
    // The first two lines were not touched: the change began in the third.
    const wrote = lastChange(session).wrote![0]!
    expect(wrote.from).toBe(2)
    const now = paragraph(session, "The lender")
    expect(now.slice(0, 2).map((line) => line.text)).toEqual(
      ragged.slice(0, 2).map((line) => line.text)
    )
    expect(said(now)).toBe(text)
    expect(now.length).toBe(ragged.length + 1)
    expect(wrote.lines.map((line) => line.text)).toEqual(
      now.slice(2).map((line) => line.text)
    )
    // Every line stays within the width the paragraph had, at its distance.
    const shape = shapeOf(ragged)
    now.forEach((line, at) => {
      expect(line.box.x).toBeCloseTo(50, 0)
      expect(line.box.x + line.box.width).toBeLessThanOrEqual(shape.right + 1)
      expect(line.origin.y).toBeCloseTo(ragged[0].origin.y + at * 13, 1)
    })
    // The paragraph under it is where it was, to the letter.
    expect(said(paragraph(session, "Should the borrower"))).toBe(
      plain(PARAGRAPHS.justified)
    )

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toEqual({ steps: 1, lines: 3, found: 3 })
    expect(await danglingRefs(bytes)).toEqual([])
    // Every line is read from the result. (What was written anew stands
    // last in the page's content, which is the order pdf.js reads in.)
    const [page] = (await readPdf(bytes)).pages
    for (const line of now)
      expect(squeezed(page.text)).toContain(squeezed(line.text))
    expect(squeezed(page.text)).not.toContain("signedbyboth")
    expect(squeezed(page.text)).toContain(
      squeezed(
        plain(PARAGRAPHS.justified).replace("borrower will", "bor-rower will")
      )
    )
    // The link that lay over two words lies over them where they now are: a line further down.
    const [was] = (await linkBoxes(original))[0]
    const [link] = (await linkBoxes(bytes))[0]
    expect(link.to).toBe(was.to)
    expect(link.y).toBeCloseTo(was.y + 13, 0)
    expect(link.width).toBeCloseTo(was.width, 0)
    const last = now[now.length - 1]
    const lead = last.text.slice(0, last.text.indexOf(PARAGRAPHS.linked))
    expect(link.x).toBeCloseTo(
      last.box.x + (last.box.width * lead.length) / last.text.length,
      -1
    )
    // No font was added: the new words are in the fonts the old ones were in.
    expect(await embeddedFonts(bytes)).toEqual(await embeddedFonts(original))
    // The bold words are still bold, and the words typed elsewhere are not.
    const [placed] = await textPlaces(bytes)
    const boldRun = placed.find((run) => run.text.includes("in full"))!
    const typed = placed.find((run) => run.text.includes("presence"))!
    expect(boldRun.font).not.toBe(typed.font)
    stopEditing(session)
  })

  it("spreads lines to both edges again, breaks a word where it may be broken, and sets the first line in", async () => {
    const { session } = await start()
    const justified = paragraph(session, "Should the borrower")
    const shape = shapeOf(justified)
    const text = PARAGRAPHS.justified.replace(
      "Should the borrower",
      "Should the careless borrower then"
    )
    change(session, justified, text)
    expect(lastChange(session).wrote![0]!.from).toBe(0)
    // Every letter was in the file's own font, cut down as that is.
    expect(lastChange(session).fonts).toEqual([])
    const now = paragraph(session, "Should the careless")
    expect(said(now)).toBe(plain(text))
    expect(shapeOf(now).align).toBe("justify")
    expect(now[0].box.x).toBeCloseTo(shape.left + shape.indent, 0)
    now.slice(0, -1).forEach((line) => {
      expect(line.box.x + line.box.width).toBeCloseTo(shape.right, 0)
    })
    now.slice(1).forEach((line) => expect(line.box.x).toBeCloseTo(50, 0))
    // The last line is as wide as its words are.
    const last = now[now.length - 1]
    expect(last.box.x + last.box.width).toBeLessThan(shape.right - 20)
    // A word that may be broken is whole inside a line, and broken with a hyphen at the end of one.
    const whole = now.map((line) => line.text).join("\n")
    expect(whole).not.toMatch(/­/)
    for (const line of now.slice(0, -1))
      if (line.text.endsWith("-")) expect(text).toContain(SOFT)
    stopEditing(session)
  })

  it("begins a new line where the text has one", async () => {
    const { session } = await start()
    const ragged = paragraph(session, "The lender")
    change(
      session,
      ragged,
      "First of all.\nThen the rest of it, on a line of its own."
    )
    const lines = linesOn(mupdf, session, 0).map((line) => line.text)
    expect(lines).toContain("First of all.")
    expect(lines).toContain("Then the rest of it, on a line of its own.")
    expect(lines.some((line) => line.startsWith("The lender"))).toBe(false)
    stopEditing(session)
  })

  it("keeps lines set about their middle about their middle", async () => {
    const { session } = await start()
    const centred = paragraph(session, "Signed in London")
    const middle = centred[0].box.x + centred[0].box.width / 2
    change(
      session,
      centred,
      PARAGRAPHS.centred.replace("first day of March", "last day of September")
    )
    const now = paragraph(session, "Signed in London")
    expect(said(now)).toContain("last day of September")
    for (const line of now)
      expect(line.box.x + line.box.width / 2).toBeCloseTo(middle, 0)
    stopEditing(session)
  })

  it("does not let a paragraph grow over what is below it, and says how much room there is", async () => {
    const { session } = await start()
    const ragged = paragraph(session, "The lender")
    const more = " Nothing in this paper takes away a right that the law gives."
    // Two more lines have room before the paragraph below; a third would lie on its first line.
    expect(() =>
      change(session, ragged, PARAGRAPHS.ragged + more.repeat(3))
    ).toThrow(
      /now needs 7 lines, and there is room for 6 before it would run over what is below/
    )
    expect(historyOf(session).steps).toHaveLength(0)
    expect(said(paragraph(session, "The lender"))).toBe(PARAGRAPHS.ragged)
    change(session, ragged, PARAGRAPHS.ragged + more.repeat(2))
    expect(paragraph(session, "The lender")).toHaveLength(6)
    expect(said(paragraph(session, "Should the borrower"))).toBe(
      plain(PARAGRAPHS.justified)
    )
    stopEditing(session)
  })

  it("takes a paragraph out when nothing is left of it", async () => {
    const { session } = await start()
    change(session, paragraph(session, "The lender"), "  ")
    const lines = linesOn(mupdf, session, 0).map((line) => line.text)
    expect(lines.some((line) => line.includes("lender agrees"))).toBe(false)
    expect(lines).toContain(PARAGRAPHS.heading)
    expect(said(paragraph(session, "Should the borrower"))).toBe(
      plain(PARAGRAPHS.justified)
    )
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toMatchObject({ steps: 1, lines: 0, found: 0 })
    expect((await readPdf(bytes)).pages[0].text).not.toContain("lender agrees")
    stopEditing(session)
  })

  it("changes a column and leaves the one beside it alone", async () => {
    const { session, lines } = await start()
    const left = paragraph(session, "The left column", 1)
    change(
      session,
      left,
      PARAGRAPHS.left.replace("running text", "a long run of text"),
      {},
      1
    )
    const now = paragraph(session, "The left column", 1)
    expect(said(now)).toContain("a long run of text")
    expect(
      paragraph(session, "The right column", 1).map((line) => line.text)
    ).toEqual(lines.right)
    for (const line of now)
      expect(line.box.x + line.box.width).toBeLessThan(230)
    stopEditing(session)
  })
})

describe("another look, another setting, another place", () => {
  it("makes a paragraph's letters larger and its lines further apart by as much", async () => {
    const { session } = await start()
    const ragged = paragraph(session, "The lender")
    const shape = shapeOf(ragged)
    change(session, ragged, PARAGRAPHS.ragged, {
      look: { size: 11, colour: [0, 0, 0.6] },
    })
    const now = paragraph(session, "The lender")
    expect(said(now)).toBe(PARAGRAPHS.ragged)
    expect(now.length).toBeGreaterThan(ragged.length)
    expect(now[0].styles[0].size).toBe(11)
    expect(now[0].styles[0].colour).toEqual([0, 0, 0.6])
    expect(shapeOf(now).leading).toBeCloseTo(13 * 1.1, 1)
    for (const line of now)
      expect(line.box.x + line.box.width).toBeLessThanOrEqual(shape.right + 1)
    stopEditing(session)
  })

  it("sets a paragraph in one of the editor's fonts, which goes into the file", async () => {
    const { session } = await start()
    addFont(
      mupdf,
      session,
      "serif-italic",
      new Uint8Array(readFileSync(`public${fontUrls["serif-italic"]}`))
    )
    change(session, paragraph(session, "The lender"), PARAGRAPHS.ragged, {
      look: { font: "serif-italic" },
    })
    const now = paragraph(session, "The lender")
    expect(said(now)).toBe(PARAGRAPHS.ragged)
    expect(now[0].styles[0].font).toMatch(/LiberationSerif-Italic/)
    expect(lastChange(session).fonts).toEqual(["serif-italic"])
    const { bytes } = await exportEdited(mupdf, session)
    expect(await danglingRefs(bytes)).toEqual([])
    expect(
      (await embeddedFonts(bytes)).some((font) =>
        font.name.includes("LiberationSerif-Italic")
      )
    ).toBe(true)
    stopEditing(session)
  })

  it("sets a paragraph to the right, about its middle and to both edges", async () => {
    for (const align of ["right", "centre", "justify"] as const) {
      const { session } = await start()
      const ragged = paragraph(session, "The lender")
      const shape = shapeOf(ragged)
      change(session, ragged, PARAGRAPHS.ragged, { align })
      // Set another way, it is still the same lines saying the same.
      const lines = linesOn(mupdf, session, 0).filter(
        (line) =>
          line.origin.y >= ragged[0].origin.y - 1 &&
          line.origin.y <= ragged[ragged.length - 1].origin.y + 1
      )
      expect(lines).toHaveLength(ragged.length)
      expect(said(lines)).toBe(PARAGRAPHS.ragged)
      expect(shapeOf(lines).align).toBe(align)
      const middle = (shape.left + shape.right) / 2
      for (const line of lines.slice(0, -1)) {
        if (align !== "centre")
          expect(
            Math.abs(line.box.x + line.box.width - shape.right)
          ).toBeLessThan(1)
        else expect(line.box.x + line.box.width / 2).toBeCloseTo(middle, 0)
      }
      stopEditing(session)
    }
  })

  it("moves a paragraph, lines and all", async () => {
    const { session } = await start()
    const ragged = paragraph(session, "The lender")
    change(session, ragged, PARAGRAPHS.ragged, { move: { x: 40, y: 330 } })
    const now = paragraph(session, "The lender")
    expect(now.map((line) => line.text)).toEqual(
      ragged.map((line) => line.text)
    )
    now.forEach((line, at) => {
      expect(line.box.x).toBeCloseTo(ragged[at].box.x + 40, 0)
      expect(line.origin.y).toBeCloseTo(ragged[at].origin.y + 330, 0)
    })
    // Onto other text it is not moved.
    expect(() =>
      change(session, now, PARAGRAPHS.ragged, { move: { x: -40, y: -250 } })
    ).toThrow(/would lie over other text/)
    stopEditing(session)
  })
})

describe("what is not changed, and what is undone", () => {
  it("makes no step of a paragraph that says what it said, and refuses one that is not there", async () => {
    const { session } = await start()
    const ragged = paragraph(session, "The lender")
    expect(change(session, ragged, `  ${PARAGRAPHS.ragged} `)).toEqual([])
    expect(historyOf(session).steps).toHaveLength(0)
    const moved = ragged.map((line) => ({
      ...line,
      box: { ...line.box, y: line.box.y + 40 },
    }))
    expect(() => change(session, moved, "Other words")).toThrow(
      /not on the page as it was/
    )
    // The same line twice is no paragraph.
    expect(() =>
      change(session, [ragged[0], ragged[0]], "Other words")
    ).toThrow(/not a change to a paragraph/)
    expect(historyOf(session).steps).toHaveLength(0)
    stopEditing(session)
  })

  it("undoes and makes again, and comes back from a draft with what it wrote", async () => {
    const { session, bytes: original } = await start()
    const text = PARAGRAPHS.justified.replace("at once", "without delay")
    change(session, paragraph(session, "Should the borrower"), text)
    stepBack(session)
    expect(said(paragraph(session, "Should the borrower"))).toBe(
      plain(PARAGRAPHS.justified)
    )
    stepForward(session)
    expect(said(paragraph(session, "Should the borrower"))).toBe(plain(text))
    const first = await exportEdited(mupdf, session)
    expect(await danglingRefs(first.bytes)).toEqual([])

    const draft = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "a.pdf",
          size: 10,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect(fontsOf(draft.steps)).toEqual([])
    expect((draft.steps[0].done.change as TextChange).wrote).toEqual(
      lastChange(session).wrote
    )
    const again = startEditing(mupdf, original)
    takeUp(again, draft.steps, draft.position)
    const second = await exportEdited(mupdf, again)
    expect(second.report.retext).toEqual(first.report.retext)
    expect(first.report.retext.found).toBe(first.report.retext.lines)
    expect((await readPdf(second.bytes)).pages[0].text).toBe(
      (await readPdf(first.bytes)).pages[0].text
    )
    stopEditing(again)
    stopEditing(session)
  })
})

describe("letters the paragraph's font lacks", () => {
  it("are written in the closest of the editor's fonts, once that is handed over", async () => {
    const { session } = await start()
    const justified = paragraph(session, "Should the borrower")
    // The serif font is in the file with only the letters the paragraph uses: no Q, no figures.
    const text = PARAGRAPHS.justified.replace("at once", "by Q3 of 2027")
    expect(() => change(session, justified, text)).toThrow(
      /has not been loaded/
    )
    expect(historyOf(session).steps).toHaveLength(0)
    addFont(
      mupdf,
      session,
      "serif",
      new Uint8Array(readFileSync(`public${fontUrls.serif}`))
    )
    change(session, justified, text)
    expect(lastChange(session).fonts).toEqual(["serif"])
    expect(said(paragraph(session, "Should the borrower"))).toBe(plain(text))
    stopEditing(session)
  })
})

describe("links over a paragraph's words", () => {
  it("stay where they are when their words were not touched, or are gone", async () => {
    const { session, bytes: original } = await start()
    const [was] = (await linkBoxes(original))[0]
    const ragged = paragraph(session, "The lender")
    // A change in the last line, behind the words under the link: they stand where they stood.
    change(session, ragged, PARAGRAPHS.ragged.replace("page.", "page of all."))
    let { bytes } = await exportEdited(mupdf, session)
    let [link] = (await linkBoxes(bytes))[0]
    expect(link.x).toBeCloseTo(was.x, 0)
    expect(link.y).toBeCloseTo(was.y, 0)
    // The words under it are typed over: the link is not taken away, and not put anywhere else.
    change(
      session,
      paragraph(session, "The lender"),
      PARAGRAPHS.ragged.replace("last page.", "end.")
    )
    ;({ bytes } = await exportEdited(mupdf, session))
    ;[link] = (await linkBoxes(bytes))[0]
    expect(link.to).toBe(was.to)
    expect(link.x).toBeCloseTo(was.x, 0)
    stopEditing(session)
  })

  it("go with a paragraph that is moved", async () => {
    const { session, bytes: original } = await start()
    const [was] = (await linkBoxes(original))[0]
    change(session, paragraph(session, "The lender"), PARAGRAPHS.ragged, {
      move: { x: 30, y: 330 },
    })
    const { bytes } = await exportEdited(mupdf, session)
    const [link] = (await linkBoxes(bytes))[0]
    expect(link.x).toBeCloseTo(was.x + 30, 0)
    expect(link.y).toBeCloseTo(was.y + 330, 0)
    stopEditing(session)
  })
})
