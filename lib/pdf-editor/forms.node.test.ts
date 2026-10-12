// @vitest-environment node
/**
 * Form fields with the real engine. Results are read back by pdf-lib and
 * pdf.js, so the engine is never only checked against itself.
 */
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { makeFormPdf, makePdf } from "@/tests/pdf-fixtures"
import { readPdf } from "@/tests/pdf-reader"
import type { FieldOp, FormField } from "./forms"
import type { Box } from "./geometry"
import {
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  type EditSession,
} from "./mupdf-edit"
import { applyFields, fieldsOn, formFacts } from "./mupdf-forms"

const change = (session: EditSession, ...ops: FieldOp[]) =>
  applyFields(mupdf, session, { label: "Fill in", ops })

const named = (session: EditSession, page: number, name: string) =>
  fieldsOn(session, page).filter((field) => field.name === name)
const one = (session: EditSession, page: number, name: string) =>
  named(session, page, name)[0]

const fill = (field: FormField, value: string, page = 0): FieldOp => ({
  do: "fill",
  page,
  id: field.id,
  value,
})
const turn = (field: FormField, on: boolean, page = 0): FieldOp => ({
  do: "turn",
  page,
  id: field.id,
  on,
})

/** The colour of a page at a point given in the page's points, as the engine draws the written file. */
function colourAt(bytes: Uint8Array, page: number, x: number, y: number) {
  const doc = new mupdf.PDFDocument(bytes)
  try {
    const picture = drawPage(mupdf, doc, page, 600)
    const at = (Math.round(y) * picture.width + Math.round(x)) * 4
    return [...picture.data.slice(at, at + 3)]
  } finally {
    doc.destroy()
  }
}

/** Two boxes are the same to within the width of a frame. */
const near = (a: Box, b: Box) =>
  (["x", "y", "width", "height"] as const).every(
    (side) => Math.abs(a[side] - b[side]) <= 1.5
  )

const formOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getForm()

describe("reading a form", () => {
  it("finds every place to fill in, with what it is and where", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const first = fieldsOn(session, 0)
    expect(first.map((field) => `${field.kind}:${field.name}`)).toEqual([
      "text:applicant.full_name",
      "text:notes",
      "text:code",
      "text:locked",
      "text:born",
      "check:agree",
      "radio:colour",
      "radio:colour",
      "choice:country",
      "choice:city",
      "list:fruit",
    ])
    const [
      name,
      notes,
      code,
      locked,
      born,
      agree,
      red,
      ,
      country,
      city,
      fruit,
    ] = first
    expect(name).toMatchObject({
      label: "Your full name",
      required: true,
      readOnly: false,
      value: "",
      date: null,
    })
    expect(name.id).toMatch(/^f\d+$/)
    // From the top left of the page, as the page is shown, with the half
    // point of its frame that the file counts as part of it.
    expect(near(name.box, { x: 20, y: 60, width: 200, height: 20 })).toBe(true)
    expect(notes).toMatchObject({ multiline: true, label: "Notes" })
    expect(code).toMatchObject({ comb: true, maxLength: 6 })
    expect(locked).toMatchObject({ readOnly: true, value: "fixed" })
    expect(born).toMatchObject({ date: "dd/mm/yyyy", label: "Born" })
    expect(agree).toMatchObject({ on: false, required: true, value: "" })
    expect(red).toMatchObject({ on: false, label: "Colour" })
    expect(country).toMatchObject({
      options: ["India", "France", "Japan"],
      shown: ["India", "France", "Japan"],
      custom: false,
    })
    expect(city.custom).toBe(true)
    expect(fruit).toMatchObject({
      options: ["Apple", "Pear", "Plum"],
      multiple: true,
    })
    // The second page shows the name again, and the third round button.
    expect(
      fieldsOn(session, 1).map((field) => `${field.kind}:${field.name}`)
    ).toEqual(["text:applicant.full_name", "radio:colour"])
    stopEditing(session)
  })

  it("says what kind of form a file has", async () => {
    const plain = startEditing(mupdf, await makeFormPdf())
    const pages = [fieldsOn(plain, 0), fieldsOn(plain, 1)]
    expect(formFacts(plain.doc, pages)).toEqual({
      fields: 13,
      xfa: false,
      scripts: false,
    })
    stopEditing(plain)
    const scripted = startEditing(mupdf, await makeFormPdf({ scripted: true }))
    expect(formFacts(scripted.doc, pages)).toMatchObject({
      xfa: true,
      scripts: true,
    })
    stopEditing(scripted)
    const none = startEditing(mupdf, await makePdf("plain", { pages: 1 }))
    expect(fieldsOn(none, 0)).toEqual([])
    expect(formFacts(none.doc, [[]])).toEqual({
      fields: 0,
      xfa: false,
      scripts: false,
    })
    stopEditing(none)
  })

  it("reads places where they are shown on a page the file turns", async () => {
    const session = startEditing(mupdf, await makeFormPdf({ rotate: 90 }))
    const name = one(session, 0, "applicant.full_name")
    // The page is shown on its side: what was 200 wide is 200 tall.
    expect(Math.abs(name.box.width - 20)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(name.box.height - 200)).toBeLessThanOrEqual(1.5)
    stopEditing(session)
  })
})

