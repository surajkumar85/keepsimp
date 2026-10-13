import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { makeRedactPdf, PLACES, REDACT, REDACT_PAGE } from "../tests/pdf-redact"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"
const TOOL = "Redact: take out for good"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const undo = (page: Page) => page.getByTestId("editor-undo")
const layer = (page: Page, number = 1) =>
  page.locator(`[data-testid=editor-layer][data-page="${number}"]`)
const surface = (page: Page, number = 1) =>
  layer(page, number).getByTestId("redact-surface")
const marks = (page: Page, number = 1) =>
  layer(page, number).getByTestId("redact-mark")
const apply = (page: Page) => page.getByTestId("redact-apply")
const hint = (page: Page) => page.getByTestId("editor-hint").first()
const words = (page: Page) =>
  reader(page).getByLabel("Words to mark everywhere", { exact: true })

const redactFile = async (): Promise<Upload> => ({
  name: "card.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeRedactPdf()),
})

async function open(page: Page, file?: Upload, route = ROUTE) {
  await page.goto(route)
  await page.locator("#editor-file").setInputFiles(file ?? (await redactFile()))
  await readerReady(page)
  await expect(layer(page)).toBeVisible()
}

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

/** A point of the first page, given in points from its top left corner, as a place on the screen. */
async function spot(page: Page, x: number, y: number, number = 1) {
  const box = (await layer(page, number).boundingBox())!
  return {
    x: box.x + (x / REDACT_PAGE[0]) * box.width,
    y: box.y + (y / REDACT_PAGE[1]) * box.height,
  }
}

