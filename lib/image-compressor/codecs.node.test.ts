// @vitest-environment node
/**
 * Runs the real WebAssembly codecs (the same modules the browser worker loads)
 * and checks their output with an independent decoder (sharp/libvips).
 */
import { readFile } from "node:fs/promises"
import { beforeAll, describe, expect, it } from "vitest"
import sharp from "sharp"
import { installNodeCodecShims } from "@/tests/node-codecs"
import {
  decodeHeic,
  decodeOutput,
  decodeTiff,
  encodeImage,
  resizePixels,
} from "./codecs"
import { runPipeline, type PipelineJob } from "./pipeline"
import type { PngSettings } from "./quality"
import { ssim, type Pixels } from "./ssim"

installNodeCodecShims()

async function pixelsOf(input: Buffer | string): Promise<Pixels> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.length
    ) as Uint8ClampedArray<ArrayBuffer>,
    width: info.width,
    height: info.height,
  }
}

const settings: PngSettings = {
  quality: 75,
  lossless: false,
  effort: "fast",
  chroma444: false,
  progressive: true,
  colors: 256,
  dithering: true,
}

const job = (change: Partial<PipelineJob>): PipelineJob => ({
  candidates: ["jpeg"],
  compression: "smart",
  quality: 75,
  targetBytes: null,
  allowDownscale: true,
  effort: "fast",
  chroma444: false,
  progressive: true,
  pngColors: 256,
  dithering: true,
  resample: "lanczos3",
  background: [255, 255, 255],
  ...change,
})

let photo: Pixels
let photoBytes: number
let logo: Pixels

beforeAll(async () => {
  const jpeg = await sharp("public/images/coastline.jpg")
    .resize(480)
    .jpeg({ quality: 95 })
    .toBuffer()
  photoBytes = jpeg.byteLength
  photo = await pixelsOf(jpeg)
  logo = await pixelsOf(
    await sharp("public/brand/keepsimp-mark.svg", { density: 300 })
      .resize(256)
      .png()
      .toBuffer()
  )
})

describe("real codecs", () => {
  it.each([
    ["jpeg", "jpeg"],
    ["webp", "webp"],
    ["avif", "heif"],
    ["png", "png"],
  ] as const)(
    "writes valid %s files at the right size",
    async (format, sharpFormat) => {
      const bytes = await encodeImage(format, photo, {
        ...settings,
        palette: { min: 0, target: 80 },
      })
      const metadata = await sharp(Buffer.from(bytes)).metadata()
      expect(metadata.format).toBe(sharpFormat)
      expect([metadata.width, metadata.height]).toEqual([
        photo.width,
        photo.height,
      ])
      const decoded = await decodeOutput(format, bytes)
      expect(ssim(photo, decoded)).toBeGreaterThan(0.85)
    },
    60000
  )

  it("keeps alpha in palette PNG and makes it smaller than lossless zlib", async () => {
    const palette = await encodeImage("png", logo, {
      ...settings,
      palette: { min: 0, target: 85 },
    })
    const lossless = await sharp(Buffer.from(logo.data.buffer), {
      raw: { width: logo.width, height: logo.height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer()
    expect(palette.byteLength).toBeLessThan(lossless.byteLength)
    const { data, info } = await sharp(Buffer.from(palette))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    expect(data[3]).toBe(0)
  })

  it("optimises lossless PNG without changing a pixel", async () => {
    const bytes = await encodeImage("png", logo, {
      ...settings,
      lossless: true,
    })
    const decoded = await pixelsOf(Buffer.from(bytes))
    expect(Buffer.from(decoded.data).equals(Buffer.from(logo.data))).toBe(true)
  })

  it("falls back to lossless when the palette cannot reach its minimum quality", async () => {
    const bytes = await encodeImage("png", photo, {
      ...settings,
      colors: 2,
      palette: { min: 99, target: 100 },
    })
    const decoded = await pixelsOf(Buffer.from(bytes))
    expect(ssim(photo, decoded)).toBe(1)
  })

  it("resamples with Lanczos in linear light", async () => {
    const half = await resizePixels(
      photo,
      { width: 240, height: 160 },
      "lanczos3"
    )
    expect([half.width, half.height]).toEqual([240, 160])
    expect(await resizePixels(photo, photo, "mitchell")).toBe(photo)
  })

  it("decodes HEIC and TIFF in browsers without native support", async () => {
    const heic = await decodeHeic(
      (await readFile("e2e/fixtures/coastline-small.heic"))
        .buffer as ArrayBuffer
    )
    expect([heic.width, heic.height]).toEqual([320, 213])
    const tiffBuffer = await sharp(Buffer.from(photo.data.buffer), {
      raw: { width: photo.width, height: photo.height, channels: 4 },
    })
      .tiff({ compression: "lzw" })
      .toBuffer()
    const tiff = await decodeTiff(
      tiffBuffer.buffer.slice(
        tiffBuffer.byteOffset,
        tiffBuffer.byteOffset + tiffBuffer.byteLength
      ) as ArrayBuffer
    )
    expect([tiff.width, tiff.height]).toEqual([photo.width, photo.height])
    expect(ssim(photo, tiff)).toBeGreaterThan(0.999)
  }, 60000)

  it("compresses a photo below its source size while meeting the smart target", async () => {
    const { candidate } = await runPipeline({
      job: job({}),
      output: { width: photo.width, height: photo.height },
      transparent: false,
      pixelsAt: async () => photo,
      codecs: { encode: encodeImage, decode: decodeOutput },
    })
    expect(candidate.similarity).toBeGreaterThanOrEqual(0.96)
    expect(candidate.bytes.byteLength).toBeLessThan(photoBytes)
  }, 60000)

  it("reaches a byte target with real encoders", async () => {
    const target = 12 * 1024
    const { candidate } = await runPipeline({
      job: job({
        compression: "target",
        targetBytes: target,
        candidates: ["webp"],
      }),
      output: { width: photo.width, height: photo.height },
      transparent: false,
      pixelsAt: async (size) => resizePixels(photo, size, "lanczos3"),
      codecs: { encode: encodeImage, decode: decodeOutput },
    })
    expect(candidate.fits).toBe(true)
    expect(candidate.bytes.byteLength).toBeLessThanOrEqual(target)
  }, 60000)
})
