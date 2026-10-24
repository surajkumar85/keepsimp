import { describe, expect, it } from "vitest"
import { hasFormatting, htmlToMarkdown } from "./from-html"

describe("htmlToMarkdown", () => {
  it("writes headings, lists, links, emphasis, quotes and rules as GitHub does", () => {
    expect(
      htmlToMarkdown(
        "<h2>Plan</h2><p>Some <strong>bold</strong>, <em>soft</em> and <del>old</del> words, a <a href='https://example.com'>link</a>.</p><ul><li>one</li><li>two</li></ul><blockquote><p>quoted</p></blockquote><hr><ol><li>first</li></ol>"
      )
    ).toBe(
      [
        "## Plan",
        "",
        "Some **bold**, _soft_ and ~~old~~ words, a [link](https://example.com).",
        "",
        "- one",
        "- two",
        "",
        "> quoted",
        "",
        "---",
        "",
        "1. first",
      ].join("\n")
    )
  })

  it("reads Google Docs: its wrapper is not bold, its styled spans are", () => {
    expect(
      htmlToMarkdown(
        '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700">Strong</span> and <span style="font-style:italic"> slanted </span>and <span style="text-decoration:line-through">gone</span><span style="font-weight:700"> </span></p></b>'
      )
    ).toBe("**Strong** and _slanted_ and ~~gone~~")
  })

  it("makes every table a GitHub table, its first row the header", () => {
    expect(
      htmlToMarkdown(
        "<table><tr><th><b>Name</b></th><td>Age</td></tr><tr><td><b>Ada</b></td><td>36</td></tr></table><table></table>"
      )
    ).toBe(
      ["| Name    | Age |", "| ------- | --- |", "| **Ada** | 36  |"].join("\n")
    )
  })

  it("keeps the language of a block of code, and its own backticks", () => {
    expect(
      htmlToMarkdown('<pre><code class="language-js">let a = 1\n</code></pre>')
    ).toBe("```js\nlet a = 1\n```")
    expect(
      htmlToMarkdown('<pre><code class="lang-md">```\nx\n```</code></pre>')
    ).toBe("~~~md\n```\nx\n```\n~~~")
    expect(htmlToMarkdown("<pre><code>plain</code></pre>")).toBe(
      "```\nplain\n```"
    )
  })

  it("numbers from a list's own start, and nests lists", () => {
    expect(
      htmlToMarkdown(
        '<ol start="3"><li>c</li><li>d<ul><li>e</li></ul></li></ol>'
      )
    ).toBe("3. c\n4. d\n   - e")
    expect(
      htmlToMarkdown("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>")
    ).toBe("- a\n  - b\n- c")
  })

  it("drops what is not part of the text", () => {
    expect(
      htmlToMarkdown(
        "<style>p{}</style><script>x()</script><p>Hi&nbsp;there</p>"
      )
    ).toBe("Hi there")
  })
})

describe("hasFormatting", () => {
  it("tells formatted HTML from a code editor's bare lines", () => {
    expect(hasFormatting("<div><span>**bold**</span><br></div>")).toBe(false)
    expect(hasFormatting("<p>Some <b>bold</b></p>")).toBe(true)
    expect(hasFormatting("<h1>Title</h1>")).toBe(true)
  })
})
