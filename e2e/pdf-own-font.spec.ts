import { readFileSync } from "node:fs"
import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, embeddedFonts, readPdf } from "../tests/pdf-reader"
import { makeTextPdf, TEXT } from "../tests/pdf-text"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const line = (page: Page, text: string) =>
  page
    .locator('[data-testid=editor-layer][data-page="1"]')
    .getByRole("button", { name: `Change the line: ${text}`, exact: true })
const field = (page: Page) => page.getByTestId("editor-retext")
/** Where a font file of one's own is chosen. */
const chooser = (page: Page) =>
  reader(page).getByLabel("Choose a font file of your own")

const font = (name: string) => readFileSync(`public/fonts/editor/${name}.ttf`)
/** A font as a file someone has on their device. */
const fontFile = (name: string, as = `${name}.ttf`) => ({
  name: as,
  mimeType: "font/ttf",
  buffer: font(name),
})

const text = async (name = "letter.pdf"): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeTextPdf()),
})

async function open(page: Page, upload: Upload) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
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
  return bytesOf(got)
}

/** Type into a new text box at a point of the first page, and leave it. */
async function write(page: Page, x: number, y: number, words: string) {
  const layer = page.locator('[data-testid=editor-layer][data-page="1"]')
  const box = (await layer.boundingBox())!
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type(words)
  await page.keyboard.press("Control+Enter")
  await expect(page.getByTestId("editor-typing")).toHaveCount(0)
}

/** A font whose maker does not allow it in documents: a real font, with that said in it. */
function restricted() {
  const bytes = Buffer.from(font("LiberationSans-Italic"))
  const tables = bytes.readUInt16BE(4)
  for (let index = 0; index < tables; index++) {
    const record = 12 + index * 16
    if (bytes.toString("latin1", record, record + 4) === "OS/2")
      bytes.writeUInt16BE(0x0002, bytes.readUInt32BE(record + 8) + 8)
  }
  return bytes
}

/** Fonts put together as a collection, as the fonts that come with a computer often are. */
function collection(...fonts: Buffer[]) {
  const head = Buffer.alloc(12 + fonts.length * 4)
  head.write("ttcf", 0, "latin1")
  head.writeUInt32BE(0x00010000, 4)
  head.writeUInt32BE(fonts.length, 8)
  let at = head.length
  const moved = fonts.map((one, index) => {
    head.writeUInt32BE(at, 12 + index * 4)
    const copy = Buffer.from(one)
    for (let table = 0; table < copy.readUInt16BE(4); table++) {
      const record = 12 + table * 16 + 8
      copy.writeUInt32BE(copy.readUInt32BE(record) + at, record)
    }
    at += copy.length
    return copy
  })
  return Buffer.concat([head, ...moved])
}

test("writes a text box and a line of the page in a font of one's own", async ({
  page,
}) => {
  await open(page, await text())
  await pick(page, "Text").click()
  await chooser(page).setInputFiles(
    fontFile("LiberationMono-BoldItalic", "mine.ttf")
  )
  // It is there among the fonts by the name it gives itself, and chosen.
  const mine = pick(page, "Liberation Mono Bold Italic")
  await expect(mine).toHaveAttribute("aria-pressed", "true")
  // A font of one's own is one file: no bold or italic is offered for it.
  await expect(pick(page, "Bold")).toHaveCount(0)
  await write(page, 0.6, 0.3, "Yours truly")
  await changes(page, 1)

  // The same font is offered for the words that are already in the file.
  await page.keyboard.press("e")
  await line(page, TEXT.total).click()
  await expect(field(page)).toBeFocused()
  const fonts = reader(page).getByLabel("Font of the line")
  await fonts.selectOption({ label: "Liberation Mono Bold Italic" })
  await expect(field(page)).toBeFocused()
  await expect(pick(page, "Bold")).toHaveCount(0)
  await field(page).fill("Total due: 95 dollars")
  await page.keyboard.press("Enter")
  await changes(page, 2)
  await expect(line(page, "Total due: 95 dollars")).toBeVisible()

  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  const [read] = (await readPdf(bytes)).pages
  expect(read.text).toContain("Yours truly")
  expect(read.text).toContain("Total due: 95 dollars")
  expect(read.text).not.toContain("120 euros")
  const embedded = await embeddedFonts(bytes)
  const ours = embedded.filter((one) =>
    one.name.includes("LiberationMono-BoldItalic")
  )
  expect(ours.length).toBeGreaterThan(0)
  // Cut to the letters that were used: the whole font is some 280,000 bytes.
  for (const one of ours) expect(one.bytes).toBeLessThan(60_000)
})

