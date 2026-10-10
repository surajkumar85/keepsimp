import { describe, expect, it } from "vitest"
import {
  anchorOf,
  anchors,
  clampFocus,
  focusForOffset,
  focusForPoint,
  nudgeFocus,
  orientFocus,
  placeWindow,
} from "./focus"

describe("focus", () => {
  it("lists nine anchors and recognises them", () => {
    expect(anchors).toHaveLength(9)
    expect(anchorOf({ x: 0.5, y: 0.5 })).toBe("center")
    expect(anchorOf({ x: 1, y: 0 })).toBe("top-right")
    expect(anchorOf({ x: 0.3, y: 0.5 })).toBeNull()
  })

  it("clamps and nudges within the image", () => {
    expect(clampFocus({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 })
    expect(nudgeFocus({ x: 0.5, y: 0.5 }, 0.1, -0.2)).toEqual({
      x: 0.6,
      y: 0.3,
    })
    expect(nudgeFocus({ x: 0.95, y: 0 }, 0.1, -0.1)).toEqual({ x: 1, y: 0 })
  })

  it("slides a window from start to end", () => {
    expect(placeWindow(1000, 400, 0)).toBe(0)
    expect(placeWindow(1000, 400, 0.5)).toBe(300)
    expect(placeWindow(1000, 400, 1)).toBe(600)
    expect(placeWindow(400, 400, 0.7)).toBe(0)
    expect(placeWindow(300, 400, 0.7)).toBe(0)
  })

  it("inverts offsets and centres on points", () => {
    expect(focusForOffset(1000, 400, 300)).toBe(0.5)
    expect(focusForOffset(1000, 400, 900)).toBe(1)
    expect(focusForOffset(1000, 400, -50)).toBe(0)
    expect(focusForOffset(400, 400, 0)).toBe(0.5)
    expect(focusForPoint(1000, 400, 0.5)).toBe(0.5)
    expect(focusForPoint(1000, 400, 0.1)).toBe(0)
    expect(focusForPoint(1000, 400, 2)).toBe(1)
  })

  it("follows rotation and flips", () => {
    const corner = { x: 0, y: 0 }
    expect(orientFocus(corner, 0, false, false)).toEqual({ x: 0, y: 0 })
    expect(orientFocus(corner, 90, false, false)).toEqual({ x: 1, y: 0 })
    expect(orientFocus(corner, 180, false, false)).toEqual({ x: 1, y: 1 })
    expect(orientFocus(corner, 270, false, false)).toEqual({ x: 0, y: 1 })
    expect(orientFocus(corner, 0, true, false)).toEqual({ x: 1, y: 0 })
    expect(orientFocus(corner, 0, false, true)).toEqual({ x: 0, y: 1 })
    expect(orientFocus({ x: 0.2, y: 0.7 }, 90, true, true)).toEqual({
      x: 0.7,
      y: 0.8,
    })
  })
})
