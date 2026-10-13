import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { PDFDocument } from "@cantoo/pdf-lib"
import { danglingRefs, readPdf } from "../tests/pdf-reader"
import { bytesOf, pdf, reader, readerReady, type Upload } from "./pdf"
const ROUTE = "/dashboard/create-pdf-form/"
const pick = (page: Page, name: string) =>
  reader(page).getByRole("button", { name, exact: true })
const frame = (page: Page, name: string) =>
  page.locator(`[data-testid="form-design-field"][data-name="${name}"]`)
const panel = (page: Page) => page.getByTestId("form-design-panel")
const tool = (page: Page) => page.getByTestId("pdf-editor")
const count = async (page: Page) =>
  Number(await tool(page).getAttribute("data-changes"))
async function changed(page: Page, n: number) {
  await expect(tool(page)).toHaveAttribute("data-changes", String(n), {
    timeout: 30000,
  })
  await expect(tool(page)).not.toHaveAttribute("data-busy")
}
async function open(page: Page, file?: Upload, route = ROUTE) {
  await page.goto(route)
  await page.locator("#editor-file").setInputFiles(
    file ??
      (await pdf("form-base.pdf", "blank", {
        pages: 2,
        size: () => [400, 600],
      }))
  )
  await readerReady(page)
}
async function settings(page: Page) {
  if (!(await panel(page).isVisible()))
    await pick(page, "Field settings").click()
}
async function add(page: Page, kind: string, name: string) {
  const before = await count(page)
  await reader(page)
    .getByLabel("Field type", { exact: true })
    .selectOption(kind)
  await settings(page)
  await panel(page).getByLabel("New field name", { exact: true }).fill(name)
  if (kind === "list")
    await panel(page).getByLabel("Allow several choices").check()
  await pick(page, "Add field").click()
  await changed(page, before + 1)
  await expect(frame(page, name).first()).toBeFocused()
}
async function moveTo(page: Page, name: string, x: number, y: number, at = 0) {
  const f = frame(page, name).nth(at),
    before = await count(page),
    box = (await f.getAttribute("data-box"))!.split(",").map(Number)
  await f.focus()
  for (const [delta, positive, negative] of [
    [x - box[0], "ArrowRight", "ArrowLeft"],
    [y - box[1], "ArrowDown", "ArrowUp"],
  ] as const) {
    for (let i = 0; i < Math.floor(Math.abs(delta) / 10); i++)
      await page.keyboard.press(`Shift+${delta > 0 ? positive : negative}`)
    for (let i = 0; i < Math.abs(delta) % 10; i++)
      await page.keyboard.press(delta > 0 ? positive : negative)
  }
  await changed(page, before + 1)
  await expect(f).toHaveAttribute("data-box", `${x},${y},${box[2]},${box[3]}`)
}
async function download(page: Page) {
  const pending = page.waitForEvent("download")
  await page.getByTestId("editor-download").click()
  const bytes = await bytesOf(await pending)
  await expect(page.getByTestId("editor-check")).toBeVisible()
  expect(await danglingRefs(bytes)).toEqual([])
  return {
    bytes,
    got: await readPdf(bytes),
    form: (await PDFDocument.load(bytes)).getForm(),
  }
}
test("the focused door creates, moves, resizes, renames and deletes a field with keyboard undo", async ({
  page,
}) => {
  await open(page)
  await expect(pick(page, "Create form fields")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(pick(page, "Text")).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  await add(page, "text", "Full name")
  await moveTo(page, "Full name", 30, 60)
  const f = frame(page, "Full name")
  const before = await count(page),
    box = (await f.getAttribute("data-box"))!.split(",").map(Number)
  await page.keyboard.press("Alt+Shift+ArrowRight")
  await page.keyboard.press("Alt+Shift+ArrowDown")
  await changed(page, before + 1)
  await expect(f).toHaveAttribute(
    "data-box",
    `30,60,${box[2] + 10},${box[3] + 10}`
  )
  await settings(page)
  await panel(page).getByLabel("Field name", { exact: true }).fill("Applicant")
  await panel(page)
    .getByLabel("Field tooltip", { exact: true })
    .fill("Your full name")
  await panel(page).getByLabel("Required field", { exact: true }).check()
  await panel(page)
    .getByLabel("Maximum characters (0 means unlimited)")
    .fill("30")
  await panel(page)
    .getByRole("button", { name: "Save field properties" })
    .click()
  await changed(page, before + 2)
  const saved = await download(page)
  expect(saved.form.getTextField("Applicant").getMaxLength()).toBe(30)
  expect(saved.form.getTextField("Applicant").isRequired()).toBe(true)
  expect(saved.got.fields).toEqual(["Applicant"])
  expect(saved.got.pages[1].text).toContain("blank-P2")
  await page.getByRole("button", { name: "Keep editing", exact: true }).click()
  await readerReady(page)
  await settings(page)
  await panel(page)
    .getByRole("button", { name: "Delete field", exact: true })
    .click()
  await changed(page, before + 3)
  await expect(frame(page, "Applicant")).toHaveCount(0)
  await page.getByTestId("editor-undo").click()
  await changed(page, before + 2)
  await expect(frame(page, "Applicant")).toHaveCount(1)
  await page.getByTestId("editor-redo").click()
  await changed(page, before + 3)
  expect((await download(page)).got.fields).toEqual([])
})
test("creates every kind, then Fill PDF form fills the downloaded file and both readers verify it", async ({
  page,
}) => {
  test.setTimeout(120000)
  await open(page)
  const kinds = [
    "text",
    "multiline",
    "check",
    "radio",
    "choice",
    "list",
    "date",
    "signature",
  ]
  for (const [at, kind] of kinds.entries()) {
    await add(page, kind, kind)
    await moveTo(page, kind, 30, 40 + at * 70)
    if (kind === "radio") await moveTo(page, kind, 220, 40 + at * 70, 1)
  }
  const made = await download(page)
  expect(made.got.fields).toEqual([...kinds].sort())
  expect(made.form.getRadioGroup("radio").getOptions()).toEqual([
    "Option 1",
    "Option 2",
  ])
  await open(
    page,
    {
      name: "made-form.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(made.bytes),
    },
    "/dashboard/fill-pdf-form/"
  )
  const control = (name: string, at = 0) =>
    page
      .locator(`[data-testid=editor-field][data-name="${name}"]`)
      .nth(at)
      .locator("input,select,textarea")
  await control("text").fill("Ada Lovelace")
  await control("text").press("Tab")
  await control("multiline").fill("First line\nSecond line")
  await control("multiline").press("Tab")
  await control("check").click()
  await expect(control("check")).toBeChecked()
  await control("radio", 0).click()
  await expect(control("radio", 0)).toBeChecked()
  await control("radio", 1).click()
  await expect(control("radio", 1)).toBeChecked()
  await expect(control("radio", 0)).not.toBeChecked()
  await control("choice").selectOption("Choice 2")
  await control("list").selectOption(["Choice 1", "Choice 2"])
  await control("date").fill("2026-10-14")
  await control("date").press("Tab")
  const filled = await download(page)
  expect(filled.form.getTextField("text").getText()).toBe("Ada Lovelace")
  expect(filled.form.getTextField("multiline").getText()).toBe(
    "First line\nSecond line"
  )
  expect(filled.form.getCheckBox("check").isChecked()).toBe(true)
  expect(filled.form.getRadioGroup("radio").getSelected()).toBe("Option 2")
  expect(filled.form.getDropdown("choice").getSelected()).toEqual(["Choice 2"])
  expect(filled.form.getOptionList("list").getSelected()).toEqual([
    "Choice 1",
    "Choice 2",
  ])
  expect(filled.form.getTextField("date").getText()).toBe("2026-10-14")
  const values = filled.got.pages.flatMap((p) => p.fields)
  for (const value of [
    "text=Ada Lovelace",
    "multiline=First line\nSecond line",
    "check=Yes",
    "radio=Option 2",
    "choice=Choice 2",
    "list=Choice 1,Choice 2",
    "date=2026-10-14",
  ])
    expect(values).toContain(value)
})
test("dragging a field and its handle changes the downloaded rectangle", async ({
  page,
}) => {
  await open(page)
  await add(page, "text", "Position")
  const f = frame(page, "Position"),
    before = await count(page),
    b = (await f.boundingBox())!,
    initial = (await f.getAttribute("data-box"))!.split(",").map(Number)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 15, {
    steps: 5,
  })
  await page.mouse.up()
  await changed(page, before + 1)
  expect(
    (await f.getAttribute("data-box"))!.split(",").map(Number)[0]
  ).toBeGreaterThan(initial[0])
  const grip = reader(page).getByRole("button", {
      name: /Resize Position: se/,
    }),
    g = (await grip.boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2 + 25, g.y + g.height / 2 + 10, {
    steps: 5,
  })
  await page.mouse.up()
  await changed(page, before + 2)
  const final = (await f.getAttribute("data-box"))!.split(",").map(Number)
  expect(final[2]).toBeGreaterThan(initial[2])
  const saved = await download(page),
    rect = saved.form
      .getTextField("Position")
      .acroField.getWidgets()[0]
      .getRectangle()
  expect(rect.x).toBeCloseTo(final[0], 0)
  expect(rect.width).toBeCloseTo(final[2], 0)
  expect(saved.got.pages[0].fields).toEqual(["Position="])
})

