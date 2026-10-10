import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { readFile } from "node:fs/promises"
import sharp from "sharp"
import { damage, makePdf, type FixtureOptions } from "../tests/pdf-fixtures"
import { readPdf } from "../tests/pdf-reader"

const ROUTE = "/dashboard/pdf-merger/"

type Upload = { name: string; mimeType: string; buffer: Buffer }

/** A PDF written by pdf-lib; every page says "<tag>-P<number>". */
async function pdf(
  name: string,
  tag: string,
  options: FixtureOptions = {}
): Promise<Upload> {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from(await makePdf(tag, options)),
  }
}

async function bytesOf(download: Download) {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  return new Uint8Array(Buffer.concat(chunks))
}

async function upload(page: Page, ...files: Upload[]) {
  await page.locator("#pdf-file").setInputFiles(files)
}

/** Wait until every file has been read. */
async function ready(page: Page) {
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 60_000 }
  )
}

/** Merge, download the result and read it back with pdf.js. */
async function merged(page: Page, password?: string) {
  await ready(page)
  await page.getByRole("button", { name: "Merge PDF" }).click()
  await expect(page.getByTestId("pdf-merger")).toHaveAttribute(
    "data-merged",
    "true",
    { timeout: 120_000 }
  )
  const pending = page.waitForEvent("download")
  await page.getByRole("link", { name: "Download PDF" }).click()
  const file = await pending
  const bytes = await bytesOf(file)
  return {
    name: file.suggestedFilename(),
    bytes,
    ...(await readPdf(bytes, password)),
  }
}

const chipIn = (
  scope: ReturnType<Page["getByTestId"]>,
  group: string,
  name: string
) =>
  scope
    .getByRole("radiogroup", { name: group, exact: true })
    .getByRole("radio", { name, exact: true })

const rowNames = (page: Page) =>
  page.getByTestId("file-row").locator("p.font-medium").allInnerTexts()

test.describe.configure({ timeout: 180_000 })

test("merges files in order and keeps pages, links and bookmarks", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to merge" })
  ).toBeVisible()
  await upload(
    page,
    await pdf("Report.pdf", "A", {
      pages: 3,
      size: (number) => [300 + number, 400],
      links: [
        { from: 1, to: 3 },
        { from: 2, to: 1, how: "name" },
      ],
      bookmarks: [
        { title: "Start", page: 1, children: [{ title: "Detail", page: 2 }] },
      ],
      notes: [{ page: 3, text: "Check this" }],
    }),
    await pdf("Appendix.pdf", "B", {
      pages: 2,
      bookmarks: [{ title: "Tables", page: 2 }],
    })
  )
  await ready(page)
  const rows = page.getByTestId("file-row")
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("Report.pdf")
  await expect(rows.nth(0)).toContainText("3 pages")
  await expect(rows.nth(1)).toContainText("2 pages")
  // Each file shows its first page.
  await expect(page.getByTestId("file-thumbnail")).toHaveCount(2)
  await expect(page.getByTestId("plan")).toContainText("5 pages from 2 files")

  await page
    .getByLabel("File name", { exact: true })
    .fill("Board pack / October")
  await expect(page.getByText("Board-pack-October.pdf")).toBeVisible()
  const result = await merged(page)
  expect(result.name).toBe("Board-pack-October.pdf")
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1",
    "A-P2",
    "A-P3",
    "B-P1",
    "B-P2",
  ])
  // Sizes are untouched, links lead where they did, and the note is still there.
  expect(result.pages.map((entry) => entry.width)).toEqual([
    301, 302, 303, 298, 298,
  ])
  expect(result.pages.map((entry) => entry.links)).toEqual([
    [3],
    [1],
    [],
    [],
    [],
  ])
  expect(result.pages[2].notes).toEqual(["Check this"])
  expect(result.bookmarks).toEqual([
    {
      title: "Report",
      to: 1,
      items: [
        {
          title: "Start",
          to: 1,
          items: [{ title: "Detail", to: 2, items: [] }],
        },
      ],
    },
    {
      title: "Appendix",
      to: 4,
      items: [{ title: "Tables", to: 5, items: [] }],
    },
  ])
  expect(result.info.Producer).toBe("KeepSimp")
  expect(result.encrypted).toBe(false)

  await expect(page.getByTestId("result-facts")).toContainText("5 pages")
  await expect(page.getByTestId("result-facts")).toContainText("5 bookmarks")
  await expect(page.getByTestId("result-facts")).toContainText(
    "than the files together"
  )
  // The result can be looked through in the browser's own viewer.
  await expect(
    page.getByRole("link", { name: "Open in a new tab" })
  ).toHaveAttribute("href", /^blob:/)

  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(
    page.getByRole("heading", { name: "Drop PDFs to merge" })
  ).toBeVisible()
})

