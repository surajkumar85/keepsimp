import { describe, expect, it } from "vitest"
import {
  applyMatrix,
  fitToSheet,
  footerLayout,
  numberText,
  quarter,
  sheets,
  shownSize,
  targetSheet,
  visualMatrix,
  type Box,
} from "./print"

describe("quarter and shownSize", () => {
  it("brings any multiple of 90 into one turn", () => {
    expect([0, 90, 180, 270, 360, 450, -90, -270].map(quarter)).toEqual([
      0, 90, 180, 270, 0, 90, 270, 90,
    ])
  })

  it("swaps width and height for a page on its side", () => {
    const box: Box = [10, 20, 310, 420]
    expect(shownSize(box, 0)).toEqual({ width: 300, height: 400 })
    expect(shownSize(box, 180)).toEqual({ width: 300, height: 400 })
    expect(shownSize(box, 90)).toEqual({ width: 400, height: 300 })
    expect(shownSize(box, -90)).toEqual({ width: 400, height: 300 })
    // A box written corner for corner the other way round is the same page.
    expect(shownSize([310, 420, 10, 20], 0)).toEqual({
      width: 300,
      height: 400,
    })
  })
})

describe("targetSheet", () => {
  const pages = [
    { width: 300, height: 400 },
    { width: 800, height: 600 },
    { width: 500, height: 500 },
  ]

  it("leaves pages alone unless a size is chosen", () => {
    expect(targetSheet("keep", pages)).toBeNull()
    expect(targetSheet("a4", [])).toBeNull()
  })

  it("gives the sheet chosen, the first page or the largest", () => {
    expect(targetSheet("a4", pages)).toBe(sheets.a4)
    expect(targetSheet("letter", pages)).toBe(sheets.letter)
    expect(targetSheet("first", pages)).toBe(pages[0])
    expect(targetSheet("largest", pages)).toBe(pages[1])
    expect(targetSheet("largest", [pages[0]])).toBe(pages[0])
  })
})

describe("fitToSheet", () => {
  const sheet = { width: 600, height: 800 }

  it("has nothing to do for a page that is already the sheet", () => {
    expect(fitToSheet([0, 0, 600, 800], 0, sheet, true)).toBeNull()
    expect(fitToSheet([0, 0, 600.3, 799.8], 0, sheet, true)).toBeNull()
    // On its side, it is a sheet on its side.
    expect(fitToSheet([0, 0, 800, 600], 0, sheet, true)).toBeNull()
    expect(fitToSheet([0, 0, 600, 800], 90, sheet, true)).toBeNull()
  })

  it("enlarges a small page to fill the sheet, centred", () => {
    expect(fitToSheet([0, 0, 300, 400], 0, sheet, true)).toEqual({
      box: [0, 0, 600, 800],
      matrix: [2, 0, 0, 2, 0, 0],
      scale: 2,
    })
    // A squarer page fills the width and sits in the middle of the height.
    expect(fitToSheet([0, 0, 300, 300], 0, sheet, true)).toEqual({
      box: [0, 0, 600, 800],
      matrix: [2, 0, 0, 2, 0, 100],
      scale: 2,
    })
  })

  it("only centres a small page when it may not be enlarged", () => {
    expect(fitToSheet([0, 0, 300, 400], 0, sheet, false)).toEqual({
      box: [0, 0, 600, 800],
      matrix: [1, 0, 0, 1, 150, 200],
      scale: 1,
    })
  })

  it("shrinks a large page either way", () => {
    for (const enlarge of [true, false])
      expect(fitToSheet([0, 0, 1200, 1600], 0, sheet, enlarge)).toEqual({
        box: [0, 0, 600, 800],
        matrix: [0.5, 0, 0, 0.5, 0, 0],
        scale: 0.5,
      })
  })

  it("turns the sheet for a wide page", () => {
    expect(fitToSheet([0, 0, 400, 300], 0, sheet, true)).toEqual({
      box: [0, 0, 800, 600],
      matrix: [2, 0, 0, 2, 0, 0],
      scale: 2,
    })
  })

  it("works in the page's own directions when the page is turned", () => {
    // Stored upright, shown on its side: it needs a sheet on its side, stored upright.
    const turned = fitToSheet([0, 0, 300, 400], 90, sheet, true)!
    expect(turned.box).toEqual([0, 0, 600, 800])
    expect(turned.scale).toBe(2)
    // Stored wide, shown upright after the turn.
    const upright = fitToSheet([0, 0, 400, 300], 270, sheet, true)!
    expect(upright.box).toEqual([0, 0, 800, 600])
    expect(upright.matrix).toEqual([2, 0, 0, 2, 0, 0])
  })

  it("allows for a box that does not start at zero", () => {
    const fitted = fitToSheet([100, 50, 400, 450], 0, sheet, true)!
    expect(fitted.box).toEqual([0, 0, 600, 800])
    // The page's own corner (100, 50) lands on the sheet's corner.
    expect(applyMatrix(fitted.matrix, 100, 50)).toEqual([0, 0])
    expect(applyMatrix(fitted.matrix, 400, 450)).toEqual([600, 800])
  })
})

