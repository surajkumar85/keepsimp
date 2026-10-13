// @vitest-environment node
/**
 * Taking things out for good with the real engine. Results are read back
 * by pdf.js and pdf-lib: what a page says, what its picture's pixels are,
 * which notes, links and fields are left, and whether what was taken out
 * is anywhere in the file at all.
 */
import {
  decodePDFRawStream,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { makeFormPdf, makePdf, noise } from "@/tests/pdf-fixtures"
import {
  jpegOf,
  makePicturePdf,
  readPictures,
  scene,
} from "@/tests/pdf-pictures"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import {
  makeRedactPdf,
  makeUnseenPdf,
  PICTURE,
  PLACES,
  REDACT,
  UNSEEN,
  UNSEEN_PLACES,
} from "@/tests/pdf-redact"
import { readDraft } from "./draft"
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
import { applyRedact, redactFind, redactMarksOn } from "./mupdf-redact"
import { applyText, linesOn } from "./mupdf-text"
import { exportAfter } from "./mupdf-signed"
import { boxOf, quadOf, type RedactChange, type RedactOp } from "./redact"

installNodeCodecShims()

const change = (session: EditSession, label: string, ...ops: RedactOp[]) =>
  applyRedact(mupdf, session, { label, ops })

const mark = (id: string, place: keyof typeof PLACES, page = 0): RedactOp => ({
  do: "mark",
  page,
  id,
  quads: [quadOf(PLACES[place])],
})

/** What applying did, as the step keeps it. */
const done = (session: EditSession) =>
  (session.steps[session.position - 1].done.change as RedactChange).done!

async function read(session: EditSession) {
  const { bytes, report } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  return { bytes, report, got: await readPdf(bytes) }
}

/** Whether some words are anywhere in a file: in a stream of it, or written outside streams, as letters or as their numbers. */
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

/** The colour of a page at a point, in a picture the engine draws of the file as it stands. */
function colourAt(session: EditSession, x: number, y: number, page = 0) {
  const drawn = drawPage(mupdf, session.doc, page, 600)
  const at = (Math.round(y) * drawn.width + Math.round(x)) * 4
  return [...drawn.data.slice(at, at + 3)]
}

describe("marks for taking something out", () => {
  it("are kept on the page until they are applied, and take nothing out by themselves", async () => {
    const session = startEditing(mupdf, await makeRedactPdf())
    expect(redactMarksOn(session, 0)).toEqual([])
    expect(
      change(session, "Mark 2 places", mark("a", "secret"), mark("b", "area"))
    ).toEqual([0])
    const marks = redactMarksOn(session, 0)
    expect(marks.map((one) => one.id)).toEqual(["a", "b"])
    expect(boxOf(marks[0].quads[0])).toEqual(PLACES.secret)
    // The same name twice is one mark.
    change(session, "Mark a place", mark("a", "half"))
    expect(redactMarksOn(session, 0)).toHaveLength(2)
    change(session, "Take a mark away", { do: "unmark", page: 0, id: "b" })
    expect(redactMarksOn(session, 0).map((one) => one.id)).toEqual(["a"])
    // A mark that is not there, and a page that is not there, change nothing.
    change(session, "Take a mark away", { do: "unmark", page: 0, id: "zz" })
    change(session, "Mark a place", {
      ...mark("c", "area"),
      page: 9,
    } as RedactOp)
    expect(historyOf(session).steps).toEqual([
      "Mark 2 places",
      "Take a mark away",
    ])
    const { got, bytes, report } = await read(session)
    expect(got.pages[0].text).toContain(REDACT.secret)
    expect(await holds(bytes, "4111")).toBe(true)
    // The download says that the mark is not applied, and that what is under it is still there.
    expect(report.redaction).toEqual({
      places: 0,
      pages: 0,
      residue: 0,
      notes: 0,
      fields: 0,
      waiting: 1,
    })
    stopEditing(session)
  })

  it("wait on while the words of their page are changed: nothing under them is taken out", async () => {
    for (const foreign of [false, true]) {
      const session = startEditing(mupdf, await makeRedactPdf(foreign))
      change(session, "Mark a place", mark("a", "secret"))
      const line = linesOn(mupdf, session, 0).find(
        (one) => one.text === REDACT.mail
      )!
      applyText(mupdf, session, {
        label: "Change text",
        ops: [
          {
            do: "retext",
            page: 0,
            box: line.box,
            was: line.text,
            text: "Write to us today",
          },
        ],
      })
      const { got, report } = await read(session)
      expect(got.pages[0].text).toContain("Write to us today")
      // The line under the mark, and the line under a mark that is not ours, are still there.
      expect(got.pages[0].text).toContain(REDACT.secret)
      expect(got.pages[0].text).toContain(REDACT.keep)
      expect(redactMarksOn(session, 0).map((one) => one.id)).toEqual(["a"])
      expect(report.redaction.waiting).toBe(1)
      stopEditing(session)
    }
  })

  it("are refused when they are none", async () => {
    const session = startEditing(mupdf, await makeRedactPdf())
    expect(() =>
      change(session, "Mark", { do: "mark", page: 0, id: "a" } as never)
    ).toThrow("That is not a change to the marks.")
    expect(() => change(session, "Apply", { do: "apply" })).toThrow(
      "There are no marks to apply."
    )
    expect(historyOf(session).steps).toEqual([])
    stopEditing(session)
  })
})

describe("applying marks", () => {
  it("takes the letters, the pixels and the drawings under them out of the file", async () => {
    const bytes = await makeRedactPdf()
    for (const words of ["4111", REDACT.note, REDACT.account])
      expect(await holds(bytes, words)).toBe(true)
    const session = startEditing(mupdf, bytes)
    change(
      session,
      "Mark 4 places",
      mark("a", "secret"),
      mark("b", "half"),
      mark("c", "area"),
      mark("d", "field")
    )
    expect(change(session, "Apply the marks", { do: "apply" })).toEqual([0])
    expect(redactMarksOn(session, 0)).toEqual([])
    const [[applied]] = done(session).slice(-1)
    expect(applied.page).toBe(0)
    expect(applied.boxes).toEqual([
      PLACES.secret,
      PLACES.half,
      PLACES.area,
      PLACES.field,
    ])
    // The note over the line and the field went with what they lay on.
    expect(applied.notes).toBe(1)
    expect(applied.fields).toBe(1)
    // The blue line reaches beyond its mark: it is still drawn under it.
    expect(applied.residue).toBe(1)

    const { got, bytes: out, report } = await read(session)
    const [page, other] = got.pages
    expect(page.text).toContain(REDACT.keep)
    expect(page.text).toContain(REDACT.mail)
    expect(page.text).not.toContain("4111")
    expect(page.text).not.toContain("Ada")
    // Of the line that was half under a mark, the other half is left.
    expect(page.text).not.toContain("Half in")
    expect(page.text).toContain("half out")
    // Nothing of what was under a mark is anywhere in the file.
    for (const words of ["4111", REDACT.note, REDACT.account, "secret.example"])
      expect(await holds(out, words)).toBe(false)
    expect(page.links).toEqual(["https://kept.example/"])
    expect(page.notes).toEqual([])
    expect(page.fields).toEqual([])
    expect(got.fields).toEqual([])
    // The picture: its part under the mark is white, the rest is as it was.
    const pictures = await readPictures(out)
    const mine = pictures.find((one) => one.page === 1)!
    const was = noise(PICTURE * PICTURE * 3, 3)
    const pixel = (x: number, y: number) => [
      ...mine.data.slice((y * PICTURE + x) * 4, (y * PICTURE + x) * 4 + 3),
    ]
    const before = (x: number, y: number) => [
      ...was.slice((y * PICTURE + x) * 3, (y * PICTURE + x) * 3 + 3),
    ]
    // The mark covers the picture's left 60 points of its top 60.
    expect(pixel(10, 10)).toEqual([255, 255, 255])
    expect(pixel(55, 55)).toEqual([255, 255, 255])
    expect(pixel(80, 20)).toEqual(before(80, 20))
    expect(pixel(20, 80)).toEqual(before(20, 80))
    // The other page draws the same picture, and has all of it still.
    const theirs = pictures.find((one) => one.page === 2)!
    expect([...theirs.data.slice(0, 3)]).toEqual([...was.slice(0, 3)])
    expect(other.text).toContain(REDACT.second)
    // Where the marks were there are black boxes; beside them the page is as it was.
    expect(colourAt(session, 100, 96)).toEqual([0, 0, 0])
    expect(colourAt(session, 150, 220)).toEqual([0, 0, 0])
    expect(colourAt(session, 380, 96)).toEqual([255, 255, 255])
    expect(report.redaction).toEqual({
      places: 4,
      pages: 1,
      residue: 1,
      notes: 1,
      fields: 1,
      waiting: 0,
    })
    // The page that was not marked is compared with what it was.
    expect(report.untouched).toEqual({ checked: 1, differ: [] })

    // Undone, everything is back in the working copy; made again, it is gone again.
    stepBack(session)
    expect(redactMarksOn(session, 0)).toHaveLength(4)
    expect((await read(session)).got.pages[0].text).toContain(REDACT.secret)
    stepForward(session)
    expect((await read(session)).got.pages[0].text).not.toContain("4111")
    stopEditing(session)
  })

  it("takes whole drawings out when asked to, and leaves nothing drawn under a mark", async () => {
    const session = startEditing(mupdf, await makeRedactPdf())
    change(session, "Mark a place", mark("c", "area"))
    change(session, "Apply the marks", { do: "apply", touched: true })
    const [[applied]] = done(session).slice(-1)
    expect(applied.residue).toBe(0)
    // The blue line is gone from the whole page, also where no mark was.
    expect(colourAt(session, 300, 205)).toEqual([255, 255, 255])
    expect((await read(session)).report.redaction.residue).toBe(0)
    stopEditing(session)
  })

  it("leaves a mark alone that is not the editor's", async () => {
    const session = startEditing(mupdf, await makeRedactPdf(true))
    expect(redactMarksOn(session, 0)).toEqual([])
    change(session, "Mark a place", mark("a", "secret"))
    change(session, "Apply the marks", { do: "apply" })
    const { got, report } = await read(session)
    // The line under the other mark is still there, and so is that mark.
    expect(got.pages[0].text).toContain(REDACT.keep)
    expect(got.pages[0].text).not.toContain("4111")
    expect(got.pages[0].kinds).toContain("Redact")
    expect(report.redaction.waiting).toBe(0)
    stopEditing(session)
  })
})

describe("looking for what is to be taken out", () => {
  it("finds words and things of a kind on every page, and marks them", async () => {
    const session = startEditing(mupdf, await makeRedactPdf())
    const mails = redactFind(session, { pattern: "email" })
    expect(mails.more).toBe(false)
    expect(mails.found.map((one) => [one.page, one.text])).toEqual([
      [0, "ada@example.org"],
      [1, "ada@example.org"],
    ])
    expect(
      redactFind(session, { pattern: "card" }).found.map((one) => one.text)
    ).toEqual(["4111 1111 1111 1111"])
    expect(redactFind(session, { words: "ada" }).found).toHaveLength(3)
    expect(redactFind(session, { words: "nowhere" }).found).toEqual([])
    change(
      session,
      "Mark 2 places",
      ...mails.found.map((place, at): RedactOp => ({
        do: "mark",
        page: place.page,
        id: `m${at}`,
        quads: [place.quad],
      }))
    )
    expect(change(session, "Apply the marks", { do: "apply" })).toEqual([0, 1])
    const { got, bytes, report } = await read(session)
    expect(got.pages[0].text).toContain("Write to")
    expect(got.pages[0].text).toContain("today")
    expect(got.pages[1].text).toContain("Page two names")
    expect(got.pages.map((page) => page.text).join(" ")).not.toContain(
      "example.org"
    )
    expect(await holds(bytes, "ada@example.org")).toBe(false)
    expect(report.redaction).toMatchObject({ places: 2, pages: 2, residue: 0 })
    stopEditing(session)
  })
})

describe("a photograph under a mark", () => {
  it("is a JPEG again, about as large as it was, with the marked part blank and the rest as it looked", async () => {
    const wide = 800
    const tall = 600
    const photo = scene(wide, tall)
    const jpeg = await jpegOf(photo, 80)
    // Drawn 400 points wide from 40 points in, 72 points down an A4 page.
    const file = await makePicturePdf([
      { type: "jpeg", bytes: jpeg, width: 400 },
    ])
    const session = startEditing(mupdf, file)
    // Its left half, from the top down to the middle.
    change(session, "Mark a place", {
      do: "mark",
      page: 0,
      id: "p",
      quads: [quadOf({ x: 40, y: 72, width: 200, height: 150 })],
    })
    change(session, "Apply the marks", { do: "apply" })
    const { bytes, report } = await read(session)
    expect(report.redaction).toMatchObject({ places: 1, residue: 0 })
    // One picture, kept as a JPEG, and not much larger than it was.
    const doc = await PDFDocument.load(bytes)
    const streams = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter(
        (object): object is PDFRawStream =>
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")
      )
    expect(streams).toHaveLength(1)
    expect(streams[0].dict.get(PDFName.of("Filter"))).toBe(
      PDFName.of("DCTDecode")
    )
    expect(streams[0].contents.length).toBeLessThan(jpeg.length * 1.2)
    expect(bytes.length).toBeLessThan(file.length * 1.3)
    // The picture as it was is nowhere in the file.
    expect(Buffer.from(bytes).includes(Buffer.from(jpeg.slice(0, 600)))).toBe(
      false
    )
    const [mine] = await readPictures(bytes)
    expect([mine.width, mine.height]).toEqual([wide, tall])
    const at = (pixels: { data: ArrayLike<number> }, x: number, y: number) =>
      [0, 1, 2].map((part) => pixels.data[(y * wide + x) * 4 + part])
    // Blank well inside the mark, at its middle and near its corners.
    for (const [x, y] of [
      [200, 150],
      [20, 20],
      [380, 280],
    ])
      for (const part of at(mine, x, y)) expect(part).toBeGreaterThan(245)
    // Beside the mark the photograph is what it was, as near as a JPEG keeps it.
    for (const [x, y] of [
      [600, 150],
      [200, 450],
      [700, 550],
    ])
      at(mine, x, y).forEach((part, index) =>
        expect(Math.abs(part - at(photo, x, y)[index])).toBeLessThan(30)
      )
    // Undone and done again, the file is made the same way.
    stepBack(session)
    stepForward(session)
    expect((await read(session)).bytes.length).toBe(bytes.length)
    stopEditing(session)
  })
})

describe("what a page holds and does not show", () => {
  it("is taken out under a mark all the same: a layer that is off, unseen words, a form, clipped words", async () => {
    const before = await makeUnseenPdf()
    for (const words of Object.values(UNSEEN))
      expect(await holds(before, words)).toBe(true)
    const session = startEditing(mupdf, before)
    change(
      session,
      "Mark 4 places",
      ...UNSEEN_PLACES.map((box, at): RedactOp => ({
        do: "mark",
        page: 0,
        id: `m${at}`,
        quads: [quadOf(box)],
      }))
    )
    change(session, "Apply the marks", { do: "apply" })
    const { bytes, got } = await read(session)
    for (const words of [
      UNSEEN.layer,
      UNSEEN.ghost,
      UNSEEN.form,
      UNSEEN.clipped,
    ])
      expect(await holds(bytes, words)).toBe(false)
    expect(got.pages[0].text).toContain(UNSEEN.seen)
    stopEditing(session)
  })
})

describe("shapes of one's own", () => {
  it("are found on every page and taken out like words", async () => {
    const session = startEditing(mupdf, await makeRedactPdf())
    const { found } = redactFind(session, { shape: "#### #### #### ####" })
    expect(found.map((place) => place.text)).toEqual(["4111 1111 1111 1111"])
    expect(redactFind(session, { shape: "ada?example.*" }).found).toHaveLength(
      2
    )
    change(session, "Mark a place", {
      do: "mark",
      page: found[0].page,
      id: "s",
      quads: [found[0].quad],
    })
    change(session, "Apply the marks", { do: "apply" })
    const { got, bytes } = await read(session)
    expect(got.pages[0].text).toContain("Card")
    expect(got.pages[0].text).toContain("of Ada")
    expect(await holds(bytes, "4111 1111")).toBe(false)
    stopEditing(session)
  })
})

describe("what a download leaves out on request", () => {
  it("leaves out the details, attached files and scripts, and says so", async () => {
    const bytes = await makeFormPdf()
    const loaded = await PDFDocument.load(bytes)
    loaded.setTitle("Private title")
    loaded.setAuthor("Ada Lovelace")
    await loaded.attach(new TextEncoder().encode("inside"), "notes.txt", {
      mimeType: "text/plain",
    })
    const file = await loaded.save()
    expect(await holds(file, "AFDate_FormatEx")).toBe(true)
    const session = startEditing(mupdf, file)
    const kept = await exportEdited(mupdf, session)
    expect(kept.report.cleaned).toBeUndefined()
    const whole = await readPdf(kept.bytes)
    expect(whole.info.Title).toBe("Private title")
    expect(whole.attachments).toEqual(["notes.txt"])
    expect(await holds(kept.bytes, "AFDate_FormatEx")).toBe(true)
    // Nothing asked for is nothing left out.
    expect(
      (
        await exportEdited(mupdf, session, {
          clean: { details: false, attachments: false, scripts: false },
        })
      ).report.cleaned
    ).toBeUndefined()

    const { bytes: out, report } = await exportEdited(mupdf, session, {
      clean: { details: true, attachments: true, scripts: true },
    })
    expect(report.cleaned).toEqual({
      details: true,
      attachments: 1,
      scripts: true,
    })
    expect(await danglingRefs(out)).toEqual([])
    const got = await readPdf(out)
    expect(got.info.Title).toBeUndefined()
    expect(got.info.Author).toBeUndefined()
    expect(got.attachments).toEqual([])
    expect(await holds(out, "Ada Lovelace")).toBe(false)
    expect(await holds(out, "AFDate_FormatEx")).toBe(false)
    // The form is still a form, with what it held.
    const fields = (await PDFDocument.load(out)).getForm().getFields()
    expect(fields.length).toBeGreaterThan(3)

    const some = await exportEdited(mupdf, session, {
      clean: { details: true, attachments: false, scripts: false },
    })
    expect(some.report.cleaned).toEqual({
      details: true,
      attachments: null,
      scripts: false,
    })
    expect((await readPdf(some.bytes)).attachments).toEqual(["notes.txt"])
    stopEditing(session)
  })
})

describe("what was taken out, elsewhere", () => {
  it("is kept with a draft, with what applying did", async () => {
    const bytes = await makeRedactPdf()
    const session = startEditing(mupdf, bytes)
    change(session, "Mark a place", mark("a", "secret"))
    change(session, "Apply the marks", { do: "apply" })
    const kept = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "card.pdf",
          size: 1000,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect(kept.steps.map((step) => step.done.kind)).toEqual([
      "redact",
      "redact",
    ])
    expect((kept.steps[1].done.change as RedactChange).done).toEqual(
      done(session)
    )
    const taken = startEditing(mupdf, bytes)
    takeUp(taken, kept.steps, kept.position)
    const { got, report } = await read(taken)
    expect(got.pages[0].text).not.toContain("4111")
    expect(report.redaction).toMatchObject({ places: 1, pages: 1, waiting: 0 })
    stopEditing(session)
    stopEditing(taken)
  })

  it("is never written after a signed file, where it would still be", async () => {
    const session = startEditing(
      mupdf,
      await makePdf("sg", { pages: 1, signed: true })
    )
    change(session, "Mark a place", {
      do: "mark",
      page: 0,
      id: "a",
      quads: [quadOf({ x: 30, y: 90, width: 200, height: 40 })],
    })
    // A mark alone can be written after the file: nothing was taken out.
    expect((await exportAfter(mupdf, session)).report.redaction.waiting).toBe(1)
    change(session, "Apply the marks", { do: "apply" })
    await expect(exportAfter(mupdf, session)).rejects.toThrow(
      "What you took out for good would still be in the signed part of the file."
    )
    stopEditing(session)
  })
})
