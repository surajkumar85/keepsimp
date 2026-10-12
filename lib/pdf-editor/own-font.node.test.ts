// @vitest-environment node
/**
 * A font of one's own with the real engine: a text box and a changed line
 * are written in it, it is put into the file cut to the letters used, and
 * pdf.js and pdf-lib read the result.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import {
  danglingRefs,
  embeddedFonts,
  resourceNames,
  texts,
} from "@/tests/pdf-reader"
import { makeTextPdf, TEXT } from "@/tests/pdf-text"
import { fontsOf, readDraft } from "./draft"
import {
  addFont,
  applyChange,
  exportEdited,
  FontMissing,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  textWidth,
  type EditSession,
} from "./mupdf-edit"
import { applyText, linesOn } from "./mupdf-text"
import { BLACK, type EditorObject } from "./objects"
import { ownKey, readFont } from "./own-font"

const file = (name: string) =>
  new Uint8Array(readFileSync(`public/fonts/editor/${name}.ttf`))

/** Fonts put together as a collection, as the fonts that come with a computer often are. */
function collection(...fonts: Uint8Array[]) {
  const head = 12 + fonts.length * 4
  const bytes = new Uint8Array(
    head + fonts.reduce((sum, one) => sum + one.length, 0)
  )
  const view = new DataView(bytes.buffer)
  bytes.set([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0])
  view.setUint32(8, fonts.length)
  let at = head
  fonts.forEach((one, index) => {
    view.setUint32(12 + index * 4, at)
    bytes.set(one, at)
    const tables = view.getUint16(at + 4)
    for (let table = 0; table < tables; table++) {
      const record = at + 12 + table * 16 + 8
      view.setUint32(record, view.getUint32(record) + at)
    }
    at += one.length
  })
  return bytes
}

/** Add a font as one's own, as the page does: read, and handed over under its key. */
function own(session: EditSession, bytes: Uint8Array, wanted: string[] = []) {
  const read = readFont(bytes, wanted)!
  const key = ownKey(read.file)
  addFont(mupdf, session, key, read.file, read.written)
  return key
}

const box = (font: string, text: string): EditorObject => ({
  id: "t1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 60, y: 400, width: 300, height: 30 },
  text,
  lines: [text],
  font: font as never,
  bold: false,
  italic: false,
  size: 20,
  colour: BLACK,
  align: "left",
})

const line = (session: EditSession, text: string) =>
  linesOn(mupdf, session, 0).find((one) => one.text === text)!

const set = (session: EditSession, was: string, text: string, font: string) => {
  const from = line(session, was)
  return applyText(mupdf, session, {
    label: "Change text",
    ops: [
      {
        do: "retext",
        page: 0,
        box: from.box,
        was: from.text,
        text,
        look: { font },
      },
    ],
  })
}

describe("a text box in a font of one's own", () => {
  it("is written in that font, which is put into the file cut to its letters", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const bytes = file("GreatVibes-Regular")
    const key = ownKey(bytes)
    const add = () =>
      applyChange(mupdf, session, {
        label: "Add text",
        ops: [{ do: "add", page: 0, object: box(key, "Signed with care") }],
      })
    // A font that was not handed over is not written with.
    expect(add).toThrow(FontMissing)
    expect(own(session, bytes)).toBe(key)
    add()
    const { bytes: result } = await exportEdited(mupdf, session)
    expect(await danglingRefs(result)).toEqual([])
    expect((await texts(result))[0]).toContain("Signed with care")
    const fonts = await embeddedFonts(result)
    const ours = fonts.find((font) => font.name.includes("GreatVibes"))
    expect(ours).toBeDefined()
    // The whole font is some 450,000 bytes; what is in the file is its letters.
    expect(ours!.bytes).toBeGreaterThan(0)
    expect(ours!.bytes).toBeLessThan(bytes.length / 10)
    stopEditing(session)
  })

  it("is undone and made again, and comes back from a draft", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const key = own(session, file("Kalam-Regular"))
    applyChange(mupdf, session, {
      label: "Add text",
      ops: [{ do: "add", page: 0, object: box(key, "By hand") }],
    })
    stepBack(session)
    stepForward(session)
    const { bytes } = await exportEdited(mupdf, session)
    expect(await danglingRefs(bytes)).toEqual([])
    expect((await texts(bytes))[0]).toContain("By hand")

    // A draft names the font by its key, and is taken up once the font is handed over again.
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
    expect(fontsOf(draft.steps)).toEqual([key])
    const again = startEditing(mupdf, await makeTextPdf())
    own(again, file("Kalam-Regular"))
    takeUp(again, draft.steps, draft.position)
    const taken = await exportEdited(mupdf, again)
    expect(await danglingRefs(taken.bytes)).toEqual([])
    expect((await texts(taken.bytes))[0]).toContain("By hand")
    stopEditing(again)
    stopEditing(session)
  })
})

