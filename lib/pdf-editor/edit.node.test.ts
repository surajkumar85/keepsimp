// @vitest-environment node
/**
 * Editing with the real engine. Files are written by pdf-lib; results are
 * read back by pdf.js and pdf-lib, so the engine is never only checked
 * against itself.
 */
import { readFileSync } from "node:fs"
import { PDFDocument, PDFName } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage, PasswordNeeded } from "@/lib/pdf-merger/mupdf-engine"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { makePdf, pageText } from "@/tests/pdf-fixtures"
import {
  jpegOf,
  pngOf,
  readPictures,
  samePixels,
  scene,
} from "@/tests/pdf-pictures"
import { embeddedFonts, readPdf, textPlaces, texts } from "@/tests/pdf-reader"
import { fontUrls } from "./fonts"
import {
  addFont,
  addPicture,
  applyChange,
  DATA_KEY,
  exportEdited,
  FontMissing,
  historyOf,
  lettersLacking,
  objectsOn,
  pageSizes,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  textWidth,
  type EditSession,
} from "./mupdf-edit"
import {
  BLACK,
  fontKey,
  LINE_HEIGHT,
  textHeight,
  type EditorObject,
  type InkObject,
  type LineObject,
  type PictureObject,
  type ShapeObject,
  type TextObject,
} from "./objects"
import { breakLines } from "./text-layout"

installNodeCodecShims()

const RED = [0.9, 0.1, 0.1] as const
const BLUE = [0.1, 0.2, 0.9] as const

/** A session with every font loaded, as the page gives them to the worker. */
function editing(bytes: Uint8Array, password?: string) {
  const session = startEditing(mupdf, bytes, password)
  for (const [key, url] of Object.entries(fontUrls))
    addFont(mupdf, session, key, new Uint8Array(readFileSync(`public${url}`)))
  return session
}

const add = (session: EditSession, page: number, ...objects: EditorObject[]) =>
  applyChange(mupdf, session, {
    label: "Add",
    ops: objects.map((object) => ({ do: "add" as const, page, object })),
  })

function textBox(
  session: EditSession,
  id: string,
  words: string,
  at: { x: number; y: number },
  change: Partial<TextObject> = {}
): TextObject {
  const style = {
    font: "sans" as const,
    bold: false,
    italic: false,
    size: 12,
    ...change,
  }
  const width = change.box?.width ?? 200
  const lines = breakLines(words, width, (text) =>
    textWidth(session, fontKey(style), style.size, text)
  )
  return {
    id,
    kind: "text",
    rotation: 0,
    opacity: 1,
    text: words,
    lines,
    colour: BLACK,
    align: "left",
    ...style,
    ...change,
    box: { ...at, width, height: textHeight(lines.length, style.size) },
  }
}

const box = (
  id: string,
  x: number,
  y: number,
  change: Partial<ShapeObject> = {}
): ShapeObject => ({
  id,
  kind: "box",
  rotation: 0,
  opacity: 1,
  box: { x, y, width: 60, height: 20 },
  stroke: null,
  fill: RED,
  weight: 2,
  ...change,
})

/** The colour of one pixel of a page drawn at one pixel a point. */
function pixelAt(doc: mupdf.PDFDocument, page: number, x: number, y: number) {
  const pages = doc.countPages()
  expect(page).toBeLessThan(pages)
  const loaded = doc.loadPage(page)
  const [, , right, bottom] = loaded.getBounds()
  loaded.destroy()
  const picture = drawPage(mupdf, doc, page, Math.max(right, bottom))
  const at = (Math.round(y) * picture.width + Math.round(x)) * 4
  return [picture.data[at], picture.data[at + 1], picture.data[at + 2]]
}

const isRed = ([r, g, b]: number[]) => r > 200 && g < 80 && b < 80
const isBlue = ([r, g, b]: number[]) => b > 200 && r < 80 && g < 110
const isWhite = ([r, g, b]: number[]) => r > 245 && g > 245 && b > 245

const open = (bytes: Uint8Array) => new mupdf.PDFDocument(bytes)

