import { test, expect, type Download, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
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

  await page.getByLabel("File name").fill("Board pack / October")
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
    "Unlocked. The merged file will not have a password."
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
    {
      name: "picture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("\x89PNG\r\n\x1a\n"),
    },
    { name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }
  )
  await ready(page)
  // Files that are not PDFs at all never join the list.
  const notice = page.getByRole("main").getByRole("alert").first()
  await expect(notice).toContainText("notes.txt is not a PDF.")
  await expect(notice).toContainText("picture.pdf is not a PDF.")
  await expect(notice).toContainText("empty.pdf: This file is empty.")
  const rows = page.getByTestId("file-row")
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(1)).toContainText(
    "This file was damaged and has been repaired."
  )
  await expect(rows.nth(2)).toHaveAttribute("data-status", "error")
  await expect(rows.nth(2)).toContainText("It is left out of the merge.")
  await expect(page.getByTestId("plan")).toContainText("5 pages from 2 files")
  await expect(page.getByTestId("plan")).toContainText("1 file left out")

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
  await upload(page, await pdf("long.pdf", "A", { pages: 1500 }))
  await ready(page)
  await expect(page.getByTestId("plan")).toContainText(
    "1,500 pages from 1 file"
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
  await page.getByLabel("Pages from long.pdf").fill("1499-")
  const result = await merged(page)
  expect(result.pages.map((entry) => entry.text)).toEqual([
    "A-P1499",
    "A-P1500",
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

test("the written help covers every option", async ({ page }) => {
  await page.goto(ROUTE)
  const help = page.getByRole("region", { name: "A little help along the way" })
  await expect(help.getByRole("listitem")).toHaveCount(5)
  await help.getByText("Every option explained").click()
  for (const term of [
    "Pages",
    "Sorting",
    "Locked files",
    "Damaged files",
    "What is kept",
    "Bookmarks",
    "Limits and privacy",
  ])
    await expect(help.getByText(term, { exact: true })).toBeVisible()
  const data = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent())!
  )
  expect(data).toMatchObject({
    "@type": "WebApplication",
    name: "PDF merger",
    applicationCategory: "BusinessApplication",
  })
})
