/**
 * HTML made into Markdown: what is pasted from a web page, Google Docs or
 * Word, and HTML files opened in the editor. Turndown does the work, with
 * rules for what those sources write: Google Docs' bold and italic spans
 * and the bold wrapper it puts round everything, tables of every kind
 * (written as GitHub tables, the first row as the header), and code blocks
 * that name their language.
 */
import TurndownService from "turndown"
import { taskListItems } from "turndown-plugin-gfm"
import { tableFromCells } from "./tables"

/** Tags that carry formatting: HTML without any of them is pasted as the plain text that came with it. */
const FORMATTING =
  /<(h[1-6]|strong|em|b|i|u|a|ul|ol|li|table|img|blockquote|pre|code|del|s|strike|hr)[\s>/]/i

/** Whether pasted HTML holds formatting worth keeping; code editors copy bare spans and lines. */
export const hasFormatting = (html: string) => FORMATTING.test(html)

function styleOf(node: HTMLElement) {
  return (node.getAttribute("style") ?? "").toLowerCase().replace(/\s+/g, "")
}

let service: TurndownService | null = null

function make() {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
  })
  turndown.use(taskListItems)
  turndown.addRule("strikethrough", {
    filter: (node) => ["DEL", "S", "STRIKE"].includes(node.nodeName),
    replacement: (content) => `~~${content}~~`,
  })
  // "- item" and "1. item", as people write them, not Turndown's wider padding.
  turndown.addRule("list-items", {
    filter: "li",
    replacement: (content, node) => {
      const parent = node.parentNode as HTMLElement
      let prefix = "- "
      if (parent.nodeName === "OL") {
        const start = Number(parent.getAttribute("start") ?? 1)
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `
      }
      const body = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/gm, `\n${" ".repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "")
    },
  })
  turndown.remove(["style", "script", "meta", "title", "head", "noscript"])
  // Google Docs wraps a whole copy in <b style="font-weight:normal">: not bold at all.
  turndown.addRule("docs-wrapper", {
    filter: (node) =>
      node.nodeName === "B" && /font-weight:(normal|400)/.test(styleOf(node)),
    replacement: (content) => content,
  })
  // Google Docs marks bold, italic and struck words with styles on spans.
  turndown.addRule("styled-spans", {
    filter: (node) =>
      node.nodeName === "SPAN" &&
      /font-weight:(bold|[6-9]00)|font-style:italic|line-through/.test(
        styleOf(node)
      ),
    // Turndown has already taken the spaces at the edges outside.
    replacement: (content, node) => {
      const style = styleOf(node as HTMLElement)
      let out = content
      if (/line-through/.test(style)) out = `~~${out}~~`
      if (/font-style:italic/.test(style)) out = `_${out}_`
      if (/font-weight:(bold|[6-9]00)/.test(style)) out = `**${out}**`
      return out
    },
  })
  // Every table as a GitHub table, its first row the header; the cells keep their own marks.
  turndown.addRule("tables", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).rows).map((row) =>
        Array.from(row.cells).map((cell) =>
          turndown.turndown(cell.innerHTML).replace(/\n+/g, " ").trim()
        )
      )
      // A header is bold already: a mark round a whole header cell says nothing more.
      if (rows.length)
        rows[0] = rows[0].map((cell) => cell.replace(/^\*\*(.+)\*\*$/, "$1"))
      // An empty table says nothing.
      return rows.length ? `\n\n${tableFromCells(rows)}\n\n` : ""
    },
  })
  // A block of code keeps the language its class names.
  turndown.addRule("fenced-language", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      node.firstChild?.nodeName === "CODE" &&
      /language-|lang-/.test((node.firstChild as HTMLElement).className),
    replacement: (_content, node) => {
      const code = node.firstChild as HTMLElement
      const language = /(?:language|lang)-([\w+#-]+)/.exec(code.className)![1]
      // An element always has its text, empty or not.
      const text = code.textContent!
      const fence = text.includes("```") ? "~~~" : "```"
      return `\n\n${fence}${language}\n${text.replace(/\n$/, "")}\n${fence}\n\n`
    },
  })
  return turndown
}

/** HTML as Markdown. Blank lines are kept to one between blocks, and the text ends without them. */
export function htmlToMarkdown(html: string): string {
  service ??= make()
  return service
    .turndown(html)
    .replace(/ /g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