test("reorders with buttons, by dragging and by sorting", async ({
  page,
  isMobile,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("Chapter 10.pdf", "T"),
    await pdf("chapter 2.pdf", "S"),
    await pdf("Appendix.pdf", "X")
  )
  await ready(page)
  expect(await rowNames(page)).toEqual([
    "Chapter 10.pdf",
    "chapter 2.pdf",
    "Appendix.pdf",
  ])
  const sort = (name: string) =>
    page
      .getByRole("radiogroup", { name: "Sort", exact: true })
      .getByRole("radio", { name, exact: true })
  await expect(sort("As added")).toBeChecked()

  // By name, 2 comes before 10.
  await sort("Name A–Z").click()
  expect(await rowNames(page)).toEqual([
    "Appendix.pdf",
    "chapter 2.pdf",
    "Chapter 10.pdf",
  ])
  await sort("Name Z–A").click()
  expect(await rowNames(page)).toEqual([
    "Chapter 10.pdf",
    "chapter 2.pdf",
    "Appendix.pdf",
  ])
  let result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "T-P1",
    "S-P1",
    "X-P1",
  ])

  // Moving a file by hand makes the order the person's own, and the result out of date.
  await page.getByRole("button", { name: "Move Appendix.pdf earlier" }).click()
  expect(await rowNames(page)).toEqual([
    "Chapter 10.pdf",
    "Appendix.pdf",
    "chapter 2.pdf",
  ])
  await expect(sort("Name Z–A")).not.toBeChecked()
  await expect(page.getByText("In your own order.")).toBeVisible()
  await expect(
    page.getByText("The list changed since the last merge")
  ).toBeVisible()
  await expect(page.getByRole("status")).toContainText(
    "Appendix.pdf is now number 2 of 3."
  )
  // The ends cannot go further.
  await expect(
    page.getByRole("button", { name: "Move Chapter 10.pdf earlier" })
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Move chapter 2.pdf later" })
  ).toBeDisabled()

  // Dragging the last row onto the first puts it there. A touch screen has
  // no mouse to drag with, so there the arrows do the same.
  if (isMobile) {
    const earlier = page.getByRole("button", {
      name: "Move chapter 2.pdf earlier",
    })
    await earlier.click()
    await earlier.click()
  } else
    await page
      .getByTestId("file-row")
      .nth(2)
      .dragTo(page.getByTestId("file-row").nth(0))
  expect(await rowNames(page)).toEqual([
    "chapter 2.pdf",
    "Chapter 10.pdf",
    "Appendix.pdf",
  ])
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "S-P1",
    "T-P1",
    "X-P1",
  ])

  // A file added to a sorted list goes to its place.
  await sort("Name A–Z").click()
  await upload(page, await pdf("Bibliography.pdf", "Y"))
  await ready(page)
  expect(await rowNames(page)).toEqual([
    "Appendix.pdf",
    "Bibliography.pdf",
    "chapter 2.pdf",
    "Chapter 10.pdf",
  ])
})

test("takes chosen pages, turns them and uses a file twice", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("book.pdf", "A", {
      pages: 6,
      rotate: { 2: 90 },
      links: [{ from: 6, to: 1 }],
    }),
    await pdf("cover.pdf", "B")
  )
  await ready(page)
  const range = page.getByLabel("Pages from book.pdf")
  await expect(range).toHaveAttribute("placeholder", "All 6 pages")
  await expect(page.getByLabel("Pages from cover.pdf")).toHaveAttribute(
    "placeholder",
    "The one page"
  )

  // Text that is not pages stops the merge and says why.
  await range.fill("2-9")
  await expect(
    page.getByTestId("file-row").nth(0).getByRole("alert")
  ).toContainText("This file has 6 pages, so use numbers from 1 to 6.")
  await expect(range).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Check the pages for book.pdf."
  )
  await expect(page.getByRole("button", { name: "Merge PDF" })).toBeDisabled()

  await range.fill("6, 2-1")
  await expect(page.getByText("Using 3 pages.")).toBeVisible()
  await expect(page.getByTestId("plan")).toContainText("4 pages from 2 files")
  await page.getByRole("button", { name: "Turn the pages of book.pdf" }).click()
  await expect(page.getByText("Using 3 pages, turned 90°.")).toBeVisible()
  let result = await merged(page)
  expect(result.pages.map((entry) => [entry.text, entry.rotate])).toEqual([
    ["A-P6", 90],
    // This page was already turned a quarter inside the file.
    ["A-P2", 180],
    ["A-P1", 90],
    ["B-P1", 0],
  ])
  // The link on page 6 follows page 1 to its new place.
  expect(result.pages[0].links).toEqual([3])
  // Only part of a file was used, so sizes are not compared.
  await expect(page.getByTestId("result-facts")).not.toContainText("together")

  // The same file again, after the first, with pages of its own.
  await page.getByRole("button", { name: "Add book.pdf again" }).click()
  await ready(page)
  expect(await rowNames(page)).toEqual(["book.pdf", "book.pdf", "cover.pdf"])
  await page.getByLabel("Pages from book.pdf").nth(1).fill("odd")
  await page.getByLabel("Pages from book.pdf").nth(0).fill("")
  await page
    .getByRole("button", { name: "Turn the pages of book.pdf" })
    .first()
    .click({ clickCount: 3 })
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1",
    "A-P2",
    "A-P3",
    "A-P4",
    "A-P5",
    "A-P6",
    "A-P1",
    "A-P3",
    "A-P5",
    "B-P1",
  ])
  // Four quarter turns are a full turn.
  expect(result.pages.map((entry) => entry.rotate).slice(0, 3)).toEqual([
    0, 90, 0,
  ])

  await page.getByRole("button", { name: "Remove cover.pdf" }).click()
  await expect(page.getByTestId("file-row")).toHaveCount(2)
  await expect(page.getByTestId("plan")).toContainText("9 pages from 2 files")
})

test("unlocks a password-protected file and merges it", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("open.pdf", "A"),
    await pdf("secret.pdf", "L", { pages: 2, password: { user: "s3cret" } }),
    await pdf("restricted.pdf", "R", { password: { user: "", owner: "boss" } })
  )
  await ready(page)
  const locked = page.getByTestId("file-row").nth(1)
  await expect(locked).toHaveAttribute("data-status", "locked")
  await expect(locked).toContainText("Locked")
  await expect(locked).toContainText("is not kept")
  // Merging waits for the password.
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Enter the password for secret.pdf, or remove it."
  )
  await expect(page.getByRole("button", { name: "Merge PDF" })).toBeDisabled()

  const password = page.getByLabel("Password for secret.pdf")
  await expect(password).toHaveAttribute("type", "password")
  await password.fill("wrong")
  await locked.getByRole("button", { name: "Unlock" }).click()
  await expect(locked.getByRole("alert")).toContainText(
    "That password did not open this file."
  )
  await page.getByLabel("Password for secret.pdf").fill("s3cret")
  await page.getByLabel("Password for secret.pdf").press("Enter")
  await ready(page)
  await expect(locked).toHaveAttribute("data-status", "ready")
  await expect(locked).toContainText("2 pages")
  await expect(locked).toContainText(
    "Unlocked. The merged file has no password unless you set one."
  )
  // A file that only restricts changes opens by itself, with a reminder.
  const restricted = page.getByTestId("file-row").nth(2)
  await expect(restricted).toContainText("Its author restricted changes.")
  await expect(restricted).not.toContainText("Unlocked.")

  const result = await merged(page)
  expect(result.encrypted).toBe(false)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1",
    "L-P1",
    "L-P2",
    "R-P1",
  ])
})

