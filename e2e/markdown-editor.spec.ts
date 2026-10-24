import { readFile } from "node:fs/promises"
import { test, expect, type Page } from "@playwright/test"
import mammoth from "mammoth"
import { Document, HeadingLevel, Packer, Paragraph } from "docx"
import { unzipSync } from "fflate"
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

/** Opens the More menu and presses one of its items. */
async function more(page: Page, item: string) {
  await page.getByRole("button", { name: "More" }).click()
  await page.getByRole("menuitem", { name: item }).click()
}

/** Pastes as a person would, with what the clipboard holds. */
async function paste(page: Page, data: Record<string, string>, png?: string) {
  await source(page).click()
  await source(page).evaluate(
    (element, [data, png]) => {
      const transfer = new DataTransfer()
      for (const [type, value] of Object.entries(data))
        transfer.setData(type, value)
      if (png) {
        const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0))
        transfer.items.add(
          new File([bytes], "image.png", { type: "image/png" })
        )
      }
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        })
      )
    },
    [data, png] as const
  )
}

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

/** Whether a draft is in the browser's own storage. */
const draftKept = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("keepsimp-markdown", 1)
        open.onupgradeneeded = () => open.result.createObjectStore("drafts")
        open.onsuccess = () => {
          const get = open.result
            .transaction("drafts", "readonly")
            .objectStore("drafts")
            .get("current")
          get.onsuccess = () => {
            resolve(get.result !== undefined)
            open.result.close()
          }
        }
      })
  )

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
  ).toContainText("photo.png is not a Markdown, Word or HTML file.")
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
  await page.getByRole("button", { name: "More" }).click()
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

test("draws maths as MathML, a diagram as a drawing and code in colour", async ({
  page,
}) => {
  test.setTimeout(60_000)
  await showPreview(page)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await expect(preview(page).locator("math")).toHaveCount(2)
  await expect(preview(page).locator("figure.diagram svg")).toHaveCount(1, {
    timeout: 30_000,
  })
  await expect(preview(page).locator("figure.diagram svg")).toContainText(
    "Hotel"
  )
  await expect(
    preview(page).locator("pre code [class*=tok-]").first()
  ).toBeVisible()
  // The sample is not work of one's own: it opens as saved.
  await expect(page.getByTestId("markdown-saved")).toHaveText("Saved")
})

test("pastes formatted text, spreadsheet cells and pictures as Markdown", async ({
  page,
}, testInfo) => {
  // Firefox does not let a page make a paste with data in it; pasting itself is the browser's.
  test.skip(
    testInfo.project.name === "firefox",
    "Firefox builds no paste with data"
  )
  await paste(page, {
    "text/html": "<h2>From a page</h2><p>Some <b>bold</b> words.</p>",
    "text/plain": "From a page Some bold words.",
  })
  await expect(source(page)).toContainText("## From a page")
  await expect(source(page)).toContainText("Some **bold** words.")
  await replaceEditor(source(page), "")
  await paste(page, { "text/plain": "Name\tAge\nAda\t36" })
  await expect(source(page)).toContainText("| Name | Age |")
  await replaceEditor(source(page), "")
  // What a code editor copies stays as it is.
  await paste(page, {
    "text/html": "<div><span>**kept**</span></div>",
    "text/plain": "**kept**",
  })
  await expect(source(page)).toContainText("**kept**")
  await replaceEditor(source(page), "")
  await paste(page, {}, PNG)
  await expect(source(page)).toContainText("![](pictures/picture-1.png)")
  await showPreview(page)
  await expect(preview(page).locator("img")).toHaveAttribute("src", /^blob:/)
  const zip = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export" }).click()
  await page
    .getByRole("menuitem", { name: "Markdown and pictures (.zip)" })
    .click()
  const files = unzipSync(
    new Uint8Array(await readFile((await (await zip).path())!))
  )
  expect(Object.keys(files).sort()).toEqual([
    "pictures/picture-1.png",
    "untitled.md",
  ])
})

