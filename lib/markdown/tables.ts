/**
 * Tables in GitHub's Markdown: found around the cursor, read into cells,
 * written back with their pipes in line, and grown or cut by a row or a
 * column. Also made from cells copied out of a spreadsheet (tab-separated
 * text) and from the cells of an HTML table.
 */
import type { Edit } from "./edits"

export type Align = "left" | "center" | "right" | null

export interface Table {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** The cells of one row, split at pipes that are not escaped or inside code. */
export function cellsOf(line: string): string[] {
  let text = line.trim()
  if (text.startsWith("|")) text = text.slice(1)
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1)
  const cells: string[] = []
  let current = ""
  let code = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === "\\" && text[index + 1] === "|") {
      current += "\\|"
      index++
    } else if (char === "`") {
      // A run of backticks opens code, and the same run closes it.
      let run = 1
      while (text[index + run] === "`") run++
      code = code === run ? 0 : code || run
      current += "`".repeat(run)
      index += run - 1
    } else if (char === "|" && !code) {
      cells.push(current.trim())
      current = ""
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

const DELIMITER = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** Whether a line is a table's line of dashes. */
export const isDelimiter = (line: string) => DELIMITER.test(line.trim())

function alignOf(cell: string): Align {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  return left && right ? "center" : right ? "right" : left ? "left" : null
}

/** A table read from its lines, or null when they are not one. */
export function readTable(lines: string[]): Table | null {
  if (lines.length < 2 || !isDelimiter(lines[1])) return null
  const header = cellsOf(lines[0])
  const align = cellsOf(lines[1]).map(alignOf)
  const width = header.length
  const fit = (cells: string[]) =>
    Array.from({ length: width }, (_, index) => cells[index] ?? "")
  return {
    header,
    align: fit(align as string[]).map((one) => (one || null) as Align),
    rows: lines.slice(2).map((line) => fit(cellsOf(line))),
  }
}

/** How wide a cell looks: letters of East Asian scripts take two columns. */
export function widthOf(text: string) {
  let width = 0
  for (const char of text)
    width += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(char) ? 2 : 1
  return width
}

/** A table written back with its pipes in line, as GitHub's editor writes them. */
export function writeTable(table: Table): string[] {
  const columns = table.header.length
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(
      3,
      widthOf(table.header[column]),
      ...table.rows.map((row) => widthOf(row[column]))
    )
  )
  const pad = (text: string, column: number) => {
    const space = widths[column] - widthOf(text)
    const align = table.align[column]
    if (align === "right") return " ".repeat(space) + text
    if (align === "center") {
      const left = Math.floor(space / 2)
      return " ".repeat(left) + text + " ".repeat(space - left)
    }
    return text + " ".repeat(space)
  }
  const row = (cells: string[]) =>
    `| ${cells.map((cell, column) => pad(cell, column)).join(" | ")} |`
  const rule = widths.map((width, column) => {
    const align = table.align[column]
    const dashes = "-".repeat(width - (align === "center" ? 2 : align ? 1 : 0))
    return align === "center"
      ? `:${dashes}:`
      : align === "right"
        ? `${dashes}:`
        : align === "left"
          ? `:${dashes}`
          : dashes
  })
  return [row(table.header), `| ${rule.join(" | ")} |`, ...table.rows.map(row)]
}

/** The table the cursor is in: its lines and where it starts and ends in the text. */
export function tableAt(doc: string, at: number) {
  const lines = doc.split("\n")
  let offset = 0
  let lineIndex = 0
  for (; lineIndex < lines.length; lineIndex++) {
    if (at <= offset + lines[lineIndex].length) break
    offset += lines[lineIndex].length + 1
  }
  const isRow = (index: number) =>
    index >= 0 && index < lines.length && lines[index].includes("|")
  if (!isRow(lineIndex)) return null
  let first = lineIndex
  while (isRow(first - 1)) first--
  let last = lineIndex
  while (isRow(last + 1)) last++
  const table = readTable(lines.slice(first, last + 1))
  if (!table) return null
  const from = lines
    .slice(0, first)
    .reduce((sum, line) => sum + line.length + 1, 0)
  const text = lines.slice(first, last + 1).join("\n")
  // The cursor's row among the table's own rows (the header is -1; the dashes count as the header).
  const row = Math.max(-1, lineIndex - first - 2)
  // The cursor's column: pipes before it on its line.
  const before = lines[lineIndex].slice(0, at - offset)
  const column = cellsOf(before + "x").length - 1
  return {
    table,
    from,
    to: from + text.length,
    row,
    column: Math.min(column, table.header.length - 1),
  }
}

