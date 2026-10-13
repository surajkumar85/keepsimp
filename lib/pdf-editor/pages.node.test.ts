// @vitest-environment node
/**
 * The list of pages changed with the real engine: pages moved, taken out,
 * copied, turned and added. Results are read back by pdf.js and pdf-lib:
 * what each page says, where links and bookmarks lead, what the form
 * holds, and what is left in the file of a page that was taken out.
 */
import { readFileSync } from "node:fs"
import {
  decodePDFRawStream,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { makePdf } from "@/tests/pdf-fixtures"
import { danglingRefs, readComments, readPdf } from "@/tests/pdf-reader"
import {
  makeTaggedPages,
  readTags,
  taggedAlt,
  taggedLine,
} from "@/tests/pdf-tagged"
import { makeTextPdf, TEXT } from "@/tests/pdf-text"
import { PasswordNeeded } from "@/lib/pdf-merger/mupdf-engine"
import { picturesOf, readDraft } from "./draft"
import { fontUrls } from "./fonts"
import {
  addFont,
  applyChange,
  exportEdited,
  historyOf,
  objectsOn,
  pageSizes,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import {
  addInsert,
  applyPages,
  exportPart,
  InsertMissing,
  prepareInsert,
} from "./mupdf-pages"
import { applyText, linesOn } from "./mupdf-text"
import { BLACK, type ShapeObject } from "./objects"
import { labelOf, planOf, SHEETS, type PageOp, type PagesChange } from "./pages"

function editing(bytes: Uint8Array) {
  const session = startEditing(mupdf, bytes)
  for (const [key, url] of Object.entries(fontUrls))
    addFont(mupdf, session, key, new Uint8Array(readFileSync(`public${url}`)))
  return session
}

const change = (session: EditSession, ...ops: PageOp[]) => {
  const pages = applyPages(mupdf, session, { label: labelOf(ops[0]), ops })
  // The step as it is kept, with what the engine said went with the pages.
  const asked = session.steps[session.position - 1].done.change as PagesChange
  return { pages, asked }
}

/** Six pages with everything that can lead to a page or lie on one. */
const book = () =>
  makePdf("pg", {
    pages: 6,
    links: [
      { from: 1, to: 4 },
      { from: 2, to: 3, how: "action" },
      { from: 5, to: 3, how: "name" },
      { from: 6, to: 1 },
    ],
    bookmarks: [
      { title: "One", page: 1 },
      {
        title: "Three",
        page: 3,
        children: [
          { title: "Four", page: 4 },
          { title: "Three again", page: 3 },
        ],
      },
      { title: "Third", page: 3 },
      { title: "Six", page: 6 },
    ],
    fields: [
      { name: "second", value: "two", page: 2 },
      { name: "third", value: "three", page: 3 },
    ],
    notes: [{ page: 3, text: "a note on three" }],
    attachments: { "a.txt": "attached" },
    romanPages: 2,
    layers: true,
    tagged: true,
  })

async function read(session: EditSession) {
  const { bytes, report } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  const got = await readPdf(bytes)
  return {
    bytes,
    report,
    got,
    texts: got.pages.map((page) => page.text.split(" ")[0]),
    links: got.pages.map((page) => page.links),
  }
}

/** Whether some words are anywhere in a file: in any stream of it, or in what is written outside streams, as letters or as their numbers. */
async function holds(bytes: Uint8Array, words: string) {
  const doc = await PDFDocument.load(bytes)
  const numbers = Buffer.from(words, "latin1").toString("hex")
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const text =
      object instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")
        : object.toString()
    if (text.includes(words) || text.toLowerCase().includes(numbers))
      return true
  }
  return false
}

/** What a file's catalogue names, read with pdf-lib. */
async function catalogue(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return ["StructTreeRoot", "MarkInfo", "PageLabels", "OCProperties", "Names"]
    .filter((key) => doc.catalog.get(PDFName.of(key)) !== undefined)
    .sort()
}

describe("pages put in another order", () => {
  it("are the same pages in other places, and what leads to them follows", async () => {
    const bytes = await book()
    const before = await readPdf(bytes)
    const session = editing(bytes)
    // The fourth to the front, then the first two of that to the end.
    expect(change(session, { do: "move", pages: [3], to: 0 }).pages).toEqual([
      0, 1, 2, 3,
    ])
    change(session, { do: "move", pages: [0, 1], to: 6 })
    expect(historyOf(session).steps).toEqual([
      "Move page 4",
      "Move pages 1 to 2",
    ])
    const { got, texts, links, bytes: out, report } = await read(session)
    expect(texts).toEqual([
      "pg-P2",
      "pg-P3",
      "pg-P5",
      "pg-P6",
      "pg-P4",
      "pg-P1",
    ])
    // Each link is on the page it was on, and leads to the page it led to.
    expect(links).toEqual([[2], [], [2], [6], [], [5]])
    expect(got.bookmarks).toEqual([
      { title: "One", to: 6, items: [] },
      {
        title: "Three",
        to: 2,
        items: [
          { title: "Four", to: 5, items: [] },
          { title: "Three again", to: 2, items: [] },
        ],
      },
      { title: "Third", to: 2, items: [] },
      { title: "Six", to: 4, items: [] },
    ])
    expect(got.pages[0].fields).toEqual(["second=two"])
    expect(got.pages[1].fields).toEqual(["third=three"])
    expect(got.pages[1].notes).toEqual(["a note on three"])
    expect(got.fields).toEqual(before.fields)
    // Nothing of the file itself went: its tags, attached files, layers and page numbers.
    expect(got.attachments).toEqual(["a.txt"])
    expect(got.layers).toEqual(before.layers)
    expect(await catalogue(out)).toEqual(await catalogue(bytes))
    // Every page is compared with the page of the file as it came that it is.
    expect(report.untouched).toEqual({ checked: 6, differ: [] })
    expect(report.pages).toEqual({
      steps: 2,
      taken: 0,
      added: 0,
      lost: { links: 0, bookmarks: 0, fields: 0 },
    })
    stopEditing(session)
  })

  it("keep what they left to the tree of pages above them", async () => {
    const bytes = await makePdf("in", { pages: 4, inherit: true })
    const session = editing(bytes)
    change(session, { do: "move", pages: [2, 3], to: 0 })
    const { got, texts, report } = await read(session)
    expect(texts).toEqual(["in-P3", "in-P4", "in-P1", "in-P2"])
    expect(got.pages.map((page) => [page.width, page.height])).toEqual(
      Array.from({ length: 4 }, () => [298, 420])
    )
    expect(report.untouched).toEqual({ checked: 4, differ: [] })
    stopEditing(session)
  })

  it("refuse a change that does not fit the file, and leave it as it was", async () => {
    const session = editing(await makePdf("no", { pages: 2 }))
    expect(() => change(session, { do: "move", pages: [0], to: 0 })).toThrow(
      "The pages are already so."
    )
    expect(() => change(session, { do: "delete", pages: [0, 1] })).toThrow(
      "A file needs at least one page. Leave one page in it."
    )
    expect(() => change(session, { do: "turn", pages: [2], by: 90 })).toThrow(
      "That page is not in the file."
    )
    expect(() =>
      change(session, { do: "turn", pages: [0], by: 45 } as never)
    ).toThrow("That is not a change to pages.")
    // The second of two changes fails: the first is not made either.
    expect(() =>
      change(
        session,
        { do: "delete", pages: [0] },
        { do: "delete", pages: [0] }
      )
    ).toThrow("A file needs at least one page.")
    expect(historyOf(session).steps).toEqual([])
    expect((await read(session)).texts).toEqual(["no-P1", "no-P2"])
    stopEditing(session)
  })
})

describe("pages taken out", () => {
  it("are gone from the file, with what led to them and was on them, and nothing else", async () => {
    const bytes = await book()
    expect(await holds(bytes, "pg-P3")).toBe(true)
    expect(await holds(bytes, "a note on three")).toBe(true)
    const session = editing(bytes)
    const { pages, asked } = change(session, { do: "delete", pages: [2] })
    // The places from the third on are other pages now, and the sixth is no more.
    expect(pages).toEqual([2, 3, 4, 5])
    expect(asked.lost).toEqual([{ links: 2, bookmarks: 2, fields: 1 }])
    const { got, texts, links, bytes: out, report } = await read(session)
    expect(texts).toEqual(["pg-P1", "pg-P2", "pg-P4", "pg-P5", "pg-P6"])
    // The links that led to the page are gone; the others lead where they led.
    expect(links).toEqual([[3], [], [], [], [1]])
    // A bookmark with others beneath it stays as a heading; the rest that led there are gone.
    expect(got.bookmarks).toEqual([
      { title: "One", to: 1, items: [] },
      {
        title: "Three",
        to: null,
        items: [{ title: "Four", to: 3, items: [] }],
      },
      { title: "Six", to: 5, items: [] },
    ])
    expect(got.fields).toEqual(["second"])
    expect(got.pages[1].fields).toEqual(["second=two"])
    // Nothing the page held is in the file: not its words, not its note, not its field.
    expect(await holds(out, "pg-P3")).toBe(false)
    expect(await holds(out, "a note on three")).toBe(false)
    expect(await holds(out, "(third)")).toBe(false)
    expect(got.attachments).toEqual(["a.txt"])
    expect(await catalogue(out)).toEqual(await catalogue(bytes))
    expect(report.pages).toEqual({
      steps: 1,
      taken: 1,
      added: 0,
      lost: { links: 2, bookmarks: 2, fields: 1 },
    })
    expect(report.untouched).toEqual({ checked: 5, differ: [] })
    stopEditing(session)
  })

  it("are taken out of what a tagged file says it is built of, with what their pictures were said to show", async () => {
    const bytes = await makeTaggedPages()
    const whole = { is: "Document", alt: "", pieces: [] }
    const section = { is: "Sect", alt: "", pieces: [] }
    const told = (page: number, place: number) => [
      section,
      { is: "P", alt: "", pieces: [place] },
      { is: "Figure", alt: taggedAlt(page), pieces: [place] },
    ]
    expect(await readTags(bytes)).toEqual({
      parts: [
        whole,
        ...told(1, 0),
        ...told(2, 1),
        ...told(3, 2),
        { is: "P", alt: "", pieces: [0, 1] },
      ],
      numbers: [0, 1, 2],
    })
    const session = editing(bytes)
    change(session, { do: "delete", pages: [1] })
    const { bytes: out, texts } = await read(session)
    expect(texts).toEqual(["Tagged", "Tagged"])
    // The second page's parts are gone; of the paragraph that ran over two pages, the first page's piece is left.
    expect(await readTags(out)).toEqual({
      parts: [
        whole,
        ...told(1, 0),
        ...told(3, 1),
        { is: "P", alt: "", pieces: [0] },
      ],
      numbers: [0, 2],
    })
    expect(await holds(bytes, taggedAlt(2))).toBe(true)
    expect(await holds(out, taggedAlt(2))).toBe(false)
    expect(await holds(out, taggedLine(2))).toBe(false)
    expect(await holds(out, taggedAlt(3))).toBe(true)
    // Without the first page too, nothing is left of that paragraph.
    change(session, { do: "delete", pages: [0] })
    const last = await read(session)
    expect(await readTags(last.bytes)).toEqual({
      parts: [whole, ...told(3, 0)],
      numbers: [2],
    })
    expect(await holds(last.bytes, taggedAlt(1))).toBe(false)
    // A page that is only moved keeps its parts.
    stepBack(session)
    stepBack(session)
    change(session, { do: "move", pages: [2], to: 0 })
    expect((await readTags((await read(session)).bytes)).parts).toEqual([
      whole,
      ...told(1, 1),
      ...told(2, 2),
      ...told(3, 0),
      { is: "P", alt: "", pieces: [1, 2] },
    ])
    stopEditing(session)
  })

  it("leave no list of bookmarks behind when every one led to them", async () => {
    const session = editing(
      await makePdf("bm", {
        pages: 3,
        bookmarks: [
          { title: "Two", page: 2, children: [{ title: "Also two", page: 2 }] },
        ],
      })
    )
    const { asked } = change(session, { do: "delete", pages: [1] })
    expect(asked.lost).toEqual([{ links: 0, bookmarks: 2, fields: 0 }])
    const { got, texts } = await read(session)
    expect(texts).toEqual(["bm-P1", "bm-P3"])
    expect(got.bookmarks).toEqual([])
    stopEditing(session)
  })

  it("come back when the step is undone, and go again when it is made again", async () => {
    const bytes = await book()
    const before = await readPdf(bytes)
    const session = editing(bytes)
    change(session, { do: "delete", pages: [0, 2] })
    change(session, { do: "move", pages: [3], to: 0 })
    expect((await read(session)).texts).toEqual([
      "pg-P6",
      "pg-P2",
      "pg-P4",
      "pg-P5",
    ])
    const layout = session.laidOut
    expect(stepBack(session)).toEqual([0, 1, 2, 3])
    expect(stepBack(session)).toEqual([0, 1, 2, 3, 4, 5])
    expect(session.laidOut).toBe(layout! + 2)
    const undone = await read(session)
    expect(undone.got.pages).toEqual(before.pages)
    expect(undone.got.bookmarks).toEqual(before.bookmarks)
    expect(undone.got.fields).toEqual(before.fields)
    expect(undone.report.pages.steps).toBe(0)
    expect(stepForward(session)).toEqual([0, 1, 2, 3, 4, 5])
    expect(session.laidOut).toBe(layout! + 3)
    const again = await read(session)
    expect(again.texts).toEqual(["pg-P2", "pg-P4", "pg-P5", "pg-P6"])
    expect(again.report.pages.lost).toEqual({
      links: 3,
      bookmarks: 3,
      fields: 1,
    })
    stopEditing(session)
  })
})

describe("pages copied, added and turned", () => {
  it("copies a page with its notes and links, and leaves a form's fields where they are", async () => {
    const bytes = await book()
    const session = editing(bytes)
    expect(change(session, { do: "copy", pages: [0, 2] }).pages).toEqual([
      3, 4, 5, 6, 7,
    ])
    const { got, texts, links, report } = await read(session)
    expect(texts).toEqual([
      "pg-P1",
      "pg-P2",
      "pg-P3",
      "pg-P1",
      "pg-P3",
      "pg-P4",
      "pg-P5",
      "pg-P6",
    ])
    // Links lead to the first of two, and the copy of a page has the links of its page.
    expect(links).toEqual([[6], [3], [], [6], [], [], [3], [1]])
    expect(got.pages[4].notes).toEqual(["a note on three"])
    expect(got.pages[4].fields).toEqual([])
    expect(got.pages[2].fields).toEqual(["third=three"])
    expect(got.fields).toEqual(["second", "third"])
    // A copy is no page of the file as it came: it is not compared with one.
    expect(report.untouched).toEqual({ checked: 6, differ: [] })
    stopEditing(session)
  })

  it("gives a copy words of its own: changing them leaves the page it is a copy of alone", async () => {
    const session = editing(await makeTextPdf())
    change(session, { do: "copy", pages: [0] })
    const line = linesOn(mupdf, session, 1).find(
      (one) => one.text === TEXT.total
    )!
    applyText(mupdf, session, {
      label: "Change text",
      ops: [
        {
          do: "retext",
          page: 1,
          box: line.box,
          was: line.text,
          text: "Total due: 95 euros",
        },
      ],
    })
    const { got, report } = await read(session)
    expect(got.pages).toHaveLength(3)
    expect(got.pages[0].text).toContain(TEXT.total)
    expect(got.pages[1].text).toContain("Total due: 95 euros")
    expect(got.pages[1].text).not.toContain(TEXT.total)
    expect(got.pages[1].links).toEqual(got.pages[0].links)
    expect(report.retext).toEqual({ steps: 1, lines: 1, found: 1 })
    // Undone, the copy says what its page says again.
    stepBack(session)
    expect((await read(session)).got.pages[1].text).toContain(TEXT.total)
    stopEditing(session)
  })

  it("puts an empty page of a size between others", async () => {
    const session = editing(await makePdf("bl", { pages: 2 }))
    change(session, { do: "blank", at: 1, size: SHEETS.A4 })
    change(session, { do: "blank", at: 3, size: { width: 300, height: 200 } })
    const { got, texts, report } = await read(session)
    expect(texts).toEqual(["bl-P1", "", "bl-P2", ""])
    expect([got.pages[1].width, got.pages[1].height]).toEqual([
      SHEETS.A4.width,
      SHEETS.A4.height,
    ])
    expect([got.pages[3].width, got.pages[3].height]).toEqual([300, 200])
    expect(pageSizes(session)[3]).toEqual({ width: 300, height: 200 })
    expect(report.untouched).toEqual({ checked: 2, differ: [] })
    stopEditing(session)
  })

  it("turns pages, and what was added to them stays where it is on what they show", async () => {
    const bytes = await makePdf("tu", { pages: 2, rotate: { 2: 90 } })
    const session = editing(bytes)
    const box: ShapeObject = {
      id: "box",
      kind: "box",
      box: { x: 40, y: 60, width: 100, height: 50 },
      rotation: 0,
      opacity: 1,
      stroke: BLACK,
      fill: null,
      weight: 2,
    }
    applyChange(mupdf, session, {
      label: "Add",
      ops: [{ do: "add", page: 0, object: box }],
    })
    const rectOf = async () =>
      (
        await readComments(
          (await exportEdited(mupdf, session, { keepEditable: true })).bytes
        )
      )[0].map((note) => note.rect.map(Math.round))
    const where = await rectOf()
    expect(
      change(session, { do: "turn", pages: [0, 1], by: 90 }).pages
    ).toEqual([0, 1])
    // A page 298 by 420 shown a quarter on: the box's middle, 90 across and 85 down, is 335 across and 90 down.
    const [turned] = objectsOn(session, 0)
    expect(turned.rotation).toBe(90)
    expect(turned.box.x + 50).toBeCloseTo(420 - 85)
    expect(turned.box.y + 25).toBeCloseTo(90)
    expect(pageSizes(session)).toEqual([
      { width: 420, height: 298 },
      { width: 298, height: 420 },
    ])
    // In the file's own points it has not moved at all.
    expect(await rectOf()).toEqual(where)
    const { got, report } = await read(session)
    expect(got.pages.map((page) => page.rotate)).toEqual([90, 180])
    expect(got.pages[0].text).toContain("tu-P1")
    // A page that was turned is not what it was: it is not compared.
    expect(report.untouched).toEqual({ checked: 0, differ: [] })
    change(session, { do: "turn", pages: [1], by: 270 })
    expect((await read(session)).got.pages[1].rotate).toBe(90)
    stopEditing(session)
  })
})

describe("the numbers a file gives its own pages", () => {
  const labels = async (roman: number, ...ops: PageOp[]) => {
    const session = editing(
      await makePdf("lb", {
        pages: 6,
        ...(roman ? { romanPages: roman } : null),
      })
    )
    for (const op of ops) change(session, op)
    const { got, texts } = await read(session)
    stopEditing(session)
    return { labels: got.labels, texts }
  }

  it("stay in runs that grow and shrink with their pages", async () => {
    // i, ii, then 1 to 4.
    expect((await labels(2, { do: "delete", pages: [0] })).labels).toEqual([
      "i",
      "1",
      "2",
      "3",
      "4",
    ])
    expect((await labels(2, { do: "copy", pages: [1] })).labels).toEqual([
      "i",
      "ii",
      "iii",
      "1",
      "2",
      "3",
      "4",
    ])
    expect(
      (await labels(2, { do: "blank", at: 6, size: SHEETS.A4 })).labels
    ).toEqual(["i", "ii", "1", "2", "3", "4", "5"])
    expect(
      (await labels(2, { do: "turn", pages: [0], by: 90 })).labels
    ).toEqual(["i", "ii", "1", "2", "3", "4"])
  })

  it("take a page that is put elsewhere into the run where it lands, also at the very front", async () => {
    const front = await labels(2, { do: "move", pages: [4], to: 0 })
    expect(front.texts).toEqual([
      "lb-P5",
      "lb-P1",
      "lb-P2",
      "lb-P3",
      "lb-P4",
      "lb-P6",
    ])
    expect(front.labels).toEqual(["i", "ii", "iii", "1", "2", "3"])
    expect(
      (await labels(2, { do: "move", pages: [0, 1], to: 6 })).labels
    ).toEqual(["1", "2", "3", "4", "5", "6"])
    expect(
      (
        await labels(
          2,
          { do: "blank", at: 0, size: SHEETS.A4 },
          { do: "delete", pages: [3] }
        )
      ).labels
    ).toEqual(["i", "ii", "iii", "1", "2", "3"])
  })

  it("are not made up for a file that simply counts its pages", async () => {
    for (const op of [
      { do: "move", pages: [4], to: 0 },
      { do: "delete", pages: [0] },
      { do: "copy", pages: [0] },
      { do: "blank", at: 0, size: SHEETS.A4 },
    ] as PageOp[])
      expect((await labels(0, op)).labels).toBeNull()
  })
})

describe("pages of another file", () => {
  /** Three pages with a link from the first to the third, a field on the second and a bookmark. */
  const other = (password?: string) =>
    makePdf("ot", {
      pages: 3,
      links: [{ from: 1, to: 3, how: "name" }],
      fields: [{ name: "second", value: "filled in", page: 2 }],
      bookmarks: [{ title: "Other", page: 2 }],
      ...(password ? { password: { user: password } } : null),
    })

  it("are added as they look, with their links, and nothing of this file is changed", async () => {
    const bytes = await book()
    const before = await readPdf(bytes)
    const session = editing(bytes)
    const ready = await prepareInsert(mupdf, await other())
    expect(addInsert(mupdf, session, "pdf-a", ready)).toBe(3)
    expect(
      change(session, { do: "insert", at: 2, file: "pdf-a", count: 3 }).pages
    ).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(historyOf(session).steps).toEqual(["Add 3 pages from a file"])
    const { got, texts, links, bytes: out, report } = await read(session)
    expect(texts).toEqual([
      "pg-P1",
      "pg-P2",
      "ot-P1",
      "ot-P2",
      "ot-P3",
      "pg-P3",
      "pg-P4",
      "pg-P5",
      "pg-P6",
    ])
    // The other file's link leads to its own third page, where that is now.
    expect(links[2]).toEqual([5])
    // This file's links and bookmarks follow their pages past the new ones.
    expect(links[0]).toEqual([7])
    expect(got.bookmarks).toEqual([
      { title: "One", to: 1, items: [] },
      {
        title: "Three",
        to: 6,
        items: [
          { title: "Four", to: 7, items: [] },
          { title: "Three again", to: 6, items: [] },
        ],
      },
      { title: "Third", to: 6, items: [] },
      { title: "Six", to: 9, items: [] },
    ])
    // The other file's field is part of its page: this file's form is as it was.
    expect(got.fields).toEqual(before.fields)
    expect(got.pages[3].fields).toEqual([])
    expect(got.pages[3].text).toContain("filled in")
    expect(await catalogue(out)).toEqual(await catalogue(bytes))
    // The new pages join the run of numbers of the page they are put after: i to v, then 1 to 4.
    expect(got.labels).toEqual([
      "i",
      "ii",
      "iii",
      "iv",
      "v",
      "1",
      "2",
      "3",
      "4",
    ])
    expect(report.pages).toEqual({
      steps: 1,
      taken: 0,
      added: 3,
      lost: { links: 0, bookmarks: 0, fields: 0 },
    })
    expect(report.untouched).toEqual({ checked: 6, differ: [] })

    // Undone and made again, and added a second time at the end.
    stepBack(session)
    expect((await read(session)).texts).toHaveLength(6)
    stepForward(session)
    change(session, { do: "insert", at: 9, file: "pdf-a", count: 3 })
    const twice = await read(session)
    expect(twice.texts.slice(9)).toEqual(["ot-P1", "ot-P2", "ot-P3"])
    expect(twice.links[9]).toEqual([12])
    expect(twice.links[2]).toEqual([5])
    stopEditing(session)
  })

  it("need the file's password once, and are kept without it", async () => {
    const locked = await other("open sesame")
    await expect(prepareInsert(mupdf, locked)).rejects.toBeInstanceOf(
      PasswordNeeded
    )
    await expect(prepareInsert(mupdf, locked, "wrong")).rejects.toBeInstanceOf(
      PasswordNeeded
    )
    const ready = await prepareInsert(mupdf, locked, "open sesame")
    const session = editing(await makePdf("mn", { pages: 1 }))
    expect(addInsert(mupdf, session, "pdf-b", ready)).toBe(3)
    change(session, { do: "insert", at: 0, file: "pdf-b", count: 3 })
    const { got, texts } = await read(session)
    expect(texts).toEqual(["ot-P1", "ot-P2", "ot-P3", "mn-P1"])
    // The result is not locked: the other file's lock is not this file's.
    expect(got.encrypted).toBe(false)
    stopEditing(session)
  })

  it("are refused when the file was not handed over, or is not the one that was", async () => {
    const session = editing(await makePdf("mn", { pages: 2 }))
    expect(() =>
      change(session, { do: "insert", at: 0, file: "pdf-c", count: 3 })
    ).toThrow(InsertMissing)
    const ready = await prepareInsert(mupdf, await other())
    expect(() => addInsert(mupdf, session, "picture", ready)).toThrow(
      "That is not a name for a file."
    )
    addInsert(mupdf, session, "pdf-c", ready)
    expect(() =>
      change(session, { do: "insert", at: 0, file: "pdf-c", count: 2 })
    ).toThrow("That is not the file that was added.")
    // A locked file is no file that was made ready.
    expect(() =>
      addInsert(mupdf, session, "pdf-d", new Uint8Array(4))
    ).toThrow()
    expect(historyOf(session).steps).toEqual([])
    expect((await read(session)).texts).toEqual(["mn-P1", "mn-P2"])
    stopEditing(session)
  })

  it("are kept with a draft and taken up with it", async () => {
    const main = await makePdf("mn", { pages: 2 })
    const session = editing(main)
    const ready = await prepareInsert(mupdf, await other())
    addInsert(mupdf, session, "pdf-e", ready)
    change(session, { do: "insert", at: 1, file: "pdf-e", count: 3 })
    change(session, { do: "delete", pages: [2] })
    const kept = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "main.pdf",
          size: 1000,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    // The draft names the file among what it has to keep.
    expect(picturesOf(kept.steps)).toEqual(["pdf-e"])
    const without = editing(main)
    expect(() => takeUp(without, kept.steps, kept.position)).toThrow(
      InsertMissing
    )
    expect(historyOf(without).steps).toEqual([])
    addInsert(mupdf, without, "pdf-e", ready)
    takeUp(without, kept.steps, kept.position)
    expect((await read(without)).texts).toEqual([
      "mn-P1",
      "ot-P1",
      "ot-P3",
      "mn-P2",
    ])
    stopEditing(session)
    stopEditing(without)
  })
})

describe("some pages as a file of their own", () => {
  it("are written with what still has somewhere to lead, and the file in the editor is as it was", async () => {
    const session = editing(await book())
    change(session, { do: "turn", pages: [3], by: 90 })
    expect(session.saved).toBeNull()
    const { bytes, report } = await exportPart(mupdf, session, [0, 3, 5])
    expect(await danglingRefs(bytes)).toEqual([])
    const got = await readPdf(bytes)
    expect(got.pages.map((page) => page.text.split(" ")[0])).toEqual([
      "pg-P1",
      "pg-P4",
      "pg-P6",
    ])
    expect(got.pages[1].rotate).toBe(90)
    // The first page's link to the fourth leads to it where it is now; the last page's link to the first as well.
    expect(got.pages.map((page) => page.links)).toEqual([[2], [], [1]])
    // A heading whose own page is not in the part leads to the first page beneath it that is.
    expect(got.bookmarks).toEqual([
      { title: "One", to: 1, items: [] },
      { title: "Three", to: 2, items: [{ title: "Four", to: 2, items: [] }] },
      { title: "Six", to: 3, items: [] },
    ])
    expect(got.fields).toEqual([])
    expect(got.attachments).toEqual(["a.txt"])
    expect(report.part).toBe(3)
    // It was no download of the file: what is unsaved stays unsaved.
    expect(session.saved).toBeNull()
    expect(session.doc.countPages()).toBe(6)

    // Locked, when that is asked for; in the order that is asked for.
    const locked = await exportPart(mupdf, session, [2, 1], {
      lock: { password: "part", ownerPassword: "owner", permissions: -1 },
    })
    expect(locked.report.locked).toBe(true)
    await expect(readPdf(locked.bytes)).rejects.toThrow()
    const opened = await readPdf(locked.bytes, "part")
    expect(opened.pages.map((page) => page.text.split(" ")[0])).toEqual([
      "pg-P3",
      "pg-P2",
    ])
    expect(opened.fields).toEqual(["second", "third"])
    stopEditing(session)
  })

  it("are refused when none is chosen, or one that is not there", async () => {
    const session = editing(await makePdf("mn", { pages: 2 }))
    await expect(exportPart(mupdf, session, [])).rejects.toThrow(
      "Choose the pages to save."
    )
    await expect(exportPart(mupdf, session, [2])).rejects.toThrow(
      "Choose the pages to save."
    )
    await expect(exportPart(mupdf, session, [0.5])).rejects.toThrow(
      "Choose the pages to save."
    )
    stopEditing(session)
  })
})

describe("steps before and after a change of pages", () => {
  it("are made again in order, each on the page it was made on", async () => {
    const session = editing(await makeTextPdf())
    const first = linesOn(mupdf, session, 0).find(
      (one) => one.text === TEXT.total
    )!
    applyText(mupdf, session, {
      label: "Change text",
      ops: [
        {
          do: "retext",
          page: 0,
          box: first.box,
          was: first.text,
          text: "Total due: 80 euros",
        },
      ],
    })
    // The page with the changed line is now the second.
    change(session, { do: "move", pages: [0], to: 2 })
    const second = linesOn(mupdf, session, 1).find(
      (one) => one.text === TEXT.title
    )!
    applyText(mupdf, session, {
      label: "Change text",
      ops: [
        {
          do: "retext",
          page: 1,
          box: second.box,
          was: second.text,
          text: "Quarterly art",
        },
      ],
    })
    const { got, report } = await read(session)
    expect(got.pages[0].text).toContain(TEXT.second)
    expect(got.pages[1].text).toContain("Total due: 80 euros")
    expect(got.pages[1].text).toContain("Quarterly art")
    // Both lines are read back from the page they are on now.
    expect(report.retext).toEqual({ steps: 2, lines: 2, found: 2 })
    // The page that only moved is still compared with what it was.
    expect(report.untouched).toEqual({ checked: 1, differ: [] })

    // A draft keeps the steps, with what went with pages, and takes them up again.
    change(session, { do: "delete", pages: [0] })
    const kept = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "letter.pdf",
          size: 1000,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect(kept.steps.map((step) => step.done.kind)).toEqual([
      "text",
      "pages",
      "text",
      "pages",
    ])
    expect((kept.steps[3].done.change as PagesChange).lost).toEqual([
      { links: 0, bookmarks: 0, fields: 0 },
    ])
    const taken = editing(await makeTextPdf())
    takeUp(taken, kept.steps, kept.position)
    expect(taken.laidOut).toBe(1)
    const again = await read(taken)
    expect(again.got.pages).toHaveLength(1)
    expect(again.got.pages[0].text).toContain("Quarterly art")
    expect(again.report.retext).toEqual({ steps: 2, lines: 2, found: 2 })
    expect(again.report.pages.taken).toBe(1)
    // A line of a page that was then taken out is not looked for.
    stepBack(taken)
    stepBack(taken)
    change(taken, { do: "delete", pages: [1] })
    expect((await read(taken)).report.retext).toEqual({
      steps: 1,
      lines: 0,
      found: 0,
    })
    stopEditing(session)
    stopEditing(taken)
  })

  it("come to the same pages as the plan says, whatever is done in whatever order", async () => {
    const session = editing(await makePdf("rn", { pages: 7 }))
    let order = Array.from({ length: 7 }, (_, page) => `rn-P${page + 1}`)
    let seed = 11
    const next = (below: number) => {
      seed = (seed * 1103515245 + 12345) >>> 0
      return (seed >>> 8) % below
    }
    let made = 0
    for (let round = 0; round < 40; round++) {
      const count = order.length
      const one = next(count)
      const pages = [...new Set([one, next(count)])].sort((a, b) => a - b)
      const op: PageOp = (
        [
          { do: "move", pages, to: next(count + 1) },
          { do: "delete", pages: [one] },
          { do: "copy", pages },
          { do: "blank", at: next(count + 1), size: SHEETS.Letter },
          { do: "turn", pages, by: 180 },
        ] as PageOp[]
      )[next(5)]
      const plan = planOf(count, op)
      if (!plan || plan.length > 12) continue
      change(session, op)
      made++
      order = plan.map((page) =>
        "was" in page ? order[page.was] : "copy" in page ? order[page.copy] : ""
      )
    }
    expect(made).toBeGreaterThan(20)
    expect((await read(session)).texts).toEqual(order)
    // Half of it undone and made again comes to the same.
    for (let step = 0; step < made / 2; step++) stepBack(session)
    for (let step = 0; step < made / 2; step++) stepForward(session)
    expect((await read(session)).texts).toEqual(order)
    stopEditing(session)
  })
})