test("tables: made in a grid, tidied, grown and cut in place", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-chrome",
    "Android's typing is not emulated"
  )
  await page.getByRole("button", { name: "Table" }).click()
  await page.getByRole("menuitem", { name: "Make a table…" }).click()
  const dialog = page.getByRole("dialog", { name: "Make a table" })
  await dialog.getByLabel("Header of column 1").fill("Name")
  await dialog.getByLabel("Row 1, column 1").fill("Ada")
  await dialog
    .getByRole("button", { name: "Put the table in the document" })
    .click()
  await expect(source(page)).toContainText("| Name     | Column 2 | Column 3 |")
  await replaceEditor(source(page), "| a | b |\n|-|-|\n| 1 | 2 |")
  await page.getByRole("button", { name: "Table" }).click()
  await page
    .getByRole("menuitem", { name: "Line up the table's pipes" })
    .click()
  await expect(source(page)).toContainText("| a   | b   |")
  await page.getByRole("button", { name: "Table" }).click()
  await page
    .getByRole("menuitem", { name: "Add a column to the right" })
    .click()
  await expect(source(page)).toContainText("| a   | b   |     |")
})

test("outlines the document, writes its contents and checks it", async ({
  page,
}) => {
  await replaceEditor(
    source(page),
    "#Title\n\n## One\n\n### Deep\n\nSee [x](#nowhere).\n"
  )
  await more(page, "Outline")
  const outline = page.getByTestId("markdown-outline")
  await expect(outline.getByRole("button", { name: "One" })).toBeVisible()
  await outline
    .getByRole("button", { name: "Write a table of contents" })
    .click()
  await expect(source(page)).toContainText("<!-- toc -->")
  await expect(source(page)).toContainText("- [One](#one)")
  await more(page, "Check the document")
  const check = page.getByTestId("markdown-check")
  await expect(check).toContainText("No space after the # of a heading.")
  await expect(check).toContainText(
    "A link to a heading that is not in the document."
  )
  await check
    .getByRole("button", { name: /^Fix \d+ things? that can be fixed$/ })
    .click()
  await expect(source(page)).toContainText("# Title")
  await expect(check).toContainText("How easy it is to read")
})

test("keeps versions, compares one and puts it back, and tidies with a look first", async ({
  page,
}) => {
  await replaceEditor(source(page), "* first\n")
  await more(page, "Versions")
  const versions = page.getByTestId("markdown-versions")
  await versions.getByRole("button", { name: "Keep a version now" }).click()
  // On a phone the panel lies over the text: it is closed to write, and opened again.
  await versions.getByRole("button", { name: "Close versions" }).click()
  await replaceEditor(source(page), "* second\n")
  await more(page, "Versions")
  await versions.getByRole("button", { name: "Compare" }).click()
  const compare = page.getByRole("dialog", { name: /Compare with the version/ })
  await expect(compare.getByTestId("markdown-diff")).toContainText("second")
  await compare.getByRole("button", { name: "Put this version back" }).click()
  await expect(source(page)).toContainText("* first")
  await more(page, "Tidy with Prettier…")
  const tidy = page.getByRole("dialog", { name: "Tidy the document" })
  await expect(tidy.getByTestId("markdown-diff")).toBeVisible()
  await tidy.getByRole("button", { name: "Take the changes" }).click()
  await expect(source(page)).toContainText("- first")
})

test("opens documents in tabs, and keeps a draft only when asked", async ({
  page,
}) => {
  await replaceEditor(source(page), "# First")
  await more(page, "New document")
  await replaceEditor(source(page), "# Second")
  const tabs = page.getByRole("navigation", { name: "Open documents" })
  await expect(
    tabs.getByRole("button", { name: /^(first|second)\.md/ })
  ).toHaveCount(2)
  await tabs.getByRole("button", { name: /^first\.md/ }).click()
  await expect(source(page)).toContainText("# First")
  // Nothing is kept until the switch is on.
  await page.getByRole("button", { name: "More" }).click()
  await page
    .getByRole("menuitemcheckbox", { name: "Keep a draft on this device" })
    .click()
  await expect.poll(() => draftKept(page)).toBe(true)
  await page.reload()
  await expect(source(page)).toContainText("# First")
  await expect(
    page
      .getByRole("navigation", { name: "Open documents" })
      .getByRole("button", { name: /^(first|second)\.md/ })
  ).toHaveCount(2)
  await expect(
    page.getByTestId("toast").filter({ hasText: "Your draft is back" })
  ).toBeVisible()
  // Switched off, the draft is deleted.
  await page.getByRole("button", { name: "More" }).click()
  await page
    .getByRole("menuitemcheckbox", { name: "Keep a draft on this device" })
    .click()
  await expect(
    page
      .getByTestId("toast")
      .filter({ hasText: "The draft is deleted from this device" })
  ).toBeVisible()
  await expect.poll(() => draftKept(page)).toBe(false)
  page.on("dialog", (dialog) => void dialog.accept())
  await page.reload()
  await expect(source(page)).toBeVisible()
  await expect(source(page)).not.toContainText("# First")
})

