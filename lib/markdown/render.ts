/**
 * Markdown made into the HTML the preview, exports and copies show:
 * CommonMark with GitHub's additions (tables, task lists, strikethrough,
 * autolinks, footnotes, alerts, heading anchors by GitHub's rules), front
 * matter read as YAML and shown as a table, and every block marked with
 * the source line it came from. The HTML is always cleaned (`clean`)
 * before it is used.
 */
import MarkdownIt, { type Token } from "markdown-it"
import footnote from "markdown-it-footnote"
import taskLists from "markdown-it-task-lists"
import frontMatter from "markdown-it-front-matter"
import anchor from "markdown-it-anchor"
import { alert } from "@mdit/plugin-alert"
import { slug } from "github-slugger"
import { parse as parseYaml } from "yaml"
import { clean } from "./clean"

export interface RenderOptions {
  /** Curly quotes, dashes and ellipses in the HTML; the text is not changed. */
  typographer: boolean
  /** Pictures from other sites are shown; off, they are left out and said. */
  remoteImages: boolean
}

export const defaultRenderOptions: RenderOptions = {
  typographer: false,
  remoteImages: true,
}

export interface Heading {
  level: number
  text: string
  /** Its anchor, as GitHub makes them: `#getting-started`. */
  id: string
  /** The line of the source it starts on, from 0. */
  line: number
}

export interface Rendered {
  /** Cleaned HTML of the body. */
  html: string
  headings: Heading[]
  /** Front matter as read, or null when the document has none. */
  frontMatter: FrontMatter | null
  /** How many pictures from other sites were left out. */
  blockedImages: number
  /** The words as read, without their marks: for counting. */
  plain: string
}

export type FrontMatter =
  | { ok: true; entries: [string, string][] }
  | { ok: false; text: string; problem: string }

/** The text of a heading's inline token, without its marks. */
function plainText(token: Token) {
  return token
    .children!.filter(
      (child) => child.type === "text" || child.type === "code_inline"
    )
    .map((child) => child.content)
    .join("")
}

/** A value of front matter in a line: lists joined, objects as YAML-ish JSON. */
function valueSaid(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.map(valueSaid).join(", ")
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/** Front matter read as YAML: a mapping becomes rows, anything else is said as a problem. */
export function readFrontMatter(text: string): FrontMatter {
  try {
    const value: unknown = parseYaml(text, { maxAliasCount: 50 })
    if (value === null || value === undefined) return { ok: true, entries: [] }
    if (typeof value !== "object" || Array.isArray(value))
      return {
        ok: false,
        text,
        problem: "Front matter should be a list of names and values.",
      }
    return {
      ok: true,
      entries: Object.entries(value).map(([key, item]) => [
        key,
        valueSaid(item),
      ]),
    }
  } catch (error) {
    return {
      ok: false,
      text,
      problem: `Front matter could not be read: ${(error as Error).message.split("\n")[0]}`,
    }
  }
}

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/** Front matter as the preview shows it: a table of names and values, or the text with what is wrong. */
export function frontMatterHtml(front: FrontMatter) {
  if (!front.ok)
    return `<div class="front-matter" data-source-line="0"><p class="front-matter-problem">${escape(front.problem)}</p><pre><code>${escape(front.text)}</code></pre></div>`
  if (!front.entries.length) return ""
  const rows = front.entries
    .map(
      ([key, value]) =>
        `<tr><th scope="row">${escape(key)}</th><td>${escape(value)}</td></tr>`
    )
    .join("")
  return `<table class="front-matter" data-source-line="0"><caption>Front matter</caption><tbody>${rows}</tbody></table>`
}

/** A markdown-it set up as the preview needs it, for one set of options. */
function makeParser(options: RenderOptions, found: { front: string | null }) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: options.typographer,
  })
    .enable(["table", "strikethrough"])
    .use(footnote)
    .use(taskLists, { enabled: false, label: true })
    .use(frontMatter, (text: string) => {
      found.front = text
    })
    .use(alert, { deep: true })
    .use(anchor, {
      slugify: (text: string) => slug(text),
      // GitHub's second "Install" is "install-1".
      uniqueSlugStartIndex: 1,
    })
  // Every block says the line it starts on, for scrolling the two sides together.
  md.core.ruler.push("source_lines", (state) => {
    for (const token of state.tokens)
      if (token.map && token.nesting !== -1 && token.level === 0)
        token.attrSet("data-source-line", String(token.map[0]))
  })
  return md
}

/** The document made into cleaned HTML, with its headings and front matter. */
export function renderMarkdown(
  text: string,
  options: RenderOptions = defaultRenderOptions
): Rendered {
  // Nothing to draw (and nothing to clean, which needs a browser).
  if (!text.trim())
    return {
      html: "",
      headings: [],
      frontMatter: null,
      blockedImages: 0,
      plain: "",
    }
  const found: { front: string | null } = { front: null }
  const md = makeParser(options, found)
  const tokens = md.parse(text, {})
  const headings: Heading[] = []
  tokens.forEach((token, index) => {
    if (token.type !== "heading_open") return
    headings.push({
      level: Number(token.tag.slice(1)),
      text: plainText(tokens[index + 1]),
      // A heading always has its anchor and its place in the source.
      id: String(token.attrGet("id")),
      line: token.map![0],
    })
  })
  const plain = tokens
    .filter(
      (token) =>
        token.type === "inline" ||
        token.type === "fence" ||
        token.type === "code_block"
    )
    .map((token) =>
      token.type === "inline" ? plainText(token) : token.content
    )
    .join("\n")
  const body = md.renderer.render(tokens, md.options, {})
  const front = found.front === null ? null : readFrontMatter(found.front)
  const cleaned = clean(
    (front ? frontMatterHtml(front) : "") + body,
    options.remoteImages
  )
  return {
    html: cleaned.html,
    headings,
    frontMatter: front,
    blockedImages: cleaned.blockedImages,
    plain,
  }
}
