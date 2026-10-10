import { describe, expect, it } from "vitest"
import { CENTER } from "./focus"
import { findPreset } from "./presets"
import {
  applyPreset,
  backdrop,
  changeUnit,
  compression,
  cropAspect,
  defaultSettings,
  embeddedDpi,
  flipView,
  linkDimension,
  losslessAllowed,
  matte,
  planOutputs,
  processingKey,
  resolveFormat,
  resolveKernel,
  rotateView,
  sizeTarget,
  swapSides,
  usesBox,
  type ResizerSettings,
} from "./settings"

const source = { width: 4000, height: 3000 }
const make = (change: Partial<ResizerSettings> = {}): ResizerSettings => ({
  ...defaultSettings,
  ...change,
})
const outputs = (change: Partial<ResizerSettings>, size = source) =>
  planOutputs(make(change), { size, focus: CENTER })

describe("size targets", () => {
  it("reads dimensions with one or both sides", () => {
    expect(sizeTarget(make(), source)).toEqual({ kind: "width", pixels: 1200 })
    expect(sizeTarget(make({ width: "", height: "600" }), source)).toEqual({
      kind: "height",
      pixels: 600,
    })
    expect(sizeTarget(make({ width: "800", height: "800" }), source)).toEqual({
      kind: "box",
      width: 800,
      height: 800,
      fit: "cover",
    })
    expect(() => sizeTarget(make({ width: "", height: "" }), source)).toThrow(
      "width or a height"
    )
    expect(() => sizeTarget(make({ width: "abc" }), source)).toThrow(
      "width above zero"
    )
    expect(() =>
      sizeTarget(make({ width: "10", height: "-1" }), source)
    ).toThrow("height above zero")
  })

  it("converts physical and percent units", () => {
    expect(
      sizeTarget(
        make({ width: "4", height: "6", unit: "in", dpi: 300 }),
        source
      )
    ).toMatchObject({ width: 1200, height: 1800 })
    expect(
      sizeTarget(make({ width: "50", height: "50", unit: "percent" }), source)
    ).toMatchObject({ width: 2000, height: 1500 })
  })

  it("handles every other mode", () => {
    expect(sizeTarget(make({ mode: "width", width: "640" }), source)).toEqual({
      kind: "width",
      pixels: 640,
    })
    expect(sizeTarget(make({ mode: "height", height: "480" }), source)).toEqual(
      {
        kind: "height",
        pixels: 480,
      }
    )
    expect(sizeTarget(make({ mode: "longest", side: "1920" }), source)).toEqual(
      {
        kind: "longest",
        pixels: 1920,
      }
    )
    expect(
      sizeTarget(make({ mode: "shortest", side: "1080" }), source)
    ).toEqual({
      kind: "shortest",
      pixels: 1080,
    })
    expect(
      sizeTarget(make({ mode: "percent", percent: "25" }), source)
    ).toEqual({
      kind: "percent",
      percent: 25,
    })
    expect(
      sizeTarget(make({ mode: "megapixels", megapixels: "2" }), source)
    ).toEqual({ kind: "megapixels", megapixels: 2 })
    expect(
      sizeTarget(
        make({ mode: "preset", presetId: "x-header", fit: "contain" }),
        source
      )
    ).toEqual({ kind: "box", width: 1500, height: 500, fit: "contain" })
    expect(() =>
      sizeTarget(make({ mode: "preset", presetId: "nope" }), source)
    ).toThrow("preset")
    expect(() =>
      sizeTarget(make({ mode: "percent", percent: "" }), source)
    ).toThrow("percentage")
    expect(() =>
      sizeTarget(make({ mode: "longest", side: "x" }), source)
    ).toThrow("a size")
    expect(() =>
      sizeTarget(make({ mode: "megapixels", megapixels: "0" }), source)
    ).toThrow("megapixels")
    expect(outputs({ mode: "width", width: "" }).error).toContain(
      "size above zero"
    )
    expect(outputs({ mode: "height", height: "" }).error).toContain(
      "size above zero"
    )
  })

  it("knows when fit and focus apply", () => {
    expect(usesBox(make())).toBe(false)
    expect(usesBox(make({ height: "500" }))).toBe(true)
    expect(usesBox(make({ mode: "preset" }))).toBe(true)
    expect(usesBox(make({ mode: "percent" }))).toBe(false)
  })
})

