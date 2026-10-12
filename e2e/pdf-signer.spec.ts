import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import sharp from "sharp"
import { readPictures } from "../tests/pdf-pictures"
import { embeddedFonts, texts } from "../tests/pdf-reader"
import {
  bytesOf,
  pdf,
  reader,
  readerReady,
  scrollReader,
  type Upload,
} from "./pdf"

const ROUTE = "/dashboard/sign-pdf/"
/** Every page of the files made here, in points. */
const WIDE = 400
const TALL = 600

const tool = (page: Page) => page.getByTestId("pdf-editor")
const layer = (page: Page) =>
  page.locator('[data-testid=editor-layer][data-page="1"]')
const things = (page: Page) => layer(page).getByTestId("editor-object")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const sheet = (page: Page) => page.getByTestId("signature-dialog")
/** The button at the foot of the signature window, as against the one beside a remembered signature. */
const placeIt = (page: Page) =>
  sheet(page).getByRole("button", { name: "Place it on the page" }).last()

const form = (name = "form.pdf"): Promise<Upload> =>
  pdf(name, "sg", { pages: 2, size: () => [WIDE, TALL] })

/** Open a file on the page for signing. The signature window opens with it. */
async function open(page: Page, upload: Upload) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  await expect(sheet(page)).toBeVisible()
}

async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

/** Sign on the pad with the mouse: a line that rises and falls. */
async function draw(page: Page) {
  const pad = page.getByTestId("signature-pad")
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.6)
  await page.mouse.down()
  for (let step = 1; step <= 12; step++)
    await page.mouse.move(
      box.x + box.width * (0.15 + step * 0.055),
      box.y + box.height * (0.6 + (step % 2 ? -0.3 : 0.1))
    )
  await page.mouse.up()
  await expect(pad).toHaveAttribute("data-strokes", /[1-9]/)
}

/** How many pixels of the first page are not paper, in the picture the engine made of the file. */
const inkOn = (page: Page) =>
  reader(page)
    .locator('[data-testid=reader-page][data-page="1"] canvas')
    .first()
    .evaluate((canvas) => {
      const picture = canvas as HTMLCanvasElement
      const { data } = picture
        .getContext("2d")!
        .getImageData(0, 0, picture.width, picture.height)
      let ink = 0
      for (let at = 0; at < data.length; at += 4)
        if (data[at] < 200 || data[at + 1] < 200 || data[at + 2] < 200) ink++
      return ink
    })

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

const kept = (page: Page, slot = "signature") =>
  page.evaluate((key) => localStorage.getItem(key), `keepsimp.${slot}`)

test("draws a signature and places it, and remembers it only when asked", async ({
  page,
}) => {
  await open(page, await form())
  // The page is the editor, opened for signing: the window is there, and so are only the tools for the job.
  await expect(sheet(page)).toContainText(
    "it is not a certificate that proves who signed"
  )
  await expect(placeIt(page)).toBeDisabled()
  await draw(page)
  const before = await inkOn(page)
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 1)
  await expect(things(page)).toHaveCount(1)
  await expect(things(page).first()).toHaveAttribute("data-kind", "ink")
  await expect(things(page).first()).toHaveAttribute("data-selected", "true")
  // It is drawn by the engine, from the file, and is where it can be seen.
  await expect.poll(() => inkOn(page)).toBeGreaterThan(before + 20)
  await expect(things(page).first()).toBeInViewport({ ratio: 0.99 })
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Add signature"
  )
  for (const name of ["Text", "Tick or cross", "Select"])
    await expect(pick(page, name)).toBeVisible()
  await expect(pick(page, "Box")).toHaveCount(0)
  await expect(pick(page, "Highlight")).toHaveCount(0)
  // Nothing was kept.
  expect(await kept(page)).toBeNull()

  // Asked to, it is remembered, and offered the next time.
  await page.getByTestId("editor-sign").click()
  await expect(page.getByTestId("signature-kept")).toHaveCount(0)
  await draw(page)
  const remember = sheet(page).getByRole("switch", {
    name: "Remember this signature on this device",
  })
  await expect(remember).not.toBeChecked()
  await remember.click()
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 2)
  expect(await kept(page)).toContain('"kind":"draw"')

  await page.keyboard.press("g")
  await expect(page.getByTestId("signature-kept")).toBeVisible()
  // Remembering is asked for each time.
  await expect(remember).not.toBeChecked()
  await page
    .getByTestId("signature-kept")
    .getByRole("button", { name: "Place it on the page" })
    .click()
  await changes(page, 3)
  await expect(things(page)).toHaveCount(3)

  // And forgotten again.
  await page.getByTestId("editor-sign").click()
  await page
    .getByTestId("signature-kept")
    .getByRole("button", { name: "Forget it" })
    .click()
  await expect(page.getByTestId("signature-kept")).toHaveCount(0)
  expect(await kept(page)).toBeNull()
  await sheet(page).getByRole("button", { name: "Cancel" }).click()
  await expect(sheet(page)).toBeHidden()

  // The other tools are one press away.
  await page.getByTestId("all-tools").click()
  await expect(pick(page, "Box")).toBeVisible()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.name).toBe("form-edited.pdf")
  await expect(page.getByTestId("editor-check")).toContainText(
    "3 things you added are part of their pages now."
  )
  // The words of the file are what they were: a drawn signature is lines, not letters.
  expect(await texts(got.bytes)).toEqual(["sg-P1", "sg-P2"])
})

