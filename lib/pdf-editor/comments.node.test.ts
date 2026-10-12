// @vitest-environment node
/**
 * Comments with the real engine. Results are read back by pdf.js and
 * pdf-lib, so the engine is never only checked against itself.
 */
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { makePdf, pageText } from "@/tests/pdf-fixtures"
import { readComments, readPdf, texts } from "@/tests/pdf-reader"
import {
  selectWords,
  wordsUnder,
  type CommentOp,
  type MarkKind,
} from "./comments"
import { applyComments, commentsOn, lettersOn } from "./mupdf-comments"
import {
  applyChange,
  exportEdited,
  historyOf,
  objectsOn,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  type EditSession,
} from "./mupdf-edit"
import type { ShapeObject } from "./objects"

const YELLOW = [1, 0.86, 0.2] as const
const RED = [0.86, 0.15, 0.15] as const
const WHEN = Date.UTC(2026, 9, 12, 9, 30)

const change = (session: EditSession, ...ops: CommentOp[]) =>
  applyComments(mupdf, session, { label: "Comment", ops })

const about = { author: "Ada", when: WHEN }

/** Mark every word of a page. */
function markAll(
  session: EditSession,
  page: number,
  kind: MarkKind = "highlight"
) {
  const lines = lettersOn(session, page)
  const quads = lines.map((line) => {
    const first = line.quads[0]
    const last = line.quads.at(-1)!
    return [
      first[0],
      first[1],
      last[2],
      last[3],
      first[4],
      first[5],
      last[6],
      last[7],
    ] as const
  })
  change(session, {
    ...about,
    do: "mark",
    page,
    kind,
    quads,
    colour: YELLOW,
    opacity: 1,
  })
  return quads
}

function pixelAt(doc: mupdf.PDFDocument, page: number, x: number, y: number) {
  const loaded = doc.loadPage(page)
  const [, , right, bottom] = loaded.getBounds()
  loaded.destroy()
  const picture = drawPage(mupdf, doc, page, Math.max(right, bottom))
  const at = (Math.round(y) * picture.width + Math.round(x)) * 4
  return [picture.data[at], picture.data[at + 1], picture.data[at + 2]]
}

const picture = (doc: mupdf.PDFDocument, page = 0) =>
  Buffer.from(drawPage(mupdf, doc, page, 600).data.buffer)

/** The largest difference between two pictures, in any colour of any pixel. */
function farthest(one: Buffer, two: Buffer) {
  expect(one.length).toBe(two.length)
  let most = 0
  for (let at = 0; at < one.length; at++)
    most = Math.max(most, Math.abs(one[at] - two[at]))
  return most
}

const isYellow = ([r, g, b]: number[]) => r > 230 && g > 190 && b < 120
const isWhite = ([r, g, b]: number[]) => r > 245 && g > 245 && b > 245
const open = (bytes: Uint8Array) => new mupdf.PDFDocument(bytes)

const redBox: ShapeObject = {
  id: "box",
  kind: "box",
  rotation: 0,
  opacity: 1,
  box: { x: 20, y: 20, width: 60, height: 20 },
  stroke: null,
  fill: RED,
  weight: 2,
}

