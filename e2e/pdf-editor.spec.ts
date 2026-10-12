import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument, PDFName } from "@cantoo/pdf-lib"
import { damage, makePdf } from "../tests/pdf-fixtures"
import sharp from "sharp"
import { readPictures, scene } from "../tests/pdf-pictures"
import { embeddedFonts, readPdf, textPlaces, texts } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"
/** Every page of the files made here, in points. */
const WIDE = 400
const TALL = 600

const tool = (page: Page) => page.getByTestId("pdf-editor")
const layer = (page: Page, number = 1) =>
  page.locator(`[data-testid=editor-layer][data-page="${number}"]`)
const things = (page: Page, number = 1) =>
  layer(page, number).getByTestId("editor-object")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })

const sample = (name = "plan.pdf", pages = 3) =>
  pdf(name, "ed", { pages, size: () => [WIDE, TALL] })

async function open(page: Page, upload: Upload) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  await expect(layer(page)).toBeVisible()
}

/** Where a point of a page, in the page's own points, is on the screen. */
async function spot(page: Page, x: number, y: number, number = 1) {
  const box = (await layer(page, number).boundingBox())!
  return {
    x: box.x + (x / WIDE) * box.width,
    y: box.y + (y / TALL) * box.height,
  }
}

async function click(page: Page, x: number, y: number) {
  const at = await spot(page, x, y)
  await page.mouse.click(at.x, at.y)
}

/** Press at one point of the page, move through others and let go at the last. */
async function drag(page: Page, ...points: [number, number][]) {
  const [first, ...rest] = await Promise.all(
    points.map(([x, y]) => spot(page, x, y))
  )
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (const at of rest) await page.mouse.move(at.x, at.y, { steps: 4 })
  await page.mouse.up()
}

/** Wait until the file holds this many changes and the page shows them. */
async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

/**
 * The colours the page is drawn with around a point, from the picture the
 * engine made of the file: every pixel within `room` points of it.
 */
const coloursAt = (page: Page, x: number, y: number, room = 0, number = 1) =>
  reader(page)
    .locator(`[data-testid=reader-page][data-page="${number}"] canvas`)
    .first()
    .evaluate(
      (canvas, [px, py, wide, tall, around]) => {
        const picture = canvas as HTMLCanvasElement
        const across = picture.width / wide
        const left = Math.round((px - around) * across)
        const top = Math.round((py - around) * (picture.height / tall))
        const edge = Math.max(1, Math.round(around * 2 * across))
        const { data } = picture
          .getContext("2d")!
          .getImageData(left, top, edge, edge)
        const found: number[][] = []
        for (let at = 0; at < data.length; at += 4)
          found.push([data[at], data[at + 1], data[at + 2]])
        return found
      },
      [x, y, WIDE, TALL, room]
    )

/** The colour at a point of the page. */
const colourAt = async (page: Page, x: number, y: number) =>
  (await coloursAt(page, x, y))[0]

/**
 * Whether a thin line passes close to a point. A pointer is placed to a whole
 * pixel of the screen, which on a phone is more than a point of the page, so
 * a line is looked for a little to each side of where it was drawn.
 */
const lineNear = async (
  page: Page,
  x: number,
  y: number,
  colour: (rgb: number[]) => boolean
) => (await coloursAt(page, x, y, 3)).some(colour)

const isRed = ([r, g, b]: number[]) => r > 180 && g < 90 && b < 90
const isBlue = ([r, g, b]: number[]) => b > 150 && r < 90 && g < 120
const isWhite = ([r, g, b]: number[]) => r > 245 && g > 245 && b > 245

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

/** Type into a new text box whose first line is at a point, and leave it. */
async function write(page: Page, x: number, y: number, words: string) {
  await pick(page, "Text").click()
  await click(page, x, y)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type(words)
  await page.keyboard.press("Control+Enter")
  await expect(page.getByTestId("editor-typing")).toHaveCount(0)
}