export type TableChange =
  "tidy" | "row-below" | "column-right" | "delete-row" | "delete-column"

/** A change to the table the cursor is in, as one edit, or null when it is not in one. */
export function changeTable(
  doc: string,
  at: number,
  change: TableChange
): Edit | null {
  const found = tableAt(doc, at)
  if (!found) return null
  const { table, from, to, row, column } = found
  let next: Table = { ...table, rows: table.rows.map((cells) => [...cells]) }
  let cursorRow = row
  if (change === "row-below") {
    next.rows.splice(
      row + 1,
      0,
      table.header.map(() => "")
    )
    cursorRow = row + 1
  } else if (change === "column-right") {
    next = {
      header: insertAt(table.header, column + 1, ""),
      align: insertAt(table.align, column + 1, null),
      rows: table.rows.map((cells) => insertAt(cells, column + 1, "")),
    }
  } else if (change === "delete-row") {
    // The header stays; a table needs one.
    if (row >= 0) next.rows.splice(row, 1)
    cursorRow = Math.min(row, next.rows.length - 1)
  } else if (change === "delete-column" && table.header.length > 1) {
    next = {
      header: table.header.filter((_, index) => index !== column),
      align: table.align.filter((_, index) => index !== column),
      rows: table.rows.map((cells) =>
        cells.filter((_, index) => index !== column)
      ),
    }
  }
  const lines = writeTable(next)
  const insert = lines.join("\n")
  // The cursor goes to the start of its cell's text in the new table.
  const line = cursorRow < 0 ? 0 : cursorRow + 2
  const before = lines
    .slice(0, line)
    .reduce((sum, one) => sum + one.length + 1, 0)
  const target = Math.min(
    change === "column-right"
      ? column + 1
      : Math.min(column, next.header.length - 1),
    next.header.length - 1
  )
  const cell = lines[line].split(" | ").slice(0, target).join(" | ")
  const within = target === 0 ? 2 : cell.length + 3
  const place = from + before + within
  return { from, to, insert, anchor: place, head: place }
}

function insertAt<T>(list: T[], index: number, value: T) {
  return [...list.slice(0, index), value, ...list.slice(index)]
}

const escapeCell = (text: string) =>
  text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()

/** Cells copied from a spreadsheet (lines of tab-separated text) as a table, or null when they are not cells. */
export function tableFromTabs(text: string): string | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n")
  if (lines.length < 2 || !lines.every((line) => line.includes("\t")))
    return null
  const rows = lines.map((line) => line.split("\t").map(escapeCell))
  const columns = Math.max(...rows.map((row) => row.length))
  const fit = (row: string[]) =>
    Array.from({ length: columns }, (_, index) => row[index] ?? "")
  return writeTable({
    header: fit(rows[0]),
    align: rows[0].map(() => null),
    rows: rows.slice(1).map(fit),
  }).join("\n")
}

/** A table from rows of cells (the first is the header): for HTML tables and the table maker. */
export function tableFromCells(cells: string[][]): string {
  const columns = Math.max(1, ...cells.map((row) => row.length))
  const fit = (row: string[]) =>
    Array.from({ length: columns }, (_, index) => escapeCell(row[index] ?? ""))
  const [header = [], ...rows] = cells
  return writeTable({
    header: fit(header),
    align: Array.from({ length: columns }, () => null),
    rows: rows.map(fit),
  }).join("\n")
}
