import { describe, expect, it } from "vitest"
import {
  extractOriented,
  flattenAlpha,
  hasTransparency,
  parseHexColor,
} from "./pixels"
import type { Rotation } from "./geometry"

/** A 3×2 image whose red channel holds each pixel's index: 0 1 2 / 3 4 5. */
const source = {
  width: 3,
  height: 2,
  data: new Uint8ClampedArray(
    Array.from({ length: 6 }, (_, i) => [i, 0, 0, 255]).flat()
  ),
}
const red = (pixels: { data: Uint8ClampedArray }) =>
  Array.from(pixels.data.filter((_, i) => i % 4 === 0))

describe("orientation and crop extraction", () => {
  it.each<[Rotation, boolean, boolean, number[], number, number]>([
    [0, false, false, [0, 1, 2, 3, 4, 5], 3, 2],
    [90, false, false, [3, 0, 4, 1, 5, 2], 2, 3],
    [180, false, false, [5, 4, 3, 2, 1, 0], 3, 2],
    [270, false, false, [2, 5, 1, 4, 0, 3], 2, 3],
    [0, true, false, [2, 1, 0, 5, 4, 3], 3, 2],
    [0, false, true, [3, 4, 5, 0, 1, 2], 3, 2],
    [90, true, false, [0, 3, 1, 4, 2, 5], 2, 3],
  ])(
    "rotates %i° (flip x %s, flip y %s)",
    (rotation, flipX, flipY, expected, width, height) => {
      const result = extractOriented(source, rotation, flipX, flipY, {
        x: 0,
        y: 0,
        width,
        height,
      })
      expect(red(result)).toEqual(expected)
      expect([result.width, result.height]).toEqual([width, height])
    }
  )

  it("reads only the requested region", () => {
    const result = extractOriented(source, 90, false, false, {
      x: 1,
      y: 1,
      width: 1,
      height: 2,
    })
    expect(red(result)).toEqual([1, 2])
  })
})

describe("transparency", () => {
  it("detects any partially transparent pixel", () => {
    expect(hasTransparency(source)).toBe(false)
    const clear = { ...source, data: source.data.slice() }
    clear.data[23] = 254
    expect(hasTransparency(clear)).toBe(true)
  })

  it("composites over a background colour", () => {
    const pixels = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([200, 100, 0, 0, 200, 100, 0, 255]),
    }
    const flat = flattenAlpha(pixels, [10, 20, 30])
    expect(Array.from(flat.data)).toEqual([10, 20, 30, 255, 200, 100, 0, 255])
  })

  it("parses six-digit hex colours", () => {
    expect(parseHexColor("#00786f")).toEqual([0, 120, 111])
    expect(parseHexColor(" FFFFFF ")).toEqual([255, 255, 255])
    expect(parseHexColor("#fff")).toBeNull()
    expect(parseHexColor("teal")).toBeNull()
  })
})