/** How many notes of a kind a page of a file carries, read with pdf-lib. */
async function stamps(bytes: Uint8Array, page = 0) {
  const doc = await PDFDocument.load(bytes)
  const notes = doc.getPage(page).node.Annots()
  if (!notes) return 0
  let count = 0
  for (let at = 0; at < notes.size(); at++) {
    const note = doc.context.lookup(notes.get(at)) as unknown as {
      get(key: unknown): unknown
    }
    if (String(note.get(PDFName.of("Subtype"))) === "/Stamp") count++
  }
  return count
}

test("adds text, shapes, a drawing and a picture, and downloads a file that other software reads", async ({
  page,
}) => {
  await open(page, await sample())
  await expect(page.getByTestId("editor-hint")).toContainText("Click a thing")

  await write(page, 60, 60, "Signed by Ada")
  await changes(page, 1)
  await expect(things(page)).toHaveCount(1)
  // After typing, the box is selected and the selection tool is in hand.
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "true")
  await expect(things(page)).toHaveAttribute("data-selected", "true")

  await pick(page, "Box").click()
  await drag(page, [60, 90], [160, 140])
  await changes(page, 2)
  // The page is drawn again from the file: the box's edge is on it.
  await expect.poll(() => lineNear(page, 110, 90, isRed)).toBe(true)

  await pick(page, "Ellipse").click()
  await drag(page, [200, 90], [300, 140])
  await pick(page, "Line").click()
  await drag(page, [60, 170], [160, 170])
  await pick(page, "Arrow").click()
  await drag(page, [200, 170], [300, 170])
  await changes(page, 5)

  await pick(page, "Draw").click()
  await drag(page, [60, 240], [90, 220], [120, 240], [150, 220])
  await changes(page, 6)
  await expect.poll(() => lineNear(page, 90, 220, isBlue)).toBe(true)

  const dots = scene(40, 30)
  await reader(page)
    .getByLabel("Choose a picture to add")
    .setInputFiles({
      name: "dots.png",
      mimeType: "image/png",
      buffer: await sharp(Buffer.from(dots.data), {
        raw: { width: 40, height: 30, channels: 4 },
      })
        .png()
        .toBuffer(),
    })
  await changes(page, 7)
  await expect(things(page)).toHaveCount(7)
  await expect(
    things(page).evaluateAll((list) =>
      list.map((one) => (one as HTMLElement).dataset.kind)
    )
  ).resolves.toEqual([
    "text",
    "box",
    "ellipse",
    "line",
    "arrow",
    "ink",
    "picture",
  ])

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.name).toBe("plan-edited.pdf")
  await expect(page.getByTestId("editor-check")).toContainText(
    "The text you added was read back from the result."
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "2 pages you did not change were compared with the original and look the same."
  )
  await expect(tool(page)).not.toHaveAttribute("data-unsaved")

  // pdf.js reads the new words where they were put, beside the old ones.
  const read = await texts(got.bytes)
  expect(read[0]).toContain("Signed by Ada")
  expect(read).toHaveLength(3)
  for (const [at, words] of read.entries())
    expect(words).toContain(`ed-P${at + 1}`)
  const [placed] = (await textPlaces(got.bytes))[0].filter(
    (run) => run.text === "Signed by Ada"
  )
  expect(Math.abs(placed.x - 60)).toBeLessThan(2)
  // The point that was clicked is at half the height of the line.
  expect(placed.y).toBeGreaterThan(60)
  expect(placed.y).toBeLessThan(68)
  expect(Math.abs(placed.size - 12)).toBeLessThan(0.1)
  // The font is in the file, cut down to the letters used.
  const fonts = (await embeddedFonts(got.bytes)).filter((font) =>
    font.name.includes("LiberationSans")
  )
  expect(fonts).toHaveLength(1)
  expect(fonts[0].bytes).toBeGreaterThan(0)
  expect(fonts[0].bytes).toBeLessThan(40_000)
  // The picture went in with the pixels it came with.
  const pictures = await readPictures(got.bytes)
  expect(pictures.map((one) => [one.width, one.height])).toEqual([[40, 30]])
  expect(Buffer.from(pictures[0].data).equals(Buffer.from(dots.data))).toBe(
    true
  )
  // What was added is part of the page now, not notes on top of it.
  expect(await stamps(got.bytes)).toBe(0)
})

