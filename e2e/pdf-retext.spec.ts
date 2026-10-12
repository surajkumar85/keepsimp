import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  danglingRefs,
  embeddedFonts,
  readPdf,
  textPlaces,
} from "../tests/pdf-reader"
import { makeTextPdf, TEXT } from "../tests/pdf-text"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
/** A line of the first page, by what it says. */
const line = (page: Page, text: string) =>
  page
    .locator('[data-testid=editor-layer][data-page="1"]')
    .getByRole("button", { name: `Change the line: ${text}`, exact: true })
const field = (page: Page) => page.getByTestId("editor-retext")
const hint = (page: Page) => page.getByTestId("editor-hint").first()

/** A page of text of every kind the editor meets; see `makeTextPdf`. */
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

const PAID = TEXT.paidBold + TEXT.paidPlain

test("changes the words of a line, in the line's own font, and takes the old ones out of the file", async ({
  page,
}) => {
  const upload = await text()
  await open(page, upload)
  // Nothing of the page's own text is offered until it is asked for.
  await expect(line(page, TEXT.total)).toHaveCount(0)
  await pick(page, "Change text").click()
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "false")
  await expect(hint(page)).toContainText("Click a line to change its words")
  await expect(line(page, TEXT.total)).toBeVisible()

  await line(page, TEXT.total).click()
  await expect(field(page)).toBeFocused()
  await expect(field(page)).toHaveValue(TEXT.total)
  await field(page).fill("Total due: 95 dollars")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Change text"
  )
  // The page is read again: the line is there with its new words, and can be changed again.
  await expect(line(page, "Total due: 95 dollars")).toBeVisible()
  await expect(line(page, TEXT.total)).toHaveCount(0)

  // Typed after the bold words, the new ones are bold; the rest of the line keeps its look.
  await line(page, PAID).click()
  await field(page).fill(`${TEXT.paidBold}, on time${TEXT.paidPlain}`)
  await page.keyboard.press("Enter")
  await changes(page, 2)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "The page's own text was changed in 2 places. The old words are no longer in the file, and all 2 lines you wrote were read back from the result."
  )
  expect(await danglingRefs(bytes)).toEqual([])
  const [read] = (await readPdf(bytes)).pages
  expect(read.text).toContain("Total due: 95 dollars")
  expect(read.text).not.toContain("120 euros")
  expect(read.text).toContain(TEXT.warning)
  expect(read.links).toHaveLength(1)
  const [placed] = await textPlaces(bytes)
  const total = placed.find((run) => run.text.startsWith("Total due: 95"))!
  const untouched = placed.find((run) => run.text === TEXT.warning)!
  const bold = placed.find((run) => run.text.includes("on time"))!
  // Written with the very fonts the file had: none was added.
  expect(total.font).toBe(untouched.font)
  expect(total.size).toBeCloseTo(untouched.size, 1)
  expect(bold.font).not.toBe(untouched.font)
  expect(await embeddedFonts(bytes)).toEqual(
    await embeddedFonts(new Uint8Array(upload.buffer))
  )
})

test("says which letters a line's font lacks, and sets those in the closest font it has", async ({
  page,
}) => {
  await open(page, await text())
  await page.keyboard.press("e")
  await line(page, TEXT.title).click()
  await expect(field(page)).toBeFocused()
  // The title's font was put into the file with only the letters of the title.
  await page.keyboard.press("End")
  await page.keyboard.type(" 2026")
  await expect(
    reader(page).getByRole("status").filter({ hasText: "font has no" })
  ).toContainText("This line's font has no “2”, “0”, “6”")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(hint(page)).toContainText(
    "The font of this line has no “2”, “0”, “6”. They are set in the closest font the editor has."
  )
  const bytes = await saved(page, page.getByTestId("editor-download"))
  expect(await danglingRefs(bytes)).toEqual([])
  const [read] = (await readPdf(bytes)).pages
  expect(read.text.replace(/\s+/g, "")).toContain("Quarterlyreport2026")
  const fonts = (await embeddedFonts(bytes)).map((font) => font.name)
  // The file's font is still the file's, and the editor's is beside it, cut to the figures.
  expect(fonts.filter((name) => name.includes("Kalam"))).toHaveLength(1)
  expect(fonts.filter((name) => name.includes("Liberation"))).toHaveLength(1)
})

