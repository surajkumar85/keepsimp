import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFile } from "node:fs/promises"
import {
  drawnPage,
  pdf,
  reader,
  readerReady,
  scrollReader,
  type Upload,
} from "./pdf"

const ROUTE = "/dashboard/pdf-merger/"

async function add(page: Page, ...files: Upload[]) {
  await page.goto(ROUTE)
  await page.locator("#pdf-file").setInputFiles(files)
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 60_000 }
  )
}

/** Open a file in the reader from its picture in the list. */
async function read(page: Page, name: string) {
  await page.getByRole("button", { name: `Read ${name}`, exact: true }).click()
  await readerReady(page)
}

const shownPage = async (page: Page) =>
  Number(await reader(page).getAttribute("data-page"))
const zoom = async (page: Page) =>
  Number(await reader(page).getAttribute("data-zoom"))

/** The side panel starts closed on small screens. */
async function openPanel(page: Page) {
  const panel = page.getByTestId("reader-sidebar")
  if (!(await panel.isVisible()))
    await page.getByRole("button", { name: "Show the side panel" }).click()
  await expect(panel).toBeVisible()
}

test.describe.configure({ timeout: 180_000 })

test("opens a file to read, draws only the pages near the screen, and gives focus back", async ({
  page,
}) => {
  await add(page, await pdf("long.pdf", "L", { pages: 40 }))
  await read(page, "long.pdf")
  const window = page.getByRole("dialog")
  await expect(window.getByRole("heading")).toHaveText("long.pdf")
  await expect(window).toContainText("40 pages")
  await expect(window).toContainText("of 40")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })

  // Every page has its place from the start, so the scroll bar is right at once.
  const pages = page.getByTestId("reader-pages")
  const { scrollHeight, clientHeight } = await pages.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight * 10)
  // Only the pages near the screen exist.
  expect(await page.getByTestId("reader-page").count()).toBeLessThan(12)
  await expect(
    page.locator('[data-testid=reader-page][data-page="30"]')
  ).toHaveCount(0)

  // The picture is drawn for the size it is shown at, not stretched from a thumbnail.
  const sharp = await drawnPage(page, 1).evaluate((element) => {
    const canvas = element.querySelector("canvas")!
    return canvas.width / canvas.getBoundingClientRect().width
  })
  expect(sharp).toBeGreaterThanOrEqual(devicePixelRatioFloor)

  // Scrolling far away draws the pages there and lets the first ones go.
  await scrollReader(page, scrollHeight)
  await expect(drawnPage(page, 40)).toBeVisible({ timeout: 30_000 })
  expect(await shownPage(page)).toBeGreaterThanOrEqual(39)
  await expect(
    page.locator('[data-testid=reader-page][data-page="1"]')
  ).toHaveCount(0)

  await window.getByRole("button", { name: "Close the reader" }).click()
  await expect(window).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Read long.pdf", exact: true })
  ).toBeFocused()
})
/** A picture is never drawn with fewer pixels than the page takes on screen. */
const devicePixelRatioFloor = 0.99

