import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const panel = (page: Page) => page.getByTestId("editor-pages")
const tiles = (page: Page) => page.getByTestId("pages-tile")
const tile = (page: Page, number: number) =>
  panel(page).getByRole("option", { name: `Page ${number}`, exact: true })
const act = (page: Page, name: string) =>
  panel(page).getByRole("button", { name, exact: true })
const undo = (page: Page) => page.getByTestId("editor-undo")
const status = (page: Page) => page.getByTestId("pages-status")

/** Five pages that say which they are, with links and bookmarks between them and a field on the second. */
const book = () =>
  pdf("book.pdf", "bk", {
    pages: 5,
    links: [
      { from: 1, to: 4 },
      { from: 5, to: 3 },
    ],
    bookmarks: [
      { title: "One", page: 1 },
      { title: "Three", page: 3 },
      { title: "Five", page: 5 },
    ],
    fields: [{ name: "second", value: "two", page: 2 }],
  })

async function open(page: Page) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(await book())
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
  const read = await readPdf(bytes)
  return {
    bytes,
    read,
    texts: read.pages.map((one) => one.text.split(" ")[0]),
    links: read.pages.map((one) => one.links),
  }
}

test("moves pages, takes one out and turns one, and the download is the pages as they lie", async ({
  page,
}) => {
  await open(page)
  // Nothing of the list is there until it is asked for.
  await expect(panel(page)).toHaveCount(0)
  await pick(page, "Pages").click()
  await expect(pick(page, "Pages")).toHaveAttribute("aria-pressed", "true")
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId("pages-count")).toHaveText("5")
  await expect(tiles(page)).toHaveCount(5)
  await expect(status(page)).toContainText("Press a page to choose it")
  // Nothing is chosen: only what needs no page can be done.
  await expect(act(page, "Delete")).toBeDisabled()
  await expect(act(page, "Turn to the right")).toBeDisabled()
  await expect(act(page, "Add a blank page")).toBeEnabled()

  // The fourth page, two places earlier.
  await tile(page, 4).click()
  await expect(tile(page, 4)).toHaveAttribute("aria-selected", "true")
  await expect(status(page)).toHaveText("Chosen: page 4 of 5.")
  await act(page, "Move one place earlier").click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Move page 4")
  // It is still the chosen one, where it is now.
  await expect(tile(page, 3)).toHaveAttribute("aria-selected", "true")
  await act(page, "Move one place earlier").click()
  await changes(page, 2)
  await expect(tile(page, 2)).toHaveAttribute("aria-selected", "true")

  // The last page is taken out, and the first is turned.
  await tile(page, 5).click()
  await act(page, "Delete").click()
  await changes(page, 3)
  await expect(page.getByTestId("pages-count")).toHaveText("4")
  await expect(tiles(page)).toHaveCount(4)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Delete page 5")
  await tile(page, 1).click()
  await act(page, "Turn to the right").click()
  await changes(page, 4)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.texts).toEqual(["bk-P1", "bk-P4", "bk-P2", "bk-P3"])
  expect(got.read.pages.map((one) => one.rotate)).toEqual([90, 0, 0, 0])
  // The link to the fourth page follows it; the one that was on the last page went with it.
  expect(got.links).toEqual([[2], [], [], []])
  expect(got.read.bookmarks).toEqual([
    { title: "One", to: 1, items: [] },
    { title: "Three", to: 4, items: [] },
  ])
  expect(got.read.pages[2].fields).toEqual(["second=two"])
  const check = page.getByTestId("editor-check")
  await expect(check).toContainText(
    "The pages were put in order, turned, copied, added or taken out in 4 steps."
  )
  await expect(check).toContainText(
    "1 page you took out is no longer in the file. What led to it or was on it went too: 1 bookmark."
  )
  await expect(check).toContainText(
    "3 pages you did not change were compared with the original and look the same."
  )
})