describe("opening", () => {
  it("opens a file with its pages as they are shown, also when the file turns them or leaves their size to the tree", async () => {
    const input = await makePdf("open", {
      pages: 3,
      size: (page) => (page === 2 ? [300, 500] : [200, 400]),
      rotate: { 2: 90, 3: 180 },
      inherit: false,
    })
    const session = editing(input)
    expect(pageSizes(session)).toEqual([
      { width: 200, height: 400 },
      { width: 500, height: 300 },
      { width: 200, height: 400 },
    ])
    expect(historyOf(session)).toEqual({ steps: [], position: 0, saved: null })
    expect(objectsOn(session, 0)).toEqual([])
    stopEditing(session)
    const inherited = editing(
      await makePdf("tree", { pages: 2, inherit: true })
    )
    expect(pageSizes(inherited)).toHaveLength(2)
    expect(pageSizes(inherited)[0].width).toBeGreaterThan(100)
    stopEditing(inherited)
  })

  it("asks for the password of a locked file, and opens with it", async () => {
    const input = await makePdf("lock", { password: { user: "open sesame" } })
    expect(() => startEditing(mupdf, input)).toThrow(PasswordNeeded)
    expect(() => startEditing(mupdf, input, "wrong")).toThrow(PasswordNeeded)
    const session = editing(input, "open sesame")
    add(session, 0, textBox(session, "t", "Signed off", { x: 20, y: 60 }))
    const { bytes } = await exportEdited(mupdf, session)
    // It stays locked with the password it had.
    await expect(readPdf(bytes)).rejects.toThrow()
    expect((await texts(bytes, "open sesame"))[0]).toContain("Signed off")
    stopEditing(session)
  })
})

describe("adding text", () => {
  it("writes words that other software reads, where they were put, in an embedded font cut to its letters", async () => {
    const input = await makePdf("words", { pages: 2, size: () => [400, 500] })
    const session = editing(input)
    const words = "Approved on 12 October: žluťoučký kůň, naïve café"
    const object = textBox(
      session,
      "t1",
      words,
      { x: 60, y: 200 },
      { size: 14 }
    )
    expect(add(session, 1, object)).toEqual([1])
    expect(objectsOn(session, 1)).toEqual([object])
    expect(lettersLacking(session, object)).toEqual([])
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report).toMatchObject({
      added: 1,
      text: { boxes: 1, found: 1 },
      untouched: { checked: 1, differ: [] },
      fontsCut: true,
      locked: false,
    })
    const read = await readPdf(bytes)
    // The page still has its own words, and now ours.
    expect(read.pages[1].text).toContain(pageText("words", 2))
    expect(read.pages[1].text.replace(/\s+/g, " ")).toContain(words)
    expect(read.pages[0].text).toBe((await readPdf(input)).pages[0].text)
    // It is part of the page: no annotation was left behind.
    expect(read.pages[1].kinds).toEqual([])
    // Where pdf.js finds the first line: at the left of the box, on its first baseline.
    const [first] = (await textPlaces(bytes))[1].filter((run) =>
      run.text.startsWith("Approved")
    )
    expect(first.x).toBeCloseTo(60, 0)
    expect(first.y).toBeGreaterThan(200 + 14 * 0.7)
    expect(first.y).toBeLessThan(200 + 14 * 1.1)
    expect(first.size).toBeCloseTo(14, 1)
    expect(first.angle).toBeCloseTo(0, 1)
    // The font is ours, embedded, and a small part of its 400 KB file.
    const ours = (await embeddedFonts(bytes)).filter((font) =>
      /Liberation/.test(font.name)
    )
    expect(ours).toHaveLength(1)
    expect(ours[0].name).toMatch(/^\/[A-Z]{6}\+LiberationSans/)
    expect(ours[0].bytes).toBeGreaterThan(1000)
    expect(ours[0].bytes).toBeLessThan(40_000)
    stopEditing(session)
  })

  it("breaks, aligns, styles and turns text", async () => {
    const input = await makePdf("style", { size: () => [400, 500] })
    const session = editing(input)
    const long = textBox(
      session,
      "wrap",
      "one two three four five six seven eight",
      { x: 50, y: 100 },
      {
        box: { x: 50, y: 100, width: 90, height: 0 },
        align: "right",
        font: "serif",
        bold: true,
      }
    )
    expect(long.lines.length).toBeGreaterThan(2)
    const turned = textBox(
      session,
      "turned",
      "Sideways",
      { x: 200, y: 300 },
      {
        rotation: 90,
        font: "mono",
        italic: true,
        colour: BLUE,
      }
    )
    add(session, 0, long, turned)
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.text).toEqual({ boxes: 2, found: 2 })
    const runs = (await textPlaces(bytes))[0]
    // Every line of the right-aligned box ends at its right edge, 140.
    const wrapped = runs.filter((run) => long.lines.includes(run.text.trim()))
    expect(wrapped).toHaveLength(long.lines.length)
    for (const run of wrapped) {
      const width = textWidth(session, "serif-bold", 12, run.text.trim())
      expect(run.x + width).toBeCloseTo(140, 0)
    }
    // Lines are a line height apart.
    expect(wrapped[1].y - wrapped[0].y).toBeCloseTo(12 * LINE_HEIGHT, 1)
    // The turned box runs downwards.
    const sideways = runs.find((run) => run.text === "Sideways")!
    expect(sideways.angle).toBeCloseTo(90, 0)
    // Three font files were used, each embedded and cut.
    const names = (await embeddedFonts(bytes))
      .map((font) => font.name)
      .join(" ")
    expect(names).toContain("LiberationSerif-Bold")
    expect(names).toContain("LiberationMono-Italic")
    stopEditing(session)
  })

  it("says which letters a font has no shape for", async () => {
    const session = editing(await makePdf("lack"))
    const object = textBox(session, "t", "Tea 茶 and 中文 茶", { x: 10, y: 10 })
    expect(lettersLacking(session, object)).toEqual(["茶", "中", "文"])
    stopEditing(session)
  })

  it("refuses a font it was not given, and leaves the file as it was", async () => {
    const session = startEditing(mupdf, await makePdf("nofont"))
    const object: TextObject = {
      id: "t",
      kind: "text",
      rotation: 0,
      opacity: 1,
      box: { x: 10, y: 10, width: 100, height: 14.4 },
      text: "Hi",
      lines: ["Hi"],
      font: "sans",
      bold: false,
      italic: false,
      size: 12,
      colour: BLACK,
      align: "left",
    }
    expect(() => add(session, 0, object)).toThrow(FontMissing)
    expect(() => textWidth(session, "sans", 12, "Hi")).toThrow(FontMissing)
    expect(() => lettersLacking(session, object)).toThrow(
      'The font "sans" has not been loaded.'
    )
    expect(historyOf(session).steps).toEqual([])
    expect(objectsOn(session, 0)).toEqual([])
    stopEditing(session)
  })
})

