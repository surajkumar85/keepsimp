import { describe, expect, it, vi } from "vitest"
import { runPipeline, type Codecs, type PipelineJob } from "./pipeline"
import type { OutputFormat } from "./formats"
import type { PngSettings } from "./quality"
import type { Pixels } from "./ssim"

/** Textured photo-like pixels, so the photo thresholds apply. */
function photo(width = 64, height = 48, alpha = 255): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const v = (i * 37 + (i % 7) * 53) % 256
    data.set([v, 255 - v, (v * 3) % 256, i === 0 ? alpha : 255], i * 4)
  }
  return { data, width, height }
}

/**
 * Fake codecs: file size grows with quality, and decoding blends the image
 * towards grey by an amount that shrinks as quality rises.
 */
function fakeCodecs(
  sizes: Partial<Record<OutputFormat, number>> = {},
  finalAvifFactor = 1
) {
  const calls: { format: OutputFormat; settings: PngSettings }[] = []
  const encoded = new Map<ArrayBuffer, { pixels: Pixels; quality: number }>()
  const codecs: Codecs = {
    encode: vi.fn<Codecs["encode"]>(async (format, pixels, settings) => {
      calls.push({ format, settings })
      const quality = settings.lossless
        ? 100
        : format === "png"
          ? (settings.palette?.target ?? 100)
          : settings.quality
      const slow =
        format === "avif" && !settings.searching ? finalAvifFactor : 1
      const bytes = new ArrayBuffer(
        Math.round(
          ((sizes[format] ?? 1) * slow * (quality + 10) * pixels.width) / 64
        )
      )
      encoded.set(bytes, { pixels, quality })
      return bytes
    }),
    decode: vi.fn<Codecs["decode"]>(async (_format, bytes) => {
      const { pixels, quality } = encoded.get(bytes)!
      const mix = (100 - quality) / 100
      const data = pixels.data.map((value, index) =>
        index % 4 === 3 ? value : value * (1 - mix) + 128 * mix
      )
      return { ...pixels, data }
    }),
  }
  return { codecs, calls }
}

const job = (change: Partial<PipelineJob> = {}): PipelineJob => ({
  candidates: ["jpeg"],
  compression: "smart",
  quality: 75,
  targetBytes: null,
  allowDownscale: true,
  effort: "balanced",
  chroma444: false,
  progressive: true,
  pngColors: 256,
  dithering: true,
  resample: "lanczos3",
  background: [255, 255, 255],
  ...change,
})

async function run(
  change: Partial<PipelineJob>,
  sizes?: Partial<Record<OutputFormat, number>>,
  pixels = photo(),
  finalAvifFactor = 1
) {
  const fake = fakeCodecs(sizes, finalAvifFactor)
  const progress = vi.fn()
  const checkpoint = vi.fn(async () => {})
  const output = await runPipeline({
    job: job(change),
    output: { width: pixels.width, height: pixels.height },
    transparent: pixels.data[3] < 255,
    pixelsAt: async (size) =>
      size.width === pixels.width ? pixels : photo(size.width, size.height),
    codecs: fake.codecs,
    checkpoint,
    progress,
  })
  return { ...output, ...fake, progress, checkpoint }
}

