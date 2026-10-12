import { describe, expect, it } from "vitest"
import type { ExportReport } from "./mupdf-edit"
import { checkLines, editedName } from "./report"

const report = (change: Partial<ExportReport> = {}): ExportReport => ({
  added: 1,
  text: { boxes: 0, found: 0 },
  untouched: { checked: 0, differ: [] },
  fontsCut: false,
  locked: false,
  ...change,
})

describe("editedName", () => {
  it("marks the file's own name as edited", () => {
    expect(editedName("Report 2026.pdf")).toBe("Report 2026-edited.pdf")
    expect(editedName("scan.PDF")).toBe("scan-edited.pdf")
    expect(editedName("notes")).toBe("notes-edited.pdf")
  })

  it("has a name for a file without one", () => {
    expect(editedName(".pdf")).toBe("document-edited.pdf")
    expect(editedName("  ")).toBe("document-edited.pdf")
  })
})

describe("checkLines", () => {
  it("says nothing of what was not looked at", () => {
    expect(checkLines(report())).toEqual([])
  })

  it("says so when nothing was added", () => {
    expect(checkLines(report({ added: 0 }))).toEqual([
      {
        text: "Nothing was added. The file was written again as it is.",
        good: true,
      },
    ])
  })

  it("tells of text that was read back", () => {
    expect(
      checkLines(report({ text: { boxes: 1, found: 1 } })).map(
        (line) => line.text
      )
    ).toEqual(["The text you added was read back from the result."])
    const [three] = checkLines(report({ text: { boxes: 3, found: 3 } }))
    expect(three).toEqual({
      text: "All 3 text boxes you added were read back from the result.",
      good: true,
    })
  })

  it("warns of text that was not found", () => {
    const [line] = checkLines(report({ text: { boxes: 3, found: 1 } }))
    expect(line.good).toBe(false)
    expect(line.text).toContain("2 of 3 text boxes could not be read back")
    const [one] = checkLines(report({ text: { boxes: 1, found: 0 } }))
    expect(one.text).toContain("1 of 1 text box could not be read back")
  })

  it("tells how many untouched pages were compared", () => {
    expect(
      checkLines(report({ untouched: { checked: 1, differ: [] } }))[0].text
    ).toBe(
      "A page you did not change was compared with the original and looks the same."
    )
    expect(
      checkLines(report({ untouched: { checked: 1200, differ: [] } }))[0]
    ).toEqual({
      text: "1,200 pages you did not change were compared with the original and look the same.",
      good: true,
    })
  })

  it("names the pages that differ, counted from 1", () => {
    const [one] = checkLines(report({ untouched: { checked: 4, differ: [2] } }))
    expect(one.good).toBe(false)
    expect(one.text).toMatch(/^Page 3 looks different from the original/)
    const [many] = checkLines(
      report({ untouched: { checked: 9, differ: [0, 1, 2, 3, 4, 5, 6] } })
    )
    expect(many.text).toMatch(
      /^Pages 1, 2, 3, 4, 5 and 2 more look different from the original/
    )
  })

  it("mentions fonts only when text was added, and the lock when there is one", () => {
    expect(checkLines(report({ fontsCut: true }))).toEqual([])
    const lines = checkLines(
      report({ text: { boxes: 1, found: 1 }, fontsCut: true, locked: true })
    )
    expect(lines.map((line) => line.text)).toEqual([
      "The text you added was read back from the result.",
      "The fonts of your text are in the file, cut down to the letters used.",
      "Locked with your password.",
    ])
    expect(lines.every((line) => line.good)).toBe(true)
  })
})
