import { readFileSync } from "node:fs"
import { expect, test, type Page } from "@playwright/test"
import { makeParagraphPdf, PARAGRAPHS } from "@/tests/pdf-text"
import sharp from "sharp"
import {
  chart,
  makeDrawnPdf,
  paintedPictures,
  scene,
  storeRgb,
} from "@/tests/pdf-pictures"
import { danglingRefs, embeddedFonts, readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, saved } from "./agent"

const give = async (page: Page, name: string, bytes: Uint8Array) =>
  hand(page, name, Buffer.from(bytes), "application/pdf")
const bytesOf = async (page: Page, done: { files?: { id: string }[] }) =>
  new Uint8Array((await saved(page, done.files![0].id)).bytes)
const flat = (text: string) => text.replace(/\s+/g, " ")

type Listed = {
  pages: {
    page: number
    text: { id: string; kind: string; text: string }[]
    pictures: {
      id: string
      box: { x: number; y: number; width: number; height: number }
    }[]
    links: { id: string; to: string | null }[]
  }[]
}

test("changes a page's own lines and paragraphs, in their own fonts or one of your own", async ({
  page,
}) => {
  await ready(page)
  const { bytes } = await makeParagraphPdf()
  const doc = await give(page, "loan.pdf", bytes)
  const read = await ran(page, "read_pdf_page_content", {
    file: doc,
    pages: "1",
  })
  const texts = (read.data as unknown as Listed).pages[0].text
  const heading = texts.find((one) => one.text === PARAGRAPHS.heading)!
  expect(heading.kind).toBe("line")
  const ragged = texts.find((one) => one.text.startsWith("The lender agrees"))!
  expect(ragged.kind).toBe("paragraph")
  const address = texts.find((one) => one.text === PARAGRAPHS.address[0])!

  const changed = await ran(page, "edit_pdf_text", {
    file: doc,
    changes: [
      { id: heading.id, text: "Terms of the new loan", size: 18 },
      {
        id: ragged.id,
        text: ragged.text.replace("twelve months", "six months"),
      },
      { id: address.id, delete: true },
    ],
  })
  expect(changed.summary).toMatch(
    /^2 lines or paragraphs changed, 1 taken out, each read back/
  )
  const result = await bytesOf(page, changed)
  const words = flat((await readPdf(result)).pages[0].text)
  expect(words).toContain("Terms of the new loan")
  expect(words).toContain("six months")
  expect(words).not.toContain("twelve months")
  expect(words).not.toContain(PARAGRAPHS.address[0])
  // What was not changed is as it was.
  expect(words).toContain("Witnessed by Charles Babbage")
  expect(await danglingRefs(result)).toEqual([])

  // A line set in a font file of one's own, embedded with the letters it uses.
  const kalam = await hand(
    page,
    "Kalam.ttf",
    readFileSync("public/fonts/editor/Kalam-Regular.ttf"),
    "font/ttf"
  )
  const own = await ran(page, "edit_pdf_text", {
    file: doc,
    fontFile: kalam,
    changes: [{ id: heading.id, font: "own" }],
  })
  expect(own.summary).toMatch(/Set in Kalam/)
  const ownBytes = await bytesOf(page, own)
  expect(
    (await embeddedFonts(ownBytes)).some((font) => /Kalam/.test(font.name))
  ).toBe(true)
  expect(flat((await readPdf(ownBytes)).pages[0].text)).toContain(
    PARAGRAPHS.heading
  )
})