describe("where things land", () => {
  it("puts a thing where it was placed on pages the file shows turned every way", async () => {
    const input = await makePdf("turns", {
      pages: 4,
      size: () => [300, 500],
      rotate: { 2: 90, 3: 180, 4: 270 },
    })
    const session = editing(input)
    for (let page = 0; page < 4; page++)
      add(
        session,
        page,
        // Red on the left third, blue on the rest, at the same place on the shown page.
        box("red", 40, 30, { box: { x: 40, y: 30, width: 20, height: 20 } }),
        box("blue", 60, 30, {
          box: { x: 60, y: 30, width: 40, height: 20 },
          fill: BLUE,
        }),
        textBox(session, "label", `Upright ${page}`, { x: 40, y: 80 })
      )
    const look = (doc: mupdf.PDFDocument) => {
      for (let page = 0; page < 4; page++) {
        expect(
          isRed(pixelAt(doc, page, 50, 40)),
          `red on page ${page + 1}`
        ).toBe(true)
        expect(
          isBlue(pixelAt(doc, page, 80, 40)),
          `blue on page ${page + 1}`
        ).toBe(true)
        expect(isBlue(pixelAt(doc, page, 95, 48))).toBe(true)
        expect(isRed(pixelAt(doc, page, 110, 40))).toBe(false)
        expect(isBlue(pixelAt(doc, page, 110, 40))).toBe(false)
        expect(isRed(pixelAt(doc, page, 50, 60))).toBe(false)
      }
    }
    // While it is edited, and once it is part of the page.
    look(session.doc)
    const { bytes } = await exportEdited(mupdf, session)
    const result = open(bytes)
    look(result)
    result.destroy()
    // pdf.js reads each label upright, at its place on the page as shown.
    const places = await textPlaces(bytes)
    for (let page = 0; page < 4; page++) {
      const label = places[page].find((run) => run.text === `Upright ${page}`)!
      expect(label.x, `page ${page + 1}`).toBeCloseTo(40, 0)
      expect(label.y).toBeGreaterThan(80)
      expect(label.y).toBeLessThan(95)
      expect(label.angle).toBeCloseTo(0, 0)
    }
    stopEditing(session)
  })

  it("draws every kind of thing, turned and see-through too", async () => {
    const input = await makePdf("kinds", { size: () => [400, 600] })
    const session = editing(input)
    const line: LineObject = {
      id: "line",
      kind: "line",
      rotation: 0,
      opacity: 1,
      box: { x: 50, y: 400, width: 100, height: 0 },
      from: { x: 50, y: 400 },
      to: { x: 150, y: 400 },
      stroke: BLUE,
      weight: 6,
    }
    const arrow: LineObject = {
      ...line,
      id: "arrow",
      kind: "arrow",
      from: { x: 50, y: 450 },
      to: { x: 150, y: 450 },
      box: { x: 50, y: 450, width: 100, height: 0 },
      stroke: RED,
    }
    const ink: InkObject = {
      id: "ink",
      kind: "ink",
      rotation: 0,
      opacity: 1,
      box: { x: 200, y: 400, width: 60, height: 40 },
      strokes: [
        [
          { x: 200, y: 400 },
          { x: 230, y: 440 },
          { x: 260, y: 400 },
        ],
        [{ x: 300, y: 420 }],
      ],
      stroke: RED,
      weight: 8,
    }
    add(
      session,
      0,
      // A box turned a quarter: 60 by 20 becomes 20 by 60 about (130, 130).
      box("turned", 100, 120, { rotation: 90 }),
      box("ring", 250, 100, {
        kind: "ellipse",
        box: { x: 250, y: 100, width: 80, height: 80 },
        fill: null,
        stroke: BLUE,
        weight: 6,
      }),
      {
        id: "cover",
        kind: "cover",
        rotation: 0,
        opacity: 1,
        box: { x: 20, y: 20, width: 100, height: 30 },
        fill: [1, 1, 1],
      },
      box("faint", 300, 300, { opacity: 0.3 }),
      line,
      arrow,
      ink
    )
    const check = (doc: mupdf.PDFDocument) => {
      // The turned box is tall now: red above and below its middle, white beside it.
      expect(isRed(pixelAt(doc, 0, 130, 105)), "check 1").toBe(true)
      expect(isRed(pixelAt(doc, 0, 130, 155)), "check 2").toBe(true)
      expect(isRed(pixelAt(doc, 0, 105, 130)), "check 3").toBe(false)
      // A ring: blue on its edge, nothing in its middle.
      expect(isBlue(pixelAt(doc, 0, 250, 140)), "check 4").toBe(true)
      expect(isBlue(pixelAt(doc, 0, 290, 100)), "check 5").toBe(true)
      expect(isBlue(pixelAt(doc, 0, 290, 140)), "check 6").toBe(false)
      // The cover hides the page's own words under it.
      expect(isWhite(pixelAt(doc, 0, 60, 35)), "check 7").toBe(true)
      // See-through red over white is pink.
      const [r, g, b] = pixelAt(doc, 0, 330, 310)
      expect(r).toBeGreaterThan(240)
      expect(g).toBeGreaterThan(150)
      expect(g).toBeLessThan(220)
      expect(b).toBeGreaterThan(150)
      // The line, the arrow with its head, and the drawing with its dot.
      expect(isBlue(pixelAt(doc, 0, 100, 400)), "check 8").toBe(true)
      expect(isRed(pixelAt(doc, 0, 100, 450)), "check 9").toBe(true)
      expect(isRed(pixelAt(doc, 0, 130, 455)), "check 10").toBe(true)
      expect(isRed(pixelAt(doc, 0, 100, 458)), "check 11").toBe(false)
      expect(isRed(pixelAt(doc, 0, 230, 438)), "check 12").toBe(true)
      expect(isRed(pixelAt(doc, 0, 300, 420)), "check 13").toBe(true)
    }
    check(session.doc)
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.added).toBe(7)
    const result = open(bytes)
    check(result)
    result.destroy()
    // The words the cover hides are still in the file: it covers, it does not remove.
    expect((await texts(bytes))[0]).toContain(pageText("kinds", 1))
    stopEditing(session)
  })
})

