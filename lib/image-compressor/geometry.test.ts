import { describe, expect, it } from "vitest"
import {
  aspectValue,
  clampCrop,
  downscaleStep,
  flipCrop,
  initialCrop,
  moveCrop,
  orientedSize,
  planPipeline,
  resizeCrop,
  resolveResize,
  rotate,
  rotateCrop,
  validateSize,
  type CropHandle,
} from "./geometry"

const photo = { width: 4000, height: 3000 }

describe("rotation", () => {
  it("turns in both directions and wraps around", () => {
    expect(rotate(0, "right")).toBe(90)
    expect(rotate(270, "right")).toBe(0)
    expect(rotate(0, "left")).toBe(270)
    expect(rotate(90, "left")).toBe(0)
  })

  it("swaps axes only for quarter turns", () => {
    expect(orientedSize(photo, 90)).toEqual({ width: 3000, height: 4000 })
    expect(orientedSize(photo, 270)).toEqual({ width: 3000, height: 4000 })
    expect(orientedSize(photo, 180)).toEqual(photo)
    expect(orientedSize(photo, 0)).not.toBe(photo)
  })
})

describe("size limits", () => {
  it.each([
    [{ width: 0, height: 10 }, "whole-number"],
    [{ width: 10.5, height: 10 }, "whole-number"],
    [{ width: 16384, height: 10 }, "16,383"],
    [{ width: 10, height: 16384 }, "16,383"],
    [{ width: 10000, height: 6000 }, "50 megapixels"],
  ])("rejects %o", (size, message) => {
    expect(validateSize(size)).toContain(message)
  })

  it("accepts the largest allowed sizes", () => {
    expect(validateSize({ width: 16383, height: 3000 })).toBeNull()
    expect(validateSize({ width: 1, height: 1 })).toBeNull()
  })
})

describe("resizing", () => {
  it("keeps the original or scales by a percentage", () => {
    expect(resolveResize(photo, { kind: "original" }).output).toEqual(photo)
    expect(resolveResize(photo, { kind: "scale", percent: 25 }).output).toEqual(
      { width: 1000, height: 750 }
    )
    expect(
      resolveResize({ width: 3, height: 1 }, { kind: "scale", percent: 1 })
        .output
    ).toEqual({ width: 1, height: 1 })
    expect(() => resolveResize(photo, { kind: "scale", percent: 0 })).toThrow(
      "above 0%"
    )
  })

  it("fits the long edge for landscape and portrait images", () => {
    expect(
      resolveResize(photo, { kind: "long-edge", pixels: 1920 }).output
    ).toEqual({ width: 1920, height: 1440 })
    expect(
      resolveResize(
        { width: 3000, height: 4000 },
        { kind: "long-edge", pixels: 1000 }
      ).output
    ).toEqual({ width: 750, height: 1000 })
    expect(() =>
      resolveResize(photo, { kind: "long-edge", pixels: -1 })
    ).toThrow("long edge")
  })

  const custom = (
    width: number | null,
    height: number | null,
    extra: Partial<{
      unit: "px" | "percent"
      lock: boolean
      fit: "contain" | "cover" | "stretch"
    }> = {}
  ) =>
    resolveResize(photo, {
      kind: "custom",
      width,
      height,
      unit: "px",
      lock: true,
      fit: "contain",
      ...extra,
    })

  it("keeps proportions from whichever side is given", () => {
    expect(custom(800, null).output).toEqual({ width: 800, height: 600 })
    expect(custom(null, 300).output).toEqual({ width: 400, height: 300 })
    expect(custom(800, 50).output).toEqual({ width: 800, height: 600 })
    expect(custom(800, null, { lock: false }).output).toEqual({
      width: 800,
      height: 600,
    })
  })

  it("supports percentages per side", () => {
    expect(custom(50, null, { unit: "percent" }).output).toEqual({
      width: 2000,
      height: 1500,
    })
    expect(
      custom(50, 10, { unit: "percent", lock: false, fit: "stretch" }).output
    ).toEqual({ width: 2000, height: 300 })
  })

  it("fits inside, fills and crops, or stretches an unlocked box", () => {
    expect(custom(1000, 1000, { lock: false }).output).toEqual({
      width: 1000,
      height: 750,
    })
    expect(custom(1000, 1000, { lock: false, fit: "stretch" })).toEqual({
      output: { width: 1000, height: 1000 },
      region: { x: 0, y: 0, ...photo },
    })
    expect(custom(1000, 1000, { lock: false, fit: "cover" })).toEqual({
      output: { width: 1000, height: 1000 },
      region: { x: 500, y: 0, width: 3000, height: 3000 },
    })
    expect(custom(1000, 100, { lock: false, fit: "cover" }).region).toEqual({
      x: 0,
      y: 1300,
      width: 4000,
      height: 400,
    })
  })

  it("explains missing or invalid custom dimensions", () => {
    expect(() => custom(null, null)).toThrow("width or a height")
    expect(() => custom(0, null)).toThrow("greater than zero")
    expect(() => custom(null, -5)).toThrow("greater than zero")
  })
})