test("moves, resizes, turns, restyles and removes a thing with the mouse and the keys, and undoes it", async ({
  page,
}) => {
  await open(page, await sample())
  // A box that is filled, so that it can be seen and taken hold of anywhere.
  await pick(page, "Box").click()
  await reader(page).getByRole("button", { name: "Inside: Blue" }).click()
  await drag(page, [60, 100], [140, 160])
  await changes(page, 1)
  const box = things(page).first()
  await expect(box).toHaveAttribute("data-selected", "true")
  await expect
    .poll(async () => isBlue(await colourAt(page, 100, 130)))
    .toBe(true)
  await expect(page.getByTestId("editor-handle")).toHaveCount(9)

  // Moved by dragging.
  await drag(page, [100, 130], [220, 130])
  await changes(page, 2)
  await expect
    .poll(async () => isBlue(await colourAt(page, 220, 130)))
    .toBe(true)
  expect(isWhite(await colourAt(page, 100, 130))).toBe(true)

  // Made wider by its right handle.
  await drag(page, [260, 130], [320, 130])
  await changes(page, 3)
  await expect
    .poll(async () => isBlue(await colourAt(page, 300, 130)))
    .toBe(true)

  // Nudged by the arrow keys: one point, and ten with Shift. Presses that
  // follow each other closely are one change, and none of the way is lost.
  await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("ArrowDown")
  await changes(page, 4)
  await expect
    .poll(async () => isBlue(await colourAt(page, 250, 168)))
    .toBe(true)
  expect(isWhite(await colourAt(page, 250, 106))).toBe(true)

  // A new look from the bar.
  await reader(page).getByRole("button", { name: "Inside: Red" }).click()
  await changes(page, 5)
  await expect
    .poll(async () => isRed(await colourAt(page, 250, 140)))
    .toBe(true)

  // Turned by the round handle above it: a quarter turn stands it on end.
  const turn = page.locator("[data-testid=editor-handle][data-handle=turn]")
  const from = (await turn.boundingBox())!
  const centre = await spot(page, 250, 141)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(centre.x + 120, centre.y, { steps: 6 })
  await page.mouse.up()
  await changes(page, 6)
  await expect.poll(async () => isRed(await colourAt(page, 250, 80))).toBe(true)
  expect(isWhite(await colourAt(page, 190, 141))).toBe(true)

  // Duplicated, and the copy deleted.
  await page.keyboard.press("Control+d")
  await changes(page, 7)
  await expect(things(page)).toHaveCount(2)
  await page.keyboard.press("Delete")
  await changes(page, 8)
  await expect(things(page)).toHaveCount(1)

  // Everything is undone, back to the file as it was opened, and done again.
  const undo = page.getByTestId("editor-undo")
  await expect(undo).toHaveAttribute("aria-label", "Undo: Delete box")
  for (let step = 8; step > 0; step--) {
    await page.keyboard.press("Control+z")
    await changes(page, step - 1)
  }
  await expect(things(page)).toHaveCount(0)
  await expect(undo).toBeDisabled()
  await expect
    .poll(async () => isWhite(await colourAt(page, 250, 80)))
    .toBe(true)
  await expect(tool(page)).not.toHaveAttribute("data-unsaved")
  for (let step = 0; step < 6; step++) {
    await page.getByTestId("editor-redo").click()
    await changes(page, step + 1)
  }
  await expect(things(page)).toHaveCount(1)
  await expect.poll(async () => isRed(await colourAt(page, 250, 80))).toBe(true)

  // Reached without a mouse: a thing that takes focus is selected, and Escape lets go of it.
  await page.keyboard.press("Escape")
  await expect(box).not.toHaveAttribute("data-selected")
  await box.focus()
  await expect(box).toHaveAttribute("data-selected", "true")
  await expect(box).toHaveAccessibleName("Box")
  // The window is still open: Escape was used for the selection.
  await page.keyboard.press("Escape")
  await expect(reader(page)).toBeVisible()
})

