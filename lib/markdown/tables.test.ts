import { describe, expect, it } from "vitest"
import {
  cellsOf,
  changeTable,
  isDelimiter,
  readTable,
  tableAt,
  tableFromCells,
  tableFromTabs,
  widthOf,
  writeTable,
} from "./tables"

const apply = (
  doc: string,
  edit: { from: number; to: number; insert: string }
) => doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)

describe("reading tables", () => {
  it("splits cells at pipes, but not escaped ones or ones in code", () => {
    expect(cellsOf("| a | b \\| c | `x | y` |")).toEqual([
      "a",
      "b \\| c",
      "`x | y`",
    ])
    expect(cellsOf("a | b")).toEqual(["a", "b"])
    expect(cellsOf("| ``a ` | b`` | c |")).toEqual(["``a ` | b``", "c"])
    expect(cellsOf("| end \\|")).toEqual(["end \\|"])
  })

  it("knows a line of dashes, and reads alignment from it", () => {
    expect(isDelimiter("| :-- | :-: | --: | --- |")).toBe(true)
    expect(isDelimiter("| a | b |")).toBe(false)
    expect(
      readTable(["| a | b | c | d |", "| :-- | :-: | --: | --- |", "| 1 |"])
    ).toEqual({
      header: ["a", "b", "c", "d"],
      align: ["left", "center", "right", null],
      rows: [["1", "", "", ""]],
    })
    expect(readTable(["| a |", "| b |"])).toBeNull()
    expect(readTable(["| a |"])).toBeNull()
  })

  it("counts wide letters as two columns", () => {
    expect(widthOf("ab")).toBe(2)
    expect(widthOf("日本")).toBe(4)
  })
})

describe("writing tables", () => {
  it("lines the pipes up and keeps alignment", () => {
    expect(
      writeTable({
        header: ["Name", "N", "Mid"],
        align: [null, "right", "center"],
        rows: [["Ada", "12", "x"]],
      })
    ).toEqual([
      "| Name |   N | Mid |",
      "| ---- | --: | :-: |",
      "| Ada  |  12 |  x  |",
    ])
    expect(writeTable({ header: ["L"], align: ["left"], rows: [] })).toEqual([
      "| L   |",
      "| :-- |",
    ])
  })

  it("makes tables from spreadsheet cells and from rows of cells", () => {
    expect(tableFromTabs("a\tb\n1\t2|3\n")).toBe(
      ["| a   | b    |", "| --- | ---- |", "| 1   | 2\\|3 |"].join("\n")
    )
    expect(tableFromTabs("a\tb\r\n1")).toBeNull()
    expect(tableFromTabs("one line\tonly")).toBeNull()
    expect(tableFromTabs("a\tb\tc\n1\t2")).toBe(
      [
        "| a   | b   | c   |",
        "| --- | --- | --- |",
        "| 1   | 2   |     |",
      ].join("\n")
    )
    expect(tableFromCells([["H", "I"], ["line\nbreak"]])).toBe(
      [
        "| H          | I   |",
        "| ---------- | --- |",
        "| line break |     |",
      ].join("\n")
    )
    expect(tableFromCells([])).toBe(["|     |", "| --- |"].join("\n"))
  })
})

describe("changing the table at the cursor", () => {
  const doc = "Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nEnd"
  const inCell = doc.indexOf("2 |")

  it("finds the table, the row and the column of the cursor", () => {
    const found = tableAt(doc, inCell)!
    expect(found.row).toBe(0)
    expect(found.column).toBe(1)
    expect(doc.slice(found.from, found.to)).toBe(
      "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"
    )
    expect(tableAt(doc, 2)).toBeNull()
    expect(tableAt("| a |\n| b |", 2)).toBeNull()
    expect(tableAt(doc, doc.length)).toBeNull()
    expect(tableAt(doc, doc.indexOf("| a"))!.row).toBe(-1)
  })

  it("tidies it, grows it and cuts it", () => {
    expect(changeTable(doc, 2, "tidy")).toBeNull()
    const tidy = changeTable(doc, inCell, "tidy")!
    expect(apply(doc, tidy)).toBe(
      "Intro\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n| 3   | 4   |\n\nEnd"
    )
    expect(apply(doc, tidy).slice(tidy.anchor, tidy.anchor + 1)).toBe("2")
    const row = changeTable(doc, inCell, "row-below")!
    expect(apply(doc, row)).toContain("| 1   | 2   |\n|     |     |\n| 3")
    const column = changeTable(doc, inCell, "column-right")!
    expect(apply(doc, column)).toContain("| a   | b   |     |")
    const deleted = changeTable(doc, inCell, "delete-row")!
    expect(apply(doc, deleted)).not.toContain("| 1")
    const noColumn = changeTable(doc, inCell, "delete-column")!
    expect(apply(doc, noColumn)).toContain("| a   |\n| --- |\n| 1   |")
    // The header row stays, and so does a table's last column.
    const head = changeTable(doc, doc.indexOf("| a"), "delete-row")!
    expect(apply(doc, head)).toContain("| a   | b   |")
    const single = "| a |\n|---|\n| 1 |"
    expect(apply(single, changeTable(single, 2, "delete-column")!)).toBe(
      "| a   |\n| --- |\n| 1   |"
    )
  })
})