test("moves, cuts, replaces and takes out the pictures a page draws, read back by pdf.js", async ({
  page,
}) => {
  await ready(page)
  const bytes = await makeDrawnPdf((doc) => [
    { ref: storeRgb(doc, scene(200, 120)), width: 240, height: 144 },
    { ref: storeRgb(doc, chart(100, 100)), width: 100, height: 100 },
  ])
  const doc = await give(page, "pictures.pdf", bytes)
  const before = (await paintedPictures(bytes))[0]
  const read = await ran(page, "read_pdf_page_content", { file: doc })
  const pictures = (read.data as unknown as Listed).pages[0].pictures
  expect(pictures).toHaveLength(2)
  expect(pictures[0].box.width).toBeCloseTo(before[0].width, 0)

  const moved = await ran(page, "edit_pdf_pictures", {
    file: doc,
    changes: [
      { id: pictures[0].id, dx: 50, dy: 20 },
      { id: pictures[1].id, cut: { left: 0.5 } },
    ],
  })
  expect(moved.summary).toMatch(/still whole in the file/)
  const after = (await paintedPictures(await bytesOf(page, moved)))[0]
  expect(after[0].x).toBeCloseTo(before[0].x + 50, 0)
  expect(after[0].y).toBeCloseTo(before[0].y + 20, 0)
  expect(after[1].clipped).toBe(true)

  // Another picture in the first one's place, and the second taken out.
  const png = await sharp({
    create: {
      width: 100,
      height: 50,
      channels: 3,
      background: { r: 0, g: 120, b: 111 },
    },
  })
    .png()
    .toBuffer()
  const replacement = await hand(page, "new.png", png, "image/png")
  const swapped = await ran(page, "edit_pdf_pictures", {
    file: doc,
    changes: [
      { id: pictures[0].id, replace: replacement },
      { id: pictures[1].id, delete: true },
    ],
  })
  const swappedBytes = await bytesOf(page, swapped)
  const now = (await paintedPictures(swappedBytes))[0]
  expect(now).toHaveLength(1)
  expect(now[0].dots).toEqual({ width: 100, height: 50 })
  expect(await danglingRefs(swappedBytes)).toEqual([])
  expect(flat((await readPdf(swappedBytes)).pages[0].text)).toContain(
    "pictures-P1"
  )
})

test("adds, leads elsewhere and takes away links, which pdf.js then reads", async ({
  page,
}) => {
  await ready(page)
  const { bytes } = await makeParagraphPdf()
  const doc = await give(page, "loan.pdf", bytes)
  const read = await ran(page, "read_pdf_page_content", {
    file: doc,
    pages: "1",
  })
  const links = (read.data as unknown as Listed).pages[0].links
  expect(links.length).toBeGreaterThan(0)
  const before = (await readPdf(bytes)).pages[0].links.length

  const added = await ran(page, "edit_pdf_links", {
    file: doc,
    changes: [
      { id: links[0].id, to: "page 2" },
      {
        page: 1,
        x: 40,
        y: 20,
        width: 120,
        height: 20,
        to: "https://example.org/help",
      },
      { page: 1, x: 40, y: 50, width: 120, height: 20, to: "help@example.org" },
    ],
  })
  expect(added.summary).toMatch(
    /^2 links added, 1 link changed\. Each was read back; where an address leads is not checked\./
  )
  const addedBytes = await bytesOf(page, added)
  const found = (await readPdf(addedBytes)).pages[0].links
  expect(found).toHaveLength(before + 2)
  expect(found).toEqual(
    expect.arrayContaining([
      2,
      "https://example.org/help",
      "mailto:help@example.org",
    ])
  )

  const again = await give(page, "linked.pdf", addedBytes)
  const listed = (
    (await ran(page, "read_pdf_page_content", { file: again, pages: "1" }))
      .data as unknown as Listed
  ).pages[0].links
  const made = listed.filter((link) =>
    /example\.org\/help|mailto/.test(link.to ?? "")
  )
  expect(made).toHaveLength(2)
  const removed = await ran(page, "edit_pdf_links", {
    file: again,
    changes: made.map((link) => ({ id: link.id, delete: true })),
  })
  expect(removed.summary).toMatch(/^2 links taken away\./)
  const left = (await readPdf(await bytesOf(page, removed))).pages[0].links
  expect(left).toHaveLength(before)
  expect(left).toContain(2)
})
