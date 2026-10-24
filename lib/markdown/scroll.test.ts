import { describe, expect, it } from "vitest"
import { lineForTop, ordered, topForLine } from "./scroll"

describe("scrolling together", () => {
  const anchors = ordered([
    { line: 10, top: 400 },
    { line: 0, top: 0 },
    { line: 4, top: 120 },
    { line: 4, top: 140 },
    // Drawn above an earlier block (a footnote moved to the end): ignored.
    { line: 6, top: 50 },
  ])
  const end = { line: 20, top: 1000 }

  it("keeps one anchor a line, going only downwards", () => {
    expect(anchors).toEqual([
      { line: 0, top: 0 },
      { line: 4, top: 120 },
      { line: 10, top: 400 },
    ])
  })

  it("finds the height of a line, part of the way between blocks", () => {
    expect(topForLine(anchors, 0, end)).toBe(0)
    expect(topForLine(anchors, 2, end)).toBe(60)
    expect(topForLine(anchors, 7, end)).toBe(260)
    expect(topForLine(anchors, 15, end)).toBe(700)
    expect(topForLine(anchors, 25, end)).toBe(1000)
    expect(topForLine(anchors, -1, end)).toBe(0)
  })

  it("finds the line at a height", () => {
    expect(lineForTop(anchors, 60, end)).toBe(2)
    expect(lineForTop(anchors, 260, end)).toBe(7)
    expect(lineForTop(anchors, 2000, end)).toBe(20)
    expect(lineForTop(anchors, -5, end)).toBe(0)
    expect(lineForTop([{ line: 3, top: 0 }], 0, { line: 9, top: 0 })).toBe(9)
  })
})