describe("marks on words", () => {
  it("reads a page's letters, and lays a mark on the words between two points", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("mk", { pages: 2, size: () => [400, 600] })
    )
    const lines = lettersOn(session, 0)
    expect(lines.map((line) => line.letters.join(""))).toEqual([
      pageText("mk", 1),
    ])
    const [word] = lines[0].quads
    const quads = selectWords(
      lines,
      { x: word[0] + 2, y: word[1] + 2 },
      { x: word[0] + 2, y: word[1] + 2 }
    )
    expect(quads).toHaveLength(1)
    expect(wordsUnder(lines, quads)).toBe(pageText("mk", 1))
    expect(
      change(session, {
        ...about,
        do: "mark",
        page: 0,
        kind: "highlight",
        quads,
        colour: YELLOW,
        opacity: 1,
      })
    ).toEqual([0])

    const [comment] = commentsOn(session, 0)
    expect(comment).toMatchObject({
      kind: "highlight",
      type: "Highlight",
      author: "Ada",
      when: WHEN,
      text: "",
      replies: [],
    })
    expect(comment.id).toMatch(/^c\d+$/)
    expect(comment.quads).toHaveLength(1)
    expect(comment.colour?.map((part) => Math.round(part * 100))).toEqual([
      100, 86, 20,
    ])
    expect(commentsOn(session, 1)).toEqual([])
    // The page shows it: the word stands on yellow, and is still dark itself.
    const middle = {
      x: (quads[0][0] + quads[0][2]) / 2,
      y: (quads[0][1] + quads[0][5]) / 2,
    }
    // Just inside a corner of the word's box, where no letter reaches.
    expect(
      isYellow(pixelAt(session.doc, 0, quads[0][0] + 1, quads[0][1] + 1))
    ).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, quads[0][0] - 12, middle.y))).toBe(
      true
    )

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.comments).toEqual({ had: 1, how: "keep", has: 1 })
    // Nothing was added to the pages themselves, and a page that only got a
    // comment is not taken for one that changed by mistake.
    expect(report.added).toBe(0)
    expect(report.untouched).toEqual({ checked: 1, differ: [] })
    const [[read], none] = await readComments(bytes)
    expect(read).toMatchObject({
      kind: "Highlight",
      author: "Ada",
      colour: [1, 0.86, 0.2],
      quads: 1,
      reply: false,
    })
    expect(read.modified).toContain("20261012")
    expect(none).toEqual([])
    expect(await texts(bytes)).toEqual([pageText("mk", 1), pageText("mk", 2)])
    stopEditing(session)
  })

  it("lays marks on the words of pages the file shows turned", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("turn", {
        pages: 4,
        size: () => [300, 500],
        rotate: { 2: 90, 3: 180, 4: 270 },
      })
    )
    for (let page = 0; page < 4; page++) {
      const before = picture(session.doc, page)
      const [quad] = markAll(session, page)
      const xs = [quad[0], quad[2], quad[4], quad[6]]
      const ys = [quad[1], quad[3], quad[5], quad[7]]
      // Just inside a corner of the word's box, where no letter reaches.
      const corner = pixelAt(
        session.doc,
        page,
        Math.min(...xs) + 1,
        Math.min(...ys) + 1
      )
      expect(isYellow(corner), `page ${page + 1}`).toBe(true)
      expect(picture(session.doc, page).equals(before)).toBe(false)
    }
    const { bytes } = await exportEdited(mupdf, session)
    expect((await readComments(bytes)).map((page) => page.length)).toEqual([
      1, 1, 1, 1,
    ])
    stopEditing(session)
  })

  it("underlines, strikes out and squiggles", async () => {
    const session = startEditing(mupdf, await makePdf("kinds", { pages: 3 }))
    markAll(session, 0, "underline")
    markAll(session, 1, "strike")
    markAll(session, 2, "squiggle")
    expect([0, 1, 2].map((page) => commentsOn(session, page)[0].kind)).toEqual([
      "underline",
      "strike",
      "squiggle",
    ])
    const { bytes } = await exportEdited(mupdf, session)
    expect((await readComments(bytes)).map(([one]) => one.kind)).toEqual([
      "Underline",
      "StrikeOut",
      "Squiggly",
    ])
    stopEditing(session)
  })
})