test("zooms, fits and turns, staying on the page being read", async ({
  page,
}) => {
  await add(page, await pdf("zoom.pdf", "Z", { pages: 12 }))
  await read(page, "zoom.pdf")
  await page.getByLabel("Page", { exact: true }).fill("7")
  await page.getByLabel("Page", { exact: true }).press("Enter")
  await expect(reader(page)).toHaveAttribute("data-page", "7")
  await expect(drawnPage(page, 7)).toBeVisible({ timeout: 30_000 })

  const start = await zoom(page)
  await page.getByRole("button", { name: "Zoom in" }).click()
  await expect.poll(() => zoom(page)).toBeGreaterThan(start)
  const larger = await zoom(page)
  await expect(reader(page)).toHaveAttribute("data-page", "7")
  await page.getByRole("button", { name: "Zoom out" }).click()
  await page.getByRole("button", { name: "Zoom out" }).click()
  await expect.poll(() => zoom(page)).toBeLessThan(start)
  expect(larger).toBeGreaterThan(start)
  await expect(reader(page)).toHaveAttribute("data-page", "7")

  // Fit the width: the page is as wide as the room, less its margins.
  await page.getByRole("button", { name: "Fit the width" }).click()
  await expect(
    page.getByRole("button", { name: "Fit the width" })
  ).toHaveAttribute("aria-pressed", "true")
  const fit = await page.evaluate(() => {
    const room = document.querySelector("[data-testid=reader-pages]")!
    const sheet = document.querySelector("[data-testid=reader-page]")!
    return {
      room: room.clientWidth,
      sheet: sheet.getBoundingClientRect().width,
    }
  })
  expect(Math.abs(fit.room - 32 - fit.sheet)).toBeLessThan(3)
  await expect(reader(page)).toHaveAttribute("data-page", "7")

  // Sharp again once the zoom settles.
  await expect
    .poll(
      () =>
        drawnPage(page, 7).evaluate((element) => {
          const canvas = element.querySelector("canvas")!
          return canvas.width / canvas.getBoundingClientRect().width
        }),
      { timeout: 30_000 }
    )
    .toBeGreaterThanOrEqual(devicePixelRatioFloor)

  // The keyboard zooms too, when the pages have focus.
  await page.getByTestId("reader-pages").focus()
  const before = await zoom(page)
  await page.keyboard.press("-")
  await expect.poll(() => zoom(page)).toBeLessThan(before)
  await page.keyboard.press("+")
  await page.keyboard.press("+")
  await expect.poll(() => zoom(page)).toBeGreaterThan(before)

  // Turning the view lays the upright pages on their side.
  const upright = await drawnPage(page, 7).boundingBox()
  expect(upright!.height).toBeGreaterThan(upright!.width)
  await page.getByRole("button", { name: "Turn the view" }).click()
  await expect
    .poll(async () => {
      const turned = await page
        .locator('[data-testid=reader-page][data-page="7"]')
        .boundingBox()
      return turned ? turned.width > turned.height : false
    })
    .toBe(true)
  await expect(reader(page)).toHaveAttribute("data-page", "7")
})

test("goes to a page by its number, its small picture, its bookmark and a link", async ({
  page,
  isMobile,
}) => {
  await add(
    page,
    await pdf("book.pdf", "B", {
      pages: 30,
      bookmarks: [
        { title: "Opening", page: 1 },
        {
          title: "Part two",
          page: 12,
          children: [{ title: "A closer look", page: 25 }],
        },
        { title: "Leads nowhere" },
      ],
      links: [{ from: 1, to: 20 }],
    })
  )
  await read(page, "book.pdf")
  const field = page.getByLabel("Page", { exact: true })

  await field.fill("18")
  await field.press("Enter")
  await expect(reader(page)).toHaveAttribute("data-page", "18")
  // What is not one of the pages is ignored, and the field says where we are.
  await field.fill("99")
  await field.press("Enter")
  await expect(reader(page)).toHaveAttribute("data-page", "18")
  await expect(field).toHaveValue("18")

  await openPanel(page)
  const strip = page.getByRole("list", { name: "Pages" })
  await expect(
    strip.getByRole("button", { name: "Page 18", exact: true })
  ).toHaveAttribute("aria-current", "page")
  // The strip only holds the small pictures near its own screen.
  expect(await page.getByTestId("reader-thumb").count()).toBeLessThan(20)
  await strip.getByRole("button", { name: "Page 16", exact: true }).click()
  await expect(reader(page)).toHaveAttribute("data-page", "16")

  if (isMobile) await openPanel(page)
  await page.getByRole("tab", { name: "Bookmarks" }).click()
  const bookmarks = page.getByRole("list", { name: "Bookmarks" })
  await expect(bookmarks).toContainText("Leads nowhere")
  await bookmarks.getByRole("button", { name: /A closer look/ }).click()
  await expect(reader(page)).toHaveAttribute("data-page", "25")
  if (isMobile) await openPanel(page)
  // A bookmark's children can be put away.
  await page
    .getByRole("button", { name: "Hide what is under Part two" })
    .click()
  await expect(
    bookmarks.getByRole("button", { name: /A closer look/ })
  ).toHaveCount(0)
  await bookmarks.getByRole("button", { name: /Opening/ }).click()
  await expect(reader(page)).toHaveAttribute("data-page", "1")

  // A link on the page leads to its page.
  await page.getByRole("button", { name: "Go to page 20" }).click()
  await expect(reader(page)).toHaveAttribute("data-page", "20")
  await expect(drawnPage(page, 20)).toBeVisible({ timeout: 30_000 })
})