test("does everything from the keyboard, undoes it there, and keeps the keyboard in the list", async ({
  page,
}) => {
  await open(page)
  await reader(page).focus()
  await page.keyboard.press("m")
  await expect(panel(page)).toBeVisible()
  // The first page takes the keyboard with Tab from the buttons; here it is given it.
  await tile(page, 1).focus()
  await page.keyboard.press("ArrowRight")
  await expect(tile(page, 2)).toBeFocused()
  await expect(tile(page, 2)).toHaveAttribute("aria-selected", "true")
  // With Shift the next goes with it.
  await page.keyboard.press("Shift+ArrowRight")
  await expect(status(page)).toHaveText("Chosen: pages 2 to 3 of 5.")
  await expect(tile(page, 3)).toBeFocused()
  // Alt and an arrow move the two a place on: they are pages 3 and 4 now.
  await page.keyboard.press("Alt+ArrowRight")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Move pages 2 to 3"
  )
  await expect(status(page)).toHaveText("Chosen: pages 3 to 4 of 5.")
  await expect(tile(page, 3)).toBeFocused()
  // Ctrl and an arrow go on without choosing; Space adds the page the keyboard is on.
  await page.keyboard.press("Control+End")
  await expect(tile(page, 5)).toBeFocused()
  await expect(status(page)).toHaveText("Chosen: pages 3 to 4 of 5.")
  await page.keyboard.press("Space")
  await expect(status(page)).toHaveText("Chosen: pages 3 to 5 of 5.")
  // Delete takes the three out; the keyboard stays in the list.
  await page.keyboard.press("Delete")
  await changes(page, 2)
  await expect(tiles(page)).toHaveCount(2)
  await expect(panel(page).getByRole("option").first()).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest("[data-testid=editor-pages]"))
      )
    )
    .toBe(true)
  // Every page cannot go: the last two are refused, and it is said why.
  await page.keyboard.press("ControlOrMeta+a")
  await expect(status(page)).toHaveText("Chosen: pages 1 to 2 of 2.")
  await expect(act(page, "Delete")).toBeDisabled()
  await expect(act(page, "Delete")).toHaveAttribute(
    "title",
    "A file needs at least one page. Leave one page in it."
  )
  await page.keyboard.press("Delete")
  await changes(page, 2)
  // Undone from the list, the pages are back.
  await page.keyboard.press("ControlOrMeta+z")
  await changes(page, 1)
  await expect(tiles(page)).toHaveCount(5)
  await page.keyboard.press("ControlOrMeta+z")
  await changes(page, 0)
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await changes(page, 1)
  // Escape lets go of the choice first, then closes the list; the window stays.
  await tile(page, 1).focus()
  await page.keyboard.press("Space")
  await expect(status(page)).toContainText("Chosen:")
  await page.keyboard.press("Escape")
  await expect(status(page)).toContainText("Press a page to choose it")
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.texts).toEqual(["bk-P1", "bk-P4", "bk-P2", "bk-P3", "bk-P5"])
})

test("copies pages, adds a blank one, moves pages to a place by number and by dragging", async ({
  page,
}) => {
  await open(page)
  await pick(page, "Pages").click()
  // Two pages that lie apart, copied together after the second of them.
  await tile(page, 1).click()
  await tile(page, 3).click({ modifiers: ["ControlOrMeta"] })
  await expect(status(page)).toHaveText("Chosen: 2 pages of 5.")
  await act(page, "Duplicate").click()
  await changes(page, 1)
  await expect(page.getByTestId("pages-count")).toHaveText("7")
  // The copies are the chosen ones now.
  await expect(status(page)).toHaveText("Chosen: pages 4 to 5 of 7.")
  // A blank page after them, as large as the page before it.
  await act(page, "Add a blank page").click()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Add a blank page"
  )
  await expect(status(page)).toHaveText("Chosen: page 6 of 8.")
  // The blank page is made the first by its number.
  await panel(page).getByLabel("Move to place").fill("1")
  await act(page, "Move").click()
  await changes(page, 3)
  await expect(tile(page, 1)).toHaveAttribute("aria-selected", "true")

  // The last page is dragged to before the second.
  const from = (await tile(page, 8).boundingBox())!
  const to = (await tile(page, 2).boundingBox())!
  await tile(page, 8).scrollIntoViewIfNeeded()
  const start = (await tile(page, 8).boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    start.x + start.width / 2 - 12,
    start.y + start.height / 2 - 12,
    { steps: 3 }
  )
  // Towards the top of the list, which scrolls to meet the pointer.
  const list = (await panel(page).getByRole("listbox").boundingBox())!
  const top = (await panel(page).boundingBox())!
  expect(from.y).toBeGreaterThan(to.y)
  for (let step = 0; step < 30; step++)
    await page.mouse.move(list.x + 30, top.y + top.height - 10 - step * 20)
  await expect
    .poll(async () => (await tile(page, 2).boundingBox()) !== null)
    .toBe(true)
  const target = (await tile(page, 2).boundingBox())!
  await page.mouse.move(target.x + 8, target.y + target.height / 2, {
    steps: 4,
  })
  await expect(page.getByTestId("pages-drop")).toBeVisible()
  await page.mouse.up()
  await changes(page, 4)
  await expect(page.getByTestId("pages-drop")).toHaveCount(0)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Move page 8")
  await expect(tile(page, 2)).toHaveAttribute("aria-selected", "true")

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.texts).toEqual([
    "",
    "bk-P5",
    "bk-P1",
    "bk-P2",
    "bk-P3",
    "bk-P1",
    "bk-P3",
    "bk-P4",
  ])
  // The blank page is as large as the page it was put after.
  expect([got.read.pages[0].width, got.read.pages[0].height]).toEqual([
    298, 420,
  ])
  // A form's field stays on the page it is on, and is not copied.
  expect(got.read.fields).toEqual(["second"])
})

