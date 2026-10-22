// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { FakePdfClient, fakePdf, type FakeFile } from "@/tests/agent-pdf-fake"
import type { FormField } from "@/lib/pdf-editor/forms"
import { Agent } from "./agent"
import { pdfEditTools } from "./pdf-edit"
import { PdfEngine } from "./pdf-engine"
import { pdfFormTools, placesByName, usualSize } from "./pdf-forms"

function setup() {
  let client!: FakePdfClient
  const engine = new PdfEngine((onFile) => (client = new FakePdfClient(onFile)))
  const text = {
    font: async () => new ArrayBuffer(4),
    own: async () => undefined,
    layOut: (object: never) => object,
  }
  const agent = new Agent([
    ...pdfFormTools(engine, text),
    ...pdfEditTools(engine, text, async () => {
      throw new Error("No OCR here.")
    }),
  ])
  const add = (file: FakeFile, name = "form.pdf") =>
    agent.files.add(fakePdf(file), name).id
  const addBytes = (bytes: Uint8Array, name: string) =>
    agent.files.add(new Blob([bytes as BlobPart]), name).id
  const call = (name: string, input: unknown) =>
    agent.call(name, input, { caller: "page" })
  const asked = (what: string) =>
    client.asked
      .filter(([kind]) => kind === what)
      .map(
        ([, change]) =>
          change as { label: string; ops: Record<string, unknown>[] }
      )
  return { client: () => client, add, addBytes, call, asked }
}

/** A field as the fake worker reads one, placed where asked. */
const field = (
  name: string,
  x: number,
  y: number,
  more: Partial<FormField> = {}
): Partial<FormField> => ({
  name,
  label: name,
  box: { x, y, width: 100, height: 20 },
  ...more,
})

describe("what the form designer works with", () => {
  it("knows every place of a field by its name, and the usual sizes", () => {
    const byName = placesByName([
      [{ name: "a" } as FormField, { name: "r" } as FormField],
      [{ name: "r" } as FormField],
    ])
    expect(byName.get("r")!.map((place) => place.page)).toEqual([0, 1])
    expect(usualSize("check")).toEqual({ width: 20, height: 24 })
    expect(usualSize("radio")).toEqual({ width: 180, height: 64 })
    expect(usualSize("text")).toEqual({ width: 180, height: 24 })
  })
})

describe("suggest_pdf_form_fields", () => {
  it("lists what each page seems to ask for, adding nothing", async () => {
    const { add, call, asked } = setup()
    const suggestion = {
      kind: "text",
      box: { x: 1, y: 2, width: 3, height: 4 },
      name: "Name",
      from: "line",
    }
    const file = add({
      pages: 3,
      suggestions: [
        [suggestion],
        [],
        [{ ...suggestion, kind: "check", name: "Agree" }],
      ],
    })
    const found = await call("suggest_pdf_form_fields", { file })
    expect(found.summary).toBe(
      "2 fields suggested on 2 pages, judged by look: check them before adding."
    )
    expect(found.data).toEqual([
      { page: 1, ...suggestion },
      { page: 3, ...suggestion, kind: "check", name: "Agree" },
    ])
    expect(found.files).toBeUndefined()
    expect(asked("make-fields")).toEqual([])
    expect(
      (await call("suggest_pdf_form_fields", { file, pages: "2" })).summary
    ).toBe(
      "No fields suggested: nothing on these pages looks like a place to write or tick."
    )
    await expect(
      call("suggest_pdf_form_fields", { file: add({ pages: 51 }) })
    ).rejects.toThrow("That is 51 pages; suggest for at most 50 at a time.")
  })
})

