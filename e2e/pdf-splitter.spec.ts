import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import {
  damage,
  makeDoublePdf,
  makePlainPdf,
  makeSharedPdf,
  SHARED_PICTURE,
  type PlainPage,
} from "../tests/pdf-fixtures"
import { readPdf, storedPictures } from "../tests/pdf-reader"
import {
  bytesOf,
  drawnPage,
  pdf,
  reader,
  readerReady,
  type Upload,
} from "./pdf"

const ROUTE = "/dashboard/pdf-splitter/"
const tool = (page: Page) => page.getByTestId("pdf-splitter")

async function add(page: Page, ...files: Upload[]) {
  await page.goto(ROUTE)
  await page.locator("#split-file").setInputFiles(files)
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
}

/** A file of plain pages: lines of text, or nothing at all. */
const plain = async (name: string, pages: PlainPage[]): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makePlainPdf(pages)),
})

/** The row of a file, by its name. */
const row = (page: Page, name: string) =>
  page.getByTestId("file-row").filter({ hasText: name })

/** The cut control after a page, by the page's number from 1. */
const cutAfter = (page: Page, number: number) =>
  page.getByRole("button", { name: `Cut after page ${number}`, exact: true })
/** A page of the board, by its number from 1. */
const tile = (page: Page, number: number) =>
  page.locator(
    `[data-testid=board-page][data-page="${number - 1}"] [data-tile]`
  )
const mode = (page: Page, name: string) =>
  page
    .getByRole("radiogroup", { name: "How to split" })
    .getByRole("radio", { name, exact: true })
/** Which part each page of the board is in, as the board says it. */
const partsOnBoard = (page: Page) =>
  page
    .getByTestId("board-page")
    .evaluateAll((tiles) =>
      tiles.map((element) => (element as HTMLElement).dataset.part)
    )

async function waitForSplit(page: Page) {
  await expect(tool(page)).toHaveAttribute("data-split", "true", {
    timeout: 120_000,
  })
}

/** Split, download every part as one ZIP, and read each part back with pdf.js. */
async function splitToZip(page: Page, button = "Split PDF") {
  await page.getByRole("button", { name: button }).click()
  await waitForSplit(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (.zip)" }).click()
  const download = await pending
  const files = unzipSync(await bytesOf(download))
  const names = Object.keys(files)
  const parts = await Promise.all(
    names.map(async (name) => ({
      name,
      bytes: files[name],
      ...(await readPdf(files[name])),
    }))
  )
  return {
    zip: download.suggestedFilename(),
    names,
    parts,
    texts: parts.map((part) => part.pages.map((entry) => entry.text)),
  }
}

/** Make the one file of "extract" or "remove", download it and read it back. */
async function makeOne(page: Page) {
  await page.getByRole("button", { name: "Make the PDF" }).click()
  await waitForSplit(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download PDF" }).click()
  const download = await pending
  const bytes = await bytesOf(download)
  return {
    name: download.suggestedFilename(),
    bytes,
    ...(await readPdf(bytes)),
  }
}

test.describe.configure({ timeout: 180_000 })

test("cuts a file between pages and downloads every part", async ({ page }) => {
  await add(
    page,
    await pdf("Report 2026.pdf", "A", {
      pages: 6,
      bookmarks: [
        { title: "Start", page: 1 },
        { title: "Middle", page: 3 },
        { title: "End", page: 6 },
      ],
      links: [
        { from: 1, to: 2 },
        { from: 1, to: 6 },
      ],
    })
  )
  await expect(row(page, "Report 2026.pdf")).toContainText("6 pages")
  await expect(page.getByTestId("board-page")).toHaveCount(6)
  // Nothing is cut yet, so there is nothing to split.
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeDisabled()
  await expect(page.getByTestId("result")).toContainText(
    "Cut the file somewhere first"
  )

  await cutAfter(page, 2).click()
  await cutAfter(page, 4).click()
  await expect(cutAfter(page, 2)).toHaveAttribute("aria-pressed", "true")
  expect(await partsOnBoard(page)).toEqual(["1", "1", "2", "2", "3", "3"])
  await expect(page.getByTestId("plan")).toHaveText("3 parts from 6 pages")
  const rows = page.getByTestId("part-row")
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText("Part 2 · pages 3-4 · 2 pages")

  // Pressing a cut again takes it away.
  await cutAfter(page, 4).click()
  await expect(rows).toHaveCount(2)
  await cutAfter(page, 4).click()

  const result = await splitToZip(page)
  expect(result.zip).toBe("Report-2026-split.zip")
  expect(result.names).toEqual([
    "Report-2026-1.pdf",
    "Report-2026-2.pdf",
    "Report-2026-3.pdf",
  ])
  expect(result.texts).toEqual([
    ["A-P1", "A-P2"],
    ["A-P3", "A-P4"],
    ["A-P5", "A-P6"],
  ])
  // Bookmarks follow their pages; a link out of the part is gone, one inside it stays.
  expect(result.parts.map((part) => part.bookmarks)).toEqual([
    [{ title: "Start", to: 1, items: [] }],
    [{ title: "Middle", to: 1, items: [] }],
    [{ title: "End", to: 2, items: [] }],
  ])
  expect(result.parts[0].pages[0].links).toEqual([2])
  await expect(page.getByTestId("result-facts")).toContainText("3 files")

  // One part on its own.
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download Report-2026-2.pdf" }).click()
  const single = await pending
  expect(single.suggestedFilename()).toBe("Report-2026-2.pdf")
  expect(
    (await readPdf(await bytesOf(single))).pages.map((entry) => entry.text)
  ).toEqual(["A-P3", "A-P4"])
})

test("places cuts by rule, and undoes them", async ({ page }) => {
  await add(page, await pdf("ten.pdf", "T", { pages: 10 }))
  const rules = page.getByTestId("split-rules")
  await rules.getByLabel("Cut after every").fill("4")
  await rules.getByRole("button", { name: "Place the cuts" }).first().click()
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
    "2",
    "3",
    "3",
  ])

  await rules.getByLabel("Cut into").fill("3")
  await rules.getByRole("button", { name: "Place the cuts" }).nth(1).click()
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
    "3",
    "3",
    "3",
  ])

  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByTestId("part-row")).toHaveCount(3)
  expect((await partsOnBoard(page))[4]).toBe("2")
  await page.getByRole("button", { name: "Redo" }).click()
  expect((await partsOnBoard(page))[4]).toBe("2")
  expect((await partsOnBoard(page))[7]).toBe("3")

  // A number that is no count of pages cannot be used.
  await rules.getByLabel("Cut after every").fill("0")
  await expect(
    rules.getByRole("button", { name: "Place the cuts" }).first()
  ).toBeDisabled()

  await page.getByRole("button", { name: "Every page on its own" }).click()
  await expect(page.getByTestId("plan")).toHaveText("10 parts from 10 pages")
  const result = await splitToZip(page)
  expect(result.names[0]).toBe("ten-01.pdf")
  expect(result.names[9]).toBe("ten-10.pdf")
  expect(result.texts).toEqual(
    Array.from({ length: 10 }, (_, at) => [`T-P${at + 1}`])
  )

  // Removing the cuts makes the result out of date.
  await page.getByRole("button", { name: "Remove all cuts" }).click()
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeDisabled()
  await expect(tool(page)).not.toHaveAttribute("data-split", "true")
})

