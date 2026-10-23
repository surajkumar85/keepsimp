import { describe, expect, it } from "vitest"
import {
  boxCrop,
  centred,
  isWholeBox,
  moved,
  reshaped,
  resized,
  SMALLEST_BOX,
  WHOLE,
} from "./frame"

const WIDE = 16 / 9
const close = (box: object) =>
  Object.fromEntries(
    Object.entries(box).map(([key, value]) => [
      key,
      Math.round((value as number) * 1e6) / 1e6,
    ])
  )

describe("a crop box", () => {
  it("starts as the largest box of a shape around the middle", () => {
    expect(centred(null, WIDE)).toBe(WHOLE)
    expect(close(centred(9 / 16, WIDE))).toEqual(
      close({ x: (1 - 81 / 256) / 2, y: 0, width: 81 / 256, height: 1 })
    )
    // Wider than the picture: the full width, less height.
    expect(close(centred(21 / 9, WIDE))).toEqual(
      close({ x: 0, y: (1 - 16 / 21) / 2, width: 1, height: 16 / 21 })
    )
    expect(isWholeBox(WHOLE)).toBe(true)
    expect(isWholeBox(centred(1, WIDE))).toBe(false)
  })

  it("moves inside the picture", () => {
    const box = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }
    expect(moved(box, 0.1, -0.1)).toEqual({
      ...box,
      x: 0.30000000000000004,
      y: 0.1,
    })
    expect(moved(box, 1, 1)).toEqual({ ...box, x: 0.5, y: 0.5 })
    expect(moved(box, -1, -1)).toEqual({ ...box, x: 0, y: 0 })
  })

  it("is resized by a corner, the opposite one held, inside the picture", () => {
    const box = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }
    expect(close(resized(box, "bottom-right", 0.1, 0.2, null, WIDE))).toEqual(
      close({ x: 0.2, y: 0.2, width: 0.6, height: 0.7 })
    )
    expect(close(resized(box, "top-left", -0.5, -0.5, null, WIDE))).toEqual(
      close({ x: 0, y: 0, width: 0.7, height: 0.7 })
    )
    // Never smaller than the smallest box.
    expect(close(resized(box, "top-right", -1, 1, null, WIDE))).toEqual(
      close({
        x: 0.2,
        y: 0.7 - SMALLEST_BOX,
        width: SMALLEST_BOX,
        height: SMALLEST_BOX,
      })
    )
  })

  it("keeps its shape when resized with one", () => {
    const square = centred(1, WIDE)
    const bigger = resized(square, "bottom-left", -0.1, 0.02, 1, WIDE)
    // Square in pixels: its share of the height is 16/9 its share of the width.
    expect(bigger.height / bigger.width).toBeCloseTo(WIDE, 9)
    expect(bigger.x + bigger.width).toBeCloseTo(square.x + square.width, 9)
    // Dragged past the picture's edge, it stops at the edge in its shape.
    const most = resized(square, "bottom-right", 0, 1, 1, WIDE)
    expect(most.height).toBeLessThanOrEqual(1)
    expect(most.height / most.width).toBeCloseTo(WIDE, 9)
    // Dragged down to nothing, it stays at least the smallest box.
    const least = resized(square, "top-left", 1, 0, 1, WIDE)
    expect(Math.min(least.width, least.height)).toBeGreaterThanOrEqual(
      SMALLEST_BOX - 1e-9
    )
  })

  it("grows a very wide shape back to the smallest box's height", () => {
    const strip = centred(4, WIDE)
    const least = resized(strip, "bottom-right", -1, 0, 4, WIDE)
    expect(least.height).toBeCloseTo(SMALLEST_BOX, 9)
    expect(least.width / least.height).toBeCloseTo(4 / WIDE, 9)
  })

  it("takes another shape inside itself, about its middle", () => {
    const box = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
    expect(reshaped(box, null, WIDE)).toBe(box)
    const tall = reshaped(box, 9 / 16, WIDE)
    expect(tall.height).toBe(0.8)
    expect(tall.x + tall.width / 2).toBeCloseTo(0.5, 9)
    const wide = reshaped({ ...box, width: 0.2 }, 16 / 9, WIDE)
    expect(wide.width).toBe(0.2)
    expect(wide.height).toBeCloseTo(0.2, 9)
  })
})

describe("the rectangle cropped", () => {
  const box = { x: 0.25, y: 0.1, width: 0.5, height: 0.6 }
  it("is in pixels of the picture as shown, with even sides", () => {
    expect(boxCrop(box, 1920, 1080, 0, false)).toEqual({
      left: 480,
      top: 108,
      width: 960,
      height: 648,
    })
    expect(
      boxCrop({ x: 0, y: 0, width: 0.333, height: 0.333 }, 99, 99, 0, false)
    ).toEqual({ left: 0, top: 0, width: 32, height: 32 })
  })

  it("lands where the turn and mirror put it", () => {
    // A quarter turn right: the top of the picture becomes its right side.
    expect(boxCrop(box, 1920, 1080, 90, false)).toEqual({
      left: 324,
      top: 480,
      width: 648,
      height: 960,
    })
    expect(boxCrop(box, 1920, 1080, 180, false)).toEqual({
      left: 480,
      top: 324,
      width: 960,
      height: 648,
    })
    expect(boxCrop(box, 1920, 1080, 270, false)).toEqual({
      left: 108,
      top: 480,
      width: 648,
      height: 960,
    })
    expect(boxCrop({ ...box, x: 0 }, 1920, 1080, 0, true)).toEqual({
      left: 960,
      top: 108,
      width: 960,
      height: 648,
    })
  })
})
