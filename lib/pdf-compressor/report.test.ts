import { describe, expect, it } from "vitest"
import {
  alreadySmall,
  changeLines,
  checkLine,
  fileNotes,
  pixelLimit,
  stagePercent,
  stageText,
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

describe("stageText", () => {
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
