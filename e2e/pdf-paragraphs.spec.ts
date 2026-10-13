import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  danglingRefs,
  embeddedFonts,
  linkBoxes,
  readPdf,
  textPlaces,
} from "../tests/pdf-reader"
import { makeParagraphPdf, PARAGRAPHS } from "../tests/pdf-text"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"
const SOFT = "­"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const first = (page: Page) =>
  page.locator('[data-testid=editor-layer][data-page="1"]')
/** A paragraph of the first page, by the words it begins with. */
const paragraph = (page: Page, start: string) =>
  first(page).getByRole("button", {
    name: new RegExp(`^Change the paragraph: ${start}`),
  })
const line = (page: Page, text: string) =>
  first(page).getByRole("button", {
    name: `Change the line: ${text}`,
    exact: true,
  })
const field = (page: Page) => page.getByTestId("editor-retext")
const hint = (page: Page) => page.getByTestId("editor-hint").first()
const squeezed = (text: string) => text.replace(/\s+/g, "")
const plain = (text: string) => text.replaceAll(SOFT, "")

async function open(page: Page) {
  const made = await makeParagraphPdf()
  const upload: Upload = {
    name: "terms.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(made.bytes),
  }
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  return made
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
  return bytesOf(got)
}

test("changes a paragraph as one, and its words flow again within its width", async ({
  page,
}) => {
  const { bytes: original } = await open(page)
  await pick(page, "Change text").click()
  await expect(hint(page)).toContainText("Click a paragraph or a line and type")
  // Lines that belong together are one place to click; an address and a heading are lines.
  await expect(first(page).getByTestId("editor-block")).toHaveCount(3)
  await expect(line(page, PARAGRAPHS.heading)).toBeVisible()
  for (const part of PARAGRAPHS.address)
    await expect(line(page, part)).toBeVisible()
  await expect(pick(page, "Paragraphs")).toHaveAttribute("aria-pressed", "true")

  await paragraph(page, "The lender agrees").click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue(PARAGRAPHS.ragged)
  const text = PARAGRAPHS.ragged.replace(
    "signed by both of them",
    "signed and dated by both of them in the presence of a witness"
  )
  await field(page).fill(text)
  // Enter is a new line in a paragraph; with Ctrl or ⌘ it puts the words into the file.
  await page.keyboard.press("Control+Enter")
  await changes(page, 1)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Change text"
  )
  // The page is read again: it is still one paragraph, and says the new words.
  await paragraph(page, "The lender agrees").click()
  await expect(field(page)).toHaveValue(text)
  await page.keyboard.press("Escape")
  await expect(field(page)).toHaveCount(0)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "The page's own text was changed in 1 place. The old words are no longer in the file, and all 3 lines you wrote were read back from the result."
  )
  expect(await danglingRefs(bytes)).toEqual([])
  const [read] = (await readPdf(bytes)).pages
  expect(squeezed(read.text)).toContain("inthepresenceofawitness")
  expect(squeezed(read.text)).not.toContain("signedbyboth")
  // The paragraph under it was not touched.
  expect(squeezed(read.text)).toContain(
    squeezed(
      plain(PARAGRAPHS.justified).replace("borrower will", "bor-rower will")
    )
  )
  // Written in the fonts the file had: none was added, and the bold words are still bold.
  expect(await embeddedFonts(bytes)).toEqual(await embeddedFonts(original))
  const [placed] = await textPlaces(bytes)
  const bold = placed.find((run) => run.text.includes("in full"))!
  const typed = placed.find((run) => run.text.includes("presence"))!
  expect(bold.font).not.toBe(typed.font)
  // The link over two of its words went a line down with them.
  const [was] = (await linkBoxes(original))[0]
  const [link] = (await linkBoxes(bytes))[0]
  expect(link.to).toBe(was.to)
  expect(link.y).toBeCloseTo(was.y + 13, 0)
})

