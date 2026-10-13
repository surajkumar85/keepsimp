import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"
/** Every page of the files made here, in points. */
const WIDE = 400
const TALL = 600

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const frame = (page: Page) => page.getByTestId("crop-frame")
const edge = (page: Page, side: string) => page.getByTestId(`crop-${side}`)
const cutOff = (page: Page, side: string) =>
  reader(page).getByLabel(side, { exact: true })
const undo = (page: Page) => page.getByTestId("editor-undo")
const layer = (page: Page, number = 1) =>
  page.locator(`[data-testid=editor-layer][data-page="${number}"]`)

async function open(page: Page, pages = 3) {
  await page.goto(ROUTE)
  await page
    .locator("#editor-file")
    .setInputFiles(
      await pdf("plan.pdf", "cr", { pages, size: () => [WIDE, TALL] })
    )
  await readerReady(page)
  await expect(layer(page)).toBeVisible()
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
    read,
    sizes: read.pages.map((one) => [
      Math.round(one.width),
      Math.round(one.height),
    ]),
  }
}

test("cuts a page to a frame with the keyboard and by typing, and says that it only hides", async ({
  page,
}) => {
  await open(page)
  // Nothing of the frame is there until it is asked for.
  await expect(frame(page)).toHaveCount(0)
  await reader(page).focus()
  await page.keyboard.press("y")
  await expect(pick(page, "Crop and page size")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(frame(page)).toHaveAttribute("data-off", "0,0,0,0")
  await expect(page.getByTestId("editor-hint").first()).toContainText(
    "What is cut off is hidden; it stays in the file."
  )
  // Nothing is cut off yet: there is nothing to do.
  await expect(pick(page, "Crop")).toBeDisabled()
  // The left edge has the keyboard: ten points at a time with Shift.
  await expect(edge(page, "left")).toBeFocused()
  for (let press = 0; press < 4; press++)
    await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowLeft")
  await expect(frame(page)).toHaveAttribute("data-off", "40,0,0,0")
  await expect(edge(page, "left")).toHaveAccessibleName(
    "The left edge of what is to show: 40 points cut off"
  )
  await edge(page, "top").focus()
  for (let press = 0; press < 5; press++)
    await page.keyboard.press("Shift+ArrowDown")
  await expect(frame(page)).toHaveAttribute("data-off", "40,50,0,0")
  // The bar says the same, and takes numbers.
  await expect(cutOff(page, "Left")).toHaveValue("40")
  await cutOff(page, "Right").fill("20")
  await cutOff(page, "Bottom").fill("30")
  await cutOff(page, "Bottom").blur()
  await expect(frame(page)).toHaveAttribute("data-off", "40,50,20,30")
  // More than the page has is brought back to what leaves a page.
  await cutOff(page, "Right").fill("9000")
  await cutOff(page, "Right").blur()
  await expect(frame(page)).toHaveAttribute("data-off", "40,50,342,30")
  await cutOff(page, "Right").fill("20")
  await cutOff(page, "Right").blur()
  // Enter on an edge cuts the page.
  await edge(page, "left").focus()
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Crop page 1")
  await expect(frame(page)).toHaveAttribute("data-off", "0,0,0,0")
  // Escape puts the tool down, and the window stays.
  await page.keyboard.press("Escape")
  await expect(frame(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.sizes).toEqual([
    [WIDE - 60, TALL - 80],
    [WIDE, TALL],
    [WIDE, TALL],
  ])
  // What was cut off is hidden: the page's words are all still in the file.
  expect(got.read.pages[0].text).toContain("cr-P1")
  await expect(page.getByTestId("editor-check")).toContainText(
    "Cropping hides what is outside the frame. It is still in the file, and a program can show it again."
  )
})

test("drags an edge, cuts every page or the chosen ones, shows them whole and makes them another size", async ({
  page,
}) => {
  await open(page)
  await pick(page, "Crop and page size").click()
  // The right edge, dragged a quarter of the page inwards.
  const sheet = (await layer(page).boundingBox())!
  const grip = (await edge(page, "right").boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(sheet.x + sheet.width * 0.9, sheet.y + 80, { steps: 3 })
  await page.mouse.move(sheet.x + sheet.width * 0.75, sheet.y + 80, {
    steps: 3,
  })
  await page.mouse.up()
  await expect
    .poll(async () =>
      Number((await frame(page).getAttribute("data-off"))!.split(",")[2])
    )
    .toBeGreaterThan(95)
  await cutOff(page, "Right").fill("100")
  await cutOff(page, "Right").blur()
  // For every page.
  await pick(page, "All pages").click()
  await pick(page, "Crop").click()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Crop pages 1 to 3"
  )
  // The second and third are shown whole again: they are chosen in the list of pages.
  await pick(page, "Pages").click()
  const list = page.getByTestId("editor-pages")
  await list.getByRole("option", { name: "Page 2", exact: true }).click()
  await list
    .getByRole("option", { name: "Page 3", exact: true })
    .click({ modifiers: ["Shift"] })
  await pick(page, "Chosen pages").click()
  await pick(page, "Show the whole page again").click()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Show the whole of pages 2 to 3"
  )
  // The third is made a Letter sheet.
  await list.getByRole("option", { name: "Page 3", exact: true }).click()
  await reader(page)
    .getByLabel("Page size", { exact: true })
    .selectOption("Letter")
  await reader(page)
    .getByRole("button", { name: /^Make the pages this size/ })
    .click()
  await changes(page, 3)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Resize page 3")

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.sizes).toEqual([
    [WIDE - 100, TALL],
    [WIDE, TALL],
    [612, 792],
  ])
  expect(got.read.pages[2].text).toContain("cr-P3")
})

test("stays accessible, local and responsive while a page is cut", async ({
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
  await pick(page, "Crop and page size").click()
  await expect(frame(page)).toBeVisible()
  expect(await scan()).toEqual([])
  await cutOff(page, "Top").fill("60")
  await cutOff(page, "Top").blur()
  await expect(frame(page)).toHaveAttribute("data-off", "0,60,0,0")
  // The button has its full colour once it can be pressed, a moment after it can.
  await expect(pick(page, "Crop")).toBeEnabled()
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
  // Another tool puts this one down.
  await page.keyboard.press("Escape")
  await pick(page, "Crop and page size").click()
  await expect(frame(page)).toBeVisible()
  await pick(page, "Links").click()
  await expect(frame(page)).toHaveCount(0)
  await expect(pick(page, "Crop and page size")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
