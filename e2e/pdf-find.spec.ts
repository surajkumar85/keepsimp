import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { makeParagraphPdf } from "../tests/pdf-text"
import { bytesOf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const words = (page: Page) => reader(page).getByLabel("Find", { exact: true })
const other = (page: Page) => reader(page).getByLabel("Replace with")
const status = (page: Page) => page.getByTestId("editor-find-status")
const marks = (page: Page) => page.getByTestId("editor-found")
const undo = (page: Page) => page.getByTestId("editor-undo")
const squeezed = (text: string) => text.replace(/\s+/g, "")

/** Two pages of running text: paragraphs, an address, and two columns on the second page. */
async function open(page: Page) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles({
    name: "terms.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from((await makeParagraphPdf()).bytes),
  })
  await readerReady(page)
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
  return (await readPdf(bytes)).pages.map((one) => squeezed(one.text))
}

test("finds words through the file, shows each place with what it will say, and replaces one", async ({
  page,
}) => {
  await open(page)
  await pick(page, "Find and replace").click()
  await expect(pick(page, "Find and replace")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(words(page)).toBeFocused()
  await expect(status(page)).toContainText("Type what to look for")
  // Nothing can be replaced before something was found.
  await expect(pick(page, "Replace")).toBeDisabled()
  await expect(pick(page, "Replace all")).toBeDisabled()

  await page.keyboard.type("borrower")
  await page.keyboard.press("Enter")
  // Three places: one in the first paragraph, two in the second, one of them broken over a line end.
  await expect(status(page)).toContainText("1 of 3 places on 1 page")
  await expect(status(page)).toContainText("named above to the borrower")
  await expect(marks(page).first()).toBeVisible()
  await expect(
    page.locator("[data-testid=editor-found][data-current=true]")
  ).toHaveCount(4)

  // Enter goes on to the next place; after the last comes the first.
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("2 of 3 places")
  await page.keyboard.press("Shift+Enter")
  await expect(status(page)).toContainText("1 of 3 places")
  await pick(page, "The place before").click()
  await expect(status(page)).toContainText("3 of 3 places")
  await pick(page, "The next place").click()
  await expect(status(page)).toContainText("1 of 3 places")

  // What it will say is shown before it is changed.
  await other(page).fill("debtor")
  await expect(status(page).locator("del")).toHaveText("borrower")
  await expect(status(page).locator("ins")).toHaveText("debtor")
  await pick(page, "Replace").click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Replace text")
  // The file was looked through again: two places are left, and the next is shown.
  await expect(status(page)).toContainText("1 of 2 places on 1 page")
  await expect(status(page)).toContainText("Should the")

  const [first] = await saved(page, page.getByTestId("editor-download"))
  expect(first).toContain("tothedebtor,whoagrees")
  expect(first).toContain("Shouldtheborrowerfail")
})

test("replaces every place as one step, and says what could not be changed", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("f")
  await words(page).fill("the")
  await pick(page, "Whole words only").click()
  await expect(pick(page, "Whole words only")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  // Another way of looking is looked with at once.
  await expect(status(page)).toContainText(/1 of \d+ places on 2 pages/)
  // Words so long that the second paragraph would run over what is below it.
  await other(page).fill("the aforementioned and hereinafter described")
  await pick(page, "Replace all").click()
  await changes(page, 1)
  await expect(status(page)).toContainText(/\d+ of \d+ places were changed\./)
  await expect(status(page)).toContainText(
    /left as (it was|they were): (This paragraph now needs|The paragraph would lie over)/
  )
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Replace text")
  // One step: undone, every place is as it was.
  await undo(page).click()
  await changes(page, 0)

  // A change that fits everywhere is said plainly.
  await words(page).fill("lender")
  await other(page).fill("bank")
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("1 of 2 places on 1 page")
  await pick(page, "Replace all").click()
  await changes(page, 1)
  await expect(status(page)).toContainText(
    "2 places were changed, as one step."
  )
  const [first] = await saved(page, page.getByTestId("editor-download"))
  expect(first).not.toContain("lender")
  expect(first.split("bank")).toHaveLength(3)
})

test("tells capitals apart when asked, finds words across a line break, and goes to the page they are on", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("f")
  await words(page).fill("The")
  await pick(page, "Tell capitals from small letters").click()
  await expect(status(page)).toContainText("1 of 3 places on 2 pages")
  // Words that a line break parts are found in the paragraph.
  await words(page).fill("day on which")
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("1 of 1 place on 1 page")
  // Words that are only on the second page: the reader goes there.
  await words(page).fill("right column")
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("1 of 1 place on 1 page")
  await expect(
    page
      .locator('[data-testid=editor-layer][data-page="2"]')
      .getByTestId("editor-found")
      .first()
  ).toBeVisible()
  await expect(page.getByLabel("Page", { exact: true })).toHaveValue("2")
  await words(page).fill("nowhere to be seen")
  await page.keyboard.press("Enter")
  await expect(status(page)).toHaveText("Not found in the words of this file.")
  await expect(pick(page, "Replace all")).toBeDisabled()
  // Escape puts the tool down, and the window stays.
  await page.keyboard.press("Escape")
  await expect(words(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()
  await changes(page, 0)
})

test("stays accessible, local and responsive while words are found and replaced", async ({
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
  await pick(page, "Find and replace").click()
  expect(await scan()).toEqual([])
  await words(page).fill("borrower")
  await page.keyboard.press("Enter")
  await expect(status(page)).toContainText("1 of 3 places")
  await other(page).fill("debtor")
  expect(await scan()).toEqual([])
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
