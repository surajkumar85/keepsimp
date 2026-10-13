import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { danglingRefs, linkBoxes, readPdf } from "../tests/pdf-reader"
import { makeTextPdf, TEXT } from "../tests/pdf-text"
import { bytesOf, reader, readerReady } from "./pdf"

const ROUTE = "/dashboard/pdf-editor/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const links = (page: Page) => page.getByTestId("editor-link")
const target = (page: Page) => reader(page).getByLabel("Leads to")
const hint = (page: Page) => page.getByTestId("editor-hint").first()
const undo = (page: Page) => page.getByTestId("editor-undo")
const first = (page: Page) =>
  page.locator('[data-testid=editor-layer][data-page="1"]')

/** A page with one link over a line of words, which leads to an address, and a second page. */
async function open(page: Page) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles({
    name: "letter.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makeTextPdf()),
  })
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
  const bytes = await bytesOf(got)
  expect(await danglingRefs(bytes)).toEqual([])
  const read = await readPdf(bytes)
  expect(read.pages[0].text).toContain(TEXT.linked)
  return { bytes, links: read.pages.map((one) => one.links) }
}

/** A frame is where it is meant to be, to within a point: browsers round a drag differently. */
async function boxed(spot: Locator, wanted: number[]) {
  await expect
    .poll(async () => {
      const box = ((await spot.getAttribute("data-box")) ?? "")
        .split(",")
        .map(Number)
      return (
        box.length === 4 &&
        box.every((value, at) => Math.abs(value - wanted[at]) <= 1)
      )
    })
    .toBe(true)
}

const rounded = (box: {
  x: number
  y: number
  width: number
  height: number
}) => [box.x, box.y, box.width, box.height].map((value) => Math.round(value))

test("leads a link somewhere else, adds one from the bar, and says that where links lead is not checked", async ({
  page,
}) => {
  await open(page)
  // Nothing of the page's links is offered until it is asked for.
  await expect(links(page)).toHaveCount(0)
  await pick(page, "Links").click()
  await expect(pick(page, "Links")).toHaveAttribute("aria-pressed", "true")
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "false")
  await expect(hint(page)).toContainText("Drag a box on the page")
  await expect(links(page)).toHaveCount(1)
  await expect(links(page).first()).toHaveAccessibleName(
    "Link to example.org/terms"
  )

  // Chosen, the bar shows where it leads, and takes a page instead.
  await links(page).first().click()
  await expect(target(page)).toHaveValue("https://example.org/terms")
  await target(page).fill("page 2")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Change a link")
  await expect(links(page).first()).toHaveAccessibleName("Link to page 2")
  await expect(target(page)).toHaveValue("Page 2")

  // A new link from the bar lies in the middle of what is seen, and waits for where it leads.
  await page.keyboard.press("Escape")
  await pick(page, "Add a link in the middle of the page").click()
  await expect(page.getByTestId("editor-new-link")).toBeVisible()
  await expect(target(page)).toBeFocused()
  // What runs something, or is no address, is not taken.
  for (const bad of ["javascript:alert(1)", "somewhere", "page 9"]) {
    await target(page).fill(bad)
    await pick(page, "Add").click()
    await expect(reader(page).getByRole("alert")).toContainText(
      "Type a web address, an e-mail address, or a page from 1 to 2."
    )
    await changes(page, 1)
  }
  await target(page).fill("keepsimp.vercel.app/blog")
  await expect(reader(page).getByRole("alert")).toHaveCount(0)
  await page.keyboard.press("Enter")
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Add a link")
  await expect(links(page)).toHaveCount(2)
  await expect(links(page).nth(1)).toHaveAccessibleName(
    "Link to keepsimp.vercel.app/blog"
  )

  const got = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "Links were added, changed or taken away in 2 places. Where a link leads is not checked: try each one in the result."
  )
  expect(got.links[0]).toEqual([2, "https://keepsimp.vercel.app/blog"])
})

