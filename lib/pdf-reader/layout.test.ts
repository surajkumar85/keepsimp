import { describe, expect, it } from "vitest"
import {
  anchorAt,
  clampZoom,
  currentPage,
  drawEdge,
  fitPage,
  fitWidth,
  GAP,
  layoutColumn,
  MAX_ZOOM,
  MIN_ZOOM,
  pagesNear,
  parsePageNumber,
  POINT,
  scrollToAnchor,
  scrollToPage,
  stepZoom,
  turned,
  turnedPoint,
  zoomFor,
  zoomLabel,
} from "./layout"

const a4 = { width: 595, height: 842 }
/** Three pages of 75 × 150 points: 100 × 200 pixels at 100%. */
const three = layoutColumn(
  Array.from({ length: 3 }, () => ({ width: 75, height: 150 })),
  1
)

describe("zoom", () => {
  it("keeps a zoom inside its limits", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(1.3)).toBe(1.3)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it("steps to the next stop either way", () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    // Between stops, it moves to the nearest stop in that direction.
    expect(stepZoom(1.04, 1)).toBe(1.1)
    expect(stepZoom(1.04, -1)).toBe(1)
    // A hair off a stop counts as that stop, so each press can be seen.
    expect(stepZoom(0.9999, 1)).toBe(1.1)
    expect(stepZoom(0.901, -1)).toBe(0.75)
    expect(stepZoom(0.99, 1)).toBe(1.1)
  })

  it("stops at the ends", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })

  it("writes a zoom as a whole percentage", () => {
    expect(zoomLabel(1)).toBe("100%")
    expect(zoomLabel(0.667)).toBe("67%")
  })

  it("fits a page to the width of the room", () => {
    const zoom = fitWidth(a4, { width: 1000, height: 500 })
    expect(a4.width * POINT * zoom).toBeCloseTo(1000 - GAP * 2)
  })

  it("fits a whole page into the room, whichever side is tighter", () => {
    const tall = fitPage(a4, { width: 1000, height: 500 })
    expect(a4.height * POINT * tall).toBeCloseTo(500 - GAP * 2)
    const narrow = fitPage(a4, { width: 300, height: 5000 })
    expect(a4.width * POINT * narrow).toBeCloseTo(300 - GAP * 2)
  })

  it("never fits beyond the limits, even for an empty page or no room", () => {
    expect(fitWidth({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(
      MAX_ZOOM
    )
    expect(fitWidth(a4, { width: 0, height: 0 })).toBe(MIN_ZOOM)
    expect(fitPage({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(
      MAX_ZOOM
    )
  })
})

describe("turned", () => {
  it("swaps the sides for a quarter turn only", () => {
    expect(turned(a4, 0)).toEqual(a4)
    expect(turned(a4, 180)).toEqual(a4)
    expect(turned(a4, 90)).toEqual({ width: 842, height: 595 })
    expect(turned(a4, 270)).toEqual({ width: 842, height: 595 })
  })
})

describe("turnedPoint", () => {
  const size = { width: 100, height: 200 }
  const spot = { x: 10, y: 30 }

  it("follows a spot as its page is turned clockwise", () => {
    expect(turnedPoint(spot, size, 0)).toEqual({ x: 10, y: 30 })
    expect(turnedPoint(spot, size, 90)).toEqual({ x: 170, y: 10 })
    expect(turnedPoint(spot, size, 180)).toEqual({ x: 90, y: 170 })
    expect(turnedPoint(spot, size, 270)).toEqual({ x: 30, y: 90 })
  })

  it("counts a turn the other way, and more than a full turn", () => {
    expect(turnedPoint(spot, size, -90)).toEqual(turnedPoint(spot, size, 270))
    expect(turnedPoint(spot, size, 450)).toEqual(turnedPoint(spot, size, 90))
  })
})

describe("zoomFor", () => {
  const room = { width: 1000, height: 700 }
  const sizes = [a4, { width: 842, height: 595 }, a4]

  it("uses the number someone asked for, within the limits", () => {
    expect(zoomFor({ fit: null, zoom: 1.5 }, sizes, room)).toBe(1.5)
    expect(zoomFor({ fit: null, zoom: 50 }, sizes, room)).toBe(MAX_ZOOM)
  })

  it("fits the widest page to the width, so no page needs scrolling sideways", () => {
    const zoom = zoomFor({ fit: "width" }, sizes, room)
    expect(842 * POINT * zoom).toBeCloseTo(1000 - GAP * 2)
  })

  it("stops at a comfortable size when left to choose", () => {
    expect(zoomFor({ fit: "auto" }, [a4], { width: 2000, height: 900 })).toBe(
      1.25
    )
    // In a narrow room it fits the width, as a phone needs.
    const narrow = zoomFor({ fit: "auto" }, [a4], { width: 360, height: 700 })
    expect(a4.width * POINT * narrow).toBeCloseTo(360 - GAP * 2)
  })

  it("shows one page whole, or the first when that page is not there", () => {
    const whole = zoomFor({ fit: "page", page: 1 }, sizes, room)
    // The landscape page is held by the room's height.
    expect(595 * POINT * whole).toBeCloseTo(700 - GAP * 2)
    expect(zoomFor({ fit: "page", page: 9 }, sizes, room)).toBe(
      zoomFor({ fit: "page", page: 0 }, sizes, room)
    )
  })

  it("is 100% when there is nothing to fit", () => {
    expect(zoomFor({ fit: "width" }, [], room)).toBe(1)
  })
})

describe("layoutColumn", () => {
  it("stacks pages with a gap around each", () => {
    expect(three.pages).toEqual([
      { top: 16, width: 100, height: 200 },
      { top: 232, width: 100, height: 200 },
      { top: 448, width: 100, height: 200 },
    ])
    expect(three.height).toBe(664)
    expect(three.width).toBe(132)
  })

  it("is as wide as its widest page", () => {
    const mixed = layoutColumn(
      [
        { width: 75, height: 150 },
        { width: 300, height: 150 },
      ],
      2
    )
    expect(mixed.pages[1].width).toBe(800)
    expect(mixed.width).toBe(800 + GAP * 2)
  })

  it("gives even an empty page a place", () => {
    const column = layoutColumn([{ width: 0, height: 0 }], 1)
    expect(column.pages[0]).toEqual({ top: 16, width: 1, height: 1 })
  })

  it("has only its padding when there are no pages", () => {
    expect(layoutColumn([], 1)).toEqual({ pages: [], width: 32, height: 16 })
  })
})

describe("pagesNear", () => {
  it("finds the pages on screen", () => {
    expect(pagesNear(three, 0, 200, 0)).toEqual({ first: 0, last: 0 })
    expect(pagesNear(three, 100, 200, 0)).toEqual({ first: 0, last: 1 })
    expect(pagesNear(three, 440, 300, 0)).toEqual({ first: 2, last: 2 })
  })

  it("reaches further with a margin", () => {
    expect(pagesNear(three, 0, 200, 100)).toEqual({ first: 0, last: 1 })
    expect(pagesNear(three, 450, 200, 300)).toEqual({ first: 0, last: 2 })
  })

  it("gives the last page when scrolled past the end", () => {
    expect(pagesNear(three, 5000, 200, 0)).toEqual({ first: 2, last: 2 })
  })

  it("has nothing to give without pages", () => {
    expect(pagesNear(layoutColumn([], 1), 0, 200, 100)).toBeNull()
  })
})

describe("currentPage", () => {
  it("is the page with most of the screen", () => {
    expect(currentPage(three, 0, 300)).toBe(0)
    // 82 pixels of page 1 against 118 of page 2.
    expect(currentPage(three, 134, 216)).toBe(1)
    expect(currentPage(three, 400, 300)).toBe(2)
  })

  it("prefers the earlier page when two have the same share", () => {
    const small = layoutColumn(
      Array.from({ length: 4 }, () => ({ width: 75, height: 30 })),
      1
    )
    expect(currentPage(small, 0, 400)).toBe(0)
  })

  it("is the last page when scrolled past the end, and the first without pages", () => {
    expect(currentPage(three, 9000, 300)).toBe(2)
    expect(currentPage(layoutColumn([], 1), 0, 300)).toBe(0)
  })
})

describe("scrollToPage", () => {
  it("puts a page at the top, with its gap", () => {
    expect(scrollToPage(three, 0)).toBe(0)
    expect(scrollToPage(three, 1)).toBe(216)
  })

  it("treats a page outside the file as the nearest end", () => {
    expect(scrollToPage(three, 99)).toBe(432)
    expect(scrollToPage(three, -5)).toBe(0)
    expect(scrollToPage(layoutColumn([], 1), 3)).toBe(0)
  })
})

describe("anchors", () => {
  it("keeps the middle of the screen in place through a zoom", () => {
    const sizes = Array.from({ length: 5 }, () => ({ width: 75, height: 150 }))
    const before = layoutColumn(sizes, 1)
    const anchor = anchorAt(before, 300, 200)
    expect(anchor.page).toBe(1)
    expect(anchor.along).toBeCloseTo((400 - 232) / 200)
    const after = layoutColumn(sizes, 2)
    const top = scrollToAnchor(after, anchor, 200)
    // The same spot of the same page is at the middle again.
    const page = after.pages[1]
    expect(top + 100).toBeCloseTo(page.top + anchor.along * page.height)
  })

  it("remembers a spot in the gap between pages", () => {
    const anchor = anchorAt(three, 120, 200)
    // The middle, 220, is in the gap after page 1, so it is held against page 2.
    expect(anchor.page).toBe(1)
    expect(anchor.along).toBeLessThan(0)
    expect(scrollToAnchor(three, anchor, 200)).toBeCloseTo(120)
  })

  it("never scrolls outside the column", () => {
    expect(scrollToAnchor(three, { page: 0, along: 0 }, 400)).toBe(0)
    expect(scrollToAnchor(three, { page: 2, along: 1 }, 400)).toBe(264)
    expect(scrollToAnchor(three, { page: 9, along: 0 }, 400)).toBe(0)
  })

  it("has a spot even without pages", () => {
    expect(anchorAt(layoutColumn([], 1), 0, 300)).toEqual({ page: 0, along: 0 })
  })
})

describe("drawEdge", () => {
  it("draws for the screen's density", () => {
    expect(drawEdge({ width: 400, height: 600 }, 2, 4000)).toBe(1200)
    expect(drawEdge({ width: 700, height: 300 }, 1.5, 4000)).toBe(1050)
  })

  it("stops at the limit and never asks for nothing", () => {
    expect(drawEdge({ width: 4000, height: 6000 }, 3, 2400)).toBe(2400)
    expect(drawEdge({ width: 0, height: 0 }, 1, 2400)).toBe(1)
  })
})

describe("parsePageNumber", () => {
  it("reads a page number as a page counted from 0", () => {
    expect(parsePageNumber("1", 10)).toBe(0)
    expect(parsePageNumber(" 10 ", 10)).toBe(9)
  })

  it("refuses what is not one of the pages", () => {
    for (const text of ["0", "11", "", "two", "1.5", "-3", "3a"])
      expect(parsePageNumber(text, 10)).toBeNull()
  })
})