test("types text in a font, size and colour of its own, and changes the words later", async ({
  page,
}) => {
  await open(page, await sample("letter.pdf", 1))
  await pick(page, "Text").click()
  await click(page, 50, 120)
  const field = page.getByTestId("editor-typing")
  await expect(field).toBeFocused()
  await page.keyboard.type("Dear Ada")
  // The look is chosen while typing, and typing goes on.
  await reader(page).getByRole("button", { name: "Serif" }).click()
  await reader(page).getByRole("button", { name: "Bold", exact: true }).click()
  await reader(page).getByRole("button", { name: "Colour: Red" }).click()
  await expect(field).toBeVisible()
  await field.focus()
  await page.keyboard.type(",")
  // Clicking away ends it.
  await click(page, 300, 260)
  await changes(page, 1)
  await expect(things(page).first()).toHaveAccessibleName("Text box: Dear Ada,")

  // A larger size from the bar.
  await reader(page).getByLabel("Size").fill("24")
  await changes(page, 2)

  // Enter opens the box again; its words are changed.
  await things(page).first().focus()
  await page.keyboard.press("Enter")
  await expect(field).toHaveValue("Dear Ada,")
  await page.keyboard.type(" hello")
  await page.keyboard.press("Control+Enter")
  await changes(page, 3)

  // Escape while typing leaves the words as they were.
  await things(page).first().focus()
  await page.keyboard.press("Enter")
  await page.keyboard.type(" and more")
  await page.keyboard.press("Escape")
  await expect(field).toHaveCount(0)
  await changes(page, 3)
  // Emptied, the box goes away; undo brings it back.
  await things(page).first().focus()
  await page.keyboard.press("Enter")
  await field.fill("")
  await page.keyboard.press("Control+Enter")
  await changes(page, 4)
  await expect(things(page)).toHaveCount(0)
  await page.keyboard.press("Control+z")
  await changes(page, 3)

  const got = await saved(page, page.getByTestId("editor-download"))
  const runs = (await textPlaces(got.bytes))[0].filter((run) =>
    run.text.includes("Dear")
  )
  expect(runs.map((run) => run.text).join(" ")).toContain("Dear Ada, hello")
  expect(Math.abs(runs[0].size - 24)).toBeLessThan(0.1)
  expect(Math.abs(runs[0].x - 50)).toBeLessThan(2)
  const fonts = (await embeddedFonts(got.bytes)).map((font) => font.name)
  expect(fonts.some((name) => name.includes("LiberationSerif-Bold"))).toBe(true)
  // The font it was first typed in is not carried along.
  expect(fonts.some((name) => name.includes("LiberationSans"))).toBe(false)
})

test("puts what is still being typed into the file when Download is pressed", async ({
  page,
}) => {
  await open(page, await sample("hurry.pdf", 1))
  await pick(page, "Text").click()
  await click(page, 60, 80)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type("Not finished typing")
  // No click away, no Enter: straight to the button.
  const got = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "The text you added was read back from the result."
  )
  await expect(tool(page)).not.toHaveAttribute("data-unsaved")
  expect((await texts(got.bytes))[0]).toContain("Not finished typing")
})