test("draws a box for a new link, moves it, resizes it and takes it away", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("j")
  await expect(links(page)).toHaveCount(1)
  const layer = (await first(page).boundingBox())!
  const scale = layer.width / 400
  const at = (x: number, y: number) =>
    [layer.x + x * scale, layer.y + y * scale] as const
  // From 60, 100 to 220, 124 on the page, where nothing is.
  await page.mouse.move(...at(60, 100))
  await page.mouse.down()
  await page.mouse.move(...at(120, 110), { steps: 3 })
  await page.mouse.move(...at(220, 124), { steps: 3 })
  await page.mouse.up()
  const drawn = page.getByTestId("editor-new-link")
  await boxed(drawn, [60, 100, 160, 24])
  await expect(target(page)).toBeFocused()
  await page.keyboard.type("ada@example.org")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await expect(links(page)).toHaveCount(2)
  await boxed(links(page).nth(1), [60, 100, 160, 24])

  // Dragged 40 to the right and 30 down.
  await page.mouse.move(...at(100, 112))
  await page.mouse.down()
  await page.mouse.move(...at(120, 125), { steps: 3 })
  await page.mouse.move(...at(140, 142), { steps: 3 })
  await page.mouse.up()
  await changes(page, 2)
  await expect(undo(page)).toHaveAttribute("aria-label", "Undo: Move a link")
  await boxed(links(page).nth(1), [100, 130, 160, 24])

  // With the keyboard: the arrow keys move it, and it keeps the keyboard.
  await links(page).nth(1).focus()
  await page.keyboard.press("Shift+ArrowDown")
  await changes(page, 3)
  await boxed(links(page).nth(1), [100, 140, 160, 24])
  await expect(links(page).nth(1)).toBeFocused()

  // Chosen, it has a corner: 40 narrower and 10 higher.
  await page.keyboard.press("Enter")
  const corner = page.getByTestId("editor-link-corner")
  await corner.scrollIntoViewIfNeeded()
  const grip = (await corner.boundingBox())!
  const middle = [grip.x + grip.width / 2, grip.y + grip.height / 2] as const
  await page.mouse.move(...middle)
  await page.mouse.down()
  await page.mouse.move(middle[0] - 10, middle[1] + 4, { steps: 3 })
  await page.mouse.move(middle[0] - 40 * scale, middle[1] + 10 * scale, {
    steps: 3,
  })
  await page.mouse.up()
  await changes(page, 4)
  await boxed(links(page).nth(1), [100, 140, 120, 34])

  let got = await saved(page, page.getByTestId("editor-download"))
  expect(got.links[0]).toEqual([
    "https://example.org/terms",
    "mailto:ada@example.org",
  ])
  const [kept, made] = (await linkBoxes(got.bytes))[0].map(rounded)
  expect(kept).toEqual([38, 208, 122, 16])
  ;[100, 140, 120, 34].forEach((value, at) =>
    expect(Math.abs(made[at] - value)).toBeLessThanOrEqual(1)
  )

  // A file opened afresh: Delete takes a link away, and that is undone.
  await open(page)
  await page.keyboard.press("j")
  await links(page).first().focus()
  await page.keyboard.press("Delete")
  await changes(page, 1)
  await expect(links(page)).toHaveCount(0)
  await expect(undo(page)).toHaveAttribute(
    "aria-label",
    "Undo: Take away a link"
  )
  got = await saved(page, page.getByTestId("editor-download"))
  expect(got.links[0]).toEqual([])
})

test("puts the tool down when another is taken, and lets go of a link on Escape", async ({
  page,
}) => {
  await open(page)
  await page.keyboard.press("j")
  await links(page).first().click()
  await expect(target(page)).toBeVisible()
  // Escape lets go of the link first, then of the tool.
  await page.keyboard.press("Escape")
  await expect(target(page)).toHaveCount(0)
  await expect(links(page)).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(links(page)).toHaveCount(0)
  await expect(reader(page)).toBeVisible()
  // One at a time: links, the page's pictures, the page's words.
  await page.keyboard.press("j")
  await expect(links(page)).toHaveCount(1)
  await page.keyboard.press("e")
  await expect(links(page)).toHaveCount(0)
  await page.keyboard.press("j")
  await expect(pick(page, "Change text")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await page.keyboard.press("i")
  await expect(links(page)).toHaveCount(0)
  await expect(pick(page, "Pictures of the page")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.keyboard.press("j")
  await expect(pick(page, "Pictures of the page")).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await expect(links(page)).toHaveCount(1)
  await changes(page, 0)
})

test("stays accessible, local and responsive while links are changed", async ({
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
  await pick(page, "Links").click()
  await expect(links(page)).toHaveCount(1)
  expect(await scan()).toEqual([])
  await links(page).first().click()
  await expect(target(page)).toBeVisible()
  expect(await scan()).toEqual([])
  await target(page).fill("nowhere")
  await pick(page, "Change").click()
  await expect(reader(page).getByRole("alert")).toBeVisible()
  expect(await scan()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await scan()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Typing an address asks nothing of it: no link is followed.
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
