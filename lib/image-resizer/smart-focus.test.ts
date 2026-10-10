import { describe, expect, it } from "vitest"
import { saliency, smartFocus } from "./smart-focus"

function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number?]
) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  return { data, width, height }
}

const busy = (x: number, y: number): [number, number, number] =>
  (x + y) % 2 ? [20, 20, 20] : [235, 235, 235]
const flat: [number, number, number] = [128, 128, 128]

describe("smart focus", () => {
  it("moves a square crop to the detailed part of a wide image", () => {
    const right = image(300, 100, (x, y) => (x >= 220 ? busy(x, y) : flat))
    expect(smartFocus(right, 1).x).toBeGreaterThan(0.85)
    const left = image(300, 100, (x, y) => (x < 80 ? busy(x, y) : flat))
    expect(smartFocus(left, 1).x).toBeLessThan(0.15)
  })

  it("moves a wide crop vertically on a tall image", () => {
    const bottom = image(100, 300, (x, y) => (y >= 230 ? busy(x, y) : flat))
    const focus = smartFocus(bottom, 2)
    expect(focus.y).toBeGreaterThan(0.85)
    expect(focus.x).toBe(0.5)
  })

  it("prefers skin tones and saturated colour over flat grey", () => {
    const skin = image(300, 100, (x) => (x < 60 ? [200, 150, 120] : flat))
    expect(smartFocus(skin, 1).x).toBeLessThan(0.2)
    const colour = image(300, 100, (x) => (x >= 240 ? [230, 30, 30] : flat))
    expect(smartFocus(colour, 1).x).toBeGreaterThan(0.8)
  })

  it("stays centred when nothing stands out, and ignores transparent pixels", () => {
    const plain = image(300, 100, () => flat)
    expect(smartFocus(plain, 1)).toEqual({ x: 0.5, y: 0.5 })
    const ghost = image(300, 100, (x, y) =>
      x < 60 ? [...busy(x, y), 0] : flat
    )
    // Hidden detail is ignored; only the visible edge of the transparent area counts.
    expect(smartFocus(ghost, 1).x).toBeGreaterThan(0.2)
    const dark = image(300, 100, (x) => (x < 60 ? [5, 0, 0] : [0, 0, 0]))
    expect(saliency(dark).table.at(-1)).toBeLessThan(5)
  })

  it("handles tiny images and extreme shapes", () => {
    const dot = image(1, 1, () => [255, 0, 0])
    expect(smartFocus(dot, 1)).toEqual({ x: 0.5, y: 0.5 })
    const strip = image(200, 4, busy)
    for (const aspect of [0.01, 100]) {
      const focus = smartFocus(strip, aspect)
      expect(focus.x).toBeGreaterThanOrEqual(0)
      expect(focus.x).toBeLessThanOrEqual(1)
      expect(focus.y).toBeGreaterThanOrEqual(0)
      expect(focus.y).toBeLessThanOrEqual(1)
    }
  })
})