test("types a signature and initials in a chosen hand, and fills in a date and ticks", async ({
  page,
}) => {
  await open(page, await form("letter.pdf"))
  await sheet(page).getByRole("radio", { name: "Type" }).click()
  await sheet(page).getByLabel("Your name").fill("Ada Lovelace")
  const hand = sheet(page).getByRole("radio", { name: "Great Vibes" })
  await hand.click()
  await expect(hand).toHaveAttribute("aria-checked", "true")
  await sheet(page).getByRole("button", { name: "Ink: Blue" }).click()
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 1)
  await expect(things(page).first()).toHaveAccessibleName(
    "Text box: Ada Lovelace"
  )

  // Initials are made the same way, and are smaller.
  await page.keyboard.press("g")
  await sheet(page).getByRole("radio", { name: "Initials" }).click()
  await expect(sheet(page)).toContainText("Your initials")
  await sheet(page).getByRole("radio", { name: "Type" }).click()
  await sheet(page).getByLabel("Your initials").fill("AL")
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 2)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Add initials"
  )
  const name = (await things(page).nth(0).boundingBox())!
  const initials = (await things(page).nth(1).boundingBox())!
  expect(initials.width).toBeLessThan(name.width)

  // Today's date, with one press.
  await pick(page, "Add today's date").click()
  await changes(page, 3)
  const year = String(new Date().getFullYear())
  await expect(things(page).nth(2)).toHaveAccessibleName(
    new RegExp(`^Text box: .*${year}`)
  )

  // The boxes of a form: a tick, then a cross, the tool staying in hand.
  await page.keyboard.press("Escape")
  await page.keyboard.press("x")
  await expect(pick(page, "Tick or cross")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const box = (await layer(page).boundingBox())!
  const at = (x: number, y: number) =>
    [box.x + (x / WIDE) * box.width, box.y + (y / TALL) * box.height] as const
  await page.mouse.click(...at(60, 80))
  await changes(page, 4)
  await reader(page).getByRole("button", { name: "Cross", exact: true }).click()
  await page.mouse.click(...at(90, 80))
  await changes(page, 5)
  await expect(pick(page, "Tick or cross")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Add cross"
  )
  await expect(things(page)).toHaveCount(5)

  const got = await saved(page, page.getByTestId("editor-download"))
  const [first] = await texts(got.bytes)
  expect(first).toContain("Ada Lovelace")
  expect(first).toContain("AL")
  expect(first).toContain(year)
  // The hand is in the file, cut down to the letters of the name.
  const fonts = (await embeddedFonts(got.bytes)).filter((font) =>
    font.name.includes("GreatVibes")
  )
  expect(fonts).toHaveLength(1)
  expect(fonts[0].bytes).toBeLessThan(60_000)
})

test("takes a signature from a photo and leaves its paper behind", async ({
  page,
}) => {
  /** A signature in dark blue on cream paper, as a phone photographs it. */
  const photo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect width="100%" height="100%" fill="#f1ecdc"/><path d="M60 170 C120 40 160 220 220 110 S 320 60 360 150 S 470 200 540 90" fill="none" stroke="#1b2a6b" stroke-width="8" stroke-linecap="round"/></svg>'
    )
  )
    .jpeg({ quality: 88 })
    .toBuffer()
  const blank = await sharp({
    create: { width: 300, height: 120, channels: 3, background: "#f4f1e8" },
  })
    .jpeg()
    .toBuffer()

  await open(page, await form("lease.pdf"))
  const before = await inkOn(page)
  await sheet(page).getByRole("radio", { name: "Picture" }).click()
  const chooser = sheet(page).getByLabel("Choose a picture of your signature")
  // A sheet with nothing on it has no ink to take.
  await chooser.setInputFiles({
    name: "blank.jpg",
    mimeType: "image/jpeg",
    buffer: blank,
  })
  await expect(sheet(page).getByRole("alert")).toContainText(
    "No ink could be told from the paper"
  )
  await expect(placeIt(page)).toBeDisabled()

  await chooser.setInputFiles({
    name: "signature.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  })
  await expect(page.getByTestId("signature-picture")).toBeVisible()
  await expect(sheet(page).getByRole("alert")).toHaveCount(0)
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 1)
  await expect(things(page).first()).toHaveAttribute("data-kind", "picture")
  await expect.poll(() => inkOn(page)).toBeGreaterThan(before + 20)

  const got = await saved(page, page.getByTestId("editor-download"))
  const [picture] = await readPictures(got.bytes)
  // Cut to the ink: smaller than the photo, and no wider than it.
  expect(picture.width).toBeLessThan(600)
  expect(picture.height).toBeLessThan(240)
  expect(picture.width).toBeGreaterThan(300)
  // Its corners are see-through, where the paper was; its ink is solid and still blue.
  const pixel = (x: number, y: number) =>
    Array.from(
      picture.data.slice(
        (y * picture.width + x) * 4,
        (y * picture.width + x) * 4 + 4
      )
    )
  expect(pixel(0, 0)[3]).toBe(0)
  expect(pixel(picture.width - 1, picture.height - 1)[3]).toBe(0)
  let solid = 0
  let blue = 0
  for (let at = 0; at < picture.data.length; at += 4)
    if (picture.data[at + 3] === 255) {
      solid++
      if (picture.data[at + 2] > picture.data[at] + 30 && picture.data[at] < 90)
        blue++
    }
  expect(solid).toBeGreaterThan(1000)
  expect(blue / solid).toBeGreaterThan(0.9)
})