test("stamps a page with chosen words, and with words of one's own", async ({
  page,
}) => {
  await open(page, await sample("invoice.pdf", 1))
  await pick(page, "Stamp").click()
  await expect(page.getByTestId("editor-hint")).toHaveCount(0)
  // One of the usual words, placed with a click.
  await reader(page).getByRole("button", { name: "Draft", exact: true }).click()
  await click(page, 200, 150)
  await changes(page, 1)
  const stamp = things(page).first()
  await expect(stamp).toHaveAccessibleName("Stamp: Draft")
  await expect(stamp).toHaveAttribute("data-selected", "true")
  await expect(page.getByTestId("editor-handle")).toHaveCount(9)

  // Words of one's own are taken when the field is left, as one step.
  const own = reader(page).getByLabel("Your own")
  await own.fill("Paid in full")
  await own.press("Enter")
  await changes(page, 2)
  await expect(stamp).toHaveAccessibleName("Stamp: Paid in full")
  await reader(page).getByRole("button", { name: "Colour: Blue" }).click()
  await changes(page, 3)
  // Its frame is on the page, in its colour, around where it was placed.
  await expect.poll(() => lineNear(page, 200, 127, isBlue)).toBe(true)
  // One undo takes the words back.
  await page.getByTestId("editor-undo").click()
  await page.getByTestId("editor-undo").click()
  await changes(page, 1)
  await expect(stamp).toHaveAccessibleName("Stamp: Draft")
  await page.getByTestId("editor-redo").click()
  await changes(page, 2)

  const got = await saved(page, page.getByTestId("editor-download"))
  // The words are real text, in capitals, in a font cut down to them, and
  // the check read them back.
  await expect(page.getByTestId("editor-check")).toContainText(
    "1 thing you added is part of its page now."
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "The text you added was read back from the result."
  )
  expect((await texts(got.bytes))[0]).toContain("PAID IN FULL")
  const fonts = (await embeddedFonts(got.bytes)).filter((font) =>
    font.name.includes("LiberationSans-Bold")
  )
  expect(fonts).toHaveLength(1)
  expect(fonts[0].bytes).toBeLessThan(40_000)
})

test("measures a length in a unit, and by the scale of a drawing", async ({
  page,
}) => {
  await open(page, await sample("drawing.pdf", 1))
  await page.keyboard.press("r")
  await expect(pick(page, "Measure")).toHaveAttribute("aria-pressed", "true")
  // Two hundred points along the page: a little over seven centimetres.
  await drag(page, [60, 200], [260, 200])
  await changes(page, 1)
  const line = things(page).first()
  await expect(line).toHaveAccessibleName(/^Measuring line: 7\d(\.\d)? mm$/)
  await reader(page).getByRole("button", { name: "Unit: cm" }).click()
  await changes(page, 2)
  await expect(line).toHaveAccessibleName(/^Measuring line: 7(\.\d\d?)? cm$/)
  // At one to fifty the same line is some three and a half metres.
  const scale = reader(page).getByLabel("Scale 1 to")
  await scale.fill("50")
  await scale.press("Enter")
  await changes(page, 3)
  await reader(page)
    .getByRole("button", { name: "Unit: m", exact: true })
    .click()
  await changes(page, 4)
  await expect(line).toHaveAccessibleName(/^Measuring line: 3\.\d\d? m$/)
  const said = (await line.getAttribute("aria-label"))!.replace(
    "Measuring line: ",
    ""
  )
  // The line and its label are drawn on the page.
  await expect.poll(() => lineNear(page, 160, 200, isRed)).toBe(true)

  // Pulled by its end, it says its new length.
  const end = page.locator("[data-testid=editor-handle][data-handle=end]")
  const from = (await end.boundingBox())!
  const to = await spot(page, 360, 200)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await changes(page, 5)
  await expect(line).not.toHaveAccessibleName(`Measuring line: ${said}`)
  await expect(line).toHaveAccessibleName(/^Measuring line: 5\.\d\d? m$/)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect((await texts(got.bytes))[0]).toMatch(/5\.\d\d? m/)
})

