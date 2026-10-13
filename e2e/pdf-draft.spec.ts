import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument } from "@cantoo/pdf-lib"
import sharp from "sharp"
import { makeFormPdf } from "../tests/pdf-fixtures"
import { readPictures } from "../tests/pdf-pictures"
import { danglingRefs, texts } from "../tests/pdf-reader"
import { makeTextPdf, TEXT } from "../tests/pdf-text"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const card = (page: Page) => page.getByTestId("draft-card")
const status = (page: Page) => page.getByTestId("draft-status")
const keep = (page: Page) =>
  page.getByRole("switch", { name: "Keep a draft on this device" })
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
/** The control of a field's first place: a phone shows the second page too, where the name is repeated. */
const control = (page: Page, name: string) =>
  page
    .locator(`[data-testid=editor-field][data-name="${name}"]`)
    .first()
    .locator("input, select, textarea")

const form = async (name = "claim.pdf"): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeFormPdf()),
})

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

/** Type into a new text box at a place on the first page, given in shares of the page. */
async function write(page: Page, x: number, y: number, words: string) {
  const layer = page.locator('[data-testid=editor-layer][data-page="1"]')
  const box = (await layer.boundingBox())!
  await pick(page, "Text").click()
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type(words)
  await page.keyboard.press("Control+Enter")
  await expect(page.getByTestId("editor-typing")).toHaveCount(0)
}

/** What the browser keeps of a draft: the names it is kept under. */
const keptKeys = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const opening = indexedDB.open("keepsimp-drafts", 1)
        opening.onupgradeneeded = () =>
          opening.result.createObjectStore("pdf-editor")
        opening.onsuccess = () => {
          const request = opening.result
            .transaction("pdf-editor")
            .objectStore("pdf-editor")
            .getAllKeys()
          request.onsuccess = () => resolve(request.result.map(String).sort())
        }
      })
  )

test("keeps nothing unless the switch is turned on", async ({ page }) => {
  await page.goto(ROUTE)
  await expect(keep(page)).not.toBeChecked()
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  await control(page, "applicant.full_name").fill("Ada Lovelace")
  await page.keyboard.press("Tab")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveCount(0)
  expect(await keptKeys(page)).toEqual([])
  // The page has changes that were not downloaded, and nothing holds them: leaving is asked about.
  page.once("dialog", (dialog) => void dialog.accept())
  await page.reload()
  await expect(card(page)).toHaveCount(0)
  await expect(keep(page)).not.toBeChecked()
})

test("keeps a draft when asked, and takes it up after the page was closed", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await keep(page).click()
  await expect(keep(page)).toBeChecked()
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  // A file that was only opened is no draft.
  expect(await keptKeys(page)).toEqual([])

  await control(page, "applicant.full_name").fill("Ada Lovelace")
  await page.keyboard.press("Tab")
  await changes(page, 1)
  await write(page, 0.55, 0.04, "Kept overnight")
  await changes(page, 2)
  const photo = await sharp({
    create: { width: 60, height: 40, channels: 3, background: "#2255aa" },
  })
    .png()
    .toBuffer()
  await reader(page)
    .getByLabel("Choose a picture to add")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: photo })
  await changes(page, 3)
  await control(page, "agree").click()
  await changes(page, 4)
  // The last step is undone, and is kept as a step that can be made again.
  await page.getByTestId("editor-undo").click()
  await changes(page, 3)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  await expect(status(page)).toHaveText(
    "A draft of this file is kept on this device."
  )
  const keys = await keptKeys(page)
  expect(keys).toHaveLength(3)
  expect(keys.filter((key) => key.startsWith("picture/"))).toHaveLength(1)
  expect(keys).toContain("file")
  expect(keys).toContain("steps")

  // The tab is closed without a download, and nothing is asked: the draft holds the changes.
  let asked = false
  page.once("dialog", (dialog) => {
    asked = true
    void dialog.accept()
  })
  await page.reload()
  expect(asked).toBe(false)
  await expect(card(page)).toContainText("Unfinished on this device")
  await expect(card(page)).toContainText("claim.pdf · 3 changes, kept just now")
  await expect(keep(page)).toBeChecked()

  await card(page).getByRole("button", { name: "Take it up" }).click()
  await readerReady(page)
  await changes(page, 3)
  await expect(
    page
      .locator(`[data-testid=editor-field][data-name="applicant.full_name"]`)
      .first()
  ).toHaveAttribute("data-value", "Ada Lovelace")
  await expect(
    page
      .locator('[data-testid=editor-layer][data-page="1"]')
      .getByTestId("editor-object")
  ).toHaveCount(2)
  // The list of changes came with it: the tick can be made again, and the picture undone.
  await expect(page.getByTestId("editor-redo")).toHaveAttribute(
    "aria-label",
    "Redo: Tick Agree"
  )
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Add picture"
  )
  await page.getByTestId("editor-redo").click()
  await changes(page, 4)

  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const bytes = await bytesOf(await pending)
  await expect(page.getByTestId("editor-check")).toBeVisible()
  await expect(tool(page)).toContainText(
    "This is the draft that was kept on this device, with your changes as you left them."
  )
  expect(await danglingRefs(bytes)).toEqual([])
  const read = (await PDFDocument.load(bytes)).getForm()
  expect(read.getTextField("applicant.full_name").getText()).toBe(
    "Ada Lovelace"
  )
  expect(read.getCheckBox("agree").isChecked()).toBe(true)
  expect((await texts(bytes))[0]).toContain("Kept overnight")
  const [picture] = await readPictures(bytes)
  expect([picture.width, picture.height]).toEqual([60, 40])

  // Closing the file for good throws its draft away.
  await page.getByRole("button", { name: "Close the file" }).click()
  await expect(card(page)).toHaveCount(0)
  await expect.poll(() => keptKeys(page)).toEqual([])
  await page.reload()
  await expect(card(page)).toHaveCount(0)
  await expect(keep(page)).toBeChecked()
})