describe("compression pipeline", () => {
  it("searches for the lowest quality that meets the smart target", async () => {
    const { candidate, size, progress, checkpoint } = await run({})
    expect(candidate.format).toBe("jpeg")
    expect(candidate.similarity).toBeGreaterThanOrEqual(0.96)
    expect(candidate.quality).toBeGreaterThan(25)
    expect(candidate.quality).toBeLessThan(95)
    expect(size).toEqual({ width: 64, height: 48 })
    expect(progress).toHaveBeenCalledWith(
      expect.stringContaining("Finding the best JPEG quality")
    )
    expect(checkpoint).toHaveBeenCalled()
  })

  it("asks for more quality with the high preset", async () => {
    const smart = await run({ compression: "smart" })
    const high = await run({ compression: "high" })
    const smallest = await run({ compression: "smallest" })
    expect(high.candidate.quality!).toBeGreaterThan(smart.candidate.quality!)
    expect(smallest.candidate.quality!).toBeLessThan(smart.candidate.quality!)
  })

  it("re-encodes AVIF at the chosen effort after a fast search", async () => {
    const { calls, candidate } = await run({ candidates: ["avif"] })
    const last = calls.at(-1)!
    expect(last.settings.searching).toBeUndefined()
    expect(last.settings.quality).toBe(candidate.quality)
    expect(calls.slice(0, -1).every((call) => call.settings.searching)).toBe(
      true
    )
  })

  it("keeps the smallest candidate for automatic format", async () => {
    const { candidate } = await run(
      { candidates: ["jpeg", "webp", "avif"] },
      { jpeg: 3, webp: 2, avif: 1 }
    )
    expect(candidate.format).toBe("avif")
  })

  it("flattens transparency for JPEG only", async () => {
    const pixels = photo(64, 48, 0)
    const { calls } = await run({ candidates: ["jpeg", "webp"] }, {}, pixels)
    const jpeg = calls.find((call) => call.format === "jpeg")!
    const webp = calls.find((call) => call.format === "webp")!
    expect(jpeg).toBeDefined()
    expect(webp).toBeDefined()
    const encode = vi.mocked((await run({}, {}, pixels)).codecs.encode)
    expect(encode.mock.calls[0][1].data[3]).toBe(255)
  })

  it("encodes lossless output without measuring", async () => {
    const { candidate, codecs } = await run({
      compression: "lossless",
      candidates: ["png", "webp"],
    })
    expect(candidate).toMatchObject({ similarity: 1, quality: null })
    expect(codecs.decode).not.toHaveBeenCalled()
  })

  it("uses a palette for PNG presets and custom quality", async () => {
    const smart = await run({ candidates: ["png"] })
    expect(smart.calls[0].settings.palette).toEqual({ min: 60, target: 85 })
    expect(smart.candidate.quality).toBeNull()
    const custom = await run({
      candidates: ["png"],
      compression: "custom",
      quality: 50,
    })
    expect(custom.calls[0].settings.palette).toEqual({ min: 25, target: 50 })
    expect(custom.candidate.quality).toBe(50)
  })

  it("encodes custom quality once", async () => {
    const { candidate, calls } = await run({
      compression: "custom",
      quality: 42,
      candidates: ["webp"],
    })
    expect(calls).toHaveLength(1)
    expect(candidate).toMatchObject({ format: "webp", quality: 42 })
  })

  it("fits a target size by lowering quality", async () => {
    const { candidate, size } = await run({
      compression: "target",
      targetBytes: 60,
    })
    expect(candidate.fits).toBe(true)
    expect(candidate.bytes.byteLength).toBeLessThanOrEqual(60)
    expect(size).toEqual({ width: 64, height: 48 })
  })

  it("shrinks dimensions when quality alone cannot reach the target", async () => {
    const { candidate, size } = await run({
      compression: "target",
      targetBytes: 30,
    })
    expect(candidate.fits).toBe(true)
    expect(size.width).toBeLessThan(64)
  })

  it("reports an unreachable target without downscaling", async () => {
    const { candidate, size } = await run({
      compression: "target",
      targetBytes: 5,
      allowDownscale: false,
      candidates: ["png"],
    })
    expect(candidate.fits).toBe(false)
    expect(size).toEqual({ width: 64, height: 48 })
  })

  it("prefers the most faithful candidate among those that fit", async () => {
    for (const candidates of [
      ["jpeg", "avif"],
      ["avif", "jpeg"],
    ] as OutputFormat[][]) {
      const { candidate } = await run(
        { compression: "target", targetBytes: 60, candidates },
        { jpeg: 1, avif: 0.5 }
      )
      expect(candidate.format).toBe("avif")
    }
  })

  it("keeps a slower AVIF encode only when it still fits", async () => {
    const target = {
      compression: "target" as const,
      candidates: ["avif" as const],
    }
    const fits = await run({ ...target, targetBytes: 60 })
    expect(fits.calls.at(-1)!.settings.searching).toBeUndefined()
    expect(fits.candidate.fits).toBe(true)
    const tooBig = await run(
      { ...target, targetBytes: 60, allowDownscale: false },
      {},
      photo(),
      2
    )
    expect(tooBig.candidate.fits).toBe(true)
    expect(tooBig.candidate.bytes.byteLength).toBeLessThanOrEqual(60)
    const unreachable = await run(
      { ...target, targetBytes: 5, allowDownscale: false },
      {},
      photo(),
      0.5
    )
    expect(unreachable.candidate.bytes.byteLength).toBe(
      Math.round(0.5 * (15 + 10))
    )
  })

  it("requires a target size", async () => {
    await expect(
      run({ compression: "target", targetBytes: null })
    ).rejects.toThrow("target size")
  })

  it("runs without progress or checkpoint callbacks", async () => {
    const fake = fakeCodecs()
    const pixels = photo()
    const result = await runPipeline({
      job: job({ compression: "custom", quality: 80 }),
      output: { width: 64, height: 48 },
      transparent: false,
      pixelsAt: async () => pixels,
      codecs: fake.codecs,
    })
    expect(result.candidate.quality).toBe(80)
  })
})
