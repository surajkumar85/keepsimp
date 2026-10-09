import { describe, expect, it, vi } from "vitest"
import {
  avifOptions,
  fitTargetSize,
  jpegOptions,
  originalIsBetter,
  oxipngLevel,
  pickSmallest,
  pngPaletteFor,
  savingsPercent,
  searchQuality,
  searchSteps,
  searchTargetSize,
  similarityScore,
  ssimTarget,
  webpOptions,
  type EncodeSettings,
} from "./quality"

const settings: EncodeSettings = {
  quality: 70,
  lossless: false,
  effort: "balanced",
  chroma444: false,
  progressive: true,
}
const encoded = (quality: number, size = quality * 100) => ({
  quality,
  bytes: new ArrayBuffer(size),
})

describe("presets and codec options", () => {
  it("raises targets for smoothing codecs on photos only", () => {
    expect(ssimTarget("smart", "jpeg")).toBe(0.96)
    expect(ssimTarget("smart", "webp")).toBeCloseTo(0.965)
    expect(ssimTarget("smart", "avif", "photo")).toBeCloseTo(0.965)
    expect(ssimTarget("high", "webp", "graphic")).toBe(0.92)
    expect(ssimTarget("smallest", "png", "graphic")).toBe(0.75)
  })

  it("scores graphics by their worst windows", () => {
    const value = { mean: 0.99, worst: 0.7 }
    expect(similarityScore(value, "photo")).toBe(0.99)
    expect(similarityScore(value, "graphic")).toBe(0.7)
  })

  it("budgets more steps for higher effort and fewer for AVIF", () => {
    expect(searchSteps("jpeg", "fast")).toBe(4)
    expect(searchSteps("webp", "balanced")).toBe(6)
    expect(searchSteps("jpeg", "max")).toBe(9)
    expect(searchSteps("avif", "balanced")).toBe(5)
  })

  it("maps palette presets and custom quality", () => {
    expect(pngPaletteFor("smart", 10)).toEqual({ min: 60, target: 85 })
    expect(pngPaletteFor("custom", 90)).toEqual({ min: 65, target: 90 })
    expect(pngPaletteFor("custom", 10)).toEqual({ min: 0, target: 10 })
  })

  it("builds MozJPEG options for each effort and chroma choice", () => {
    expect(jpegOptions(settings)).toMatchObject({
      quality: 70,
      progressive: true,
      trellis_loops: 2,
      trellis_multipass: false,
      auto_subsample: true,
    })
    expect(
      jpegOptions({ ...settings, effort: "max", chroma444: true })
    ).toMatchObject({
      trellis_multipass: true,
      chroma_subsample: 1,
      auto_subsample: false,
    })
    expect(jpegOptions({ ...settings, effort: "fast" }).trellis_loops).toBe(1)
  })

  it("builds WebP options for lossy, lossless and each effort", () => {
    expect(webpOptions(settings)).toMatchObject({
      quality: 70,
      method: 4,
      use_sharp_yuv: 1,
      lossless: 0,
    })
    expect(webpOptions({ ...settings, lossless: true })).toMatchObject({
      quality: 100,
      lossless: 1,
      use_sharp_yuv: 0,
    })
    expect(webpOptions({ ...settings, effort: "fast" }).method).toBe(3)
    expect(webpOptions({ ...settings, effort: "max" })).toMatchObject({
      method: 6,
      pass: 6,
      autofilter: 1,
    })
  })

  it("builds AVIF options and speeds up the search", () => {
    expect(avifOptions(settings)).toMatchObject({
      speed: 6,
      subsample: 1,
      enableSharpYUV: true,
    })
    expect(avifOptions({ ...settings, searching: true }).speed).toBe(8)
    expect(avifOptions({ ...settings, effort: "max" }).speed).toBe(4)
    expect(avifOptions({ ...settings, effort: "fast" }).speed).toBe(8)
    expect(avifOptions({ ...settings, chroma444: true })).toMatchObject({
      subsample: 3,
      enableSharpYUV: false,
    })
    expect([
      oxipngLevel("fast"),
      oxipngLevel("balanced"),
      oxipngLevel("max"),
    ]).toEqual([1, 2, 4])
  })
})

/** Similarity rising smoothly with quality, like a real codec. */
const curve = (quality: number) => 1 - 0.5 * Math.exp(-quality / 22)

