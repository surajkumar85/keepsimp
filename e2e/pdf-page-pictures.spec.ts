import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import {
  chart,
  makeDrawnPdf,
  paintedPictures,
  pictureText,
  scene,
  storeRgb,
} from "../tests/pdf-pictures"
import { danglingRefs, readPdf, storedPictures } from "../tests/pdf-reader"
import { bytesOf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const pictures = (page: Page) => page.getByTestId("editor-picture")
const hint = (page: Page) => page.getByTestId("editor-hint").first()
const undo = (page: Page) => page.getByTestId("editor-undo")

/** A photograph 240 points wide by 144 at 40, 72 from the page's top left, and a chart 100 by 100 under it. */
async function album(): Promise<Upload> {
  const bytes = await makeDrawnPdf((doc) => [
    { ref: storeRgb(doc, scene(200, 120)), width: 240, height: 144 },
    { ref: storeRgb(doc, chart(100, 100)), width: 100, height: 100 },
  ])
  return {
    name: "album.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  }
}
const PHOTO = [40, 72, 240, 144]
const CHART = [40, 226, 100, 100]

async function open(page: Page) {
  const upload = await album()
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  return new Uint8Array(upload.buffer)
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
  expect((await readPdf(bytes)).pages[0].text).toContain(pictureText(1))
  return bytes
}

const boxes = async (bytes: Uint8Array) =>
  (await paintedPictures(bytes))[0].map((one) =>
    [one.x, one.y, one.width, one.height].map((value) => Math.round(value))
  )

/** Another picture, twice as high as wide. */
const tall = async () => ({
  name: "tall.png",
  mimeType: "image/png",
  buffer: await sharp({
    create: {
      width: 50,
      height: 100,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer(),
})

test("moves a picture of the page by dragging it, and changes its size by its corner", async ({
  page,
}) => {
  const original = await open(page)
  expect(await boxes(original)).toEqual([PHOTO, CHART])
  // Nothing of the page's own pictures is offered until it is asked for.
  await expect(pictures(page)).toHaveCount(0)
  await pick(page, "Pictures of the page").click()
  await expect(pick(page, "Pictures of the page")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "false")
  await expect(hint(page)).toContainText("Click a picture of the page")
  await expect(pictures(page)).toHaveCount(2)
  await expect(pictures(page).first()).toHaveAccessibleName(
    "Picture 1 of the page, 200 by 120 dots"
  )

  // How many pixels of the screen a point of the page is.
  const chartBox = (await pictures(page).nth(1).boundingBox())!
  const scale = chartBox.width / 100
  // The chart, dragged to the right and down.
  await page.mouse.move(chartBox.x + 20, chartBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(chartBox.x + 60, chartBox.y + 50, { steps: 4 })
  await page.mouse.move(
    chartBox.x + 20 + 120 * scale,
    chartBox.y + 20 + 30 * scale,
    {
      steps: 4,
    }
  )
  await page.mouse.up()
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Move a picture")
  // The page is read again, and the frame is where the file has the picture.
  await expect(pictures(page).nth(1)).toHaveAttribute(
    "data-box",
    /^1(59|60|61),25[5-7],100,100$/
  )

  // Chosen, it has a corner to drag: half as wide, and half as high with it.
  await pictures(page).nth(1).click()
  await expect(pictures(page).nth(1)).toHaveAttribute("aria-pressed", "true")
  await page.getByTestId("editor-picture-corner").scrollIntoViewIfNeeded()
  const corner = (await page
    .getByTestId("editor-picture-corner")
    .boundingBox())!
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(corner.x - 10, corner.y, { steps: 3 })
  await page.mouse.move(
    corner.x + corner.width / 2 - 50 * scale,
    corner.y + corner.height / 2,
    { steps: 4 }
  )
  await page.mouse.up()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Resize a picture"
  )

  const [photo, moved] = await boxes(
    await saved(page, page.getByTestId("editor-download"))
  )
  expect(photo).toEqual(PHOTO)
  expect(Math.abs(moved[0] - 160)).toBeLessThanOrEqual(2)
  expect(Math.abs(moved[1] - 256)).toBeLessThanOrEqual(2)
  expect(Math.abs(moved[2] - 50)).toBeLessThanOrEqual(2)
  expect(Math.abs(moved[3] - 50)).toBeLessThanOrEqual(2)
})

test("moves, resizes, turns and takes out a picture with the keyboard alone, and undoes it", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("i")
  await expect(pictures(page)).toHaveCount(2)
  await expect(pictures(page).first()).toHaveAttribute(
    "data-box",
    PHOTO.join(",")
  )
  await pictures(page).first().focus()
  await page.keyboard.press("Shift+ArrowRight")
  await changes(page, 1)
  // The keyboard stays on the picture, where the file now has it.
  await expect(pictures(page).first()).toHaveAttribute(
    "data-box",
    "50,72,240,144"
  )
  await expect(pictures(page).first()).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await changes(page, 2)
  await expect(pictures(page).first()).toHaveAttribute(
    "data-box",
    "50,73,240,144"
  )
  await expect(pictures(page).first()).toBeFocused()
  // Plus makes it a tenth larger, about its top left corner.
  await page.keyboard.press("+")
  await changes(page, 3)
  await expect(pictures(page).first()).toHaveAttribute(
    "data-box",
    "50,73,264,158"
  )
  await expect(pictures(page).first()).toBeFocused()
  // Enter chooses it, and the bar turns it.
  await page.keyboard.press("Enter")
  await expect(pictures(page).first()).toHaveAttribute("aria-pressed", "true")
  await pick(page, "Turn it a quarter to the right").click()
  await changes(page, 4)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Turn a picture")

  let bytes = await saved(page, page.getByTestId("editor-download"))
  let [photo, drawn] = await boxes(bytes)
  expect(drawn).toEqual(CHART)
  // 264 by 158 at 50, 73, turned onto its side about its middle.
  expect(photo).toEqual([103, 20, 158, 264])

  // A file opened afresh.
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(await album())
  await readerReady(page)
  await page.keyboard.press("i")
  await pictures(page).nth(1).focus()
  await page.keyboard.press("Delete")
  await changes(page, 1)
  await expect(pictures(page)).toHaveCount(1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Take out a picture"
  )
  bytes = await saved(page, page.getByTestId("editor-download"))
  ;[photo, drawn] = await boxes(bytes)
  expect(photo).toEqual(PHOTO)
  expect(drawn).toBeUndefined()
  // Taken out, it is out of the file too.
  expect(await storedPictures(bytes)).toBe(1)
})

test("cuts a picture to a part, says that the rest is only hidden, and shows it whole again", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("i")
  await pictures(page).first().click()
  await pick(page, "Cut it to a part").click()
  await expect(hint(page)).toContainText(
    "The rest is hidden, not removed from the file."
  )
  // The keyboard is on the left edge of the frame: 60 points in, of 240.
  const left = page.getByTestId("editor-cut-left")
  await expect(left).toBeFocused()
  for (let press = 0; press < 6; press++)
    await page.keyboard.press("Shift+ArrowRight")
  await page.getByTestId("editor-cut-bottom").focus()
  for (let press = 0; press < 7; press++)
    await page.keyboard.press("Shift+ArrowUp")
  // Escape leaves the picture as it is, and the tool in hand.
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("editor-cut-frame")).toHaveCount(0)
  await changes(page, 0)

  await pick(page, "Cut it to a part").click()
  await expect(left).toBeFocused()
  for (let press = 0; press < 6; press++)
    await page.keyboard.press("Shift+ArrowRight")
  // Enter on the frame cuts, as Done in the bar does.
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Cut a picture to a part"
  )
  // What shows is 180 points wide now, and the picture says that it is cut.
  await expect(pictures(page).first()).toHaveAccessibleName(
    "Picture 1 of the page, 200 by 120 dots, cut to a part"
  )
  const shown = (await pictures(page).first().boundingBox())!
  const whole = (await pictures(page).nth(1).boundingBox())!
  expect(shown.width / whole.width).toBeCloseTo(1.8, 1)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  const [painted] = await paintedPictures(bytes)
  // The check says what cutting does and does not do.
  await expect(page.getByTestId("editor-check")).toContainText(
    "Pictures the page already had were changed in 1 place. A picture that was cut to a part is whole in the file: the rest of it is hidden, not removed."
  )
  // The picture is where it was, whole in the file; a clip shows the part.
  expect(painted.map((one) => one.clipped)).toEqual([true, false])
  expect(await boxes(bytes)).toEqual([PHOTO, CHART])
  expect(await storedPictures(bytes)).toBe(2)
})

test("puts another picture in the place of one, whole and undistorted", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("i")
  await pictures(page).first().click()
  await reader(page)
    .getByLabel("Choose a picture to put in its place")
    .setInputFiles(await tall())
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Put another picture in its place"
  )
  await expect(pictures(page).first()).toHaveAccessibleName(
    "Picture 1 of the page, 50 by 100 dots"
  )
  // What is no picture is said to be none, and nothing is changed.
  await pictures(page).nth(1).click()
  await reader(page)
    .getByLabel("Choose a picture to put in its place")
    .setInputFiles({
      name: "notes.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a picture"),
    })
  await expect(reader(page).getByRole("alert")).toContainText(
    "This picture could not be read"
  )
  await changes(page, 1)

  const bytes = await saved(page, page.getByTestId("editor-download"))
  const [painted] = await paintedPictures(bytes)
  // As high as the photograph was and half as wide as high, in its middle.
  expect(await boxes(bytes)).toEqual([[124, 72, 72, 144], CHART])
  expect(painted[0].dots).toEqual({ width: 50, height: 100 })
  // The photograph is no longer in the file.
  expect(await storedPictures(bytes)).toBe(2)
})

