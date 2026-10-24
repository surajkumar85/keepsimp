/**
 * The Markdown editor's jobs as tools, made by the editor's own code: the
 * renderer and its cleaning, the HTML and Word readers, the Word writer,
 * the table maker, the document check and Prettier's tidying. The page
 * hands in what needs a browser to draw (maths and diagrams) and the Word
 * file with its diagrams as pictures, so agents get what the page gives.
 */
import {
  exportedBody,
  LARGEST_FILE,
  standaloneHtml,
} from "@/lib/markdown/document"
import { renderMarkdown } from "@/lib/markdown/render"
import { statsOf } from "@/lib/markdown/stats"
import { tableFromCells, tableFromTabs } from "@/lib/markdown/tables"
import type { FileStore } from "./files"
import { asTool, ToolError, type AgentTool, type FileRef } from "./registry"
import { textOrFile, wordsMade, wordsOf } from "./text"

export interface MarkdownEngines {
  /** The preview's HTML with its maths, diagrams and code drawn. */
  enrich: (
    html: string,
    needs: ReturnType<typeof renderMarkdown>["needs"]
  ) => Promise<string>
  /** The document as a Word file, its diagrams as pictures. */
  word: (text: string, title: string) => Promise<Blob>
}

const most = LARGEST_FILE

const MARKDOWN_FILE = { extension: "md", type: "text/markdown" }

const markdown = (input: Record<string, unknown>, files: FileStore) =>
  wordsOf(input, files, { what: "the Markdown", most })

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

/** The result of a job that makes Markdown: the sentence, and the words or their file. */
function madeMarkdown(
  files: FileStore,
  words: string,
  from: string | null,
  suffix: string,
  said: string,
  data: Record<string, unknown> = {}
) {
  const { file, inline } = wordsMade(files, words, {
    from,
    suffix,
    ...MARKDOWN_FILE,
  })
  return {
    summary: file ? `${said} Written to ${file.name}.` : said,
    files: file ? [file] : [],
    data: { ...data, ...(inline !== undefined ? { markdown: inline } : {}) },
  }
}