test("points at something with a call-out, and moves what it points at", async ({
  page,
}) => {
  await open(page, await sample("review.pdf", 1))
  await page.keyboard.press("q")
  await expect(pick(page, "Call-out")).toHaveAttribute("aria-pressed", "true")
  // From what is pointed at, to where the words go.
  await drag(page, [80, 240], [200, 120])
  const field = page.getByTestId("editor-typing")
  await expect(field).toBeFocused()
  await page.keyboard.type("Check this")
  await page.keyboard.press("Control+Enter")
  await changes(page, 1)
  const callout = things(page).first()
  await expect(callout).toHaveAccessibleName("Call-out: Check this")
  // It has its two sides and the point; it is not turned.
  await expect(
    page
      .getByTestId("editor-handle")
      .evaluateAll((list) =>
        list.map((one) => (one as HTMLElement).dataset.handle)
      )
  ).resolves.toEqual(["w", "e", "tip"])
  // Its frame and its line are on the page, in the colour of arrows.
  await expect.poll(() => lineNear(page, 196, 110, isRed)).toBe(true)
  await expect.poll(() => lineNear(page, 140, 183, isRed)).toBe(true)

  // The point is dragged elsewhere: the line follows, the words stay.
  const before = (await callout.boundingBox())!
  const tip = page.locator("[data-testid=editor-handle][data-handle=tip]")
  const from = (await tip.boundingBox())!
  const to = await spot(page, 330, 240)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
  await changes(page, 2)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Resize call-out"
  )
  await expect.poll(() => lineNear(page, 140, 183, isRed)).toBe(false)
  await expect.poll(() => lineNear(page, 330, 200, isRed)).toBe(true)
  const after = (await callout.boundingBox())!
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)

  // Its words are changed like any text box's.
  await callout.focus()
  await page.keyboard.press("Enter")
  await expect(field).toHaveValue("Check this")
  await page.keyboard.type(" figure")
  await page.keyboard.press("Control+Enter")
  await changes(page, 3)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect((await texts(got.bytes))[0]).toContain("Check this figure")
  await expect(page.getByTestId("editor-check")).toContainText(
    "The text you added was read back from the result."
  )
})

test("keeps what was added movable when asked, and goes on with it when the file is opened again", async ({
  page,
}) => {
  await open(page, await sample("notes.pdf", 2))
  await write(page, 60, 120, "First draft")
  await pick(page, "Cover").click()
  await drag(page, [60, 200], [200, 250])
  await changes(page, 2)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(page.getByTestId("editor-changes")).toHaveText(
    "2 changes · not yet downloaded"
  )
  // The card shows the page as the file now has it.
  await expect(page.getByTestId("editor-preview")).toHaveAttribute(
    "data-drawn",
    /\d+/
  )

  await page
    .getByRole("switch", { name: "Keep what you added editable" })
    .click()
  const kept = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  expect(await stamps(kept.bytes)).toBe(2)
  expect((await texts(kept.bytes))[0]).toContain("ed-P1")

  // Opened again, the two things are there to be changed.
  await page.getByRole("button", { name: "Close the file" }).click()
  await page.locator("#editor-file").setInputFiles({
    name: kept.name,
    mimeType: "application/pdf",
    buffer: Buffer.from(kept.bytes),
  })
  await readerReady(page)
  await expect(things(page)).toHaveCount(2)
  await expect(things(page).first()).toHaveAccessibleName(
    "Text box: First draft"
  )
  await things(page).nth(1).focus()
  await page.keyboard.press("Delete")
  await changes(page, 1)
  await expect(things(page)).toHaveCount(1)

  // Without the switch, what is left becomes part of the page.
  const flat = await saved(page, page.getByTestId("editor-download"))
  expect(flat.name).toBe("notes-edited-edited.pdf")
  expect(await stamps(flat.bytes)).toBe(0)
  expect((await texts(flat.bytes))[0]).toContain("First draft")

  // The result can be read here, and edited further afterwards.
  await page.getByRole("button", { name: "Read the result" }).click()
  await readerReady(page)
  await expect(reader(page)).toContainText("notes-edited-edited.pdf")
  await page.getByRole("button", { name: "Close the reader" }).click()
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await expect(things(page)).toHaveCount(1)
})

