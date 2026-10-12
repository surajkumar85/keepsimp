// @vitest-environment node
/**
 * Text in a row of boxes with the real engine. Where each letter stands is
 * read back with pdf.js.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { makePdf } from "@/tests/pdf-fixtures"
import { danglingRefs, textPlaces } from "@/tests/pdf-reader"
import { fontUrls } from "./fonts"
import {
  addFont,
  applyChange,
  exportEdited,
  objectsOn,
  startEditing,
  stopEditing,
} from "./mupdf-edit"
import { BLACK, type TextObject } from "./objects"
import { withLook } from "./styles"

const boxes: TextObject = {
  id: "t1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 40, y: 100, width: 120, height: 14.4 },
  text: "AB12",
  lines: ["AB12"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
  comb: 6,
}

describe("text in a row of boxes", () => {
  it("puts each letter in the middle of its box, as other software reads it", async () => {
    const session = startEditing(mupdf, await makePdf("comb", { pages: 1 }))
    addFont(
      mupdf,
      session,
      "sans",
      new Uint8Array(readFileSync(`public${fontUrls.sans}`))
    )
    applyChange(mupdf, session, {
      label: "Add",
      ops: [{ do: "add", page: 0, object: boxes }],
    })
    // It is read back from the file as it was put in.
    expect(objectsOn(session, 0)[0]).toMatchObject({ comb: 6, lines: ["AB12"] })

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.text).toEqual({ boxes: 1, found: 1 })
    expect(await danglingRefs(bytes)).toEqual([])
    const [page] = await textPlaces(bytes)
    const letters = page.filter((run) => /^[AB12]$/.test(run.text.trim()))
    expect(letters.map((run) => run.text.trim())).toEqual(["A", "B", "1", "2"])
    // Six boxes of twenty points from 40. In this font a capital A or B is
    // 0.667 of the size wide and a figure 0.556, so at 12 points each starts
    // 6 and 6.66 points into its box, which puts its middle in the middle.
    const wide = [0.667, 0.667, 0.556, 0.556].map((share) => share * 12)
    letters.forEach((run, at) => {
      const start = 40 + at * 20 + (20 - wide[at]) / 2
      expect(Math.abs(run.x - start)).toBeLessThan(0.5)
      expect(Math.abs(run.x + wide[at] / 2 - (50 + at * 20))).toBeLessThan(0.5)
    })
    stopEditing(session)
  })

  it("goes back to ordinary text when the boxes are taken away", async () => {
    const session = startEditing(mupdf, await makePdf("comb", { pages: 1 }))
    addFont(
      mupdf,
      session,
      "sans",
      new Uint8Array(readFileSync(`public${fontUrls.sans}`))
    )
    applyChange(mupdf, session, {
      label: "Add",
      ops: [{ do: "add", page: 0, object: boxes }],
    })
    applyChange(mupdf, session, {
      label: "Restyle",
      ops: [{ do: "change", page: 0, object: withLook(boxes, { comb: 0 }) }],
    })
    expect(objectsOn(session, 0)[0]).not.toHaveProperty("comb")
    const { bytes } = await exportEdited(mupdf, session)
    const [page] = await textPlaces(bytes)
    // The letters stand together again, as one run from the left of the box.
    const run = page.find((one) => one.text.includes("AB12"))!
    expect(Math.abs(run.x - 40)).toBeLessThan(1)
    stopEditing(session)
  })
})
