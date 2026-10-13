import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const panel = (page: Page) => page.getByTestId("editor-document")
const undo = (page: Page) => page.getByTestId("editor-undo")
const part = (page: Page, name: string) =>
  panel(page).getByRole("radio", { name, exact: true })
const rows = (page: Page) => page.getByTestId("bookmark-row")
const act = (page: Page, name: string) =>
  panel(page).getByRole("button", { name, exact: true })

const book = () =>
  pdf("book.pdf", "dc", {
    pages: 5,
    title: "The old title",
    author: "Ada",
    subject: "Old subject",
    bookmarks: [
      { title: "One", page: 1 },
      { title: "Three", page: 3, children: [{ title: "Four", page: 4 }] },
    ],
  })

async function open(page: Page) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(await book())
  await readerReady(page)
  await reader(page)
    .getByRole("button", { name: "Details and bookmarks", exact: true })
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
  return readPdf(bytes)
}

test("changes what the file says of itself, and undoes it", async ({
  page,
}) => {
  await open(page)
  await expect(part(page, "Details")).toBeChecked()
  const title = panel(page).getByLabel("Title")
  await expect(title).toHaveValue("The old title")
  await expect(panel(page).getByLabel("Author")).toHaveValue("Ada")
  // Nothing is changed yet: there is nothing to save.
  await expect(act(page, "Save the details")).toBeDisabled()
  await title.fill("A new title")
  await panel(page).getByLabel("Subject").fill("")
  await panel(page).getByLabel("Keywords").fill("engine, notes")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Change the file's details"
  )
  await expect(act(page, "Save the details")).toBeDisabled()
  // Undone, the fields say what the file says again.
  await undo(page).click()
  await changes(page, 0)
  await expect(title).toHaveValue("The old title")
  await page.getByTestId("editor-redo").click()
  await changes(page, 1)
  await expect(title).toHaveValue("A new title")

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.info.Title).toBe("A new title")
  expect(got.info.Author).toBe("Ada")
  expect(got.info.Keywords).toBe("engine, notes")
  expect(got.info.Subject).toBeUndefined()
  await expect(page.getByTestId("editor-check")).toContainText(
    "The file's title and other details are as you set them."
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "5 pages you did not change were compared with the original and look the same."
  )
})

test("renames, adds, moves and deletes bookmarks, and leads one to another page", async ({
  page,
}) => {
  await open(page)
  await part(page, "Bookmarks").click()
  await expect(rows(page)).toHaveCount(3)
  // With none chosen, only adding can be done.
  await expect(act(page, "Move down")).toBeDisabled()
  await expect(act(page, "Delete the bookmark")).toBeDisabled()

  // A name is clicked and typed over.
  const first = panel(page).getByLabel("Name of bookmark 1", { exact: true })
  await first.click()
  await expect(rows(page).first()).toHaveAttribute("data-chosen", "true")
  await first.fill("The first page")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Rename a bookmark"
  )
  await expect(first).toHaveValue("The first page")
  // Escape leaves a name as it was, and the window open.
  await first.fill("Never mind")
  await page.keyboard.press("Escape")
  await expect(first).toHaveValue("The first page")
  await expect(panel(page)).toBeVisible()
  await changes(page, 1)

  // A bookmark for the page being read, after the chosen one, and put beneath it.
  await act(page, "Add a bookmark to the page being read").click()
  await changes(page, 2)
  await expect(rows(page)).toHaveCount(4)
  const second = panel(page).getByLabel("Name of bookmark 2", { exact: true })
  await expect(second).toHaveValue("Page 1")
  await expect(rows(page).nth(1)).toHaveAttribute("data-chosen", "true")
  await act(page, "Put beneath the one above").click()
  await changes(page, 3)
  await expect(
    panel(page).getByLabel("Name of bookmark 1.1", { exact: true })
  ).toHaveValue("Page 1")
  await act(page, "Take out from beneath").click()
  await changes(page, 4)
  await act(page, "Move down").click()
  await changes(page, 5)
  // It is the third now, after "Three"; it goes to where the fourth page is read.
  await expect(
    panel(page).getByLabel("Name of bookmark 3", { exact: true })
  ).toHaveValue("Page 1")
  await panel(page)
    .getByRole("button", { name: /^Go to page 4, where Four leads/ })
    .click()
  await expect(reader(page).getByLabel("Page", { exact: true })).toHaveValue(
    "4"
  )
  await panel(page).getByLabel("Name of bookmark 3", { exact: true }).click()
  await act(page, "Lead it to the page being read").click()
  await changes(page, 6)
  // "Three" goes, with what is beneath it.
  await panel(page).getByLabel("Name of bookmark 2", { exact: true }).click()
  await act(page, "Delete the bookmark").click()
  await changes(page, 7)
  await expect(rows(page)).toHaveCount(2)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.bookmarks).toEqual([
    { title: "The first page", to: 1, items: [] },
    { title: "Page 1", to: 4, items: [] },
  ])
  await expect(page.getByTestId("editor-check")).toContainText(
    "The bookmarks are as you set them."
  )
})

test("sets the numbers the file gives its own pages, in runs", async ({
  page,
}) => {
  await open(page)
  await part(page, "Page numbers").click()
  await expect(panel(page)).toContainText("The pages are simply counted")
  await act(page, "Add a run").click()
  await act(page, "Add a run").click()
  const runs = page.getByTestId("label-run")
  await expect(runs).toHaveCount(2)
  await runs.nth(0).getByLabel("Written as").selectOption("r")
  await runs.nth(1).getByLabel("From page").fill("3")
  await runs.nth(1).getByLabel("Before the number").fill("A-")
  await expect(page.getByTestId("labels-shown")).toHaveText(
    "The first pages will be called: i, ii, A-1, A-2, A-3"
  )
  // Two runs cannot begin at one page.
  await runs.nth(1).getByLabel("From page").fill("1")
  await expect(panel(page).getByRole("alert")).toHaveText(
    "Two runs begin at the same page."
  )
  await expect(act(page, "Save the page numbers")).toBeDisabled()
  await runs.nth(1).getByLabel("From page").fill("3")
  await act(page, "Save the page numbers").click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Change the page numbers of the file"
  )
  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.labels).toEqual(["i", "ii", "A-1", "A-2", "A-3"])
  await expect(page.getByTestId("editor-check")).toContainText(
    "The numbers the file gives its own pages are as you set them."
  )
})

test("stays accessible, local and responsive while the file's details are changed", async ({
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
  await part(page, "Bookmarks").click()
  await panel(page).getByLabel("Name of bookmark 2", { exact: true }).click()
  await page.waitForTimeout(300)
  expect(await scan()).toEqual([])
  await part(page, "Page numbers").click()
  await act(page, "Add a run").click()
  await page.waitForTimeout(300)
  expect(await scan()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(panel(page)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Another panel takes this one's place.
  await page.getByTestId("pages-toggle").click()
  await expect(panel(page)).toHaveCount(0)
  await page.getByTestId("document-toggle").click()
  await expect(panel(page)).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