test("splits by typed ranges, which may overlap", async ({ page }) => {
  await add(page, await pdf("ranges.pdf", "R", { pages: 8 }))
  await mode(page, "Page ranges").click()
  const field = page.getByLabel("Pages of each part")
  await expect(page.getByTestId("result")).toContainText(
    "Type the pages for each part"
  )
  await field.fill("1-3, 2-4, 8-6, 1 + 8")
  expect(await partsOnBoard(page)).toEqual([
    "1,4",
    "1,2",
    "1,2",
    "2",
    "",
    "3",
    "3",
    "3,4",
  ])
  const result = await splitToZip(page)
  expect(result.texts).toEqual([
    ["R-P1", "R-P2", "R-P3"],
    ["R-P2", "R-P3", "R-P4"],
    ["R-P8", "R-P7", "R-P6"],
    ["R-P1", "R-P8"],
  ])

  await field.fill("1-3, 12")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "has 8 pages"
  )
  await expect(field).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeDisabled()
})

test("parts odd pages from even pages", async ({ page }) => {
  await add(page, await pdf("scan.pdf", "S", { pages: 5 }))
  await mode(page, "Odd and even").click()
  const result = await splitToZip(page)
  expect(result.names).toEqual(["scan-odd.pdf", "scan-even.pdf"])
  expect(result.texts).toEqual([
    ["S-P1", "S-P3", "S-P5"],
    ["S-P2", "S-P4"],
  ])
})

test("takes selected pages out as one file, or removes them", async ({
  page,
}) => {
  await add(page, await pdf("book.pdf", "B", { pages: 8 }))
  await mode(page, "Extract pages").click()
  await expect(page.getByTestId("result")).toContainText(
    "Select the pages to take out."
  )
  await tile(page, 2).click()
  await tile(page, 5).click()
  await tile(page, 7).click({ modifiers: ["Shift"] })
  const field = page.getByLabel("Pages to take out")
  await expect(field).toHaveValue("2, 5-7")
  await expect(tile(page, 6)).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("plan")).toHaveText(
    "One file with 4 pages of 8"
  )
  const taken = await makeOne(page)
  expect(taken.name).toBe("book-pages-2_5-7.pdf")
  expect(taken.pages.map((entry) => entry.text)).toEqual([
    "B-P2",
    "B-P5",
    "B-P6",
    "B-P7",
  ])

  // Typing pages selects them, and a mistake is explained.
  await field.fill("1, 8")
  await expect(tile(page, 8)).toHaveAttribute("aria-pressed", "true")
  await expect(tile(page, 5)).toHaveAttribute("aria-pressed", "false")
  await field.fill("1, 80")
  await expect(
    page.getByTestId("split-rules").getByRole("alert")
  ).toContainText("has 8 pages")
  await field.fill("1, 8")

  // The same selection, removed instead.
  await mode(page, "Remove pages").click()
  await expect(page.getByLabel("Pages to remove")).toHaveValue("1, 8")
  const kept = await makeOne(page)
  expect(kept.name).toBe("book-edited.pdf")
  expect(kept.pages.map((entry) => entry.text)).toEqual([
    "B-P2",
    "B-P3",
    "B-P4",
    "B-P5",
    "B-P6",
    "B-P7",
  ])
  await page.getByRole("button", { name: "Select all" }).click()
  await expect(page.getByTestId("result")).toContainText(
    "That removes every page"
  )
})

