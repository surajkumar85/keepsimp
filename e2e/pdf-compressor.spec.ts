import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import type { PDFDocument } from "@cantoo/pdf-lib"
import { similarity } from "../lib/image-compressor/ssim"
import { damage, makePlainPdf } from "../tests/pdf-fixtures"
import {
  chart,
  makeDrawnPdf,
  pictureText,
  readPictures,
  scene,
  storeRgb,
  type Drawn,
} from "../tests/pdf-pictures"
import { readPdf, texts } from "../tests/pdf-reader"
import { bytesOf, drawnPage, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-compressor/"
const tool = (page: Page) => page.getByTestId("pdf-compressor")
const level = (page: Page, name: string) =>
  page
    .getByRole("radiogroup", { name: "How much to compress" })
    .getByRole("radio", { name, exact: true })

/** One page that draws pictures stored without loss. */
const file = async (
  name: string,
  build: (doc: PDFDocument) => Drawn[],
  after?: Parameters<typeof makeDrawnPdf>[1]
): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeDrawnPdf(build, after)),
})

/** A photograph of 1200 by 900 pixels drawn 300 points wide: 288 dpi. */
const photo = (doc: PDFDocument, seed = 1): Drawn => ({
  ref: storeRgb(doc, scene(1200, 900, seed)),
  width: 300,
  height: 225,
})

async function add(page: Page, ...files: Upload[]) {
  await page.goto(ROUTE)
  await page.locator("#compress-file").setInputFiles(files)
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
}

async function compress(page: Page) {
  await page.getByRole("button", { name: "Compress PDF" }).click()
  await expect(tool(page)).toHaveAttribute("data-compressed", "true", {
    timeout: 120_000,
  })
}

async function download(page: Page) {
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download PDF" }).click()
  const got = await pending
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

test("shows what makes a file big, compresses it and gives a smaller file that reads the same", async ({
  page,
}) => {
  const upload = await file("Holiday photos.pdf", (doc) => [photo(doc)])
  await add(page, upload)
  const before = page.getByTestId("audit-before")
  await expect(before.getByTestId("audit-part").first()).toContainText(
    "Pictures"
  )
  await expect(before).toContainText("Page 1 · 1,200 × 900 pixels")
  await expect(page.getByTestId("plan")).toContainText("1 page")

  await compress(page)
  await expect(page.getByTestId("saving")).toHaveText(/^\d+% smaller$/)
  await expect(page.getByTestId("check")).toHaveAttribute("data-passed", "true")
  await expect(page.getByTestId("check")).toContainText(
    "Checked: 1 page looks the same before and after."
  )
  await expect(page.getByTestId("changes")).toContainText(
    "1 of 1 picture made smaller, 1 of them brought down to the size it is shown at."
  )
  // The page is drawn both ways, to be compared.
  await expect(page.getByTestId("compare")).toHaveAttribute(
    "data-drawn",
    "true",
    { timeout: 30_000 }
  )
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled()
  await expect(
    page.getByTestId("audit-after").getByText("625 × 469 pixels")
  ).toBeVisible()

  const got = await download(page)
  expect(got.name).toBe("Holiday photos-compressed.pdf")
  expect(got.bytes.length).toBeLessThan(upload.buffer.length / 4)
  expect(await texts(got.bytes)).toEqual([pictureText(1)])
  // 300 points at 150 dpi.
  const [picture] = await readPictures(got.bytes)
  expect(picture.width).toBe(625)
})

test("lossless changes no pixel, strong goes further, and a new level asks to compress again", async ({
  page,
}) => {
  const upload = await file("levels.pdf", (doc) => [
    photo(doc),
    { ref: storeRgb(doc, chart(800, 600)), width: 400, height: 300 },
  ])
  const original = await readPictures(new Uint8Array(upload.buffer))
  await add(page, upload)

  await level(page, "Lossless").click()
  await compress(page)
  const lossless = await download(page)
  const kept = await readPictures(lossless.bytes)
  expect(kept.map((picture) => picture.width)).toEqual([1200, 800])
  for (const [index, picture] of kept.entries())
    expect(similarity(original[index], picture).mean).toBe(1)

  await level(page, "Balanced").click()
  await expect(page.getByText("Not compressed at this level yet")).toBeVisible()
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0)
  await compress(page)
  const balanced = await download(page)
  // The earlier result is still there when its level is chosen again.
  await level(page, "Lossless").click()
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible()

  await level(page, "Strong").click()
  await compress(page)
  const strong = await download(page)
  expect(balanced.bytes.length).toBeLessThan(lossless.bytes.length / 2)
  expect(strong.bytes.length).toBeLessThan(balanced.bytes.length)
  const [small, drawing] = await readPictures(strong.bytes)
  // 300 points at 96 dpi; the drawing keeps every pixel, and every pixel's colour.
  expect(small.width).toBe(400)
  expect(similarity(original[1], drawing).mean).toBe(1)
})

