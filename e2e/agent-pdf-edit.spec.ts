import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { makePdf, makePlainPdf } from "@/tests/pdf-fixtures"
import { readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, run, saved } from "./agent"

const PDF = "application/pdf"
const folder = mkdtempSync(join(tmpdir(), "keepsimp-agent-edit-"))

const give = async (page: Page, name: string, bytes: Uint8Array) =>
  hand(page, name, Buffer.from(bytes), PDF)

/** What the file a tool made reads as, to pdf.js. */
async function result(
  page: Page,
  done: { files?: { id: string }[] },
  password?: string
) {
  const file = await saved(page, done.files![0].id)
  return {
    name: file.name,
    read: await readPdf(new Uint8Array(file.bytes), password),
  }
}
const texts = (read: Awaited<ReturnType<typeof readPdf>>) =>
  read.pages.map((each) => each.text.replace(/\s+/g, " ").trim())

test("organises pages: turns, deletes, moves, copies, adds blank ones and another file's", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "doc.pdf", await makePdf("D", { pages: 4 }))
  const extra = await give(page, "extra.pdf", await makePdf("E", { pages: 2 }))
  const done = await ran(page, "organize_pdf_pages", {
    file: doc,
    steps: [
      { do: "turn", pages: "2", by: 90 },
      { do: "delete", pages: "4" },
      { do: "move", pages: "3", to: 1 },
      { do: "copy", pages: "1" },
      { do: "blank" },
      { do: "insert", at: 2, insert: 1 },
    ],
    insertFiles: [extra],
  })
  expect(done.summary).toMatch(/The file now has 7 pages\./)
  const { name, read } = await result(page, done)
  expect(name).toBe("doc-pages.pdf")
  expect(texts(read)).toEqual([
    "D-P3",
    "E-P1",
    "E-P2",
    "D-P3",
    "D-P1",
    "D-P2",
    "",
  ])
  expect(read.pages[5].rotate).toBe(90)
  // A step that cannot be made says why, and nothing is written.
  expect(
    await run(page, "organize_pdf_pages", {
      file: doc,
      steps: [{ do: "delete", pages: "1-4" }],
    })
  ).toMatchObject({ ok: false })
})

test("crops pages, saying what is cut off stays in the file", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "doc.pdf", await makePdf("C", { pages: 2 }))
  const before = (await readPdf(await makePdf("C", { pages: 2 }))).pages[0]
  const done = await ran(page, "crop_pdf", {
    file: doc,
    pages: "1",
    left: 10,
    right: 10,
    unit: "mm",
  })
  expect(done.summary).toMatch(/hidden, not removed/)
  const { read } = await result(page, done)
  expect(read.pages[0].width).toBeCloseTo(before.width - (20 * 72) / 25.4, 0)
  expect(read.pages[1].width).toBeCloseTo(before.width, 0)
  expect(texts(read)[0]).toBe("C-P1")
})

test("writes page numbers, Bates numbers and a footer, read back from the file", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "report.pdf", await makePdf("N", { pages: 3 }))
  const numbered = await ran(page, "add_page_numbers", {
    file: doc,
    format: "Page 1 of 9",
  })
  expect(numbered.summary).toMatch(
    /^Page numbers written on 3 pages\. Checked: the words of 3 added texts read back/
  )
  const { name, read } = await result(page, numbered)
  expect(name).toBe("report-numbered.pdf")
  expect(texts(read)[1]).toContain("Page 2 of 3")
  // Made part of the pages, unless asked to stay editable.
  expect(read.pages[0].kinds).toEqual([])

  const bates = await ran(page, "add_page_numbers", {
    file: doc,
    bates: { prefix: "ACME-", first: 120, figures: 5 },
    position: "top-right",
  })
  const batesRead = (await result(page, bates)).read
  expect(texts(batesRead)[2]).toContain("ACME-00122")
  // Kept editable, each stays a thing of its own a PDF editor can move.
  const editable = await ran(page, "add_page_numbers", {
    file: doc,
    keepEditable: true,
  })
  expect((await result(page, editable)).read.pages[0].kinds).toEqual(["Stamp"])

  const footer = await ran(page, "add_header_footer", {
    file: doc,
    text: "{name} · {page}/{pages}",
    pages: "2-3",
    colour: "#00786f",
  })
  const footerRead = (await result(page, footer)).read
  expect(texts(footerRead)[0]).toBe("N-P1")
  expect(texts(footerRead)[1]).toContain("report.pdf · 1/3")
})

