import { describe, expect, it } from "vitest"
import {
  contentKind,
  flatFraction,
  luma,
  similarity,
  ssim,
  SSIM_MAX_PIXELS,
  type Pixels,
} from "./ssim"

function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number?]
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  return { data, width, height }
}

const texture = image(64, 64, (x, y) => {
  const v = (x * 37 + y * 91 + ((x * y) % 13) * 17) % 256
  return [v, v, v]
})

describe("luma", () => {
  it("weights channels and composites transparency over white", () => {
    const pixels = image(2, 1, (x) => (x === 0 ? [255, 0, 0] : [0, 0, 0, 0]))
    const { values } = luma(pixels)
    expect(values[0]).toBeCloseTo(0.2126 * 255, 3)
    expect(values[1]).toBe(255)
  })

  it("box-averages when downsampling and drops ragged edges", () => {
    const pixels = image(3, 3, (x, y) =>
      x + y === 0 ? [0, 0, 0] : [255, 255, 255]
    )
    const result = luma(pixels, 2)
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(result.values[0]).toBeCloseTo((255 * 3) / 4, 3)
  })
})

describe("similarity", () => {
  it("is 1 for identical images", () => {
    expect(ssim(texture, texture)).toBeCloseTo(1, 10)
    expect(similarity(texture, texture).worst).toBeCloseTo(1, 10)
  })

  it("drops as noise increases, and the worst windows drop further", () => {
    const noisy = (amount: number) =>
      image(64, 64, (x, y) => {
        const i = (y * 64 + x) * 4
        const v = texture.data[i] + (((x * 7 + y * 13) % 5) - 2) * amount
        return [v, v, v]
      })
    const light = similarity(texture, noisy(2))
    const heavy = similarity(texture, noisy(12))
    expect(light.mean).toBeLessThan(1)
    expect(heavy.mean).toBeLessThan(light.mean)
    expect(heavy.worst).toBeLessThanOrEqual(heavy.mean)
  })

  it("catches local damage that a mean hides", () => {
    const page = image(128, 128, () => [255, 255, 255])
    const damaged = image(128, 128, (x, y) =>
      x < 8 && y < 8 ? [((x + y) % 2) * 255, 0, 0] : [255, 255, 255]
    )
    const value = similarity(page, damaged)
    expect(value.mean).toBeGreaterThan(0.95)
    expect(value.worst).toBeLessThan(0.7)
  })

  it("handles images smaller than one window", () => {
    const tiny = image(3, 2, () => [10, 20, 30])
    expect(ssim(tiny, tiny)).toBeCloseTo(1, 10)
  })

  it("downsamples very large images before comparing", () => {
    const side = Math.ceil(Math.sqrt(SSIM_MAX_PIXELS)) + 8
    const big = {
      data: new Uint8ClampedArray(side * side * 4).fill(128),
      width: side,
      height: side,
    }
    expect(ssim(big, big)).toBeCloseTo(1, 10)
    expect(flatFraction(big)).toBe(1)
  })

  it("requires equal dimensions", () => {
    expect(() =>
      ssim(
        texture,
        image(32, 64, () => [0, 0, 0])
      )
    ).toThrow("same dimensions")
  })
})

describe("content kind", () => {
  it("treats mostly flat images as graphics and textured ones as photos", () => {
    const graphic = image(64, 64, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255]))
    expect(flatFraction(graphic)).toBeGreaterThan(0.6)
    expect(contentKind(graphic)).toBe("graphic")
    expect(flatFraction(texture)).toBe(0)
    expect(contentKind(texture)).toBe("photo")
  })
})