test("finds words across pages and steps through the matches", async ({
  page,
}) => {
  await add(page, await pdf("find.pdf", "Find", { pages: 25 }))
  await read(page, "find.pdf")
  await page.getByRole("button", { name: "Search this file" }).click()
  const box = page.getByRole("searchbox")
  await expect(box).toBeFocused()
  const status = page.getByTestId("reader-search-status")

  // Capitals make no difference; every page says "Find-P<number>".
  await box.fill("find-p2")
  await expect(status).toHaveText("1 of 7", { timeout: 30_000 })
  await expect(reader(page)).toHaveAttribute("data-page", "2")
  await expect(
    page.locator("[data-testid=reader-match][data-current]")
  ).toHaveCount(1)

  // Enter goes on to the next match, on page 20; Shift+Enter comes back.
  await box.press("Enter")
  await expect(status).toHaveText("2 of 7")
  await expect(reader(page)).toHaveAttribute("data-page", "20")
  await box.press("Shift+Enter")
  await expect(status).toHaveText("1 of 7")
  await page.getByRole("button", { name: "Previous match" }).click()
  // Round to the last one.
  await expect(status).toHaveText("7 of 7")
  await expect(reader(page)).toHaveAttribute("data-page", "25")

  // The mark sits on the words it found.
  const mark = await page
    .locator("[data-testid=reader-match][data-current]")
    .boundingBox()
  const line = await page
    .locator(
      '[data-testid=reader-page][data-page="25"] [data-testid=reader-text] span'
    )
    .first()
    .boundingBox()
  expect(Math.abs(mark!.x - line!.x)).toBeLessThan(3)
  expect(Math.abs(mark!.y - line!.y)).toBeLessThan(4)
  expect(mark!.width).toBeLessThanOrEqual(line!.width + 2)

  await box.fill("zebra")
  await expect(status).toHaveText("No matches", { timeout: 30_000 })
  await expect(page.getByTestId("reader-match")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Next match" })).toBeDisabled()

  // Escape closes the search and leaves the reader open.
  await box.press("Escape")
  await expect(box).toHaveCount(0)
  await expect(reader(page)).toBeVisible()
  // Ctrl+F or ⌘F opens it again.
  await page.getByTestId("reader-pages").focus()
  await page.keyboard.press("Control+f")
  await expect(page.getByRole("searchbox")).toBeFocused()
})

test("says so when a scan has no text to search or select", async ({
  page,
}) => {
  await add(page, {
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: await readFile("e2e/fixtures/pdf/quartz-scan.pdf"),
  })
  await read(page, "scan.pdf")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Search this file" }).click()
  await page.getByRole("searchbox").fill("anything")
  await expect(page.getByTestId("reader-search-status")).toHaveText(
    "No text to search",
    { timeout: 30_000 }
  )
  await expect(
    page.locator('[data-testid=reader-page][data-page="1"]')
  ).toContainText("no text that can be read out or selected")
})

test("lets text be selected and copied, lined up with the page", async ({
  page,
}) => {
  await add(page, await pdf("text.pdf", "T", { pages: 3, rotate: { 2: 90 } }), {
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: await readFile("public/samples/keepsimp-report.pdf"),
  })
  await read(page, "report.pdf")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  const layer = page
    .locator('[data-testid=reader-page][data-page="1"]')
    .getByTestId("reader-text")
  await expect(layer).toBeAttached()
  // Selecting the whole page gives its text, a line to a line.
  const selected = await layer.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return selection.toString()
  })
  expect(selected.split("\n").slice(0, 3)).toEqual([
    "Quarterly report",
    "A sample document for the KeepSimp PDF merger.",
    "It has three pages, a bookmark for each, and a link below.",
  ])
  // Each line is as wide as the words on the page, whatever font the browser uses.
  const widths = await layer.evaluate((element) => {
    const sheet = element.closest("[data-testid=reader-page]")!
    const scale = sheet.getBoundingClientRect().width / 595.28
    return [...element.querySelectorAll("span")].slice(0, 3).map((span) => ({
      shown: span.getBoundingClientRect().width / scale,
      left:
        (span.getBoundingClientRect().left -
          sheet.getBoundingClientRect().left) /
        scale,
    }))
  })
  // The widths and the left edge the engine reports for these lines, in points.
  expect(widths[0].shown).toBeCloseTo(213, -1)
  expect(widths[1].shown).toBeCloseTo(274, -1)
  expect(widths[2].shown).toBeCloseTo(308, -1)
  for (const line of widths) expect(line.left).toBeCloseTo(56, 0)
  await page.keyboard.press("Escape")

  // On a turned page the text is turned with it.
  await read(page, "text.pdf")
  await page.getByLabel("Page", { exact: true }).fill("2")
  await page.getByLabel("Page", { exact: true }).press("Enter")
  await expect(drawnPage(page, 2)).toBeVisible({ timeout: 30_000 })
  const turned = page
    .locator('[data-testid=reader-page][data-page="2"]')
    .getByTestId("reader-text")
    .locator("span")
  await expect(turned).toHaveText("T-P2")
  const shape = await turned.boundingBox()
  // "T-P2" is longer than it is tall, so turned it stands taller than it is wide.
  expect(shape!.height).toBeGreaterThan(shape!.width * 1.3)
})