describe("notes, replies and the pen", () => {
  it("places a note, and keeps the talk under it together", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("note", { size: () => [400, 600] })
    )
    change(session, {
      ...about,
      do: "note",
      page: 0,
      at: { x: 100, y: 200 },
      colour: YELLOW,
      text: "Is this figure right?",
    })
    const [note] = commentsOn(session, 0)
    expect(note).toMatchObject({
      kind: "note",
      text: "Is this figure right?",
      author: "Ada",
      box: { x: 90, y: 190 },
    })
    const alone = picture(session.doc)
    expect(isWhite(pixelAt(session.doc, 0, 100, 200))).toBe(false)

    // A reply, and a reply to the reply, are both under the note.
    change(session, {
      do: "reply",
      page: 0,
      to: note.id,
      text: "It is.",
      author: "Bo",
      when: WHEN + 60_000,
    })
    const [first] = commentsOn(session, 0)[0].replies
    change(session, {
      do: "reply",
      page: 0,
      to: first.id,
      text: "Thank you.",
      author: "Ada",
      when: WHEN + 120_000,
    })
    const talk = commentsOn(session, 0)
    expect(talk).toHaveLength(1)
    expect(talk[0].replies).toMatchObject([
      { author: "Bo", text: "It is.", when: WHEN + 60_000 },
      { author: "Ada", text: "Thank you.", when: WHEN + 120_000 },
    ])
    // A reply draws nothing of its own on the page.
    expect(picture(session.doc).equals(alone)).toBe(true)
    // A reply to something that is not there is no step at all.
    const steps = historyOf(session).position
    change(session, { ...about, do: "reply", page: 0, to: "c999", text: "?" })
    expect(historyOf(session).position).toBe(steps)

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.comments).toEqual({ had: 3, how: "keep", has: 3 })
    const [read] = await readComments(bytes)
    expect(
      read.map((one) => [one.kind, one.text, one.author, one.reply])
    ).toEqual([
      ["Text", "Is this figure right?", "Ada", false],
      ["Text", "It is.", "Bo", true],
      ["Text", "Thank you.", "Ada", true],
    ])
    stopEditing(session)
  })

  it("changes a note's words, colour and place, and removes it with its replies", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("edit", { size: () => [400, 600] })
    )
    change(session, {
      ...about,
      do: "note",
      page: 0,
      at: { x: 100, y: 200 },
      colour: YELLOW,
      text: "First",
    })
    const { id } = commentsOn(session, 0)[0]
    change(session, { ...about, do: "reply", page: 0, to: id, text: "Yes" })
    change(session, {
      do: "edit",
      page: 0,
      id,
      when: WHEN + 5000,
      text: "Second",
      colour: [0.45, 0.75, 1],
      move: { x: 50, y: -20 },
    })
    const [moved] = commentsOn(session, 0)
    expect(moved).toMatchObject({
      id,
      text: "Second",
      when: WHEN + 5000,
      box: { x: 140, y: 170 },
    })
    expect(moved.colour?.map((part) => Math.round(part * 100))).toEqual([
      45, 75, 100,
    ])
    expect(isWhite(pixelAt(session.doc, 0, 100, 200))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 150, 180))).toBe(false)
    // A reply's words can be changed too; it is not given a look.
    const reply = moved.replies[0]
    change(session, {
      do: "edit",
      page: 0,
      id: reply.id,
      when: WHEN + 6000,
      text: "Yes, indeed",
      colour: [0, 0, 0],
    })
    expect(commentsOn(session, 0)[0].replies[0].text).toBe("Yes, indeed")
    // A change to a comment that is not there does nothing.
    change(session, { do: "edit", page: 0, id: "c999", when: 1, text: "x" })
    change(session, { do: "drop", page: 0, id: "c999" })
    expect(commentsOn(session, 0)).toHaveLength(1)

    change(session, { do: "drop", page: 0, id })
    expect(commentsOn(session, 0)).toEqual([])
    const { bytes } = await exportEdited(mupdf, session)
    // Nothing of the talk is left: not the note, its reply, or their windows.
    expect((await readPdf(bytes)).pages[0].kinds).toEqual([])
    stopEditing(session)
  })

  it("draws with a highlighter pen, and moves the stroke", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("pen", { size: () => [400, 600] })
    )
    change(session, {
      ...about,
      do: "pen",
      page: 0,
      strokes: [
        [
          { x: 100, y: 400 },
          { x: 200, y: 400 },
        ],
      ],
      colour: YELLOW,
      weight: 12,
      opacity: 0.4,
    })
    const [pen] = commentsOn(session, 0)
    expect(pen).toMatchObject({ kind: "pen", type: "Ink", weight: 12 })
    expect(pen.opacity).toBeCloseTo(0.4, 5)
    expect(pen.strokes).toEqual([
      [
        { x: 100, y: 400 },
        { x: 200, y: 400 },
      ],
    ])
    // See-through: the page shows a pale yellow, not the full colour.
    const [r, g, b] = pixelAt(session.doc, 0, 150, 400)
    expect(r).toBeGreaterThan(240)
    expect(b).toBeGreaterThan(140)
    expect(b).toBeLessThan(250)
    expect(g).toBeGreaterThan(b)
    change(session, {
      do: "edit",
      page: 0,
      id: pen.id,
      when: WHEN,
      move: { x: 0, y: 100 },
    })
    expect(isWhite(pixelAt(session.doc, 0, 150, 400))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 150, 500))).toBe(false)
    const { bytes } = await exportEdited(mupdf, session)
    expect((await readComments(bytes))[0].map((one) => one.kind)).toEqual([
      "Ink",
    ])
    stopEditing(session)
  })
})

