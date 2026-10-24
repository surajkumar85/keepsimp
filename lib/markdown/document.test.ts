import { describe, expect, it } from "vitest"
import {
  baseName,
  DOCUMENT_CSS,
  exportedBody,
  fileName,
  isMarkdownFile,
  standaloneHtml,
} from "./document"
import { ariaKeys, keyLabel, keyOf, SHORTCUTS } from "./shortcuts"

describe("names", () => {
  it("keeps a file's own name and changes its extension", () => {
    expect(baseName("notes.md")).toBe("notes")
    expect(baseName(".hidden")).toBe(".hidden")
    expect(fileName("notes.final.md", "Title", "html")).toBe("notes.final.html")
  })

  it("makes a name from the first heading, or calls it untitled", () => {
    expect(fileName(null, "Café plans: 2026!", "md")).toBe("café-plans-2026.md")
    expect(fileName(null, "***", "md")).toBe("untitled.md")
    expect(fileName(null, undefined, "pdf")).toBe("untitled.pdf")
  })

  it("knows Markdown files by kind or by name", () => {
    expect(isMarkdownFile({ name: "a.MD", type: "" })).toBe(true)
    expect(isMarkdownFile({ name: "a", type: "text/markdown" })).toBe(true)
    expect(isMarkdownFile({ name: "a", type: "text/x-markdown" })).toBe(true)
    expect(isMarkdownFile({ name: "notes.txt", type: "text/plain" })).toBe(true)
    expect(isMarkdownFile({ name: "photo.png", type: "image/png" })).toBe(false)
  })
})

describe("exported pages", () => {
  it("stand alone, with their look written in and the title escaped", () => {
    const page = standaloneHtml("A <b> & c", "<p>Hi</p>")
    expect(page).toMatch(/^<!doctype html>/)
    expect(page).toContain("<title>A &lt;b&gt; &amp; c</title>")
    expect(page).toContain(`<style>${DOCUMENT_CSS}</style>`)
    expect(page).toContain("<p>Hi</p>")
    expect(page).not.toMatch(/<link|<script|src="http/)
  })

  it("leave out the editor's line marks", () => {
    expect(exportedBody('<p data-source-line="12">a</p>')).toBe("<p>a</p>")
  })
})

describe("shortcuts", () => {
  it("are listed once each, with GitHub's keys", () => {
    expect(new Set(SHORTCUTS.map((one) => one.key)).size).toBe(SHORTCUTS.length)
    expect(new Set(SHORTCUTS.map((one) => one.command)).size).toBe(
      SHORTCUTS.length
    )
    expect(keyOf("link")).toBe("Mod-k")
    expect(keyOf("bold")).toBe("Mod-b")
  })

  it("are shown as each device writes them", () => {
    expect(keyLabel("Mod-Shift-x", true)).toBe("⌘⇧X")
    expect(keyLabel("Mod-Alt-1", false)).toBe("Ctrl+Alt+1")
    expect(ariaKeys("Mod-Shift-x", true)).toBe("Meta+Shift+X")
    expect(ariaKeys("Mod-b", false)).toBe("Control+B")
  })
})