test("names parts by a pattern or by hand, and leaves parts out", async ({
  page,
}) => {
  await add(page, await pdf("Notes.pdf", "N", { pages: 6 }))
  await cutAfter(page, 2).click()
  await cutAfter(page, 4).click()
  const pattern = page.getByLabel("Names of the parts")
  await pattern.fill("{name}_p{from}-{to}")
  await expect(page.getByTestId("result")).toContainText("Notes_p1-2.pdf")
  await page.getByLabel("Name of part 2").fill("Middle bit.pdf")
  await page.getByRole("switch", { name: "Include part 3" }).click()
  await expect(page.getByTestId("plan")).toHaveText(
    "2 parts from 6 pages · 1 part left out"
  )
  expect((await partsOnBoard(page)).slice(4)).toEqual(["3", "3"])
  await expect(tile(page, 5)).toHaveAccessibleName("Page 5, left out")
  const result = await splitToZip(page)
  expect(result.names).toEqual(["Notes_p1-2.pdf", "Middle-bit.pdf"])
  expect(result.texts).toEqual([
    ["N-P1", "N-P2"],
    ["N-P3", "N-P4"],
  ])

  // A name typed for a part stays with it when a cut is added before it.
  await cutAfter(page, 1).click()
  await expect(page.getByLabel("Name of part 3")).toHaveValue("Middle bit.pdf")

  await pattern.fill("{name}-{chapter}")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "{chapter} is not a placeholder"
  )
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeDisabled()
  // Leaving every part out leaves nothing to write.
  await pattern.fill("")
  for (const number of [1, 2, 3])
    await page.getByRole("switch", { name: `Include part ${number}` }).click()
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Every part is left out"
  )
})

test("works from the keyboard: moving, cutting, selecting and reading", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Phones have no keyboard to test with.")
  await add(page, await pdf("keys.pdf", "K", { pages: 6 }))
  await tile(page, 1).focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await expect(tile(page, 3)).toBeFocused()
  await page.keyboard.press("s")
  await expect(cutAfter(page, 3)).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("End")
  await expect(tile(page, 6)).toBeFocused()
  // There is nothing to cut after the last page.
  await page.keyboard.press("s")
  await expect(page.getByTestId("part-row")).toHaveCount(2)
  await page.keyboard.press("Home")
  await page.keyboard.press("S")
  await expect(page.getByTestId("part-row")).toHaveCount(3)
  // What happened is said for screen readers.
  await expect(page.getByRole("status").last()).toHaveText(
    "Cut after page 1. 3 parts."
  )

  // Enter reads from the page.
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await readerReady(page)
  await expect(reader(page)).toHaveAttribute("data-page", "2")
  await page.keyboard.press("Escape")
  await expect(tile(page, 2)).toBeFocused()

  // In the ways that select pages, Space selects.
  await mode(page, "Extract pages").click()
  await tile(page, 2).focus()
  await page.keyboard.press(" ")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+ ")
  await expect(page.getByLabel("Pages to take out")).toHaveValue("2-4")
})

test("reads the file, cuts while reading, and reads a part", async ({
  page,
}) => {
  await add(page, await pdf("read.pdf", "D", { pages: 8 }))
  await page.getByRole("button", { name: "Read read.pdf", exact: true }).click()
  await readerReady(page)
  await expect(page.getByRole("dialog")).toContainText("8 pages")
  await page.getByLabel("Page", { exact: true }).fill("5")
  await page.getByLabel("Page", { exact: true }).press("Enter")
  await expect(reader(page)).toHaveAttribute("data-page", "5")
  // The scissors in the reader cut after the page being read.
  const cutHere = page
    .getByRole("dialog")
    .getByRole("button", { name: "Cut after page 5" })
  await cutHere.click()
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove the cut after page 5" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeHidden()
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
  ])

  // A double click on a page reads from there.
  await tile(page, 7).dblclick()
  await readerReady(page)
  await expect(reader(page)).toHaveAttribute("data-page", "7")
  // On the last page there is nothing to cut after.
  await page.getByLabel("Page", { exact: true }).fill("8")
  await page.getByLabel("Page", { exact: true }).press("Enter")
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /^Cut after/ })
  ).toHaveCount(0)
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Split PDF" }).click()
  await waitForSplit(page)
  await page.getByRole("button", { name: "Read read-2.pdf" }).click()
  await readerReady(page)
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
    "read-2.pdf"
  )
  await expect(page.getByRole("dialog")).toContainText("3 pages")
  await expect(drawnPage(page, 1)).toBeVisible({ timeout: 30_000 })
  await expect(
    page
      .locator('[data-testid=reader-page][data-page="1"]')
      .getByTestId("reader-text")
  ).toHaveText("D-P6")
  // A part cannot be cut again from the reader.
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /^Cut after/ })
  ).toHaveCount(0)
})

