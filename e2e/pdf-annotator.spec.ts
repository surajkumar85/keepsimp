import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { makePlainPdf } from "../tests/pdf-fixtures"
import { readComments, readPdf, texts } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/pdf-annotator/"
/** Every page of the plain files made here, in points. */
const WIDE = 298
const TALL = 420

const tool = (page: Page) => page.getByTestId("pdf-editor")
const layer = (page: Page, number = 1) =>
  page.locator(`[data-testid=editor-layer][data-page="${number}"]`)
const marks = (page: Page, number = 1) =>
  layer(page, number).getByTestId("editor-comment")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const list = (page: Page) => page.getByTestId("editor-comments")
const cards = (page: Page) => list(page).getByTestId("comment-card")

/** Two lines of print: small at the top, large in the middle. */
const plain = async (name = "draft.pdf", pages = 1): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(
    await makePlainPdf(
      Array.from({ length: pages }, () => ({
        top: "Draft for review",
        body: "Check these figures",
      }))
    )
  ),
})

async function open(page: Page, upload: Upload) {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles(upload)
  await readerReady(page)
  await expect(layer(page)).toBeVisible()
}

/** Where a point of a page, in the page's own points, is on the screen. */
async function spot(
  page: Page,
  x: number,
  y: number,
  size: [number, number] = [WIDE, TALL]
) {
  const box = (await layer(page).boundingBox())!
  return {
    x: box.x + (x / size[0]) * box.width,
    y: box.y + (y / size[1]) * box.height,
  }
}

async function click(page: Page, x: number, y: number) {
  const at = await spot(page, x, y)
  await page.mouse.click(at.x, at.y)
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const start = await spot(page, ...from)
  const end = await spot(page, ...to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
}

/**
 * Wait until the pages have settled where they are. Opening or closing the
 * list changes the room the pages have, and they are laid out again a
 * moment later; a point worked out before that is not where it was.
 */
async function still(page: Page) {
  let last = ""
  await expect
    .poll(async () => {
      const now = JSON.stringify(await layer(page).boundingBox())
      const same = now === last
      last = now
      return same
    })
    .toBe(true)
}

/** Wait until the file holds this many changes and the page shows them. */
async function changes(page: Page, count: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(count), {
    timeout: 30_000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}

/** Whether the page is drawn in a colour near a point, from the picture the engine made of the file. */
const drawnNear = (
  page: Page,
  x: number,
  y: number,
  colour: "yellow" | "blue" | "white"
) =>
  reader(page)
    .locator('[data-testid=reader-page][data-page="1"] canvas')
    .first()
    .evaluate(
      (canvas, [px, py, wide, tall, wanted]) => {
        const picture = canvas as HTMLCanvasElement
        const across = picture.width / (wide as number)
        const edge = Math.max(1, Math.round(6 * across))
        const { data } = picture
          .getContext("2d")!
          .getImageData(
            Math.round(((px as number) - 3) * across),
            Math.round(
              ((py as number) - 3) * (picture.height / (tall as number))
            ),
            edge,
            edge
          )
        const tests = {
          yellow: (r: number, g: number, b: number) =>
            r > 225 && g > 180 && b < 190 && r - b > 50,
          blue: (r: number, g: number, b: number) =>
            b > 200 && r < 190 && b - r > 50,
          white: (r: number, g: number, b: number) =>
            r > 245 && g > 245 && b > 245,
        }
        const test = tests[wanted as keyof typeof tests]
        let hits = 0
        for (let at = 0; at < data.length; at += 4)
          if (test(data[at], data[at + 1], data[at + 2])) hits++
        // White has to be everywhere; a colour, somewhere.
        return wanted === "white" ? hits === data.length / 4 : hits > 0
      },
      [x, y, WIDE, TALL, colour]
    )

async function saved(page: Page, trigger: Locator) {
  const pending = page.waitForEvent("download")
  await trigger.click()
  const got = await pending
  await expect(page.getByTestId("editor-check")).toBeVisible()
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

/** Sign what is made from now on. The list is closed again, since on a phone it lies over the page. */
async function sign(page: Page, name: string) {
  await page.getByTestId("comments-toggle").click()
  await list(page).getByLabel("Your name").fill(name)
  await page.getByRole("button", { name: "Close the comments" }).click()
  await expect(list(page)).toHaveCount(0)
  await still(page)
}

test("marks words in four ways, and downloads comments that other software reads", async ({
  page,
}) => {
  await open(page, await plain())
  // The annotator opens with the highlighter in hand, and its tools come first.
  await expect(pick(page, "Highlight")).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("editor-hint")).toContainText(
    "Drag across words"
  )
  await sign(page, "Ada")

  // Dragged across two words of the large line.
  await drag(page, [50, 110], [160, 112])
  await changes(page, 1)
  await expect(marks(page)).toHaveCount(1)
  await expect(marks(page).first()).toHaveAccessibleName(
    "Highlight on “Check these”"
  )
  await expect.poll(() => drawnNear(page, 44, 104, "yellow")).toBe(true)
  // The third word was not taken.
  expect(await drawnNear(page, 250, 135, "white")).toBe(true)

  // One word, by a press, underlined in another colour.
  await pick(page, "Underline").click()
  await reader(page).getByRole("button", { name: "Colour: Blue" }).click()
  await click(page, 215, 110)
  await changes(page, 2)
  await expect(marks(page).nth(1)).toHaveAccessibleName(
    "Underline on “figures”"
  )

  // The other two by their keys, on the small line.
  await page.keyboard.press("s")
  await expect(pick(page, "Strike out")).toHaveAttribute("aria-pressed", "true")
  await drag(page, [32, 27], [56, 27])
  await changes(page, 3)
  await page.keyboard.press("w")
  await click(page, 100, 27)
  await changes(page, 4)
  await expect(marks(page)).toHaveCount(4)
  // Escape puts the tool down.
  await page.keyboard.press("Escape")
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "true")
  await expect(reader(page)).toBeVisible()

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.name).toBe("draft-edited.pdf")
  await expect(page.getByTestId("editor-check")).toContainText(
    "4 comments are in the file, where other programs show them too."
  )
  const [found] = await readComments(got.bytes)
  expect(found.map((one) => one.kind).sort()).toEqual([
    "Highlight",
    "Squiggly",
    "StrikeOut",
    "Underline",
  ])
  expect(found.every((one) => one.author === "Ada")).toBe(true)
  expect(found.every((one) => one.quads === 1 && !one.reply)).toBe(true)
  expect(found.find((one) => one.kind === "Highlight")!.colour).toEqual([
    1, 0.86, 0.2,
  ])
  expect(found.find((one) => one.kind === "Underline")!.colour).toEqual([
    0.45, 0.75, 1,
  ])
  // The words of the page are what they were.
  expect(await texts(got.bytes)).toEqual([
    "Draft for review Check these figures",
  ])
})