test("a locked file asks for its password and stays locked", async ({
  page,
}) => {
  const upload = await file(
    "locked.pdf",
    (doc) => [photo(doc)],
    (doc) =>
      doc.encrypt({ userPassword: "open sesame", ownerPassword: "owner" })
  )
  await page.goto(ROUTE)
  await page.locator("#compress-file").setInputFiles(upload)
  const row = page.getByTestId("file-row")
  await expect(row).toHaveAttribute("data-status", "locked", {
    timeout: 60_000,
  })
  await expect(
    page.getByRole("button", { name: "Compress PDF" })
  ).toBeDisabled()
  await row.getByLabel("Password").fill("wrong")
  await row.getByRole("button", { name: "Unlock" }).click()
  await expect(row.getByRole("alert")).toContainText("did not open this file")
  await row.getByLabel("Password").fill("open sesame")
  await row.getByRole("button", { name: "Unlock" }).click()
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await expect(page.getByTestId("file-note")).toContainText(
    "The result keeps its password."
  )
  await compress(page)
  // Before and after can both be drawn, though the file is locked.
  await expect(page.getByTestId("compare")).toHaveAttribute(
    "data-drawn",
    "true",
    { timeout: 30_000 }
  )
  const got = await download(page)
  expect(got.bytes.length).toBeLessThan(upload.buffer.length / 4)
  await expect(texts(got.bytes)).rejects.toThrow()
  expect(await texts(got.bytes, "open sesame")).toEqual([pictureText(1)])
})

test("says so when a file is already small, and refuses what it cannot read", async ({
  page,
}) => {
  const words = Buffer.from(await makePlainPdf([{ body: "Only words" }]))
  await add(page, {
    name: "words.pdf",
    mimeType: "application/pdf",
    buffer: words,
  })
  await page.getByRole("button", { name: "Compress PDF" }).click()
  await expect(page.getByTestId("already-small")).toContainText(
    "already as small as this level can make it. Strong goes further."
  )
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0)
  await expect(page.getByTestId("compare")).toHaveCount(0)

  // A text file is refused; the file that is there stays.
  await page.locator("#compress-file").setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("just some notes"),
  })
  await expect(tool(page).getByRole("alert")).toContainText(
    "notes.pdf is not a PDF"
  )
  await expect(page.getByTestId("file-row")).toContainText("words.pdf")

  // A damaged file is repaired and says so; of several dropped at once, the first is taken.
  const broken = Buffer.from(damage(new Uint8Array(words), "table"))
  const transfer = await page.evaluateHandle(
    ([first, second]) => {
      const dropped = new DataTransfer()
      for (const [name, data] of [
        ["broken.pdf", first],
        ["second.pdf", second],
      ] as const)
        dropped.items.add(
          new File([new Uint8Array(data)], name, { type: "application/pdf" })
        )
      return dropped
    },
    [[...broken], [...words]]
  )
  await tool(page).dispatchEvent("drop", { dataTransfer: transfer })
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await expect(page.getByTestId("file-row")).toContainText("broken.pdf")
  await expect(page.getByTestId("file-note")).toContainText("repaired")
  await expect(tool(page).getByRole("alert")).toContainText(
    "One file at a time"
  )

  // What cannot be read at all says so in its row.
  await page.locator("#compress-file").setInputFiles({
    name: "cut.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"),
  })
  await expect(page.getByTestId("file-row")).toHaveAttribute(
    "data-status",
    "error",
    { timeout: 60_000 }
  )
  await expect(
    page.getByRole("button", { name: "Compress PDF" })
  ).toBeDisabled()
})

