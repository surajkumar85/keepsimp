import { describe, expect, it } from "vitest"
import { Document, Packer, Paragraph } from "docx"
import { markdownToWord } from "@/lib/markdown/to-word"
import { Agent } from "./agent"
import { markdownTools } from "./markdown"

/** The tools with the page's drawing left as the renderer makes it, and the Word writer itself. */
const agent = () =>
  new Agent(
    markdownTools({
      enrich: async (html) =>
        html.replace(/data-tex="([^"]*)"/g, 'data-tex="$1" data-drawn'),
      word: (text, title) => markdownToWord(text, { title }),
    })
  )

const call = (made: Agent, name: string, input: unknown) =>
  made.call(name, input, { caller: "page" })

describe("the Markdown tools", () => {
  it("make a web page, or the HTML alone, with nothing that runs", async () => {
    const tools = agent()
    const page = await call(tools, "markdown_to_html", {
      text: "# Notes\n\n$x$ and <script>bad()</script>",
    })
    expect(page.summary).toBe(
      "Made a web page of 1 heading; anything that could run was taken out."
    )
    const html = (page.data as { html: string }).html
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain("<title>Notes</title>")
    expect(html).toContain("data-drawn")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("data-source-line")
    const body = await call(tools, "markdown_to_html", {
      text: '"a" -- b',
      standalone: false,
      typographer: true,
      title: "Given",
    })
    expect(body.summary).toBe(
      "Made the HTML of 0 headings; anything that could run was taken out."
    )
    expect((body.data as { html: string }).html).toBe("<p>“a” – b</p>\n")
  })

  it("write a web page made from a file to a file, titled by its name without a heading", async () => {
    const tools = agent()
    const ref = tools.files.add(new Blob(["Just words."]), "plain.md")
    const result = await call(tools, "markdown_to_html", { file: ref.id })
    expect(result.files![0].name).toBe("plain.html")
    expect(await tools.files.get(result.files![0].id).blob.text()).toContain(
      "<title>plain.md</title>"
    )
  })

  it("make a Word file, saying when maths stays as TeX", async () => {
    const tools = agent()
    const result = await call(tools, "markdown_to_word", {
      text: "# Report\n\n$x$",
    })
    expect(result.summary).toBe(
      "Made a Word file of 1 heading: Report.docx. Maths is kept as its TeX."
    )
    const blob = tools.files.get(result.files![0].id).blob
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    const ref = tools.files.add(new Blob(["no heading"]), "draft.md")
    const fromFile = await call(tools, "markdown_to_word", {
      file: ref.id,
      title: "T",
    })
    expect(fromFile.files![0].name).toBe("draft.docx")
    expect(fromFile.summary).toBe("Made a Word file of 0 headings: draft.docx.")
    const untitled = await call(tools, "markdown_to_word", { text: "x" })
    expect(untitled.files![0].name).toBe("Document.docx")
  })

  it("turn HTML and Word files into Markdown, pictures kept as files", async () => {
    const tools = agent()
    const html = await call(tools, "html_to_markdown", {
      text: "<h1>Hi</h1><p>one <b>two</b></p>",
    })
    expect(html.summary).toBe("Made 3 words of Markdown.")
    expect((html.data as { markdown: string }).markdown).toBe(
      "# Hi\n\none **two**"
    )
    const PNG = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      ),
      (char) => char.charCodeAt(0)
    )
    const docx = await markdownToWord("# From Word\n\n![dot](pictures/a.png)", {
      pictures: new Map([
        ["pictures/a.png", { bytes: PNG, type: "png", width: 1, height: 1 }],
      ]),
    })
    const ref = tools.files.add(docx, "report.docx")
    // mammoth reads a Buffer where Node runs it.
    const original = Blob.prototype.arrayBuffer
    const word = await call(tools, "word_to_markdown", {
      file: ref.id,
    }).finally(() => {
      Blob.prototype.arrayBuffer = original
    })
    expect(word.summary).toMatch(/^Made report\.md and 1 picture\./)
    expect(word.files!.map((file) => file.name)).toEqual([
      "report.md",
      "pictures-picture-1.png",
    ])
    expect(word.data).toMatchObject({
      pictures: [{ named: "pictures/picture-1.png" }],
    })
  }, 20_000)

  it("hand long results back as files, and name a page with no heading", async () => {
    const tools = agent()
    const long = `<p>${"word ".repeat(12_000)}</p>`
    const html = await call(tools, "html_to_markdown", { text: long })
    expect(html.files![0].name).toBe("converted.md")
    expect(html.data).toEqual({})
    const page = await call(tools, "markdown_to_html", {
      text: "word ".repeat(12_000),
    })
    expect(page.files![0].name).toBe("page.html")
    expect(await tools.files.get(page.files![0].id).blob.text()).toContain(
      "<title>Document</title>"
    )
  })

  it("say what a Word file held that Markdown has no place for", async () => {
    const tools = agent()
    const document = new Document({
      styles: { paragraphStyles: [{ id: "Fancy", name: "Fancy" }] },
      sections: [
        { children: [new Paragraph({ text: "Styled", style: "Fancy" })] },
      ],
    })
    const ref = tools.files.add(await Packer.toBlob(document), "styled.docx")
    const word = await call(tools, "word_to_markdown", { file: ref.id })
    expect(word.summary).toBe(
      "Made styled.md. 1 thing had no place in Markdown and was left out."
    )
    const two = new Document({
      styles: {
        paragraphStyles: [
          { id: "Fancy", name: "Fancy" },
          { id: "Plain", name: "Plain" },
        ],
      },
      sections: [
        {
          children: [
            new Paragraph({ text: "A", style: "Fancy" }),
            new Paragraph({ text: "B", style: "Plain" }),
          ],
        },
      ],
    })
    const twoRef = tools.files.add(await Packer.toBlob(two), "two.docx")
    expect(
      (await call(tools, "word_to_markdown", { file: twoRef.id })).summary
    ).toBe("Made two.md. 2 things had no place in Markdown and were left out.")
    const page = tools.files.add(new Blob(["<h1>Page</h1>"]), "page.html")
    expect(
      (await call(tools, "html_to_markdown", { file: page.id })).files![0].name
    ).toBe("page.md")
  })

  it("refuses a Word file it cannot read, or one too large", async () => {
    const tools = agent()
    const bad = tools.files.add(new Blob(["not a zip"]), "broken.docx")
    await expect(
      call(tools, "word_to_markdown", { file: bad.id })
    ).rejects.toThrow(/broken\.docx could not be read as a Word file/)
    const big = tools.files.add(
      new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]),
      "big.docx"
    )
    await expect(
      call(tools, "word_to_markdown", { file: big.id })
    ).rejects.toThrow("big.docx is larger than 20 MB.")
  })

  it("make tables from rows or spreadsheet cells", async () => {
    const tools = agent()
    const rows = await call(tools, "markdown_table", {
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
    })
    expect(rows.summary).toBe("Made a table of 1 row under its header.")
    expect((rows.data as { markdown: string }).markdown).toContain(
      "| a   | b   |"
    )
    const tsv = await call(tools, "markdown_table", { tsv: "x\ty\n1\t2\n3\t4" })
    expect(tsv.summary).toBe("Made a table of 2 rows under its header.")
    await expect(call(tools, "markdown_table", {})).rejects.toThrow(
      /either as "rows" or as "tsv"/
    )
    await expect(
      call(tools, "markdown_table", { tsv: "no tabs" })
    ).rejects.toThrow(/not cells/)
  })

  it("check a document, and fix what can be fixed", async () => {
    const tools = agent()
    const text = "#Title\n\nSome words here.\n"
    const checked = await call(tools, "check_markdown", { text })
    expect(checked.summary).toBe("1 finding, 1 of them fixable.")
    expect(checked.data).toMatchObject({
      issues: [{ line: 1, rule: "MD018", fixable: true }],
      stats: { words: 4 },
      readability: { sentences: 2 },
    })
    const fixed = await call(tools, "check_markdown", { text, fix: true })
    expect(fixed.summary).toBe(
      "1 finding, 1 of them fixable. Fixed what could be fixed."
    )
    expect((fixed.data as { markdown: string }).markdown).toBe(
      "# Title\n\nSome words here.\n"
    )
    const clean = await call(tools, "check_markdown", {
      text: "# Fine\n",
      fix: true,
    })
    expect(clean.summary).toBe("Nothing to fix. Nothing was changed.")
  })

  it("tidy a document with Prettier", async () => {
    const tools = agent()
    const tidied = await call(tools, "tidy_markdown", { text: "* a\n* b\n" })
    expect(tidied.summary).toBe("Tidied.")
    expect((tidied.data as { markdown: string }).markdown).toBe("- a\n- b\n")
    const already = await call(tools, "tidy_markdown", { text: "- a\n" })
    expect(already.summary).toBe("It was tidy already.")
    const ref = tools.files.add(new Blob(["* x\n"]), "list.md")
    const fromFile = await call(tools, "tidy_markdown", { file: ref.id })
    expect(fromFile.files![0].name).toBe("list-tidy.md")
    expect(fromFile.summary).toBe("Tidied. Written to list-tidy.md.")
  })
})