describe("visualMatrix", () => {
  const box: Box = [10, 20, 310, 420]
  const seen = (turn: number, x: number, y: number) =>
    applyMatrix(visualMatrix(box, turn), x, y)

  it("puts the reader's bottom-left corner at zero for every turn", () => {
    // Upright: the stored corner itself.
    expect(seen(0, 0, 0)).toEqual([10, 20])
    expect(seen(0, 300, 400)).toEqual([310, 420])
    // A quarter clockwise: the stored bottom-right corner is seen bottom-left.
    expect(seen(90, 0, 0)).toEqual([310, 20])
    // The reader's right is the stored up; their up is the stored left.
    expect(seen(90, 400, 0)).toEqual([310, 420])
    expect(seen(90, 0, 300)).toEqual([10, 20])
    // Upside down: the stored top-right corner.
    expect(seen(180, 0, 0)).toEqual([310, 420])
    expect(seen(180, 300, 400)).toEqual([10, 20])
    // Three quarters: the stored top-left corner.
    expect(seen(270, 0, 0)).toEqual([10, 420])
    expect(seen(270, 400, 0)).toEqual([10, 20])
    expect(seen(-90, 0, 300)).toEqual([310, 420])
  })
})

describe("numberText", () => {
  it("writes the number alone or with the total", () => {
    expect(numberText("none", 0, 12, 1)).toBe("")
    expect(numberText("number", 0, 12, 1)).toBe("1")
    expect(numberText("number", 11, 12, 1)).toBe("12")
    expect(numberText("of", 2, 12, 1)).toBe("3 of 12")
  })

  it("starts where asked, and counts the total from there too", () => {
    expect(numberText("number", 0, 12, 5)).toBe("5")
    expect(numberText("of", 11, 12, 5)).toBe("16 of 16")
    expect(numberText("of", 0, 1, 0)).toBe("0 of 0")
  })
})

describe("footerLayout", () => {
  const page = { width: 600, height: 800 }
  /** Every character is five points wide. */
  const measure = (text: string) => [...text].length * 5

  it("puts the number where asked and the name at the other side", () => {
    expect(footerLayout(page, "report.pdf", "3", "centre", measure)).toEqual([
      { text: "3", x: 297.5, y: 20 },
      { text: "report.pdf", x: 28, y: 20 },
    ])
    expect(
      footerLayout(page, "report.pdf", "3 of 12", "right", measure)
    ).toEqual([
      { text: "3 of 12", x: 537, y: 20 },
      { text: "report.pdf", x: 28, y: 20 },
    ])
    // With the number at the left, the name moves to the right.
    expect(footerLayout(page, "report.pdf", "3", "left", measure)).toEqual([
      { text: "3", x: 28, y: 20 },
      { text: "report.pdf", x: 522, y: 20 },
    ])
  })

  it("writes one of the two alone", () => {
    expect(footerLayout(page, "", "7", "right", measure)).toEqual([
      { text: "7", x: 567, y: 20 },
    ])
    expect(footerLayout(page, "notes.pdf", "", "left", measure)).toEqual([
      { text: "notes.pdf", x: 28, y: 20 },
    ])
    expect(footerLayout(page, "", "", "centre", measure)).toEqual([])
  })

  it("shortens a name that would run into the number", () => {
    const long = "a-very-long-file-name-".repeat(6)
    const [, name] = footerLayout(page, long, "3", "centre", measure)
    expect(name.text.endsWith("…")).toBe(true)
    // It stays in the left half of the line.
    expect(name.x + measure(name.text)).toBeLessThanOrEqual(300 - 8)
    // Alone, the name may take the whole line.
    const [alone] = footerLayout(page, long, "", "centre", measure)
    expect(measure(alone.text)).toBeGreaterThan(300)
    expect(alone.x + measure(alone.text)).toBeLessThanOrEqual(600 - 28 - 8)
  })

  it("keeps close to the edges of a very small page", () => {
    const [number] = footerLayout(
      { width: 100, height: 120 },
      "",
      "1",
      "left",
      measure
    )
    expect(number).toEqual({ text: "1", x: 10, y: 10 })
    // A name that cannot fit keeps one letter.
    const texts = footerLayout(
      { width: 40, height: 60 },
      "long-name",
      "9",
      "right",
      measure
    )
    expect(texts[1].text).toBe("l…")
  })
})
