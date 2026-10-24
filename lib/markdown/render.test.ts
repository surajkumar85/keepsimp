import { describe, expect, it } from "vitest"
import { clean } from "./clean"
import { frontMatterHtml, readFrontMatter, renderMarkdown } from "./render"

describe("renderMarkdown", () => {
  it("draws nothing for an empty document", () => {
    expect(renderMarkdown("  \n")).toEqual({
      html: "",
      headings: [],
      frontMatter: null,
      blockedImages: 0,
      plain: "",
    })
  })

  it("draws GitHub's Markdown: tables, tasks, strikethrough, autolinks, footnotes, alerts", () => {
    const { html } = renderMarkdown(
      [
        "| a | b |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "- [x] done",
        "- [ ] to do",
        "",
        "~~gone~~ and https://example.com",
        "",
        "A note[^1].",
        "",
        "[^1]: The note.",
        "",
        "> [!WARNING]",
        "> Careful.",
      ].join("\n")
    )
    expect(html).toContain('<table data-source-line="0" tabindex="0">')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("checked")
    expect(html).toContain("<s>gone</s>")
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('class="footnotes"')
    expect(html).toContain("markdown-alert-warning")
  })

  it("gives headings GitHub's anchors and lists them with their lines", () => {
    const rendered = renderMarkdown(
      "# Getting started\n\ntext\n\n## Install\n\n## Install\n\n### `npm` it!"
    )
    expect(rendered.headings).toEqual([
      { level: 1, text: "Getting started", id: "getting-started", line: 0 },
      { level: 2, text: "Install", id: "install", line: 4 },
      { level: 2, text: "Install", id: "install-1", line: 6 },
      { level: 3, text: "npm it!", id: "npm-it", line: 8 },
    ])
    expect(rendered.html).toContain('id="getting-started"')
  })

  it("marks each top-level block with the line it starts on", () => {
    const { html } = renderMarkdown("one\n\ntwo\nlines\n\n- a\n- b")
    expect(html).toContain('<p data-source-line="0">one</p>')
    expect(html).toContain('<p data-source-line="2">two')
    expect(html).toContain('<ul data-source-line="5">')
  })

  it("makes quotes and dashes curly only when asked", () => {
    expect(renderMarkdown('"Hi" -- you...').html).toContain('"Hi" -- you...')
    expect(
      renderMarkdown('"Hi" -- you...', {
        typographer: true,
        remoteImages: true,
      }).html
    ).toContain("“Hi” – you…")
  })

  it("shows front matter as a table and not as text", () => {
    const rendered = renderMarkdown(
      "---\ntitle: Notes\ntags: [a, b]\ndate: 2026-10-24\n---\n# Body"
    )
    expect(rendered.frontMatter).toEqual({
      ok: true,
      entries: [
        ["title", "Notes"],
        ["tags", "a, b"],
        ["date", "2026-10-24"],
      ],
    })
    expect(rendered.html).toContain("<caption>Front matter</caption>")
    expect(rendered.html).not.toContain("title: Notes")
    expect(renderMarkdown("# None").frontMatter).toBeNull()
  })

  it("takes out anything that could run", () => {
    const { html } = renderMarkdown(
      [
        "<script>alert(1)</script>",
        '<img src="x.png" onerror="alert(2)">',
        "[click](javascript:alert(3))",
        '<a href="data:text/html,hi">data</a>',
        '<iframe src="https://example.com"></iframe>',
        '<p style="color:red">styled</p>',
        "<form><button>Go</button></form>",
      ].join("\n\n")
    )
    expect(html).not.toMatch(
      /<script|onerror|href="javascript|data:text|iframe|style=|<form|<button/
    )
    expect(html).toContain("styled")
  })

  it("keeps safe links and relative paths", () => {
    const { html } = renderMarkdown(
      "[a](#top) [b](./other.md) [c](mailto:me@example.com) [d](tel:+441234) [e](/docs/) [f](notes.md)"
    )
    for (const href of [
      "#top",
      "./other.md",
      "mailto:me@example.com",
      "tel:+441234",
      "/docs/",
      "notes.md",
    ])
      expect(html).toContain(`href="${href}"`)
  })

  it("leaves remote pictures out when asked, and counts them", () => {
    const text =
      '![far](https://example.com/a.png) ![near](./b.png) <img alt="none">'

    const shown = renderMarkdown(text)
    expect(shown.html).toContain('src="https://example.com/a.png"')
    expect(shown.html).toContain('referrerpolicy="no-referrer"')
    expect(shown.blockedImages).toBe(0)
    const kept = renderMarkdown(text, {
      typographer: false,
      remoteImages: false,
    })
    expect(kept.html).not.toContain(' src="https://example.com/a.png"')
    expect(kept.html).toContain('data-blocked-src="https://example.com/a.png"')
    expect(kept.html).toContain('src="./b.png"')
    expect(kept.blockedImages).toBe(1)
  })
})

describe("front matter", () => {
  it("reads values of every kind", () => {
    expect(readFrontMatter("")).toEqual({ ok: true, entries: [] })
    expect(readFrontMatter("a:\nb: {c: 1}\nd: true")).toEqual({
      ok: true,
      entries: [
        ["a", ""],
        ["b", '{"c":1}'],
        ["d", "true"],
      ],
    })
  })

  it("says what is wrong when it is not a mapping or not YAML", () => {
    expect(readFrontMatter("- a\n- b")).toMatchObject({
      ok: false,
      problem: "Front matter should be a list of names and values.",
    })
    expect(readFrontMatter("a: [")).toMatchObject({
      ok: false,
      problem: expect.stringContaining("could not be read"),
    })
  })

  it("escapes what it draws", () => {
    expect(frontMatterHtml({ ok: true, entries: [] })).toBe("")
    expect(
      frontMatterHtml({ ok: true, entries: [["<b>", '"x" & y']] })
    ).toContain("&lt;b&gt;</th><td>&quot;x&quot; &amp; y")
    expect(
      frontMatterHtml({ ok: false, text: "<i>", problem: "Bad" })
    ).toContain("<code>&lt;i&gt;</code>")
  })
})

describe("clean", () => {
  it("counts nothing when no pictures are left out", () => {
    expect(clean("<p>hi</p>")).toEqual({ html: "<p>hi</p>", blockedImages: 0 })
  })
})