describe("pictures", () => {
  it("places a PNG with see-through parts and a JPEG, with the pixels they came with", async () => {
    const input = await makePdf("pics", { size: () => [400, 600] })
    const session = editing(input)
    const clear = scene(80, 60)
    for (let at = 3; at < clear.data.length; at += 4)
      clear.data[at] = (at / 4) % 80 < 40 ? 255 : 0
    const png = await pngOf(clear)
    const jpeg = await jpegOf(scene(120, 80, 3))
    expect(addPicture(mupdf, session, "a", png)).toEqual({
      width: 80,
      height: 60,
    })
    expect(addPicture(mupdf, session, "b", jpeg)).toEqual({
      width: 120,
      height: 80,
    })
    // Given twice, it is the picture it already has.
    expect(addPicture(mupdf, session, "a", jpeg)).toEqual({
      width: 80,
      height: 60,
    })
    const picture = (
      id: string,
      name: string,
      x: number,
      width: number,
      height: number
    ): PictureObject => ({
      id,
      kind: "picture",
      rotation: 0,
      opacity: 1,
      box: { x, y: 300, width, height },
      picture: name,
    })
    add(
      session,
      0,
      picture("p1", "a", 40, 160, 120),
      picture("p2", "b", 220, 120, 80)
    )
    // A picture the session was never given draws nothing and breaks nothing.
    add(session, 0, picture("ghost", "missing", 10, 10, 10))
    // The see-through half of the first shows the white page.
    expect(isWhite(pixelAt(session.doc, 0, 160, 360))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 80, 360))).toBe(false)
    const { bytes } = await exportEdited(mupdf, session)
    const stored = await readPictures(bytes)
    expect(stored).toHaveLength(2)
    expect(stored.map((one) => [one.width, one.height])).toEqual([
      [80, 60],
      [120, 80],
    ])
    // The PNG's pixels are the very ones it came with: how see-through each
    // is, and the colour of every one that can be seen.
    const [read] = stored
    for (let at = 0; at < clear.data.length; at += 4) {
      expect(read.data[at + 3]).toBe(clear.data[at + 3])
      if (clear.data[at + 3] === 255)
        expect([read.data[at], read.data[at + 1], read.data[at + 2]]).toEqual([
          clear.data[at],
          clear.data[at + 1],
          clear.data[at + 2],
        ])
    }
    stopEditing(session)
  })

  it("still cuts the font of text that shares a page with a picture", async () => {
    const input = await makePdf("both", { size: () => [400, 600] })
    const session = editing(input)
    const clear = scene(10, 10)
    for (let at = 3; at < clear.data.length; at += 4) clear.data[at] = 128
    addPicture(mupdf, session, "a", await pngOf(clear))
    add(
      session,
      0,
      textBox(session, "t", "Beside a picture", { x: 40, y: 80 }),
      {
        id: "p",
        kind: "picture",
        rotation: 0,
        opacity: 1,
        box: { x: 40, y: 200, width: 33, height: 33 },
        picture: "a",
      }
    )
    const { bytes, report } = await exportEdited(mupdf, session)
    // A picture just placed draws a hair differently from its written self,
    // which must not be taken for a fault of the cut font.
    expect(report.fontsCut).toBe(true)
    expect(report.text).toEqual({ boxes: 1, found: 1 })
    expect(bytes.length).toBeLessThan(60_000)
    stopEditing(session)
  })
})

