import { describe, expect, it } from "vitest"
import {
  backgroundRgb,
  buildPlan,
  candidateFormats,
  chooseAspect,
  cropBounds,
  defaultSettings,
  flipView,
  isEdited,
  linkedDimension,
  losslessAvailable,
  originalOutput,
  resizeMode,
  rotateView,
  settingsForImage,
  targetBytes,
  type CompressorSettings,
} from "./settings"

const source = { width: 4000, height: 3000 }
const make = (change: Partial<CompressorSettings> = {}) => ({
  ...defaultSettings,
  ...change,
})

describe("formats", () => {
  it("writes the original format back when possible", () => {
    expect(originalOutput("jpeg", false)).toBe("jpeg")
    expect(originalOutput("webp", true)).toBe("webp")
    expect(originalOutput("heic", false)).toBe("jpeg")
    expect(originalOutput("gif", true)).toBe("png")
  })

  it("lists candidates for explicit, original and automatic choices", () => {
    expect(candidateFormats("avif", "jpeg", false, false)).toEqual(["avif"])
    expect(candidateFormats("original", "tiff", true, false)).toEqual(["png"])
    expect(candidateFormats("auto", "jpeg", false, false)).toEqual([
      "jpeg",
      "webp",
      "avif",
    ])
    expect(candidateFormats("auto", "png", false, false)).toEqual([
      "jpeg",
      "webp",
      "avif",
    ])
    expect(candidateFormats("auto", "png", true, false)).toEqual([
      "png",
      "webp",
      "avif",
    ])
    expect(candidateFormats("auto", "webp", false, false)).toEqual([
      "webp",
      "avif",
    ])
    expect(candidateFormats("auto", "jpeg", false, true)).toEqual([
      "png",
      "webp",
    ])
  })

  it("allows lossless only where a format supports it", () => {
    expect(losslessAvailable("auto", "jpeg")).toBe(true)
    expect(losslessAvailable("png", "png")).toBe(true)
    expect(losslessAvailable("original", "jpeg")).toBe(false)
    expect(losslessAvailable("avif", "avif")).toBe(false)
  })
})

describe("values entered by the visitor", () => {
  it("converts target sizes", () => {
    expect(targetBytes(make({ targetSize: "200" }))).toBe(204800)
    expect(targetBytes(make({ targetSize: "1.5", targetUnit: "MB" }))).toBe(
      1572864
    )
    expect(targetBytes(make({ targetSize: "0" }))).toBeNull()
    expect(targetBytes(make({ targetSize: "abc" }))).toBeNull()
  })

  it("resolves the transparency background", () => {
    expect(backgroundRgb(make())).toEqual([255, 255, 255])
    expect(backgroundRgb(make({ background: "black" }))).toEqual([0, 0, 0])
    expect(
      backgroundRgb(make({ background: "custom", backgroundColor: "#102030" }))
    ).toEqual([16, 32, 48])
    expect(
      backgroundRgb(make({ background: "custom", backgroundColor: "nope" }))
    ).toEqual([255, 255, 255])
  })

  it("turns size choices into resize modes", () => {
    expect(resizeMode(make())).toEqual({ kind: "original" })
    expect(resizeMode(make({ size: "50" }))).toEqual({
      kind: "scale",
      percent: 50,
    })
    expect(resizeMode(make({ size: "long-edge", longEdge: 1280 }))).toEqual({
      kind: "long-edge",
      pixels: 1280,
    })
    expect(
      resizeMode(
        make({ size: "custom", customWidth: " 800 ", customHeight: "" })
      )
    ).toEqual({
      kind: "custom",
      width: 800,
      height: null,
      unit: "px",
      lock: true,
      fit: "contain",
    })
    expect(
      resizeMode(
        make({
          size: "custom",
          unit: "percent",
          customWidth: "12.5",
          customHeight: "12.5",
        })
      )
    ).toMatchObject({ width: 12.5, height: 12.5 })
    expect(() =>
      resizeMode(make({ size: "custom", customWidth: "abc" }))
    ).toThrow("numbers")
    expect(() =>
      resizeMode(make({ size: "custom", customWidth: "10.5" }))
    ).toThrow("whole pixels")
  })

  it("builds a plan or a friendly error", () => {
    expect(buildPlan(make({ size: "25" }), source)).toMatchObject({
      plan: { output: { width: 1000, height: 750 } },
      error: null,
    })
    expect(
      buildPlan(
        make({ size: "custom", customWidth: "", customHeight: "" }),
        source
      )
    ).toEqual({ plan: null, error: "Enter a width or a height." })
  })

  it("keeps linked dimensions in proportion", () => {
    const custom = make({ size: "custom" })
    expect(linkedDimension(custom, source, "width", "800")).toMatchObject({
      customWidth: "800",
      customHeight: "600",
    })
    expect(linkedDimension(custom, source, "height", "300")).toMatchObject({
      customWidth: "400",
      customHeight: "300",
    })
    expect(
      linkedDimension({ ...custom, unit: "percent" }, source, "width", "40")
    ).toMatchObject({ customWidth: "40", customHeight: "40" })
    const unlocked = { ...custom, lock: false, customHeight: "9" }
    expect(linkedDimension(unlocked, source, "width", "800")).toMatchObject({
      customWidth: "800",
      customHeight: "9",
    })
    for (const value of ["", "abc", "0"])
      expect(
        linkedDimension(
          { ...custom, customHeight: "9" },
          source,
          "width",
          value
        ).customHeight
      ).toBe("9")
  })
})