describe("comments a file comes with", () => {
  it("reads them, answers them and changes their words", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("own", {
        pages: 2,
        notes: [{ page: 2, text: "From the author" }],
      })
    )
    expect(commentsOn(session, 0)).toEqual([])
    const [note] = commentsOn(session, 1)
    expect(note).toMatchObject({
      kind: "note",
      text: "From the author",
      author: "",
      when: null,
      replies: [],
    })
    change(
      session,
      { ...about, do: "reply", page: 1, to: note.id, text: "Seen." },
      {
        do: "edit",
        page: 1,
        id: note.id,
        when: WHEN,
        text: "From the author (checked)",
      }
    )
    const { bytes } = await exportEdited(mupdf, session)
    const [, read] = await readComments(bytes)
    expect(read.map((one) => [one.text, one.reply])).toEqual([
      ["From the author (checked)", false],
      ["Seen.", true],
    ])
    stopEditing(session)
  })

  it("shows other kinds of comment and changes their words, and leaves their look alone", async () => {
    // A file with a square and a call-out, as another program would leave them.
    const plain = open(await makePdf("other", { size: () => [400, 600] }))
    const page = plain.loadPage(0)
    const square = page.createAnnotation("Square")
    square.setRect([50, 50, 150, 120])
    square.setColor([0, 0, 1])
    square.setContents("Check this area")
    square.update()
    const callout = page.createAnnotation("FreeText")
    callout.setRect([200, 50, 320, 90])
    callout.setContents("See here")
    callout.update()
    const input = plain.saveToBuffer({}).asUint8Array().slice()
    page.destroy()
    plain.destroy()

    const session = startEditing(mupdf, input)
    const found = commentsOn(session, 0)
    expect(found.map((one) => [one.kind, one.type, one.text])).toEqual([
      ["other", "Square", "Check this area"],
      ["other", "FreeText", "See here"],
    ])
    const before = picture(session.doc)
    change(session, {
      do: "edit",
      page: 0,
      id: found[0].id,
      when: WHEN,
      text: "Checked",
      colour: [1, 0, 0],
      opacity: 0.2,
      move: { x: 40, y: 40 },
    })
    expect(commentsOn(session, 0)[0].text).toBe("Checked")
    expect(picture(session.doc).equals(before)).toBe(true)
    change(session, { do: "drop", page: 0, id: found[1].id })
    expect(commentsOn(session, 0).map((one) => one.type)).toEqual(["Square"])
    stopEditing(session)
  })
})