describe("what the file had stays", () => {
  it("keeps links, bookmarks, fields, notes, tags, page numbers and attachments, and the pages it did not touch", async () => {
    const input = await makePdf("keep", {
      pages: 4,
      links: [
        { from: 1, to: 3 },
        { from: 2, to: 4, how: "name" },
      ],
      bookmarks: [
        { title: "Start", page: 1, children: [{ title: "End", page: 4 }] },
      ],
      fields: [{ name: "who", value: "Ada", page: 2 }],
      notes: [{ page: 3, text: "Check this" }],
      tagged: true,
      romanPages: 2,
      attachments: { "data.txt": "attached" },
      title: "Kept",
      picture: true,
    })
    const session = editing(input)
    add(
      session,
      2,
      box("b", 30, 30),
      textBox(session, "t", "Seen and agreed", { x: 30, y: 80 })
    )
    const { bytes, report } = await exportEdited(mupdf, session)
    // A file with fields keeps its fonts whole: a field someone types into needs every letter.
    expect(report.fontsCut).toBe(false)
    expect(report.untouched).toEqual({ checked: 3, differ: [] })
    const before = await readPdf(input)
    const after = await readPdf(bytes)
    expect(after.bookmarks).toEqual(before.bookmarks)
    expect(after.fields).toEqual(before.fields)
    expect(after.labels).toEqual(before.labels)
    expect(after.attachments).toEqual(before.attachments)
    expect(after.info.Title).toBe("Kept")
    for (const page of [0, 1, 3])
      expect(after.pages[page]).toEqual(before.pages[page])
    // The page that was added to keeps its note and its link; only its words grew.
    expect(after.pages[2].notes).toEqual(before.pages[2].notes)
    expect(after.pages[2].links).toEqual(before.pages[2].links)
    expect(after.pages[2].kinds).toEqual(before.pages[2].kinds)
    expect(after.pages[2].text).toContain("Seen and agreed")
    const doc = await PDFDocument.load(bytes)
    expect(String(doc.catalog.get(PDFName.of("MarkInfo")))).toContain("true")
    stopEditing(session)
  })

  it("leaves what was added movable when asked, and reads it back from the file", async () => {
    const input = await makePdf("later", {
      pages: 2,
      notes: [{ page: 1, text: "A note of the file's own" }],
    })
    const session = editing(input)
    const words = textBox(session, "t", "Still movable", { x: 20, y: 60 })
    const shape = box("b", 20, 100, { rotation: 30 })
    add(session, 0, words, shape)
    const { bytes, report } = await exportEdited(mupdf, session, {
      keepEditable: true,
    })
    expect(report.added).toBe(2)
    const read = await readPdf(bytes)
    // The file's own note, and our two things as stamps.
    expect(read.pages[0].kinds.sort()).toEqual(["Stamp", "Stamp", "Text"])
    const doc = await PDFDocument.load(bytes)
    const carried = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object as unknown as { get?(key: unknown): unknown })
      .filter(
        (object) =>
          typeof object.get === "function" && object.get(PDFName.of(DATA_KEY))
      )
    expect(carried).toHaveLength(2)
    // Opened again, they are the things they were.
    const again = editing(bytes)
    expect(objectsOn(again, 0)).toEqual([words, shape])
    expect(objectsOn(again, 1)).toEqual([])
    stopEditing(again)
    stopEditing(session)
  })

  it("does not take a note for one of ours because it carries something under our key", async () => {
    const source = await PDFDocument.load(
      await makePdf("fake", { notes: [{ page: 1, text: "note" }] })
    )
    const [first] = source.getPages()
    const annots = first.node.Annots()!
    for (const [at, value] of [
      [0, "not json"],
      [1, '{"kind":"star"}'],
    ] as const) {
      if (at === 1)
        annots.push(
          source.context.register(
            source.context.obj({
              Type: "Annot",
              Subtype: "Square",
              Rect: [5, 5, 20, 20],
            })
          )
        )
      const annot = source.context.lookup(annots.get(at)) as unknown as {
        set(key: unknown, value: unknown): void
      }
      annot.set(PDFName.of(DATA_KEY), source.context.obj(value))
    }
    const session = editing(await source.save({ useObjectStreams: false }))
    expect(objectsOn(session, 0)).toEqual([])
    stopEditing(session)
  })
})

