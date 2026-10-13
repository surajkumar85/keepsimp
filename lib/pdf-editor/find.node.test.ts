// @vitest-environment node
/**
 * Find and replace with the real engine: words are found in lines and in
 * paragraphs, across the line breaks of a paragraph too, and changed as
 * one step. Results are read back by pdf.js.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import { makeParagraphPdf, PARAGRAPHS } from "@/tests/pdf-text"
import { opFor, placesIn, type Found, type Query } from "./find"
import { fontUrls } from "./fonts"
import {
  addFont,
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stopEditing,
  type EditSession,
} from "./mupdf-edit"
import { findText, replaceText } from "./mupdf-text"

const query = (find: string, more: Partial<Query> = {}): Query => ({
  find,
  matchCase: false,
  wholeWords: false,
  ...more,
})
const squeezed = (text: string) => text.replace(/\s+/g, "")

async function start() {
  const { bytes } = await makeParagraphPdf()
  return startEditing(mupdf, bytes)
}

const find = (session: EditSession, words: string, more?: Partial<Query>) =>
  findText(mupdf, session, query(words, more))

const all = (found: Found[], replacement: string) => ({
  label: "Replace text",
  ops: found.map((one) => opFor(one, one.spans, replacement)),
})

async function texts(session: EditSession) {
  const { bytes, report } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  return {
    report,
    pages: (await readPdf(bytes)).pages.map((page) => squeezed(page.text)),
  }
}

describe("finding words in a file", () => {
  it("finds them on every page, in lines and in paragraphs", async () => {
    const session = await start()
    const { found, more } = find(session, "the")
    expect(more).toBe(false)
    // In the heading, the three paragraphs and the columns of the second page.
    expect(found.map((one) => `${one.page}/${one.kind}`)).toEqual([
      "0/line",
      "0/block",
      "0/block",
      "0/block",
      "1/block",
      "1/block",
    ])
    expect(placesIn(found)).toBeGreaterThan(20)
    // Whole words only, and with capitals told apart.
    const whole = find(session, "the", { wholeWords: true })
    expect(placesIn(whole.found)).toBeLessThan(placesIn(found))
    expect(placesIn(find(session, "The", { matchCase: true }).found)).toBe(3)
    expect(find(session, "nowhere to be seen").found).toEqual([])
    // Looking is no change.
    expect(historyOf(session).steps).toHaveLength(0)
    stopEditing(session)
  })

  it("finds words that a line break parted, and a word the file broke with a hyphen", async () => {
    const session = await start()
    // "the day on" ends a line and "which this paper" begins the next.
    const across = find(session, "day on which").found
    expect(across).toHaveLength(1)
    expect(across[0].kind).toBe("block")
    // "bor-" ends a line and "rower" begins the next.
    const broken = find(session, "borrower").found
    expect(placesIn(broken)).toBe(3)
    expect(broken.map((one) => one.spans.length)).toEqual([1, 2])
    // An address is three lines, not a paragraph: its words are found line by line.
    const address = find(session, "London").found
    expect(address.map((one) => one.kind)).toEqual(["line", "block"])
    stopEditing(session)
  })
})

describe("replacing words in a file", () => {
  it("replaces every place as one step, and the paragraphs flow again", async () => {
    const session = await start()
    const { found } = find(session, "borrower")
    const made = replaceText(mupdf, session, all(found, "debtor"))
    expect(made).toEqual({ pages: [0], refused: [] })
    expect(historyOf(session).steps).toEqual(["Replace text"])
    expect(find(session, "borrower").found).toEqual([])
    expect(placesIn(find(session, "debtor").found)).toBe(3)
    const { pages, report } = await texts(session)
    expect(pages[0]).not.toContain("borrower")
    expect(pages[0]).not.toContain("bor-rower")
    expect(pages[0].split("debtor")).toHaveLength(4)
    expect(report.retext.steps).toBe(1)
    expect(report.retext.found).toBe(report.retext.lines)
    // One step back, and every place is as it was.
    stepBack(session)
    expect(placesIn(find(session, "borrower").found)).toBe(3)
    stopEditing(session)
  })

  it("replaces one place and leaves the others", async () => {
    const session = await start()
    const { found } = find(session, "the lender", { matchCase: true })
    expect(placesIn(found)).toBe(1)
    const [second] = find(session, "borrower").found.slice(1)
    replaceText(mupdf, session, {
      label: "Replace text",
      ops: [opFor(second, [second.spans[1]], "person who borrowed")],
    })
    expect(placesIn(find(session, "borrower").found)).toBe(2)
    expect(placesIn(find(session, "person who borrowed").found)).toBe(1)
    stopEditing(session)
  })

  it("leaves out what cannot be changed, says why, and changes the rest", async () => {
    const session = await start()
    // Every "the" a long word: the first paragraph has room for it, the one under it has not.
    const { found } = find(session, "the", { wholeWords: true })
    const made = replaceText(
      mupdf,
      session,
      all(found, "the aforementioned and hereinafter described")
    )
    expect(made.refused.length).toBeGreaterThan(0)
    expect(made.refused[0]).toMatch(
      /needs \d+ lines|would lie over other text|has not been loaded/
    )
    expect(made.pages.length).toBeGreaterThan(0)
    // What was changed is one step, and what was not is as it was.
    expect(historyOf(session).steps).toHaveLength(1)
    const { pages } = await texts(session)
    expect(pages[0]).toContain("aforementionedandhereinafterdescribed")
    stopEditing(session)
  })

  it("is no step when nothing can be changed", async () => {
    const session = await start()
    const [first] = find(session, "lender").found
    const moved = {
      ...first,
      lines: first.lines.map((line) => ({
        ...line,
        box: { ...line.box, y: line.box.y + 50 },
      })),
    }
    const made = replaceText(mupdf, session, all([moved], "bank"))
    expect(made.pages).toEqual([])
    expect(made.refused).toHaveLength(1)
    expect(made.refused[0]).toMatch(/not on the page as it was/)
    expect(historyOf(session).steps).toHaveLength(0)
    expect(replaceText(mupdf, session, all([], "bank"))).toEqual({
      pages: [],
      refused: [],
    })
    stopEditing(session)
  })

  it("writes letters the paragraph's font lacks in the font that was made ready", async () => {
    const session = await start()
    const { found } = find(session, "at once")
    expect(found).toHaveLength(1)
    // The serif font is in the file with only the letters the paragraph uses.
    expect(found[0].fonts).toEqual(["serif"])
    const change = all(found, "by Q3 of 2027")
    expect(replaceText(mupdf, session, change).refused[0]).toMatch(
      /has not been loaded/
    )
    addFont(
      mupdf,
      session,
      "serif",
      new Uint8Array(readFileSync(`public${fontUrls.serif}`))
    )
    expect(replaceText(mupdf, session, change).refused).toEqual([])
    expect((await texts(session)).pages[0]).toContain("byQ3of2027")
    stopEditing(session)
  })

  it("keeps the fixed words of the paragraph it is in", async () => {
    const session = await start()
    const { found } = find(session, "agreement")
    replaceText(mupdf, session, all(found, "contract"))
    const { pages } = await texts(session)
    expect(pages[0]).toContain("thiscontract,eachofwhomhaskeptacopy")
    expect(pages[0]).toContain(squeezed(PARAGRAPHS.below))
    stopEditing(session)
  })
})
