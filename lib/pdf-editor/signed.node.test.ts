// @vitest-environment node
/**
 * Signed files with the real engine. Whether a signature still holds is
 * worked out with node-forge, and what the result holds is read by pdf-lib
 * and pdf.js, so the engine is never only checked against itself.
 */
import { readFileSync } from "node:fs"
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { damage } from "@/tests/pdf-fixtures"
import { danglingRefs, readComments, readPdf } from "@/tests/pdf-reader"
import { makeSignedPdf, readSignature, SIGNER } from "@/tests/pdf-signing"
import { fontUrls } from "./fonts"
import { applyComments, commentsOn, lettersOn } from "./mupdf-comments"
import {
  addFont,
  applyChange,
  exportEdited,
  historyOf,
  madeAgain,
  objectsOn,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  type EditSession,
} from "./mupdf-edit"
import { applyFields, fieldsOn } from "./mupdf-forms"
import { canWriteAfter, exportAfter } from "./mupdf-signed"
import { BLACK, type ShapeObject, type TextObject } from "./objects"

/** A session with the font a text box is typed in. */
function editing(bytes: Uint8Array) {
  const session = startEditing(mupdf, bytes)
  addFont(
    mupdf,
    session,
    "sans",
    new Uint8Array(readFileSync(`public${fontUrls.sans}`))
  )
  return session
}

const field = (session: EditSession, name: string) =>
  fieldsOn(session, 0).find((one) => one.name === name)!

const fill = (session: EditSession, name: string, value: string) =>
  applyFields(mupdf, session, {
    label: "Fill in",
    ops: [{ do: "fill", page: 0, id: field(session, name).id, value }],
  })

const tick = (session: EditSession, on: boolean) =>
  applyFields(mupdf, session, {
    label: "Tick",
    ops: [{ do: "turn", page: 0, id: field(session, "agree").id, on }],
  })

/** Highlight the words of the first page. */
function highlight(session: EditSession) {
  const [line] = lettersOn(session, 0)
  const first = line.quads[0]
  const last = line.quads.at(-1)!
  return applyComments(mupdf, session, {
    label: "Highlight",
    ops: [
      {
        do: "mark",
        page: 0,
        kind: "highlight",
        quads: [
          [
            first[0],
            first[1],
            last[2],
            last[3],
            first[4],
            first[5],
            last[6],
            last[7],
          ],
        ],
        colour: [1, 0.86, 0.2],
        author: "Ada",
        when: Date.UTC(2026, 9, 12),
      } as never,
    ],
  })
}