test("repairs a damaged file and leaves out what cannot be read", async ({
  page,
}) => {
  await page.goto(ROUTE)
  const good = await pdf("good.pdf", "G", { pages: 2 })
  const cut = {
    name: "half-downloaded.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(damage(await makePdf("D", { pages: 3 }), "cut")),
  }
  await upload(
    page,
    good,
    cut,
    // Says it is a PDF and holds nothing a PDF needs.
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nthis is not a real file\n%%EOF"),
    },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    // Named like a PDF, starts like a picture, and is neither.
    {
      name: "picture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("\x89PNG\r\n\x1a\nnot really", "latin1"),
    },
    { name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }
  )
  await ready(page)
  // Files that are not PDFs at all never join the list.
  const notice = page.getByRole("main").getByRole("alert").first()
  await expect(notice).toContainText(
    "notes.txt is not a PDF. Save or export it as a PDF first, then add that."
  )
  await expect(notice).toContainText("empty.pdf: This file is empty.")
  const rows = page.getByTestId("file-row")
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(3)).toContainText(
    "This picture could not be read. It may be damaged."
  )
  await expect(rows.nth(1)).toContainText(
    "This file was damaged and has been repaired."
  )
  await expect(rows.nth(2)).toHaveAttribute("data-status", "error")
  await expect(rows.nth(2)).toContainText("It is left out of the merge.")
  await expect(page.getByTestId("plan")).toContainText("5 pages from 2 files")
  await expect(page.getByTestId("plan")).toContainText("2 files left out")

  const result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "G-P1",
    "G-P2",
    "D-P1",
    "D-P2",
    "D-P3",
  ])
})

test("keeps fillable fields, layers and a signature's picture", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("form-a.pdf", "A", {
      fields: [{ name: "name", value: "Ada", page: 1 }],
      layers: true,
    }),
    await pdf("form-b.pdf", "B", {
      fields: [{ name: "name", value: "Grace", page: 1 }],
    }),
    await pdf("signed.pdf", "S", { signed: true, tagged: true })
  )
  await ready(page)
  const signed = page.getByTestId("file-row").nth(2)
  await expect(signed).toContainText(
    "Its digital signature cannot stay valid in a merged file."
  )
  await expect(signed).toContainText(
    "Its accessibility tags are not carried over."
  )
  const result = await merged(page)
  // Two fields called "name": the second is renamed and keeps its own value.
  expect(result.fields).toEqual(["name", "name_2"])
  expect(result.pages.map((entry) => entry.fields)).toEqual([
    ["name=Ada"],
    ["name_2=Grace"],
    [],
  ])
  expect(result.layers).toEqual([
    { name: "A shown", visible: true },
    { name: "A hidden", visible: false },
  ])
  expect(result.signatures).toBe(false)
  expect(result.pages[2].kinds).toEqual(["Stamp"])
})

test("shows progress for a long merge and stops when asked", async ({
  page,
}) => {
  await page.goto(ROUTE)
  // Long enough that the merge is still copying pages when Cancel is pressed.
  await upload(page, await pdf("long.pdf", "A", { pages: 4000 }))
  await ready(page)
  await expect(page.getByTestId("plan")).toContainText(
    "4,000 pages from 1 file"
  )
  await page.getByRole("button", { name: "Merge PDF" }).click()
  await expect(page.getByRole("progressbar", { name: "Merging" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
  // Nothing was made, and the file is ready to merge again.
  await expect(page.getByRole("button", { name: "Merge PDF" })).toBeEnabled()
  await expect(page.getByTestId("pdf-merger")).not.toHaveAttribute(
    "data-merged",
    "true"
  )
  await page.getByLabel("Pages from long.pdf").fill("3999-")
  const result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P3999",
    "A-P4000",
  ])
})

test("accepts dropped files and the samples", async ({ page }) => {
  await page.goto(ROUTE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await ready(page)
  expect(await rowNames(page)).toEqual([
    "keepsimp-report.pdf",
    "keepsimp-appendix.pdf",
  ])
  const file = await pdf("dropped.pdf", "D")
  const transfer = await page.evaluateHandle(
    (data) => {
      const dt = new DataTransfer()
      dt.items.add(
        new File([new Uint8Array(data)], "dropped.pdf", {
          type: "application/pdf",
        })
      )
      return dt
    },
    [...file.buffer]
  )
  await page.getByTestId("file-list").dispatchEvent("drop", {
    dataTransfer: transfer,
  })
  await expect(page.getByTestId("file-row")).toHaveCount(3)
  const result = await merged(page)
  expect(result.pages).toHaveLength(6)
  expect(result.pages[5].text).toBe("D-P1")
  expect(result.bookmarks.map((entry) => entry.title)).toEqual([
    "keepsimp-report",
    "keepsimp-appendix",
    "dropped",
  ])
  // The sample's link still leads to its last page.
  expect(result.pages[0].links).toEqual([3])
})

/** The pages of the Pages view, as short labels: "A2" for page 2 of A.pdf, "A2↻" when turned. */
async function tiles(page: Page) {
  const labels = await page
    .getByTestId("page-tile")
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? "")
    )
  return labels.map((label) => {
    const match =
      /^Page \d+: (.*?)(?:\.pdf, page (\d+))?(, turned \d+°)?$/.exec(label)!
    return `${match[1] === "Blank page" ? "blank" : match[1]}${match[2] ?? ""}${match[3] ? "↻" : ""}`
  })
}
const tile = (page: Page, at: number) =>
  page.getByTestId("page-tile").nth(at).getByRole("button")
