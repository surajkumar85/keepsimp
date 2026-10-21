import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { makePdf, makePlainPdf } from "@/tests/pdf-fixtures"
import { readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, run, saved } from "./agent"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-agent-pdf-"))
const PDF = "application/pdf"

const giveFile = async (page: Page, name: string, bytes: Uint8Array) =>
  hand(page, name, Buffer.from(bytes), PDF)

const texts = async (bytes: Uint8Array, password?: string) =>
  (await readPdf(bytes, password)).pages.map((each) => each.text.trim())

test("reads a PDF's facts and text", async ({ page }) => {
  await ready(page)
  const id = await giveFile(
    page,
    "guide.pdf",
    await makePdf("G", {
      pages: 3,
      title: "The guide",
      bookmarks: [
        { title: "Start", page: 1 },
        { title: "Later", page: 3 },
      ],
      fields: [{ name: "who", value: "Ada", page: 2 }],
    })
  )
  const info = await ran(page, "pdf_info", { file: id, text: "1, 3" })
  expect(info.summary).toBe("3 pages, “The guide”. Text of 2 pages.")
  expect(info.data).toMatchObject({
    pages: 3,
    title: "The guide",
    forms: true,
    bookmarks: [
      { title: "Start", page: 1, level: 1 },
      { title: "Later", page: 3, level: 1 },
    ],
  })
  const text = info.data!.text as unknown as { page: number; text: string }[]
  expect(text.map((each) => each.page)).toEqual([1, 3])
  expect(text[0].text).toContain("G-P1")
  expect(text[1].text).toContain("G-P3")
})

test("merges PDFs and a picture, with chosen pages, turns and a lock, and keeps their fields", async ({
  page,
}) => {
  await ready(page)
  const a = await giveFile(
    page,
    "a.pdf",
    await makePdf("A", {
      pages: 3,
      fields: [{ name: "name", value: "Ada", page: 1 }],
    })
  )
  const b = await giveFile(
    page,
    "b.pdf",
    await makePdf("B", { pages: 2, password: { user: "open-b" } })
  )
  const png = join(folder, "dot.png")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=40x30",
    "-frames:v",
    "1",
    png,
  ])
  const picture = await hand(page, "dot.png", readFileSync(png), "image/png")

  // A locked file needs its password, and says so.
  expect(await run(page, "merge_pdfs", { files: [a, b] })).toEqual({
    ok: false,
    problem: 'b.pdf is locked with a password: give it as "password".',
  })
  const merged = await ran(page, "merge_pdfs", {
    files: [a, b, picture],
    pages: ["1, 3", "", ""],
    rotate: [0, 90, 0],
    passwords: ["", "open-b", ""],
    name: "both",
    title: "Both files",
    lock: { password: "new-secret" },
  })
  expect(merged.summary).toBe(
    "Merged 3 files into 5 pages with 3 bookmarks, locked with the password given. Checked: it opens with every page."
  )
  const file = await saved(page, merged.files![0].id)
  expect(file.name).toBe("both.pdf")
  const read = await readPdf(new Uint8Array(file.bytes), "new-secret")
  expect(read.pages.map((each) => each.text.trim())).toEqual([
    "A-P1",
    "A-P3",
    "B-P1",
    "B-P2",
    "",
  ])
  expect(read.pages.map((each) => each.rotate)).toEqual([0, 0, 90, 90, 0])
  expect(read.pages[0].fields).toEqual(["name=Ada"])
  expect(read.pages[4].pictures).toBe(1)
  expect(read.info.Title).toBe("Both files")
  // Without the password, it does not open.
  await expect(readPdf(new Uint8Array(file.bytes))).rejects.toThrow()
})