test("watermarks with words or a picture, saying it does not protect", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "plan.pdf", await makePdf("W", { pages: 2 }))
  const words = await ran(page, "watermark_pdf", {
    file: doc,
    text: "CONFIDENTIAL",
    pages: "1",
  })
  expect(words.summary).toMatch(/does not protect it/)
  const wordsRead = (await result(page, words)).read
  expect(texts(wordsRead)[0]).toContain("CONFIDENTIAL")
  expect(texts(wordsRead)[1]).toBe("W-P2")

  const png = join(folder, "logo.png")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=teal:s=60x40",
    "-frames:v",
    "1",
    png,
  ])
  const logo = await hand(page, "logo.png", readFileSync(png), "image/png")
  const pictured = await ran(page, "watermark_pdf", {
    file: doc,
    image: logo,
    opacity: 0.3,
  })
  const picturedRead = (await result(page, pictured)).read
  expect(picturedRead.pages.map((each) => each.pictures)).toEqual([1, 1])
})

test("sets details, bookmarks and page labels", async ({ page }) => {
  await ready(page)
  const doc = await give(
    page,
    "book.pdf",
    await makePdf("B", { pages: 5, title: "Old" })
  )
  const done = await ran(page, "edit_pdf_details", {
    file: doc,
    title: "The book",
    author: "Ada",
    bookmarks: [
      { title: "Front", page: 1 },
      { title: "Body", page: 3, children: [{ title: "Part", page: 4 }] },
    ],
    pageLabels: [
      { from: 1, style: "i" },
      { from: 3, style: "1" },
    ],
  })
  expect(done.summary).toMatch(
    /^Details set\. Bookmarks replaced\. Page labels set\./
  )
  const { read } = await result(page, done)
  expect(read.info.Title).toBe("The book")
  expect(read.info.Author).toBe("Ada")
  expect(read.bookmarks).toEqual([
    { title: "Front", to: 1, items: [] },
    { title: "Body", to: 3, items: [{ title: "Part", to: 4, items: [] }] },
  ])
  expect(read.labels).toEqual(["i", "ii", "1", "2", "3"])
})

test("lists a form's fields and fills them, kept or flattened", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(
    page,
    "form.pdf",
    await makePdf("F", {
      pages: 1,
      fields: [{ name: "name", value: "", page: 1 }],
      checkBox: "agree",
    })
  )
  const listed = await ran(page, "list_pdf_form_fields", { file: doc })
  expect(listed.files ?? []).toEqual([])
  expect(listed.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "name", kind: "text", value: "" }),
      expect.objectContaining({ name: "agree", kind: "check" }),
    ])
  )
  const filled = await ran(page, "fill_pdf_form", {
    file: doc,
    values: { name: "Ada Lovelace", agree: false },
  })
  expect(filled.summary).toMatch(/^Filled in 2 fields\./)
  const { read } = await result(page, filled)
  expect(read.pages[0].fields).toEqual(
    expect.arrayContaining(["name=Ada Lovelace"])
  )
  expect(
    await run(page, "fill_pdf_form", { file: doc, values: { nope: "x" } })
  ).toEqual({
    ok: false,
    problem: expect.stringContaining("There is no field called “nope”"),
  })
  const flat = await ran(page, "fill_pdf_form", {
    file: doc,
    values: { name: "Flat" },
    flatten: true,
  })
  const flatRead = (await result(page, flat)).read
  expect(flatRead.fields).toEqual([])
  expect(texts(flatRead)[0]).toContain("Flat")
})

test("checks a signed file's signature, and keeps it holding when the file is changed after it", async ({
  page,
}) => {
  await ready(page)
  const signed = await hand(
    page,
    "signed.pdf",
    readFileSync("public/samples/keepsimp-signed.pdf"),
    PDF
  )
  const checked = await ran(page, "verify_pdf_signatures", { file: signed })
  expect(checked.summary).toMatch(
    /^1 signature: 1 still holds\. Trust in a certificate is for the reader to judge\./
  )
  expect(checked.data).toEqual([
    expect.objectContaining({
      field: "Client",
      holds: true,
      changedAfter: expect.stringContaining("added to once"),
    }),
  ])
  const numbered = await ran(page, "add_page_numbers", { file: signed })
  expect(numbered.summary).toMatch(/written after its signature/)
  const again = await hand(
    page,
    "numbered.pdf",
    (await saved(page, numbered.files![0].id)).bytes,
    PDF
  )
  const after = await ran(page, "verify_pdf_signatures", { file: again })
  expect(after.data).toEqual([
    expect.objectContaining({
      holds: true,
      changedAfter: expect.stringContaining("2 times"),
    }),
  ])
})

