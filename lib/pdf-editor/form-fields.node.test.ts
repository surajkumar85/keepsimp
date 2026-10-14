// @vitest-environment node
import { PDFDocument, PDFName } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { expect, it } from "vitest"
import { makeFormPdf, makePdf } from "@/tests/pdf-fixtures"
import { danglingRefs, readPdf, textPlaces } from "@/tests/pdf-reader"
import { makeSignedPdf, readSignature } from "@/tests/pdf-signing"
import { readDraft } from "./draft"
import { defaultSpec, MAKE_KINDS, type MakeFieldOp } from "./form-fields"
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
import { applyMakeFields, fieldNames } from "./mupdf-form-fields"
import { applyFields, fieldsOn } from "./mupdf-forms"
import { exportAfter } from "./mupdf-signed"
import { applyRedact } from "./mupdf-redact"
import { quadOf } from "./redact"
const box = { x: 30, y: 60, width: 180, height: 24 }
const base = () =>
  makePdf("form", {
    pages: 2,
    size: () => [400, 600],
    links: [{ from: 1, to: 2 }],
    notes: [{ page: 2, text: "Keep this" }],
    bookmarks: [{ title: "Second", page: 2 }],
    attachments: { "keep.txt": "Keep me" },
  })
const change = (s: EditSession, ...ops: MakeFieldOp[]) =>
  applyMakeFields(mupdf, s, { label: "Make fields", ops })