describe("a line set in a font of one's own", () => {
  it("is written whole in that font, with the gaps that font makes", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const key = own(session, file("LiberationMono-Regular"))
    set(session, TEXT.title, "One two three", key)
    const now = line(session, "One two three")
    expect(now.styles).toHaveLength(1)
    expect(now.styles[0].font).toMatch(/LiberationMono/)
    // Every letter of this font is as wide as every other, a gap among them.
    const size = now.styles[0].size
    expect(now.box.width).toBeCloseTo(
      textWidth(session, key, size, "One two three"),
      0
    )
    expect(now.box.width).toBeCloseTo(13 * 0.6 * size, 0)
    expect(historyOf(session).steps).toHaveLength(1)
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toMatchObject({ lines: 1, found: 1 })
    expect(await danglingRefs(bytes)).toEqual([])
    expect((await texts(bytes))[0]).toContain("One two three")
    expect(
      (await embeddedFonts(bytes)).some((font) =>
        font.name.includes("LiberationMono")
      )
    ).toBe(true)
    stopEditing(session)
  })

  it("takes the font that was asked for out of a collection", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const both = collection(
      file("LiberationSerif-Regular"),
      file("LiberationSerif-BoldItalic")
    )
    const key = own(session, both, ["LiberationSerif-BoldItalic"])
    expect(key).not.toBe(own(session, both))
    set(session, TEXT.total, "Total due: 95 euros", key)
    expect(line(session, "Total due: 95 euros").styles[0].font).toMatch(
      /LiberationSerif-BoldItalic/
    )
    const { bytes } = await exportEdited(mupdf, session)
    expect(await danglingRefs(bytes)).toEqual([])
    expect((await texts(bytes))[0]).toContain("Total due: 95 euros")
    const fonts = (await embeddedFonts(bytes)).map((font) => font.name)
    expect(
      fonts.some((name) => name.includes("LiberationSerif-BoldItalic"))
    ).toBe(true)
    stopEditing(session)
  })

  it("gives two fonts of one's own on a page a name each", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const first = own(session, file("Kalam-Regular"))
    const second = own(session, file("Sacramento-Regular"))
    set(session, TEXT.title, "First font", first)
    set(session, TEXT.total, "Second font", second)
    expect(line(session, "First font").styles[0].font).toMatch(/Kalam/)
    expect(line(session, "Second font").styles[0].font).toMatch(/Sacramento/)
    const { bytes } = await exportEdited(mupdf, session)
    const names = (await resourceNames(bytes, "Font"))[0]
    expect(names).toContain(`KS${first.replace("-", "")}`)
    expect(names).toContain(`KS${second.replace("-", "")}`)
    expect(await danglingRefs(bytes)).toEqual([])
    stopEditing(session)
  })

  it("says so when the font has not the letter that is typed", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const key = own(session, file("GreatVibes-Regular"))
    expect(() => set(session, TEXT.title, "漢字", key)).toThrow(
      /No font here has the letter/
    )
    // Nothing was changed.
    expect(line(session, TEXT.title)).toBeDefined()
    expect(historyOf(session).steps).toHaveLength(0)
    stopEditing(session)
  })
})
