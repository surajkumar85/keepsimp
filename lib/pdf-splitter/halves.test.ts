import { describe, expect, it } from "vitest"
import {
  areaToBox,
  clampCut,
  defaultHalves,
  halfAreas,
  halvedPages,
  pagesToHalve,
  type Box,
} from "./halves"

describe("halfAreas", () => {
  it("cuts a page down the middle, left half first", () => {
    expect(halfAreas(defaultHalves)).toEqual([
      { left: 0, top: 0, right: 0.5, bottom: 1 },
      { left: 0.5, top: 0, right: 1, bottom: 1 },
    ])
  })

  it("reads the right half first when asked", () => {
    const [first, second] = halfAreas({ ...defaultHalves, first: "end" })
    expect(first.left).toBe(0.5)
    expect(second.right).toBe(0.5)
  })

  it("cuts across, top half first, where the cut is put", () => {
    expect(halfAreas({ direction: "down", at: 0.4, first: "start" })).toEqual([
      { left: 0, top: 0, right: 1, bottom: 0.4 },
      { left: 0, top: 0.4, right: 1, bottom: 1 },
    ])
  })

  it("keeps the cut away from the edges", () => {
    expect(clampCut(0.05)).toBe(0.2)
    expect(clampCut(0.95)).toBe(0.8)
    expect(clampCut(0.45)).toBe(0.45)
    expect(clampCut(Number.NaN)).toBe(0.5)
    expect(halfAreas({ ...defaultHalves, at: 0.99 })[0].right).toBe(0.8)
  })
})

describe("areaToBox", () => {
  /** A sheet 400 wide and 200 tall whose corner is not at the origin. */
  const page: Box = [10, 20, 410, 220]
  const left = { left: 0, top: 0, right: 0.5, bottom: 1 }
  const topRight = { left: 0.5, top: 0, right: 1, bottom: 0.25 }

  it("maps an upright page straight across, with the top being the high side", () => {
    expect(areaToBox(page, 0, left)).toEqual([10, 20, 210, 220])
    expect(areaToBox(page, 0, topRight)).toEqual([210, 170, 410, 220])
  })

  it("follows a page that is shown turned a quarter clockwise", () => {
    // Shown, the page is 200 wide and 400 tall; its left half is the low half of the sheet.
    expect(areaToBox(page, 90, left)).toEqual([10, 20, 410, 120])
    expect(areaToBox(page, 90, topRight)).toEqual([10, 120, 110, 220])
  })

  it("follows a page that is shown upside down", () => {
    expect(areaToBox(page, 180, left)).toEqual([210, 20, 410, 220])
    expect(areaToBox(page, 180, topRight)).toEqual([10, 20, 210, 70])
  })

  it("follows a page that is shown turned a quarter the other way", () => {
    expect(areaToBox(page, 270, left)).toEqual([10, 120, 410, 220])
    expect(areaToBox(page, 270, topRight)).toEqual([310, 20, 410, 120])
  })

  it("counts turns beyond a full one, and backwards", () => {
    expect(areaToBox(page, 450, left)).toEqual(areaToBox(page, 90, left))
    expect(areaToBox(page, -90, left)).toEqual(areaToBox(page, 270, left))
  })

  it("covers the page exactly with its two halves, whatever the turn", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const [a, b] = halfAreas({ direction: "across", at: 0.3, first: "start" })
      const first = areaToBox(page, rotation, a)
      const second = areaToBox(page, rotation, b)
      const size = (box: Box) => (box[2] - box[0]) * (box[3] - box[1])
      expect(size(first) + size(second)).toBeCloseTo(400 * 200)
      expect(size(first)).toBeCloseTo(0.3 * 400 * 200)
    }
  })
})

describe("pagesToHalve", () => {
  const sizes = [
    { width: 600, height: 800 },
    { width: 1200, height: 800 },
    { width: 1200, height: 800 },
    { width: 600, height: 800 },
  ]

  it("cuts every page, or keeps a single cover whole", () => {
    expect(
      pagesToHalve(sizes, { which: "all", direction: "across", cover: false })
    ).toEqual([true, true, true, true])
    expect(
      pagesToHalve(sizes, { which: "all", direction: "across", cover: true })
    ).toEqual([false, true, true, true])
  })

  it("cuts only pages the shape of a double page", () => {
    expect(
      pagesToHalve(sizes, { which: "wide", direction: "across", cover: false })
    ).toEqual([false, true, true, false])
    // Cutting down, a double page is the taller kind.
    expect(
      pagesToHalve(sizes, { which: "wide", direction: "down", cover: false })
    ).toEqual([true, false, false, true])
  })
})

describe("halvedPages", () => {
  it("lists two halves for a page that is cut and the page itself for one that is not", () => {
    expect(halvedPages([false, true, true])).toEqual([
      { page: 0, half: null },
      { page: 1, half: 0 },
      { page: 1, half: 1 },
      { page: 2, half: 0 },
      { page: 2, half: 1 },
    ])
    expect(halvedPages([])).toEqual([])
  })
})