test("switching tools keeps a keyboard move that has not yet settled", async ({
  page,
}) => {
  await open(page)
  await add(page, "text", "Retained")
  const f = frame(page, "Retained"),
    initial = (await f.getAttribute("data-box"))!.split(",").map(Number)
  await f.focus()
  await page.keyboard.press("ArrowRight")
  await pick(page, "Fill fields").click()
  await changed(page, 2)
  const saved = await download(page)
  const rect = saved.form
    .getTextField("Retained")
    .acroField.getWidgets()[0]
    .getRectangle()
  expect(rect.x).toBeCloseTo(initial[0] + 1, 0)
  expect(saved.got.fields).toEqual(["Retained"])
})
test("Undo finishes a pending keyboard move before undoing it", async ({
  page,
}) => {
  await open(page)
  await add(page, "text", "Undoable")
  const f = frame(page, "Undoable"),
    initial = (await f.getAttribute("data-box"))!
  await f.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Control+z")
  await changed(page, 1)
  await expect(f).toHaveCount(1)
  await expect(f).toHaveAttribute("data-box", initial)
  await page.getByTestId("editor-redo").click()
  await changed(page, 2)
  const saved = await download(page)
  const rect = saved.form
    .getTextField("Undoable")
    .acroField.getWidgets()[0]
    .getRectangle()
  expect(rect.x).toBeCloseTo(Number(initial.split(",")[0]) + 1, 0)
})