test("splits a PDF every way an agent asks, each part checked", async ({
  page,
}) => {
  await ready(page)
  const book = await giveFile(
    page,
    "book.pdf",
    await makePdf("K", {
      pages: 6,
      bookmarks: [
        { title: "One", page: 1 },
        { title: "Two", page: 3 },
        { title: "Three", page: 5 },
      ],
    })
  )
  const every = await ran(page, "split_pdf", {
    file: book,
    mode: "every",
    every: 4,
  })
  expect(every.files!.map((each) => each.name)).toEqual([
    "book-1.pdf",
    "book-2.pdf",
  ])
  expect(
    await texts(new Uint8Array((await saved(page, every.files![1].id)).bytes))
  ).toEqual(["K-P5", "K-P6"])

  const chapters = await ran(page, "split_pdf", {
    file: book,
    mode: "bookmarks",
    pattern: "{label}",
  })
  expect(chapters.files!.map((each) => each.name)).toEqual([
    "One.pdf",
    "Two.pdf",
    "Three.pdf",
  ])
  expect(
    await texts(
      new Uint8Array((await saved(page, chapters.files![1].id)).bytes)
    )
  ).toEqual(["K-P3", "K-P4"])

  const extract = await ran(page, "split_pdf", {
    file: book,
    mode: "extract",
    pages: "2, 6",
  })
  expect(
    await texts(new Uint8Array((await saved(page, extract.files![0].id)).bytes))
  ).toEqual(["K-P2", "K-P6"])

  // At words, and at blank pages, as a stack of scans is parted.
  const letters = await giveFile(
    page,
    "letters.pdf",
    await makePlainPdf([
      { body: "Invoice 1" },
      { body: "more" },
      {},
      { body: "Invoice 2" },
      { body: "end" },
    ])
  )
  const byWords = await ran(page, "split_pdf", {
    file: letters,
    mode: "text",
    words: "Invoice",
  })
  expect(
    (byWords.data!.parts as unknown as { from: number; to: number }[]).map(
      (part) => [part.from, part.to]
    )
  ).toEqual([
    [1, 3],
    [4, 5],
  ])
  const byBlanks = await ran(page, "split_pdf", {
    file: letters,
    mode: "blank",
  })
  expect(
    (byBlanks.data!.parts as unknown as { from: number; to: number }[]).map(
      (part) => [part.from, part.to]
    )
  ).toEqual([
    [1, 2],
    [4, 5],
  ])

  // Many parts come as one ZIP.
  const long = await giveFile(
    page,
    "long.pdf",
    await makePdf("L", { pages: 25 })
  )
  const single = await ran(page, "split_pdf", { file: long, mode: "single" })
  expect(single.summary).toMatch(/^Split long\.pdf into 25 parts, in one ZIP\./)
  const zip = await saved(page, single.files![0].id)
  const path = join(folder, zip.name)
  writeFileSync(path, zip.bytes)
  const listed = execFileSync("unzip", ["-Z1", path])
    .toString()
    .trim()
    .split("\n")
  expect(listed).toHaveLength(25)
  expect(listed[0]).toBe("long-01.pdf")
})

test("compresses a PDF and says what changed, or that it is already small", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const brochure = readFileSync("public/samples/keepsimp-brochure.pdf")
  const id = await hand(page, "brochure.pdf", brochure, PDF)
  const compressed = await ran(page, "compress_pdf", {
    file: id,
    level: "balanced",
  })
  expect(compressed.summary).toMatch(
    /MB became .+ MB \(\d+% smaller\)\. Checked: \d+ pages? looks? the same before and after\./
  )
  const file = await saved(page, compressed.files![0].id)
  expect(file.name).toBe("brochure-compressed.pdf")
  expect(file.bytes.length).toBeLessThan(brochure.length)
  // The words are all still there.
  expect(await texts(new Uint8Array(file.bytes))).toEqual(
    await texts(new Uint8Array(brochure))
  )

  const small = await giveFile(
    page,
    "small.pdf",
    await makePdf("S", { pages: 1 })
  )
  // A file made smaller once is already as small as it gets.
  const once = await ran(page, "compress_pdf", {
    file: small,
    level: "lossless",
  })
  const again = await hand(
    page,
    "small-compressed.pdf",
    (await saved(page, once.files![0].id)).bytes,
    PDF
  )
  const already = await ran(page, "compress_pdf", {
    file: again,
    level: "lossless",
  })
  expect(already.files ?? []).toEqual([])
  expect(already.summary).toMatch(/already as small/)
})

test("a long job stops when the agent asks", async ({ page }) => {
  test.setTimeout(120_000)
  await ready(page)
  const id = await hand(
    page,
    "brochure.pdf",
    readFileSync("public/samples/keepsimp-brochure.pdf"),
    PDF
  )
  const answer = page.evaluate(
    (id) =>
      window.keepsimp!.run("long-one", "compress_pdf", {
        file: id,
        level: "strong",
      }),
    id
  )
  await expect(page.getByTestId("agent-call-state").first()).toContainText(
    "Working"
  )
  await page.evaluate(() => window.keepsimp!.stop("long-one"))
  expect(await answer).toEqual({
    ok: false,
    problem: "Stopped before it was done.",
  })
  await expect(page.getByTestId("agent-call-state").first()).toHaveText(
    "Stopped"
  )
  // The tools still work after a stop.
  const small = await giveFile(
    page,
    "small.pdf",
    await makePdf("S", { pages: 2 })
  )
  expect((await ran(page, "pdf_info", { file: small })).summary).toBe(
    "2 pages."
  )
})