const openPages = async (page: Page) => {
  await ready(page)
  await page.getByRole("radio", { name: /^Pages/ }).click()
  await expect(page.getByTestId("page-grid")).toBeVisible()
}

test("arranges single pages: select, turn, move, copy, remove, blank, undo", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("A.pdf", "A", { pages: 4, links: [{ from: 2, to: 4 }] }),
    await pdf("B.pdf", "B", { pages: 2 })
  )
  await openPages(page)
  await expect(page.getByRole("radio", { name: "Pages (6)" })).toBeChecked()
  expect(await tiles(page)).toEqual(["A1", "A2", "A3", "A4", "B1", "B2"])
  // Every page gets its picture.
  await expect(page.getByTestId("page-tile").locator("canvas")).toHaveCount(6)
  await expect(page.getByTestId("selection-count")).toHaveText("None selected")
  await expect(
    page.getByRole("button", { name: "Turn clockwise" })
  ).toBeDisabled()

  // Click, then Shift-click: everything between is selected.
  await tile(page, 1).click()
  await tile(page, 3).click({ modifiers: ["Shift"] })
  await expect(page.getByTestId("selection-count")).toHaveText("3 selected")
  await expect(tile(page, 2)).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Turn clockwise" }).click()
  await page.getByRole("button", { name: "Move to the start" }).click()
  expect(await tiles(page)).toEqual(["A2↻", "A3↻", "A4↻", "A1", "B1", "B2"])
  await expect(page.getByRole("status")).toContainText(
    "Moved 3 pages to the start."
  )
  // From the first change, the pages are the person's own arrangement.
  await expect(page.getByTestId("arranged-note")).toContainText(
    "Pages are in your own order"
  )
  await expect(page.getByTestId("plan")).toContainText(
    "6 pages from 2 files, in your own order"
  )

  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await tile(page, 3).click()
  await page.getByRole("button", { name: "Remove", exact: true }).click()
  expect(await tiles(page)).toEqual(["A2↻", "A3↻", "A4↻", "B1", "B2"])
  await expect(page.getByRole("status")).toContainText(
    "Removed 1 page. 5 pages left."
  )
  await page.getByRole("button", { name: "Undo" }).click()
  expect(await tiles(page)).toHaveLength(6)
  await page.getByRole("button", { name: "Redo" }).click()
  expect(await tiles(page)).toHaveLength(5)
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled()

  // A copy follows its page; a blank page follows the selected one.
  await tile(page, 3).click()
  await page.getByRole("button", { name: "Copy", exact: true }).click()
  await page.getByRole("button", { name: "Add a blank page" }).click()
  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await tile(page, 0).click()
  await page.getByRole("button", { name: "Move later" }).click()
  await page.getByRole("button", { name: "Turn anticlockwise" }).click()
  expect(await tiles(page)).toEqual([
    "A3↻",
    "A2",
    "A4↻",
    "B1",
    "blank",
    "B1",
    "B2",
  ])
  await expect(page.getByTestId("page-tile").nth(4)).toContainText("Blank")

  const result = await merged(page)
  expect(result.pages.map((entry) => [entry.text, entry.rotate])).toEqual([
    ["A-P3", 90],
    ["A-P2", 0],
    ["A-P4", 90],
    ["B-P1", 0],
    ["", 0],
    ["B-P1", 0],
    ["B-P2", 0],
  ])
  // The blank page takes the size of the file beside it.
  expect([result.pages[4].width, result.pages[4].height]).toEqual([298, 420])
  // Page 2's link to page 4 follows it to its new place.
  expect(result.pages[1].links).toEqual([3])

  // The Files view still shows the files, but no longer sets the result.
  await page.getByRole("radio", { name: "Files", exact: true }).click()
  await expect(page.getByTestId("arranged-note")).toContainText(
    "no longer change the result"
  )
  await expect(
    page.getByRole("button", { name: "Move B.pdf earlier" })
  ).toBeDisabled()
  await expect(page.getByLabel("Pages from A.pdf")).toBeHidden()
  // A file added now joins at the end; a removed one takes its pages with it.
  await upload(page, await pdf("C.pdf", "C"))
  await ready(page)
  await page.getByRole("button", { name: "Remove B.pdf" }).click()
  await page.getByRole("radio", { name: /^Pages/ }).click()
  expect(await tiles(page)).toEqual(["A3↻", "A2", "A4↻", "blank", "C1"])

  // Going back to whole files is asked for twice, then done.
  await page.getByRole("button", { name: "Start again from the files" }).click()
  await page.getByRole("button", { name: "Keep it" }).click()
  await expect(page.getByTestId("arranged-note")).toBeVisible()
  await page.getByRole("button", { name: "Start again from the files" }).click()
  await page.getByRole("button", { name: "Discard my page order" }).click()
  await expect(page.getByTestId("arranged-note")).toBeHidden()
  await expect(page.getByLabel("Pages from A.pdf")).toBeVisible()
  await expect(page.getByTestId("plan")).toContainText("5 pages from 2 files")
})

