import { describe, expect, it } from "vitest"
import {
  canRedo,
  canUndo,
  changeCount,
  emptyHistory,
  markSaved,
  redoLabel,
  undoLabel,
  unsaved,
  type History,
} from "./history"
import { curvesThrough, strokePath, thin } from "./ink"
import { BASELINE, breakLines, lineStart } from "./text-layout"

/** Every letter as wide as one unit, so widths can be counted by eye. */
const measure = (text: string) => Array.from(text).length

describe("breakLines", () => {
  it("breaks before the word that does not fit", () => {
    expect(breakLines("the quick brown fox", 9, measure)).toEqual([
      "the quick",
      "brown fox",
    ])
    expect(breakLines("the quick brown fox", 100, measure)).toEqual([
      "the quick brown fox",
    ])
    expect(breakLines("a b", 1, measure)).toEqual(["a", "b"])
  })

  it("ends a line where Enter was pressed, and keeps empty lines", () => {
    expect(breakLines("one\ntwo\n\nfour", 10, measure)).toEqual([
      "one",
      "two",
      "",
      "four",
    ])
    expect(breakLines("one\r\ntwo\rthree", 10, measure)).toEqual([
      "one",
      "two",
      "three",
    ])
    expect(breakLines("", 10, measure)).toEqual([""])
  })

  it("drops spaces where it breaks and at the end, and keeps an indent", () => {
    expect(breakLines("ab   cd", 3, measure)).toEqual(["ab", "cd"])
    expect(breakLines("ab cd   ", 10, measure)).toEqual(["ab cd"])
    expect(breakLines("  ab cd", 10, measure)).toEqual(["  ab cd"])
    expect(breakLines("ab  cd", 10, measure)).toEqual(["ab  cd"])
    expect(breakLines("   ", 10, measure)).toEqual([""])
  })

  it("breaks a word that is wider than the box, a letter at the least on each line", () => {
    expect(breakLines("abcdefgh", 3, measure)).toEqual(["abc", "def", "gh"])
    expect(breakLines("ab cdefghij k", 4, measure)).toEqual([
      "ab",
      "cdef",
      "ghij",
      "k",
    ])
    // A box narrower than a letter still gets one letter a line.
    expect(breakLines("abc", 0.5, measure)).toEqual(["a", "b", "c"])
    // A letter with its accent stays whole.
    expect(breakLines("😀😀", 1, measure)).toEqual(["😀", "😀"])
    // The rest of a broken word shares its line with what follows.
    expect(breakLines("abcde f", 3, measure)).toEqual(["abc", "de", "f"])
    expect(breakLines("abcd e", 3, measure)).toEqual(["abc", "d e"])
  })
})

describe("lineStart", () => {
  it("places a line by how it is aligned", () => {
    expect(lineStart("left", 30, 100)).toBe(0)
    expect(lineStart("centre", 30, 100)).toBe(35)
    expect(lineStart("right", 30, 100)).toBe(70)
    expect(BASELINE).toBeGreaterThan(0.7)
    expect(BASELINE).toBeLessThan(1.1)
  })
})

describe("thin", () => {
  it("keeps the points that shape a stroke and drops the rest", () => {
    const straight = Array.from({ length: 11 }, (_, x) => ({ x, y: 0 }))
    expect(thin(straight, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
    const corner = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ]
    expect(thin(corner, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    // With no tolerance every point that is off the line stays.
    expect(thin(corner, 0)).toHaveLength(4)
  })

  it("leaves short strokes as they are, as copies", () => {
    const dot = [{ x: 1, y: 2 }]
    const copy = thin(dot, 1)
    expect(copy).toEqual(dot)
    expect(copy[0]).not.toBe(dot[0])
    expect(thin([], 1)).toEqual([])
    expect(thin([dot[0], { x: 3, y: 4 }], 1)).toHaveLength(2)
  })
})

describe("curvesThrough", () => {
  it("passes through every point", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]
    const curves = curvesThrough(points)
    expect(curves.map((curve) => curve.to)).toEqual(points.slice(1))
    // Leaving the first point towards the second.
    expect(curves[0].c1).toEqual({ x: 10 / 6, y: 10 / 6 })
    // Arriving at the middle point level, as its neighbours are level with each other.
    expect(curves[0].c2.y).toBe(10)
    expect(curvesThrough([{ x: 1, y: 1 }])).toEqual([])
    expect(curvesThrough([])).toEqual([])
  })

  it("is written as a path for the screen", () => {
    expect(strokePath([])).toBe("")
    expect(strokePath([{ x: 1.004, y: 2 }])).toBe("M1 2L1 2")
    expect(
      strokePath([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ])
    ).toBe("M0 0C1 0 5 0 6 0")
  })
})

describe("history", () => {
  const history: History = {
    steps: ["Add text", "Move", "Delete"],
    position: 2,
    saved: null,
  }

  it("says what can be undone and done again", () => {
    expect(canUndo(emptyHistory)).toBe(false)
    expect(canRedo(emptyHistory)).toBe(false)
    expect(undoLabel(emptyHistory)).toBe("Undo")
    expect(redoLabel(emptyHistory)).toBe("Redo")
    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(true)
    expect(undoLabel(history)).toBe("Undo: Move")
    expect(redoLabel(history)).toBe("Redo: Delete")
    expect(canRedo({ ...history, position: 3 })).toBe(false)
  })

  it("knows whether there is work that was not downloaded", () => {
    expect(unsaved(emptyHistory)).toBe(false)
    expect(unsaved(history)).toBe(true)
    const saved = markSaved(history)
    expect(saved.saved).toBe(2)
    expect(unsaved(saved)).toBe(false)
    // One more change, or one undone, and it is unsaved again.
    expect(unsaved({ ...saved, position: 3 })).toBe(true)
    expect(unsaved({ ...saved, position: 1 })).toBe(true)
    // Everything undone after opening is the file as it came.
    expect(unsaved({ ...history, position: 0 })).toBe(false)
  })

  it("counts the changes in words", () => {
    expect(changeCount(emptyHistory)).toBe("No changes yet")
    expect(changeCount({ ...history, position: 1 })).toBe("1 change")
    expect(changeCount(history)).toBe("2 changes")
  })
})