describe("crop rectangles", () => {
  it("resolves aspect presets", () => {
    expect(aspectValue("free", photo)).toBeNull()
    expect(aspectValue("original", photo)).toBeCloseTo(4 / 3)
    expect(aspectValue("16:9", photo)).toBeCloseTo(16 / 9)
    expect(aspectValue("9:16", photo)).toBeCloseTo(9 / 16)
  })

  it("starts with the largest centred crop for the ratio", () => {
    expect(initialCrop(photo, null)).toEqual({ x: 0, y: 0, ...photo })
    expect(initialCrop(photo, 1)).toEqual({
      x: 500,
      y: 0,
      width: 3000,
      height: 3000,
    })
    expect(initialCrop({ width: 3000, height: 4000 }, 16 / 9)).toEqual({
      x: 0,
      y: 1156,
      width: 3000,
      height: 1688,
    })
    expect(initialCrop({ width: 1, height: 1 }, 1000)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it("rounds and keeps rectangles inside the image", () => {
    expect(
      clampCrop({ x: -10, y: 2990.4, width: 5000, height: 0.2 }, photo)
    ).toEqual({ x: 0, y: 2990, width: 4000, height: 1 })
    expect(
      moveCrop({ x: 10, y: 10, width: 100, height: 100 }, 5000, -50, photo)
    ).toEqual({ x: 3900, y: 0, width: 100, height: 100 })
  })

  const box = { x: 1000, y: 1000, width: 1000, height: 500 }

  it.each<[CropHandle, number, number, object]>([
    ["e", 200, 0, { x: 1000, y: 1000, width: 1200, height: 500 }],
    ["w", -200, 0, { x: 800, y: 1000, width: 1200, height: 500 }],
    ["n", 0, -100, { x: 1000, y: 900, width: 1000, height: 600 }],
    ["s", 0, 100, { x: 1000, y: 1000, width: 1000, height: 600 }],
    ["se", 100, 100, { x: 1000, y: 1000, width: 1100, height: 600 }],
    ["nw", -100, -100, { x: 900, y: 900, width: 1100, height: 600 }],
    ["w", 5000, 0, { x: 1999, y: 1000, width: 1, height: 500 }],
    ["e", 9000, 0, { x: 1000, y: 1000, width: 3000, height: 500 }],
  ])("freely resizes from %s", (handle, dx, dy, expected) => {
    expect(resizeCrop(box, handle, dx, dy, photo, null)).toEqual(expected)
  })

  it("keeps the ratio and anchors the opposite side", () => {
    expect(resizeCrop(box, "e", 200, 0, photo, 2)).toEqual({
      x: 1000,
      y: 950,
      width: 1200,
      height: 600,
    })
    expect(resizeCrop(box, "s", 0, 100, photo, 2)).toEqual({
      x: 900,
      y: 1000,
      width: 1200,
      height: 600,
    })
    expect(resizeCrop(box, "nw", -400, 0, photo, 2)).toEqual({
      x: 600,
      y: 800,
      width: 1400,
      height: 700,
    })
    expect(resizeCrop(box, "se", 0, 400, photo, 2)).toEqual({
      x: 1000,
      y: 1000,
      width: 1800,
      height: 900,
    })
  })

  it("shrinks a ratio-locked crop to fit the image edges", () => {
    const result = resizeCrop(box, "se", 9000, 9000, photo, 2)
    expect(result).toEqual({ x: 1000, y: 1000, width: 3000, height: 1500 })
    const centred = resizeCrop(
      { x: 100, y: 100, width: 200, height: 200 },
      "e",
      3000,
      0,
      photo,
      1
    )
    expect(centred.height).toBeLessThanOrEqual(400)
    expect(centred.y).toBeGreaterThanOrEqual(0)
    expect(centred.width).toBe(centred.height)
    const north = resizeCrop(box, "n", 0, -5000, photo, 2)
    expect(north.y).toBe(0)
    expect(north.width).toBe(north.height * 2)
  })

  it("follows the pixels through rotation and flips", () => {
    const rect = { x: 100, y: 200, width: 300, height: 400 }
    const right = rotateCrop(rect, photo, "right")
    expect(right).toEqual({ x: 2400, y: 100, width: 400, height: 300 })
    expect(rotateCrop(right, orientedSize(photo, 90), "left")).toEqual(rect)
    expect(flipCrop(rect, photo, "x")).toEqual({ ...rect, x: 3600 })
    expect(flipCrop(rect, photo, "y")).toEqual({ ...rect, y: 2400 })
  })
})

describe("pipeline plan", () => {
  it("combines rotation, crop and a fill-and-crop resize", () => {
    expect(
      planPipeline({
        source: photo,
        rotation: 90,
        flipX: true,
        flipY: false,
        crop: { x: 0, y: 1000, width: 3000, height: 2000 },
        resize: {
          kind: "custom",
          width: 500,
          height: 500,
          unit: "px",
          lock: false,
          fit: "cover",
        },
      })
    ).toEqual({
      rotation: 90,
      flipX: true,
      flipY: false,
      sourceRect: { x: 500, y: 1000, width: 2000, height: 2000 },
      output: { width: 500, height: 500 },
    })
  })

  it("uses the whole oriented image without a crop and validates the output", () => {
    const plan = planPipeline({
      source: photo,
      rotation: 0,
      flipX: false,
      flipY: false,
      crop: null,
      resize: { kind: "original" },
    })
    expect(plan.sourceRect).toEqual({ x: 0, y: 0, ...photo })
    expect(() =>
      planPipeline({
        source: photo,
        rotation: 0,
        flipX: false,
        flipY: false,
        crop: null,
        resize: { kind: "scale", percent: 1000 },
      })
    ).toThrow("16,383")
  })

  it("steps dimensions down until they stop being useful", () => {
    expect(downscaleStep({ width: 1000, height: 500 })).toEqual({
      width: 850,
      height: 425,
    })
    expect(downscaleStep({ width: 18, height: 2 })).toBeNull()
    expect(downscaleStep({ width: 1, height: 1 }, 0.5)).toBeNull()
  })
})