test("puts the tool down when another is taken, and lets go of a picture on Escape", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("i")
  await expect(pictures(page)).toHaveCount(2)
  await pictures(page).first().click()
  await expect(pick(page, "Take the picture out")).toBeVisible()
  // Escape lets go of the picture first, then of the tool.
  await page.keyboard.press("Escape")
  await expect(pick(page, "Take the picture out")).toHaveCount(0)
  await expect(pictures(page)).toHaveCount(2)
  await page.keyboard.press("Escape")
  await expect(pictures(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()
  // Changing text and changing pictures are one at a time.
  await page.keyboard.press("i")
  await expect(pictures(page)).toHaveCount(2)
  await page.keyboard.press("e")
  await expect(pictures(page)).toHaveCount(0)
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.keyboard.press("i")
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await expect(pictures(page)).toHaveCount(2)
  await pick(page, "Text").click()
  await expect(pictures(page)).toHaveCount(0)
  await changes(page, 0)
})

test("stays accessible, local and responsive while pictures are changed", async ({
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
  await pick(page, "Pictures of the page").click()
  await expect(pictures(page)).toHaveCount(2)
  expect(await scan()).toEqual([])
  await pictures(page).first().click()
  expect(await scan()).toEqual([])
  await pick(page, "Cut it to a part").click()
  await expect(page.getByTestId("editor-cut-left")).toBeFocused()
  expect(await scan()).toEqual([])
  await page.keyboard.press("Escape")
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
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
