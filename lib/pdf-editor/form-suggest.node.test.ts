// @vitest-environment node
/**
 * Suggesting fields with the real engine, from a paper form drawn by
 * pdf-lib; what is taken up is read back by pdf-lib and pdf.js.
 */
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { expect, it } from "vitest"
import { paperForm } from "@/tests/pdf-paper-form"
import { danglingRefs } from "@/tests/pdf-reader"
import { defaultSpec } from "./form-fields"
import {
  exportEdited,
  historyOf,
  startEditing,
  stopEditing,
} from "./mupdf-edit"
import { applyMakeFields } from "./mupdf-form-fields"
import { suggestOn } from "./mupdf-form-suggest"

it("suggests the fields a paper form asks for, named by their labels, and changes nothing", async () => {
  const session = startEditing(mupdf, await paperForm())
  const got = suggestOn(mupdf, session, 0)
  expect(got.map(({ kind, name, from }) => `${kind} ${name} ${from}`)).toEqual([
    "text Name line",
    "text Address box",
    "check Agree square",
    "multiline Comments box",
    "text Phone underscores",
  ])
  const name = got[0].box
  // Over the rule, the height of a line of writing: the rule is 600 - 518 = 82
  // down, and the engine measures a line with its own thickness.
  const near = (value: number, wanted: number) =>
    expect(Math.abs(value - wanted)).toBeLessThanOrEqual(1)
  near(name.x, 80)
  near(name.y + name.height, 82)
  near(name.width, 220)
  // Suggesting is no change: nothing to undo, and the file is as it came.
  expect(historyOf(session).steps).toEqual([])
  const { report } = await exportEdited(mupdf, session)
  expect(report.untouched.differ).toEqual([])
  stopEditing(session)
})

it("suggests on a turned page as the page is shown, and what is taken up is a field other software reads", async () => {
  const session = startEditing(mupdf, await paperForm())
  const turned = suggestOn(mupdf, session, 1)
  expect(turned.map(({ name }) => name)).toEqual(["Signed"])
  // Shown turned, the page is 600 wide and the rule runs down it: the field is tall and thin.
  expect(turned[0].box.height).toBeGreaterThan(turned[0].box.width)
  const suggested = suggestOn(mupdf, session, 0)
  applyMakeFields(mupdf, session, {
    label: "Add 5 suggested fields",
    ops: suggested.map((one) => ({
      do: "add" as const,
      page: 0,
      box: one.box,
      field: { ...defaultSpec(one.kind), name: one.name },
    })),
  })
  // Taken up, they are fields: suggesting again offers none of them.
  expect(suggestOn(mupdf, session, 0)).toEqual([])
  const { bytes } = await exportEdited(mupdf, session)
  expect(await danglingRefs(bytes)).toEqual([])
  const form = (await PDFDocument.load(bytes)).getForm()
  expect(
    form
      .getFields()
      .map((one) => one.getName())
      .sort()
  ).toEqual(["Address", "Agree", "Comments", "Existing", "Name", "Phone"])
  expect(form.getTextField("Comments").isMultiline()).toBe(true)
  const [place] = form.getTextField("Name").acroField.getWidgets()
  // In the file's own points the field sits on the rule at 518.
  expect(Math.abs(place.getRectangle().y - 518)).toBeLessThanOrEqual(1)
  stopEditing(session)
})
