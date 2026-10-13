import { describe, expect, it } from "vitest"
import type { ExportReport } from "./mupdf-edit"
import { checkLines as everyLine, editedName, partName } from "./report"

const report = (change: Partial<ExportReport> = {}): ExportReport => ({
  added: 1,
  editable: false,
  text: { boxes: 0, found: 0 },
  untouched: { checked: 0, differ: [] },
  fontsCut: false,
  locked: false,
  comments: { had: 0, how: "keep", has: 0 },
  fields: { had: 0, how: "keep", same: 0, left: 0 },
  retext: { steps: 0, lines: 0, found: 0 },
  pictures: { steps: 0, cut: false },
  links: 0,
  pages: {
    steps: 0,
    taken: 0,
    added: 0,
    lost: { links: 0, bookmarks: 0, fields: 0 },
  },
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

describe("partName", () => {
  it("names some pages of a file as a file of their own", () => {
    expect(partName("Plan 2026.pdf", [2])).toBe("Plan 2026-page-3.pdf")
    expect(partName("plan.PDF", [1, 2, 3])).toBe("plan-pages-2-to-4.pdf")
    expect(partName("plan", [0, 4, 9])).toBe("plan-3-pages.pdf")
    expect(partName(".pdf", [0])).toBe("document-page-1.pdf")
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

describe("what became of links", () => {
  it("says in how many places they were changed, and that where they lead is not checked", () => {
    expect(everyLine(report({ added: 0, links: 1 }))).toEqual([
      {
        text: "Links were added, changed or taken away in 1 place. Where a link leads is not checked: try each one in the result.",
        good: true,
      },
    ])
    expect(everyLine(report({ added: 0, links: 2400 }))[0].text).toContain(
      "in 2,400 places."
    )
  })
})

describe("what became of the pictures a page already had", () => {
  const told = (pictures: ExportReport["pictures"]) =>
    everyLine(report({ added: 0, pictures }))

  it("says in how many places they were changed", () => {
    expect(told({ steps: 1, cut: false })).toEqual([
      {
        text: "Pictures the page already had were changed in 1 place.",
        good: true,
      },
    ])
    expect(told({ steps: 1200, cut: false })[0].text).toBe(
      "Pictures the pages already had were changed in 1,200 places."
    )
    // Nothing is said of pictures that were not changed.
    expect(
      told({ steps: 0, cut: false }).some((line) =>
        line.text.includes("Pictures")
      )
    ).toBe(false)
  })

  it("says that the rest of a picture that was cut to a part is still in the file", () => {
    expect(told({ steps: 2, cut: true })).toEqual([
      {
        text: "Pictures the pages already had were changed in 2 places. A picture that was cut to a part is whole in the file: the rest of it is hidden, not removed.",
        good: true,
      },
    ])
  })
})

describe("what became of the page's own text", () => {
  const told = (retext: ExportReport["retext"]) =>
    everyLine(report({ added: 0, retext }))

  it("says where it was changed and that the new lines were read back", () => {
    expect(told({ steps: 1, lines: 1, found: 1 })).toEqual([
      {
        text: "The page's own text was changed in 1 place. The old words are no longer in the file, and the line you wrote was read back from the result.",
        good: true,
      },
    ])
    expect(told({ steps: 1200, lines: 3, found: 3 })[0].text).toBe(
      "The page's own text was changed in 1,200 places. The old words are no longer in the file, and all 3 lines you wrote were read back from the result."
    )
  })

  it("says so when lines were only taken out", () => {
    expect(told({ steps: 2, lines: 0, found: 0 })[0]).toEqual({
      text: "The page's own text was changed in 2 places. What you took out is no longer in the file.",
      good: true,
    })
  })

  it("warns when a line that was written is not read back", () => {
    expect(told({ steps: 3, lines: 3, found: 1 })[0]).toEqual({
      text: "2 of the 3 lines you changed could not be read back from the result. Read the result before you rely on it.",
      good: false,
    })
    expect(told({ steps: 1, lines: 1, found: 0 })[0].text).toBe(
      "1 of the 1 line you changed could not be read back from the result. Read the result before you rely on it."
    )
  })
})

describe("what became of the pages", () => {
  const none = { links: 0, bookmarks: 0, fields: 0 }
  const told = (
    pages: Omit<ExportReport["pages"], "added"> & { added?: number },
    signed = false
  ) =>
    checkLines(
      report({
        pages: { added: 0, ...pages },
        ...(signed ? { signature: { intact: true } } : null),
      })
    )
      .map((line) => line.text)
      .filter(
        (text) =>
          /pages? /.test(text) && !/signed part of the file is/.test(text)
      )

  it("says that the list of pages was changed, and is not silent when nothing else was", () => {
    expect(told({ steps: 1, taken: 0, lost: none })).toEqual([
      "The pages were put in order, turned, copied, added or taken out in 1 step.",
    ])
    expect(told({ steps: 1200, taken: 0, lost: none })[0]).toContain(
      "in 1,200 steps."
    )
    expect(
      everyLine(
        report({
          added: 0,
          pages: { steps: 1, taken: 0, added: 0, lost: none },
        })
      ).some((line) => line.text.startsWith("Nothing was added"))
    ).toBe(false)
  })

  it("says that pages taken out are gone, with what led to them and was on them", () => {
    expect(told({ steps: 1, taken: 1, lost: none })[1]).toBe(
      "1 page you took out is no longer in the file."
    )
    expect(
      told({
        steps: 2,
        taken: 3,
        lost: { links: 2, bookmarks: 1, fields: 4 },
      })[1]
    ).toBe(
      "3 pages you took out are no longer in the file. What led to them or was on them went too: 2 links, 1 bookmark, 4 form fields."
    )
    expect(
      told({
        steps: 1,
        taken: 1,
        lost: { links: 1, bookmarks: 0, fields: 0 },
      })[1]
    ).toBe(
      "1 page you took out is no longer in the file. What led to it or was on it went too: 1 link."
    )
    expect(
      told({
        steps: 1,
        taken: 2,
        lost: { links: 0, bookmarks: 2, fields: 1 },
      })[1]
    ).toContain("went too: 2 bookmarks, 1 form field.")
  })

  it("says how pages from another file come, and that a part is a part", () => {
    expect(told({ steps: 1, taken: 0, added: 1, lost: none })[1]).toBe(
      "1 page came from another file, as it looks: a form's fields on it are part of the page now, and that file's bookmarks were not brought along."
    )
    expect(told({ steps: 2, taken: 0, added: 1200, lost: none })[1]).toBe(
      "1,200 pages came from another file, as they look: a form's fields on them are part of the page now, and that file's bookmarks were not brought along."
    )
    expect(everyLine(report({ part: 1 }))[0]).toEqual({
      text: "Only 1 page was written, as a file of its own. The file in the editor is as it was, with everything that is not yet downloaded.",
      good: true,
    })
    expect(everyLine(report({ part: 30 }))[0].text).toBe(
      "Only 30 pages were written, as a file of their own. The file in the editor is as it was, with everything that is not yet downloaded."
    )
  })

  it("does not say that anything is gone from a file that was only added to", () => {
    expect(told({ steps: 1, taken: 1, lost: none }, true)[1]).toBe(
      "1 page you took out is still in the signed part of the file, where a program can find it. To be rid of it, download the file written anew."
    )
    expect(
      told(
        { steps: 1, taken: 2, lost: { links: 1, bookmarks: 0, fields: 0 } },
        true
      )[1]
    ).toBe(
      "2 pages you took out are still in the signed part of the file, where a program can find them. To be rid of them, download the file written anew. What led to them or was on them went too: 1 link."
    )
    expect(
      checkLines(
        report({
          signature: { intact: true },
          retext: { steps: 2, lines: 0, found: 0 },
        })
      ).map((line) => line.text)
    ).toContain(
      "The page's own text was changed in 2 places. The words as they were are still in the signed part of the file, where a program can find them. To be rid of them, download the file written anew."
    )
  })
})