test("gives each part only its own pictures", async ({ page }) => {
  const whole = Buffer.from(await makeSharedPdf("Z", 6))
  await add(page, {
    name: "shared.pdf",
    mimeType: "application/pdf",
    buffer: whole,
  })
  await page.getByRole("button", { name: "Every page on its own" }).click()
  const result = await splitToZip(page)
  expect(result.parts).toHaveLength(6)
  let together = 0
  for (const part of result.parts) {
    expect(await storedPictures(part.bytes)).toBe(1)
    expect(part.bytes.length).toBeLessThan(SHARED_PICTURE * 1.5)
    expect(part.pages[0].pictures).toBe(1)
    together += part.bytes.length
  }
  expect(together).toBeLessThan(whole.length * 1.3)
})

test("opens locked and damaged files, and refuses what is not a PDF", async ({
  page,
}) => {
  await add(
    page,
    await pdf("locked.pdf", "L", { pages: 3, password: { user: "pw" } })
  )
  const locked = row(page, "locked.pdf")
  await expect(locked).toHaveAttribute("data-status", "locked")
  await expect(page.getByTestId("board-page")).toHaveCount(0)
  await page.getByLabel("Password for locked.pdf").fill("nope")
  await page.getByRole("button", { name: "Unlock" }).click()
  await expect(locked.getByRole("alert")).toContainText(
    "That password did not open this file"
  )
  await page.getByLabel("Password for locked.pdf").fill("pw")
  await page.getByRole("button", { name: "Unlock" }).click()
  await expect(page.getByTestId("board-page")).toHaveCount(3)
  await expect(locked).toContainText("Unlocked. The parts have no password.")
  await cutAfter(page, 1).click()
  const result = await splitToZip(page)
  expect(result.texts).toEqual([["L-P1"], ["L-P2", "L-P3"]])
  await page.getByRole("button", { name: "Remove locked.pdf" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to split" })
  ).toBeVisible()

  // A damaged file is repaired, and says so.
  const good = await pdf("damaged.pdf", "G", { pages: 2 })
  await page.locator("#split-file").setInputFiles({
    ...good,
    buffer: Buffer.from(damage(new Uint8Array(good.buffer), "table")),
  })
  await expect(row(page, "damaged.pdf")).toContainText(
    "damaged and has been repaired"
  )
  await expect(page.getByTestId("board-page")).toHaveCount(2)

  // What is not a PDF is refused, and the file that is open stays.
  await page.locator("#split-file").setInputFiles({
    name: "letter.docx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("PK not a pdf"),
  })
  await expect(page.getByRole("alert").first()).toContainText(
    "letter.docx is not a PDF. Save or export it as a PDF first"
  )
  await expect(page.getByTestId("file-row")).toHaveCount(1)

  // A file that cannot be read says so, and does not stop the other.
  await page.locator("#split-file").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nnothing here\n%%EOF"),
  })
  const broken = row(page, "broken.pdf")
  await expect(broken).toHaveAttribute("data-status", "error")
  await expect(broken.getByRole("alert")).toContainText("could not be read")
  await cutAfter(page, 1).click()
  await expect(page.getByTestId("plan")).toHaveText(
    "1 file to split · 1 file left out"
  )
  const rest = await splitToZip(page, "Split 1 file")
  expect(rest.texts).toEqual([["G-P1"], ["G-P2"]])
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to split" })
  ).toBeVisible()
})

test("splits a long file into many parts", async ({ page }) => {
  await add(page, await pdf("long.pdf", "M", { pages: 400 }))
  await page.getByRole("button", { name: "Every page on its own" }).click()
  await expect(page.getByTestId("plan")).toHaveText("400 parts from 400 pages")
  // The list shows the first parts and says how many more there are.
  await expect(page.getByTestId("part-row")).toHaveCount(100)
  await expect(page.getByTestId("parts-more")).toContainText("300 more parts")
  const result = await splitToZip(page)
  expect(result.names).toHaveLength(400)
  expect(result.names[0]).toBe("long-001.pdf")
  expect(result.names[399]).toBe("long-400.pdf")
  expect(result.texts[122]).toEqual(["M-P123"])
})

test("can be stopped, and keeps nothing when it is", async ({ page }) => {
  await add(page, await pdf("huge.pdf", "H", { pages: 3000 }))
  await page.getByRole("button", { name: "Every page on its own" }).click()
  await expect(page.getByTestId("plan")).toHaveText(
    "3,000 parts from 3,000 pages"
  )
  // Start and stop from inside the page: three thousand small parts take
  // about a second, less than a test needs to find and press a button.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        const button = (name: string) =>
          [...document.querySelectorAll("button")].find(
            (entry) => entry.textContent?.trim() === name
          )
        button("Split PDF")!.click()
        const stop = () => {
          const cancel = button("Cancel")
          if (!cancel) return requestAnimationFrame(stop)
          cancel.click()
          done()
        }
        stop()
      })
  )
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeEnabled({
    timeout: 60_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-split", "true")
  await expect(page.getByTestId("part-size")).toHaveCount(0)
  await expect(page.getByRole("status").last()).toHaveText(
    "Stopped. Nothing was kept."
  )
})