async function read(s: EditSession) {
  const { bytes, report } = await exportEdited(mupdf, s)
  expect(await danglingRefs(bytes)).toEqual([])
  return {
    bytes,
    report,
    got: await readPdf(bytes),
    form: (await PDFDocument.load(bytes)).getForm(),
  }
}
it("creates every field kind with real appearances, names, labels, requirements, limits and choices", async () => {
  const session = startEditing(mupdf, await base())
  for (const [at, kind] of MAKE_KINDS.entries()) {
    const field = {
      ...defaultSpec(kind),
      name: kind,
      tooltip: `Your ${kind}`,
      required: true,
      maxLength: kind === "text" ? 30 : 0,
      multiple: kind === "list",
    }
    change(session, {
      do: "add",
      page: 0,
      box: {
        ...box,
        y: 40 + at * 60,
        height: ["radio", "list", "multiline"].includes(kind) ? 50 : 24,
      },
      field,
    })
  }
  const out = await read(session)
  expect(out.form.getFields()).toHaveLength(8)
  expect(out.got.fields).toEqual([...MAKE_KINDS].sort())
  expect(out.got.pages[0].fields).toHaveLength(9)
  expect(out.form.getTextField("text").getMaxLength()).toBe(30)
  expect(out.form.getTextField("multiline").isMultiline()).toBe(true)
  expect(out.form.getOptionList("list").isMultiselect()).toBe(true)
  expect(out.form.getRadioGroup("radio").getOptions()).toEqual([
    "Option 1",
    "Option 2",
  ])
  for (const f of out.form.getFields()) expect(f.isRequired()).toBe(true)
  expect(fieldsOn(session, 0).find((f) => f.name === "date")!.date).toBe(
    "yyyy-mm-dd"
  )
  expect(out.report.untouched).toEqual({ checked: 1, differ: [] })
  expect(out.got.attachments).toEqual(["keep.txt"])
  expect(out.got.pages[1].notes).toEqual(["Keep this"])
  expect(out.got.pages[0].links).toEqual([2])
  // Every place has a look of its own, empty or not: a viewer that does not
  // build looks itself (Preview, printing) otherwise shows no field at all.
  for (const field of out.form.getFields())
    for (const widget of field.acroField.getWidgets())
      expect(
        widget.getNormalAppearance(),
        `${field.getName()} has a look`
      ).toBeDefined()
  stopEditing(session)
})
it("fills all new fields through the existing filler and other software reads the exact values", async () => {
  const session = startEditing(mupdf, await base())
  for (const [at, kind] of MAKE_KINDS.entries())
    change(session, {
      do: "add",
      page: 0,
      box: { ...box, y: 40 + at * 60, height: 50 },
      field: { ...defaultSpec(kind), name: kind, multiple: kind === "list" },
    })
  for (const [name, value] of [
    ["text", "Ada"],
    ["multiline", "First\nSecond"],
    ["date", "2026-10-14"],
    ["choice", "Choice 2"],
    ["list", "Choice 1\nChoice 2"],
  ]) {
    const f = fieldsOn(session, 0).find((f) => f.name === name)!
    applyFields(mupdf, session, {
      label: "Fill",
      ops: [{ do: "fill", page: 0, id: f.id, value }],
    })
  }
  const check = fieldsOn(session, 0).find((f) => f.kind === "check")!
  applyFields(mupdf, session, {
    label: "Tick",
    ops: [{ do: "turn", page: 0, id: check.id, on: true }],
  })
  const radios = fieldsOn(session, 0).filter((f) => f.kind === "radio")
  for (const at of [0, 1])
    applyFields(mupdf, session, {
      label: "Choose",
      ops: [{ do: "turn", page: 0, id: radios[at].id, on: true }],
    })
  const out = await read(session)
  expect(out.form.getTextField("text").getText()).toBe("Ada")
  expect(out.form.getTextField("multiline").getText()).toBe("First\nSecond")
  expect(out.form.getTextField("date").getText()).toBe("2026-10-14")
  expect(out.form.getDropdown("choice").getSelected()).toEqual(["Choice 2"])
  expect(out.form.getOptionList("list").getSelected()).toEqual([
    "Choice 1",
    "Choice 2",
  ])
  expect(out.form.getCheckBox("check").isChecked()).toBe(true)
  expect(out.form.getRadioGroup("radio").getSelected()).toBe("Option 2")
  expect(out.got.pages[0].fields).toContain("text=Ada")

  expect(out.got.pages[0].fields).toContain("radio=Option 2")
  expect(out.report.fields.same).toBe(8)
  stepBack(session)
  expect((await read(session)).form.getRadioGroup("radio").getSelected()).toBe(
    "Option 1"
  )
  stepForward(session)
  expect((await read(session)).form.getRadioGroup("radio").getSelected()).toBe(
    "Option 2"
  )
  stopEditing(session)
})
it("moves, resizes, renames and deletes fields without losing the other pages, values or radio widgets", async () => {
  const session = startEditing(mupdf, await base())
  change(
    session,
    { do: "add", page: 0, box, field: defaultSpec("text") },
    {
      do: "add",
      page: 1,
      box: { ...box, height: 60 },
      field: defaultSpec("radio"),
    }
  )
  const text = fieldsOn(session, 0)[0],
    radio = fieldsOn(session, 1)[0]
  applyFields(mupdf, session, {
    label: "Fill",
    ops: [{ do: "fill", page: 0, id: text.id, value: "Ada" }],
  })
  change(session, {
    do: "reshape",
    page: 0,
    id: text.id,
    box: { x: 50, y: 80, width: 220, height: 36 },
  })
  change(session, {
    do: "properties",
    page: 0,
    id: text.id,
    name: "Full name",
    tooltip: "Who are you",
    required: true,
    maxLength: 40,
  })
  let out = await read(session)
  expect(out.form.getTextField("Full name").getText()).toBe("Ada")
  expect(out.form.getTextField("Full name").getMaxLength()).toBe(40)
  const rect = out.form
    .getTextField("Full name")
    .acroField.getWidgets()[0]
    .getRectangle()
  expect(rect).toEqual({ x: 50, y: 484, width: 220, height: 36 })
  const steps = session.position
  change(session, {
    do: "properties",
    page: 0,
    id: text.id,
    name: "Full name",
    tooltip: "Who are you",
    required: true,
    maxLength: 40,
  })
  expect(session.position).toBe(steps)
  change(session, { do: "delete", page: 1, id: radio.id })
  out = await read(session)
  expect(out.got.fields).toEqual(["Full name"])
  expect(out.got.pages[1].fields).toEqual([])
  stepBack(session)
  expect(
    (await read(session)).form.getRadioGroup("Radio_group_1").getOptions()
  ).toHaveLength(2)
  stepForward(session)
  expect((await read(session)).got.fields).toEqual(["Full name"])
  change(session, { do: "delete", page: 0, id: text.id })
  expect((await read(session)).got.fields).toEqual([])
  stopEditing(session)
})
it("keeps fields upright on turned pages and preserves a checkbox's tick after resizing", async () => {
  for (const rotate of [0, 90, 180, 270]) {
    const session = startEditing(
      mupdf,
      await makePdf("turn", { pages: 2, rotate: { 1: rotate } })
    )
    change(
      session,
      { do: "add", page: 0, box, field: defaultSpec("text") },
      {
        do: "add",
        page: 0,
        box: { x: 20, y: 100, width: 20, height: 20 },
        field: defaultSpec("check"),
      }
    )
    const check = fieldsOn(session, 0).find((f) => f.kind === "check")!
    applyFields(mupdf, session, {
      label: "Tick",
      ops: [{ do: "turn", page: 0, id: check.id, on: true }],
    })
    change(session, {
      do: "reshape",
      page: 0,
      id: check.id,
      box: { x: 25, y: 105, width: 30, height: 30 },
    })
    const text = fieldsOn(session, 0).find((f) => f.kind === "text")!
    applyFields(mupdf, session, {
      label: "Fill turned field",
      ops: [{ do: "fill", page: 0, id: text.id, value: "Ada" }],
    })
    const flat = await exportEdited(mupdf, session, { fields: "flatten" })
    expect(await danglingRefs(flat.bytes)).toEqual([])
    expect((await PDFDocument.load(flat.bytes)).getForm().getFields()).toEqual(
      []
    )
    expect((await readPdf(flat.bytes)).pages[0].text).toContain("Ada")
    const word = (await textPlaces(flat.bytes))[0].find(
      (t) => t.text === "Ada"
    )!
    expect(word.angle).toBe(0)
    expect(word.x).toBeGreaterThanOrEqual(box.x)
    expect(word.x).toBeLessThan(box.x + box.width)
    expect(word.y).toBeGreaterThanOrEqual(box.y)
    expect(word.y).toBeLessThan(box.y + box.height)
    const out = await read(session)
    expect(out.form.getCheckBox("Checkbox_1").isChecked()).toBe(true)
    expect(
      fieldsOn(session, 0).find((f) => f.kind === "text")!.box.x
    ).toBeCloseTo(box.x, 0)
    expect(
      fieldsOn(session, 0).find((f) => f.kind === "text")!.box.y
    ).toBeCloseTo(box.y, 0)
    expect(out.got.pages[0].rotate).toBe(rotate)
    expect(out.report.untouched.differ).toEqual([])
    stopEditing(session)
  }
})
it("does not replace the file's fonts and refuses duplicates, XFA, malformed changes and absent fields atomically", async () => {
  const session = startEditing(mupdf, await makeFormPdf())
  const before = session.doc
    .getTrailer()
    .get("Root", "AcroForm", "DR", "Font")
    .toString()
  change(session, { do: "add", page: 0, box, field: defaultSpec("text") })
  expect(
    session.doc.getTrailer().get("Root", "AcroForm", "DR", "Font").toString()
  ).toContain("KSFormHelvetica")
  expect(before).not.toContain("KSFormHelvetica")
  expect(fieldNames(session.doc)).toContain("Text_field_1")
  const steps = session.position
  for (const op of [
    { do: "add", page: 0, box, field: defaultSpec("text") },
    { do: "delete", page: 8, id: "f1" },
    { do: "delete", page: 0, id: "f999999" },
    { do: "add", page: 0, box: null, field: defaultSpec("text") },
  ])
    expect(() => change(session, op as MakeFieldOp)).toThrow()
  expect(session.position).toBe(steps)
  expect((await read(session)).got.fields).toContain("applicant.full_name")
  stopEditing(session)
  const xfa = startEditing(mupdf, await makeFormPdf({ scripted: true }))
  expect(() =>
    change(xfa, { do: "add", page: 0, box, field: defaultSpec("text") })
  ).toThrow("XFA")
  expect(historyOf(xfa).steps).toEqual([])
  await read(xfa)
  stopEditing(xfa)
})
it("takes a checked draft up with undo and redo, and values filled after it", async () => {
  const bytes = await base(),
    session = startEditing(mupdf, bytes)
  change(session, { do: "add", page: 0, box, field: defaultSpec("text") })
  const f = fieldsOn(session, 0)[0]
  change(session, { do: "reshape", page: 0, id: f.id, box: { ...box, x: 60 } })
  stepBack(session)
  const draft = readDraft(
    JSON.parse(
      JSON.stringify({
        name: "form.pdf",
        size: bytes.length,
        when: 1,
        steps: session.steps,
        position: session.position,
      })
    )
  )!
  const next = startEditing(mupdf, bytes)
  takeUp(next, draft.steps, draft.position)
  expect((await read(next)).got.fields).toEqual(["Text_field_1"])
  stepForward(next)
  expect(fieldsOn(next, 0)[0].box.x).toBeCloseTo(60, 0)
  applyFields(mupdf, next, {
    label: "Fill",
    ops: [{ do: "fill", page: 0, id: fieldsOn(next, 0)[0].id, value: "Ada" }],
  })
  expect((await read(next)).form.getTextField("Text_field_1").getText()).toBe(
    "Ada"
  )
  stopEditing(session)
  stopEditing(next)
})
it("creates fields after a truly signed file without changing its signed bytes, and leaves certificate fields alone", async () => {
  const session = startEditing(mupdf, await makeSignedPdf({ pages: 2 }))
  change(session, { do: "add", page: 1, box, field: defaultSpec("text") })
  const result = await exportAfter(mupdf, session)
  expect(await danglingRefs(result.bytes)).toEqual([])
  expect(readSignature(result.bytes)).toMatchObject({
    valid: true,
    whole: false,
  })
  expect((await readPdf(result.bytes)).fields).toContain("Text_field_1")
  expect(
    (await PDFDocument.load(result.bytes))
      .getForm()
      .getTextField("Text_field_1")
  ).toBeDefined()
  const sig = fieldsOn(session, 0).find((f) => f.kind === "signature")!
  expect(() => change(session, { do: "delete", page: 0, id: sig.id })).toThrow(
    "certificate"
  )
  stepBack(session)
  expect((await read(session)).got.fields).not.toContain("Text_field_1")
  stepForward(session)
  expect((await read(session)).got.fields).toContain("Text_field_1")
  stopEditing(session)
})

