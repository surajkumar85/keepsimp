import { describe, expect, it } from "vitest"
import {
  fromRgba,
  greyMatches,
  joinCmyk,
  sameBytes,
  samplePixels,
  splitCmyk,
  tight,
  TILE,
  toRgba,
} from "./pixels"

describe("tight", () => {
  it("drops the padding at the end of each row", () => {
    expect([...tight([1, 2, 3, 0, 4, 5, 6, 0], 1, 2, 4, 3)]).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
  })
})

describe("toRgba and fromRgba", () => {
  it("carry colour both ways", () => {
    const rgb = new Uint8Array([10, 20, 30, 40, 50, 60])
    const pixels = toRgba(rgb, 2, 1, 3)
    expect([...pixels.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
    expect([...fromRgba(pixels, 3)]).toEqual([...rgb])
  })

  it("carry grey both ways", () => {
    const grey = new Uint8Array([7, 200])
    const pixels = toRgba(grey, 1, 2, 1)
    expect([...pixels.data]).toEqual([7, 7, 7, 255, 200, 200, 200, 255])
    expect([...fromRgba(pixels, 1)]).toEqual([...grey])
  })
})

describe("splitCmyk and joinCmyk", () => {
  it("take four channels apart and put them back", () => {
    const cmyk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const { colour, black } = splitCmyk(cmyk, 2, 1)
    expect([...colour.data]).toEqual([1, 2, 3, 255, 5, 6, 7, 255])
    expect([...black.data]).toEqual([4, 4, 4, 255, 8, 8, 8, 255])
    expect([...joinCmyk(colour, black)]).toEqual([...cmyk])
  })
})

describe("sameBytes", () => {
  it("compares length and every byte", () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(
      false
    )
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false)
  })
})

describe("greyMatches", () => {
  const grey = new Uint8Array([9, 80])

  it("accepts colour bytes that are exactly these greys", () => {
    expect(greyMatches(new Uint8Array([9, 9, 9, 80, 80, 80]), grey)).toBe(true)
  })

  it("refuses any channel that differs, or a different size", () => {
    expect(greyMatches(new Uint8Array([8, 9, 9, 80, 80, 80]), grey)).toBe(false)
    expect(greyMatches(new Uint8Array([9, 8, 9, 80, 80, 80]), grey)).toBe(false)
    expect(greyMatches(new Uint8Array([9, 9, 9, 80, 80, 81]), grey)).toBe(false)
    expect(greyMatches(new Uint8Array([9, 9, 9]), grey)).toBe(false)
  })
})

describe("samplePixels", () => {
  /** Every pixel says where it is: its column in red and green, its row in blue and alpha. */
  const picture = (width: number, height: number) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        data.set([x >> 8, x & 255, y >> 8, y & 255], (y * width + x) * 4)
    return { data, width, height }
  }
  const at = (pixels: ReturnType<typeof picture>, x: number, y: number) => {
    const [a, b, c, d] = pixels.data.subarray((y * pixels.width + x) * 4)
    return { x: (a << 8) | b, y: (c << 8) | d }
  }

  it("is the picture itself when the picture is small enough", () => {
    const small = picture(300, 300)
    expect(samplePixels(small, 100_000)).toBe(small)
    const narrow = picture(100, 4000)
    expect(samplePixels(narrow, 1000)).toBe(narrow)
    const flat = picture(4000, 100)
    expect(samplePixels(flat, 1000)).toBe(flat)
  })

  it("takes tiles from the middle of equal parts of the picture", () => {
    const large = picture(2000, 1000)
    const sample = samplePixels(large, 6 * TILE * TILE)
    expect(sample.width).toBe(3 * TILE)
    expect(sample.height).toBe(2 * TILE)
    // Three columns of 667 pixels, two rows of 500: the tiles start 128 before each middle.
    expect(at(sample, 0, 0)).toEqual({ x: 205, y: 122 })
    expect(at(sample, TILE, 0)).toEqual({ x: 872, y: 122 })
    expect(at(sample, 2 * TILE + 5, TILE + 9)).toEqual({ x: 1543, y: 631 })
  })

  it("takes fewer tiles than asked when the picture has no room for them", () => {
    const strip = picture(3000, 300)
    const sample = samplePixels(strip, 8 * TILE * TILE)
    expect(sample.width).toBe(3 * TILE)
    expect(sample.height).toBe(TILE)
    const tall = samplePixels(picture(300, 3000), 4 * TILE * TILE)
    expect(tall.width).toBe(TILE)
    expect(tall.height).toBe(4 * TILE)
  })

  it("takes one tile when the budget allows no more", () => {
    const sample = samplePixels(picture(1000, 1000), 10)
    expect(sample.width).toBe(TILE)
    expect(sample.height).toBe(TILE)
    expect(at(sample, 0, 0)).toEqual({ x: 372, y: 372 })
  })
})
