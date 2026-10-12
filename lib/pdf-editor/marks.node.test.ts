// @vitest-environment node
/**
 * Stamps, measuring lines and call-outs with the real engine. Results are
 * read back by pdf.js and pdf-lib, never by the engine alone.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { makePdf } from "@/tests/pdf-fixtures"
import { embeddedFonts, readPdf, textPlaces, texts } from "@/tests/pdf-reader"
import { fontUrls } from "./fonts"
import {
  addFont,
  applyChange,
  exportEdited,
  FontMissing,
  objectsOn,
  startEditing,
  stepBack,
  stopEditing,
  textWidth,
  type EditSession,
} from "./mupdf-edit"
import {
  fontKey,
  textHeight,
  type EditorObject,
  type MeasureObject,
  type StampObject,
  type TextObject,
} from "./objects"
import { breakLines } from "./text-layout"

const RED = [0.86, 0.15, 0.15] as const
const GREEN = [0.09, 0.56, 0.24] as const
const BLACK = [0, 0, 0] as const

function editing(bytes: Uint8Array) {
  const session = startEditing(mupdf, bytes)
  for (const [key, url] of Object.entries(fontUrls))
    addFont(mupdf, session, key, new Uint8Array(readFileSync(`public${url}`)))
  return session
}

const add = (session: EditSession, page: number, ...objects: EditorObject[]) =>
  applyChange(mupdf, session, {
    label: "Add",
    ops: objects.map((object) => ({ do: "add" as const, page, object })),
  })

function pixelAt(doc: mupdf.PDFDocument, page: number, x: number, y: number) {
  const loaded = doc.loadPage(page)
  const [, , right, bottom] = loaded.getBounds()
  loaded.destroy()
  const picture = drawPage(mupdf, doc, page, Math.max(right, bottom))
  const at = (Math.round(y) * picture.width + Math.round(x)) * 4
  return [picture.data[at], picture.data[at + 1], picture.data[at + 2]]
}
// A thin line lies across the edges of pixels, so its colour is mixed with the paper's.
const isRed = ([r, g, b]: number[]) => r > 180 && g < 130 && b < 130
const isGreen = ([r, g, b]: number[]) => g > 110 && r < 90 && b < 110
const isDark = ([r, g, b]: number[]) => r < 90 && g < 90 && b < 90
const isWhite = ([r, g, b]: number[]) => r > 245 && g > 245 && b > 245

const base = { rotation: 0, opacity: 1 }
const stamp: StampObject = {
  ...base,
  id: "stamp",
  kind: "stamp",
  box: { x: 100, y: 100, width: 150, height: 50 },
  label: "Approved",
  colour: GREEN,
}
const measure: MeasureObject = {
  ...base,
  id: "measure",
  kind: "measure",
  box: { x: 100, y: 300, width: 100, height: 0 },
  from: { x: 100, y: 300 },
  to: { x: 200, y: 300 },
  stroke: BLACK,
  weight: 2,
  unit: "mm",
  scale: 1,
}

function callout(session: EditSession, words: string): TextObject {
  const style = { font: "sans" as const, bold: false, italic: false, size: 12 }
  const lines = breakLines(words, 140, (text) =>
    textWidth(session, fontKey(style), 12, text)
  )
  return {
    ...base,
    ...style,
    id: "callout",
    kind: "text",
    text: words,
    lines,
    colour: RED,
    align: "left",
    box: { x: 220, y: 420, width: 140, height: textHeight(lines.length, 12) },
    tip: { x: 100, y: 520 },
  }
}

describe("stamps", () => {
  it("frames words in capitals that other software reads, where the stamp was put", async () => {
    const session = editing(await makePdf("st", { size: () => [400, 600] }))
    expect(add(session, 0, stamp)).toEqual([0])
    // The frame is on the page in the stamp's colour; its middle between the letters is paper.
    expect(isGreen(pixelAt(session.doc, 0, 100, 125))).toBe(true)
    expect(isGreen(pixelAt(session.doc, 0, 175, 100))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 175, 107))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 90, 125))).toBe(true)

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.added).toBe(1)
    expect(report.fontsCut).toBe(true)
    // A stamp's words are read back like any text that was added.
    expect(report.text).toEqual({ boxes: 1, found: 1 })
    expect((await texts(bytes))[0]).toContain("APPROVED")
    const [run] = (await textPlaces(bytes))[0].filter(
      (one) => one.text === "APPROVED"
    )
    // Inside the frame, and as large as the frame has room for.
    expect(run.x).toBeGreaterThan(105)
    expect(run.x).toBeLessThan(140)
    expect(run.y).toBeGreaterThan(125)
    expect(run.y).toBeLessThan(142)
    expect(run.size).toBeGreaterThan(18)
    expect(run.size).toBeLessThan(34)
    const fonts = await embeddedFonts(bytes)
    const bold = fonts.filter((font) =>
      font.name.includes("LiberationSans-Bold")
    )
    expect(bold).toHaveLength(1)
    expect(bold[0].bytes).toBeLessThan(40_000)
    stopEditing(session)
  })

  it("turns with its handle, and stands the right way on a page the file shows turned", async () => {
    const session = editing(
      await makePdf("turned", { size: () => [400, 600], rotate: { 1: 90 } })
    )
    // The page is shown 600 wide and 400 tall.
    add(session, 0, { ...stamp, rotation: 90 })
    // Turned a quarter, the stamp is 50 wide and 150 tall about the same middle.
    expect(isGreen(pixelAt(session.doc, 0, 175, 50))).toBe(true)
    expect(isGreen(pixelAt(session.doc, 0, 150, 125))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 110, 125))).toBe(true)
    const { bytes } = await exportEdited(mupdf, session)
    const [run] = (await textPlaces(bytes))[0].filter(
      (one) => one.text === "APPROVED"
    )
    // Its words run down the page as it is shown.
    expect(run.angle).toBeCloseTo(90, 0)
    stopEditing(session)
  })

  it("needs its font, and leaves the file as it was without it", async () => {
    const session = startEditing(mupdf, await makePdf("nofont"))
    expect(() => add(session, 0, stamp)).toThrow(FontMissing)
    expect(objectsOn(session, 0)).toEqual([])
    stopEditing(session)
  })
})

describe("measuring lines", () => {
  it("says how long it is, in its unit and by its scale", async () => {
    const session = editing(await makePdf("ms", { size: () => [400, 600] }))
    add(
      session,
      0,
      measure,
      // A drawing at one to fifty, measured in metres, standing upright.
      {
        ...measure,
        id: "scaled",
        from: { x: 320, y: 100 },
        to: { x: 320, y: 100 + (72 / 2.54) * 4 },
        box: { x: 320, y: 100, width: 0, height: (72 / 2.54) * 4 },
        unit: "m",
        scale: 50,
      },
      // So short that its label is longer than it is.
      {
        ...measure,
        id: "short",
        from: { x: 100, y: 500 },
        to: { x: 110, y: 500 },
        box: { x: 100, y: 500, width: 10, height: 0 },
      }
    )
    // The line, and the marks across its ends.
    expect(isDark(pixelAt(session.doc, 0, 150, 300))).toBe(true)
    expect(isDark(pixelAt(session.doc, 0, 100, 296))).toBe(true)
    expect(isDark(pixelAt(session.doc, 0, 200, 304))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 150, 310))).toBe(true)

    const { bytes, report } = await exportEdited(mupdf, session)
    // What each line says is read back from the result.
    expect(report.text).toEqual({ boxes: 3, found: 3 })
    const words = (await texts(bytes))[0]
    expect(words).toContain("35.3 mm")
    expect(words).toContain("2 m")
    expect(words).toContain("3.53 mm")
    const runs = (await textPlaces(bytes))[0]
    const label = runs.find((one) => one.text === "35.3 mm")!
    // Over the middle of the line, just above it.
    expect(label.x).toBeGreaterThan(125)
    expect(label.x).toBeLessThan(150)
    expect(label.y).toBeGreaterThan(290)
    expect(label.y).toBeLessThan(299)
    expect(label.angle).toBeCloseTo(0, 0)
    expect(label.size).toBeCloseTo(9, 1)
    // The upright one is read from below, turned with its line.
    const upright = runs.find((one) => one.text === "2 m")!
    expect(Math.abs(upright.angle - 270)).toBeLessThan(1)
    stopEditing(session)
  })
})

describe("call-outs", () => {
  it("frames its words and points at a place with an arrow", async () => {
    const session = editing(await makePdf("co", { size: () => [400, 600] }))
    const object = callout(session, "Check this figure")
    add(session, 0, object)
    // The frame stands off the words, in their colour, and is white inside.
    expect(isRed(pixelAt(session.doc, 0, 216, 427))).toBe(true)
    expect(isRed(pixelAt(session.doc, 0, 290, 416))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 350, 427))).toBe(true)
    // The line leaves the corner of the frame nearest the point, and ends in an arrow's head there.
    const from = { x: 216, y: 420 + object.box.height + 4 }
    const along = (share: number) => ({
      x: from.x + (100 - from.x) * share,
      y: from.y + (520 - from.y) * share,
    })
    const middle = along(0.5)
    expect(isRed(pixelAt(session.doc, 0, middle.x, middle.y))).toBe(true)
    const head = along(0.97)
    expect(isRed(pixelAt(session.doc, 0, head.x, head.y))).toBe(true)
    expect(isWhite(pixelAt(session.doc, 0, 60, 560))).toBe(true)

    // Pointed somewhere else: the old line is gone, the words have not moved.
    applyChange(mupdf, session, {
      label: "Point",
      ops: [
        {
          do: "change",
          page: 0,
          object: { ...object, tip: { x: 300, y: 300 } },
        },
      ],
    })
    expect(isWhite(pixelAt(session.doc, 0, middle.x, middle.y))).toBe(true)
    expect(isRed(pixelAt(session.doc, 0, 300, 360))).toBe(true)
    expect(stepBack(session)).toEqual([0])
    expect(isRed(pixelAt(session.doc, 0, middle.x, middle.y))).toBe(true)

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.text).toEqual({ boxes: 1, found: 1 })
    expect((await texts(bytes))[0]).toContain("Check this figure")
    stopEditing(session)
  })
})

describe("kept movable", () => {
  it("reads all three back from a file that kept them, to go on with", async () => {
    const session = editing(await makePdf("keep", { size: () => [400, 600] }))
    const pointing = callout(session, "Here")
    add(session, 0, stamp, measure, pointing)
    const { bytes } = await exportEdited(mupdf, session, {
      keepEditable: true,
    })
    expect((await readPdf(bytes)).pages[0].kinds).toEqual([
      "Stamp",
      "Stamp",
      "Stamp",
    ])
    const again = editing(bytes)
    expect(objectsOn(again, 0)).toEqual([stamp, measure, pointing])
    // Changed there, and made part of the page.
    applyChange(mupdf, again, {
      label: "Change",
      ops: [
        { do: "change", page: 0, object: { ...stamp, label: "Final" } },
        { do: "remove", page: 0, id: "measure" },
      ],
    })
    const flat = await exportEdited(mupdf, again)
    const words = (await texts(flat.bytes))[0]
    expect(words).toContain("FINAL")
    expect(words).not.toContain("APPROVED")
    expect(words).not.toContain("35.3 mm")
    expect(words).toContain("Here")
    expect((await readPdf(flat.bytes)).pages[0].kinds).toEqual([])
    stopEditing(session)
    stopEditing(again)
  })
})