test("works the Pages view from the keyboard, and by dragging", async ({
  page,
  isMobile,
}) => {
  await page.goto(ROUTE)
  await upload(page, await pdf("A.pdf", "A", { pages: 5 }))
  await openPages(page)
  // One tile is in the tab order; arrows move between tiles.
  await tile(page, 0).focus()
  await page.keyboard.press("ArrowRight")
  await expect(tile(page, 1)).toBeFocused()
  await page.keyboard.press("End")
  await expect(tile(page, 4)).toBeFocused()
  await page.keyboard.press("Home")
  // Space selects; Shift with an arrow selects on from there.
  await page.keyboard.press("Space")
  await page.keyboard.press("Shift+ArrowRight")
  await expect(page.getByTestId("selection-count")).toHaveText("2 selected")
  // Alt with an arrow moves the selected pages; R turns them.
  await page.keyboard.press("Alt+ArrowRight")
  expect(await tiles(page)).toEqual(["A3", "A1", "A2", "A4", "A5"])
  await expect(page.getByRole("status")).toContainText(
    "Moved 2 pages later. Now at position 2 of 5."
  )
  await page.keyboard.press("r")
  expect(await tiles(page)).toEqual(["A3", "A1↻", "A2↻", "A4", "A5"])
  await page.keyboard.press("Shift+R")
  expect(await tiles(page)).toEqual(["A3", "A1", "A2", "A4", "A5"])
  // Escape lets go of the selection; then keys act on the page that has focus.
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("selection-count")).toHaveText("None selected")
  await page.keyboard.press("End")
  await page.keyboard.press("Delete")
  expect(await tiles(page)).toEqual(["A3", "A1", "A2", "A4"])
  await expect(tile(page, 3)).toBeFocused()
  await page.keyboard.press("ControlOrMeta+z")
  expect(await tiles(page)).toHaveLength(5)
  await page.keyboard.press("ControlOrMeta+Shift+z")
  expect(await tiles(page)).toHaveLength(4)
  await page.keyboard.press("ControlOrMeta+a")
  await expect(page.getByTestId("selection-count")).toHaveText("4 selected")
  await page.keyboard.press("Escape")

  // Dragging a page onto the left half of another puts it before that page.
  if (!isMobile) {
    await page
      .getByTestId("page-tile")
      .nth(3)
      .dragTo(page.getByTestId("page-tile").nth(0), {
        targetPosition: { x: 8, y: 60 },
      })
    expect(await tiles(page)).toEqual(["A4", "A3", "A1", "A2"])
    // Dragging one of several selected pages takes them all.
    await tile(page, 1).click()
    await tile(page, 2).click()
    const box = (await page.getByTestId("page-tile").nth(3).boundingBox())!
    await page
      .getByTestId("page-tile")
      .nth(1)
      .dragTo(page.getByTestId("page-tile").nth(3), {
        targetPosition: { x: box.width - 8, y: 60 },
      })
    expect(await tiles(page)).toEqual(["A4", "A2", "A3", "A1"])
  }
  const result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual(
    isMobile
      ? ["A-P3", "A-P1", "A-P2", "A-P4"]
      : ["A-P4", "A-P2", "A-P3", "A-P1"]
  )
})

test("shows a page large, and steps to the pages beside it", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(page, await pdf("A.pdf", "A", { pages: 3 }))
  await openPages(page)
  await tile(page, 1).click()
  await page.getByRole("button", { name: "Add a blank page" }).click()
  await page.getByRole("button", { name: "Look at the page closely" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByRole("heading")).toHaveText("Page 2 of 4")
  await expect(sheet).toContainText("A.pdf, page 2")
  const stage = page.getByTestId("page-preview")
  await expect(stage).toHaveAttribute("data-state", "drawn", {
    timeout: 30_000,
  })
  // The picture is far larger than a tile's.
  expect(
    await stage
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.height)
  ).toBeGreaterThan(1000)
  await sheet.getByRole("button", { name: "Next" }).click()
  await expect(sheet.getByRole("heading")).toHaveText("Page 3 of 4")
  await expect(sheet).toContainText("Blank page")
  await sheet.getByRole("button", { name: "Previous" }).click()
  await sheet.getByRole("button", { name: "Previous" }).click()
  await expect(sheet.getByRole("heading")).toHaveText("Page 1 of 4")
  await expect(sheet.getByRole("button", { name: "Previous" })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  // A double click on a page opens it too.
  await tile(page, 3).dblclick()
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
    "Page 4 of 4"
  )
})

test("alternates the pages of two files, for fronts and backs", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("fronts.pdf", "F", { pages: 3 }),
    // The backs were scanned with the stack turned over: last page first.
    await pdf("backs.pdf", "K", { pages: 3 })
  )
  await ready(page)
  await page.getByRole("button", { name: "Alternate pages" }).click()
  await expect(page.getByTestId("alternate")).toContainText(
    "the first page of each file, then the second"
  )
  await page
    .getByRole("switch", { name: "The last file is in reverse order" })
    .click()
  await page.getByRole("button", { name: "Alternate the pages" }).click()
  // The result opens in the Pages view, to be checked.
  await expect(page.getByTestId("page-grid")).toBeVisible()
  expect(await tiles(page)).toEqual([
    "fronts1",
    "backs3",
    "fronts2",
    "backs2",
    "fronts3",
    "backs1",
  ])
  const result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "F-P1",
    "K-P3",
    "F-P2",
    "K-P2",
    "F-P3",
    "K-P1",
  ])
  // One undo puts the files back as they were.
  await page.getByRole("button", { name: "Undo" }).click()
  // With nothing left to undo, the file list sets the result again.
  await expect(page.getByTestId("arranged-note")).toBeHidden()
  expect(await tiles(page)).toEqual([
    "fronts1",
    "fronts2",
    "fronts3",
    "backs1",
    "backs2",
    "backs3",
  ])
})

