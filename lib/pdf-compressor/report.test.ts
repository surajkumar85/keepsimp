import { describe, expect, it } from "vitest"
import {
  alreadySmall,
  batchLine,
  changeLines,
  checkLine,
  fileNotes,
  pixelLimit,
  rowSummary,
  stagePercent,
  stageText,
  targetLine,
} from "./report"

describe("stagePercent", () => {
  it("moves through each part of the work in turn", () => {
    expect(stagePercent("reading", 0, 10)).toBe(0)
    expect(stagePercent("reading", 5, 10)).toBe(5)
    expect(stagePercent("pictures", 0, 4)).toBe(10)
    expect(stagePercent("pictures", 2, 4)).toBe(45)
    expect(stagePercent("writing", 0, 1)).toBe(80)
    expect(stagePercent("checking", 3, 3)).toBe(100)
  })

  it("stays within its part whatever it is told", () => {
    expect(stagePercent("pictures", 9, 4)).toBe(80)
    expect(stagePercent("pictures", -1, 4)).toBe(10)
    expect(stagePercent("checking", 0, 0)).toBe(85)
  })
})

describe("stagePercent, when a file is written several times", () => {
  it("gives each try an equal share", () => {
    expect(stagePercent("reading", 0, 10, 1, 4)).toBe(0)
    expect(stagePercent("pictures", 2, 4, 2, 4)).toBe(36)
    expect(stagePercent("checking", 3, 3, 4, 4)).toBe(100)
  })

  it("never runs past the end when there are more tries than expected", () => {
    expect(stagePercent("writing", 0, 1, 5, 4)).toBe(96)
  })
})

describe("stageText", () => {
  it("says which try it is, except while checking", () => {
    expect(stageText("pictures", 0, 3, 2)).toBe("Try 2: Picture 1 of 3")
    expect(stageText("writing", 0, 1, 1)).toBe("Try 1: Writing the file")
    expect(stageText("reading", 4, 9, 3)).toBe("Try 3: Looking at page 5 of 9")
    expect(stageText("checking", 0, 2, 3)).toBe("Checking page 1 of 2")
  })

  it("says what is being worked on", () => {
    expect(stageText("reading", 0, 1200)).toBe("Looking at page 1 of 1,200")
    expect(stageText("pictures", 2, 5)).toBe("Picture 3 of 5")
    expect(stageText("pictures", 5, 5)).toBe("Picture 5 of 5")
    expect(stageText("writing", 0, 1)).toBe("Writing the file")
    expect(stageText("checking", 0, 0)).toBe("Checking page 1 of 0")
  })
})

describe("changeLines", () => {
  const nothing = {
    pictures: { found: 0, changed: 0, resized: 0 },
    fontsCut: false,
    dropped: { thumbnails: 0, private: 0 },
  }

  it("always says the file was tidied", () => {
    expect(changeLines(nothing)).toEqual([
      "The file was tidied and packed tighter.",
    ])
  })

  it("lists everything that was done", () => {
    expect(
      changeLines({
        pictures: { found: 12, changed: 9, resized: 4 },
        fontsCut: true,
        dropped: { thumbnails: 3, private: 1 },
      })
    ).toEqual([
      "9 of 12 pictures made smaller, 4 of them brought down to the size they are shown at.",
      "Fonts cut down to the letters in use.",
      "Page thumbnails taken out.",
      "Private data of the app that made the file taken out.",
      "The file was tidied and packed tighter.",
    ])
  })

  it("says what became of scanned pages", () => {
    const scans = (
      how: "layers" | "mono" | "grey" | "keep",
      pictures: number
    ) => changeLines({ ...nothing, scans: { how, pictures } })[0]
    expect(scans("layers", 12)).toBe(
      "12 scanned pages rebuilt as sharp letters over soft paper."
    )
    expect(scans("mono", 1)).toBe("1 scanned page turned black and white.")
    expect(scans("grey", 3)).toBe("3 scanned pages turned to greyscale.")
    // None were found: nothing is said about them.
    expect(scans("layers", 0)).toBe("The file was tidied and packed tighter.")
  })

  it("counts one picture as one", () => {
    expect(
      changeLines({
        ...nothing,
        pictures: { found: 1, changed: 1, resized: 1 },
      })[0]
    ).toBe(
      "1 of 1 picture made smaller, 1 of them brought down to the size it is shown at."
    )
    expect(
      changeLines({
        ...nothing,
        pictures: { found: 3, changed: 2, resized: 0 },
      })[0]
    ).toBe("2 of 3 pictures made smaller.")
  })
})

describe("checkLine", () => {
  it("has nothing to say when no page was compared", () => {
    expect(checkLine({ checked: 0, changed: 0, low: [] })).toBeNull()
  })

  it("says pages look the same", () => {
    expect(checkLine({ checked: 1, changed: 1, low: [] })).toEqual({
      passed: true,
      text: "Checked: 1 page looks the same before and after.",
    })
    expect(checkLine({ checked: 24, changed: 310, low: [] })!.text).toBe(
      "Checked: 24 pages out of 310 with changed pictures look the same before and after."
    )
  })

  it("names the pages that changed too much", () => {
    expect(
      checkLine({ checked: 5, changed: 5, low: [{ page: 2, score: 0.8 }] })
    ).toEqual({
      passed: false,
      text: "1 page changed more than expected: page 3. Compare before you download.",
    })
    expect(
      checkLine({
        checked: 5,
        changed: 5,
        low: [
          { page: 0, score: 0.5 },
          { page: 4, score: 0.8 },
        ],
      })!.text
    ).toBe(
      "2 pages changed more than expected: pages 1, 5. Compare before you download."
    )
  })
})