test("places a note, types it, answers it, moves it, and undoes its removal", async ({
  page,
}) => {
  await open(page, await plain())
  await pick(page, "Note").click()
  await click(page, 200, 200)
  await changes(page, 1)
  // The list opens with the note ready to be typed.
  const words = list(page).getByLabel("What this note says")
  await expect(words).toBeFocused()
  await page.keyboard.type("Is this still right?")
  await list(page).getByLabel("Your name").fill("Bo")
  await changes(page, 2)
  await list(page).getByLabel("Reply to this note").fill("Yes, checked.")
  await page.keyboard.press("Enter")
  await changes(page, 3)
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).first()).toContainText("Yes, checked.")
  await expect(page.getByTestId("comments-count")).toHaveText("2")
  await expect(page.getByTestId("comments-toggle")).toHaveAccessibleName(
    "Comments: 2"
  )

  // Finding by words: in the note, its replies or its author.
  const find = list(page).getByLabel("Find in comments")
  await find.fill("zebra")
  await expect(cards(page)).toHaveCount(0)
  await expect(list(page)).toContainText("No comment holds those words.")
  await find.fill("CHECKED")
  await expect(cards(page)).toHaveCount(1)
  await find.fill("")

  // Dragged to another place on the page, with the list out of the way.
  await page.getByRole("button", { name: "Close the comments" }).click()
  await still(page)
  const note = marks(page).first()
  await expect(note).toHaveAccessibleName("Note Is this still right?")
  const from = (await note.boundingBox())!
  const to = await spot(page, 80, 300)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  await changes(page, 4)
  await expect
    .poll(async () => {
      const now = (await note.boundingBox())!
      return Math.hypot(
        now.x + now.width / 2 - to.x,
        now.y + now.height / 2 - to.y
      )
    })
    .toBeLessThan(6)

  // Removed with the key, replies and all, and brought back by undo.
  await expect(note).toHaveAttribute("data-picked", "true")
  await page.keyboard.press("Delete")
  await changes(page, 5)
  await expect(marks(page)).toHaveCount(0)
  await expect(page.getByTestId("comments-toggle")).toHaveAccessibleName(
    "Comments: 0"
  )
  await page.keyboard.press("Control+z")
  await changes(page, 4)
  await expect(marks(page)).toHaveCount(1)

  // Words still being typed when Download is pressed are in the file, and
  // the result is shown as the one for the file as it now stands.
  await page.getByTestId("comments-toggle").click()
  await list(page).getByLabel("What this note says").fill("Is this right?")
  const got = await saved(page, page.getByTestId("editor-download"))
  await expect(page.getByTestId("editor-check")).toContainText(
    "2 comments are in the file"
  )
  const [found] = await readComments(got.bytes)
  expect(
    found.map((one) => [one.kind, one.text, one.author, one.reply])
  ).toEqual([
    ["Text", "Is this right?", "", false],
    ["Text", "Yes, checked.", "Bo", true],
  ])
})