test("takes the sample, dropped files and more files later", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to split" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await expect(row(page, "keepsimp-report.pdf")).toContainText("3 pages")
  await expect(page.getByTestId("board-page")).toHaveCount(3)
  // The pictures of the pages are drawn.
  await expect(
    page.locator("[data-testid=board-page] canvas").first()
  ).toBeVisible({ timeout: 30_000 })

  // Dropping a file onto the tool adds it beside the one that is open.
  const dropped = await pdf("dropped.pdf", "D", { pages: 2 })
  const transfer = await page.evaluateHandle(
    ({ name, data }) => {
      const carried = new DataTransfer()
      carried.items.add(
        new File([new Uint8Array(data)], name, { type: "application/pdf" })
      )
      return carried
    },
    { name: dropped.name, data: [...dropped.buffer] }
  )
  await tool(page).dispatchEvent("drop", { dataTransfer: transfer })
  await expect(page.getByTestId("file-row")).toHaveCount(2)
  await expect(row(page, "dropped.pdf")).toContainText("2 pages")
  // The first file is still the one shown.
  await expect(page.getByTestId("board-page")).toHaveCount(3)
})

test("splits at bookmarks, and names the parts after them", async ({
  page,
}) => {
  await add(
    page,
    await pdf("Manual.pdf", "M", {
      pages: 10,
      bookmarks: [
        {
          title: "Getting started",
          page: 2,
          children: [
            { title: "Install", page: 3 },
            { title: "Set up", page: 4 },
          ],
        },
        {
          title: "Using it",
          page: 6,
          children: [{ title: "Every day", page: 7 }],
        },
        { title: "Appendix: tables", page: 9 },
      ],
    })
  )
  await mode(page, "By bookmarks").click()
  const rules = page.getByTestId("split-rules")
  // The top bookmarks start parts; the page before the first is a part of its own.
  await expect(
    rules.getByTestId("bookmark-list").getByRole("checkbox")
  ).toHaveCount(3)
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "2",
    "2",
    "2",
    "2",
    "3",
    "3",
    "3",
    "4",
    "4",
  ])
  await expect(page.getByTestId("part-row").nth(1)).toContainText(
    "Part 2 · pages 2-5 · 4 pages"
  )

  // A deeper level, with the front pages joined to the first part.
  await rules.getByRole("radio", { name: "Level 2", exact: true }).click()
  await rules
    .getByRole("radio", { name: "Join the first part", exact: true })
    .click()
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
    "3",
    "3",
    "3",
    "3",
  ])
  // A bookmark that is unticked no longer starts a part.
  await rules.getByRole("checkbox", { name: /Set up/ }).uncheck()
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
    "2",
  ])
  await rules.getByRole("button", { name: "Untick all" }).click()
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Tick at least one bookmark."
  )
  await rules.getByRole("button", { name: "Tick all", exact: true }).click()
  // Only bookmarks that hold the words typed.
  await rules.getByLabel("Only bookmarks that contain").fill("zebra")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "No bookmark at this level matches."
  )
  await rules.getByLabel("Only bookmarks that contain").fill("")

  await rules.getByRole("radio", { name: "Top bookmarks", exact: true }).click()
  await rules
    .getByRole("radio", { name: "A part of their own", exact: true })
    .click()
  const result = await splitToZip(page)
  expect(result.names).toEqual([
    "Manual-1-Front.pdf",
    "Manual-2-Getting-started.pdf",
    "Manual-3-Using-it.pdf",
    "Manual-4-Appendix-tables.pdf",
  ])
  expect(result.texts.map((part) => part.length)).toEqual([1, 4, 3, 2])
  expect(result.texts[2]).toEqual(["M-P6", "M-P7", "M-P8"])
  // Each part keeps the bookmarks of its own pages.
  expect(result.parts[1].bookmarks).toEqual([
    {
      title: "Getting started",
      to: 1,
      items: [
        { title: "Install", to: 2, items: [] },
        { title: "Set up", to: 3, items: [] },
      ],
    },
  ])

  // A file without bookmarks says so.
  await page.getByRole("button", { name: "Clear all" }).click()
  await page
    .locator("#split-file")
    .setInputFiles(await pdf("plain.pdf", "P", { pages: 3 }))
  await expect(tool(page)).toHaveAttribute("data-ready", "true")
  await mode(page, "By bookmarks").click()
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "This file has no bookmarks that lead to pages."
  )
})

test("splits by size, so every part stays under it", async ({ page }) => {
  // Eight pages, each with a picture of about 30 kB that cannot be compressed.
  await add(page, {
    name: "heavy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makeSharedPdf("W", 8)),
  })
  await mode(page, "By size").click()
  const rules = page.getByTestId("split-rules")
  await expect(page.getByTestId("plan")).toHaveText(
    "Parts of at most 10 MB from 8 pages"
  )
  await rules.getByRole("radio", { name: "Another size", exact: true }).click()
  await rules.getByLabel("Size", { exact: true }).fill("abc")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Type a size of at least 10 KB."
  )
  await expect(page.getByRole("button", { name: "Split PDF" })).toBeDisabled()
  await rules.getByLabel("Size", { exact: true }).fill("100")
  await rules.getByRole("radio", { name: "KB", exact: true }).click()
  await expect(page.getByTestId("plan")).toHaveText(
    "Parts of at most 100 KB from 8 pages"
  )
  const result = await splitToZip(page)
  expect(result.names).toEqual(["heavy-1.pdf", "heavy-2.pdf", "heavy-3.pdf"])
  expect(result.texts.map((part) => part.length)).toEqual([3, 3, 2])
  expect(result.texts.flat()).toEqual(
    Array.from({ length: 8 }, (_, at) => `W-P${at + 1}`)
  )
  for (const part of result.parts)
    expect(part.bytes.length).toBeLessThanOrEqual(100 * 1024)
  // The parts that were found are shown, on the board and in the list.
  expect(await partsOnBoard(page)).toEqual([
    "1",
    "1",
    "1",
    "2",
    "2",
    "2",
    "3",
    "3",
  ])
  await expect(page.getByTestId("part-row").nth(2)).toContainText(
    "Part 3 · pages 7-8 · 2 pages"
  )
  await expect(page.getByTestId("plan")).toHaveText("3 parts from 8 pages")

  // A size no page fits under: every page gets a part, and each row says why.
  await rules.getByLabel("Size", { exact: true }).fill("20")
  await expect(tool(page)).not.toHaveAttribute("data-split", "true")
  const small = await splitToZip(page)
  expect(small.parts).toHaveLength(8)
  await expect(
    page.getByTestId("part-row").filter({ hasText: "larger than the size" })
  ).toHaveCount(8)
})

