import { describe, expect, it } from "vitest"
import mammoth from "mammoth"
import { fitted, markdownToWord, PAGE_WIDTH, type WordPicture } from "./to-word"

/** A 1 × 1 PNG. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ),
  (char) => char.charCodeAt(0)
)
const picture: WordPicture = {
  bytes: PNG,
  type: "png",
  width: 1200,
  height: 600,
}

/** The Word file as another program reads it: mammoth's HTML. */
async function read(text: string, options = {}) {
  const blob = await markdownToWord(text, options)
  const { value } = await mammoth.convertToHtml({
    buffer: Buffer.from(await blob.arrayBuffer()),
  })
  return value
}

describe("markdownToWord", () => {
  it("writes Word's own headings, lists, marks, links and code", async () => {
    const html = await read(
      [
        "# Title",
        "## Part",
        "Some **bold**, _soft_, ~~old~~ and `code` with a [link](https://example.com) and [a note](#part).",
        "Line one  ",
        "line two",
        "",
        "- one",
        "  - nested",
        "- [x] done",
        "- [ ] to do",
        "",
        "1. first",
        "2. second",
        "",
        "- - deep",
        "",
        "    indented code",
        "",
        "```js",
        "let a = 1",
        "",
        "```",
        "",
        "> Quoted",
        "",
        "---",
        "",
        "<div>raw <b>html</b></div>",
        "",
        "<!-- nothing -->",
      ].join("\n")
    )
    expect(html).toContain("<h1>Title</h1>")
    expect(html).toContain("<h2>Part</h2>")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>soft</em>")
    expect(html).toContain("<s>old</s>")
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain("a note")
    expect(html).not.toContain('href="#part"')
    expect(html).toContain("Line one<br />line two")
    expect(html).toMatch(
      /<ul><li>one<ul><li>nested<\/li><\/ul><\/li><li>☑ done<\/li><li>☐ to do<\/li><\/ul>/
    )
    // A list made only of a list starts at the deeper level.
    expect(html).toContain(
      "<ol><li>first</li><li>second<ul><li>deep</li></ul></li></ol>"
    )
    expect(html).toContain("indented code")
    expect(html).toContain("let a = 1")
    expect(html).toContain("Quoted")
    expect(html).toContain("raw html")
  })

  it("writes tables, footnotes, alerts, maths and pictures", async () => {
    const html = await read(
      [
        "---",
        "title: From the front",
        "author: Ada",
        "---",
        "| Name | Age | Mid |",
        "| ---- | --: | :-: |",
        "| Ada  | 36  | x   |",
        "",
        "Said so[^1]. Energy $E=mc^2$.",
        "",
        "$$",
        "x^2",
        "$$",
        "",
        "> [!WARNING]",
        "> Careful.",
        "",
        "![A chart](pictures/chart.png) ![far](https://example.com/far.png) ![](pictures/missing.png) ![](pictures/chart.png)",
        "",
        "```mermaid",
        "graph TD",
        "```",
        "",
        "```mermaid",
        "graph LR",
        "```",
        "",
        "[^1]: The note.",
        "[^2]: Another, not referred to.",
      ].join("\n"),
      {
        pictures: new Map([["pictures/chart.png", picture]]),
        diagrams: [picture, null],
      }
    )
    expect(html).toMatch(
      /<table>[\s\S]*<strong>Name<\/strong>[\s\S]*Ada[\s\S]*36[\s\S]*<\/table>/
    )
    expect(html).toContain("E=mc^2")
    expect(html).toContain("x^2")
    expect(html).toContain("<strong>Warning</strong>")
    expect(html).toContain("Careful.")
    expect(html.match(/<img /g)).toHaveLength(3)
    expect(html).toContain('alt="A chart"')
    expect(html).toContain("[far]")
    expect(html).toContain("[picture]")
    expect(html).toContain("graph LR")
    expect(html).toContain("The note.")
    expect(html).toMatch(/footnote/)
  })

  it("writes an empty document as an empty page", async () => {
    expect(await read("")).toBe("")
  })

  it("never sets a picture wider than the page", () => {
    expect(fitted(300, 100)).toEqual({ width: 300, height: 100 })
    expect(fitted(PAGE_WIDTH * 2, 400)).toEqual({
      width: PAGE_WIDTH,
      height: 200,
    })
  })
})
