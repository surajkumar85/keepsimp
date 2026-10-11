import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import { PDFName, type PDFDocument } from "@cantoo/pdf-lib"
import { similarity } from "../lib/image-compressor/ssim"
import { damage, makePlainPdf } from "../tests/pdf-fixtures"
import {
  chart,
  makeDrawnPdf,
  pictureText,
  readPictures,
  scannedPage,
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
  // Several compressions in a row, on a machine that may be busy.
  test.setTimeout(120_000)
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
  await expect(page.getByText("Not compressed this way yet")).toBeVisible()
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

  // What is not a PDF is refused; the file that is there stays.
  await page.locator("#compress-file").setInputFiles({
    name: "holiday.mov",
    mimeType: "application/pdf",
    buffer: Buffer.from("just some notes"),
  })
  await expect(tool(page).getByRole("alert")).toContainText(
    "holiday.mov is not a PDF."
  )
  await expect(page.getByTestId("file-row")).toHaveCount(1)

  // A damaged file is repaired and says so.
  await page.locator("#compress-file").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(damage(new Uint8Array(words), "table")),
  })
  const broken = page.getByTestId("file-row").filter({ hasText: "broken.pdf" })
  await expect(broken).toHaveAttribute("data-status", "ready", {
    timeout: 60_000,
  })
  await expect(broken.getByTestId("file-note")).toContainText("repaired")

  // What cannot be read at all says so in its row, and is left out.
  await page.locator("#compress-file").setInputFiles({
    name: "cut.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"),
  })
  const cut = page.getByTestId("file-row").filter({ hasText: "cut.pdf" })
  await expect(cut).toHaveAttribute("data-status", "error", {
    timeout: 60_000,
  })
  await expect(cut.getByRole("alert")).toContainText("It is left out.")
  await expect(page.getByRole("button", { name: "Compress PDF" })).toBeEnabled()
})

test("comes out under a size, and says so honestly when it cannot", async ({
  page,
}) => {
  // Several compressions in a row, on a machine that may be busy.
  test.setTimeout(120_000)
  const upload = await file("form.pdf", (doc) =>
    Array.from({ length: 6 }, (_, index) => ({
      ref: storeRgb(doc, scene(900, 600, index + 1)),
      width: 240,
      height: 160,
    }))
  )
  await add(page, upload)
  await level(page, "To a size").click()
  const sizes = page.getByRole("radiogroup", { name: "Come out under" })
  await sizes.getByRole("radio", { name: "100 KB" }).click()
  await compress(page)
  const fits = page.getByTestId("target")
  await expect(fits).toHaveAttribute("data-met", "true")
  await expect(fits).toContainText(/Fits: [\d.]+ KB is under 100\.0 KB\./)
  const roomy = await download(page)
  expect(roomy.bytes.length).toBeLessThanOrEqual(100 * 1024)
  // Most of the room is used: no more is lost than the size takes.
  expect(roomy.bytes.length).toBeGreaterThan(50 * 1024)
  expect(await texts(roomy.bytes)).toEqual([pictureText(1)])
  expect(await readPictures(roomy.bytes)).toHaveLength(6)

  // What is typed has to be a size.
  await sizes.getByRole("radio", { name: "Another size" }).click()
  const typed = page.getByLabel("Size", { exact: true })
  await typed.fill("small")
  await expect(tool(page).getByRole("alert")).toContainText("Type a size")
  await expect(
    page.getByRole("button", { name: "Compress PDF" })
  ).toBeDisabled()

  // A size it cannot reach while pictures stay easy to read.
  await typed.fill("12")
  await compress(page)
  const missed = page.getByTestId("target")
  await expect(missed).toHaveAttribute("data-met", "false")
  await expect(missed).toContainText(
    "Could not get under 12.0 KB. This is the smallest that is still easy to read"
  )
  await expect(missed).toContainText("Go further")
  const readable = await download(page)
  expect(readable.bytes.length).toBeGreaterThan(12 * 1024)

  await page.getByRole("switch", { name: "Go further if it takes it" }).click()
  await compress(page)
  const further = await download(page)
  expect(further.bytes.length).toBeLessThan(readable.bytes.length)
  expect(await texts(further.bytes)).toEqual([pictureText(1)])
})