describe("what is asked of it", () => {
  it("checks every thing it is given, and refuses what is not one", async () => {
    const session = editing(await makePdf("checked"))
    expect(() =>
      add(session, 0, {
        ...box("b", 10, 10),
        kind: "star",
      } as unknown as EditorObject)
    ).toThrow("That is not something that can be added.")
    expect(historyOf(session).steps).toEqual([])
    // A drawing's box is worked out from its points, whatever was claimed.
    add(session, 0, {
      id: "ink",
      kind: "ink",
      rotation: 0,
      opacity: 1,
      box: { x: 0, y: 0, width: 1, height: 1 },
      strokes: [
        [
          { x: 50, y: 60 },
          { x: 90, y: 80 },
        ],
      ],
      stroke: RED,
      weight: 2,
    })
    expect(objectsOn(session, 0)[0].box).toEqual({
      x: 50,
      y: 60,
      width: 40,
      height: 20,
    })
    stopEditing(session)
  })
})

describe("changing, ordering and undoing", () => {
  it("changes, removes and reorders things, each as a step that can be undone", async () => {
    const input = await makePdf("steps", { size: () => [300, 300] })
    const session = editing(input)
    const red = box("red", 100, 100, {
      box: { x: 100, y: 100, width: 60, height: 60 },
    })
    const blue = box("blue", 130, 130, {
      box: { x: 130, y: 130, width: 60, height: 60 },
      fill: BLUE,
    })
    add(session, 0, red, blue)
    // Blue was added last, so it is on top where they overlap.
    expect(isBlue(pixelAt(session.doc, 0, 145, 145))).toBe(true)
    const order = (id: string, to: "front" | "back" | "forward" | "backward") =>
      applyChange(mupdf, session, {
        label: "Order",
        ops: [{ do: "order", page: 0, id, to }],
      })
    order("red", "front")
    expect(isRed(pixelAt(session.doc, 0, 145, 145))).toBe(true)
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual([
      "blue",
      "red",
    ])
    order("red", "back")
    expect(isBlue(pixelAt(session.doc, 0, 145, 145))).toBe(true)
    order("red", "forward")
    expect(isRed(pixelAt(session.doc, 0, 145, 145))).toBe(true)
    order("red", "backward")
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual([
      "red",
      "blue",
    ])
    // Already at the back, or not there at all: nothing moves.
    order("red", "back")
    order("nobody", "front")
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual([
      "red",
      "blue",
    ])

    applyChange(mupdf, session, {
      label: "Move box",
      ops: [
        {
          do: "change",
          page: 0,
          object: { ...red, box: { ...red.box, x: 20, y: 20 } },
        },
      ],
    })
    expect(isRed(pixelAt(session.doc, 0, 40, 40))).toBe(true)
    expect(isRed(pixelAt(session.doc, 0, 110, 110))).toBe(false)
    applyChange(mupdf, session, {
      label: "Delete box",
      ops: [{ do: "remove", page: 0, id: "blue" }],
    })
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual(["red"])
    // Changing or removing what is not there does nothing.
    applyChange(mupdf, session, {
      label: "Nothing",
      ops: [
        { do: "change", page: 0, object: { ...blue, id: "gone" } },
        { do: "remove", page: 0, id: "gone" },
      ],
    })
    // A change that changed nothing is not a step: there is nothing to undo.
    expect(historyOf(session)).toMatchObject({ position: 7, saved: null })
    expect(historyOf(session).steps.slice(-3)).toEqual([
      "Order",
      "Move box",
      "Delete box",
    ])

    expect(stepBack(session)).toEqual([0])
    expect(stepBack(session)).toEqual([0])
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual([
      "red",
      "blue",
    ])
    // Doing the move again brings the red box back to where it was moved.
    expect(stepForward(session)).toEqual([0])
    expect(objectsOn(session, 0)[0].box).toMatchObject({ x: 20, y: 20 })
    expect(historyOf(session).position).toBe(6)
    while (stepBack(session));
    expect(stepBack(session)).toBeNull()
    expect(objectsOn(session, 0)).toEqual([])
    // Everything undone, the page is the one that was opened, pixel for pixel.
    const original = open(input)
    const was = drawPage(mupdf, original, 0, 600)
    const is = drawPage(mupdf, session.doc, 0, 600)
    expect(samePixels(is, was)).toBe(true)
    original.destroy()
    while (stepForward(session));
    expect(stepForward(session)).toBeNull()
    expect(objectsOn(session, 0).map((object) => object.id)).toEqual(["red"])
    stopEditing(session)
  })

  it("can go on being edited and undone after a download, and knows what was saved", async () => {
    const input = await makePdf("again", { size: () => [300, 300] })
    const session = editing(input)
    add(session, 0, box("one", 20, 20))
    const first = await exportEdited(mupdf, session)
    expect(historyOf(session)).toMatchObject({ position: 1, saved: 1 })
    add(session, 0, box("two", 20, 60, { fill: BLUE }))
    const second = await exportEdited(mupdf, session)
    expect(historyOf(session).saved).toBe(2)
    expect(second.bytes.length).toBeGreaterThan(first.bytes.length)
    // Undo still works on the working copy, all the way back.
    expect(stepBack(session)).toEqual([0])
    expect(stepBack(session)).toEqual([0])
    expect(objectsOn(session, 0)).toEqual([])
    const third = await exportEdited(mupdf, session)
    expect(third.report.added).toBe(0)
    expect(await texts(third.bytes)).toEqual(await texts(input))
    const result = open(first.bytes)
    expect(isRed(pixelAt(result, 0, 40, 30))).toBe(true)
    result.destroy()
    stopEditing(session)
  })

  it("says which pages a step changed, when it is taken back and when it is made again", async () => {
    const input = await makePdf("spread", {
      pages: 4,
      size: () => [300, 300],
    })
    const session = editing(input)
    // One change that touches two pages, and one that touches another.
    expect(
      applyChange(mupdf, session, {
        label: "Add two",
        ops: [
          { do: "add", page: 0, object: box("a", 20, 20) },
          { do: "add", page: 2, object: box("b", 20, 20) },
        ],
      }).sort()
    ).toEqual([0, 2])
    expect(add(session, 3, box("c", 20, 20))).toEqual([3])
    expect(stepBack(session)).toEqual([3])
    expect(stepBack(session)?.sort()).toEqual([0, 2])
    // At the start there is nothing more to take back.
    expect(stepBack(session)).toBeNull()
    expect([0, 1, 2, 3].map((page) => objectsOn(session, page).length)).toEqual(
      [0, 0, 0, 0]
    )
    expect(stepForward(session)?.sort()).toEqual([0, 2])
    expect(stepForward(session)).toEqual([3])
    expect(stepForward(session)).toBeNull()
    expect([0, 1, 2, 3].map((page) => objectsOn(session, page).length)).toEqual(
      [1, 0, 1, 1]
    )
    // A change made after an undo forgets what was undone, and its pages with it.
    stepBack(session)
    add(session, 1, box("d", 20, 20))
    expect(stepForward(session)).toBeNull()
    expect(stepBack(session)).toEqual([1])
    stopEditing(session)
  })

  it("locks the result with a new password when asked", async () => {
    const session = editing(await makePdf("newlock"))
    add(session, 0, box("b", 10, 10))
    const { bytes, report } = await exportEdited(mupdf, session, {
      lock: { password: "new one", ownerPassword: "owner", permissions: -4 },
    })
    expect(report.locked).toBe(true)
    await expect(readPdf(bytes)).rejects.toThrow()
    expect(await texts(bytes, "new one")).toHaveLength(1)
    stopEditing(session)
  })

  it("stops when it is told to", async () => {
    const session = editing(await makePdf("stop", { pages: 3 }))
    add(session, 0, textBox(session, "t", "Stop", { x: 10, y: 10 }))
    let calls = 0
    await expect(
      exportEdited(mupdf, session, {
        checkpoint: async () => {
          if (++calls === 2) throw new Error("Stopped.")
        },
      })
    ).rejects.toThrow("Stopped.")
    // Nothing was saved, and the working copy can still be exported.
    expect(historyOf(session).saved).toBeNull()
    expect((await exportEdited(mupdf, session)).report.added).toBe(1)
    stopEditing(session)
  })
})