test("turns pictures into pages", async ({ page }) => {
  await page.goto(ROUTE)
  // A photograph stored on its side, as phones store them.
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#c2410c" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
  const logo = await sharp({
    create: {
      width: 300,
      height: 150,
      channels: 4,
      background: { r: 0, g: 120, b: 111, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
  await upload(
    page,
    await pdf("letter.pdf", "A", { size: () => [400, 600] }),
    { name: "holiday.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "logo.png", mimeType: "image/png", buffer: logo },
    {
      name: "coast.heic",
      mimeType: "image/heic",
      buffer: await readFile("e2e/fixtures/coastline-small.heic"),
    },
    {
      name: "drawing.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    }
  )
  await ready(page)
  await expect(page.getByRole("main").getByRole("alert").first()).toContainText(
    "drawing.svg: SVG cannot be added as a page. Convert it to PNG first."
  )
  const rows = page.getByTestId("file-row")
  await expect(rows).toHaveCount(4)
  // The photograph is described the way it is shown: upright.
  await expect(rows.nth(1)).toContainText("Picture · 600 × 900 px")
  await expect(rows.nth(2)).toContainText("Picture · 300 × 150 px")
  await expect(rows.nth(3)).toContainText("Picture ·")
  await expect(page.getByLabel("Pages from holiday.jpg")).toBeHidden()
  await expect(page.getByTestId("file-thumbnail")).toHaveCount(4)

  const options = page.getByTestId("picture-options")
  await expect(
    chipIn(options, "Page size", "Like the page before")
  ).toBeChecked()
  let result = await merged(page)
  expect(result.pages.map((entry) => entry.pictures)).toEqual([0, 1, 1, 1])
  expect(
    result.pages.slice(0, 3).map((entry) => [entry.width, entry.height])
  ).toEqual([
    [400, 600],
    // Upright, like the letter before it; the wide logo turns the sheet.
    [400, 600],
    [600, 400],
  ])
  // The photograph went in as the JPEG it was.
  expect(Buffer.from(result.bytes).includes(photo.subarray(0, 200))).toBe(true)

  await chipIn(options, "Page size", "Fit the picture").click()
  await expect(options.getByRole("radiogroup", { name: "Margin" })).toBeHidden()
  result = await merged(page)
  expect(
    result.pages.slice(1, 3).map((entry) => [entry.width, entry.height])
  ).toEqual([
    // 600 × 900 and 300 × 150 pixels at 150 to the inch.
    [288, 432],
    [144, 72],
  ])
  await chipIn(options, "Page size", "A4").click()
  await chipIn(options, "Margin", "None").click()
  result = await merged(page)
  expect(
    result.pages.slice(1, 3).map((entry) => [entry.width, entry.height])
  ).toEqual([
    [595.28, 841.89],
    [841.89, 595.28],
  ])
  // In the Pages view a picture is one page, named after its file.
  await page.getByRole("radio", { name: /^Pages/ }).click()
  expect(
    await page
      .getByTestId("page-tile")
      .getByRole("button")
      .nth(1)
      .getAttribute("aria-label")
  ).toBe("Page 2: holiday.jpg")
})

test("chooses how bookmarks are kept and adds a contents page", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("Cover.pdf", "C", { title: "The cover" }),
    await pdf("Report.pdf", "A", {
      pages: 2,
      title: "Annual report 2026",
      bookmarks: [{ title: "Summary", page: 2 }],
    }),
    // A name the PDF's built-in font cannot write.
    await pdf("概要.pdf", "B", { bookmarks: [{ title: "Start", page: 1 }] })
  )
  await ready(page)
  const options = page.getByTestId("structure-options")
  const titles = (result: Awaited<ReturnType<typeof merged>>) =>
    result.bookmarks.map((entry) => `${entry.title}>${entry.to}`)

  await expect(chipIn(options, "Bookmarks", "Under each file")).toBeChecked()
  await chipIn(options, "Bookmarks", "Keep all").click()
  expect(titles(await merged(page))).toEqual(["Summary>3", "Start>4"])
  await chipIn(options, "Bookmarks", "One per file").click()
  expect(titles(await merged(page))).toEqual(["Cover>1", "Report>2", "概要>4"])
  await chipIn(options, "Bookmarks", "None").click()
  expect(titles(await merged(page))).toEqual([])

  // A contents page: every file, the page it starts on, and a link there.
  await expect(
    options.getByRole("switch", { name: "The first file is a cover" })
  ).toBeHidden()
  await chipIn(options, "Contents page", "File names").click()
  await chipIn(options, "Bookmarks", "One per file").click()
  let result = await merged(page)
  expect(result.pages).toHaveLength(5)
  // The third name is drawn as a picture, since the font has no letters for it.
  expect(result.pages[0].text).toBe("Contents Cover 2 Report 3 5")
  expect(result.pages[0].pictures).toBe(1)
  expect(result.pages[0].links).toEqual([2, 3, 5])
  expect(titles(result)).toEqual([
    "Contents>1",
    "Cover>2",
    "Report>3",
    "概要>5",
  ])
  await expect(page.getByTestId("result-facts")).toContainText("5 pages")

  // With a cover, the contents come after it and do not list it.
  await options
    .getByRole("switch", { name: "The first file is a cover" })
    .click()
  await chipIn(options, "Contents page", "Document titles").click()
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "C-P1",
    // The second file has no title of its own inside, so its name is used.
    "Contents Annual report 2026 3 5",
    "A-P1",
    "A-P2",
    "B-P1",
  ])
  expect(result.pages[1].links).toEqual([3, 5])
})

test("keeps, joins, flattens or removes fillable fields", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await pdf("plain.pdf", "P"))
  await ready(page)
  const options = page.getByTestId("structure-options")
  // The choice only appears once a file has fields.
  await expect(options.getByRole("radiogroup", { name: "Fields" })).toBeHidden()
  await upload(
    page,
    await pdf("form-a.pdf", "A", {
      fields: [{ name: "name", value: "Ada", page: 1 }],
    }),
    await pdf("form-b.pdf", "B", {
      fields: [{ name: "name", value: "Grace", page: 1 }],
    })
  )
  await ready(page)
  await expect(chipIn(options, "Fields", "Keep")).toBeChecked()

  await chipIn(options, "Fields", "Join same names").click()
  await expect(options).toContainText("The entry from the first file is kept.")
  let result = await merged(page)
  expect(result.fields).toEqual(["name"])
  expect(result.pages.map((entry) => entry.fields)).toEqual([
    [],
    ["name=Ada"],
    ["name=Ada"],
  ])

  await chipIn(options, "Fields", "Flatten").click()
  result = await merged(page)
  expect(result.fields).toEqual([])
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "P-P1",
    "A-P1 Ada",
    "B-P1 Grace",
  ])

  await chipIn(options, "Fields", "Remove").click()
  result = await merged(page)
  expect(result.fields).toEqual([])
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "P-P1",
    "A-P1",
    "B-P1",
  ])
})