describe("create_pdf_form_fields", () => {
  it("adds every kind of field with the designer's names and sizes, and what was suggested", async () => {
    const { add, call, asked } = setup()
    const file = add({
      pages: 2,
      fields: [[field("Text_field_1", 0, 0)]],
      suggestions: [
        [
          {
            kind: "text",
            box: { x: 10, y: 10, width: 120, height: 18 },
            name: "Name",
            from: "line",
          },
          {
            kind: "check",
            box: { x: 5, y: 5, width: 12, height: 12 },
            name: "Name",
            from: "square",
          },
        ],
      ],
    })
    const done = await call("create_pdf_form_fields", {
      file,
      fields: [
        { kind: "text", page: 1, x: 50, y: 60 },
        {
          kind: "radio",
          page: 1,
          x: 50,
          y: 100,
          name: "Size",
          options: ["S", "M", "L"],
          required: true,
        },
        {
          kind: "list",
          page: 2,
          x: 390,
          y: 590,
          width: 50,
          height: 50,
          options: ["A", "B"],
          multiple: true,
        },
        { kind: "date", page: 2, x: 10, y: 10, tooltip: "When", maxLength: 10 },
        { kind: "signature", page: 2, x: 10, y: 100 },
      ],
      fromSuggestions: "1",
    })
    expect(done.summary).toBe(
      "7 fields added, 2 of them as suggested. A signature place is empty: it signs nothing and proves nothing. A date is written as 2026-10-22; viewers that run form scripts may format it, and none is run here."
    )
    expect(done.files![0].name).toBe("form-form.pdf")
    const change = asked("make-fields")[0]
    expect(change.label).toBe("Add 7 fields")
    expect(change.ops[0]).toEqual({
      do: "add",
      page: 0,
      box: { x: 50, y: 60, width: 180, height: 24 },
      field: {
        kind: "text",
        name: "Text_field_2",
        tooltip: "",
        required: false,
        maxLength: 0,
        options: [],
        multiple: false,
      },
    })
    expect(change.ops[1]).toMatchObject({
      field: {
        kind: "radio",
        name: "Size",
        options: ["S", "M", "L"],
        required: true,
      },
    })
    // Kept within the page.
    expect(change.ops[2]).toMatchObject({
      page: 1,
      box: { x: 350, y: 550, width: 50, height: 50 },
      field: { multiple: true },
    })
    expect(change.ops[3]).toMatchObject({
      field: { kind: "date", name: "Date_1", tooltip: "When", maxLength: 10 },
    })
    // Suggested names are made unique.
    expect(
      change.ops.slice(5).map((op) => (op.field as { name: string }).name)
    ).toEqual(["Name", "Name_2"])
    expect(done.data).toMatchObject({
      names: expect.arrayContaining(["Size", "Name_2"]),
    })
    expect(
      (
        await call("create_pdf_form_fields", {
          file,
          fields: [{ kind: "check", page: 1, x: 1, y: 1 }],
        })
      ).summary
    ).toBe("1 field added.")
    expect(asked("make-fields")[1].label).toBe("Add a field")
  })

  it("refuses what the designer refuses", async () => {
    const { add, call } = setup()
    const file = add({ pages: 1, fields: [[field("Taken", 0, 0)]] })
    const refused = (fields: unknown[], why: string | RegExp, more = {}) =>
      expect(
        call("create_pdf_form_fields", { file, fields, ...more })
      ).rejects.toThrow(why)
    await refused(
      [{ kind: "text", page: 1, x: 1, y: 1, name: "Taken" }],
      'The form already has a field called "Taken".'
    )
    await refused(
      [{ kind: "text", page: 1, x: 1, y: 1, name: "a.b" }],
      '"a.b" cannot be a field\'s name: at most 100 letters, without dots.'
    )
    await refused(
      [{ kind: "radio", page: 1, x: 1, y: 1, options: ["Yes"] }],
      'A radio group needs two choices or more ("Radio_group_1").'
    )
    await refused(
      [{ kind: "choice", page: 1, x: 1, y: 1, options: ["A", "A"] }],
      'The choices of "Dropdown_1" must differ.'
    )
    await refused(
      [{ kind: "check", page: 1, x: 1, y: 1, options: ["A"] }],
      'A check field takes no options ("Checkbox_1").'
    )
    await refused(
      [{ kind: "text", page: 2, x: 1, y: 1 }],
      "There are 1 pages; page 2 is not one of them."
    )
    await expect(call("create_pdf_form_fields", { file })).rejects.toThrow(
      'Give "fields" or "fromSuggestions".'
    )
    await expect(
      call("create_pdf_form_fields", { file, fromSuggestions: "1" })
    ).rejects.toThrow(
      "Nothing was suggested on those pages: no field was added."
    )
    await expect(
      call("create_pdf_form_fields", {
        file: add({ pages: 1, xfa: true }),
        fields: [{ kind: "text", page: 1, x: 1, y: 1 }],
      })
    ).rejects.toThrow("form.pdf is an XFA form")
  })
})

