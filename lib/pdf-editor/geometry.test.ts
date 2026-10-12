import { describe, expect, it } from "vitest"
import {
  angleFrom,
  boundsOf,
  boxBetween,
  centreOf,
  cornersOf,
  distanceToPath,
  distanceToSegment,
  handlePoint,
  HANDLES,
  handleSide,
  insideBox,
  keepOnPage,
  opposite,
  overlap,
  pullHandle,
  seenMiddle,
  settleAngle,
  SMALLEST,
  snap,
  turnAbout,
  turnedBounds,
  turnVector,
  wholeTurn,
  type Box,
  type Point,
} from "./geometry"

const close = (point: Point, x: number, y: number) => {
  expect(point.x).toBeCloseTo(x, 6)
  expect(point.y).toBeCloseTo(y, 6)
}
const closeBox = (
  box: Box,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  expect(box.x).toBeCloseTo(x, 6)
  expect(box.y).toBeCloseTo(y, 6)
  expect(box.width).toBeCloseTo(width, 6)
  expect(box.height).toBeCloseTo(height, 6)
}
const box: Box = { x: 100, y: 50, width: 80, height: 40 }

describe("turning", () => {
  it("brings any angle into one turn", () => {
    expect(wholeTurn(0)).toBe(0)
    expect(wholeTurn(360)).toBe(0)
    expect(wholeTurn(-90)).toBe(270)
    expect(wholeTurn(725)).toBe(5)
  })

  it("turns clockwise as seen on a page whose y runs down", () => {
    // Pointing right, a quarter turn clockwise points down.
    close(turnVector({ x: 1, y: 0 }, 90), 0, 1)
    close(turnVector({ x: 0, y: 1 }, 90), -1, 0)
    close(turnVector({ x: 3, y: 4 }, 0), 3, 4)
    close(turnAbout({ x: 110, y: 100 }, { x: 100, y: 100 }, 180), 90, 100)
  })

  it("names the angle a point lies at from a centre, clockwise from straight up", () => {
    const centre = { x: 10, y: 10 }
    expect(angleFrom(centre, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(angleFrom(centre, { x: 20, y: 10 })).toBeCloseTo(90)
    expect(angleFrom(centre, { x: 10, y: 20 })).toBeCloseTo(180)
    expect(angleFrom(centre, { x: 0, y: 10 })).toBeCloseTo(270)
  })

  it("settles on eighths of a circle when close to one", () => {
    expect(settleAngle(3)).toBe(0)
    expect(settleAngle(357)).toBe(0)
    expect(settleAngle(47)).toBe(45)
    expect(settleAngle(50)).toBe(50)
    expect(settleAngle(-92)).toBe(270)
    expect(settleAngle(10, 12)).toBe(0)
  })
})

describe("boxes", () => {
  it("knows its centre, corners and the box around them", () => {
    expect(centreOf(box)).toEqual({ x: 140, y: 70 })
    const upright = cornersOf(box, 0)
    close(upright[0], 100, 50)
    close(upright[2], 180, 90)
    // A quarter turn: as tall as it was wide.
    closeBox(turnedBounds(box, 90), 120, 30, 40, 80)
    closeBox(turnedBounds(box, 0), 100, 50, 80, 40)
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(boundsOf([{ x: 5, y: 9 }])).toEqual({
      x: 5,
      y: 9,
      width: 0,
      height: 0,
    })
  })

  it("places every handle, also on a turned box", () => {
    expect(HANDLES).toHaveLength(8)
    expect(handleSide("nw")).toEqual({ x: -1, y: -1 })
    expect(handleSide("s")).toEqual({ x: 0, y: 1 })
    expect(handleSide("e")).toEqual({ x: 1, y: 0 })
    close(handlePoint(box, 0, "nw"), 100, 50)
    close(handlePoint(box, 0, "e"), 180, 70)
    close(handlePoint(box, 0, "s"), 140, 90)
    // After a quarter turn the right-hand middle is at the bottom.
    close(handlePoint(box, 90, "e"), 140, 110)
    for (const handle of HANDLES)
      expect(opposite(opposite(handle))).toBe(handle)
    expect(opposite("ne")).toBe("sw")
  })

  it("tells whether a point is inside, with room and with a turn", () => {
    expect(insideBox({ x: 101, y: 51 }, box, 0)).toBe(true)
    expect(insideBox({ x: 99, y: 51 }, box, 0)).toBe(false)
    expect(insideBox({ x: 99, y: 51 }, box, 0, 2)).toBe(true)
    expect(insideBox({ x: 181, y: 70 }, box, 0)).toBe(false)
    expect(insideBox({ x: 140, y: 49 }, box, 0)).toBe(false)
    expect(insideBox({ x: 140, y: 91 }, box, 0)).toBe(false)
    // Turned a quarter, it reaches further down and less far across.
    expect(insideBox({ x: 140, y: 105 }, box, 90)).toBe(true)
    expect(insideBox({ x: 175, y: 70 }, box, 90)).toBe(false)
  })

  it("spans two corners whichever way round", () => {
    expect(boxBetween({ x: 9, y: 2 }, { x: 4, y: 8 })).toEqual({
      x: 4,
      y: 2,
      width: 5,
      height: 6,
    })
  })

  it("tells whether two boxes overlap", () => {
    const other = { x: 170, y: 80, width: 50, height: 50 }
    expect(overlap(box, other)).toBe(true)
    expect(overlap(other, box)).toBe(true)
    expect(overlap(box, { ...other, x: 181 })).toBe(false)
    expect(overlap(box, { ...other, y: 91 })).toBe(false)
    expect(overlap(box, { x: 0, y: 0, width: 99, height: 200 })).toBe(false)
    expect(overlap(box, { x: 0, y: 0, width: 200, height: 49 })).toBe(false)
  })

  it("keeps a box from leaving its page altogether", () => {
    const page = { width: 600, height: 800 }
    expect(keepOnPage(box, page)).toEqual(box)
    expect(keepOnPage({ ...box, x: -500, y: -500 }, page)).toMatchObject({
      x: 8 - 80,
      y: 8 - 40,
    })
    expect(keepOnPage({ ...box, x: 900, y: 900 }, page, 20)).toMatchObject({
      x: 580,
      y: 780,
    })
  })
})

describe("the part of a page that is seen", () => {
  const page = { width: 600, height: 800 }
  const view = { x: 0, y: 100, width: 1000, height: 400 }

  it("finds the middle of what shows of a page taller than its window", () => {
    // Shown at twice its size, with its top a hundred above the window's.
    const shown = { x: 100, y: 0, width: 1200, height: 1600 }
    // Across, 100 to 1000 of the screen shows; down, 100 to 500.
    expect(seenMiddle(shown, view, page)).toEqual({ x: 225, y: 150 })
  })

  it("is the page's own middle when the whole page shows", () => {
    const shown = { x: 200, y: 150, width: 300, height: 300 }
    expect(seenMiddle(shown, view, { width: 600, height: 600 })).toEqual({
      x: 300,
      y: 300,
    })
  })

  it("falls back on the page's middle when none of it shows, or it has no size", () => {
    const middle = { x: 300, y: 400 }
    expect(
      seenMiddle({ x: 0, y: 900, width: 600, height: 800 }, view, page)
    ).toEqual(middle)
    expect(
      seenMiddle({ x: 2000, y: 100, width: 600, height: 800 }, view, page)
    ).toEqual(middle)
    expect(
      seenMiddle({ x: 0, y: 100, width: 0, height: 0 }, view, page)
    ).toEqual(middle)
  })

  it("keeps away from the page's edges when asked to", () => {
    // Only the last strip of the page shows.
    const shown = { x: 0, y: -660, width: 600, height: 800 }
    expect(seenMiddle(shown, view, page).y).toBe(780)
    expect(seenMiddle(shown, view, page, 60).y).toBe(740)
    // And its first strip.
    const low = { x: 0, y: 480, width: 600, height: 800 }
    expect(seenMiddle(low, view, page).y).toBe(10)
    expect(seenMiddle(low, view, page, 60).y).toBe(60)
    // Room that a small page does not have is half of it at most.
    expect(seenMiddle(low, view, { width: 600, height: 80 }, 60).y).toBe(40)
  })
})

describe("distances", () => {
  it("measures to a stretch of line, not past its ends", () => {
    const from = { x: 0, y: 0 }
    const to = { x: 10, y: 0 }
    expect(distanceToSegment({ x: 5, y: 3 }, from, to)).toBe(3)
    expect(distanceToSegment({ x: -4, y: 3 }, from, to)).toBe(5)
    expect(distanceToSegment({ x: 14, y: 3 }, from, to)).toBe(5)
    // A stretch of no length is a point.
    expect(distanceToSegment({ x: 3, y: 4 }, from, from)).toBe(5)
  })

  it("measures to a line through several points", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    expect(distanceToPath({ x: 12, y: 5 }, path)).toBe(2)
    expect(distanceToPath({ x: 5, y: -1 }, path)).toBe(1)
    expect(distanceToPath({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBe(5)
    expect(distanceToPath({ x: 3, y: 4 }, [])).toBe(Infinity)
  })
})

describe("pullHandle", () => {
  it("moves one corner and leaves the one across from it", () => {
    closeBox(pullHandle(box, 0, "se", { x: 200, y: 120 }), 100, 50, 100, 70)
    closeBox(pullHandle(box, 0, "nw", { x: 90, y: 30 }), 90, 30, 90, 60)
  })

  it("moves one side and leaves the other three", () => {
    closeBox(pullHandle(box, 0, "e", { x: 220, y: 500 }), 100, 50, 120, 40)
    closeBox(pullHandle(box, 0, "n", { x: -30, y: 20 }), 100, 20, 80, 70)
    closeBox(pullHandle(box, 0, "w", { x: 60, y: 0 }), 60, 50, 120, 40)
    closeBox(pullHandle(box, 0, "s", { x: 0, y: 100 }), 100, 50, 80, 50)
  })

  it("never turns a box inside out or makes it vanish", () => {
    const pulled = pullHandle(box, 0, "se", { x: 0, y: 0 })
    expect(pulled.width).toBe(SMALLEST)
    expect(pulled.height).toBe(SMALLEST)
    // The top left corner has not moved.
    expect(pulled.x).toBeCloseTo(100)
    expect(pulled.y).toBeCloseTo(50)
  })

  it("keeps the shape when asked, by the side that grew more", () => {
    closeBox(
      pullHandle(box, 0, "se", { x: 260, y: 95 }, true),
      100,
      50,
      160,
      80
    )
    closeBox(
      pullHandle(box, 0, "se", { x: 185, y: 130 }, true),
      100,
      50,
      160,
      80
    )
    // A side handle has no shape to keep.
    closeBox(pullHandle(box, 0, "e", { x: 260, y: 0 }, true), 100, 50, 160, 40)
  })

  it("works on a turned box: the corner across stays where it is on the page", () => {
    const anchor = handlePoint(box, 30, "nw")
    const pulled = pullHandle(box, 30, "se", { x: 230, y: 160 })
    close(handlePoint(pulled, 30, "nw"), anchor.x, anchor.y)
    // And the corner that was pulled is where it was pulled to.
    close(handlePoint(pulled, 30, "se"), 230, 160)
  })
})

describe("snap", () => {
  const page = { x: 0, y: 0, width: 600, height: 800 }

  it("lines an edge or the middle up with what is near", () => {
    // Its left edge is 3 points from the page's.
    expect(snap({ x: 3, y: 300, width: 50, height: 20 }, [page], 5)).toEqual({
      dx: -3,
      dy: 0,
      guides: [{ axis: "x", at: 0 }],
    })
    // Its middle is 2 points from the page's middle, both ways.
    const middle = snap({ x: 273, y: 392, width: 50, height: 20 }, [page], 5)
    expect(middle.dx).toBe(2)
    expect(middle.dy).toBe(-2)
    expect(middle.guides).toEqual([
      { axis: "x", at: 300 },
      { axis: "y", at: 400 },
    ])
  })

  it("takes the nearest of several, and nothing out of reach", () => {
    const other = { x: 104, y: 500, width: 40, height: 40 }
    const result = snap(
      { x: 100, y: 100, width: 10, height: 10 },
      [page, other],
      6
    )
    // Its middle, at 105, is one point from the other box's left edge:
    // nearer than its own left edge is, and than anything of the page.
    expect(result.dx).toBe(-1)
    expect(result.guides).toEqual([{ axis: "x", at: 104 }])
    expect(snap({ x: 50, y: 50, width: 10, height: 10 }, [page], 5)).toEqual({
      dx: 0,
      dy: 0,
      guides: [],
    })
    expect(snap({ x: 50, y: 50, width: 10, height: 10 }, [], 5).guides).toEqual(
      []
    )
  })
})