test("opens a locked file with its password, and locks the result with a new one", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(
    await pdf("locked.pdf", "lk", {
      pages: 1,
      size: () => [WIDE, TALL],
      password: { user: "open sesame" },
    })
  )
  await expect(tool(page)).toHaveAttribute("data-state", "locked", {
    timeout: 60_000,
  })
  const password = page.getByLabel("Password for locked.pdf")
  await password.fill("wrong")
  await page.getByRole("button", { name: "Unlock" }).click()
  await expect(tool(page).getByRole("alert")).toContainText(
    "That password did not open this file"
  )
  await page.getByLabel("Password for locked.pdf").fill("open sesame")
  await page.getByRole("button", { name: "Unlock" }).click()
  await readerReady(page)
  await write(page, 60, 150, "Seen and approved")
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()

  // A lock needs a password before anything is written.
  await page
    .getByRole("switch", { name: "Lock the result with a password" })
    .click()
  await expect(
    page.getByRole("button", { name: "Download PDF" })
  ).toBeDisabled()
  await page.getByLabel("Password to open the file").fill("new secret 9")
  const got = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "Locked with your password."
  )
  await expect(readPdf(got.bytes)).rejects.toThrow()
  await expect(readPdf(got.bytes, "open sesame")).rejects.toThrow()
  const read = await texts(got.bytes, "new secret 9")
  expect(read[0]).toContain("Seen and approved")
  expect(read[0]).toContain("lk-P1")
  // The locked result is read here before it is trusted.
  await page.getByRole("button", { name: "Read the result" }).click()
  await readerReady(page)
})

test("repairs a damaged file, and says so when a file cannot be edited", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a PDF at all"),
  })
  await expect(tool(page).getByRole("alert")).toHaveText(
    "notes.txt is not a PDF."
  )

  await page.locator("#editor-file").setInputFiles({
    name: "cut.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n1 0 obj\n<< >>\nendobj\n"),
  })
  await expect(tool(page)).toHaveAttribute("data-state", "failed", {
    timeout: 60_000,
  })
  await expect(page.getByTestId("editor-file")).toContainText("cut.pdf")
  await page.getByRole("button", { name: "Choose another file" }).click()

  const whole = await makePdf("fix", { pages: 2, size: () => [WIDE, TALL] })
  await page.locator("#editor-file").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(damage(whole, "table")),
  })
  await readerReady(page)
  await write(page, 60, 150, "Mended")
  await changes(page, 1)
  const got = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-note")).toContainText("repaired")
  const read = await texts(got.bytes)
  expect(read).toHaveLength(2)
  expect(read[0]).toContain("Mended")
  expect(read[1]).toContain("fix-P2")
})

test("asks before unsaved changes are thrown away", async ({ page }) => {
  /** Whether the browser would ask before this page is left. */
  const asks = () =>
    page.evaluate(() => {
      const leaving = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(leaving)
      return leaving.defaultPrevented
    })
  await open(page, await sample())
  expect(await asks()).toBe(false)
  await pick(page, "Box").click()
  await drag(page, [60, 100], [140, 160])
  await changes(page, 1)
  expect(await asks()).toBe(true)
  await page.getByRole("button", { name: "Close the editor" }).click()

  // Closing the file asks first, and can be called off.
  await page.getByRole("button", { name: "Close the file" }).click()
  const question = page.getByRole("alertdialog")
  await expect(question).toContainText("have not been downloaded")
  await question.getByRole("button", { name: "Keep the file open" }).click()
  await expect(question).toHaveCount(0)
  await expect(page.getByTestId("editor-changes")).toContainText("1 change")

  // Once downloaded, nothing is unsaved; a further change is.
  await saved(page, page.getByRole("button", { name: "Download PDF" }))
  expect(await asks()).toBe(false)
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await things(page).first().focus()
  await page.keyboard.press("ArrowRight")
  await changes(page, 2)
  expect(await asks()).toBe(true)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(page.getByTestId("editor-changes")).toHaveText(
    "2 changes · changed since the last download"
  )
  await expect(page.getByTestId("result")).toContainText(
    "Something changed since the last download."
  )
  await page.getByRole("button", { name: "Close the file" }).click()
  await page.getByRole("button", { name: "Close without downloading" }).click()
  await expect(tool(page)).toHaveAttribute("data-state", "empty")
  expect(await asks()).toBe(false)
})