test("splits several files at once, each into a folder of its own", async ({
  page,
}) => {
  await add(
    page,
    await pdf("alpha.pdf", "A", { pages: 4 }),
    await pdf("beta.pdf", "B", { pages: 6 }),
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nnothing here\n%%EOF"),
    }
  )
  await expect(page.getByTestId("file-row")).toHaveCount(3)
  await expect(page.getByRole("heading", { name: "3 files" })).toBeVisible()
  // The first file is shown; a rule places cuts in every file.
  await expect(row(page, "alpha.pdf")).toHaveAttribute("data-shown", "true")
  const rules = page.getByTestId("split-rules")
  await rules.getByRole("button", { name: "Place the cuts" }).first().click()
  await expect(row(page, "alpha.pdf").getByTestId("file-summary")).toHaveText(
    "2 parts"
  )
  await expect(row(page, "beta.pdf").getByTestId("file-summary")).toHaveText(
    "3 parts"
  )
  await expect(row(page, "broken.pdf")).toContainText("It is left out.")
  await expect(page.getByTestId("plan")).toHaveText(
    "2 files to split · 1 file left out"
  )

  // Another file is shown, and a cut by hand is for that file alone.
  await page.getByRole("button", { name: "Show the pages of beta.pdf" }).click()
  await expect(page.getByTestId("board-page")).toHaveCount(6)
  await cutAfter(page, 1).click()
  await expect(row(page, "beta.pdf").getByTestId("file-summary")).toHaveText(
    "4 parts"
  )
  await expect(row(page, "alpha.pdf").getByTestId("file-summary")).toHaveText(
    "2 parts"
  )
  await expect(page.getByTestId("result")).toContainText("Parts of beta.pdf")
  await expect(page.getByTestId("part-row")).toHaveCount(4)

  const result = await splitToZip(page, "Split 2 files")
  expect(result.zip).toBe("split-pdfs.zip")
  expect(result.names).toEqual([
    "alpha/alpha-1.pdf",
    "alpha/alpha-2.pdf",
    "beta/beta-1.pdf",
    "beta/beta-2.pdf",
    "beta/beta-3.pdf",
    "beta/beta-4.pdf",
  ])
  expect(result.texts).toEqual([
    ["A-P1", "A-P2"],
    ["A-P3", "A-P4"],
    ["B-P1"],
    ["B-P2"],
    ["B-P3", "B-P4"],
    ["B-P5", "B-P6"],
  ])
  await expect(page.getByTestId("result-facts")).toContainText("6 files")

  // Changing one file leaves the other's parts as they are; only that file is split again.
  await page
    .getByRole("button", { name: "Show the pages of alpha.pdf" })
    .click()
  await cutAfter(page, 1).click()
  await expect(tool(page)).not.toHaveAttribute("data-split", "true")
  const again = await splitToZip(page, "Split 2 files")
  expect(again.names.filter((name) => name.startsWith("alpha/"))).toHaveLength(
    3
  )
  expect(again.names.filter((name) => name.startsWith("beta/"))).toHaveLength(4)

  // The same ranges are taken from every file; a file too short for them is left out.
  await mode(page, "Page ranges").click()
  await page.getByLabel("Pages of each part").fill("1-2, 5-6")
  await expect(
    row(page, "alpha.pdf").getByTestId("file-summary")
  ).toContainText("has 4 pages")
  await expect(page.getByTestId("plan")).toHaveText(
    "1 file to split · 2 files left out"
  )
  const ranged = await splitToZip(page, "Split 1 file")
  expect(ranged.zip).toBe("beta-split.zip")
  expect(ranged.texts).toEqual([
    ["B-P1", "B-P2"],
    ["B-P5", "B-P6"],
  ])

  // Reading a file that is not shown shows it as well.
  await page
    .getByRole("button", { name: "Open beta.pdf in the reader" })
    .click()
  await readerReady(page)
  await page.keyboard.press("Escape")
  await expect(row(page, "beta.pdf")).toHaveAttribute("data-shown", "true")

  await page.getByRole("button", { name: "Remove broken.pdf" }).click()
  await page.getByRole("button", { name: "Remove alpha.pdf" }).click()
  await expect(page.getByTestId("file-row")).toHaveCount(1)
  await expect(page.getByRole("heading", { name: "1 file" })).toBeVisible()
})

