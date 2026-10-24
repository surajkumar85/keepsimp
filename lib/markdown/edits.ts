/**
 * What the toolbar and the keys do to the text: each a pure function of
 * the document and the selection, giving one change and where the
 * selection lands after it, so the editor can apply it as one step to
 * undo. Markdown is written as GitHub writes it.
 */

export interface Range {
  from: number
  to: number
}

/** Replace `from`–`to` with `insert`; then select `anchor`–`head` in the new text. */
export interface Edit {
  from: number
  to: number
  insert: string
  anchor: number
  head: number
}

export type InlineMark = "bold" | "italic" | "code" | "strike"

const MARKS: Record<InlineMark, { marker: string; placeholder: string }> = {
  bold: { marker: "**", placeholder: "bold text" },
  italic: { marker: "_", placeholder: "italic text" },
  code: { marker: "`", placeholder: "code" },
  strike: { marker: "~~", placeholder: "struck text" },
}

/** Wraps the selection in a mark, or takes the mark away when it is already there. */
export function toggleMark(
  doc: string,
  { from, to }: Range,
  mark: InlineMark
): Edit {
  const { marker, placeholder } = MARKS[mark]
  const size = marker.length
  const selected = doc.slice(from, to)
  // The marks sit just outside the selection: take them away.
  if (
    doc.slice(from - size, from) === marker &&
    doc.slice(to, to + size) === marker
  )
    return {
      from: from - size,
      to: to + size,
      insert: selected,
      anchor: from - size,
      head: to - size,
    }
  // The selection holds its marks: take them away.
  if (
    selected.length >= size * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(size, -size)
    return { from, to, insert: inner, anchor: from, head: from + inner.length }
  }
  const text = selected || placeholder
  return {
    from,
    to,
    insert: `${marker}${text}${marker}`,
    anchor: from + size,
    head: from + size + text.length,
  }
}

const URL = /^(?:https?:\/\/|mailto:)\S+$/i

/** A link around the selection; a selected address becomes the link's target. */
export function insertLink(doc: string, { from, to }: Range): Edit {
  const selected = doc.slice(from, to)
  if (URL.test(selected.trim())) {
    const target = selected.trim()
    return {
      from,
      to,
      insert: `[](${target})`,
      anchor: from + 1,
      head: from + 1,
    }
  }
  const text = selected || "link text"
  const insert = `[${text}](https://)`
  if (!selected)
    return { from, to, insert, anchor: from + 1, head: from + 1 + text.length }
  const target = from + text.length + 3
  return { from, to, insert, anchor: target, head: target + "https://".length }
}

export type LineKind =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "quote"
  | "bullet"
  | "number"
  | "task"

/** What starts a line of each kind; a task is a bullet with a box. */
const KIND: Record<LineKind, RegExp> = {
  h1: /^# /,
  h2: /^## /,
  h3: /^### /,
  h4: /^#### /,
  h5: /^##### /,
  h6: /^###### /,
  quote: /^> ?/,
  bullet: /^[-*+] (?!\[[ xX]\] )/,
  number: /^\d+[.)] /,
  task: /^[-*+] \[[ xX]\] /,
}

/** Any of those, so a line of one kind can become another. */
const ANY_PREFIX = /^(?:#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/

function prefixFor(kind: LineKind, index: number) {
  if (kind.startsWith("h")) return `${"#".repeat(Number(kind.slice(1)))} `
  if (kind === "quote") return "> "
  if (kind === "number") return `${index + 1}. `
  if (kind === "task") return "- [ ] "
  return "- "
}

/** The whole lines a selection touches. */
export function linesOf(doc: string, { from, to }: Range): Range {
  const start = doc.lastIndexOf("\n", from - 1) + 1
  // A selection that ends at the start of a line does not take that line.
  const last = to > from && doc[to - 1] === "\n" ? to - 1 : to
  const end = doc.indexOf("\n", last)
  return { from: start, to: end === -1 ? doc.length : end }
}

/**
 * Makes the selected lines headings, quotes or list items, or plain lines
 * again when they all already are. Indentation is kept; a heading or list
 * mark of another kind is replaced, and a quote is laid over what is there.
 */
export function toggleLines(doc: string, range: Range, kind: LineKind): Edit {
  const lines = linesOf(doc, range)
  const text = doc.slice(lines.from, lines.to)
  const rows = text.split("\n")
  const parts = rows.map((row) => {
    const indent = /^\s*/.exec(row)![0]
    return { indent, body: row.slice(indent.length) }
  })
  const written = parts.filter((part) => part.body.trim())
  const all =
    written.length > 0 && written.every((part) => KIND[kind].test(part.body))
  let counted = 0
  const insert = parts
    .map(({ indent, body }) => {
      if (!body.trim()) return indent + body
      if (all) return indent + body.replace(KIND[kind], "")
      const rest = kind === "quote" ? body : body.replace(ANY_PREFIX, "")
      return indent + prefixFor(kind, counted++) + rest
    })
    .join("\n")
  const collapsed = range.from === range.to
  return {
    from: lines.from,
    to: lines.to,
    insert,
    // A cursor goes to the end of its line; a selection keeps the lines selected.
    anchor: collapsed ? lines.from + insert.length : lines.from,
    head: lines.from + insert.length,
  }
}

/** What has to go before a block at `at` so it starts after a blank line. */
function blockBefore(doc: string, at: number) {
  if (at === 0) return ""
  if (doc.slice(at - 2, at) === "\n\n" || (at === 1 && doc[0] === "\n"))
    return ""
  return doc[at - 1] === "\n" ? "\n" : "\n\n"
}

/** What has to go after a block ending at `at` so a blank line follows it. */
function blockAfter(doc: string, at: number) {
  if (at === doc.length) return ""
  if (doc.slice(at, at + 2) === "\n\n") return ""
  return doc[at] === "\n" ? "\n" : "\n\n"
}

/** A block of new text in place of the selection, set apart by blank lines. */
function insertBlock(
  doc: string,
  { from, to }: Range,
  block: string,
  /** What to select, as offsets within the block. */
  select: [number, number]
): Edit {
  const before = blockBefore(doc, from)
  const insert = before + block + blockAfter(doc, to)
  const start = from + before.length
  return {
    from,
    to,
    insert,
    anchor: start + select[0],
    head: start + select[1],
  }
}

/** A fenced block of code around the selected lines, or an empty one. */
export function insertCodeBlock(doc: string, range: Range): Edit {
  if (range.from === range.to) {
    const block = "```\n\n```"
    return insertBlock(doc, range, block, [4, 4])
  }
  const lines = linesOf(doc, range)
  const inner = doc.slice(lines.from, lines.to)
  const block = "```\n" + inner + "\n```"
  return insertBlock(doc, lines, block, [4, 4 + inner.length])
}

/** A table of three columns and two rows, its first heading selected. */
export function insertTable(doc: string, range: Range): Edit {
  const block = [
    "| Column 1 | Column 2 | Column 3 |",
    "| -------- | -------- | -------- |",
    "|          |          |          |",
    "|          |          |          |",
  ].join("\n")
  return insertBlock(doc, range, block, [2, 10])
}

/** A line across, with the cursor after it. */
export function insertRule(doc: string, range: Range): Edit {
  return insertBlock(doc, range, "---", [3, 3])
}
