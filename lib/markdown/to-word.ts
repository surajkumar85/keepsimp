/**
 * A document written as a Word file (.docx) with the docx library: real
 * Word headings (so Word's own contents and navigation work), lists that
 * number themselves, tables, links, code in a fixed-width font, pictures
 * kept with the document, footnotes as Word's own footnotes and alerts as
 * marked quotes. What Word has no place for is kept as text and said:
 * maths stays as its TeX, and a diagram is its picture when the page drew
 * one, its text otherwise. Loaded only when a Word file is asked for.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx"
import type { Token } from "markdown-it"
import { markdownTokens } from "./render"

/** A picture the Word file can hold: its bytes, kind and size in pixels. */
export interface WordPicture {
  bytes: Uint8Array
  type: "png" | "jpg" | "gif" | "bmp"
  width: number
  height: number
}

export interface WordOptions {
  title?: string
  /** Pictures by the address the text gives them (`pictures/…`, or a `data:` address). */
  pictures?: ReadonlyMap<string, WordPicture>
  /** Diagrams drawn by the page, in the order they appear. */
  diagrams?: readonly (WordPicture | null)[]
}

/** The widest a picture is set, in pixels at 96 to the inch: the page between margins. */
export const PAGE_WIDTH = 600

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const

const MONO = "Consolas"

interface Marks {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  code?: boolean
}

/** A picture's size, no wider than the page. */
export function fitted(width: number, height: number) {
  if (width <= PAGE_WIDTH) return { width, height }
  return {
    width: PAGE_WIDTH,
    height: Math.round((height * PAGE_WIDTH) / width),
  }
}

class Writer {
  /** Footnotes by markdown-it's number, as Word's (which start at 1). */
  footnotes: Record<number, { children: Paragraph[] }> = {}
  private lists = 0
  private diagram = 0
  constructor(private options: WordOptions) {}