/** Drag from one point of the first page to another, both in points. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
) {
  const start = await spot(page, from.x, from.y)
  const end = await spot(page, to.x, to.y)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, {
    steps: 3,
  })
  await page.mouse.move(end.x, end.y, { steps: 3 })
  await page.mouse.up()
}

const over = (page: Page, place: keyof typeof PLACES) => {
  const box = PLACES[place]
  return drag(
    page,
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y + box.height }
  )
}

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  const bytes = await bytesOf(got)
  expect(await danglingRefs(bytes)).toEqual([])
  const read = await readPdf(bytes)
  return { read, text: read.pages.map((one) => one.text).join("\n") }
}

test("marks an area, takes the mark away and brings it back, applies it, and the words are gone from the download", async ({
  page,
}) => {
  await open(page)
  // Nothing of the tool is there until it is asked for.
  await expect(surface(page)).toHaveCount(0)
  await pick(page, TOOL).click()
  await expect(pick(page, TOOL)).toHaveAttribute("aria-pressed", "true")
  await expect(surface(page)).toHaveAttribute("data-marks", "0")
  await expect(hint(page)).toContainText(
    "A mark takes nothing out until the marks are applied"
  )
  // With no mark there is nothing to apply.
  await expect(apply(page)).toBeDisabled()
  await over(page, "secret")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Mark a place")
  await expect(marks(page)).toHaveCount(1)
  await expect(apply(page)).toHaveText("Apply 1 mark")
  // The mark is a button: Delete takes it away, and one undo brings it back.
  await marks(page).focus()
  await page.keyboard.press("Delete")
  await changes(page, 2)
  await expect(marks(page)).toHaveCount(0)
  await expect(apply(page)).toBeDisabled()
  await undo(page).click()
  await changes(page, 1)
  await expect(marks(page)).toHaveCount(1)
  // Applied: the mark is no longer one that waits, and the bar says what was done.
  await apply(page).click()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Apply the marks"
  )
  await expect(marks(page)).toHaveCount(0)
  await expect(hint(page)).toHaveText("1 place was emptied for good.")
  // Escape puts the tool down, and the window stays.
  await page.keyboard.press("Escape")
  await expect(surface(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.text).toContain(REDACT.keep)
  expect(got.text).toContain(REDACT.half)
  expect(got.text).not.toContain("4111")
  expect(got.text).not.toContain("Ada")
  // The link and the note that lay under the mark went with it; the other link stays.
  expect(got.read.pages[0].links).toEqual(["https://kept.example/"])
  await expect(page.getByTestId("editor-check")).toContainText(
    "1 place on 1 page was emptied for good"
  )
})

test("warns at the download when a mark was never applied", async ({
  page,
}) => {
  await open(page)
  await pick(page, TOOL).click()
  await pick(page, "Card numbers").click()
  await changes(page, 1)
  await expect(hint(page)).toContainText("Marked 1 place on 1 page")
  await expect(marks(page)).toHaveCount(1)
  const got = await saved(page, page.getByTestId("editor-download"))
  // Nothing was taken out: a mark is not a redaction.
  expect(got.text).toContain("4111 1111 1111 1111")
  await expect(page.getByTestId("editor-check")).toContainText(
    "1 mark was not applied. What is under it is still in the file: apply the marks, then download again."
  )
})

test("marks words by dragging across them, a name everywhere, kinds of thing and a shape, and takes them all out", async ({
  page,
}) => {
  await open(page)
  await pick(page, TOOL).click()
  // Across the first words of a line, as text is selected.
  await pick(page, "Words").click()
  await drag(page, { x: 44, y: 136 }, { x: 56, y: 137 })
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Mark words")
  await expect(marks(page)).toHaveCount(1)
  // A drag over empty paper marks nothing, and says why.
  await drag(page, { x: 300, y: 155 }, { x: 370, y: 175 })
  await expect(hint(page)).toContainText("No words there.")
  await changes(page, 1)
  // A name, wherever it is written, in capitals or not: on both pages.
  await words(page).fill("ada")
  await pick(page, "Mark all").click()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Mark 3 places")
  await expect(hint(page)).toContainText("Marked 3 places on 2 pages")
  // Words that are nowhere are said to be nowhere.
  await words(page).fill("Grace")
  await page.keyboard.press("Enter")
  await expect(hint(page)).toHaveText(
    "No “Grace” found in the words of this file."
  )
  // A shape of one's own: four groups of four figures.
  await pick(page, "The words are a shape").click()
  await words(page).fill("#### #### #### ####")
  await page.keyboard.press("Enter")
  await changes(page, 3)
  await expect(hint(page)).toContainText("Marked 1 place on 1 page")
  // A shape that names nothing is not looked for.
  await words(page).fill("* ?")
  await page.keyboard.press("Enter")
  await expect(hint(page)).toContainText("That shape cannot be looked for")
  await changes(page, 3)
  await pick(page, "E-mail addresses").click()
  await changes(page, 4)
  await expect(hint(page)).toContainText("Marked 2 places on 2 pages")
  await expect(apply(page)).toHaveText("Apply 7 marks")
  await apply(page).click()
  await changes(page, 5)
  await expect(hint(page)).toContainText("emptied for good")
  await expect(apply(page)).toBeDisabled()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.text).not.toContain("4111")
  expect(got.text.toLowerCase()).not.toContain("ada")
  expect(got.text).not.toContain("example.org")
  expect(got.text).not.toContain("Half")
  // What was beside the marks is as it was.
  expect(got.text).toContain(REDACT.keep)
  expect(got.text).toContain("Write to")
  expect(got.text).toContain("Page two names")
  expect(got.text).toContain("in the mark and half out")
})

test("puts a mark on the page and moves it with the keyboard alone", async ({
  page,
}) => {
  await open(page)
  await pick(page, TOOL).click()
  await pick(
    page,
    "Put a mark on the page, to move with the arrow keys"
  ).click()
  await changes(page, 1)
  const mark = marks(page)
  // In the middle of the page, with the keyboard on it.
  await expect(mark).toHaveAttribute("data-box", "140,288,120,24")
  await expect(mark).toBeFocused()
  await expect(mark).toHaveAccessibleName(
    "Marked to be taken out, on page 1. The arrow keys move it, with Alt they resize it. Press to take the mark away."
  )
  for (let press = 0; press < 4; press++)
    await page.keyboard.press("Shift+ArrowLeft")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Alt+Shift+ArrowRight")
  await page.keyboard.press("Alt+ArrowDown")
  await expect(mark).toHaveAttribute("data-box", "100,287,130,25")
  // When the keys rest, the mark is where the file has it, as one step.
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Move a mark")
  await expect(mark).toHaveAttribute("data-box", "100,287,130,25")
  await expect(mark).toBeFocused()
  await undo(page).click()
  await changes(page, 1)
  await expect(marks(page)).toHaveAttribute("data-box", "140,288,120,24")
})

test("leaves the file's details and attached files out of the download when asked", async ({
  page,
}) => {
  await open(
    page,
    await pdf("report.pdf", "cl", {
      pages: 2,
      title: "Private title",
      author: "Ada Lovelace",
      attachments: { "notes.txt": "inside" },
    })
  )
  await page.getByRole("button", { name: "Close the editor" }).click()
  const card = tool(page)
  await card
    .getByRole("switch", { name: "Title, author and other details" })
    .click()
  await card.getByRole("switch", { name: "Attached files" }).click()
  const got = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  expect(got.read.info.Title).toBeUndefined()
  expect(got.read.info.Author).toBeUndefined()
  expect(got.read.attachments).toEqual([])
  expect(got.text).toContain("cl-P1")
  await expect(page.getByTestId("editor-check")).toContainText(
    "Left out of the result, as you asked: its title, author and other details; 1 attached file."
  )
})

test("Redact PDF opens with the tool in hand, and the other tools one press away", async ({
  page,
}) => {
  await open(page, undefined, "/dashboard/redact-pdf/")
  await expect(surface(page)).toBeVisible()
  await expect(pick(page, TOOL)).toHaveAttribute("aria-pressed", "true")
  // Only the tool for the job: the rest are behind one button.
  await expect(pick(page, "Text")).toHaveCount(0)
  await expect(pick(page, "Highlight")).toHaveCount(0)
  await page.getByTestId("all-tools").click()
  await expect(pick(page, "Text")).toBeVisible()
  await expect(pick(page, "Highlight")).toBeVisible()
  await expect(surface(page)).toBeVisible()
})

test("stays accessible, local and responsive while places are marked", async ({
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
  await pick(page, TOOL).click()
  await pick(page, "E-mail addresses").click()
  await changes(page, 1)
  await expect(marks(page)).toHaveCount(1)
  // The button has its full colour once it can be pressed, a moment after it can.
  await expect(apply(page)).toBeEnabled()
  await page.waitForTimeout(400)
  expect(await scan()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Another tool puts this one down, and the marks wait where they are.
  await pick(page, "Links").click()
  await expect(surface(page)).toHaveCount(0)
  await expect(pick(page, TOOL)).toHaveAttribute("aria-pressed", "false")
  await pick(page, TOOL).click()
  await expect(marks(page)).toHaveCount(1)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