describe("filling a form in", () => {
  it("fills every kind of field, and other software reads what was filled in", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const at = (name: string) => one(session, 0, name)
    expect(
      change(session, fill(at("applicant.full_name"), "Ada Lovelace"))
    ).toEqual(
      // The name is shown on both pages, and both are drawn again.
      [0, 1]
    )
    change(session, fill(at("notes"), "First line\r\nSecond line"))
    change(session, fill(at("code"), "AB12345678"))
    change(session, fill(at("born"), "02/10/2026"))
    change(session, turn(at("agree"), true))
    change(session, turn(named(session, 0, "colour")[1], true))
    change(session, fill(at("country"), "Japan"))
    change(session, fill(at("city"), "Nagpur"))
    change(session, fill(at("fruit"), "Plum\nApple"))
    expect(historyOf(session).position).toBe(9)

    // What the page is told afterwards.
    expect(at("applicant.full_name").value).toBe("Ada Lovelace")
    expect(one(session, 1, "applicant.full_name").value).toBe("Ada Lovelace")
    expect(at("notes").value).toBe("First line\nSecond line")
    expect(at("code").value).toBe("AB1234")
    expect(at("agree").on).toBe(true)
    expect(named(session, 0, "colour").map((field) => field.on)).toEqual([
      false,
      true,
    ])
    expect(at("fruit").value).toBe("Plum\nApple")

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.fields).toEqual({ had: 11, how: "keep", same: 11, left: 11 })
    expect(report.added).toBe(0)
    const form = await formOf(bytes)
    expect(form.getTextField("applicant.full_name").getText()).toBe(
      "Ada Lovelace"
    )
    expect(form.getTextField("notes").getText()).toBe("First line\nSecond line")
    expect(form.getTextField("code").getText()).toBe("AB1234")
    expect(form.getTextField("born").getText()).toBe("02/10/2026")
    expect(form.getTextField("locked").getText()).toBe("fixed")
    expect(form.getCheckBox("agree").isChecked()).toBe(true)
    expect(form.getRadioGroup("colour").getSelected()).toBe("blue")
    expect(form.getDropdown("country").getSelected()).toEqual(["Japan"])
    expect(form.getDropdown("city").getSelected()).toEqual(["Nagpur"])
    expect(form.getOptionList("fruit").getSelected().sort()).toEqual([
      "Apple",
      "Plum",
    ])
    // And by pdf.js, page by page.
    const read = await readPdf(bytes)
    expect(read.pages[0].fields).toContain("applicant.full_name=Ada Lovelace")
    expect(read.pages[1].fields).toContain("applicant.full_name=Ada Lovelace")
    expect(read.pages[0].fields).toContain("country=Japan")
    expect(read.pages[0].text).toBe("form-P1")
    stopEditing(session)
  })

  it("turns one round button on and the others of its field off, on whichever page", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const [red] = named(session, 0, "colour")
    change(session, turn(red, true))
    const green = one(session, 1, "colour")
    // Both pages are drawn again: the one that went on and the one that went off.
    expect(change(session, turn(green, true, 1)).sort()).toEqual([0, 1])
    expect(named(session, 0, "colour").map((field) => field.on)).toEqual([
      false,
      false,
    ])
    expect(one(session, 1, "colour").on).toBe(true)
    // A round button is not turned off by pressing it again.
    expect(change(session, turn(one(session, 1, "colour"), false, 1))).toEqual(
      []
    )
    expect(historyOf(session).position).toBe(2)
    const { bytes } = await exportEdited(mupdf, session)
    expect((await formOf(bytes)).getRadioGroup("colour").getSelected()).toBe(
      "green"
    )
    stopEditing(session)
  })

  it("unticks a box, empties a field and takes a choice back", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const at = (name: string) => one(session, 0, name)
    change(
      session,
      turn(at("agree"), true),
      fill(at("country"), "France"),
      fill(at("fruit"), "Pear"),
      fill(at("notes"), "something")
    )
    // Four changes asked for together are one step.
    expect(historyOf(session).position).toBe(1)
    change(
      session,
      turn(at("agree"), false),
      fill(at("country"), ""),
      fill(at("fruit"), ""),
      fill(at("notes"), "")
    )
    expect(at("agree").on).toBe(false)
    expect(at("country").value).toBe("")
    expect(at("fruit").value).toBe("")
    const { bytes } = await exportEdited(mupdf, session)
    const form = await formOf(bytes)
    expect(form.getCheckBox("agree").isChecked()).toBe(false)
    expect(form.getDropdown("country").getSelected()).toEqual([])
    expect(form.getOptionList("fruit").getSelected()).toEqual([])
    expect(form.getTextField("notes").getText() ?? "").toBe("")
    stopEditing(session)
  })

  it("undoes and makes again, a step at a time", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const name = one(session, 0, "applicant.full_name")
    change(session, fill(name, "Ada"))
    change(session, turn(one(session, 0, "agree"), true))
    expect(stepBack(session)).toEqual([0])
    expect(one(session, 0, "agree").on).toBe(false)
    expect(stepBack(session)?.sort()).toEqual([0, 1])
    expect(one(session, 0, "applicant.full_name").value).toBe("")
    expect(one(session, 1, "applicant.full_name").value).toBe("")
    expect(stepForward(session)?.sort()).toEqual([0, 1])
    expect(one(session, 1, "applicant.full_name").value).toBe("Ada")
    // The numbers the file knows its places by are what they were.
    expect(one(session, 0, "applicant.full_name").id).toBe(name.id)
    stopEditing(session)
  })

  it("changes nothing that is not to be changed, and makes no step of it", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const at = (name: string) => one(session, 0, name)
    expect(change(session, fill(at("locked"), "changed"))).toEqual([])
    expect(change(session, fill(at("country"), "Atlantis"))).toEqual([])
    expect(change(session, fill(at("fruit"), "Mango"))).toEqual([])
    expect(change(session, turn(at("notes"), true))).toEqual([])
    expect(change(session, fill(at("agree"), "yes"))).toEqual([])
    expect(change(session, turn(at("agree"), false))).toEqual([])
    expect(change(session, fill(at("notes"), ""))).toEqual([])
    // A place that is not there, and a page that is not there.
    expect(
      change(session, { do: "fill", page: 0, id: "f999999", value: "a" })
    ).toEqual([])
    expect(
      change(session, { do: "fill", page: 9, id: at("notes").id, value: "a" })
    ).toEqual([])
    expect(historyOf(session).position).toBe(0)
    expect(at("locked").value).toBe("fixed")
    expect(() =>
      change(session, { do: "erase", page: 0, id: "f1" } as never)
    ).toThrow("not a change to a form")
    stopEditing(session)
  })
})