export function markdownTools(engines: MarkdownEngines): AgentTool[] {
  const toHtml: AgentTool<{
    text?: string
    file?: string
    title?: string
    standalone?: boolean
    typographer?: boolean
  }> = {
    name: "markdown_to_html",
    title: "Markdown to HTML",
    description:
      "Turns Markdown (GitHub's: tables, task lists, footnotes, alerts, maths, Mermaid diagrams) into HTML, cleaned so nothing in it runs. A web page that stands alone by default, or the body alone.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The Markdown"),
        title: {
          type: "string",
          maxLength: 200,
          description: "The page's title; its first heading if not given.",
        },
        standalone: {
          type: "boolean",
          description:
            "A whole web page with its look written in (the default), or false for the body alone.",
        },
        typographer: {
          type: "boolean",
          description:
            "Curly quotes, dashes and ellipses in the HTML. Off by default.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await markdown(input, files)
      const rendered = renderMarkdown(words, {
        typographer: input.typographer ?? false,
        remoteImages: true,
      })
      const body = exportedBody(
        await engines.enrich(rendered.html, rendered.needs)
      )
      const title =
        input.title ?? rendered.headings[0]?.text ?? from ?? "Document"
      const html =
        input.standalone === false ? body : standaloneHtml(title, body)
      const { file, inline } = wordsMade(files, html, {
        from,
        // page.md becomes page.html; words given as text become page.html.
        suffix: from ? "" : "page",
        extension: "html",
        type: "text/html",
      })
      return {
        summary: `Made ${input.standalone === false ? "the HTML" : "a web page"} of ${plural(rendered.headings.length, "heading")}; anything that could run was taken out.${file ? ` Written to ${file.name}.` : ""}`,
        files: file ? [file] : [],
        data: {
          headings: rendered.headings,
          ...(inline !== undefined ? { html: inline } : {}),
        },
      }
    },
  }

  const toWord: AgentTool<{ text?: string; file?: string; title?: string }> = {
    name: "markdown_to_word",
    title: "Markdown to Word",
    description:
      "Turns Markdown into a Word file (.docx) with Word's own headings, numbered lists, tables, links and footnotes. Maths stays as its TeX; diagrams become pictures.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The Markdown"),
        title: {
          type: "string",
          maxLength: 200,
          description:
            "The document's title in Word; its first heading if not given.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await markdown(input, files)
      const rendered = renderMarkdown(words)
      const title =
        input.title ?? rendered.headings[0]?.text ?? from ?? "Document"
      const blob = await engines.word(words, title)
      const ref: FileRef = files.add(
        new Blob([blob], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        `${(from ?? title).replace(/\.[^.]*$/, "")}.docx`,
        "made"
      )
      return {
        summary: `Made a Word file of ${plural(rendered.headings.length, "heading")}: ${ref.name}.${rendered.needs.math ? " Maths is kept as its TeX." : ""}`,
        files: [ref],
      }
    },
  }

  const fromHtml: AgentTool<{ text?: string; file?: string }> = {
    name: "html_to_markdown",
    title: "HTML to Markdown",
    description:
      "Turns HTML (a page, a part of one, or what Google Docs or Word put on the clipboard) into Markdown: headings, lists, links, emphasis, tables and code blocks.",
    inputSchema: {
      type: "object",
      properties: { ...textOrFile("The HTML") },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await wordsOf(input, files, {
        what: "the HTML",
        most,
      })
      const { htmlToMarkdown } = await import("@/lib/markdown/from-html")
      const out = htmlToMarkdown(words)
      return madeMarkdown(
        files,
        out,
        from,
        from ? "" : "converted",
        `Made ${plural(statsOf(out).words, "word")} of Markdown.`
      )
    },
  }

  const fromWord: AgentTool<{ file: string }> = {
    name: "word_to_markdown",
    title: "Word to Markdown",
    description:
      "Turns a Word file (.docx) into Markdown with its headings, lists, tables, links and pictures. The pictures come back as files, named as the Markdown names them.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "The Word file (its id).",
          "x-keepsimp": "file",
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const held = files.get(input.file)
      if (held.blob.size > most)
        throw new ToolError(`${held.ref.name} is larger than 20 MB.`)
      const { wordToMarkdown } = await import("@/lib/markdown/from-word")
      let read
      try {
        read = await wordToMarkdown(await held.blob.arrayBuffer())
      } catch (error) {
        throw new ToolError(
          `${held.ref.name} could not be read as a Word file: ${(error as Error).message}`
        )
      }
      const name = held.ref.name.replace(/\.[^.]*$/, "")
      const markdownFile = files.add(
        new Blob([read.markdown], { type: "text/markdown" }),
        `${name}.md`,
        "made"
      )
      const pictures = read.pictures.map((picture) =>
        files.add(
          new Blob([picture.bytes as BlobPart], { type: picture.type }),
          picture.name.replace("/", "-"),
          "made"
        )
      )
      return {
        summary: `Made ${markdownFile.name}${pictures.length ? ` and ${plural(pictures.length, "picture")}` : ""}.${read.notes.length ? ` ${plural(read.notes.length, "thing")} had no place in Markdown and ${read.notes.length === 1 ? "was" : "were"} left out.` : ""}`,
        files: [markdownFile, ...pictures],
        data: {
          notes: read.notes,
          // What each picture is called in the Markdown, and the file it came back as.
          pictures: read.pictures.map((picture, index) => ({
            named: picture.name,
            file: pictures[index].id,
          })),
        },
      }
    },
  }

  const table: AgentTool<{ rows?: string[][]; tsv?: string }> = {
    name: "markdown_table",
    title: "Make a Markdown table",
    description:
      "Makes a GitHub Markdown table with its pipes lined up, from rows of cells (the first row is the header) or from tab-separated text copied out of a spreadsheet.",
    inputSchema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 1000,
          items: {
            type: "array",
            maxItems: 100,
            items: { type: "string", maxLength: 10000 },
          },
          description: "Rows of cells; the first is the header.",
        },
        tsv: {
          type: "string",
          maxLength: 1_000_000,
          description:
            "Lines of tab-separated cells, as a spreadsheet copies them.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input) {
      if ((input.rows === undefined) === (input.tsv === undefined))
        throw new ToolError('Give the cells either as "rows" or as "tsv".')
      const made = input.rows
        ? tableFromCells(input.rows)
        : tableFromTabs(input.tsv!)
      if (made === null)
        throw new ToolError(
          "The text is not cells: it needs two lines or more, each with a tab between cells."
        )
      const lines = made.split("\n")
      return {
        summary: `Made a table of ${plural(lines.length - 2, "row")} under its header.`,
        data: { markdown: made },
      }
    },
  }

  const check: AgentTool<{ text?: string; file?: string; fix?: boolean }> = {
    name: "check_markdown",
    title: "Check Markdown",
    description:
      "Checks Markdown with markdownlint's rules (headings that skip a level, links to headings that are not there, pictures without words and more), counts its words and estimates how easy English text is to read. With fix, gives back the text with every fixable finding fixed.",
    inputSchema: {
      type: "object",
      properties: {
        ...textOrFile("The Markdown"),
        fix: {
          type: "boolean",
          description: "Give back the text with what can be fixed fixed.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await markdown(input, files)
      const [{ checkDocument, fixAll }, { readabilityOf }] = await Promise.all([
        import("@/lib/markdown/check"),
        import("@/lib/markdown/readability"),
      ])
      const issues = checkDocument(words)
      const plain = renderMarkdown(words).plain
      const found = {
        issues: issues.map(({ line, rule, said, detail, fixable }) => ({
          line,
          rule,
          said,
          detail,
          fixable,
        })),
        stats: statsOf(plain),
        readability: readabilityOf(plain),
      }
      const said = issues.length
        ? `${plural(issues.length, "finding")}, ${issues.filter((one) => one.fixable).length} of them fixable.`
        : "Nothing to fix."
      if (!input.fix) return { summary: said, data: found }
      const fixed = fixAll(words)
      return madeMarkdown(
        files,
        fixed,
        from,
        "-checked",
        `${said} ${fixed === words ? "Nothing was changed." : "Fixed what could be fixed."}`,
        found
      )
    },
  }

  const tidy: AgentTool<{ text?: string; file?: string }> = {
    name: "tidy_markdown",
    title: "Tidy Markdown",
    description:
      "Tidies Markdown with Prettier: lists, emphasis, tables and spacing written one way. Lines keep their wrapping.",
    inputSchema: {
      type: "object",
      properties: { ...textOrFile("The Markdown") },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files }) {
      const { words, from } = await markdown(input, files)
      const { tidyMarkdown } = await import("@/lib/markdown/tidy")
      const out = await tidyMarkdown(words)
      return madeMarkdown(
        files,
        out,
        from,
        "-tidy",
        out === words ? "It was tidy already." : "Tidied."
      )
    },
  }

  return [
    asTool(toHtml),
    asTool(toWord),
    asTool(fromHtml),
    asTool(fromWord),
    asTool(table),
    asTool(check),
    asTool(tidy),
  ]
}