describe("alreadySmall", () => {
  it("points to the next level, where there is one", () => {
    expect(alreadySmall("lossless")).toContain("Balanced")
    expect(alreadySmall("balanced")).toContain("Strong")
    expect(alreadySmall("strong")).toContain("Nothing more")
  })

  it("says a file is already under the size it was to reach", () => {
    expect(alreadySmall("size", { wanted: 204_800, met: true })).toBe(
      "This file is already under 200.0 KB, and nothing can be taken out without changing how it looks."
    )
    expect(alreadySmall("size", { wanted: 204_800, met: false })).toContain(
      "This file is over 200.0 KB, and nothing in it can be made smaller."
    )
    expect(alreadySmall("size")).toContain("Nothing more")
  })
})

describe("fileNotes", () => {
  const plain = { repaired: false, unlocked: false, signed: false }

  it("says nothing about an ordinary file", () => {
    expect(fileNotes(plain, false)).toEqual([])
  })

  it("says what a person should know before compressing", () => {
    const notes = fileNotes(
      { repaired: true, unlocked: true, signed: true },
      true
    )
    expect(notes).toHaveLength(4)
    expect(notes.join(" ")).toMatch(/repaired.*password.*signature.*PDF\/A/)
  })
})

describe("pixelLimit", () => {
  it("is lower on a phone", () => {
    expect(pixelLimit(true)).toBeLessThan(pixelLimit(false))
  })
})

describe("targetLine", () => {
  const KB = 1024

  it("says the file fits", () => {
    expect(
      targetLine({ wanted: 200 * KB, met: true }, 180 * KB, 20 * KB, false)
    ).toEqual({
      met: true,
      text: "Fits: 180.0 KB is under 200.0 KB.",
      advice: [],
    })
  })

  it("says how far off it is, and offers to go further", () => {
    const line = targetLine(
      { wanted: 100 * KB, met: false },
      340 * KB,
      30 * KB,
      false
    )
    expect(line.text).toBe(
      "Could not get under 100.0 KB. This is the smallest that is still easy to read: 340.0 KB, 240.0 KB over."
    )
    expect(line.advice).toHaveLength(2)
    expect(line.advice[0]).toContain("Go further")
    expect(line.advice[1]).toContain("PDF splitter")
  })

  it("does not offer to go further twice", () => {
    const line = targetLine(
      { wanted: 100 * KB, met: false },
      150 * KB,
      30 * KB,
      true
    )
    expect(line.text).toContain("This is the smallest it can be made")
    expect(line.advice).toHaveLength(1)
  })

  it("says so when the text alone is over the size", () => {
    const line = targetLine(
      { wanted: 100 * KB, met: false },
      400 * KB,
      380 * KB,
      false
    )
    expect(line.advice[0]).toBe(
      "Its text, fonts and structure alone take 380.0 KB, so no picture setting can reach this size."
    )
    expect(line.advice).toHaveLength(2)
  })
})

describe("batchLine", () => {
  it("adds several files up", () => {
    expect(
      batchLine([
        { before: 1000 * 1024, after: 400 * 1024 },
        { before: 1000 * 1024, after: 600 * 1024 },
      ])
    ).toEqual({
      before: 2000 * 1024,
      after: 1000 * 1024,
      percent: 50,
      text: "2 files · 1.95 MB → 1000.0 KB",
    })
  })

  it("has nothing to divide by when there are no files", () => {
    expect(batchLine([])).toMatchObject({
      percent: 0,
      text: "0 files · 0 B → 0 B",
    })
  })
})

describe("rowSummary", () => {
  const KB = 1024

  it("says what a file came to", () => {
    expect(
      rowSummary({ before: 400 * KB, after: 100 * KB, smaller: true })
    ).toBe("400.0 KB → 100.0 KB · 75% smaller")
    expect(
      rowSummary({
        before: 400 * KB,
        after: 100 * KB,
        smaller: true,
        target: { wanted: 200 * KB, met: true },
      })
    ).toBe("400.0 KB → 100.0 KB · 75% smaller")
  })

  it("says when a size was missed", () => {
    expect(
      rowSummary({
        before: 400 * KB,
        after: 300 * KB,
        smaller: true,
        target: { wanted: 200 * KB, met: false },
      })
    ).toBe("400.0 KB → 300.0 KB · 25% smaller · over 200.0 KB")
    expect(
      rowSummary({
        before: 400 * KB,
        after: 400 * KB,
        smaller: false,
        target: { wanted: 200 * KB, met: false },
      })
    ).toBe("Could not get under 200.0 KB")
  })

  it("says when a file was left as it is", () => {
    expect(rowSummary({ before: 9, after: 9, smaller: false })).toBe(
      "Already small: left as it is"
    )
    expect(
      rowSummary({
        before: 9,
        after: 9,
        smaller: false,
        target: { wanted: 100, met: true },
      })
    ).toBe("Already small: left as it is")
  })
})