test("adds a font while a line is being typed, and refuses what cannot be used", async ({
  page,
}) => {
  await open(page, await text())
  await page.keyboard.press("e")
  await line(page, TEXT.title).click()
  await expect(field(page)).toBeFocused()
  const fonts = reader(page).getByLabel("Font of the line")

  // What is not a font is said to be none, and the line stays as it was.
  await chooser(page).setInputFiles({
    name: "notes.ttf",
    mimeType: "font/ttf",
    buffer: Buffer.from("these are notes, not a font"),
  })
  await expect(reader(page).getByRole("alert")).toContainText(
    "not a font the editor can use"
  )
  await expect(fonts).toHaveValue("")
  // A font whose maker forbids it in documents is not put into one.
  await chooser(page).setInputFiles({
    name: "kept-close.ttf",
    mimeType: "font/ttf",
    buffer: restricted(),
  })
  await expect(reader(page).getByRole("alert")).toContainText(
    "does not allow it to be put into documents"
  )
  await expect(fonts.locator("option")).toHaveCount(4)

  // A font that can be used is added and the line set in it at once.
  await chooser(page).setInputFiles(fontFile("LiberationSerif-Italic"))
  await expect(fonts.locator("option")).toHaveCount(5)
  await expect(fonts.locator("option:checked")).toHaveText(
    "Liberation Serif Italic"
  )
  await expect(reader(page).getByRole("alert")).toHaveCount(0)
  // The same file again is the same font, not a second one.
  await chooser(page).setInputFiles(
    fontFile("LiberationSerif-Italic", "again.ttf")
  )
  await expect(fonts.locator("option")).toHaveCount(5)
  await reader(page).getByRole("button", { name: "Done", exact: true }).click()
  await changes(page, 1)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await readPdf(bytes)).pages[0].text).toContain(TEXT.title)
  expect(
    (await embeddedFonts(bytes)).some((one) =>
      one.name.includes("LiberationSerif-Italic")
    )
  ).toBe(true)
})

test("offers the fonts on the device where the browser can list them, and takes the one that is chosen out of its file", async ({
  page,
}) => {
  // The browser's list of fonts is stood in for here (only Chromium on a
  // computer has one, and what is on it differs from machine to machine):
  // two real fonts in one file, as a family that came with the system is.
  // Everything after the list is the editor's own: the window, the reading
  // of the file, the font in the PDF.
  const both = collection(
    font("LiberationSerif-Regular"),
    font("LiberationSerif-BoldItalic")
  )
  await page.addInitScript((data: string) => {
    const bytes = Uint8Array.from(atob(data), (letter) => letter.charCodeAt(0))
    const one = (fullName: string, postscriptName: string) => ({
      family: "Liberation Serif",
      fullName,
      postscriptName,
      blob: async () => new Blob([bytes]),
    })
    Object.assign(window, {
      queryLocalFonts: async () => [
        one("Liberation Serif", "LiberationSerif"),
        one("Liberation Serif Bold Italic", "LiberationSerif-BoldItalic"),
      ],
    })
  }, both.toString("base64"))
  await open(page, await text())
  await page.keyboard.press("e")
  await line(page, TEXT.total).click()
  await expect(field(page)).toBeFocused()
  await pick(page, "From this device").click()
  const list = page.getByTestId("local-fonts")
  await expect(list).toBeVisible()
  await expect(list.getByRole("listitem")).toHaveCount(2)
  await list.getByLabel("Find a font by its name").fill("bold")
  await expect(list.getByRole("listitem")).toHaveCount(1)
  await list
    .getByRole("button", { name: "Liberation Serif Bold Italic" })
    .click()
  await expect(list).toBeHidden()
  // The line is still being typed, now in the font that was chosen.
  const fonts = reader(page).getByLabel("Font of the line")
  await expect(fonts.locator("option:checked")).toHaveText(
    "Liberation Serif Bold Italic"
  )
  await expect(field(page)).toBeFocused()
  await page.keyboard.press("Enter")
  await changes(page, 1)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await readPdf(bytes)).pages[0].text).toContain(TEXT.total)
  const names = (await embeddedFonts(bytes)).map((one) => one.name)
  expect(
    names.some((name) => name.includes("LiberationSerif-BoldItalic"))
  ).toBe(true)
})