it("a remaining radio choice still exports its own label after another choice is removed by redaction", async () => {
  const session = startEditing(mupdf, await base())
  change(session, {
    do: "add",
    page: 0,
    box: { ...box, height: 64 },
    field: defaultSpec("radio"),
  })
  const first = fieldsOn(session, 0)[0]
  applyRedact(mupdf, session, {
    label: "Mark a choice",
    ops: [{ do: "mark", page: 0, id: "choice", quads: [quadOf(first.box)] }],
  })
  applyRedact(mupdf, session, {
    label: "Remove a choice",
    ops: [{ do: "apply" }],
  })
  const remaining = fieldsOn(session, 0).find((f) => f.kind === "radio")!
  applyFields(mupdf, session, {
    label: "Choose the remaining option",
    ops: [{ do: "turn", page: 0, id: remaining.id, on: true }],
  })
  const out = await read(session)
  expect(out.form.getRadioGroup("Radio_group_1").getOptions()).toEqual([
    "Option 2",
  ])
  expect(out.form.getRadioGroup("Radio_group_1").getSelected()).toBe("Option 2")
  expect(out.got.pages[0].fields).toEqual(["Radio_group_1=Option 2"])
  stopEditing(session)
})

it("puts a page's fields in the order the Tab key follows, and keeps it through undo and redo", async () => {
  // A page that asks viewers to go by rows is told to follow its list instead.
  const rows = await PDFDocument.load(await base())
  rows.getPage(0).node.set(PDFName.of("Tabs"), PDFName.of("R"))
  const session = startEditing(mupdf, await rows.save())
  for (const [at, name] of ["First", "Second", "Third"].entries())
    change(session, {
      do: "add",
      page: 0,
      box: { ...box, y: 300 + at * 40 },
      field: { ...defaultSpec("text"), name },
    })
  const ids = fieldsOn(session, 0).map((field) => field.id)
  change(session, { do: "order", page: 0, ids: [ids[2], ids[0], ids[1]] })
  expect(fieldsOn(session, 0).map((field) => field.name)).toEqual([
    "Third",
    "First",
    "Second",
  ])
  const out = await read(session)
  const doc = await PDFDocument.load(out.bytes)
  const page = doc.getPage(0).node
  expect(page.get(PDFName.of("Tabs"))).toBeUndefined()
  // Other software sees the same order, and the page's link is where it was.
  expect(
    out.got.pages[0].fields
      .map((field: string) => field.split("=")[0])
      .filter((name: string) => ["First", "Second", "Third"].includes(name))
  ).toEqual(["Third", "First", "Second"])
  expect(out.got.pages[0].links).toEqual([2])
  stepBack(session)
  expect(fieldsOn(session, 0).map((field) => field.name)).toEqual([
    "First",
    "Second",
    "Third",
  ])
  stepForward(session)
  expect(fieldsOn(session, 0).map((field) => field.name)).toEqual([
    "Third",
    "First",
    "Second",
  ])
  // A field that is not on the page changes nothing.
  expect(() =>
    change(session, { do: "order", page: 1, ids: [ids[0]] })
  ).toThrow("That field is no longer on this page.")
  stopEditing(session)
})