test("keeps pages that were moved and pages added from another PDF in a draft", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await keep(page).click()
  await page
    .locator("#editor-file")
    .setInputFiles(await pdf("book.pdf", "bk", { pages: 3 }))
  await readerReady(page)
  await pick(page, "Pages").click()
  const panel = page.getByTestId("editor-pages")
  // A locked file's pages: the draft keeps them without the password.
  await panel.getByLabel("A PDF whose pages are added").setInputFiles(
    await pdf("locked.pdf", "lk", {
      pages: 2,
      password: { user: "open sesame" },
    })
  )
  const locked = page.getByTestId("pages-locked")
  await locked.getByLabel(/locked\.pdf is locked/).fill("open sesame")
  await locked.getByRole("button", { name: "Add" }).click()
  await changes(page, 1)
  await panel.getByRole("option", { name: "Page 5", exact: true }).click()
  await panel.getByRole("button", { name: "Move one place earlier" }).click()
  await changes(page, 2)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  const keys = await keptKeys(page)
  expect(keys.filter((key) => key.startsWith("picture/pdf-"))).toHaveLength(1)

  await page.reload()
  await expect(card(page)).toContainText("book.pdf · 2 changes, kept just now")
  await card(page).getByRole("button", { name: "Take it up" }).click()
  await readerReady(page)
  await changes(page, 2)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Move page 5"
  )
  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const bytes = await bytesOf(await pending)
  await expect(page.getByTestId("editor-check")).toBeVisible()
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await texts(bytes)).map((text) => text.split(" ")[0])).toEqual([
    "bk-P1",
    "bk-P2",
    "bk-P3",
    "lk-P2",
    "lk-P1",
  ])
})

test("takes up a draft in which the page's own words were changed, with the font that stood in", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await keep(page).click()
  await page.locator("#editor-file").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makeTextPdf()),
  })
  await readerReady(page)
  await page.keyboard.press("e")
  const title = page.getByRole("button", {
    name: `Change the line: ${TEXT.title}`,
    exact: true,
  })
  await title.click()
  // The figures are not in the title's font: one of the editor's stands in, and the draft has to bring it.
  await page.keyboard.press("End")
  await page.keyboard.type(" 2026")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")

  await page.reload()
  await expect(card(page)).toContainText("report.pdf · 1 change")
  await card(page).getByRole("button", { name: "Take it up" }).click()
  await readerReady(page)
  await changes(page, 1)
  await expect(tool(page)).not.toContainText("could not be taken up")
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Change text"
  )
  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const bytes = await bytesOf(await pending)
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await texts(bytes))[0].replace(/\s+/g, "")).toContain(
    "Quarterlyreport2026"
  )
})

test("throws a draft away when asked, and when the switch is turned off", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await keep(page).click()
  await page.locator("#editor-file").setInputFiles(await form("first.pdf"))
  await readerReady(page)
  await control(page, "country").selectOption("Japan")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  await page.reload()
  await expect(card(page)).toContainText("first.pdf · 1 change")
  await card(page).getByRole("button", { name: "Throw it away" }).click()
  await expect(card(page)).toHaveCount(0)
  await expect.poll(() => keptKeys(page)).toEqual([])

  // Turned off while a file is open, the draft goes and the page asks again before it is left.
  await page.locator("#editor-file").setInputFiles(await form("second.pdf"))
  await readerReady(page)
  await control(page, "country").selectOption("France")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  await keep(page).click()
  await expect(keep(page)).not.toBeChecked()
  await expect(status(page)).toHaveCount(0)
  await expect.poll(() => keptKeys(page)).toEqual([])
  // Turned on again, it is kept anew, file and all.
  await keep(page).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  expect(await keptKeys(page)).toEqual(["file", "steps"])

  // What is kept is trusted no more than a file: steps that are not steps are no draft.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const opening = indexedDB.open("keepsimp-drafts", 1)
        opening.onsuccess = () => {
          const store = opening.result
            .transaction("pdf-editor", "readwrite")
            .objectStore("pdf-editor")
          const request = store.get("steps")
          request.onsuccess = () => {
            const draft = request.result
            draft.steps[0].done.kind = "scripts"
            store.put(draft, "steps").onsuccess = () => resolve()
          }
        }
      })
  )
  await page.reload()
  await expect(keep(page)).toBeChecked()
  await expect(card(page)).toHaveCount(0)
})

test("shows the draft and its switch accessibly, in both themes and on a small phone", async ({
  page,
}) => {
  const scan = async () =>
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await keep(page).click()
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  await control(page, "country").selectOption("Japan")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(status(page)).toHaveAttribute("data-status", "kept")
  expect(await scan()).toEqual([])
  await page.reload()
  await expect(card(page)).toBeVisible()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await expect
    .poll(
      async () =>
        (
          await card(page)
            .getByRole("button", { name: "Take it up" })
            .boundingBox()
        )?.height ?? 0
    )
    .toBeGreaterThanOrEqual(44)
})