test("writes details, keeps page numbers and carries attachments", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("book.pdf", "A", {
      pages: 3,
      romanPages: 2,
      title: "The book",
      author: "Ada Lovelace",
      keywords: "engines",
      attachments: { "note.txt": "from the book" },
    }),
    await pdf("extra.pdf", "B", {
      attachments: { "note.txt": "from the extra", "data.csv": "1,2" },
    })
  )
  await ready(page)
  const structure = page.getByTestId("structure-options")
  const output = page.getByTestId("output-options")

  // By default nothing is taken from the files, and pages count from 1.
  let result = await merged(page)
  expect(result.info.Title).toBeUndefined()
  expect(result.info.Author).toBeUndefined()
  expect(result.labels).toBeNull()
  expect(result.attachments).toEqual(["data.csv", "note (2).txt", "note.txt"])

  await output
    .getByRole("button", { name: "Take them from the first file" })
    .click()
  await expect(output.getByLabel("Title")).toHaveValue("The book")
  await expect(output.getByLabel("Author")).toHaveValue("Ada Lovelace")
  await output.getByLabel("Subject").fill("Merged for the board")
  await chipIn(
    structure,
    "Page numbers shown by a viewer",
    "Each file's own"
  ).click()
  await structure
    .getByRole("switch", { name: "Keep the 3 attached files" })
    .click()
  result = await merged(page)
  expect(result.info).toMatchObject({
    Title: "The book",
    Author: "Ada Lovelace",
    Subject: "Merged for the board",
    Keywords: "engines",
    Producer: "KeepSimp",
  })
  expect(result.labels).toEqual(["i", "ii", "1", "1"])
  expect(result.attachments).toEqual([])
})

test("locks the merged PDF with a password and limits", async ({ page }) => {
  await page.goto(ROUTE)
  await upload(page, await pdf("a.pdf", "A", { pages: 2 }))
  await ready(page)
  const output = page.getByTestId("output-options")
  await expect(output.getByLabel("Password to open the file")).toBeHidden()
  await output
    .getByRole("switch", { name: "Lock the merged PDF with a password" })
    .click()
  // A lock without a password stops the merge and says why.
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Enter a password for the merged PDF, or turn the password off."
  )
  await expect(page.getByRole("button", { name: "Merge PDF" })).toBeDisabled()
  const password = 'pä, ss=w "ord"'
  await output.getByLabel("Password to open the file").fill(password)
  await expect(output.getByLabel("Password to open the file")).toHaveAttribute(
    "type",
    "password"
  )
  // With nothing limited, there is no second password to ask for.
  await expect(output.getByLabel(/^Second password/)).toBeHidden()

  let result = await merged(page, password)
  expect(result.encrypted).toBe(true)
  expect(result.pages.map((entry) => entry.text)).toEqual(["A-P1", "A-P2"])
  await expect(page.getByTestId("result-facts")).toContainText(
    "locked with your password"
  )
  // Without the password, another reader cannot open it.
  await expect(readPdf(result.bytes)).rejects.toMatchObject({
    name: "PasswordException",
  })
  for (const flag of [4, 8, 16]) expect(result.permissions).toContain(flag)

  // Limits: no printing, no changes; copying stays allowed.
  await output.getByRole("switch", { name: "Allow printing" }).click()
  await output.getByRole("switch", { name: "Allow changes" }).click()
  const second = output.getByLabel(/^Second password/)
  await second.fill(password)
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "The second password must differ from the first"
  )
  await second.fill("owner-key")
  result = await merged(page, password)
  expect(result.permissions).toContain(16)
  expect(result.permissions).not.toContain(4)
  expect(result.permissions).not.toContain(8)
  // The second password opens it as well.
  expect((await readPdf(result.bytes, "owner-key")).pages).toHaveLength(2)

  // Starting again leaves no password behind.
  await page.getByRole("button", { name: "Clear all" }).click()
  await upload(page, await pdf("b.pdf", "B"))
  await ready(page)
  await expect(
    page.getByRole("switch", { name: "Lock the merged PDF with a password" })
  ).not.toBeChecked()
  expect((await merged(page)).encrypted).toBe(false)
})

test("gets the result ready for paper: one page size, footers and blank backs", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("Report.pdf", "A", {
      pages: 3,
      size: (number) => (number === 2 ? [800, 600] : [300, 400]),
      links: [{ from: 1, to: 3 }],
    }),
    await pdf("Annex.pdf", "B")
  )
  await ready(page)
  const options = page.getByTestId("print-options")
  const shape = (result: Awaited<ReturnType<typeof merged>>) =>
    result.pages.map((entry) => [
      Math.round(entry.width),
      Math.round(entry.height),
    ])

  // One size for every page; the wide page gets the sheet on its side.
  await expect(
    options.getByRole("switch", { name: "Enlarge smaller pages" })
  ).toBeHidden()
  await chipIn(options, "Page size", "A4").click()
  let result = await merged(page)
  expect(shape(result)).toEqual([
    [595, 842],
    [842, 595],
    [595, 842],
    [595, 842],
  ])
  expect(result.pages[0].links).toEqual([3])
  await chipIn(options, "Page size", "Like the largest").click()
  expect(shape(await merged(page))[0]).toEqual([600, 800])
  await chipIn(options, "Page size", "As they are").click()

  // File names and page numbers at the foot of every page.
  await options.getByRole("switch", { name: "File name on every page" }).click()
  await chipIn(options, "Page numbers", "3 of 12").click()
  await chipIn(options, "Number position", "Right").click()
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1 1 of 4 Report",
    "A-P2 2 of 4 Report",
    "A-P3 3 of 4 Report",
    "B-P1 4 of 4 Annex",
  ])
  await options.getByLabel("Start at").fill("10")
  await chipIn(options, "Page numbers", "3").click()
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text.split(" ")[1])).toEqual([
    "10",
    "11",
    "12",
    "13",
  ])
  await options.getByLabel("Start at").fill("")
  await expect(page.getByTestId("result").getByRole("alert")).toContainText(
    "Start page numbers at a whole number from 0 to 99,999."
  )
  await chipIn(options, "Page numbers", "None").click()
  await options.getByRole("switch", { name: "File name on every page" }).click()

  // Double-sided: a blank page after the three-page file, so the next starts on a new sheet.
  await options
    .getByRole("switch", {
      name: "Double-sided: start every file on a new sheet",
    })
    .click()
  await expect(page.getByTestId("plan")).toContainText("5 pages from 2 files")
  result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1",
    "A-P2",
    "A-P3",
    "",
    "B-P1",
  ])
  // The blank page shows in the Pages view; once pages are arranged by hand, the switch gives way to a note.
  await page.getByRole("radio", { name: /^Pages/ }).click()
  expect(await tiles(page)).toEqual([
    "Report1",
    "Report2",
    "Report3",
    "blank",
    "Annex1",
  ])
  await tile(page, 0).click()
  await page.getByRole("button", { name: "Turn clockwise" }).click()
  await expect(
    options.getByRole("switch", { name: /^Double-sided/ })
  ).toBeHidden()
  await expect(options).toContainText("add blank pages where you need them")
})