test("says so where a page has no words, and marks it with the pen", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page.locator("#editor-file").setInputFiles({
    name: "blank.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await makePlainPdf([{}, { body: "Words here" }])),
  })
  await readerReady(page)
  await drag(page, [50, 110], [200, 112])
  await expect(page.getByTestId("editor-hint")).toHaveText(
    "No words there. On a scanned page, mark with the highlighter pen."
  )
  await expect(tool(page)).toHaveAttribute("data-changes", "0")

  await page.keyboard.press("p")
  await reader(page)
    .getByRole("button", { name: "Thickness: 20 points" })
    .click()
  await drag(page, [50, 110], [200, 112])
  await changes(page, 1)
  await expect(marks(page).first()).toHaveAccessibleName("Highlighter")
  await expect.poll(() => drawnNear(page, 120, 111, "yellow")).toBe(true)
  const got = await saved(page, page.getByTestId("editor-download"))
  const [first, second] = await readComments(got.bytes)
  expect(first.map((one) => one.kind)).toEqual(["Ink"])
  expect(second).toEqual([])
})

test("lists the comments a file comes with, answers them, and downloads with or without them", async ({
  page,
}) => {
  await open(
    page,
    await pdf("review.pdf", "rv", {
      pages: 2,
      size: () => [400, 600],
      notes: [{ page: 2, text: "From the author" }],
      links: [{ from: 1, to: 2 }],
    })
  )
  await expect(page.getByTestId("comments-toggle")).toHaveAccessibleName(
    "Comments: 1"
  )
  await page.getByTestId("comments-toggle").click()
  await expect(
    list(page).getByRole("heading", { name: "Page 2" })
  ).toBeVisible()
  const card = cards(page).first()
  await expect(card.getByLabel("What this note says")).toHaveValue(
    "From the author"
  )
  // Pressing it takes the pages to it.
  await card.getByRole("button", { name: /^Note/ }).click()
  await expect(reader(page)).toHaveAttribute("data-page", "2")
  await card.getByLabel("Reply to this note").fill("Seen.")
  await card.getByRole("button", { name: "Send the reply" }).click()
  await changes(page, 1)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(page.getByTestId("editor-file")).toContainText("2 comments")

  // Kept: both are comments in the result.
  const kept = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  expect(
    (await readComments(kept.bytes))[1].map((one) => [one.text, one.reply])
  ).toEqual([
    ["From the author", false],
    ["Seen.", true],
  ])

  // Part of the page: no comment is left, and the link still is.
  const choice = page.getByRole("radiogroup", { name: "Comments" })
  await choice.getByRole("radio", { name: "Part of the page" }).click()
  const flat = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "2 comments were made part of the page."
  )
  const flatRead = await readPdf(flat.bytes)
  expect(flatRead.pages.map((one) => one.kinds)).toEqual([["Link"], []])

  // Left out.
  await choice.getByRole("radio", { name: "Leave out" }).click()
  const none = await saved(
    page,
    page.getByRole("button", { name: "Download PDF" })
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "2 comments were left out."
  )
  expect((await readPdf(none.bytes)).pages[1].kinds).toEqual([])

  // The file being edited still has them, to go on with.
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await expect(page.getByTestId("comments-toggle")).toHaveAccessibleName(
    "Comments: 2"
  )
})

