// @vitest-environment node
/**
 * The file as a whole changed with the real engine: its bookmarks, what
 * it says of itself and the numbers it gives its pages. Results are read
 * back by pdf.js and pdf-lib.
 */
import {
  decodePDFRawStream,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { makePdf } from "@/tests/pdf-fixtures"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import {
  added,
  bookmarkTo,
  indented,
  removed,
  renamed,
  retargeted,
  type DocumentOp,
} from "./document"
import { readDraft } from "./draft"
import { applyDocument, documentOf } from "./mupdf-document"
import {
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyPages } from "./mupdf-pages"

const change = (session: EditSession, label: string, ...ops: DocumentOp[]) =>
  applyDocument(mupdf, session, { label, ops })

async function read(session: EditSession) {
  const { bytes, report } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  return { bytes, report, got: await readPdf(bytes) }
}

const book = (more: Parameters<typeof makePdf>[1] = {}) =>
  makePdf("dc", {
    pages: 5,
    title: "The old title",
    author: "Ada",
    subject: "Old subject",
    keywords: "old",
    bookmarks: [
      { title: "One", page: 1 },
      { title: "Three", page: 3, children: [{ title: "Four", page: 4 }] },
    ],
    ...more,
  })

/** Whether some words are anywhere in a file: in a stream of it, or written outside streams. */
async function holds(bytes: Uint8Array, words: string) {
  const doc = await PDFDocument.load(bytes)
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const text =
      object instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(object).decode()).toString("latin1")
        : object.toString()
    if (text.includes(words)) return true
  }
  return false
}

describe("what a file says of itself", () => {
  it("is read, changed and read back, and a detail that is emptied is gone", async () => {
    const session = startEditing(mupdf, await book())
    expect(documentOf(session).details).toEqual({
      title: "The old title",
      author: "Ada",
      subject: "Old subject",
      keywords: "old",
    })
    expect(
      change(session, "Change the file's details", {
        do: "details",
        details: {
          title: "A new title",
          author: "Ada Lovelace",
          subject: "",
          keywords: "engine, notes",
        },
      })
    ).toEqual([])
    expect(historyOf(session).steps).toEqual(["Change the file's details"])
    expect(documentOf(session).details.subject).toBe("")
    const { got, bytes, report } = await read(session)
    expect(got.info.Title).toBe("A new title")
    expect(got.info.Author).toBe("Ada Lovelace")
    expect(got.info.Keywords).toBe("engine, notes")
    expect(got.info.Subject).toBeUndefined()
    expect(await holds(bytes, "The old title")).toBe(false)
    expect(await holds(bytes, "Old subject")).toBe(false)
    expect(report.document).toEqual({
      details: true,
      bookmarks: false,
      labels: false,
    })
    // No page was changed: every one is compared with what it was.
    expect(report.untouched).toEqual({ checked: 5, differ: [] })
    // Undone, the file says what it said.
    const described = session.described
    stepBack(session)
    expect(session.described).toBe(described! + 1)
    expect(documentOf(session).details.title).toBe("The old title")
    expect((await read(session)).report.document.details).toBe(false)
    stepForward(session)
    expect(documentOf(session).details.title).toBe("A new title")
    stopEditing(session)
  })

  it("takes a second description out with the first, so that the two cannot disagree", async () => {
    // A file that says its title a second time, in a packet of its own.
    const doc = await PDFDocument.load(await book())
    doc.catalog.set(
      PDFName.of("Metadata"),
      doc.context.register(
        doc.context.stream(
          "<x:xmpmeta><dc:title>The old title, said again</dc:title></x:xmpmeta>",
          { Type: "Metadata", Subtype: "XML" }
        )
      )
    )
    const bytes = await doc.save()
    expect(await holds(bytes, "said again")).toBe(true)
    const session = startEditing(mupdf, bytes)
    change(session, "Change the file's details", {
      do: "details",
      details: { title: "New", author: "", subject: "", keywords: "" },
    })
    const out = await read(session)
    expect(out.got.info.Title).toBe("New")
    expect(await holds(out.bytes, "said again")).toBe(false)
    stopEditing(session)
  })
})