describe("output plans", () => {
  it("plans one output with an automatic kernel and no sharpening by default", () => {
    const { plans, error } = outputs({})
    expect(error).toBeNull()
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      kernel: "lanczos3",
      sharpen: 0,
      layout: { output: { width: 1200, height: 900 } },
    })
  })

  it("uses the rotated image and sharpens only reductions", () => {
    expect(outputs({ rotation: 90, sharpen: "medium" }).plans[0]).toMatchObject(
      { layout: { output: { width: 1200, height: 1600 } }, sharpen: 0.7 }
    )
    const enlarged = outputs({ width: "8000", sharpen: "strong" }).plans[0]
    expect(enlarged).toMatchObject({ kernel: "mitchell", sharpen: 0 })
    expect(resolveKernel("nearest", enlarged.layout)).toBe("nearest")
  })

  it("plans a responsive set and drops duplicate sizes", () => {
    const set = outputs({
      multi: true,
      widths: [640, 1280],
      customWidths: "320",
    })
    expect(set.plans.map((plan) => plan.layout.output.width)).toEqual([
      320, 640, 1280,
    ])
    const boxed = outputs({
      multi: true,
      mode: "preset",
      presetId: "link-preview",
      widths: [600],
    })
    expect(boxed.plans[0].layout.output).toEqual({ width: 600, height: 315 })
    const capped = outputs(
      { multi: true, widths: [640, 1280], enlarge: false },
      { width: 500, height: 400 }
    )
    expect(capped.plans).toHaveLength(1)
    expect(
      outputs({ multi: true, widths: [], customWidths: "" }).error
    ).toContain("at least one width")
  })

  it("reports size problems as messages", () => {
    expect(outputs({ width: "", height: "" })).toEqual({
      plans: [],
      error: "Enter a width or a height.",
    })
    expect(outputs({ width: "99999" }).error).toContain("16,383")
  })

  it("gives the crop shape for smart focus", () => {
    expect(cropAspect(make({ width: "800", height: "400" }), source)).toBe(2)
    expect(
      cropAspect(make({ mode: "preset", presetId: "x-header" }), source)
    ).toBe(3)
    expect(cropAspect(make(), source)).toBeNull()
    expect(
      cropAspect(make({ width: "800", height: "400", fit: "contain" }), source)
    ).toBeNull()
    expect(
      cropAspect(make({ mode: "preset", presetId: "nope" }), source)
    ).toBeNull()
  })
})

describe("output choices", () => {
  it("resolves backdrops and mattes", () => {
    expect(backdrop(make({ background: "transparent" }))).toEqual({
      kind: "transparent",
    })
    expect(backdrop(make({ background: "blur" }))).toEqual({ kind: "blur" })
    expect(backdrop(make())).toEqual({ kind: "colour", rgb: [255, 255, 255] })
    expect(matte(make({ background: "black" }))).toEqual([0, 0, 0])
    expect(
      matte(make({ background: "custom", backgroundColor: "#102030" }))
    ).toEqual([16, 32, 48])
    expect(
      matte(make({ background: "custom", backgroundColor: "nope" }))
    ).toEqual([255, 255, 255])
    expect(matte(make({ background: "blur" }))).toEqual([255, 255, 255])
  })

  it("resolves formats and quality presets", () => {
    expect(resolveFormat(make(), "heic", false)).toBe("jpeg")
    expect(resolveFormat(make(), "png", true)).toBe("png")
    expect(resolveFormat(make({ format: "avif" }), "png", true)).toBe("avif")
    expect(losslessAllowed("png")).toBe(true)
    expect(losslessAllowed("jpeg")).toBe(false)
    expect(compression(make(), "jpeg").preset).toBe("smart")
    expect(compression(make({ quality: "small" }), "jpeg").preset).toBe(
      "smallest"
    )
    expect(compression(make({ quality: "high" }), "webp").preset).toBe("high")
    expect(compression(make({ quality: "lossless" }), "png").preset).toBe(
      "lossless"
    )
    expect(compression(make({ quality: "lossless" }), "jpeg").preset).toBe(
      "high"
    )
    expect(
      compression(make({ quality: "custom", customQuality: 42 }), "webp")
    ).toEqual({
      preset: "custom",
      quality: 42,
    })
  })

  it("embeds a density when asked, for physical units and for print presets", () => {
    expect(embeddedDpi(make())).toBeNull()
    expect(embeddedDpi(make({ embedDpi: true, dpi: 150 }))).toBe(150)
    expect(embeddedDpi(make({ unit: "cm", dpi: 96 }))).toBe(96)
    expect(embeddedDpi(make({ mode: "percent", unit: "cm" }))).toBeNull()
    expect(
      embeddedDpi(make({ mode: "preset", presetId: "print-a4", dpi: 72 }))
    ).toBe(300)
    expect(embeddedDpi(make({ mode: "preset", presetId: "x-post" }))).toBeNull()
    expect(embeddedDpi(make({ mode: "width", unit: "in" }))).toBe(300)
    expect(embeddedDpi(make({ mode: "height", unit: "mm" }))).toBe(300)
  })
})