test("rebuilds scanned pages as text over paper, or in black and white", async ({
  page,
}) => {
  // Several compressions in a row, on a machine that may be busy.
  test.setTimeout(120_000)
  // One page that is a scan from edge to edge, at 150 dpi.
  const upload = await file(
    "scan.pdf",
    () => [],
    (doc, sheet) => {
      sheet.node
        .Resources()!
        .set(
          PDFName.of("XObject"),
          doc.context.obj({ Scan: storeRgb(doc, scannedPage(1240, 1754)) })
        )
      sheet.node.addContentStream(
        doc.context.register(
          doc.context.stream("q 595 0 0 842 0 0 cm /Scan Do Q")
        )
      )
    }
  )
  await add(page, upload)
  const scans = page.getByRole("radiogroup", { name: "Scanned pages" })
  await expect(scans.getByRole("radio", { name: "As they are" })).toBeChecked()

  await scans.getByRole("radio", { name: "Text and paper" }).click()
  await compress(page)
  await expect(page.getByTestId("changes")).toContainText(
    "1 scanned page rebuilt as sharp letters over soft paper."
  )
  await expect(page.getByTestId("check")).toHaveAttribute("data-passed", "true")
  await expect(page.getByTestId("compare")).toHaveAttribute(
    "data-drawn",
    "true",
    { timeout: 30_000 }
  )
  const layers = await download(page)
  expect(layers.bytes.length).toBeLessThan(60 * 1024)
  expect(await texts(layers.bytes)).toEqual([pictureText(1)])
  // The paper and the ink are pictures of their own now.
  expect(await readPictures(layers.bytes)).toHaveLength(2)

  await scans.getByRole("radio", { name: "Black and white" }).click()
  await compress(page)
  await expect(page.getByTestId("changes")).toContainText(
    "1 scanned page turned black and white."
  )
  const mono = await download(page)
  expect(mono.bytes.length).toBeLessThan(layers.bytes.length)
  const [copy] = await readPictures(mono.bytes)
  expect(copy.width).toBe(1240)
  for (let at = 0; at < copy.data.length; at += 4 * 997)
    expect([0, 255]).toContain(copy.data[at])

  // Where nothing may be lost, scans are not offered a choice.
  await level(page, "Lossless").click()
  await expect(scans).toHaveCount(0)
})

test("compresses several files at once and hands them over as one ZIP", async ({
  page,
}) => {
  // Several compressions in a row, on a machine that may be busy.
  test.setTimeout(120_000)
  const words = Buffer.from(await makePlainPdf([{ body: "Only words" }]))
  await page.goto(ROUTE)
  await page.locator("#compress-file").setInputFiles([
    await file("photos.pdf", (doc) => [photo(doc)]),
    { name: "words.pdf", mimeType: "application/pdf", buffer: words },
    await file("more photos.pdf", (doc) => [photo(doc, 2), photo(doc, 3)]),
    {
      name: "cut.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"),
    },
  ])
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  const row = (name: string) =>
    page.getByTestId("file-row").filter({ hasText: name })
  await expect(page.getByTestId("file-row")).toHaveCount(4)
  await expect(row("cut.pdf")).toHaveAttribute("data-status", "error")
  await expect(row("photos.pdf").first()).toHaveAttribute("data-shown", "true")

  // One file that cannot be read does not stop the others.
  await page.getByRole("button", { name: "Compress 3 files" }).click()
  await expect(tool(page)).toHaveAttribute("data-compressed", "true", {
    timeout: 120_000,
  })
  await expect(page.getByTestId("batch-saving")).toHaveText(/^\d+% smaller$/)
  await expect(page.getByTestId("batch")).toContainText("3 files")
  await expect(row("words.pdf").getByTestId("file-result")).toHaveText(
    "Already small: left as it is"
  )
  await expect(row("more photos.pdf").getByTestId("file-result")).toContainText(
    "% smaller"
  )

  // Another file's details are a press away.
  await page
    .getByRole("button", { name: "Show the details of more photos.pdf" })
    .click()
  await expect(row("more photos.pdf")).toHaveAttribute("data-shown", "true")
  await expect(page.getByTestId("audit-before")).toContainText(
    "What makes more photos.pdf big"
  )
  await expect(page.getByTestId("compare")).toHaveAttribute(
    "data-drawn",
    "true",
    { timeout: 30_000 }
  )
  await page
    .getByRole("button", { name: "Show the details of words.pdf" })
    .click()
  await expect(page.getByTestId("already-small")).toContainText("words.pdf")

  // Each compressed file can be had from its row.
  const one = page.waitForEvent("download")
  await page
    .getByRole("link", { name: "Download photos-compressed.pdf", exact: true })
    .click()
  expect((await one).suggestedFilename()).toBe("photos-compressed.pdf")

  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (.zip)" }).click()
  const got = await pending
  expect(got.suggestedFilename()).toBe("compressed-pdfs.zip")
  const files = unzipSync(await bytesOf(got))
  // The file that could not be made smaller is in the ZIP as it was.
  expect(Object.keys(files).sort()).toEqual([
    "more photos-compressed.pdf",
    "photos-compressed.pdf",
    "words.pdf",
  ])
  expect(Buffer.from(files["words.pdf"]).equals(words)).toBe(true)
  expect(await readPictures(files["more photos-compressed.pdf"])).toHaveLength(
    2
  )
  expect(await texts(files["photos-compressed.pdf"])).toEqual([pictureText(1)])

  // A file added afterwards is the only one left to compress.
  await page
    .locator("#compress-file")
    .setInputFiles(await file("late.pdf", (doc) => [photo(doc, 4)]))
  await expect(page.getByRole("button", { name: "Compress PDF" })).toBeEnabled({
    timeout: 60_000,
  })
  await expect(page.getByTestId("plan")).toHaveText("1 file to compress")

  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to compress" })
  ).toBeVisible()
})

test("a compression can be stopped, the result read, and the file removed", async ({
  page,
}) => {
  // Several compressions in a row, on a machine that may be busy.
  test.setTimeout(120_000)
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
    page.getByRole("heading", { name: "Drop PDFs to compress" })
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
  // The size options are checked too, then put away again.
  await level(page, "To a size").click()
  await page
    .getByRole("radiogroup", { name: "Come out under" })
    .getByRole("radio", { name: "Another size" })
    .click()
  expect((await scan()).violations).toEqual([])
  await level(page, "Balanced").click()
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