describe("a file's bookmarks", () => {
  it("are read, written anew and read back, in the view each had of its page", async () => {
    const session = startEditing(mupdf, await book())
    const was = documentOf(session).bookmarks
    expect(was.map((one) => [one.title, one.page])).toEqual([
      ["One", 0],
      ["Three", 2],
    ])
    expect(was[1].children.map((one) => [one.title, one.page])).toEqual([
      ["Four", 3],
    ])
    // One renamed, one led elsewhere, one added and put beneath another, one taken out.
    let items = renamed(was, [0], "The first page")
    items = retargeted(items, [1], 4)
    const fresh = added(items, [1, 0], bookmarkTo("Two", 1))
    items = fresh.items
    const under = added(items, [1], bookmarkTo("The end", 4))
    items = indented(under.items, under.path)!.items
    items = removed(items, [1, 0])
    change(session, "Change the bookmarks", { do: "bookmarks", items })
    const { got, report } = await read(session)
    expect(got.bookmarks).toEqual([
      { title: "The first page", to: 1, items: [] },
      {
        title: "Three",
        to: 5,
        items: [
          { title: "Two", to: 2, items: [] },
          { title: "The end", to: 5, items: [] },
        ],
      },
    ])
    expect(report.document.bookmarks).toBe(true)
    // What the editor now reads of the file is what was written.
    expect(documentOf(session).bookmarks.map((one) => one.title)).toEqual([
      "The first page",
      "Three",
    ])
    // They follow their pages when pages are moved afterwards.
    applyPages(mupdf, session, {
      label: "Move page 5",
      ops: [{ do: "move", pages: [4], to: 0 }],
    })
    expect((await read(session)).got.bookmarks[1].to).toBe(1)
    stepBack(session)
    stepBack(session)
    expect((await read(session)).got.bookmarks.map((one) => one.title)).toEqual(
      ["One", "Three"]
    )
    stopEditing(session)
  })

  it("are all taken away, and made in a file that had none", async () => {
    const session = startEditing(mupdf, await book())
    change(session, "Delete the bookmarks", { do: "bookmarks", items: [] })
    expect((await read(session)).got.bookmarks).toEqual([])
    expect(documentOf(session).bookmarks).toEqual([])
    stopEditing(session)
    const bare = startEditing(mupdf, await makePdf("nb", { pages: 3 }))
    expect(documentOf(bare).bookmarks).toEqual([])
    change(bare, "Add a bookmark", {
      do: "bookmarks",
      items: [
        bookmarkTo("Start", 0),
        // A heading that leads nowhere, with one beneath it; and one to a page the file does not have.
        {
          title: "Part",
          uri: undefined,
          page: null,
          open: true,
          children: [bookmarkTo("Last", 2)],
        },
        bookmarkTo("Beyond", 9),
      ],
    })
    expect((await read(bare)).got.bookmarks).toEqual([
      { title: "Start", to: 1, items: [] },
      { title: "Part", to: null, items: [{ title: "Last", to: 3, items: [] }] },
      { title: "Beyond", to: null, items: [] },
    ])
    stopEditing(bare)
  })
})

describe("the numbers a file gives its own pages", () => {
  it("are read, set in runs and read back, and taken away", async () => {
    const session = startEditing(mupdf, await book({ romanPages: 2 }))
    expect(documentOf(session).runs).toEqual([
      { start: 0, style: "r", prefix: "", first: 1 },
      { start: 2, style: "D", prefix: "", first: 1 },
    ])
    change(session, "Change the page numbers", {
      do: "labels",
      runs: [
        { start: 0, style: "", prefix: "Cover", first: 1 },
        { start: 1, style: "R", prefix: "", first: 1 },
        { start: 3, style: "D", prefix: "A-", first: 7 },
      ],
    })
    const { got, report } = await read(session)
    expect(got.labels).toEqual(["Cover", "I", "II", "A-7", "A-8"])
    expect(report.document.labels).toBe(true)
    expect(documentOf(session).runs).toEqual([
      { start: 0, style: "", prefix: "Cover", first: 1 },
      { start: 1, style: "R", prefix: "", first: 1 },
      { start: 3, style: "D", prefix: "A-", first: 7 },
    ])
    change(session, "Change the page numbers", { do: "labels", runs: [] })
    expect((await read(session)).got.labels).toBeNull()
    expect(documentOf(session).runs).toEqual([])
    stepBack(session)
    stepBack(session)
    expect((await read(session)).got.labels).toEqual(["i", "ii", "1", "2", "3"])
    stopEditing(session)
  })
})

describe("changes to the file as a whole", () => {
  it("are refused when they are none, and kept with a draft", async () => {
    const bytes = await book()
    const session = startEditing(mupdf, bytes)
    expect(() =>
      change(session, "Change", { do: "labels", runs: "all" } as never)
    ).toThrow("That is not a change to the file.")
    expect(historyOf(session).steps).toEqual([])
    change(
      session,
      "Change the file",
      {
        do: "details",
        details: { title: "Kept", author: "", subject: "", keywords: "" },
      },
      { do: "bookmarks", items: [bookmarkTo("Only", 2)] }
    )
    const kept = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "book.pdf",
          size: 1000,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect(kept.steps.map((step) => step.done.kind)).toEqual(["document"])
    const taken = startEditing(mupdf, bytes)
    takeUp(taken, kept.steps, kept.position)
    expect(taken.described).toBe(1)
    const { got } = await read(taken)
    expect(got.info.Title).toBe("Kept")
    expect(got.bookmarks).toEqual([{ title: "Only", to: 3, items: [] }])
    stopEditing(session)
    stopEditing(taken)
  })
})