  picture(address: string, alt: string): ParagraphChild {
    const picture = this.options.pictures?.get(address.replace(/^\.\//, ""))
    if (!picture)
      return new TextRun({
        text: alt ? `[${alt}]` : "[picture]",
        italics: true,
      })
    return new ImageRun({
      type: picture.type,
      data: picture.bytes,
      transformation: fitted(picture.width, picture.height),
      altText: { name: alt || "Picture", description: alt, title: alt },
    })
  }

  /** The runs of a line of text, its marks kept. */
  inline(tokens: Token[], base: Marks = {}): ParagraphChild[] {
    const out: ParagraphChild[] = []
    const marks: Marks = { ...base }
    let link: { href: string; runs: ParagraphChild[] } | null = null
    const push = (child: ParagraphChild) => (link ? link.runs : out).push(child)
    const text = (value: string, extra: Marks = {}) => {
      const all = { ...marks, ...extra }
      push(
        new TextRun({
          text: value,
          bold: all.bold,
          italics: all.italics,
          strike: all.strike,
          ...(all.code
            ? {
                font: MONO,
                shading: {
                  type: ShadingType.CLEAR,
                  fill: "F2F2F2",
                  color: "auto",
                },
              }
            : {}),
          ...(link ? { style: "Hyperlink" } : {}),
        })
      )
    }
    for (const token of tokens) {
      switch (token.type) {
        case "text":
          text(token.content)
          break
        case "strong_open":
          marks.bold = true
          break
        case "strong_close":
          marks.bold = base.bold
          break
        case "em_open":
          marks.italics = true
          break
        case "em_close":
          marks.italics = base.italics
          break
        case "s_open":
          marks.strike = true
          break
        case "s_close":
          marks.strike = base.strike
          break
        case "code_inline":
          text(token.content, { code: true })
          break
        case "math_inline":
          text(token.content, { code: true, italics: true })
          break
        case "softbreak":
          text(" ")
          break
        case "hardbreak":
          push(new TextRun({ break: 1 }))
          break
        case "link_open": {
          const href = String(token.attrGet("href"))
          // Only addresses that lead somewhere outside are links in Word; the rest keep their words.
          link = /^(https?:|mailto:|tel:)/i.test(href)
            ? { href, runs: [] }
            : null
          break
        }
        case "link_close":
          if (link)
            out.push(
              new ExternalHyperlink({ link: link.href, children: link.runs })
            )
          link = null
          break
        case "image":
          push(this.picture(String(token.attrGet("src")), token.content))
          break
        case "footnote_ref":
          push(new FootnoteReferenceRun((token.meta as { id: number }).id + 1))
          break
        case "html_inline":
          // A task's box becomes a ticked or empty box; other tags are not words.
          if (/type="checkbox"/.test(token.content))
            // The space after it comes with the task's own words.
            text(/checked/.test(token.content) ? "☑" : "☐")
          break
        // Every other kind markdown-it makes holds no words of its own.
      }
    }
    return out
  }

  /** The blocks between `start` and the token that closes `start`'s block, as paragraphs and tables. */
  blocks(
    tokens: Token[],
    context: {
      indent?: number
      quote?: boolean
      list?: { ordered: boolean; level: number; instance: number }
    } = {}
  ): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = []
    const quote = context.quote
      ? {
          indent: { left: 360 + (context.indent ?? 0) },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: "BFBFBF",
              space: 8,
            },
          },
        }
      : context.indent
        ? { indent: { left: context.indent } }
        : {}
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      // markdown-it closes every block it opens.
      const close = (open: string, closing: string) => {
        let depth = 0
        for (let at = index; ; at++) {
          if (tokens[at].type === open) depth++
          else if (tokens[at].type === closing && --depth === 0) return at
        }
      }
      switch (token.type) {
        case "heading_open": {
          const level = Number(token.tag.slice(1))
          out.push(
            new Paragraph({
              heading: HEADINGS[level - 1],
              children: this.inline(tokens[index + 1].children!),
            })
          )
          index += 2
          break
        }
        case "paragraph_open": {
          const inline = tokens[index + 1]
          const children = this.inline(inline.children!)
          const paragraph: IParagraphOptions = context.list
            ? context.list.ordered
              ? {
                  numbering: {
                    reference: "numbers",
                    level: context.list.level,
                    instance: context.list.instance,
                  },
                }
              : { bullet: { level: context.list.level } }
            : {}
          out.push(new Paragraph({ ...paragraph, ...quote, children }))
          // Only the first paragraph of a list item carries its mark.
          if (context.list)
            context = {
              ...context,
              list: undefined,
              indent: 720 * (context.list.level + 1),
            }
          index += 2
          break
        }
        case "bullet_list_open":
        case "ordered_list_open": {
          const end = close(token.type, token.type.replace("_open", "_close"))
          const ordered = token.type === "ordered_list_open"
          const level = context.list
            ? context.list.level + 1
            : (context.indent ?? 0) / 720
          const instance = ++this.lists
          // Each item: its own blocks, the first paragraph numbered or bulleted.
          let at = index + 1
          while (at < end) {
            let itemEnd = at
            for (let depth = 0; ; itemEnd++) {
              if (tokens[itemEnd].type === "list_item_open") depth++
              else if (
                tokens[itemEnd].type === "list_item_close" &&
                --depth === 0
              )
                break
            }
            const item = tokens.slice(at + 1, itemEnd)
            out.push(
              ...this.blocks(item, {
                ...context,
                list: { ordered, level: Math.min(level, 8), instance },
              })
            )
            at = itemEnd + 1
          }
          index = end
          break
        }
        case "blockquote_open": {
          const end = close("blockquote_open", "blockquote_close")
          out.push(
            ...this.blocks(tokens.slice(index + 1, end), {
              ...context,
              quote: true,
            })
          )
          index = end
          break
        }
        case "alert_open": {
          const end = close("alert_open", "alert_close")
          const kind = token.markup
          out.push(
            new Paragraph({
              ...{
                indent: { left: 360 },
                border: {
                  left: {
                    style: BorderStyle.SINGLE,
                    size: 12,
                    color: "BFBFBF",
                    space: 8,
                  },
                },
              },
              children: [
                new TextRun({
                  text: kind.charAt(0).toUpperCase() + kind.slice(1),
                  bold: true,
                }),
              ],
            })
          )
          out.push(
            ...this.blocks(tokens.slice(index + 2, end), {
              ...context,
              quote: true,
            })
          )
          index = end
          break
        }
        case "fence":
        case "code_block": {
          const language = token.info.trim().split(/\s+/)[0].toLowerCase()
          if (language === "mermaid") {
            const drawn = this.options.diagrams?.[this.diagram++]
            if (drawn) {
              out.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      type: drawn.type,
                      data: drawn.bytes,
                      transformation: fitted(drawn.width, drawn.height),
                      altText: {
                        name: "Diagram",
                        description: "Diagram",
                        title: "Diagram",
                      },
                    }),
                  ],
                })
              )
              break
            }
          }
          const lines = token.content.replace(/\n$/, "").split("\n")
          for (const line of lines)
            out.push(
              new Paragraph({
                ...quote,
                spacing: { after: 0 },
                shading: {
                  type: ShadingType.CLEAR,
                  fill: "F2F2F2",
                  color: "auto",
                },
                children: [
                  new TextRun({
                    text: line || " ",
                    font: MONO,
                    size: 20,
                    italics: language === "math",
                  }),
                ],
              })
            )
          out.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
          break
        }
        case "math_block":
          out.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: token.content, font: MONO, italics: true }),
              ],
            })
          )
          break
        case "hr":
          out.push(
            new Paragraph({
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 6,
                  color: "BFBFBF",
                  space: 1,
                },
              },
              children: [],
            })
          )
          break
        case "table_open": {
          const end = close("table_open", "table_close")
          const rows: TableRow[] = []
          let cells: TableCell[] = []
          let header = false
          for (let at = index + 1; at < end; at++) {
            const one = tokens[at]
            if (one.type === "thead_open") header = true
            else if (one.type === "thead_close") header = false
            else if (one.type === "tr_close") {
              rows.push(new TableRow({ tableHeader: header, children: cells }))
              cells = []
            } else if (one.type === "th_open" || one.type === "td_open") {
              const style = String(one.attrGet("style") ?? "")
              const alignment = /right/.test(style)
                ? AlignmentType.RIGHT
                : /center/.test(style)
                  ? AlignmentType.CENTER
                  : AlignmentType.LEFT
              cells.push(
                new TableCell({
                  children: [
                    new Paragraph({
                      alignment,
                      children: this.inline(tokens[at + 1].children!, {
                        bold: one.type === "th_open",
                      }),
                    }),
                  ],
                })
              )
            }
          }
          out.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows,
            })
          )
          out.push(new Paragraph({ children: [] }))
          index = end
          break
        }
        case "footnote_block_open": {
          const end = close("footnote_block_open", "footnote_block_close")
          // The block is footnotes one after another, each open to close.
          for (let at = index + 1; at < end; at++) {
            const id = (tokens[at].meta as { id: number }).id
            let last = at
            while (tokens[last].type !== "footnote_close") last++
            const body = tokens
              .slice(at + 1, last)
              .filter((one) => one.type !== "footnote_anchor")
            this.footnotes[id + 1] = {
              children: this.blocks(body).filter(
                (one): one is Paragraph => one instanceof Paragraph
              ),
            }
            at = last
          }
          index = end
          break
        }
        case "html_block": {
          const words = token.content.replace(/<[^>]*>/g, "").trim()
          if (words)
            out.push(
              new Paragraph({ ...quote, children: [new TextRun(words)] })
            )
          break
        }
        // Closing tokens of what was handled above, and anything Word has no place for.
        default:
          break
      }
    }
    return out
  }
}

/** The document as a Word file. */
export async function markdownToWord(
  text: string,
  options: WordOptions = {}
): Promise<Blob> {
  const { tokens, frontMatter } = markdownTokens(text)
  const writer = new Writer(options)
  const children = writer.blocks(tokens)
  const front = frontMatter?.ok ? Object.fromEntries(frontMatter.entries) : {}
  const document = new Document({
    title: options.title ?? front.title,
    creator: front.author,
    description: front.description,
    footnotes: writer.footnotes,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    numbering: {
      config: [
        {
          reference: "numbers",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [
              LevelFormat.DECIMAL,
              LevelFormat.LOWER_LETTER,
              LevelFormat.LOWER_ROMAN,
            ][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } },
            },
          })),
        },
      ],
    },
    sections: [{ children: children.length ? children : [new Paragraph("")] }],
  })
  return Packer.toBlob(document)
}