describe("many edits of many kinds", () => {
  it("never loses a page or a word that was there", async () => {
    let state = 20261012
    const random = (below: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % below
    }
    const input = await makePdf("many", {
      pages: 5,
      size: (page) => (page % 2 ? [300, 420] : [420, 300]),
      rotate: { 2: 90, 4: 270 },
    })
    const sizes = [
      [300, 420],
      [300, 420],
      [300, 420],
      [300, 420],
      [300, 420],
    ]
    const session = editing(input)
    let made = 0
    for (let step = 0; step < 40; step++) {
      const page = random(5)
      const things = objectsOn(session, page)
      const roll = random(10)
      if (roll < 5 || !things.length) {
        // Far enough from the edges that a turn does not take it off the page.
        const x = 70 + random(sizes[page][0] - 240)
        const y = 70 + random(sizes[page][1] - 160)
        const id = `thing${made++}`
        add(
          session,
          page,
          random(2)
            ? textBox(
                session,
                id,
                `Note ${id}`,
                { x, y },
                { rotation: random(4) * 90 }
              )
            : box(id, x, y, {
                rotation: random(360),
                opacity: 0.2 + random(8) / 10,
              })
        )
      } else if (roll < 7) {
        const thing = things[random(things.length)]
        applyChange(mupdf, session, {
          label: "Move",
          ops: [
            {
              do: "change",
              page,
              object: {
                ...thing,
                box: { ...thing.box, x: thing.box.x + 5 },
              } as EditorObject,
            },
          ],
        })
      } else if (roll < 8)
        applyChange(mupdf, session, {
          label: "Delete",
          ops: [{ do: "remove", page, id: things[random(things.length)].id }],
        })
      else if (roll < 9) stepBack(session)
      else stepForward(session)
    }
    const { bytes, report } = await exportEdited(mupdf, session)
    const before = await texts(input)
    const after = await texts(bytes)
    expect(after).toHaveLength(5)
    for (let page = 0; page < 5; page++) {
      expect(after[page]).toContain(pageText("many", page + 1))
      // Every text box still on the page is read back. Boxes that overlap
      // are read mixed together, so it is their words that are looked for.
      for (const thing of objectsOn(session, page))
        if (thing.kind === "text")
          for (const word of thing.text.split(" "))
            expect(after[page]).toContain(word)
    }
    expect(report.text.found).toBe(report.text.boxes)
    expect(report.untouched.differ).toEqual([])
    expect(before).toHaveLength(5)
    stopEditing(session)
  }, 120_000)
})