test("splits a stack of scans at its blank pages", async ({ page }) => {
  await add(
    page,
    await plain("stack.pdf", [
      { body: "One" },
      {},
      { body: "Two" },
      { body: "Two b" },
      { speck: true },
      { body: "Three" },
    ])
  )
  await mode(page, "At blank pages").click()
  const status = page.getByTestId("blank-status")
  // An empty page and a page with nothing but a speck are found.
  await expect(status).toHaveText("2 blank pages of 6.", { timeout: 60_000 })
  expect(await partsOnBoard(page)).toEqual(["1", "", "2", "2", "", "3"])
  await expect(tile(page, 2)).toHaveAccessibleName("Page 2, blank")
  await expect(tile(page, 2)).toHaveAttribute("aria-pressed", "true")
  const result = await splitToZip(page)
  expect(result.texts).toEqual([["One"], ["Two", "Two b"], ["Three"]])

  // A strict setting does not take a speck for nothing.
  const rules = page.getByTestId("split-rules")
  await rules
    .getByRole("radio", { name: "Nothing at all", exact: true })
    .click()
  await expect(status).toHaveText("1 blank page of 6.")
  expect(await partsOnBoard(page)).toEqual(["1", "", "2", "2", "2", "2"])
  await rules
    .getByRole("radio", { name: "Specks or a page number", exact: true })
    .click()

  // Blank pages can stay at the end of their part.
  await rules
    .getByRole("radio", { name: "Cut after it, and keep it", exact: true })
    .click()
  expect(await partsOnBoard(page)).toEqual(["1", "1", "2", "2", "2", "3"])
  const kept = await splitToZip(page)
  expect(kept.parts.map((part) => part.pages.length)).toEqual([2, 3, 1])

  // A page found blank can be kept, and another page called blank, by pressing it.
  await tile(page, 5).click()
  await expect(status).toHaveText("1 blank page of 6.")
  await tile(page, 4).click()
  await expect(status).toHaveText("2 blank pages of 6.")
  expect(await partsOnBoard(page)).toEqual(["1", "1", "2", "2", "3", "3"])

  // Or they are only removed, and the rest stays one file.
  await rules
    .getByRole("radio", { name: "Only remove it", exact: true })
    .click()
  const cleaned = await makeOne(page)
  expect(cleaned.name).toBe("stack-no-blank-pages.pdf")
  expect(cleaned.pages.map((entry) => entry.text)).toEqual([
    "One",
    "Two",
    "",
    "Three",
  ])
})

test("starts a part at pages that hold certain words", async ({ page }) => {
  await add(
    page,
    await plain("letters.pdf", [
      { body: "Cover" },
      { top: "Invoice 1001", body: "Dear A" },
      { body: "more" },
      { top: "INVOICE 1002", body: "Dear B" },
      { top: "Invoice 1003", body: "Dear C" },
      { body: "end" },
    ])
  )
  await mode(page, "By text").click()
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Type the words that a part starts with."
  )
  const rules = page.getByTestId("split-rules")
  await rules.getByLabel("Words that a part starts with").fill("invoice")
  await expect(page.getByTestId("text-status")).toHaveText(
    "Found on 3 pages.",
    { timeout: 60_000 }
  )
  // The cover comes before the first of them, and is a part of its own.
  expect(await partsOnBoard(page)).toEqual(["1", "2", "2", "3", "4", "4"])
  await rules
    .getByRole("radio", { name: "Join the first part", exact: true })
    .click()
  expect(await partsOnBoard(page)).toEqual(["1", "1", "1", "2", "3", "3"])
  const result = await splitToZip(page)
  expect(result.names).toEqual([
    "letters-1.pdf",
    "letters-2.pdf",
    "letters-3.pdf",
  ])
  expect(result.texts.map((part) => part.length)).toEqual([3, 1, 2])

  await rules.getByLabel("Words that a part starts with").fill("zebra")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "No page holds those words.",
    { timeout: 60_000 }
  )
})