test("Download keeps a keyboard move that has not yet settled", async ({
  page,
}) => {
  await open(page)
  await add(page, "text", "Immediate")
  const f = frame(page, "Immediate"),
    initial = (await f.getAttribute("data-box"))!.split(",").map(Number)
  await f.focus()
  await page.keyboard.press("ArrowRight")
  const saved = await download(page)
  const rect = saved.form
    .getTextField("Immediate")
    .acroField.getWidgets()[0]
    .getRectangle()
  expect(rect.x).toBeCloseTo(initial[0] + 1, 0)
  expect(saved.got.fields).toEqual(["Immediate"])
})

test("a form-field draft can be taken up after a reload with undo and redo", async ({
  page,
}) => {
  await page.goto(ROUTE)
  await page
    .getByRole("switch", { name: "Keep a draft on this device", exact: true })
    .click()
  await page
    .locator("#editor-file")
    .setInputFiles(
      await pdf("unfinished.pdf", "draft", { pages: 2, size: () => [400, 600] })
    )
  await readerReady(page)
  await add(page, "check", "agree")
  await expect(page.getByTestId("draft-status")).toHaveText(
    "A draft of this file is kept on this device.",
    { timeout: 30000 }
  )
  await page.reload()
  await page
    .getByTestId("draft-card")
    .getByRole("button", { name: "Take it up" })
    .click()
  await readerReady(page)
  await changed(page, 1)
  await expect(frame(page, "agree")).toHaveCount(1)
  await page.getByTestId("editor-undo").click()
  await changed(page, 0)
  await expect(frame(page, "agree")).toHaveCount(0)
  await page.getByTestId("editor-redo").click()
  await changed(page, 1)
  expect((await download(page)).form.getCheckBox("agree").isChecked()).toBe(
    false
  )
})
test("form design stays accessible in both themes, fits 320px and sends no file anywhere", async ({
  page,
}, info) => {
  const requests: string[] = [],
    errors: string[] = [],
    origin = new URL(
      String(info.project.use.baseURL ?? "http://127.0.0.1:4173")
    ).origin
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (
      ["http:", "https:"].includes(u.protocol) &&
      (u.origin !== origin || !["GET", "HEAD"].includes(r.method()))
    )
      requests.push(r.url())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await open(page)
  await add(page, "text", "Accessible name")
  await settings(page)
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
    const scan = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(scan.violations).toEqual([])
    if (
      info.project.name === "chromium" ||
      info.project.name === "mobile-safari"
    )
      await page.screenshot({
        path: `/tmp/keepsimp-form-${info.project.name}-${theme}.png`,
      })
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: `/tmp/keepsimp-form-320-${info.project.name}.png`,
  })
  await page.getByTestId("all-tools").click()
  await pick(page, "Redact: take out for good").click()
  await expect(page.getByTestId("form-design-surface")).toHaveCount(0)
  await pick(page, "Create form fields").click()
  await expect(frame(page, "Accessible name")).toHaveCount(1)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})
