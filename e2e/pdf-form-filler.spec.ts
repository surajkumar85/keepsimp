import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument } from "@cantoo/pdf-lib"
import { makeFormPdf, type FormOptions } from "../tests/pdf-fixtures"
import { readPdf } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"

const ROUTE = "/dashboard/fill-pdf-form/"

const tool = (page: Page) => page.getByTestId("pdf-editor")
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
/** The places of a field, by the field's name in the file. */
const places = (page: Page, name: string) =>
  page.locator(`[data-testid=editor-field][data-name="${name}"]`)
/** The control of a field's first place. */
const control = (page: Page, name: string, at = 0) =>
  places(page, name).nth(at).locator("input, select, textarea")
const line = (page: Page) => page.getByTestId("editor-form")

/** A form of two pages with a field of every kind; see `makeFormPdf`. */
const form = async (
  name = "form.pdf",
  options: FormOptions = {}
): Promise<Upload> => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(await makeFormPdf(options)),
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
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

const held = (page: Page, name: string, at = 0) =>
  expect(places(page, name).nth(at))

test("fills in every kind of field, and other software reads what was filled in", async ({
  page,
}) => {
  await open(page, await form())
  // The fields are there to be seen and counted; the one that cannot be changed and the hidden one are not offered.
  await expect(line(page)).toContainText(
    "9 fields to fill in. 2 that must be filled in are still empty."
  )
  await expect(places(page, "locked")).toHaveCount(0)
  await expect(places(page, "unseen")).toHaveCount(0)
  await expect(places(page, "applicant.full_name").first()).toHaveAttribute(
    "data-missing",
    "true"
  )
  // The page is the editor, opened for forms: only the tools for filling in.
  await expect(pick(page, "Sign")).toBeVisible()
  await expect(pick(page, "Box")).toHaveCount(0)

  // A line of text, put into the file with Enter.
  const name = control(page, "applicant.full_name")
  await expect(name).toHaveAccessibleName("Your full name")
  await name.click()
  await page.keyboard.type("Ada Lovelace")
  await page.keyboard.press("Enter")
  await changes(page, 1)
  await held(page, "applicant.full_name").toHaveAttribute(
    "data-value",
    "Ada Lovelace"
  )
  await held(page, "applicant.full_name").not.toHaveAttribute("data-missing")
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Fill in Your full name"
  )
  await expect(line(page)).toContainText(
    "1 that must be filled in is still empty."
  )

  // Several lines, put into the file when the field is left.
  await control(page, "notes").fill("First line\nSecond line")
  // No more letters than the six boxes take.
  await control(page, "code").fill("AB12345678")
  await changes(page, 2)
  await held(page, "notes").toHaveAttribute(
    "data-value",
    "First line\nSecond line"
  )
  // A date, written the way the form asks for it.
  const born = control(page, "born")
  await expect(born).toHaveAttribute("type", "date")
  await expect(born).toHaveAccessibleName("Born (dd/mm/yyyy)")
  await born.fill("2026-10-02")
  await control(page, "agree").focus()
  await changes(page, 4)
  await held(page, "code").toHaveAttribute("data-value", "AB1234")
  await held(page, "born").toHaveAttribute("data-value", "02/10/2026")

  // A tick box, a round button, a drop-down, one that takes other words, and a list that takes several.
  await control(page, "agree").click()
  await changes(page, 5)
  await held(page, "agree").toHaveAttribute("data-value", "true")
  await control(page, "colour", 1).click()
  await changes(page, 6)
  await held(page, "colour", 1).toHaveAttribute("data-value", "true")
  await held(page, "colour", 0).not.toHaveAttribute("data-missing")
  await control(page, "country").selectOption("Japan")
  await changes(page, 7)
  await control(page, "city").fill("Nagpur")
  await page.keyboard.press("Tab")
  await control(page, "fruit").selectOption(["Apple", "Plum"])
  await changes(page, 9)
  await held(page, "fruit").toHaveAttribute("data-value", "Apple\nPlum")
  await expect(line(page)).toHaveText("9 fields to fill in.")
  await expect(
    line(page).getByRole("button", { name: "Go to the next one" })
  ).toHaveCount(0)

  const got = await saved(page, page.getByTestId("editor-download"))
  expect(got.name).toBe("form-edited.pdf")
  await expect(page.getByTestId("editor-check")).toContainText(
    "The form's 11 fields were read back from the result with what they hold, and can still be filled in."
  )
  await expect(page.getByTestId("editor-check")).not.toContainText(
    "Nothing was added"
  )
  const read = (await PDFDocument.load(got.bytes)).getForm()
  expect(read.getTextField("applicant.full_name").getText()).toBe(
    "Ada Lovelace"
  )
  expect(read.getTextField("notes").getText()).toBe("First line\nSecond line")
  expect(read.getTextField("code").getText()).toBe("AB1234")
  expect(read.getTextField("born").getText()).toBe("02/10/2026")
  expect(read.getTextField("locked").getText()).toBe("fixed")
  expect(read.getCheckBox("agree").isChecked()).toBe(true)
  expect(read.getRadioGroup("colour").getSelected()).toBe("blue")
  expect(read.getDropdown("country").getSelected()).toEqual(["Japan"])
  expect(read.getDropdown("city").getSelected()).toEqual(["Nagpur"])
  expect(read.getOptionList("fruit").getSelected().sort()).toEqual([
    "Apple",
    "Plum",
  ])
  // The name is shown again on the second page, and pdf.js reads it there too.
  const pages = (await readPdf(got.bytes)).pages
  expect(pages[1].fields).toContain("applicant.full_name=Ada Lovelace")
  expect(pages.map((one) => one.text)).toEqual(["form-P1", "form-P2"])
})