test("takes a line out, leaves a line as it was, and undoes with the keyboard alone", async ({
  page,
}) => {
  await open(page, await text())
  await page.keyboard.press("e")
  await expect(line(page, TEXT.linked)).toBeVisible()

  // Escape leaves the words as they were and the editor open.
  await line(page, TEXT.warning).focus()
  await page.keyboard.press("Enter")
  await expect(field(page)).toBeFocused()
  await page.keyboard.type(" and more")
  await page.keyboard.press("Escape")
  await expect(field(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()
  await changes(page, 0)
  // Words that were not changed are no change either.
  await line(page, TEXT.warning).click()
  await page.keyboard.press("Enter")
  await expect(field(page)).toHaveCount(0)
  await changes(page, 0)

  // Delete takes a line out; nothing typed in a line does the same.
  await line(page, TEXT.linked).focus()
  await page.keyboard.press("Delete")
  await changes(page, 1)
  await expect(line(page, TEXT.linked)).toHaveCount(0)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Take out text"
  )
  await line(page, TEXT.tight[1]).click()
  await field(page).fill("")
  await page.keyboard.press("Enter")
  await changes(page, 2)
  // The lines set close above and below it are whole.
  await expect(line(page, TEXT.tight[0])).toBeVisible()
  await expect(line(page, TEXT.tight[2])).toBeVisible()

  // Text that is turned can be taken out but not retyped, and says so.
  await line(page, TEXT.turned).click()
  await expect(field(page)).toHaveAttribute("readonly", "")
  await expect(
    reader(page).getByRole("status").filter({ hasText: "turned" })
  ).toContainText("can be taken out, but its words cannot be changed yet")
  await page.keyboard.press("Escape")

  // Undo and redo.
  await page.keyboard.press("Control+z")
  await changes(page, 1)
  await expect(line(page, TEXT.tight[1])).toBeVisible()
  await page.keyboard.press("Control+y")
  await changes(page, 2)
  await expect(line(page, TEXT.tight[1])).toHaveCount(0)

  // Escape puts the tool down; the lines are no longer offered.
  await page.keyboard.press("Escape")
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await expect(line(page, TEXT.total)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()

  const bytes = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "The page's own text was changed in 2 places. What you took out is no longer in the file."
  )
  const [read] = (await readPdf(bytes)).pages
  expect(read.text).not.toContain(TEXT.linked)
  expect(read.text).not.toContain(TEXT.tight[1])
  expect(read.text).toContain(TEXT.tight[0])
  expect(read.text).toContain(TEXT.tight[2])
  // The link that lay over the words is still a link.
  expect(read.links).toHaveLength(1)
})

test("puts the tool down when another is taken, and leaves added things and typing as they were", async ({
  page,
}) => {
  await open(page, await text())
  await page.keyboard.press("e")
  await expect(line(page, TEXT.total)).toBeVisible()
  await pick(page, "Box").click()
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await expect(line(page, TEXT.total)).toHaveCount(0)
  // Letters typed in the field are not the editor's keys.
  await page.keyboard.press("e")
  await line(page, TEXT.total).click()
  await field(page).fill("Total due: be gentle")
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByTestId("signature-dialog")).toHaveCount(0)
  // Leaving the field for something else puts the words into the file.
  await pick(page, "Change text").focus()
  await changes(page, 1)
  await expect(line(page, "Total due: be gentle")).toBeVisible()
})

test("stays accessible, local and responsive while text is changed", async ({
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
  await open(page, await text())
  await page.keyboard.press("e")
  await expect(line(page, TEXT.total)).toBeVisible()
  // With the lines offered, with one being typed, and after a change.
  expect(await scan()).toEqual([])
  await line(page, TEXT.title).click()
  await page.keyboard.press("End")
  await page.keyboard.type(" 7")
  expect(await scan()).toEqual([])
  await page.keyboard.press("Enter")
  await changes(page, 1)
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