test("redacts words and patterns for good, and says when nothing was found", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(
    page,
    "letter.pdf",
    await makePlainPdf([
      { body: "Call 555 123 4567 today" },
      { body: "Write to ada@example.com" },
      { body: "Nothing secret here" },
    ])
  )
  const done = await ran(page, "redact_pdf", {
    file: doc,
    words: ["today"],
    patterns: ["email", "phone"],
  })
  expect(done.summary).toMatch(/^3 places on 2 pages were emptied for good/)
  const { name, read } = await result(page, done)
  expect(name).toBe("letter-redacted.pdf")
  const all = texts(read).join(" ")
  for (const gone of ["today", "ada@example.com", "555", "4567"])
    expect(all).not.toContain(gone)
  expect(all).toContain("Call")
  expect(all).toContain("Nothing secret here")
  const nothing = await ran(page, "redact_pdf", {
    file: doc,
    words: ["absent"],
  })
  expect(nothing.files ?? []).toEqual([])
  expect(nothing.summary).toMatch(/^Nothing was taken out/)
})

test("finds and replaces words in the page's own font", async ({ page }) => {
  await ready(page)
  const doc = await give(
    page,
    "note.pdf",
    await makePlainPdf([{ body: "Hello world" }, { body: "world again" }])
  )
  const done = await ran(page, "find_replace_pdf_text", {
    file: doc,
    find: "world",
    replace: "there",
  })
  expect(done.summary).toMatch(/^2 places changed, as one step\./)
  const read = (await result(page, done)).read
  expect(texts(read)).toEqual(["Hello there", "there again"])
  const missing = await ran(page, "find_replace_pdf_text", {
    file: doc,
    find: "absent",
    replace: "x",
  })
  expect(missing.summary).toMatch(/is not in the words of this file/)
})

test("adds text and a picture where it is asked", async ({ page }) => {
  await ready(page)
  const doc = await give(page, "form.pdf", await makePdf("T", { pages: 2 }))
  const done = await ran(page, "add_text_to_pdf", {
    file: doc,
    page: 2,
    x: 20,
    y: 40,
    text: "Approved by Ada",
    size: 14,
    bold: true,
  })
  expect(done.summary).toMatch(
    /^Text added to page 2\. Checked: the words of 1 added text read back/
  )
  expect(texts((await result(page, done)).read)[1]).toContain("Approved by Ada")

  const png = join(folder, "stamp.png")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=300x100",
    "-frames:v",
    "1",
    png,
  ])
  const stamp = await hand(page, "stamp.png", readFileSync(png), "image/png")
  const placed = await ran(page, "add_image_to_pdf", {
    file: doc,
    image: stamp,
    page: 1,
    x: 10,
    y: 10,
    width: 120,
  })
  expect(placed.summary).toMatch(
    /^Picture placed on page 1, 120 by 40 points\./
  )
  expect(
    (await result(page, placed)).read.pages.map((each) => each.pictures)
  ).toEqual([1, 0])
  expect(
    await run(page, "add_text_to_pdf", {
      file: doc,
      page: 3,
      x: 1,
      y: 1,
      text: "x",
    })
  ).toEqual({
    ok: false,
    problem: "There are 2 pages; page 3 is not one of them.",
  })
})

test("recognises a scan's words with Tesseract from this site", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const scan = await hand(
    page,
    "letter.pdf",
    readFileSync("public/samples/keepsimp-scanned-letter.pdf"),
    PDF
  )
  const done = await ran(page, "ocr_pdf", { file: scan })
  expect(done.summary).toMatch(/Words were recognised on page 1/)
  expect(done.summary).toMatch(
    /Checked: the .+ recognised words? read back from the file\./
  )
  const { name, read } = await result(page, done)
  expect(name).toBe("letter-ocr.pdf")
  const all = texts(read).join(" ")
  expect(all).toContain("Rental agreement")
  expect(all).toContain("Harbour Street")
  // Now the words can be found, and taken out.
  const again = await hand(
    page,
    "letter-ocr.pdf",
    (await saved(page, done.files![0].id)).bytes,
    PDF
  )
  const gone = await ran(page, "redact_pdf", {
    file: again,
    words: ["Harbour Street"],
  })
  expect(gone.summary).toMatch(/^1 place on 1 page was emptied for good/)
})