test("goes from field to field with the keyboard, and to what is still missing", async ({
  page,
}) => {
  await open(page, await form())
  const name = control(page, "applicant.full_name")
  await name.focus()
  await page.keyboard.type("Ada")
  // Escape leaves the field as it was, and the editor open.
  await page.keyboard.press("Escape")
  await expect(reader(page)).toBeVisible()
  await expect(name).not.toBeFocused()
  await changes(page, 0)
  await held(page, "applicant.full_name").toHaveAttribute("data-value", "")

  // Tab goes along a row, then down: the name, then the notes under it.
  await name.focus()
  await page.keyboard.type("Ada")
  await page.keyboard.press("Tab")
  await changes(page, 1)
  await expect(control(page, "notes")).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(control(page, "code")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(control(page, "notes")).toBeFocused()

  // A tick box is ticked with the space bar. Letters typed in a field are not taken for the editor's keys.
  await control(page, "agree").focus()
  await page.keyboard.press("Space")
  await changes(page, 2)
  await held(page, "agree").toHaveAttribute("data-value", "true")
  await control(page, "notes").focus()
  await page.keyboard.type("x g t")
  await expect(page.getByTestId("signature-dialog")).toHaveCount(0)
  await expect(pick(page, "Select")).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Tab")
  await changes(page, 3)
  await held(page, "notes").toHaveAttribute("data-value", "x g t")

  // Undo takes a field back, and what must be filled in is missing again.
  await page.getByTestId("editor-undo").click()
  await page.getByTestId("editor-undo").click()
  await changes(page, 1)
  await held(page, "agree").toHaveAttribute("data-value", "false")
  await held(page, "agree").toHaveAttribute("data-missing", "true")
  await expect(line(page)).toContainText(
    "1 that must be filled in is still empty."
  )
  // The line takes you to it.
  await line(page).getByRole("button", { name: "Go to the next one" }).click()
  await expect(control(page, "agree")).toBeFocused()

  // What is still being typed when Download is pressed is in the download.
  await control(page, "notes").focus()
  await page.keyboard.type("Typed last")
  const got = await saved(page, page.getByTestId("editor-download"))
  const read = (await PDFDocument.load(got.bytes)).getForm()
  expect(read.getTextField("notes").getText()).toBe("Typed last")
  expect(read.getTextField("applicant.full_name").getText()).toBe("Ada")
})

test("makes the form final when asked: the fields become part of the page", async ({
  page,
}) => {
  await open(page, await form("final.pdf"))
  await control(page, "applicant.full_name").fill("Ada Lovelace")
  await page.keyboard.press("Tab")
  await control(page, "country").selectOption("France")
  await changes(page, 2)
  await control(page, "agree").click()
  await changes(page, 3)
  await page.getByRole("button", { name: "Close the editor" }).click()
  const choice = page.getByRole("radiogroup", { name: "Form fields" })
  await expect(
    choice.getByRole("radio", { name: "Keep as fields" })
  ).toBeChecked()
  await choice.getByRole("radio", { name: "Part of the page" }).click()
  await expect(page.getByTestId("result")).toContainText(
    "Nothing can be filled in or changed afterwards."
  )
  const got = await saved(
    page,
    page.getByTestId("result").getByRole("button", { name: /^Download/ })
  )
  await expect(page.getByTestId("editor-check")).toContainText(
    "The form's 11 fields are part of the page now and can no longer be changed."
  )
  const read = await readPdf(got.bytes)
  expect(read.fields).toEqual([])
  expect(read.pages[0].fields).toEqual([])
  expect(read.pages[0].text).toContain("Ada Lovelace")
  expect(read.pages[0].text).toContain("France")
  expect(read.pages[1].text).toContain("Ada Lovelace")
  // The form in the editor is still a form: the download was made of a copy.
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  await held(page, "applicant.full_name").toHaveAttribute(
    "data-value",
    "Ada Lovelace"
  )
})

test("says what a file's form is: none, of the XFA kind, worked out by scripts", async ({
  page,
}) => {
  await open(page, await pdf("letter.pdf", "ff", { pages: 1 }))
  await expect(line(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(tool(page)).toContainText(
    "This file has no fields to fill in. Use Text, Tick or cross and Sign to fill it in like paper."
  )
  await expect(
    page.getByRole("radiogroup", { name: "Form fields" })
  ).toHaveCount(0)

  await open(page, await form("scripted.pdf", { scripted: true }))
  await expect(line(page)).toContainText("9 fields to fill in.")
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(tool(page)).toContainText(
    "This form also has a second form inside it, of a kind (XFA) that only some programs show."
  )
  await expect(tool(page)).toContainText(
    "Scripts are never run here, so check totals and dates yourself."
  )
})

test("leaves the fields alone while something is drawn over them", async ({
  page,
}) => {
  await open(page, await form())
  // With the tick tool in hand, a press on a tick box of the form places a tick of the editor's own.
  await page.keyboard.press("x")
  await expect(pick(page, "Tick or cross")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const box = (await places(page, "agree").boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await changes(page, 1)
  await held(page, "agree").toHaveAttribute("data-value", "false")
  await expect(
    page
      .locator('[data-testid=editor-layer][data-page="1"]')
      .getByTestId("editor-object")
  ).toHaveCount(1)
  await expect(page.getByTestId("editor-undo")).toHaveAttribute(
    "aria-label",
    "Undo: Add tick"
  )
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
    page.getByRole("heading", { name: "Fill PDF form", level: 1 })
  ).toBeVisible()
  expect(await scan()).toEqual([])

  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  // Empty, with a field in use, and filled in.
  expect(await scanWindow()).toEqual([])
  await control(page, "applicant.full_name").focus()
  await page.keyboard.type("Ada Lovelace")
  expect(await scanWindow()).toEqual([])
  await page.keyboard.press("Tab")
  await changes(page, 1)
  await control(page, "fruit").selectOption("Pear")
  await changes(page, 2)
  await control(page, "fruit").focus()
  expect(await scanWindow()).toEqual([])

  // Behind the window, with the choice for fields, in both themes.
  await page.getByRole("button", { name: "Close the editor" }).click()
  await expect(
    page.getByRole("radiogroup", { name: "Form fields" })
  ).toBeVisible()
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click()
    expect(await scan(), theme).toEqual([])
  }
  await page.getByRole("button", { name: "Keep editing" }).click()
  await readerReady(page)
  expect(await scanWindow()).toEqual([])

  // At the width of a small phone nothing runs off the side, and the line's button is large enough to press.
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
          await line(page)
            .getByRole("button", { name: "Go to the next one" })
            .boundingBox()
        )?.height ?? 0
    )
    .toBeGreaterThanOrEqual(44)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test("says what it is: a door into the editor, with help, a guide and a sample of its own", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await expect(page).toHaveTitle(/Fill in a PDF form online for free/)
  await expect(
    page.getByText("Fill in the fields", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Read the step-by-step guide" })
  ).toHaveAttribute("href", "/blog/fill-pdf-forms-without-uploading/")
  await expect(
    page.getByRole("link", { name: "PDF editor", exact: true })
  ).toHaveAttribute("href", "/dashboard/pdf-editor/")

  // Its sample is a form.
  await page.getByRole("button", { name: "Try a sample" }).click()
  await readerReady(page)
  await expect(line(page)).toContainText(
    "9 fields to fill in. 4 that must be filled in are still empty."
  )
  await expect(control(page, "member.full_name")).toHaveAccessibleName(
    "Full name"
  )

  // It is found by searching, and is not a tool of its own in the list.
  await page.goto("/dashboard/?category=document")
  await expect(page.getByTestId("tool-card")).toHaveCount(4)
  await expect(
    page.getByTestId("tool-card").filter({ hasText: "Fill PDF form" })
  ).toHaveCount(0)

  // The whole editor fills forms in too, with every tool beside the fields.
  await page.goto("/dashboard/pdf-editor/")
  await page.locator("#editor-file").setInputFiles(await form())
  await readerReady(page)
  await expect(line(page)).toContainText("9 fields to fill in.")
  await expect(pick(page, "Box")).toBeVisible()
  await control(page, "country").selectOption("India")
  await changes(page, 1)
})