test("keeps a font of one's own with a draft, and takes the draft up with it", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page
    .getByRole("switch", { name: "Keep a draft on this device" })
    .click()
  await page.locator("#editor-file").setInputFiles(await text("report.pdf"))
  await readerReady(page)
  await page.keyboard.press("e")
  await line(page, TEXT.total).click()
  await expect(field(page)).toBeFocused()
  await chooser(page).setInputFiles(fontFile("LiberationMono-BoldItalic"))
  await field(page).fill("Total due: 95 dollars")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(page.getByTestId("draft-status")).toHaveAttribute(
    "data-status",
    "kept"
  )

  await page.reload()
  const card = page.getByTestId("draft-card")
  await expect(card).toContainText("report.pdf · 1 change")
  await card.getByRole("button", { name: "Take it up" }).click()
  await readerReady(page)
  await changes(page, 1)
  await expect(tool(page)).not.toContainText("could not be taken up")
  // The font came back with the draft: it is there to choose again.
  await pick(page, "Text").click()
  await expect(pick(page, "Liberation Mono Bold Italic")).toBeVisible()
  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  expect((await readPdf(bytes)).pages[0].text).toContain(
    "Total due: 95 dollars"
  )
  expect(
    (await embeddedFonts(bytes)).some((one) =>
      one.name.includes("LiberationMono-BoldItalic")
    )
  ).toBe(true)

  // Turned off, the draft is thrown away, the font with it.
  await page
    .getByRole("switch", { name: "Keep a draft on this device" })
    .click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const opening = indexedDB.open("keepsimp-drafts", 1)
            opening.onsuccess = () => {
              const request = opening.result
                .transaction("pdf-editor")
                .objectStore("pdf-editor")
                .count()
              request.onsuccess = () => resolve(request.result)
            }
          })
      )
    )
    .toBe(0)
})

test("does not offer the device's fonts where the browser cannot list them, and stays accessible", async ({
  page,
  browserName,
}) => {
  const external: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (url.origin !== "http://127.0.0.1:4173" ||
        !["GET", "HEAD"].includes(request.method()))
    )
      external.push(request.url())
  })
  await open(page, await text())
  await pick(page, "Text").click()
  await expect(pick(page, "Your own font")).toBeVisible()
  // Only Chromium on a computer lists fonts; the others have the file alone.
  if (browserName !== "chromium")
    await expect(pick(page, "From this device")).toHaveCount(0)
  await chooser(page).setInputFiles(fontFile("LiberationSans-BoldItalic"))
  await expect(pick(page, "Liberation Sans Bold Italic")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const results = await new AxeBuilder({ page })
    .include("[role=dialog]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze()
  expect(results.violations).toEqual([])
  // The font went nowhere: nothing was sent, and nothing asked of another site.
  expect(external).toEqual([])
})
