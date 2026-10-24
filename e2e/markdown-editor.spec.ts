import { readFile } from "node:fs/promises"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { replaceEditor } from "./editor"

const EDITOR = "/dashboard/markdown-editor/"
const source = (page: Page) =>
  page.getByLabel("Markdown source", { exact: true })
const preview = (page: Page) => page.getByTestId("markdown-preview")

/** The editor's own modifier: Apple's key where CodeMirror reads it as a Mac, Control elsewhere. */
const mod = (page: Page) =>
  page.evaluate(() =>
    /Mac|iP(hone|[oa]d)/.test(navigator.platform) ||
    (/AppleWebKit/.test(navigator.userAgent) &&
      /Mobile\/\w+/.test(navigator.userAgent))
      ? "Meta"
      : "Control"
  )

async function downloaded(page: Page, menuItem: string) {
  const event = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export" }).click()
  await page.getByRole("menuitem", { name: menuItem }).click()
  const file = await event
  return {
    name: file.suggestedFilename(),
    text: (await readFile((await file.path())!)).toString("utf8"),
  }
}

/** On a phone the preview takes its turn with the source. */
async function showPreview(page: Page) {
  const split = page.getByRole("radio", { name: "Split" })
  if (await split.isVisible()) await split.click()
  else await page.getByRole("radio", { name: "Preview" }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto(EDITOR)
  await expect(source(page)).toBeVisible()
})

test("draws the sample as GitHub does: front matter, tasks, a table, an alert and a footnote", async ({
  page,
}) => {
  await showPreview(page)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(page.getByTestId("markdown-name")).toHaveText(
    "keepsimp-sample.md"
  )
  const page_ = preview(page)
  await expect(
    page_.getByRole("table", { name: "Front matter" })
  ).toContainText("Trip notes")
  await expect(page_.getByRole("heading", { level: 1 })).toHaveText(
    "Trip notes"
  )
  await expect(page_.getByRole("checkbox")).toHaveCount(4)
  await expect(page_.getByRole("checkbox").first()).toBeChecked()
  await expect(page_.locator("table").nth(1)).toContainText("Sintra")
  await expect(page_.locator(".markdown-alert-tip")).toContainText("Ctrl+K")
  await expect(page_.locator("del, s")).toHaveText("Surf lesson")
  await expect(page_.locator(".footnotes")).toContainText("blue door")
  await expect(page.getByTestId("markdown-stats")).toContainText(/\d+ words/)
  // A link to a heading moves the preview, not the page.
  const before = page.url()
  await page_.locator(".footnote-ref a").click()
  expect(page.url()).toBe(before)
})

test("writes Markdown from the keys and the toolbar, and carries lists on", async ({
  page,
}, testInfo) => {
  const key = await mod(page)
  // On Android, CodeMirror reads Enter, Home and End from the changes a
  // real keyboard makes to the page; Chrome dressed as a phone sends only
  // keys, which say nothing of how a phone types. Every other profile,
  // the iPhone's among them, goes through the same keys.
  test.skip(
    testInfo.project.name === "mobile-chrome",
    "Android's typing is not emulated"
  )
  await replaceEditor(source(page), "# Shopping\n\n- milk")
  await source(page).press("Enter")
  await page.keyboard.insertText("bread is good")
  for (let step = 0; step < 4; step++)
    await source(page).press("Shift+ArrowLeft")
  await source(page).press(`${key}+b`)
  await expect(source(page)).toContainText("- bread is **good**")
  await source(page).press("End")
  await source(page).press("Enter")
  await page.keyboard.insertText("tea")
  await source(page).press("Home")
  // The toolbar makes the line a task.
  await page.getByRole("button", { name: "Task list" }).click()
  await expect(source(page)).toContainText("- [ ] tea")
  await source(page).press("End")
  await source(page).press("Enter")
  await source(page).press("Enter")
  await page.keyboard.insertText("see docs")
  for (let step = 0; step < 4; step++)
    await source(page).press("Shift+ArrowLeft")
  // Mod-k makes a link here; the site's search does not open.
  await source(page).press(`${key}+k`)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.keyboard.insertText("https://example.com")
  await expect(source(page)).toContainText("see [docs](https://example.com)")

  await showPreview(page)
  await expect(preview(page).locator("strong")).toHaveText("good")
  await expect(preview(page).getByRole("checkbox")).toHaveCount(1)
  await expect(
    preview(page).getByRole("link", { name: "docs" })
  ).toHaveAttribute("href", "https://example.com")
  await expect(page.getByTestId("markdown-name")).toHaveText("shopping.md")
  await expect(page.getByTestId("markdown-saved")).toHaveText(
    "Changes not saved"
  )
})

