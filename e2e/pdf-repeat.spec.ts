import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import { danglingRefs, readPdf, textPlaces } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"
/** Every page of the files made here, in points. */
const WIDE = 400
const TALL = 600

const tool = (page: Page) => page.getByTestId("pdf-editor")
const panel = (page: Page) => page.getByTestId("editor-repeat")
const undo = (page: Page) => page.getByTestId("editor-undo")
const layer = (page: Page, number = 1) =>
  page.locator(`[data-testid=editor-layer][data-page="${number}"]`)
const kind = (page: Page, name: string) =>
  panel(page).getByRole("radio", { name, exact: true })
const add = (page: Page, count: number) =>
  panel(page).getByRole("button", {
    name: count === 1 ? "Add to 1 page" : `Add to ${count} pages`,
    exact: true,
  })

async function open(page: Page) {
  await page.goto(ROUTE)
  await page
    .locator("#editor-file")
    .setInputFiles(
      await pdf("plan.pdf", "rp", { pages: 3, size: () => [WIDE, TALL] })
    )
  await readerReady(page)
  await expect(layer(page)).toBeVisible()
  await reader(page)
    .getByRole("button", { name: "Numbers and watermarks", exact: true })
    .click()
  await expect(panel(page)).toBeVisible()
}

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  const bytes = await bytesOf(got)
  expect(await danglingRefs(bytes)).toEqual([])
  return { bytes, read: await readPdf(bytes) }
}

test("numbers the pages, writes a header on some of them, and numbers that run on", async ({
  page,
}) => {
  await open(page)
  // Page numbers at the foot of every page, as they are usually wanted.
  await expect(kind(page, "Page numbers")).toBeChecked()
  await panel(page).getByLabel("Written as").selectOption("page-of")
  await add(page, 3).click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Write on 3 pages"
  )
  await expect(page.getByTestId("repeat-said")).toContainText(
    "Added to 3 pages. Each is a thing of its own"
  )
  await expect(layer(page)).toHaveAttribute("data-objects", "1")

  // A header with the file's name, from the second page on.
  await kind(page, "Header or footer").click()
  // Nothing is typed yet: there is nothing to add.
  await expect(panel(page).getByRole("alert")).toHaveText(
    "Type what is to be written."
  )
  await panel(page).getByLabel("Words").fill("{name}, sheet {page}")
  await panel(page).getByLabel("Place").selectOption("top-right")
  // A page the file does not have is said, and nothing can be added.
  await panel(page).getByLabel("Pages").fill("2-9")
  await expect(panel(page).getByRole("alert")).toContainText(
    "This file has 3 pages"
  )
  await expect(
    panel(page).getByRole("button", { name: /^Add to/ })
  ).toBeDisabled()
  await panel(page).getByLabel("Pages").fill("2-")
  await add(page, 2).click()
  await changes(page, 2)
  await expect(layer(page)).toHaveAttribute("data-objects", "1")
  await expect(layer(page, 2)).toHaveAttribute("data-objects", "2")

  // Numbers that run on from 98, five figures each, on every page.
  await kind(page, "Bates numbers").click()
  await panel(page).getByLabel("Before the number").fill("ACME-")
  await panel(page).getByLabel("First number").fill("98")
  await panel(page).getByLabel("Figures").fill("5")
  await panel(page).getByLabel("Place").selectOption("bottom-left")
  await panel(page).getByLabel("Pages").fill("")
  await add(page, 3).click()
  await changes(page, 3)

  const got = await saved(page, page.getByTestId("editor-download"))
  const texts = got.read.pages.map((one) => one.text)
  expect(texts[0]).toContain("Page 1 of 3")
  expect(texts[1]).toContain("Page 2 of 3")
  expect(texts[2]).toContain("Page 3 of 3")
  expect(texts[0]).not.toContain("plan.pdf")
  // The header counts the pages it is on: the second page is its first.
  expect(texts[1]).toContain("plan.pdf, sheet 1")
  expect(texts[2]).toContain("plan.pdf, sheet 2")
  expect(texts[0]).toContain("ACME-00098")
  expect(texts[2]).toContain("ACME-00100")
  // Where they lie: the number at the foot about the middle, the header at the top to the right, the running number at the foot to the left.
  const [first, second] = await textPlaces(got.bytes)
  const number = first.find((run) => run.text === "Page 1 of 3")!
  // Counted down from the top of the page.
  expect(number.y).toBeGreaterThan(TALL - 60)
  expect(number.x).toBeGreaterThan(WIDE / 2 - 60)
  expect(number.x).toBeLessThan(WIDE / 2)
  const header = second.find((run) => run.text.startsWith("plan.pdf"))!
  expect(header.y).toBeLessThan(60)
  expect(header.x).toBeGreaterThan(WIDE / 2)
  const bates = first.find((run) => run.text === "ACME-00098")!
  expect(bates.y).toBeGreaterThan(TALL - 60)
  expect(bates.x).toBeLessThan(40)
  await expect(page.getByTestId("editor-check")).toContainText(
    "All 8 pieces of text you added were read back from the result."
  )
})

test("lays a watermark of words or of a picture over the pages, and undoes it in one step", async ({
  page,
}) => {
  await open(page)
  await kind(page, "Watermark").click()
  await expect(panel(page).getByLabel("Words")).toHaveValue("DRAFT")
  await panel(page).getByLabel("Words").fill("Not for sale")
  await panel(page).getByRole("button", { name: "Colour: Red" }).click()
  await panel(page).getByLabel("Pages").fill("odd")
  await add(page, 2).click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Add a watermark to 2 pages"
  )
  await expect(layer(page)).toHaveAttribute("data-objects", "1")
  await expect(layer(page, 2)).toHaveAttribute("data-objects", "0")
  // One undo takes it off every page.
  await undo(page).click()
  await changes(page, 0)
  await expect(layer(page)).toHaveAttribute("data-objects", "0")
  await page.getByTestId("editor-redo").click()
  await changes(page, 1)

  // A picture instead of words, on the second page.
  const logo = await sharp({
    create: { width: 200, height: 80, channels: 3, background: "#2255aa" },
  })
    .png()
    .toBuffer()
  await panel(page)
    .getByLabel("A picture for the watermark")
    .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo })
  await expect(panel(page)).toContainText("logo.png")
  await panel(page).getByLabel("Pages").fill("2")
  await add(page, 1).click()
  await changes(page, 2)
  await expect(layer(page, 2)).toHaveAttribute("data-objects", "1")

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.read.pages[0].text).toContain("Not for sale")
  expect(got.read.pages[1].text).not.toContain("Not for sale")
  expect(got.read.pages[2].text).toContain("Not for sale")
  expect(got.read.pages.map((one) => one.pictures)).toEqual([0, 1, 0])
  // The page's own words are still there under it.
  expect(got.read.pages[0].text).toContain("rp-P1")
})

test("stays accessible, local and responsive while numbers and watermarks are set", async ({
  page,
}) => {
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
  const scan = async () =>
    (
      await new AxeBuilder({ page })
        .include("[role=dialog]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page)
  expect(await scan()).toEqual([])
  for (const name of ["Header or footer", "Bates numbers", "Watermark"]) {
    await kind(page, name).click()
    await page.waitForTimeout(300)
    expect(await scan()).toEqual([])
  }
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(panel(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // The list of pages takes the panel's place, and the panel takes it back.
  await page.getByTestId("pages-toggle").click()
  await expect(panel(page)).toHaveCount(0)
  await page.getByTestId("repeat-toggle").click()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId("editor-pages")).toHaveCount(0)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