describe("how a filled form looks", () => {
  it("draws a list itself, with what is chosen on a tinted bar", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const fruit = one(session, 0, "fruit")
    change(session, fill(fruit, "Pear"))
    const { bytes } = await exportEdited(mupdf, session)
    // The list is 60 points tall with three options: 14 points a line.
    const { x, y, width } = fruit.box
    const far = x + width - 6
    expect(colourAt(bytes, 0, far, y + 8)).toEqual([255, 255, 255])
    const [red, green, blue] = colourAt(bytes, 0, far, y + 22)
    expect(blue).toBe(255)
    expect(red).toBeLessThan(210)
    expect(green).toBeLessThan(230)
    expect(colourAt(bytes, 0, far, y + 36)).toEqual([255, 255, 255])
    stopEditing(session)
  })

  it("draws a list upright on a page the file shows turned", async () => {
    const session = startEditing(mupdf, await makeFormPdf({ rotate: 90 }))
    const fruit = one(session, 0, "fruit")
    change(session, fill(fruit, "Apple"))
    const { bytes } = await exportEdited(mupdf, session)
    // Shown on its side, the list is 60 wide and 150 tall, and its first
    // line is still at its top.
    const { x, y, width } = fruit.box
    expect(Math.abs(width - 60)).toBeLessThanOrEqual(1.5)
    const bar = colourAt(bytes, 0, x + width - 6, y + 8)
    expect(bar[2]).toBe(255)
    expect(bar[0]).toBeLessThan(210)
    expect(colourAt(bytes, 0, x + width - 6, y + 50)).toEqual([255, 255, 255])
    stopEditing(session)
  })

  it("makes the fields part of their pages when asked, with what they hold", async () => {
    const session = startEditing(mupdf, await makeFormPdf())
    const at = (name: string) => one(session, 0, name)
    change(
      session,
      fill(at("applicant.full_name"), "Ada Lovelace"),
      fill(at("country"), "Japan"),
      fill(at("fruit"), "Plum"),
      turn(at("agree"), true)
    )
    const box = at("agree").box
    const { bytes, report } = await exportEdited(mupdf, session, {
      fields: "flatten",
      lock: {
        password: "open",
        ownerPassword: "own",
        permissions: -1,
      } as never,
    })
    expect(report.fields).toEqual({ had: 11, how: "flatten", same: 0, left: 0 })
    const read = await readPdf(bytes, "open")
    expect(read.fields).toEqual([])
    expect(read.pages[0].fields).toEqual([])
    // The words are words of the page now, on both pages the name is shown on.
    expect(read.pages[0].text).toContain("Ada Lovelace")
    expect(read.pages[0].text).toContain("Japan")
    expect(read.pages[0].text).toContain("Apple Pear Plum")
    expect(read.pages[0].text).toContain("fixed")
    expect(read.pages[1].text).toContain("Ada Lovelace")
    // And the tick is ink.
    const doc = new mupdf.PDFDocument(bytes)
    doc.authenticatePassword("open")
    const picture = drawPage(mupdf, doc, 0, 600)
    let dark = 0
    for (let dy = 2; dy < box.height - 2; dy++)
      for (let dx = 2; dx < box.width - 2; dx++) {
        const from =
          (Math.round(box.y + dy) * picture.width + Math.round(box.x + dx)) * 4
        if (picture.data[from] < 100) dark++
      }
    doc.destroy()
    expect(dark).toBeGreaterThan(8)
    // The working copy still has its fields: the download was made of a copy.
    expect(at("applicant.full_name").value).toBe("Ada Lovelace")
    stopEditing(session)
  })

  it("says nothing of fields about a file without a form", async () => {
    const session = startEditing(mupdf, await makePdf("plain", { pages: 1 }))
    const { report } = await exportEdited(mupdf, session, { fields: "flatten" })
    expect(report.fields).toEqual({ had: 0, how: "keep", same: 0, left: 0 })
    stopEditing(session)
  })
})