describe("steps, and what a download does with comments", () => {
  it("undoes and redoes comments among the editor's other changes", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("steps", { pages: 2, size: () => [400, 600] })
    )
    markAll(session, 0)
    applyChange(mupdf, session, {
      label: "Add box",
      ops: [{ do: "add", page: 1, object: redBox }],
    })
    change(session, {
      ...about,
      do: "note",
      page: 1,
      at: { x: 200, y: 300 },
      colour: YELLOW,
      text: "On the second page",
    })
    expect(historyOf(session)).toMatchObject({
      steps: ["Comment", "Add box", "Comment"],
      position: 3,
    })
    // A thing the editor added is not a comment, and a comment is not a thing.
    expect(commentsOn(session, 1)).toHaveLength(1)
    expect(objectsOn(session, 1)).toHaveLength(1)
    expect(stepBack(session)).toEqual([1])
    expect(commentsOn(session, 1)).toEqual([])
    expect(stepBack(session)).toEqual([1])
    expect(stepBack(session)).toEqual([0])
    expect(commentsOn(session, 0)).toEqual([])
    expect(stepForward(session)).toEqual([0])
    expect(commentsOn(session, 0)).toHaveLength(1)
    stopEditing(session)
  })

  it("refuses what is not a change to comments, and leaves the file as it was", async () => {
    const session = startEditing(mupdf, await makePdf("bad"))
    expect(() =>
      applyComments(mupdf, session, {
        label: "Bad",
        ops: [{ do: "mark", page: 0 } as never],
      })
    ).toThrow("not a change to comments")
    // A page the file does not have is passed over.
    change(session, { do: "drop", page: 9, id: "c1" })
    expect(historyOf(session).position).toBe(0)
    stopEditing(session)
  })

  it("keeps comments, makes them part of the page, or leaves them out", async () => {
    const input = await makePdf("out", {
      pages: 2,
      size: () => [400, 600],
      links: [{ from: 1, to: 2 }],
      fields: [{ name: "name", value: "Ada", page: 1 }],
      notes: [{ page: 2, text: "The file's own" }],
    })
    const session = startEditing(mupdf, input)
    const [quad] = markAll(session, 0)
    const { id } = commentsOn(session, 1)[0]
    change(session, { ...about, do: "reply", page: 1, to: id, text: "Seen." })
    applyChange(mupdf, session, {
      label: "Add box",
      ops: [{ do: "add", page: 0, object: redBox }],
    })
    // Just inside a corner of the word's box, where no letter reaches.
    const marked = { x: quad[0] + 1, y: quad[1] + 1 }

    const kept = await exportEdited(mupdf, session)
    expect(kept.report.comments).toEqual({ had: 3, how: "keep", has: 3 })
    expect((await readPdf(kept.bytes)).pages[0].kinds).toEqual([
      "Highlight",
      "Link",
      "Widget",
    ])

    // Made part of the page: no comment is left, the page looks the same,
    // and links and form fields are where they were.
    const flat = await exportEdited(mupdf, session, { comments: "flatten" })
    expect(flat.report.comments).toEqual({ had: 3, how: "flatten", has: 0 })
    expect(flat.report.untouched).toEqual({ checked: 0, differ: [] })
    const flatRead = await readPdf(flat.bytes)
    expect(flatRead.pages.map((page) => page.kinds)).toEqual([
      ["Link", "Widget"],
      [],
    ])
    expect(flatRead.pages[0].links).toEqual([2])
    expect(flatRead.pages[0].fields).toEqual(["name=Ada"])
    const flatDoc = open(flat.bytes)
    expect(isYellow(pixelAt(flatDoc, 0, marked.x, marked.y))).toBe(true)
    // Blending a mark into the page rounds a shade differently here and
    // there: by two parts in 255 at most, which no eye can tell.
    expect(farthest(picture(flatDoc), picture(open(kept.bytes)))).toBeLessThan(
      4
    )
    flatDoc.destroy()

    // Left out: the mark is gone from the page, the box that was added is not.
    const none = await exportEdited(mupdf, session, { comments: "remove" })
    expect(none.report.comments).toEqual({ had: 3, how: "remove", has: 0 })
    const noneRead = await readPdf(none.bytes)
    expect(noneRead.pages.map((page) => page.kinds)).toEqual([
      ["Link", "Widget"],
      [],
    ])
    const noneDoc = open(none.bytes)
    expect(isWhite(pixelAt(noneDoc, 0, marked.x, marked.y))).toBe(true)
    expect(isWhite(pixelAt(noneDoc, 0, 50, 30))).toBe(false)
    noneDoc.destroy()

    // What was added can stay movable while the comments become part of the page.
    const both = await exportEdited(mupdf, session, {
      comments: "flatten",
      keepEditable: true,
    })
    expect((await readPdf(both.bytes)).pages[0].kinds).toEqual([
      "Link",
      "Stamp",
      "Widget",
    ])
    // The working copy still has everything, to go on with.
    expect(commentsOn(session, 0)).toHaveLength(1)
    expect(commentsOn(session, 1)[0].replies).toHaveLength(1)
    stopEditing(session)
  })
})