test("reads the pages as arranged, and the merged file before it is downloaded", async ({
  page,
}) => {
  await add(
    page,
    await pdf("A.pdf", "A", {
      pages: 3,
      bookmarks: [{ title: "Start", page: 1 }],
    }),
    await pdf("B.pdf", "B", { pages: 2 })
  )
  await page.getByRole("radio", { name: /^Pages/ }).click()
  const tile = (at: number) =>
    page.getByTestId("page-tile").nth(at).getByRole("button")
  await tile(1).click()
  await page.getByRole("button", { name: "Add a blank page" }).click()
  await page.getByRole("button", { name: "Look at the page closely" }).click()
  await readerReady(page)
  const window = page.getByRole("dialog")
  await expect(window.getByRole("heading")).toHaveText(
    "The merged pages, as arranged"
  )
  // It opens at the page that was chosen, and says which file each page is from.
  await expect(reader(page)).toHaveAttribute("data-page", "2")
  await expect(window).toContainText("A.pdf, page 2")
  await expect(window).toContainText("of 6")
  await expect(drawnPage(page, 2)).toBeVisible({ timeout: 30_000 })
  await expect(
    page.locator('[data-testid=reader-page][data-page="3"]')
  ).toContainText("Blank page")
  await page.keyboard.press("Escape")
  await expect(window).toBeHidden()

  // A double click on a page opens it too.
  await tile(5).dblclick()
  await readerReady(page)
  await expect(reader(page)).toHaveAttribute("data-page", "6")
  await expect(page.getByRole("dialog")).toContainText("B.pdf, page 2")
  await page.keyboard.press("Escape")

  // The merged file itself can be read before it is saved.
  await page.getByRole("button", { name: "Merge PDF" }).click()
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-merged",
    "true",
    { timeout: 120_000 }
  )
  await page.getByRole("button", { name: "Read it here" }).click()
  await readerReady(page)
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
    "merged.pdf"
  )
  await expect(page.getByRole("dialog")).toContainText("6 pages")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  await expect(
    page
      .locator('[data-testid=reader-page][data-page="1"]')
      .getByTestId("reader-text")
  ).toHaveText("A-P1")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  // Reading it did not add it to the files to merge.
  await page.getByRole("radio", { name: "Files", exact: true }).click()
  await expect(page.getByTestId("file-row")).toHaveCount(2)
})