describe("edit_pdf_form_fields", () => {
  const form = () => ({
    pages: 3,
    fields: [
      [
        field("Name", 10, 10, { label: "Your name" }),
        field("Email", 60, 40),
        field("Phone", 30, 90),
        field("Choice", 200, 10, { kind: "radio" }),
        field("Choice", 200, 40, { kind: "radio" }),
        field("Signed", 10, 300, { signed: true }),
      ],
      [field("Other", 10, 10)],
      [],
    ],
  })

  it("moves, renames, sets, copies and deletes fields as the designer does", async () => {
    const { add, call, asked } = setup()
    const file = add(form())
    const done = await call("edit_pdf_form_fields", {
      file,
      changes: [
        { name: "Name", x: 20, width: 150, rename: "FullName", required: true },
        { name: "Choice", choice: 2, y: 80 },
        { name: "Email", tooltip: "Where we write", maxLength: 80 },
        { name: "Phone", copyTo: "all" },
        { name: "Other", copyTo: "1, 3", delete: true },
      ],
    })
    expect(done.summary).toBe(
      "2 fields moved or resized, 2 fields renamed or set, 1 field deleted. Phone copied to 2 pages as Phone_p2, Phone_p3. Other copied to 2 pages as Other_p1, Other_p3."
    )
    const ops = asked("make-fields")[0].ops
    // Moves first, one for each field that ends somewhere else, then the rest in the order asked.
    expect(ops.map((op) => [op.do, op.id])).toEqual([
      ["reshape", "f0"],
      ["reshape", "f4"],
      ["properties", "f0"],
      ["properties", "f1"],
      ["copy", "f2"],
      ["copy", "f10"],
      ["delete", "f10"],
    ])
    expect(ops[0]).toEqual({
      do: "reshape",
      page: 0,
      id: "f0",
      box: { x: 20, y: 10, width: 150, height: 20 },
    })
    expect(ops[1]).toMatchObject({ box: { y: 80 } })
    expect(ops[2]).toEqual({
      do: "properties",
      page: 0,
      id: "f0",
      name: "FullName",
      tooltip: "Your name",
      required: true,
      maxLength: 0,
    })
    // A label that is only the name made readable is no tooltip to keep; one given is.
    expect(ops[3]).toMatchObject({
      tooltip: "Where we write",
      maxLength: 80,
      name: "Email",
    })
    expect(ops[4]).toEqual({ do: "copy", page: 0, id: "f2", to: [1, 2] })
    expect(ops[5]).toEqual({ do: "copy", page: 1, id: "f10", to: [0, 2] })
    expect(ops.at(-1)).toEqual({ do: "delete", page: 1, id: "f10" })
    const kept = await call("edit_pdf_form_fields", {
      file,
      changes: [{ name: "Phone", required: true }],
    })
    expect(kept.summary).toBe("1 field renamed or set.")
    expect(asked("make-fields")[1].ops[0]).toMatchObject({
      name: "Phone",
      tooltip: "",
    })
  })

  it("lines up, spaces, sizes and puts in order the fields of a page", async () => {
    const { add, call, asked } = setup()
    const file = add(form())
    const done = await call("edit_pdf_form_fields", {
      file,
      align: { names: ["Name", "Email", "Phone"], edge: "left" },
      space: { names: ["Name", "Email", "Phone"], direction: "down" },
      sameSize: { names: ["Name", "Email"], like: "Email", dimension: "width" },
      tabOrder: { page: 1, names: ["Phone", "Choice"] },
    })
    expect(done.summary).toBe(
      "2 fields moved or resized. 3 fields lined up along their left. 3 fields spaced evenly down. 2 fields given the size of Email. Tab goes through page 1's fields in the order given."
    )
    const ops = asked("make-fields")[0].ops
    expect(ops.find((op) => op.do === "order")).toEqual({
      do: "order",
      page: 0,
      ids: ["f2", "f3", "f4", "f0", "f1", "f5"],
    })
    // The same size by default is both width and height.
    await call("edit_pdf_form_fields", {
      file,
      changes: [{ name: "Name", width: 150, height: 30 }],
      sameSize: { names: ["Name", "Email"], like: "Name" },
    })
    expect(asked("make-fields").at(-1)!.ops).toContainEqual({
      do: "reshape",
      page: 0,
      id: "f1",
      box: { x: 60, y: 40, width: 150, height: 30 },
    })
    // Copied to many pages, the names are shown for the first few.
    const many = await call("edit_pdf_form_fields", {
      file: add({ pages: 6, fields: [[field("Note", 1, 1)]] }),
      changes: [{ name: "Note", copyTo: "all" }],
    })
    expect(many.summary).toBe(
      "Note copied to 5 pages as Note_p2, Note_p3, Note_p4…."
    )
    const rows = await call("edit_pdf_form_fields", {
      file,
      tabOrder: { page: 1 },
    })
    expect(rows.summary).toBe(
      "Tab goes through page 1's fields by rows from the top."
    )
    expect(asked("make-fields").at(-1)!.ops[0]).toEqual({
      do: "order",
      page: 0,
      ids: ["f0", "f3", "f1", "f4", "f2", "f5"],
    })
  })

  it("refuses what the designer refuses", async () => {
    const { add, call } = setup()
    const file = add(form())
    const refused = (input: object, why: string | RegExp) =>
      expect(call("edit_pdf_form_fields", { file, ...input })).rejects.toThrow(
        why
      )
    await refused(
      { changes: [{ name: "Nope", x: 1 }] },
      'The form has no field called "Nope". list_pdf_form_fields gives the names.'
    )
    await refused(
      { changes: [{ name: "Signed", x: 1 }] },
      '"Signed" holds a certificate signature: it cannot be changed here.'
    )
    await refused(
      { changes: [{ name: "Choice", x: 1 }] },
      '"Choice" has 2 places: say which with "choice" to move one.'
    )
    await refused(
      { changes: [{ name: "Choice", choice: 3, x: 1 }] },
      '"Choice" has 2 choices; there is no choice 3.'
    )
    await refused(
      { changes: [{ name: "Name", choice: 2, x: 1 }] },
      '"Name" has 1 place; there is no choice 2.'
    )
    await refused(
      { changes: [{ name: "Name", rename: "a.b" }] },
      '"a.b" cannot be a field\'s name'
    )
    await refused(
      { changes: [{ name: "Name", rename: "Email" }] },
      'The form already has a field called "Email".'
    )
    await refused(
      { changes: [{ name: "Choice", copyTo: "2" }] },
      '"Choice" is a radio group: its choices belong together and are not copied.'
    )
    await refused(
      { changes: [{ name: "Name", copyTo: "1" }] },
      '"Name" is already on those pages.'
    )
    await refused({ changes: [{ name: "Name" }] }, "Name: nothing to change.")
    await refused(
      { align: { names: ["Name", "Choice"], edge: "top" } },
      '"Choice" has 2 places; lined up works on fields with one.'
    )
    await refused(
      { space: { names: ["Name", "Email", "Other"], direction: "across" } },
      "Fields are spaced on one page at a time."
    )
    await refused(
      { sameSize: { names: ["Name", "Email"], like: "Phone" } },
      '"Phone" must be one of the names given.'
    )
    await refused(
      { tabOrder: { page: 4 } },
      "There are 3 pages; page 4 is not one of them."
    )
    await refused({ tabOrder: { page: 3 } }, "Page 3 has no fields.")
    await refused(
      { tabOrder: { page: 2, names: ["Name"] } },
      '"Name" is not on page 2.'
    )
    await refused(
      {},
      "Give changes, or fields to align, space, size or put in order."
    )
    await expect(
      call("edit_pdf_form_fields", {
        file: add({ pages: 1, xfa: true }),
        tabOrder: { page: 1 },
      })
    ).rejects.toThrow("is an XFA form")
  })
})