describe("crop and orientation", () => {
  it("resets per-image state when a new image opens", () => {
    const opened = settingsForImage(
      make({
        crop: { x: 1, y: 1, width: 2, height: 2 },
        rotation: 90,
        flipX: true,
        format: "webp",
      }),
      source
    )
    expect(opened).toMatchObject({
      crop: null,
      rotation: 0,
      flipX: false,
      format: "webp",
      customWidth: "4000",
      customHeight: "3000",
    })
  })

  it("applies aspect presets to the oriented image", () => {
    expect(chooseAspect(make(), source, "free").crop).toBeNull()
    expect(
      chooseAspect(
        make({ crop: { x: 0, y: 0, width: 5, height: 5 } }),
        source,
        "free"
      ).crop
    ).toEqual({ x: 0, y: 0, ...source })
    expect(chooseAspect(make(), source, "1:1").crop).toEqual({
      x: 500,
      y: 0,
      width: 3000,
      height: 3000,
    })
    expect(
      chooseAspect(make({ rotation: 90 }), source, "original").crop
    ).toEqual({ x: 0, y: 0, width: 3000, height: 4000 })
    expect(cropBounds(make({ rotation: 270 }), source)).toEqual({
      width: 3000,
      height: 4000,
    })
  })

  it("rotates the visible image, reversing direction when mirrored", () => {
    expect(rotateView(make(), source, "right").rotation).toBe(90)
    expect(rotateView(make({ flipX: true }), source, "right").rotation).toBe(
      270
    )
    expect(
      rotateView(make({ flipX: true, flipY: true }), source, "left").rotation
    ).toBe(270)
    expect(rotateView(make({ flipY: true }), source, "left").rotation).toBe(90)
    const cropped = rotateView(
      make({ crop: { x: 0, y: 0, width: 100, height: 50 } }),
      source,
      "right"
    )
    expect(cropped.crop).toEqual({ x: 2950, y: 0, width: 50, height: 100 })
  })

  it("flips the visible image and its crop", () => {
    const crop = { x: 0, y: 0, width: 100, height: 50 }
    expect(flipView(make({ crop }), source, "x")).toMatchObject({
      flipX: true,
      flipY: false,
      crop: { x: 3900, y: 0 },
    })
    expect(flipView(make(), source, "y")).toMatchObject({
      flipX: false,
      flipY: true,
      crop: null,
    })
  })

  it("knows when pixels were edited beyond re-encoding", () => {
    expect(isEdited(make())).toBe(false)
    expect(isEdited(make({ rotation: 180 }))).toBe(true)
    expect(isEdited(make({ flipX: true }))).toBe(true)
    expect(isEdited(make({ flipY: true }))).toBe(true)
    expect(isEdited(make({ crop: { x: 0, y: 0, width: 1, height: 1 } }))).toBe(
      true
    )
  })
})