test("places what it adds in the part of the page that is being read", async ({
  page,
}) => {
  // A page far taller than the window: its middle is out of sight.
  await open(
    page,
    await pdf("long.pdf", "sg", { pages: 1, size: () => [WIDE, 2400] })
  )
  await draw(page)
  await placeIt(page).click()
  await expect(sheet(page)).toBeHidden()
  await changes(page, 1)
  await expect(things(page).first()).toBeInViewport({ ratio: 0.99 })

  // Further down the page, the same: a date, and a signature from a picture.
  await scrollReader(page, 700)
  await pick(page, "Add today's date").click()
  await changes(page, 2)
  await expect(things(page).nth(1)).toBeInViewport({ ratio: 0.99 })
  await expect(things(page).first()).not.toBeInViewport()
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
  const scan = scanOf()
  /**
   * The signature window by itself: everything behind it is out of reach
   * while it is open. Its button is looked at once it has settled: on its
   * way from switched off to switched on it is, for a moment, neither.
   */
  const scanWindow = scanOf("[data-testid=signature-dialog]")
  const scanSheet = async () => {
    await expect
      .poll(() =>
        placeIt(page).evaluate(
          (button) =>
            (button as HTMLButtonElement).disabled ||
            getComputedStyle(button).opacity === "1"
        )
      )
      .toBe(true)
    return scanWindow()
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "Sign PDF", level: 1 })
  ).toBeVisible()
  expect(await scan()).toEqual([])
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }

  // The window, in each of its three ways, in the dark theme and at the width of a phone.
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  await expect(sheet(page)).toBeVisible()
  expect(await scanSheet()).toEqual([])
  await draw(page)
  await sheet(page).getByRole("radio", { name: "Type" }).click()
  await sheet(page).getByLabel("Your name").fill("Ada")
  // The four hands are shown once their fonts are there.
  await expect(
    sheet(page).getByRole("radio", { name: "Kalam" }).locator("span")
  ).toBeVisible({ timeout: 30_000 })
  expect(await scanSheet()).toEqual([])
  await sheet(page).getByRole("radio", { name: "Picture" }).click()
  expect(await scanSheet()).toEqual([])

  await page.setViewportSize({ width: 320, height: 740 })
  await expect
    .poll(async () => (await placeIt(page).boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  const small = await sheet(page).evaluate((element) =>
    [
      // The label of the picture chooser is the button that is pressed.
      ...element.querySelectorAll(
        'button, input:not(.sr-only), label[for$="-picture"]'
      ),
    ]
      .map((control) => ({
        name: control.getAttribute("aria-label") ?? control.textContent,
        box: control.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.height > 1 && box.height < 44)
      .map(({ name }) => name)
  )
  expect(small).toEqual([])
  expect(await scanSheet()).toEqual([])
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("says what it is: a door into the editor, with help and a guide of its own", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(page).toHaveTitle(/Sign a PDF online for free/)
  await expect(
    page.getByText("Make your signature", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Read the step-by-step guide" })
  ).toHaveAttribute("href", "/blog/sign-pdfs-without-uploading/")
  await expect(
    page.getByRole("link", { name: "PDF editor", exact: true })
  ).toHaveAttribute("href", "/dashboard/pdf-editor/")
  // It is found by searching, and is not a tool of its own in the list.
  await page.goto("/dashboard/?category=document")
  await expect(page.getByTestId("tool-card")).toHaveCount(4)
  await expect(
    page.getByTestId("tool-card").filter({ hasText: "Sign PDF" })
  ).toHaveCount(0)

  // In the whole editor, signing is one of the tools, and its window opens only when asked for.
  await page.goto("/dashboard/pdf-editor/")
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  await expect(sheet(page)).toHaveCount(0)
  await expect(pick(page, "Sign")).toBeVisible()
  await expect(pick(page, "Box")).toBeVisible()
})