test("starts a part where the text in one place changes, and names parts after it", async ({
  page,
}) => {
  await add(
    page,
    await plain("bills.pdf", [
      { top: "No. 1001", body: "first" },
      { top: "No. 1001", body: "second" },
      { top: "No. 1002", body: "third" },
      { body: "no number here" },
      { top: "No. 1002", body: "fifth" },
      { top: "No. 1003", body: "sixth" },
    ])
  )
  await mode(page, "By text").click()
  const rules = page.getByTestId("split-rules")
  await rules
    .getByRole("radio", {
      name: "Where the text in one place changes",
      exact: true,
    })
    .click()
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Mark the area to read on a page."
  )
  await expect(page.getByTestId("area-page")).toHaveText("Page 1 of 6")
  await rules.getByRole("button", { name: "Top strip", exact: true }).click()
  await expect(page.getByTestId("area-mark")).toBeVisible()
  await expect(page.getByTestId("area-reads")).toHaveText(
    "On this page it reads: “No. 1001”",
    { timeout: 60_000 }
  )
  await expect(page.getByTestId("text-status")).toHaveText(
    "3 different texts found there."
  )
  // A page with nothing there stays with the part before it.
  expect(await partsOnBoard(page)).toEqual(["1", "1", "2", "2", "2", "3"])
  // The picture shows another page, and says what is read there.
  await rules.getByRole("button", { name: "Show the next page" }).click()
  await rules.getByRole("button", { name: "Show the next page" }).click()
  await rules.getByRole("button", { name: "Show the next page" }).click()
  await expect(page.getByTestId("area-page")).toHaveText("Page 4 of 6")
  await expect(page.getByTestId("area-reads")).toHaveText(
    "On this page there is no text there."
  )

  const result = await splitToZip(page)
  expect(result.names).toEqual([
    "bills-1-No.-1001.pdf",
    "bills-2-No.-1002.pdf",
    "bills-3-No.-1003.pdf",
  ])
  expect(result.texts.map((part) => part.length)).toEqual([2, 3, 1])

  // The edges can be typed: the lower half of the page holds no numbers.
  await rules.getByLabel("Top", { exact: true }).fill("50")
  await rules.getByLabel("Bottom", { exact: true }).fill("100")
  await rules.getByLabel("Bottom", { exact: true }).press("Enter")
  await expect(rules.getByLabel("Top", { exact: true })).toHaveValue("50")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "No text was found in that area",
    { timeout: 60_000 }
  )
  // Dragging over the picture marks an area as well.
  await page.getByTestId("area-stage").scrollIntoViewIfNeeded()
  const stage = await page.getByTestId("area-stage").boundingBox()
  await page.mouse.move(stage!.x + 4, stage!.y + 4)
  await page.mouse.down()
  await page.mouse.move(stage!.x + stage!.width - 4, stage!.y + 40, {
    steps: 4,
  })
  await page.mouse.up()
  await expect(page.getByTestId("text-status")).toHaveText(
    "3 different texts found there.",
    { timeout: 60_000 }
  )
  await rules.getByRole("button", { name: "Clear", exact: true }).click()
  await expect(page.getByTestId("area-mark")).toHaveCount(0)
})

test("cuts scans of two pages in half before splitting", async ({ page }) => {
  await add(page, {
    name: "book.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makeDoublePdf(3)),
  })
  await expect(page.getByTestId("board-page")).toHaveCount(3)
  const panel = page.getByTestId("halve-panel")
  await panel
    .getByRole("switch", { name: "Each page is a scan of two pages" })
    .click()
  // Every sheet is now two pages.
  await expect(page.getByTestId("board-page")).toHaveCount(6, {
    timeout: 60_000,
  })
  await expect(row(page, "book.pdf")).toContainText("6 pages")
  await page.getByRole("button", { name: "Every page on its own" }).click()
  const result = await splitToZip(page)
  expect(result.parts).toHaveLength(6)
  // Each part is one half of a sheet, 300 points wide.
  for (const part of result.parts)
    expect([part.pages[0].width, part.pages[0].height]).toEqual([300, 400])

  // A single cover stays whole, and the cuts that were placed are let go with the old pages.
  await panel
    .getByRole("switch", { name: "The first page is a single cover" })
    .click()
  await expect(page.getByTestId("board-page")).toHaveCount(5, {
    timeout: 60_000,
  })
  await expect(
    page.locator("[data-testid=board-cut][aria-pressed=true]")
  ).toHaveCount(0)
  await expect(tool(page)).not.toHaveAttribute("data-split", "true")
  // The cut can be moved with the keyboard.
  await panel.getByLabel("Where the cut is").focus()
  await page.keyboard.press("ArrowLeft")
  await expect(page.getByTestId("cut-at")).toHaveText("49% from the left")
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await page.getByRole("button", { name: "Every page on its own" }).click()
  const moved = await splitToZip(page)
  expect(moved.parts.map((part) => part.pages[0].width)).toEqual([
    600, 294, 306, 294, 306,
  ])

  // Turned off, the sheets are whole again.
  await panel
    .getByRole("switch", { name: "Each page is a scan of two pages" })
    .click()
  await expect(page.getByTestId("board-page")).toHaveCount(3, {
    timeout: 60_000,
  })
  await expect(row(page, "book.pdf")).toContainText("3 pages")
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
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  const empty = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(empty.violations).toEqual([])

  await page.locator("#split-file").setInputFiles([
    await pdf("check.pdf", "C", {
      pages: 5,
      bookmarks: [
        { title: "One", page: 1 },
        { title: "Two", page: 3 },
      ],
    }),
    await pdf("other.pdf", "O", { pages: 2 }),
  ])
  await expect(tool(page)).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  })
  await cutAfter(page, 2).click()
  await page.getByRole("switch", { name: "Include part 2" }).click()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    for (const name of [
      "Cut into parts",
      "Page ranges",
      "By bookmarks",
      "By size",
      "At blank pages",
      "By text",
      "Odd and even",
      "Extract pages",
    ]) {
      await mode(page, name).click()
      if (name === "Extract pages")
        await page.getByLabel("Pages to take out").fill("2")
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
      expect(results.violations, `${theme} ${name}`).toEqual([])
    }
  }
  // Page 2 is taken out of both files.
  await page.getByRole("button", { name: "Split 2 files" }).click()
  await waitForSplit(page)
  const done = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(done.violations).toEqual([])

  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await mode(page, "Cut into parts").click()
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
  await expect(help).toContainText("Each range you type becomes a part")
})