test("stays accessible, keyboard-friendly, local and responsive", async ({
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
  // Colours are checked as they settle, not half-way through a transition.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await upload(
    page,
    await pdf("one.pdf", "A", { pages: 2 }),
    await pdf("two.pdf", "B"),
    await pdf("locked.pdf", "L", { password: { user: "pw" } }),
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nnothing here\n%%EOF"),
    }
  )
  await ready(page)

  // Every row can be moved from the keyboard.
  await page.getByRole("button", { name: "Move two.pdf earlier" }).focus()
  await page.keyboard.press("Enter")
  expect((await rowNames(page)).slice(0, 2)).toEqual(["two.pdf", "one.pdf"])
  // Sort chips are radios: arrow keys move the choice.
  await page
    .getByRole("radiogroup", { name: "Sort", exact: true })
    .getByRole("radio", { name: "As added", exact: true })
    .focus()
  await page.keyboard.press("ArrowRight")
  await expect(
    page
      .getByRole("radiogroup", { name: "Sort", exact: true })
      .getByRole("radio", { name: "Name A–Z", exact: true })
  ).toBeChecked()

  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(results.violations, theme).toEqual([])
  }

  await page.getByRole("button", { name: "Remove locked.pdf" }).click()
  // Every option open: a contents page with a cover, and a password with limits.
  await page.getByRole("radio", { name: "File names", exact: true }).click()
  await page
    .getByRole("switch", { name: "Lock the merged PDF with a password" })
    .click()
  await page.getByLabel("Password to open the file").fill("secret")
  await page.getByRole("switch", { name: "Allow printing" }).click()
  const allOptions = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(allOptions.violations).toEqual([])
  await page
    .getByRole("switch", { name: "Lock the merged PDF with a password" })
    .click()
  // The Pages view, with a page selected and a blank one added.
  await page.getByRole("radio", { name: /^Pages/ }).click()
  await page.getByTestId("page-tile").first().getByRole("button").click()
  await page.getByRole("button", { name: "Add a blank page" }).click()
  await expect(page.getByTestId("page-tile").locator("canvas")).toHaveCount(3)
  const pagesView = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(pagesView.violations).toEqual([])
  await merged(page)
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])

  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the tutorial video, captions, written help and guide are available", async ({
  page,
  request,
  browserName,
}) => {
  await page.goto(ROUTE)
  const help = page.getByRole("region", { name: "A little help along the way" })
  const video = help.locator("video")
  await expect(video).toHaveAttribute(
    "poster",
    "/videos/pdf-merger-tutorial-poster.webp"
  )
  await expect(video).toHaveAttribute("preload", "none")
  for (const [path, type] of [
    ["/videos/pdf-merger-tutorial.mp4", "video/mp4"],
    ["/videos/pdf-merger-tutorial-poster.webp", "image/webp"],
    ["/videos/pdf-merger-tutorial.vtt", "text/vtt"],
  ]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    expect(response.headers()["content-type"]).toContain(type)
  }
  const captions = await (
    await request.get("/videos/pdf-merger-tutorial.vtt")
  ).text()
  expect(captions.startsWith("WEBVTT")).toBe(true)
  expect(captions).toContain("Step 3 of 6: Arrange single pages")
  expect(captions).toContain("Step 6 of 6: Download")

  // Playwright's Firefox build has no H.264 decoder; real Firefox uses the system one.
  if (browserName !== "firefox") {
    const metadata = await video.evaluate(
      (element: HTMLVideoElement) =>
        new Promise<{ duration: number; width: number }>((resolve, reject) => {
          element.addEventListener("loadedmetadata", () =>
            resolve({ duration: element.duration, width: element.videoWidth })
          )
          element.addEventListener("error", () => reject(new Error("decode")))
          element.preload = "metadata"
          element.load()
        })
    )
    expect(metadata.width).toBe(1920)
    expect(Math.round(metadata.duration)).toBe(71)
  }

  await expect(help.locator("#tutorial-steps > li")).toHaveCount(6)
  await help.getByText("Every option explained").click()
  for (const term of [
    "Pages",
    "Sorting",
    "Pages view",
    "Alternate pages",
    "Pictures as pages",
    "Contents page",
    "Fillable fields",
    "Password",
    "Double-sided printing",
    "Page size",
    "Footer",
    "Other documents",
    "Locked files",
    "Damaged files",
    "What is kept",
    "Bookmarks",
    "Limits and privacy",
  ])
    await expect(help.getByText(term, { exact: true })).toBeVisible()
  await expect(
    help.getByRole("link", { name: "Read the step-by-step guide" })
  ).toHaveAttribute("href", "/blog/merge-pdfs-without-uploading/")
  const data = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts.map((script) => JSON.parse(script.textContent ?? "{}"))
    )
  expect(data).toContainEqual(
    expect.objectContaining({
      "@type": "WebApplication",
      name: "PDF merger",
      applicationCategory: "BusinessApplication",
    })
  )
  expect(data).toContainEqual(
    expect.objectContaining({ "@type": "VideoObject", duration: "PT1M11S" })
  )
})
