import { describe, expect, it } from "vitest"
import { boxBlur, composite, createCanvas, nearest } from "./canvas"
import { sharpenAmounts, unsharp } from "./sharpen"

const pixel = (
  image: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number
) =>
  Array.from(
    image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4
    )
  )

describe("canvas operations", () => {
  it("creates filled and transparent canvases", () => {
    const red = createCanvas({ width: 2, height: 2 }, [255, 0, 0, 255])
    expect(pixel(red, 1, 1)).toEqual([255, 0, 0, 255])
    const clear = createCanvas({ width: 2, height: 1 }, [0, 0, 0, 0])
    expect(Array.from(clear.data)).toEqual(new Array(8).fill(0))
  })

  it("composites opaque, transparent and partly transparent pixels, clipping at edges", () => {
    const canvas = createCanvas({ width: 3, height: 2 }, [0, 0, 255, 255])
    const image = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 0, 255, 255, 255, 128, 9, 9, 9, 255,
      ]),
    }
    composite(canvas, image, 2, 0)
    expect(pixel(canvas, 2, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, 1, 0)).toEqual([0, 0, 255, 255])
    const half = pixel(canvas, 2, 1)
    expect(half[0]).toBeGreaterThan(120)
    expect(half[2]).toBe(255)
    expect(half[3]).toBe(255)
    const above = createCanvas({ width: 1, height: 1 }, [0, 0, 0, 0])
    composite(above, image, 0, -1)
    expect(pixel(above, 0, 0)[3]).toBe(128)
    composite(above, image, -5, -5)
    expect(pixel(above, 0, 0)[3]).toBe(128)
    const untouched = createCanvas({ width: 2, height: 1 }, [1, 2, 3, 255])
    composite(untouched, image, 0, 0)
    expect(pixel(untouched, 1, 0)).toEqual([1, 2, 3, 255])
  })

  it("blurs towards the average and leaves flat areas alone", () => {
    const image = createCanvas({ width: 9, height: 9 }, [0, 0, 0, 255])
    image.data.set([255, 255, 255, 255], (4 * 9 + 4) * 4)
    const blurred = boxBlur(image, 1)
    expect(pixel(blurred, 4, 4)[0]).toBeLessThan(255)
    expect(pixel(blurred, 3, 4)[0]).toBeGreaterThan(0)
    expect(pixel(blurred, 4, 4)[3]).toBe(255)
    const flat = createCanvas({ width: 5, height: 5 }, [40, 80, 120, 255])
    expect(pixel(boxBlur(flat, 2), 0, 0)).toEqual([40, 80, 120, 255])
    expect(boxBlur(flat, 0)).toBe(flat)
  })

  it("scales with nearest neighbour in both directions", () => {
    const image = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([10, 0, 0, 255, 200, 0, 0, 255]),
    }
    const larger = nearest(image, { width: 4, height: 2 })
    expect([0, 1, 2, 3].map((x) => pixel(larger, x, 1)[0])).toEqual([
      10, 10, 200, 200,
    ])
    const smaller = nearest(larger, { width: 1, height: 1 })
    expect(pixel(smaller, 0, 0)[0]).toBe(200)
  })

  it("sharpens edges, keeps alpha and skips zero amounts", () => {
    const image = createCanvas({ width: 6, height: 1 }, [100, 100, 100, 200])
    for (const x of [3, 4, 5]) image.data.set([180, 180, 180, 200], x * 4)
    const sharp = unsharp(image, sharpenAmounts.strong)
    expect(pixel(sharp, 2, 0)[0]).toBeLessThan(100)
    expect(pixel(sharp, 3, 0)[0]).toBeGreaterThan(180)
    expect(pixel(sharp, 0, 0)).toEqual([100, 100, 100, 200])
    expect(unsharp(image, sharpenAmounts.off)).toBe(image)
  })
})
