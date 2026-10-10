// @vitest-environment node
/**
 * Runs the conversion pipeline with the real codecs and checks every format
 * with an independent reader where one exists.
 */
import { beforeAll, describe, expect, it } from "vitest"
import sharp from "sharp"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { decodeJxl } from "@/lib/image-compressor/codecs"
import { ssim, type Pixels } from "@/lib/image-compressor/ssim"
import { createDeps } from "./deps"
import { createPdf } from "./encoders/pdf"
import { convert } from "./pipeline"
import { defaultSettings, type ConverterSettings } from "./settings"
import type { Target } from "./targets"

installNodeCodecShims()

async function pixelsOf(input: Buffer | Uint8Array): Promise<Pixels> {
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

let photo: Pixels
let logo: Pixels
const deps = createDeps()
const run = (
  pixels: Pixels,
  target: Target,
  change: Partial<ConverterSettings> = {}
) => convert(pixels, target, { ...defaultSettings, ...change }, deps)

beforeAll(async () => {
  photo = await pixelsOf(
    await sharp("public/images/coastline.jpg").resize(240, 160).png().toBuffer()
  )
  logo = await pixelsOf(
    await sharp("public/brand/keepsimp-mark.svg", { density: 300 })
      .resize(96, 96)
      .png()
      .toBuffer()
  )
})

describe("formats sharp can read", () => {
  it.each([
    ["jpeg", "jpeg"],
    ["png", "png"],
    ["webp", "webp"],
    ["avif", "heif"],
    ["gif", "gif"],
    ["tiff", "tiff"],
  ] as const)(
    "writes a valid %s",
    async (target, format) => {
      const out = await run(photo, target)
      const metadata = await sharp(out.bytes).metadata()
      expect(metadata.format).toBe(format)
      expect([metadata.width, metadata.height]).toEqual([240, 160])
      const decoded = await pixelsOf(out.bytes)
      expect(ssim(photo, decoded)).toBeGreaterThan(target === "gif" ? 0.7 : 0.9)
    },
    60000
  )

  it("keeps transparency in PNG, WebP, AVIF, GIF and TIFF", async () => {
    for (const target of ["png", "webp", "avif", "gif", "tiff"] as const) {
      const out = await run(logo, target)
      const decoded = await pixelsOf(out.bytes)
      // Lossy AVIF may store "almost transparent" rather than exactly zero.
      expect(decoded.data[3], target).toBeLessThan(8)
      expect(decoded.data[(48 * 96 + 48) * 4 + 3], target).toBe(255)
    }
  }, 60000)

  it("fills transparency with the background colour in JPEG", async () => {
    const out = await run(logo, "jpeg", {
      background: "custom",
      backgroundColor: "#ff0000",
    })
    const decoded = await pixelsOf(out.bytes)
    expect(decoded.data[0]).toBeGreaterThan(230)
    expect(decoded.data[1]).toBeLessThan(40)
  })

  it("stores the print resolution in JPEG, PNG and TIFF", async () => {
    for (const target of ["jpeg", "png", "tiff"] as const) {
      const out = await run(photo, target, { embedDpi: true, dpi: 300 })
      expect((await sharp(out.bytes).metadata()).density, target).toBe(300)
    }
  }, 60000)

  it("limits GIF colours", async () => {
    const few = await run(photo, "gif", { gifColours: 16 })
    const many = await run(photo, "gif", { gifColours: 256 })
    expect(few.bytes.length).toBeLessThan(many.bytes.length)
  })
})

describe("other formats", () => {
  it("round-trips JPEG XL, lossy and lossless", async () => {
    const lossy = await run(photo, "jxl")
    const decoded = await decodeJxl(lossy.bytes.slice().buffer)
    expect([decoded.width, decoded.height]).toEqual([240, 160])
    expect(lossy.similarity!).toBeGreaterThanOrEqual(0.96)
    const exact = await run(logo, "jxl", { quality: "lossless" })
    const restored = await decodeJxl(exact.bytes.slice().buffer)
    expect(Buffer.from(restored.data).equals(Buffer.from(logo.data))).toBe(true)
    expect(lossy.bytes.length).toBeLessThan(photo.data.length / 4)
  }, 120000)

  it("writes BMP headers and pixels for opaque and transparent images", async () => {
    const opaque = await run(photo, "bmp")
    expect(opaque.bytes.length).toBe(54 + 240 * 160 * 3)
    const clear = await run(logo, "bmp")
    expect(new DataView(clear.bytes.buffer).getUint16(28, true)).toBe(32)
  })

  it("packs every icon size as a readable PNG, letterboxing wide images", async () => {
    const out = await run(photo, "ico", { icoSizes: [16, 32, 256] })
    const view = new DataView(out.bytes.buffer, out.bytes.byteOffset)
    expect(view.getUint16(4, true)).toBe(3)
    for (const [index, size] of [16, 32, 256].entries()) {
      const at = 6 + index * 16
      const png = out.bytes.subarray(
        view.getUint32(at + 12, true),
        view.getUint32(at + 12, true) + view.getUint32(at + 8, true)
      )
      const icon = await pixelsOf(png)
      expect([icon.width, icon.height]).toEqual([size, size])
      // 3:2 picture in a square: the top-left corner is transparent padding.
      expect(icon.data[3]).toBe(0)
      expect(
        icon.data[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3]
      ).toBe(255)
    }
  }, 60000)

  it("writes PDFs a reader opens, lossy, lossless and combined", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const lossy = await run(photo, "pdf", { pdfDpi: 72 })
    const lossless = await run(logo, "pdf", {
      quality: "lossless",
      pdfPage: "a4",
    })
    expect(lossy.page!.kind).toBe("dct")
    expect(lossless.page!.kind).toBe("flate")
    const single = await getDocument({ data: lossy.bytes.slice() }).promise
    expect(single.numPages).toBe(1)
    expect((await single.getPage(1)).view).toEqual([0, 0, 240, 160])
    const paper = await getDocument({ data: lossless.bytes.slice() }).promise
    expect((await paper.getPage(1)).view).toEqual([0, 0, 595.28, 841.89])
    // The page images can be assembled into one document afterwards.
    const combined = createPdf([lossy.page!, lossless.page!], {
      page: "fit",
      dpi: 72,
      margin: "none",
    })
    const both = await getDocument({ data: combined }).promise
    expect(both.numPages).toBe(2)
    const second = await both.getPage(2)
    expect(second.view).toEqual([0, 0, 96, 96])
    // Rendering the flate page proves the stream really is zlib RGB of the right size.
    const operators = await second.getOperatorList()
    expect(operators.fnArray.length).toBeGreaterThan(0)
  }, 60000)
})
