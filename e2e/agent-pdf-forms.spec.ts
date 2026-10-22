import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { PDFDocument } from "@cantoo/pdf-lib"
import { makePlainPdf } from "@/tests/pdf-fixtures"
import { PAPER_FIELDS, paperForm } from "@/tests/pdf-paper-form"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, saved } from "./agent"

const give = async (page: Page, name: string, bytes: Uint8Array) =>
  hand(page, name, Buffer.from(bytes), "application/pdf")
const bytesOf = async (page: Page, done: { files?: { id: string }[] }) =>
  new Uint8Array((await saved(page, done.files![0].id)).bytes)

/** The form's fields as pdf-lib reads them: name and kind. */
async function formOf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc
    .getForm()
    .getFields()
    .map((field) => [field.getName(), field.constructor.name])
    .sort()
}

test("makes a form of every kind of field, which is then filled and read by pdf-lib", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(
    page,
    "plain.pdf",
    await makePlainPdf([{ top: "Application", body: "Form" }])
  )
  const made = await ran(page, "create_pdf_form_fields", {
    file: doc,
    fields: [
      { kind: "text", page: 1, x: 30, y: 60, name: "Name", required: true },
      { kind: "check", page: 1, x: 30, y: 100, name: "Agree" },
      {
        kind: "radio",
        page: 1,
        x: 30,
        y: 140,
        name: "Size",
        options: ["Small", "Large"],
      },
      {
        kind: "choice",
        page: 1,
        x: 30,
        y: 220,
        name: "Colour",
        options: ["Red", "Blue"],
      },
      { kind: "date", page: 1, x: 30, y: 260, name: "When" },
      { kind: "signature", page: 1, x: 30, y: 300, name: "Sign" },
    ],
  })
  expect(made.summary).toMatch(/^6 fields added\. A signature place is empty/)
  const form = await bytesOf(page, made)
  expect(await formOf(form)).toEqual([
    ["Agree", "PDFCheckBox"],
    ["Colour", "PDFDropdown"],
    ["Name", "PDFTextField"],
    ["Sign", "PDFSignature"],
    ["Size", "PDFRadioGroup"],
    ["When", "PDFTextField"],
  ])
  expect(await danglingRefs(form)).toEqual([])

  // Filled with the filler's own tool, and read back.
  const again = await give(page, "form.pdf", form)
  const listed = await ran(page, "list_pdf_form_fields", { file: again })
  const size = (
    listed.data as unknown as { name: string; places: unknown[] }[]
  ).find((one) => one.name === "Size")!
  expect(size.places).toHaveLength(2)
  const filled = await ran(page, "fill_pdf_form", {
    file: again,
    values: {
      Name: "Ada Lovelace",
      Agree: true,
      Size: 2,
      Colour: "Blue",
      When: "2026-10-22",
    },
  })
  const fields = (await readPdf(await bytesOf(page, filled))).pages[0].fields
  expect(fields).toEqual(
    expect.arrayContaining([
      "Name=Ada Lovelace",
      "Colour=Blue",
      "When=2026-10-22",
    ])
  )

  // Renamed, moved, lined up, and put in order: the result read again by pdf-lib.
  const changed = await ran(page, "edit_pdf_form_fields", {
    file: again,
    changes: [
      {
        name: "Name",
        rename: "FullName",
        tooltip: "Your full name",
        width: 220,
      },
    ],
    align: { names: ["Agree", "Colour", "When"], edge: "left" },
    tabOrder: { page: 1 },
  })
  expect(changed.summary).toMatch(
    /1 field renamed or set\. 3 fields lined up along their left\. Tab goes through page 1's fields by rows from the top\./
  )
  const changedForm = await PDFDocument.load(await bytesOf(page, changed))
  const full = changedForm.getForm().getTextField("FullName")
  expect(full.acroField.getWidgets()[0].getRectangle().width).toBeCloseTo(
    220,
    0
  )
  expect(
    changedForm
      .getForm()
      .getFields()
      .map((field) => field.getName())
  ).not.toContain("Name")
})

test("suggests the fields a paper form asks for, and adds them", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "paper.pdf", await paperForm())
  const suggested = await ran(page, "suggest_pdf_form_fields", {
    file: doc,
    pages: "1",
  })
  const names = (suggested.data as unknown as { name: string }[])
    .map((one) => one.name)
    .sort()
  expect(names).toEqual([...PAPER_FIELDS].sort())
  const made = await ran(page, "create_pdf_form_fields", {
    file: doc,
    fromSuggestions: "1",
  })
  expect(made.summary).toMatch(/^5 fields added, 5 of them as suggested\./)
  // Added beside the field the paper form already had.
  const names2 = (await formOf(await bytesOf(page, made))).map(([name]) => name)
  expect(names2).toEqual(expect.arrayContaining(PAPER_FIELDS))
  expect(names2).toHaveLength(PAPER_FIELDS.length + 1)
})

test("checks signatures against the certificates you trust, and only those", async ({
  page,
}) => {
  await ready(page)
  const signed = await give(
    page,
    "signed.pdf",
    new Uint8Array(readFileSync("public/samples/keepsimp-signed.pdf"))
  )
  const authority = await hand(
    page,
    "test-authority.crt",
    readFileSync("tests/fixtures/certificates/test-authority.crt"),
    "application/x-x509-ca-cert"
  )
  const other = await hand(
    page,
    "root.crt",
    readFileSync("tests/fixtures/trust/root.crt"),
    "application/x-x509-ca-cert"
  )
  const trusted = await ran(page, "verify_pdf_signatures", {
    file: signed,
    trusted: [authority],
  })
  const [one] = trusted.data as unknown as {
    holds: boolean
    trusted: boolean
    signer: string[]
  }[]
  expect(one).toMatchObject({ holds: true, trusted: true })
  expect(one.signer.join(" ")).toContain("a certificate you trust")
  const notTrusted = await ran(page, "verify_pdf_signatures", {
    file: signed,
    trusted: [other],
  })
  expect(
    (notTrusted.data as unknown as { trusted: boolean }[])[0].trusted
  ).toBe(false)
})
