// @vitest-environment node
/**
 * A file that says how it is built, and says it not quite rightly. The
 * engine mends such a file while it runs a page, and it lets nothing be
 * changed outside an operation: reading the lines of a page once left a
 * file that could not be written at all.
 */
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import { makeTaggedPdf, TAGGED } from "@/tests/pdf-tagged"
import {
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stopEditing,
} from "./mupdf-edit"
import { applyText, linesOn } from "./mupdf-text"

describe("reading the lines of a tagged file that needs mending", () => {
  it("leaves a file that can still be written, with nothing listed as a change", async () => {
    const session = startEditing(mupdf, await makeTaggedPdf())
    expect(linesOn(mupdf, session, 0).map((line) => line.text)).toEqual([
      ...TAGGED,
    ])
    // Read again, as the page is every time it is drawn.
    linesOn(mupdf, session, 0)
    expect(historyOf(session).steps).toHaveLength(0)
    const { bytes } = await exportEdited(mupdf, session)
    for (const line of TAGGED)
      expect((await readPdf(bytes)).pages[0].text).toContain(line)
    expect(await danglingRefs(bytes)).toEqual([])
    stopEditing(session)
  })

  it("changes its words, undoes that, and writes the file either way", async () => {
    const session = startEditing(mupdf, await makeTaggedPdf())
    const [, line] = linesOn(mupdf, session, 0)
    applyText(mupdf, session, {
      label: "Change text",
      ops: [
        {
          do: "retext",
          page: 0,
          box: line.box,
          was: line.text,
          text: "A line that was changed",
        },
      ],
    })
    let { bytes } = await exportEdited(mupdf, session)
    expect((await readPdf(bytes)).pages[0].text).toContain(
      "A line that was changed"
    )
    stepBack(session)
    expect(linesOn(mupdf, session, 0).map((one) => one.text)).toEqual([
      ...TAGGED,
    ])
    ;({ bytes } = await exportEdited(mupdf, session))
    expect((await readPdf(bytes)).pages[0].text).toContain(TAGGED[1])
    stopEditing(session)
  })
})