describe("the form listing and signature checks the designer relies on", () => {
  it("lists every place of a field, and checks signatures against certificates trusted", async () => {
    const { add, addBytes, call, client } = setup()
    const listed = await call("list_pdf_form_fields", {
      file: add({
        pages: 2,
        fields: [
          [field("Choice", 1, 2, { kind: "radio" })],
          [field("Choice", 3, 4, { kind: "radio" })],
        ],
      }),
    })
    expect((listed.data as { places: unknown[] }[])[0].places).toEqual([
      { page: 1, box: { x: 1, y: 2, width: 100, height: 20 } },
      { page: 2, box: { x: 3, y: 4, width: 100, height: 20 } },
    ])
    const root = addBytes(
      new Uint8Array(readFileSync("tests/fixtures/trust/root.crt")),
      "root.crt"
    )
    const signed = add({
      pages: 1,
      signatures: [
        {
          field: "Sig",
          page: 0,
          verdict: {
            checked: true,
            intact: true,
            signer: null,
            problem: "",
            trust: { trusted: true, by: "Root", itself: false },
          },
          changes: null,
          whole: true,
        },
        {
          field: "Unvouched",
          page: 0,
          verdict: {
            checked: true,
            intact: true,
            signer: null,
            problem: "",
            trust: null,
          },
          changes: null,
          whole: true,
        },
        {
          field: "Other",
          page: null,
          verdict: { checked: false, why: "Not read." },
          changes: null,
          whole: true,
        },
      ],
    })
    const checked = await call("verify_pdf_signatures", {
      file: signed,
      trusted: [root],
    })
    expect(client().trusted.at(-1)).toHaveLength(1)
    expect((checked.data as { trusted?: boolean }[])[0].trusted).toBe(true)
    expect((checked.data as { trusted?: boolean }[])[1].trusted).toBe(false)
    expect(checked.data as object[]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "Other", trusted: expect.anything() }),
      ])
    )
    const plain = await call("verify_pdf_signatures", { file: signed })
    expect((plain.data as object[])[0]).not.toHaveProperty("trusted")
    await expect(
      call("verify_pdf_signatures", {
        file: signed,
        trusted: [addBytes(Uint8Array.of(1, 2, 3), "junk.cer")],
      })
    ).rejects.toThrow(/^junk\.cer: /)
  })
})
