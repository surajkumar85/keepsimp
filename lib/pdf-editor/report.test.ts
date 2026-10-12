import { describe, expect, it } from "vitest"
import type { ExportReport } from "./mupdf-edit"
import { checkLines as everyLine, editedName } from "./report"

const report = (change: Partial<ExportReport> = {}): ExportReport => ({
  added: 1,
  editable: false,
  text: { boxes: 0, found: 0 },
  untouched: { checked: 0, differ: [] },
  fontsCut: false,
  locked: false,
  comments: { had: 0, how: "keep", has: 0 },
  fields: { had: 0, how: "keep", same: 0, left: 0 },
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

/** What became of the things that were added is always said first; the tests of the rest leave it out. */
const became = (line: { text: string }) =>
  / you added (is|are) /.test(line.text)
const checkLines = (told: ExportReport) =>
  everyLine(told).filter((line) => !became(line))

describe("what became of what was added", () => {
  it("says so first, for one thing and for many, part of the page or kept movable", () => {
    const first = (change: Partial<ExportReport>) =>
      everyLine(report(change))[0]
    expect(first({})).toEqual({
      text: "1 thing you added is part of its page now.",
      good: true,
    })
    expect(first({ added: 1200 }).text).toBe(
      "1,200 things you added are part of their pages now."
    )
    expect(first({ editable: true }).text).toBe(
      "1 thing you added is kept as a thing that can be moved again."
    )
    expect(first({ added: 3, editable: true }).text).toBe(
      "3 things you added are kept as things that can be moved again."
    )
    // Nothing added, nothing said of it.
    expect(everyLine(report({ added: 0 })).some(became)).toBe(false)
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
      text: "All 3 pieces of text you added were read back from the result.",
      good: true,
    })
  })

  it("warns of text that was not found", () => {
    const [line] = checkLines(report({ text: { boxes: 3, found: 1 } }))
    expect(line.good).toBe(false)
    expect(line.text).toContain("2 of 3 pieces of text could not be read back")
    const [one] = checkLines(report({ text: { boxes: 1, found: 0 } }))
    expect(one.text).toContain("1 of 1 piece of text could not be read back")
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

  it("does not say nothing was added when the file carries comments", () => {
    expect(
      checkLines(
        report({ added: 0, comments: { had: 2, how: "keep", has: 2 } })
      ).map((line) => line.text)
    ).toEqual([
      "2 comments are in the file, where other programs show them too.",
    ])
  })

  it("says what became of comments", () => {
    const told = (comments: ExportReport["comments"]) =>
      checkLines(report({ comments }))
    expect(told({ had: 1, how: "keep", has: 1 })).toEqual([
      {
        text: "1 comment is in the file, where other programs show it too.",
        good: true,
      },
    ])
    expect(told({ had: 1200, how: "keep", has: 1200 })[0].text).toBe(
      "1,200 comments are in the file, where other programs show them too."
    )
    expect(told({ had: 3, how: "flatten", has: 0 })[0]).toEqual({
      text: "3 comments were made part of the page.",
      good: true,
    })
    expect(told({ had: 1, how: "flatten", has: 0 })[0].text).toBe(
      "1 comment was made part of the page."
    )
    expect(told({ had: 2, how: "remove", has: 0 })[0].text).toBe(
      "2 comments were left out."
    )
    expect(told({ had: 1, how: "remove", has: 0 })[0].text).toBe(
      "1 comment was left out."
    )
  })

  it("warns when comments are not where they were meant to be", () => {
    const told = (comments: ExportReport["comments"]) =>
      checkLines(report({ comments }))[0]
    expect(told({ had: 5, how: "keep", has: 3 })).toEqual({
      text: "2 of 5 comments did not reach the result. Read the result before you rely on it.",
      good: false,
    })
    expect(told({ had: 5, how: "remove", has: 1 })).toEqual({
      text: "1 comment could not be left out and is still in the result as a comment.",
      good: false,
    })
    expect(told({ had: 5, how: "flatten", has: 2 })).toEqual({
      text: "2 comments could not be made part of the page and are still in the result as comments.",
      good: false,
    })
  })
})

describe("what became of a form", () => {
  const told = (fields: ExportReport["fields"], added = 0) =>
    everyLine(report({ added, fields }))

  it("does not say nothing was done when a form was filled in", () => {
    expect(everyLine(report({ added: 0 })).map((line) => line.text)).toEqual([
      "Nothing was added. The file was written again as it is.",
    ])
    expect(told({ had: 3, how: "keep", same: 3, left: 3 })).toEqual([
      {
        text: "The form's 3 fields were read back from the result with what they hold, and can still be filled in.",
        good: true,
      },
    ])
    expect(told({ had: 1, how: "keep", same: 1, left: 1 })[0].text).toBe(
      "The form's 1 field was read back from the result with what it holds, and can still be filled in."
    )
  })

  it("says when the fields were made part of the page", () => {
    expect(told({ had: 1200, how: "flatten", same: 0, left: 0 })[0]).toEqual({
      text: "The form's 1,200 fields are part of the page now and can no longer be changed.",
      good: true,
    })
    expect(told({ had: 1, how: "flatten", same: 0, left: 0 })[0].text).toBe(
      "The form's 1 field is part of the page now and can no longer be changed."
    )
  })

  it("warns when the result does not hold what was filled in", () => {
    expect(told({ had: 5, how: "keep", same: 3, left: 5 })[0]).toEqual({
      text: "2 of the form's 5 fields do not hold in the result what they hold here. Read the result before you rely on it.",
      good: false,
    })
    expect(told({ had: 5, how: "keep", same: 4, left: 5 })[0].text).toBe(
      "1 of the form's 5 fields does not hold in the result what it holds here. Read the result before you rely on it."
    )
    expect(told({ had: 5, how: "flatten", same: 0, left: 2 })[0]).toEqual({
      text: "2 fields could not be made part of the page and are still in the result as fields.",
      good: false,
    })
    expect(told({ had: 5, how: "flatten", same: 0, left: 1 })[0].text).toBe(
      "1 field could not be made part of the page and is still in the result as a field."
    )
  })
})

describe("what became of a signature", () => {
  it("says first that the signed part is untouched", () => {
    expect(
      everyLine(report({ signature: { intact: true }, editable: true }))[0]
    ).toEqual({
      text: "The signed part of the file is untouched, so its signature still holds. What you changed was written after it.",
      good: true,
    })
  })

  it("warns when it is not", () => {
    expect(everyLine(report({ signature: { intact: false } }))[0]).toEqual({
      text: "The signed part of the file is not what it was. Its signature will not hold; read the result before you rely on it.",
      good: false,
    })
  })
})