test("a compression can be stopped, the result read, and the file removed", async ({
  page,
}) => {
  // Enough pictures that the work takes a while.
  const upload = await file("album.pdf", (doc) =>
    Array.from({ length: 14 }, (_, index) => ({
      ref: storeRgb(doc, scene(1000, 750, index + 1)),
      width: 60,
      height: 45,
    }))
  )
  await add(page, upload)
  await page.getByRole("button", { name: "Compress PDF" }).click()
  await expect(page.getByTestId("compress-progress")).toBeVisible()
  // Pressed from inside the page: the work may be over within the second.
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Cancel")
      ?.click()
  )
  await expect(page.getByTestId("compress-progress")).toHaveCount(0, {
    timeout: 60_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-compressed", "true")
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0)

  await compress(page)
  await expect(page.getByTestId("changes")).toContainText(
    "14 of 14 pictures made smaller"
  )
  const opener = page.getByRole("button", { name: "Read the result" })
  await opener.click()
  await readerReady(page)
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  await expect(reader(page)).toContainText("album-compressed.pdf")
  await page.keyboard.press("Escape")
  await expect(reader(page)).toHaveCount(0)
  await expect(opener).toBeFocused()

  // The original opens in the reader from its picture.
  await page.getByRole("button", { name: "Read album.pdf" }).click()
  await readerReady(page)
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Remove album.pdf" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop a PDF to compress" })
  ).toBeVisible()
})

test("the sample shrinks by more than four fifths and its pages can be stepped through", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await expect(page.getByTestId("file-row")).toContainText("3 pages")
  await compress(page)
  const saved = Number.parseInt(
    await page.getByTestId("saving").innerText(),
    10
  )
  expect(saved).toBeGreaterThanOrEqual(80)
  const compare = page.getByTestId("compare")
  await expect(compare).toHaveAttribute("data-drawn", "true", {
    timeout: 30_000,
  })
  await page.getByRole("button", { name: "Next page" }).click()
  await expect(compare).toHaveAttribute("data-page", "2")
  await expect(compare).toHaveAttribute("data-drawn", "true", {
    timeout: 30_000,
  })
  // The divider answers to the keyboard.
  const slider = compare.getByRole("slider", { name: "Comparison position" })
  await slider.focus()
  await page.keyboard.press("ArrowRight")
  await expect(slider).toHaveValue("51")
  const got = await download(page)
  const read = await readPdf(got.bytes)
  expect(read.pages).toHaveLength(3)
  expect(read.info.Title).toBe("City guide")
})

test("stays accessible, local and responsive", async ({ page }) => {
  const external: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (url.origin !== "http://127.0.0.1:4173" ||
        !["GET", "HEAD"].includes(request.method()))
    )
      external.push(request.url())
  })
  const scan = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  expect((await scan()).violations).toEqual([])

  await page
    .locator("#compress-file")
    .setInputFiles(await file("check.pdf", (doc) => [photo(doc)]))
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  expect((await scan()).violations).toEqual([])
  await compress(page)
  await expect(page.getByTestId("compare")).toHaveAttribute(
    "data-drawn",
    "true",
    { timeout: 30_000 }
  )
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect((await scan()).violations, theme).toEqual([])
  }

  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Every control is large enough to press on a phone.
  const small = await tool(page).evaluate((element) =>
    [...element.querySelectorAll("button, input:not(.sr-only), a[href]")]
      .map((control) => ({
        name: control.getAttribute("aria-label") ?? control.textContent,
        box: control.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.height > 1 && box.height < 44)
      .map(({ name }) => name)
  )
  expect(small).toEqual([])
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the written help is there", async ({ page }) => {
  await page.goto(ROUTE)
  const help = page.getByRole("region", { name: "A little help along the way" })
  await expect(help.locator("#tutorial-steps > li")).toHaveCount(6)
  await help.getByText("Every option explained").click()
  await expect(help).toContainText("Pages are not turned into pictures.")
  await expect(help).toContainText("Nothing is uploaded")
})