test("sets a paragraph another way, makes it larger, and names the words it joined", async ({
  page,
}) => {
  const { lines } = await open(page)
  await page.keyboard.press("e")
  await paragraph(page, "Should the borrower").click()
  await expect(field(page)).toBeFocused()
  // A word the file broke at the end of a line is one word here, and the field says so.
  await expect(field(page)).toHaveValue(
    lines.justified
      .map((line) =>
        line.endsWith("-") ? `${line.slice(0, -1)}${SOFT}` : `${line} `
      )
      .join("")
      .trim()
  )
  await expect(
    reader(page).getByRole("status").filter({ hasText: "whole here" })
  ).toContainText("borrower")
  const both = pick(page, "Set the paragraph to both edges")
  const left = pick(page, "Set the paragraph to the left")
  await expect(both).toHaveAttribute("aria-pressed", "true")
  await left.click()
  await expect(left).toHaveAttribute("aria-pressed", "true")
  // Choosing in the bar does not take the keyboard from the paragraph.
  await expect(field(page)).toBeFocused()
  await reader(page).getByLabel("Size of the line").fill("9")
  await page.keyboard.press("Enter")
  await expect(field(page)).toBeFocused()
  await pick(page, "Done").click()
  await changes(page, 1)

  // It is set to the left now, which the bar shows when it is opened again.
  await paragraph(page, "Should the borrower").click()
  await expect(left).toHaveAttribute("aria-pressed", "true")
  await expect(reader(page).getByLabel("Size of the line")).toHaveValue("9")
  await page.keyboard.press("Escape")

  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  const [placed] = await textPlaces(bytes)
  const run = placed.find((one) => one.text.includes("Should"))!
  expect(run.size).toBeCloseTo(9, 1)
  expect(squeezed((await readPdf(bytes)).pages[0].text)).toContain(
    "wholeofwhatisstillowed"
  )
})

test("does not let a paragraph run over what is below it, and says how much room there is", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("e")
  await paragraph(page, "The lender agrees").click()
  const more = " Nothing in this paper takes away a right that the law gives."
  await field(page).fill(PARAGRAPHS.ragged + more.repeat(3))
  await pick(page, "Done").click()
  await expect(reader(page).getByRole("alert")).toContainText(
    "This paragraph now needs 7 lines, and there is room for 6 before it would run over what is below. Make it shorter, or its letters smaller. Nothing was changed."
  )
  await changes(page, 0)
  // The paragraph is as it was, and two sentences more have room.
  await paragraph(page, "The lender agrees").click()
  await expect(field(page)).toHaveValue(PARAGRAPHS.ragged)
  await field(page).fill(PARAGRAPHS.ragged + more.repeat(2))
  await pick(page, "Done").click()
  await changes(page, 1)
  await expect(reader(page).getByRole("alert")).toHaveCount(0)
})

test("offers every line by itself when paragraphs are switched off, and takes out and moves with the keyboard", async ({
  page,
}) => {
  const { lines } = await open(page)
  await page.keyboard.press("e")
  await expect(first(page).getByTestId("editor-block")).toHaveCount(3)
  await pick(page, "Paragraphs").click()
  await expect(pick(page, "Paragraphs")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await expect(hint(page)).toContainText("Click a line to change its words")
  await expect(first(page).getByTestId("editor-block")).toHaveCount(0)
  // A line of the paragraph is changed as a line: the lines around it stay.
  await line(page, lines.ragged[1]).click()
  await expect(field(page)).toHaveValue(lines.ragged[1])
  await page.keyboard.press("Escape")

  await pick(page, "Paragraphs").click()
  const centred = paragraph(page, "Signed in London")
  await centred.focus()
  // The arrow keys move a paragraph, lines and all; Delete takes it out; both are undone.
  await page.keyboard.press("Shift+ArrowDown")
  await changes(page, 1)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Move text"
  )
  await paragraph(page, "Signed in London").focus()
  await page.keyboard.press("Delete")
  await changes(page, 2)
  await expect(paragraph(page, "Signed in London")).toHaveCount(0)
  await expect(first(page).getByTestId("editor-block")).toHaveCount(2)
  await page.getByTestId("editor-undo").click()
  await changes(page, 1)
  await expect(paragraph(page, "Signed in London")).toBeVisible()
})

test("keeps the columns of a page apart", async ({ page }) => {
  const { lines } = await open(page)
  await page.keyboard.press("e")
  await page.getByLabel("Page", { exact: true }).fill("2")
  await page.getByLabel("Page", { exact: true }).press("Enter")
  const second = page.locator('[data-testid=editor-layer][data-page="2"]')
  const left = second.getByRole("button", {
    name: /^Change the paragraph: The left column/,
  })
  await expect(second.getByTestId("editor-block")).toHaveCount(2)
  await left.click()
  await field(page).fill(
    PARAGRAPHS.left.replace("running text", "a long run of text")
  )
  await page.keyboard.press("Control+Enter")
  await changes(page, 1)
  const bytes = await saved(page, page.getByTestId("editor-download"))
  const text = squeezed((await readPdf(bytes)).pages[1].text)
  expect(text).toContain("alongrunoftext")
  for (const one of lines.right) expect(text).toContain(squeezed(one))
})

test("stays accessible, local and responsive while a paragraph is changed", async ({
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
  await pick(page, "Change text").click()
  await expect(first(page).getByTestId("editor-block")).toHaveCount(3)
  expect(await scan()).toEqual([])
  await paragraph(page, "Should the borrower").click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveAccessibleName("The words of this paragraph")
  expect(await scan()).toEqual([])
  await page.keyboard.press("Escape")
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