test("works with a finger", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Needs a touch screen.")
  await open(page, await sample("touch.pdf", 2))
  const tap = async (x: number, y: number) => {
    const at = await spot(page, x, y)
    await page.touchscreen.tap(at.x, at.y)
  }
  await pick(page, "Text").tap()
  await tap(60, 120)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type("By hand")
  // A tap on the page ends the typing.
  await tap(300, 300)
  await changes(page, 1)
  await expect(things(page)).toHaveCount(1)

  // A tap on empty paper lets go of it; a tap on the thing takes hold of it again.
  await tap(300, 300)
  await expect(things(page).first()).not.toHaveAttribute("data-selected")
  await tap(80, 120)
  await expect(things(page).first()).toHaveAttribute("data-selected", "true")
  await reader(page).getByRole("button", { name: "Duplicate" }).tap()
  await changes(page, 2)
  await expect(things(page)).toHaveCount(2)
  await reader(page).getByRole("button", { name: "Delete" }).tap()
  await changes(page, 3)
  await page.getByTestId("editor-undo").tap()
  await changes(page, 2)

  const got = await saved(page, page.getByTestId("editor-download"))
  const words = (await texts(got.bytes))[0]
  expect(words.split("By hand")).toHaveLength(3)
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
  const scanOf = (part?: string) => async () => {
    const axe = new AxeBuilder({ page }).withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21aa",
    ])
    return (await (part ? axe.include(part) : axe).analyze()).violations
  }
  /** The page behind the window. */
  const scan = scanOf()
  /** The window by itself: the page behind it is out of reach while it is open. */
  const scanWindow = scanOf("[role=dialog]")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  expect(await scan()).toEqual([])

  await page.locator("#editor-file").setInputFiles(await sample())
  await readerReady(page)
  // The window with nothing selected, with a tool in hand, while typing, and with a thing selected.
  expect(await scanWindow()).toEqual([])
  await pick(page, "Box").click()
  expect(await scanWindow()).toEqual([])
  await drag(page, [60, 100], [140, 160])
  await changes(page, 1)
  expect(await scanWindow()).toEqual([])
  await pick(page, "Text").click()
  await click(page, 60, 220)
  await expect(page.getByTestId("editor-typing")).toBeFocused()
  await page.keyboard.type("Checked")
  expect(await scanWindow()).toEqual([])
  await page.keyboard.press("Control+Enter")
  await changes(page, 2)
  expect(await scanWindow()).toEqual([])

  // On a phone the bars are one line each, and every control is large enough to press.
  await page.setViewportSize({ width: 320, height: 740 })
  // The page takes a moment to settle at its new width.
  await expect
    .poll(async () => (await pick(page, "Select").boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  const small = await page.locator("[data-editor-bar]").evaluate((element) =>
    [...element.querySelectorAll("button, input:not(.sr-only)")]
      .map((control) => ({
        name: control.getAttribute("aria-label") ?? control.textContent,
        box: control.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.height > 1 && box.height < 44)
      .map(({ name }) => name)
  )
  expect(small).toEqual([])
  const bar = (await page.locator("[data-editor-bar]").boundingBox())!
  expect(bar.height).toBeLessThan(120)

  // Behind the window: the file's card and the download, in both themes.
  await saved(page, page.getByTestId("editor-download"))
  await page
    .getByRole("switch", { name: "Lock the result with a password" })
    .click()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  const tight = await tool(page).evaluate((element) =>
    [...element.querySelectorAll("button, input:not(.sr-only), a[href]")]
      .map((control) => ({
        name: control.getAttribute("aria-label") ?? control.textContent,
        box: control.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.height > 1 && box.height < 44)
      .map(({ name }) => name)
  )
  expect(tight).toEqual([])
  // The window in the dark theme.
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await things(page).first().focus()
  expect(await scanWindow()).toEqual([])
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the written help explains the tools and what Cover does not do", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "A little help along the way" })
  ).toBeVisible()
  await expect(page.getByText("Pick a tool", { exact: true })).toBeVisible()
  await page.getByText("Every option explained").click()
  await expect(
    page.getByText("It only covers: the words underneath are still in the file")
  ).toBeVisible()
})