test("reads a merged file that is locked with a password, and a file once it is unlocked", async ({
  page,
}) => {
  await add(
    page,
    await pdf("open.pdf", "O", { pages: 2 }),
    await pdf("locked.pdf", "K", { pages: 2, password: { user: "pw" } })
  )
  // A locked file cannot be read until it is unlocked.
  await expect(
    page.getByRole("button", { name: "Open locked.pdf in the reader" })
  ).toBeDisabled()
  await page.getByLabel("Password for locked.pdf").fill("pw")
  await page.getByRole("button", { name: "Unlock" }).click()
  await page
    .getByRole("button", { name: "Open locked.pdf in the reader" })
    .click()
  await readerReady(page)
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press("Escape")

  await page
    .getByRole("switch", { name: "Lock the merged PDF with a password" })
    .click()
  await page.getByLabel("Password to open the file").fill("s3cret, yes")
  await page.getByRole("button", { name: "Merge PDF" }).click()
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-merged",
    "true",
    { timeout: 120_000 }
  )
  await page.getByRole("button", { name: "Read it here" }).click()
  await readerReady(page)
  await expect(page.getByRole("dialog")).toContainText("4 pages")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
})

test("works from the keyboard alone", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no keyboard to test with.")
  await add(page, await pdf("keys.pdf", "K", { pages: 15 }))
  await page.getByRole("button", { name: "Read keys.pdf", exact: true }).focus()
  await page.keyboard.press("Enter")
  await readerReady(page)
  // The pages have focus, so the usual keys scroll at once.
  await expect(page.getByTestId("reader-pages")).toBeFocused()
  await page.keyboard.press("End")
  await expect(reader(page)).toHaveAttribute("data-page", "15")
  await page.keyboard.press("Home")
  await expect(reader(page)).toHaveAttribute("data-page", "1")
  // With nothing to scroll sideways, the arrows turn pages.
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await expect(reader(page)).toHaveAttribute("data-page", "3")
  await page.keyboard.press("ArrowLeft")
  await expect(reader(page)).toHaveAttribute("data-page", "2")
  // Focus stays inside the window.
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab")
    // At the last control, focus goes round to the first within a moment.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest("[role=dialog]"))
        )
      )
      .toBe(true)
  }
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Read keys.pdf", exact: true })
  ).toBeFocused()
})

test("stays accessible, local and usable on a small screen", async ({
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
  await page.emulateMedia({ reducedMotion: "reduce" })
  await add(
    page,
    await pdf("check.pdf", "C", {
      pages: 6,
      bookmarks: [{ title: "First", page: 1 }],
      links: [{ from: 1, to: 4 }],
    })
  )
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    await read(page, "check.pdf")
    await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
    await openPanel(page)
    await page.getByRole("button", { name: "Search this file" }).click()
    await page.getByRole("searchbox").fill("c-p")
    await expect(page.getByTestId("reader-search-status")).toHaveText(
      "1 of 6",
      { timeout: 30_000 }
    )
    const results = await new AxeBuilder({ page })
      .include("[role=dialog]")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations, theme).toEqual([])
    await page.getByRole("button", { name: "Close the reader" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
  }

  await page.setViewportSize({ width: 320, height: 640 })
  await read(page, "check.pdf")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  // Nothing in the window is wider than the screen, and every control is large enough to press.
  const layout = await page.getByRole("dialog").evaluate((element) => ({
    wide: element.scrollWidth > element.clientWidth + 1,
    small: [...element.querySelectorAll("button, input")]
      .filter((control) => !control.closest("[data-testid=reader-pages]"))
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.height > 1 && box.height < 44).length,
  }))
  expect(layout).toEqual({ wide: false, small: 0 })
  await expect(
    page.getByRole("button", { name: "Close the reader" })
  ).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