test("marks and removes with a finger", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Needs a touch screen.")
  await open(page, await plain("touch.pdf"))
  const tap = async (x: number, y: number) => {
    const at = await spot(page, x, y)
    await page.touchscreen.tap(at.x, at.y)
  }
  // A tap on a word marks the word.
  await tap(70, 110)
  await changes(page, 1)
  await expect(marks(page).first()).toHaveAccessibleName("Highlight on “Check”")
  // With the tool put down, a tap on the mark picks it, and it can be removed.
  await pick(page, "Select").tap()
  await tap(70, 110)
  await expect(marks(page).first()).toHaveAttribute("data-picked", "true")
  await reader(page).getByRole("button", { name: "Delete the comment" }).tap()
  await changes(page, 2)
  await expect(marks(page)).toHaveCount(0)
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
  const scanWindow = scanOf("[role=dialog]")
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(ROUTE)
  await expect(
    page.getByRole("heading", { name: "PDF annotator", level: 1 })
  ).toBeVisible()
  expect(await scan()).toEqual([])

  await page.locator("#editor-file").setInputFiles(await plain())
  await readerReady(page)
  // With a tool in hand, with a mark made and picked, and with the list open and filled.
  expect(await scanWindow()).toEqual([])
  await drag(page, [50, 110], [160, 112])
  await changes(page, 1)
  await page.keyboard.press("Escape")
  await marks(page).first().focus()
  await expect(marks(page).first()).toHaveAttribute("data-picked", "true")
  expect(await scanWindow()).toEqual([])
  await pick(page, "Note").click()
  await click(page, 200, 60)
  await changes(page, 2)
  await page.keyboard.type("A note")
  await list(page).getByLabel("Reply to this note").fill("A reply")
  await page.keyboard.press("Enter")
  await changes(page, 4)
  expect(await scanWindow()).toEqual([])

  // On a phone the list lies over the lower part of the pages, and nothing spills sideways.
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
  const small = await page
    .locator("[data-editor-bar], [data-testid=editor-comments]")
    .evaluateAll((parts) =>
      parts.flatMap((part) =>
        [...part.querySelectorAll("button, input:not(.sr-only), textarea")]
          .map((control) => ({
            name: control.getAttribute("aria-label") ?? control.textContent,
            box: control.getBoundingClientRect(),
          }))
          .filter(({ box }) => box.height > 1 && box.height < 44)
          .map(({ name }) => name)
      )
    )
  expect(small).toEqual([])
  expect(await scanWindow()).toEqual([])

  // Behind the window, with the choice for comments, in both themes.
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(page.getByRole("radiogroup", { name: "Comments" })).toBeVisible()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }
  // The window and the list in the dark theme.
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  // The list is as it was left: open.
  await expect(cards(page)).toHaveCount(2)
  expect(await scanWindow()).toEqual([])
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("the written help and the guide are there, and the editor has the same tools", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(page.getByText("Mark the words", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Read the step-by-step guide" })
  ).toHaveAttribute("href", "/blog/annotate-pdfs-without-uploading/")

  // In the editor the comment tools follow the others, and nothing is in hand to begin with.
  await page.goto("/dashboard/pdf-editor/")
  await page.locator("#editor-file").setInputFiles(await plain())
  await readerReady(page)
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "true")
  await expect(pick(page, "Highlight")).toHaveAttribute("aria-pressed", "false")
  await page.keyboard.press("h")
  await expect(pick(page, "Highlight")).toHaveAttribute("aria-pressed", "true")
  // Another tool's key puts the highlighter down.
  await page.keyboard.press("b")
  await expect(pick(page, "Box")).toHaveAttribute("aria-pressed", "true")
  await expect(pick(page, "Highlight")).toHaveAttribute("aria-pressed", "false")
})
