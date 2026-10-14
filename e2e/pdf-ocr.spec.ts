import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument } from "@cantoo/pdf-lib"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { SCAN_LINES, scannedPdf } from "../tests/pdf-scan"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const panel = (page: Page) => page.getByTestId("editor-ocr")
const said = (page: Page) => page.getByTestId("ocr-said")
const undo = (page: Page) => page.getByTestId("editor-undo")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })

async function scan(options: { turned?: boolean; copies?: number } = {}) {
  let bytes = await scannedPdf({ turned: options.turned })
  if (options.copies) {
    const doc = await PDFDocument.load(bytes)
    const pages = await doc.copyPages(
      doc,
      Array.from({ length: options.copies }, () => 0)
    )
    for (const page of pages) doc.addPage(page)
    bytes = await doc.save()
  }
  return {
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  } satisfies Upload
}

async function open(page: Page, file: Upload, route: string) {
  await page.goto(route)
  await page.locator("#editor-file").setInputFiles(file)
  await readerReady(page)
}

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 60_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

async function download(page: Page) {
  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  const bytes = await bytesOf(got)
  expect(await danglingRefs(bytes)).toEqual([])
  return (await readPdf(bytes)).pages.map((one) => one.text)
}

test("recognises the words of a scan on this device, and the download can be searched", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await open(page, await scan({ turned: true }), "/dashboard/ocr-pdf/")
  // The door opens with its panel.
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId("ocr-language")).toHaveText("English")
  await expect(page.getByTestId("ocr-toggle")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await panel(page)
    .getByRole("button", { name: "Recognise text on 2 pages" })
    .click()
  await expect(said(page)).toContainText(
    "Words were recognised on pages 1 and 2:",
    { timeout: 120_000 }
  )
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Recognise text on 2 pages"
  )
  // Read again, pages that have text now are left as they are.
  await panel(page)
    .getByRole("button", { name: "Recognise text on 2 pages" })
    .click()
  await expect(said(page)).toContainText(
    "Pages 1 and 2 already have text and were left as they are."
  )
  await changes(page, 1)
  // Only some pages, as typed.
  await panel(page).getByRole("textbox", { name: "Pages" }).fill("2")
  await expect(
    panel(page).getByRole("button", { name: "Recognise text on 1 page" })
  ).toBeVisible()
  await panel(page).getByRole("textbox", { name: "Pages" }).fill("4")
  await expect(panel(page).getByRole("alert")).toContainText("2 pages")

  const [upright, turned] = await download(page)
  await expect(page.getByTestId("editor-check")).toContainText(
    "every one was read back from the result"
  )
  for (const line of SCAN_LINES) {
    expect(upright).toContain(line.text)
    expect(turned).toContain(line.text)
  }
})

test("a recognised word is found by searching, and redacting it takes it out of the scan", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await open(page, await scan(), "/dashboard/pdf-editor/")
  await page.getByTestId("ocr-toggle").click()
  await panel(page)
    .getByRole("button", { name: "Recognise text on 1 page" })
    .click()
  await expect(said(page)).toContainText("Words were recognised on page 1", {
    timeout: 120_000,
  })
  await changes(page, 1)
  await pick(page, "Redact: take out for good").click()
  await reader(page)
    .getByLabel("Words to mark everywhere", { exact: true })
    .fill("Morgan")
  await pick(page, "Mark all").click()
  await changes(page, 2)
  await expect(page.getByTestId("editor-hint").first()).toContainText(
    "Marked 1 place on 1 page"
  )
  await page.getByTestId("redact-apply").click()
  await changes(page, 3)
  const [text] = await download(page)
  expect(text).not.toContain("Morgan")
  expect(text).toContain("delivery")
  expect(text).toContain(SCAN_LINES[2].text)
})

test("stays accessible, local and responsive, and stops when asked", async ({
  page,
}) => {
  test.setTimeout(180_000)
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
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page, await scan({ copies: 7 }), "/dashboard/ocr-pdf/")
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .include("[data-testid=editor-ocr]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  expect(await axe()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await axe()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await panel(page)
    .getByRole("button", { name: "Recognise text on 8 pages" })
    .click()
  const bar = panel(page).getByRole("progressbar", {
    name: "Recognising text",
  })
  await expect(bar).toBeVisible()
  await expect(panel(page).getByRole("status").first()).toContainText(
    "Reading page",
    { timeout: 60_000 }
  )
  await panel(page).getByRole("button", { name: "Stop" }).click()
  await expect(said(page)).toContainText("Stopped", { timeout: 60_000 })
  await expect(bar).toHaveCount(0)
  // What was read before stopping is one step, or nothing at all.
  const steps = Number(await tool(page).getAttribute("data-changes"))
  expect(steps).toBeLessThanOrEqual(1)
  // Another panel puts this one down.
  await page.getByTestId("document-toggle").click()
  await expect(panel(page)).toHaveCount(0)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the door's sample is a scan as it comes, and its words are read", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto("/dashboard/ocr-pdf/")
  await page.getByRole("button", { name: "Try a sample" }).click()
  await readerReady(page)
  await panel(page)
    .getByRole("button", { name: "Recognise text on 1 page" })
    .click()
  await expect(said(page)).toContainText("Words were recognised on page 1", {
    timeout: 120_000,
  })
  await changes(page, 1)
  const [text] = await download(page)
  expect(text).toContain("Rental agreement")
  expect(text).toContain("Harbour Street")
})