it("copies a field to other pages with its kind, hint, limits and choices, and a name of its own", async () => {
  const session = startEditing(
    mupdf,
    await makePdf("copy", { pages: 3, size: () => [400, 600] })
  )
  const fields = [
    {
      ...defaultSpec("text"),
      name: "Name",
      tooltip: "Your full name",
      required: true,
      maxLength: 40,
    },
    { ...defaultSpec("date"), name: "Signed_on" },
    { ...defaultSpec("choice"), name: "Colour", options: ["Red", "Blue"] },
    { ...defaultSpec("check"), name: "Agree" },
    { ...defaultSpec("radio"), name: "Size" },
  ]
  for (const [at, field] of fields.entries())
    change(session, {
      do: "add",
      page: 0,
      box: {
        ...box,
        y: 60 + at * 70,
        height: field.kind === "radio" ? 50 : 24,
      },
      field,
    })
  const placed = fieldsOn(session, 0)
  const idOf = (name: string) => placed.find((one) => one.name === name)!.id
  for (const name of ["Name", "Signed_on", "Colour", "Agree"])
    change(session, { do: "copy", page: 0, id: idOf(name), to: [1, 2] })
  expect(() =>
    change(session, { do: "copy", page: 0, id: idOf("Size"), to: [1] })
  ).toThrow("A group of round buttons cannot be copied.")
  const copies = fieldsOn(session, 2)
  expect(copies.map((one) => one.name)).toEqual([
    "Name_p3",
    "Signed_on_p3",
    "Colour_p3",
    "Agree_p3",
  ])
  // Each copy is where the field was on its page.
  for (const one of copies) {
    const was = placed.find((field) => `${field.name}_p3` === one.name)!
    expect(one.box.x).toBeCloseTo(was.box.x, 1)
    expect(one.box.y).toBeCloseTo(was.box.y, 1)
  }
  expect(
    fieldsOn(session, 1).find((one) => one.name === "Signed_on_p2")!.date
  ).toBe("yyyy-mm-dd")
  const out = await read(session)
  const form = out.form
  const name = form.getTextField("Name_p2")
  expect(name.getMaxLength()).toBe(40)
  expect(name.isRequired()).toBe(true)
  expect(form.getDropdown("Colour_p3").getOptions()).toEqual(["Red", "Blue"])
  expect(form.getCheckBox("Agree_p2").isChecked()).toBe(false)
  expect(out.got.fields).toContain("Name_p3")
  // The hint is the field's, not its name.
  expect(
    fieldsOn(session, 1).find((one) => one.name === "Name_p2")!.label
  ).toBe("Your full name")
  // Every copy has a look of its own.
  for (const field of form.getFields())
    for (const widget of field.acroField.getWidgets())
      expect(widget.getNormalAppearance()).toBeDefined()
  stopEditing(session)
})