test("keeps what was added to a page with it when the page is moved and turned, and other tools let go", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await open(page)
  const first = page.locator('[data-testid=editor-layer][data-page="1"]')
  const second = page.locator('[data-testid=editor-layer][data-page="2"]')
  // A box on the first page.
  await pick(page, "Box").click()
  const sheet = (await first.boundingBox())!
  await page.mouse.move(sheet.x + 40, sheet.y + 60)
  await page.mouse.down()
  await page.mouse.move(sheet.x + 90, sheet.y + 90, { steps: 4 })
  await page.mouse.move(sheet.x + 140, sheet.y + 120, { steps: 4 })
  await page.mouse.up()
  await changes(page, 1)
  await expect(first.getByTestId("editor-object")).toHaveCount(1)
  // With the links of the page in hand, the page is moved a place on and turned.
  await page.keyboard.press("j")
  await pick(page, "Pages").click()
  await tile(page, 1).click()
  await act(page, "Move one place later").click()
  await changes(page, 2)
  await act(page, "Turn to the left").click()
  await changes(page, 3)
  await expect(second.getByTestId("editor-object")).toHaveCount(1)
  await expect(first.getByTestId("editor-object")).toHaveCount(0)
  // Undone twice, the box is on the first page again.
  await undo(page).click()
  await undo(page).click()
  await changes(page, 1)
  await expect(first.getByTestId("editor-object")).toHaveCount(1)
  await expect(second.getByTestId("editor-object")).toHaveCount(0)
  await page.getByTestId("editor-redo").click()
  await page.getByTestId("editor-redo").click()
  await changes(page, 3)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.texts.slice(0, 2)).toEqual(["bk-P2", "bk-P1"])
  expect(got.read.pages[1].rotate).toBe(270)
  expect(got.read.pages[0].fields).toEqual(["second=two"])
  await expect(page.getByTestId("editor-check")).toContainText(
    "1 thing you added is part of its page now."
  )
  expect(errors).toEqual([])
})

test("stays accessible, local and responsive while pages are changed", async ({
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
  await pick(page, "Pages").click()
  await expect(tiles(page).first()).toBeVisible()
  expect(await scan()).toEqual([])
  await tile(page, 2).click()
  await act(page, "Turn to the right").click()
  await changes(page, 1)
  expect(await scan()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(panel(page)).toBeVisible()
  await expect(tiles(page).first()).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // The comments take the list's place, and the list takes theirs back.
  await page.getByTestId("comments-toggle").click()
  await expect(panel(page)).toHaveCount(0)
  await expect(pick(page, "Pages")).toHaveAttribute("aria-pressed", "false")
  await pick(page, "Pages").click()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByTestId("editor-comments")).toHaveCount(0)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