const box: ShapeObject = {
  id: "box1",
  kind: "box",
  rotation: 0,
  opacity: 1,
  box: { x: 250, y: 200, width: 60, height: 40 },
  stroke: BLACK,
  fill: null,
  weight: 2,
}
const words: TextObject = {
  id: "text1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 250, y: 300, width: 120, height: 20 },
  text: "Seen by Ada",
  lines: ["Seen by Ada"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const add = (session: EditSession, object: ShapeObject | TextObject) =>
  applyChange(mupdf, session, {
    label: "Add",
    ops: [{ do: "add", page: 0, object }],
  })

describe("a signed file", () => {
  it("is signed, as other software reads it", async () => {
    const signed = await makeSignedPdf()
    expect(readSignature(signed)).toEqual({
      valid: true,
      whole: true,
      signer: SIGNER,
    })
    // A changed byte is noticed: the check is a real one.
    const spoiled = signed.slice()
    spoiled[spoiled.indexOf(0x73, 600)] ^= 1
    expect(readSignature(spoiled).valid).toBe(false)
  })

  it("keeps its signature when what was changed is written after it", async () => {
    const signed = await makeSignedPdf({ pages: 2 })
    const session = editing(signed)
    expect(canWriteAfter(session)).toBe(true)
    fill(session, "name", "Ada Lovelace")
    tick(session, true)
    highlight(session)
    add(session, box)
    add(session, words)

    const { bytes, report } = await exportAfter(mupdf, session)
    // The file as it came is still there, byte for byte, and the signature holds over it.
    expect(
      Buffer.from(bytes.subarray(0, signed.length)).equals(Buffer.from(signed))
    ).toBe(true)
    expect(bytes.length).toBeGreaterThan(signed.length)
    expect(readSignature(bytes)).toEqual({
      valid: true,
      whole: false,
      signer: SIGNER,
    })
    expect(report).toMatchObject({
      signature: { intact: true },
      added: 2,
      editable: true,
      comments: { had: 1, how: "keep", has: 1 },
      fields: { had: 3, how: "keep", same: 3, left: 3 },
    })
    // What was changed is in the result, as other software reads it.
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(form.getTextField("name").getText()).toBe("Ada Lovelace")
    expect(form.getCheckBox("agree").isChecked()).toBe(true)
    const [comment] = (await readComments(bytes))[0]
    expect(comment).toMatchObject({ kind: "Highlight", author: "Ada" })
    const read = await readPdf(bytes)
    expect(read.pages.map((page) => page.text)).toEqual([
      "signed-P1",
      "signed-P2",
    ])
    stopEditing(session)
  })

  it("loses its signature when the file is written anew, which is why this is asked", async () => {
    const signed = await makeSignedPdf()
    const session = editing(signed)
    fill(session, "name", "Ada Lovelace")
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.signature).toBeUndefined()
    expect(readSignature(bytes).valid).toBe(false)
    stopEditing(session)
  })

  it("can be downloaded again and again, with undoing in between, and the working copy is not touched", async () => {
    const signed = await makeSignedPdf()
    const session = editing(signed)
    fill(session, "name", "First")
    add(session, box)
    const one = await exportAfter(mupdf, session)
    expect(readSignature(one.bytes).valid).toBe(true)
    expect(historyOf(session)).toMatchObject({ position: 2, saved: 2 })

    // Undo, do something else, undo and redo: all of it is done again each time.
    expect(stepBack(session)).toEqual([0])
    fill(session, "name", "Second")
    tick(session, true)
    stepBack(session)
    stepForward(session)
    stepBack(session)
    const two = await exportAfter(mupdf, session)
    expect(readSignature(two.bytes)).toMatchObject({
      valid: true,
      whole: false,
    })
    expect(
      Buffer.from(two.bytes.subarray(0, signed.length)).equals(
        Buffer.from(signed)
      )
    ).toBe(true)
    // The undoing on the way left nothing in the result that points at what is gone.
    expect(await danglingRefs(two.bytes)).toEqual([])
    const form = (await PDFDocument.load(two.bytes)).getForm()
    expect(form.getTextField("name").getText()).toBe("Second")
    expect(form.getCheckBox("agree").isChecked()).toBe(false)
    expect(two.report.added).toBe(0)
    // Each result is a file of its own that opens without repair.
    for (const bytes of [one.bytes, two.bytes]) {
      const again = new mupdf.PDFDocument(bytes)
      expect(again.wasRepaired()).toBe(false)
      expect(again.countVersions()).toBeGreaterThan(1)
      again.destroy()
    }

    // The working copy still undoes to the file as it came.
    while (stepBack(session));
    expect(field(session, "name").value).toBe("")
    expect(objectsOn(session, 0)).toEqual([])
    stopEditing(session)
  })

  it("makes the steps in force again on a fresh copy, and nothing else", async () => {
    const session = editing(await makeSignedPdf())
    fill(session, "name", "Ada")
    // A change that changes nothing, and one that is refused, are not steps.
    fill(session, "name", "Ada")
    expect(() =>
      applyFields(mupdf, session, { label: "No", ops: [{ do: "no" } as never] })
    ).toThrow()
    highlight(session)
    add(session, words)
    stepBack(session)
    expect(historyOf(session)).toMatchObject({
      steps: ["Fill in", "Highlight", "Add"],
      position: 2,
    })
    const fresh = madeAgain(session)
    expect(historyOf(fresh)).toMatchObject({
      steps: ["Fill in", "Highlight"],
      position: 2,
    })
    expect(objectsOn(fresh, 0)).toEqual(objectsOn(session, 0))
    expect(commentsOn(fresh, 0)).toEqual(commentsOn(session, 0))
    expect(fieldsOn(fresh, 0)).toEqual(fieldsOn(session, 0))
    // It shares the session's fonts, and only its document is let go of.
    expect(fresh.fonts).toBe(session.fonts)
    fresh.doc.destroy()
    stepForward(session)
    expect(objectsOn(session, 0)).toHaveLength(1)
    stopEditing(session)
  })

  it("refuses a file that had to be repaired, which cannot be added to", async () => {
    const session = editing(damage(await makeSignedPdf(), "table"))
    expect(canWriteAfter(session)).toBe(false)
    await expect(exportAfter(mupdf, session)).rejects.toThrow(
      "cannot be added to as it is"
    )
    stopEditing(session)
  })

  it("stops when asked to, and writes a signed letter without a form", async () => {
    const signed = await makeSignedPdf({ plain: true })
    const session = editing(signed)
    highlight(session)
    await expect(
      exportAfter(mupdf, session, {
        checkpoint: () => Promise.reject(new Error("stopped")),
      })
    ).rejects.toThrow("stopped")
    const { bytes, report } = await exportAfter(mupdf, session)
    expect(readSignature(bytes).valid).toBe(true)
    expect(report.fields.had).toBe(1)
    expect(report.comments).toEqual({ had: 1, how: "keep", has: 1 })
    stopEditing(session)
  })
})