describe("editing helpers", () => {
  it("links dimensions in every unit while locked", () => {
    expect(linkDimension(make(), source, "width", "800")).toMatchObject({
      width: "800",
      height: "600",
    })
    expect(linkDimension(make(), source, "height", "300")).toMatchObject({
      width: "400",
      height: "300",
    })
    expect(
      linkDimension(make({ unit: "percent" }), source, "width", "40")
    ).toMatchObject({ width: "40", height: "40" })
    expect(
      linkDimension(make({ unit: "in", dpi: 300 }), source, "width", "8")
    ).toMatchObject({ width: "8", height: "6" })
    expect(
      linkDimension(make({ lock: false, height: "9" }), source, "width", "800")
        .height
    ).toBe("9")
    for (const value of ["", "abc", "0"])
      expect(
        linkDimension(make({ height: "9" }), source, "width", value).height
      ).toBe("9")
  })

  it("converts typed values when the unit changes", () => {
    const inches = changeUnit(make({ width: "1200", height: "" }), source, "in")
    expect(inches).toMatchObject({ unit: "in", width: "4", height: "" })
    expect(changeUnit(inches, source, "px").width).toBe("1200")
    expect(changeUnit(make({ width: "2000" }), source, "percent").width).toBe(
      "50"
    )
    expect(changeUnit(make({ width: "abc" }), source, "cm").width).toBe("abc")
  })

  it("swaps sides and applies presets", () => {
    expect(swapSides(make({ width: "1", height: "2" }))).toMatchObject({
      width: "2",
      height: "1",
    })
    expect(applyPreset(make(), findPreset("print-a4")!)).toMatchObject({
      mode: "preset",
      presetGroup: "print",
      presetId: "print-a4",
      dpi: 300,
    })
    expect(applyPreset(make({ dpi: 96 }), findPreset("x-post")!).dpi).toBe(96)
  })

  it("rotates the view, reversing when mirrored, and carries the focus", () => {
    expect(rotateView(make(), "right").rotation).toBe(90)
    expect(rotateView(make({ flipX: true }), "right").rotation).toBe(270)
    expect(
      rotateView(make({ flipX: true, flipY: true }), "left").rotation
    ).toBe(270)
    expect(rotateView(make({ flipY: true }), "left").rotation).toBe(90)
    expect(rotateView(make({ focus: { x: 0, y: 0 } }), "right").focus).toEqual({
      x: 1,
      y: 0,
    })
    expect(rotateView(make({ focus: { x: 0, y: 0 } }), "left").focus).toEqual({
      x: 0,
      y: 1,
    })
    expect(flipView(make({ focus: { x: 0.2, y: 0.3 } }), "x")).toMatchObject({
      flipX: true,
      flipY: false,
      focus: { x: 0.8, y: 0.3 },
    })
    expect(flipView(make({ focus: { x: 0.2, y: 0.3 } }), "y")).toMatchObject({
      flipX: false,
      flipY: true,
      focus: { x: 0.2, y: 0.7 },
    })
  })

  it("keys results by what changes pixels, not by file naming", () => {
    const key = processingKey(make(), null)
    expect(processingKey(make({ pattern: "x-{name}" }), null)).toBe(key)
    expect(processingKey(make({ presetGroup: "web" }), null)).toBe(key)
    expect(processingKey(make({ lock: false }), null)).toBe(key)
    expect(processingKey(make({ width: "800" }), null)).not.toBe(key)
    expect(processingKey(make(), { x: 0, y: 0 })).not.toBe(key)
    // The shared focus and one image's override are separate inputs.
    expect(processingKey(make({ focus: { x: 0, y: 0 } }), null)).not.toBe(key)
    expect(processingKey(make({ focus: { x: 0, y: 0 } }), null)).not.toBe(
      processingKey(make(), { x: 0, y: 0 })
    )
  })
})
