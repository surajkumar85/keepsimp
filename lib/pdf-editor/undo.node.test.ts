// @vitest-environment node
/**
 * What is added after an undo. The engine remembers the fonts and pictures
 * it has put into a file, and an undo that takes one out again does not
 * make it forget: used once more, it would be pointed at where it no
 * longer is. Results are read by pdf-lib and pdf.js: no reference in one
 * may point at nothing, and the words and pictures must be there.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { makeFormPdf, makePdf } from "@/tests/pdf-fixtures"
import { jpegOf, pngOf, readPictures, scene } from "@/tests/pdf-pictures"
import { danglingRefs, embeddedFonts, readPdf } from "@/tests/pdf-reader"
import { fontUrls } from "./fonts"
import {
  addFont,
  addPicture,
  applyChange,
  exportEdited,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  type EditSession,
} from "./mupdf-edit"
import { applyFields, fieldsOn } from "./mupdf-forms"
import { BLACK, type PictureObject, type TextObject } from "./objects"

installNodeCodecShims()

function editing(bytes: Uint8Array) {
  const session = startEditing(mupdf, bytes)
  for (const key of ["sans", "serif-bold"])
    addFont(
      mupdf,
      session,
      key,
      new Uint8Array(readFileSync(`public${fontUrls[key]}`))
    )
  return session
}

const words = (id: string, text: string, y = 100): TextObject => ({
  id,
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 30, y, width: 200, height: 20 },
  text,
  lines: [text],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
})
const picture = (id: string, name: string, y = 150): PictureObject => ({
  id,
  kind: "picture",
  picture: name,
  rotation: 0,
  opacity: 1,
  box: { x: 30, y, width: 80, height: 60 },
})
const add = (session: EditSession, object: TextObject | PictureObject) =>
  applyChange(mupdf, session, {
    label: "Add",
    ops: [{ do: "add", page: 0, object }],
  })

/** Both ways of downloading: made part of the page, and kept movable. */
async function results(session: EditSession) {
  return [
    (await exportEdited(mupdf, session)).bytes,
    (await exportEdited(mupdf, session, { keepEditable: true })).bytes,
  ]
}

describe("adding after an undo", () => {
  it("writes text in its font again when the first text was undone", async () => {
    const session = editing(await makePdf("u", { pages: 1 }))
    add(session, words("a", "First words"))
    stepBack(session)
    add(session, words("b", "Second words"))
    // Undone and made again, and undone for good with something new after it.
    stepBack(session)
    stepForward(session)
    add(session, {
      ...words("c", "Third words", 130),
      font: "serif",
      bold: true,
    })
    stepBack(session)
    stepBack(session)
    add(session, words("d", "Fourth words"))
    add(session, {
      ...words("e", "Fifth words", 130),
      font: "serif",
      bold: true,
    })
    const [flat, kept] = await results(session)
    for (const bytes of [flat, kept]) {
      expect(await danglingRefs(bytes)).toEqual([])
      const fonts = (await embeddedFonts(bytes)).map((font) => font.name)
      expect(fonts.some((name) => name.includes("LiberationSans"))).toBe(true)
      expect(fonts.some((name) => name.includes("LiberationSerif-Bold"))).toBe(
        true
      )
    }
    // Made part of the page, the words are words of the page.
    const [page] = (await readPdf(flat)).pages
    expect(page.text).toContain("Fourth words")
    expect(page.text).toContain("Fifth words")
    expect(page.text).not.toContain("First words")
    stopEditing(session)
  })

  it("places a picture again when the first placing was undone", async () => {
    const session = editing(await makePdf("u", { pages: 1 }))
    const photo = scene(40, 30, 3)
    addPicture(mupdf, session, "photo", await jpegOf(photo))
    addPicture(mupdf, session, "drawing", await pngOf(scene(20, 20, 5)))
    add(session, picture("a", "photo"))
    add(session, picture("b", "drawing", 250))
    stepBack(session)
    stepBack(session)
    add(session, picture("c", "drawing", 250))
    add(session, picture("d", "photo"))
    stepBack(session)
    add(session, picture("e", "photo"))
    for (const bytes of await results(session)) {
      expect(await danglingRefs(bytes)).toEqual([])
      const sizes = (await readPictures(bytes))
        .map((one) => `${one.width}x${one.height}`)
        .sort()
      expect(sizes).toEqual(["20x20", "40x30"])
    }
    stopEditing(session)
  })

  it("fills a field in again when the first filling was undone", async () => {
    const session = editing(await makeFormPdf())
    const at = (name: string) =>
      fieldsOn(session, 0).find((field) => field.name === name)!
    const fill = (name: string, value: string) =>
      applyFields(mupdf, session, {
        label: "Fill in",
        ops: [{ do: "fill", page: 0, id: at(name).id, value }],
      })
    fill("notes", "First")
    fill("fruit", "Pear")
    stepBack(session)
    stepBack(session)
    // Greek and Cyrillic letters are written in fonts of their own.
    fill("notes", "Second Ω ж")
    fill("fruit", "Plum")
    stepBack(session)
    fill("fruit", "Apple")
    for (const fields of ["keep", "flatten"] as const) {
      const { bytes } = await exportEdited(mupdf, session, { fields })
      expect(await danglingRefs(bytes), fields).toEqual([])
      if (fields === "flatten") {
        const [page] = (await readPdf(bytes)).pages
        expect(page.text).toContain("Second Ω ж")
        expect(page.text).toContain("Apple Pear Plum")
      }
    }
    stopEditing(session)
  })
})
