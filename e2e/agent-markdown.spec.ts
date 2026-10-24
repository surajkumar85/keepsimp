import { expect, test } from "@playwright/test"
import mammoth from "mammoth"
import { Document, HeadingLevel, Packer, Paragraph } from "docx"
import { hand, ran, ready, saved } from "./agent"

test("turns Markdown into a web page with its maths and diagram drawn, for an agent", async ({
  page,
}) => {
  test.setTimeout(90_000)
  await ready(page)
  const made = await ran(page, "markdown_to_html", {
    text: "# Sums\n\n$x^2$\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n<script>bad()</script>",
  })
  expect(made.summary).toBe(
    "Made a web page of 1 heading; anything that could run was taken out."
  )
  const html = made.data!.html as string
  expect(html).toContain("<title>Sums</title>")
  expect(html).toContain("<math")
  expect(html).toMatch(/<figure class="diagram"[^>]*><svg/)
  expect(html).not.toContain("<script>")
})

test("writes and reads Word files, for an agent", async ({ page }) => {
  test.setTimeout(90_000)
  await ready(page)
  const word = await ran(page, "markdown_to_word", {
    text: "# Report\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |",
  })
  const docx = await saved(page, word.files![0].id)
  expect(docx.name).toBe("Report.docx")
  const read = await mammoth.convertToHtml({ buffer: docx.bytes })
  expect(read.value).toContain("<h1>Report</h1>")
  expect(read.value).toContain("<ul><li>one</li><li>two</li></ul>")
  expect(read.value).toContain("<table>")

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "From Word", heading: HeadingLevel.HEADING_1 }),
          new Paragraph("A paragraph."),
        ],
      },
    ],
  })
  const file = await hand(
    page,
    "letter.docx",
    Buffer.from(await (await Packer.toBlob(document)).arrayBuffer()),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
  const markdown = await ran(page, "word_to_markdown", { file })
  expect(markdown.summary).toBe("Made letter.md.")
  expect((await saved(page, markdown.files![0].id)).text).toBe(
    "# From Word\n\nA paragraph."
  )
})

test("makes Markdown from HTML, checks it, tidies it and makes tables, for an agent", async ({
  page,
}) => {
  await ready(page)
  const fromHtml = await ran(page, "html_to_markdown", {
    text: "<h2>Plan</h2><ul><li><b>Go</b></li></ul>",
  })
  expect(fromHtml.data!.markdown).toBe("## Plan\n\n- **Go**")
  const checked = await ran(page, "check_markdown", {
    text: "#Title\n",
    fix: true,
  })
  expect(checked.summary).toBe(
    "1 finding, 1 of them fixable. Fixed what could be fixed."
  )
  expect(checked.data!.markdown).toBe("# Title\n")
  const tidy = await ran(page, "tidy_markdown", { text: "* a\n" })
  expect(tidy.data!.markdown).toBe("- a\n")
  const table = await ran(page, "markdown_table", { tsv: "a\tb\n1\t2" })
  expect(table.data!.markdown).toBe(
    "| a   | b   |\n| --- | --- |\n| 1   | 2   |"
  )
})