test("writes a Word file that Word reads, and reads Word and HTML files as Markdown", async ({
  page,
}) => {
  test.setTimeout(60_000)
  await replaceEditor(
    source(page),
    "# Report\n\n1. one\n2. two\n\nSome **bold**."
  )
  const event = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export" }).click()
  await page.getByRole("menuitem", { name: "Word (.docx)" }).click()
  const download = await event
  expect(download.suggestedFilename()).toBe("report.docx")
  const read = await mammoth.convertToHtml({
    buffer: await readFile((await download.path())!),
  })
  expect(read.value).toContain("<h1>Report</h1>")
  expect(read.value).toContain("<ol><li>one</li><li>two</li></ol>")
  expect(read.value).toContain("<strong>bold</strong>")

  const docx = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "From Word", heading: HeadingLevel.HEADING_1 }),
          new Paragraph("A paragraph."),
        ],
      },
    ],
  })
  await page.getByLabel("Choose a Word or HTML file").setInputFiles({
    name: "letter.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(await (await Packer.toBlob(docx)).arrayBuffer()),
  })
  await expect(page.getByTestId("markdown-name")).toHaveText("letter.md")
  await expect(source(page)).toContainText("# From Word")
  await page.getByLabel("Choose a Word or HTML file").setInputFiles({
    name: "page.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h2>A page</h2><ul><li>item</li></ul>"),
  })
  await expect(page.getByTestId("markdown-name")).toHaveText("page.md")
  await expect(source(page)).toContainText("## A page")
})

test("ticks a task from the preview, presents slides and focuses on writing", async ({
  page,
}) => {
  await replaceEditor(source(page), "# One\n\n- [ ] milk\n\n---\n\n# Two")
  await showPreview(page)
  await preview(page).getByRole("checkbox").click()
  await expect(
    source(page).or(page.locator("[data-markdown-source]"))
  ).toContainText("- [x] milk")
  await more(page, "Present as slides")
  const slides = page.getByTestId("markdown-slides")
  await expect(slides.getByTestId("slide-count")).toHaveText("1 / 2")
  await slides.press("ArrowRight")
  await expect(slides.getByTestId("slide-count")).toHaveText("2 / 2")
  await expect(slides.getByRole("heading", { name: "Two" })).toBeVisible()
  await slides.press("Escape")
  await expect(slides).toHaveCount(0)
  await more(page, "Focus on writing")
  await expect(page.getByTestId("markdown-frame")).toHaveClass(/fixed/)
  await page.getByRole("button", { name: "Leave focus" }).click()
  await expect(page.getByTestId("markdown-frame")).not.toHaveClass(/fixed/)
})

for (const [path, action, check] of [
  ["/dashboard/markdown-to-html/", "Download the web page", "html"],
  ["/dashboard/markdown-to-word/", "Download the Word file", "docx"],
] as const)
  test(`the door at ${path} does its one job`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByTestId("markdown-door")).toContainText(
      "This page is the Markdown editor"
    )
    await replaceEditor(source(page), "# Door")
    const event = page.waitForEvent("download")
    await page.getByRole("button", { name: action }).click()
    expect((await event).suggestedFilename()).toBe(`door.${check}`)
  })

test("the table generator's door opens the table maker", async ({ page }) => {
  await page.goto("/dashboard/markdown-table-generator/")
  await page.getByRole("button", { name: "Make a table" }).click()
  await expect(page.getByRole("dialog", { name: "Make a table" })).toBeVisible()
})