describe("quality search", () => {
  it("finds the lowest passing quality within a few encodes", async () => {
    const encode = vi.fn(async (q: number) => encoded(q))
    const threshold = curve(61.3)
    const result = await searchQuality({
      min: 20,
      max: 95,
      start: 75,
      steps: 8,
      threshold,
      encode,
      measure: async (r) => curve(r.quality),
    })
    expect(result).toMatchObject({ quality: 62, met: true })
    expect(encode.mock.calls.length).toBeLessThanOrEqual(6)
  })

  it("steps up from a failing start and reports progress", async () => {
    const onStep = vi.fn()
    const result = await searchQuality({
      min: 20,
      max: 95,
      start: 30,
      steps: 10,
      threshold: curve(88),
      encode: async (q) => encoded(q),
      measure: async (r) => curve(r.quality),
      onStep,
    })
    expect(result.quality).toBe(88)
    expect(onStep).toHaveBeenCalledWith(1, 10)
  })

  it("stops at the minimum when everything passes", async () => {
    const result = await searchQuality({
      min: 20,
      max: 95,
      start: 75,
      steps: 10,
      threshold: 0,
      encode: async (q) => encoded(q),
      measure: async () => 1,
    })
    expect(result).toMatchObject({ quality: 20, met: true })
  })

  it("returns the maximum when nothing reaches the target", async () => {
    const encode = vi.fn(async (q: number) => encoded(q))
    const unreachable = await searchQuality({
      min: 20,
      max: 95,
      start: 75,
      steps: 10,
      threshold: 2,
      encode,
      measure: async () => 0.5,
    })
    expect(unreachable).toMatchObject({ quality: 95, met: false })
    expect(encode).toHaveBeenLastCalledWith(95)
    const outOfSteps = await searchQuality({
      min: 20,
      max: 95,
      start: 40,
      steps: 1,
      threshold: 0.9,
      encode: async (q) => encoded(q),
      measure: async (r) => (r.quality >= 90 ? 1 : 0),
    })
    expect(outOfSteps).toMatchObject({ quality: 95, score: 1, met: false })
  })

  it("halves narrow or flat brackets instead of interpolating", async () => {
    const result = await searchQuality({
      min: 20,
      max: 95,
      start: 75,
      steps: 12,
      threshold: 0.8,
      encode: async (q) => encoded(q),
      measure: async (r) => (r.quality >= 70 ? 0.9 : 0.5),
    })
    expect(result).toMatchObject({ quality: 70, met: true })
  })

  it("halves the bracket once interpolation has narrowed it", async () => {
    const encode = vi.fn(async (q: number) => encoded(q))
    const result = await searchQuality({
      min: 20,
      max: 95,
      start: 75,
      steps: 12,
      threshold: 0.6,
      encode,
      measure: async (r) => (r.quality >= 73 ? 0.9 : 0.5),
    })
    expect(result).toMatchObject({ quality: 73, met: true })
    expect(encode.mock.calls.map(([q]) => q)).toEqual([
      75, 63, 66, 69, 71, 73, 72,
    ])
  })

  it("clamps the starting quality to the range", async () => {
    const encode = vi.fn(async (q: number) => encoded(q))
    await searchQuality({
      min: 20,
      max: 95,
      start: 200,
      steps: 1,
      threshold: 0,
      encode,
      measure: async () => 1,
    })
    expect(encode).toHaveBeenCalledWith(95)
  })
})

describe("target size search", () => {
  it("finds the highest quality that fits", async () => {
    const onStep = vi.fn()
    const result = await searchTargetSize({
      min: 0,
      max: 100,
      steps: 8,
      target: 5050,
      encode: async (q) => encoded(q),
      onStep,
    })
    expect(result).toMatchObject({ quality: 50, fits: true })
    expect(onStep).toHaveBeenCalled()
  })

  it("reports the smallest attempt when the target is out of reach", async () => {
    const result = await searchTargetSize({
      min: 0,
      max: 100,
      steps: 8,
      target: 10,
      encode: async (q) => encoded(q, 1000 + q),
    })
    expect(result).toMatchObject({ quality: 0, fits: false })
  })

  it("encodes the minimum when the search never reached it", async () => {
    const encode = vi.fn(async (q: number) => encoded(q, 1000 + q))
    const result = await searchTargetSize({
      min: 0,
      max: 100,
      steps: 1,
      target: 1000,
      encode,
    })
    expect(encode).toHaveBeenLastCalledWith(0)
    expect(result).toMatchObject({ quality: 0, fits: true })
  })

  it("lowers dimensions until the target fits, if allowed", async () => {
    const attempt = vi.fn(async (size: { width: number }) => ({
      result: encoded(50, size.width),
      fits: size.width <= 700,
    }))
    const fitted = await fitTargetSize({
      output: { width: 1000, height: 1000 },
      target: 700,
      allowDownscale: true,
      attempt,
    })
    expect(fitted.fits).toBe(true)
    expect(fitted.size.width).toBe(613)
    const fixed = await fitTargetSize({
      output: { width: 1000, height: 1000 },
      target: 700,
      allowDownscale: false,
      attempt,
    })
    expect(fixed).toMatchObject({ fits: false, size: { width: 1000 } })
    const tiny = await fitTargetSize({
      output: { width: 20, height: 20 },
      target: 1,
      allowDownscale: true,
      attempt: async (size) => ({
        result: encoded(1, size.width),
        fits: false,
      }),
    })
    expect(tiny).toMatchObject({ fits: false, size: { width: 17 } })
  })
})

describe("result helpers", () => {
  it("picks the smallest candidate", () => {
    expect(
      pickSmallest([encoded(1, 30), encoded(2, 10), encoded(3, 20)])
    ).toMatchObject({ quality: 2 })
    expect(() => pickSmallest([])).toThrow("Nothing")
  })

  it("offers the original only for unchanged re-encodes that grew", () => {
    const base = {
      originalBytes: 100,
      resultBytes: 120,
      sameFormat: true,
      sameDimensions: true,
      edited: false,
    }
    expect(originalIsBetter(base)).toBe(true)
    expect(originalIsBetter({ ...base, resultBytes: 90 })).toBe(false)
    expect(originalIsBetter({ ...base, sameFormat: false })).toBe(false)
    expect(originalIsBetter({ ...base, sameDimensions: false })).toBe(false)
    expect(originalIsBetter({ ...base, edited: true })).toBe(false)
  })

  it("rounds savings and handles empty originals", () => {
    expect(savingsPercent(1000, 333)).toBe(67)
    expect(savingsPercent(1000, 1500)).toBe(-50)
    expect(savingsPercent(0, 10)).toBe(0)
  })
})