test("never lets a document run anything", async ({ page }) => {
  await replaceEditor(
    source(page),
    [
      "<script>window.ran = 1</script>",
      '<img src="x.png" onerror="window.ran = 2">',
      "[click](javascript:window.ran=3)",
      '<a href="javascript:window.ran=4">raw</a>',
      '<iframe src="https://example.com"></iframe>',
    ].join("\n\n")
  )
  await showPreview(page)
  await expect(preview(page).locator("img")).toHaveCount(1)
  await expect(preview(page).locator("script, iframe, [onerror]")).toHaveCount(
    0
  )
  await expect(preview(page).locator('a[href^="javascript"]')).toHaveCount(0)
  await preview(page).getByText("raw").click()
  expect(
    await page.evaluate(() => (window as { ran?: number }).ran)
  ).toBeUndefined()
})

test("opens a file, and downloads it, a web page of it, and nothing else", async ({
  page,
}) => {
  // No picker here: the page falls back to a file field and downloads.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.reload()
  await page.getByLabel("Choose a Markdown file").setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Notes\n\nSome *words* and `code`.\n"),
  })
  await expect(page.getByTestId("markdown-name")).toHaveText("notes.md")
  await expect(page.getByTestId("markdown-saved")).toHaveText("Saved")
  await expect(page.getByTestId("toast").first()).toContainText(
    "Opened notes.md"
  )

  await source(page).click()
  await source(page).press("End")
  await page.keyboard.insertText("!")
  await expect(page.getByTestId("markdown-saved")).toHaveText(
    "Changes not saved"
  )
  const saving = page.waitForEvent("download")
  await page.getByRole("button", { name: "Save" }).click()
  const saved = await saving
  expect(saved.suggestedFilename()).toBe("notes.md")
  expect((await readFile((await saved.path())!)).toString("utf8")).toBe(
    "# Notes\n\nSome *words* and `code`.\n!"
  )
  await expect(page.getByTestId("markdown-saved")).toHaveText("Saved")

  const html = await downloaded(page, "Web page (.html)")
  expect(html.name).toBe("notes.html")
  expect(html.text).toMatch(/^<!doctype html>/)
  expect(html.text).toContain("<title>Notes</title>")
  expect(html.text).toContain("<em>words</em>")
  expect(html.text).not.toMatch(/data-source-line|<script|<link /)

  // Files that are not Markdown are refused, and said so.
  await page.getByLabel("Choose a Markdown file").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50]),
  })
  await expect(
    page.getByTestId("markdown-editor").getByRole("alert")
  ).toContainText("photo.png is not a Markdown or text file.")
})

test("saves in place where the browser lets a page write the file it opened", async ({
  page,
}) => {
  // The browser's own pickers cannot be driven by a test; these stand in for them and keep what is written.
  await page.addInitScript(() => {
    const written: string[] = []
    const handle = {
      name: "draft.md",
      getFile: async () =>
        new File(["# Draft\n"], "draft.md", { type: "text/markdown" }),
      createWritable: async () => ({
        write: async (text: string) => void written.push(text),
        close: async () => {},
      }),
    }
    Object.assign(window, {
      written,
      showOpenFilePicker: async () => [handle],
      showSaveFilePicker: async () => handle,
    })
  })
  await page.reload()
  await page.getByRole("button", { name: "Open", exact: true }).click()
  await expect(page.getByTestId("markdown-name")).toHaveText("draft.md")
  await source(page).click()
  await source(page).press("End")
  await page.keyboard.insertText("More.")
  await source(page).press(`${await mod(page)}+s`)
  await expect(page.getByTestId("markdown-saved")).toHaveText("Saved")
  expect(
    await page.evaluate(
      () => (window as unknown as { written: string[] }).written
    )
  ).toEqual(["# Draft\nMore."])
})

test("leaves pictures from other sites out when asked", async ({ page }) => {
  await replaceEditor(
    source(page),
    "![far](https://example.com/far.png)\n\n![near](data:image/gif;base64,R0lGODlhAQABAAAAACw=)"
  )
  await showPreview(page)
  await expect(preview(page).locator('img[src^="https://"]')).toHaveCount(1)
  await page.getByRole("button", { name: "Preview options" }).click()
  await page
    .getByRole("menuitemcheckbox", { name: "Show pictures from other sites" })
    .click()
  await expect(preview(page).locator('img[src^="https://"]')).toHaveCount(0)
  await expect(page.getByTestId("markdown-stats")).toContainText(
    "1 picture from other sites not shown"
  )
})

test("is accessible in both themes and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole("button", { name: "Try a sample" }).click()
  // Too narrow for both: the source and preview take turns.
  await expect(page.getByRole("radio", { name: "Split" })).toHaveCount(0)
  for (const view of ["Write", "Preview"]) {
    await page.getByRole("radio", { name: view }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
    expect(scan.violations).toEqual([])
  }
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  // Escape, then Tab, leaves the editor.
  await page.getByRole("radio", { name: "Write" }).click()
  await source(page).focus()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Tab")
  await expect(source(page)).not.toBeFocused()
})
