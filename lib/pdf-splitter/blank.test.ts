import { describe, expect, it } from "vitest"
import {
  BLANK_BELOW,
  blankPages,
  blanksOf,
  inkShare,
  partsAtBlanks,
  type BlankChoice,
} from "./blank"

/** A picture of one brightness, with some pixels painted by `paint`. */
function page(
  width: number,
  height: number,
  paper: number,
  paint: (x: number, y: number) => number | null = () => null
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const level = paint(x, y) ?? paper
      data.set([level, level, level, 255], (y * width + x) * 4)
    }
  return { data, width, height }
}

describe("inkShare", () => {
  it("finds no marks on a clean page, white or cream or grey", () => {
    for (const paper of [255, 235, 128, 0])
      expect(inkShare(page(100, 140, paper))).toBe(0)
  })

  it("does not count the grain of a scan", () => {
    let seed = 5
    const noisy = page(100, 140, 240, () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      // Up to 20 levels either side of the paper.
      return 240 - 20 + ((seed >>> 16) % 41)
    })
    // Brightness is capped at 255, so the grain is lopsided; still no marks.
    expect(inkShare(noisy)).toBe(0)
  })

  it("measures how much of the page is marked", () => {
    // A block of 20 × 10 in the middle of a page whose counted area is 92 × 130.
    const marked = page(100, 140, 255, (x, y) =>
      x >= 40 && x < 60 && y >= 60 && y < 70 ? 0 : null
    )
    expect(inkShare(marked)).toBeCloseTo(200 / (92 * 130), 6)
  })

  it("counts light marks on dark paper as well", () => {
    const negative = page(100, 140, 20, (x, y) =>
      x >= 40 && x < 60 && y >= 60 && y < 70 ? 240 : null
    )
    expect(inkShare(negative)).toBeCloseTo(200 / (92 * 130), 6)
  })

  it("leaves the edges out, where scans have shadows", () => {
    const shadowed = page(100, 140, 255, (x, y) =>
      x < 4 || y < 5 || x >= 96 || y >= 135 ? 0 : null
    )
    expect(inkShare(shadowed)).toBe(0)
  })

  it("weighs colours by how bright they look", () => {
    const data = new Uint8ClampedArray(50 * 50 * 4).fill(255)
    // A pure blue block is dark to the eye; a pure yellow one is not.
    for (let y = 20; y < 30; y++)
      for (let x = 20; x < 30; x++) data.set([0, 0, 255, 255], (y * 50 + x) * 4)
    expect(inkShare({ data, width: 50, height: 50 })).toBeGreaterThan(0.04)
    for (let y = 20; y < 30; y++)
      for (let x = 20; x < 30; x++)
        data.set([255, 255, 0, 255], (y * 50 + x) * 4)
    expect(inkShare({ data, width: 50, height: 50 })).toBe(0)
  })

  it("has nothing to measure in a picture too small to have a middle", () => {
    expect(inkShare(page(0, 0, 255))).toBe(0)
    expect(
      inkShare({ data: new Uint8ClampedArray(0), width: 0, height: 9 })
    ).toBe(0)
  })
})

describe("blankPages", () => {
  // Nothing, a speck, a page number, a punch hole, one line of text, a full page.
  const shares = [0, 0.00001, 0.0001, 0.0007, 0.0022, 0.2]

  it("is stricter or looser about what counts as blank", () => {
    expect(blankPages(shares, "strict")).toEqual([0, 1])
    expect(blankPages(shares, "normal")).toEqual([0, 1, 2])
    expect(blankPages(shares, "loose")).toEqual([0, 1, 2, 3])
  })

  it("has thresholds in order", () => {
    expect(BLANK_BELOW.strict).toBeLessThan(BLANK_BELOW.normal)
    expect(BLANK_BELOW.normal).toBeLessThan(BLANK_BELOW.loose)
  })
})

describe("blanksOf", () => {
  const shares = [0, 0.5, 0, 0.5]

  it("is the pages found blank when none is turned round", () => {
    expect([...blanksOf(shares, "normal", new Set())]).toEqual([0, 2])
  })

  it("keeps a page found blank, and calls blank a page that was not, when turned round by hand", () => {
    expect([...blanksOf(shares, "normal", new Set([2, 3]))].sort()).toEqual([
      0, 3,
    ])
  })

  it("ignores pages that are not in the file", () => {
    expect([...blanksOf(shares, "normal", new Set([9, -1]))]).toEqual([0, 2])
  })
})

describe("partsAtBlanks", () => {
  const parts = (count: number, blanks: number[], how: BlankChoice) =>
    partsAtBlanks(count, new Set(blanks), how).map((part) =>
      part.pages.map((page) => page + 1)
    )

  it("cuts at blank pages and leaves them out", () => {
    expect(parts(8, [2, 5], "drop")).toEqual([
      [1, 2],
      [4, 5],
      [7, 8],
    ])
  })

  it("cuts after blank pages and keeps them with the part before", () => {
    expect(parts(8, [2, 5], "keep")).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ])
  })

  it("only removes them, leaving one file", () => {
    expect(parts(8, [2, 5], "remove")).toEqual([[1, 2, 4, 5, 7, 8]])
  })

  it("treats blank pages side by side as one place", () => {
    expect(parts(7, [2, 3, 4], "drop")).toEqual([
      [1, 2],
      [6, 7],
    ])
    expect(parts(7, [2, 3, 4], "keep")).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7],
    ])
  })

  it("makes no empty parts at either end", () => {
    expect(parts(5, [0, 4], "drop")).toEqual([[2, 3, 4]])
    expect(parts(5, [0, 4], "keep")).toEqual([[1], [2, 3, 4, 5]])
  })

  it("gives the whole file when no page is blank, and nothing when all are dropped", () => {
    expect(parts(3, [], "drop")).toEqual([[1, 2, 3]])
    expect(parts(3, [0, 1, 2], "drop")).toEqual([])
    expect(parts(3, [0, 1, 2], "remove")).toEqual([])
    expect(parts(3, [0, 1, 2], "keep")).toEqual([[1, 2, 3]])
    expect(parts(0, [], "drop")).toEqual([])
  })
})
