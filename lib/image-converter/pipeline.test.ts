import { describe, expect, it, vi } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { nearest } from "@/lib/image-resizer/canvas"
import { convert, type ConvertDeps } from "./pipeline"
import { defaultSettings, type ConverterSettings } from "./settings"

/** Textured 32×16 image; pass `alpha` below 255 to make the first pixel transparent. */
function photo(alpha = 255): Pixels {
  const data = new Uint8ClampedArray(32 * 16 * 4)
  for (let i = 0; i < 32 * 16; i++) {
    const v = (i * 37 + (i % 7) * 53) % 256
    data.set([v, 255 - v, (v * 3) % 256, i === 0 ? alpha : 255], i * 4)
  }
  return { data, width: 32, height: 16 }
}

function setup(jxlSimilarity = (quality: number) => 1 - (100 - quality) / 200) {
  const jxlQuality = new Map<ArrayBuffer, number>()
  const deps: ConvertDeps = {
    compress: vi.fn<ConvertDeps["compress"]>(
      async (format, pixels, preset, quality) => ({
        bytes: new Uint8Array([format.length, quality, pixels.width]).buffer,
        similarity: preset === "lossless" ? 1 : 0.97,
      })
    ),
    encodeJxl: vi.fn<ConvertDeps["encodeJxl"]>(async (_pixels, options) => {
      const bytes = new ArrayBuffer(options.lossless ? 500 : options.quality)
      jxlQuality.set(bytes, options.lossless ? 100 : options.quality)
      return bytes
    }),
    decodeJxl: vi.fn<ConvertDeps["decodeJxl"]>(async (bytes) => {
      const source = photo()
      const mix = 1 - jxlSimilarity(jxlQuality.get(bytes)!)
      return {
        ...source,
        data: source.data.map((value, index) =>
          index % 4 === 3 ? value : value * (1 - mix) + 128 * mix
        ),
      }
    }),
    quantize: vi.fn<ConvertDeps["quantize"]>(async (pixels) => ({
      indices: new Uint8Array(pixels.width * pixels.height),
      palette: [[10, 20, 30, 255]],
    })),
    resize: vi.fn<ConvertDeps["resize"]>(async (pixels, size) =>
      nearest(pixels, size)
    ),
    deflate: vi.fn<ConvertDeps["deflate"]>(async (bytes) =>
      bytes.subarray(0, 4)
    ),
  }
  return deps
}
const settings = (change: Partial<ConverterSettings> = {}) => ({
  ...defaultSettings,
  ...change,
})

describe("convert", () => {
  it("sends web formats to the compressor with the chosen preset", async () => {
    const deps = setup()
    const out = await convert(
      photo(),
      "webp",
      settings({ quality: "small" }),
      deps
    )
    expect(out).toMatchObject({
      target: "webp",
      width: 32,
      height: 16,
      similarity: 0.97,
    })
    expect(deps.compress).toHaveBeenCalledWith(
      "webp",
      expect.anything(),
      "smallest",
      80,
      [255, 255, 255]
    )
  })

  it("embeds a print resolution only where the format carries one", async () => {
    const deps = setup()
    // The fake JPEG has no JFIF header, so the density writer inserts an 18-byte one.
    const jpeg = await convert(
      photo(),
      "jpeg",
      settings({ embedDpi: true }),
      deps
    )
    expect(jpeg.bytes.length).toBe(3 + 18)
    const plain = await convert(photo(), "jpeg", settings(), deps)
    expect(plain.bytes.length).toBe(3)
    const webp = await convert(
      photo(),
      "webp",
      settings({ embedDpi: true }),
      deps
    )
    expect(webp.bytes.length).toBe(3)
  })

  it("searches JPEG XL quality, or encodes it directly", async () => {
    const deps = setup()
    const steps: string[] = []
    const smart = await convert(photo(), "jxl", settings(), deps, (label) => {
      steps.push(label)
    })
    expect(smart.similarity).toBeGreaterThanOrEqual(0.96)
    expect(vi.mocked(deps.encodeJxl).mock.calls.length).toBeGreaterThan(1)
    expect(steps[0]).toContain("JPEG XL quality")
    expect(steps.at(-1)).toBe("Encoding the final JPEG XL…")
    const calls = vi.mocked(deps.encodeJxl).mock.calls
    expect(calls.slice(0, -1).every((call) => call[1].effort === 3)).toBe(true)
    expect(calls.at(-1)![1].effort).toBeUndefined()

    const custom = await convert(
      photo(),
      "jxl",
      settings({ quality: "custom", customQuality: 40 }),
      setup()
    )
    expect(custom.bytes.length).toBe(40)

    const exact = setup()
    const lossless = await convert(
      photo(),
      "jxl",
      settings({ quality: "lossless" }),
      exact
    )
    expect(lossless).toMatchObject({ similarity: 1 })
    expect(exact.encodeJxl).toHaveBeenCalledWith(expect.anything(), {
      quality: 100,
      lossless: true,
    })
    expect(exact.decodeJxl).not.toHaveBeenCalled()
  })

  it("builds a GIF from a palette", async () => {
    const deps = setup()
    const steps: string[] = []
    const out = await convert(
      photo(),
      "gif",
      settings({ gifColours: 16, dithering: false }),
      deps,
      (label) => void steps.push(label)
    )
    expect(String.fromCharCode(...out.bytes.subarray(0, 6))).toBe("GIF89a")
    expect(out.similarity).toBeNull()
    expect(deps.quantize).toHaveBeenCalledWith(expect.anything(), 16, false)
    expect(steps).toEqual(["Building the GIF palette…"])
    await convert(photo(), "gif", settings(), setup())
  })

  it("writes BMP and TIFF with or without transparency and resolution", async () => {
    const deps = setup()
    const opaque = await convert(photo(), "bmp", settings(), deps)
    expect(opaque.bytes[28]).toBe(24)
    const clear = await convert(
      photo(0),
      "bmp",
      settings({ embedDpi: true, dpi: 300 }),
      deps
    )
    expect(clear.bytes[28]).toBe(32)
    expect(new DataView(clear.bytes.buffer).getInt32(38, true)).toBe(11811)
    const tiff = await convert(photo(0), "tiff", settings(), deps)
    expect([...tiff.bytes.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0])
    expect(tiff).toMatchObject({ similarity: 1, width: 32, height: 16 })
  })

  it("draws each icon size and packs them", async () => {
    const deps = setup()
    const steps: string[] = []
    const out = await convert(
      photo(),
      "ico",
      settings({ icoSizes: [48, 16, 16] }),
      deps,
      (label) => void steps.push(label)
    )
    expect(out).toMatchObject({ width: 48, height: 48, similarity: 1 })
    expect(new DataView(out.bytes.buffer).getUint16(4, true)).toBe(2)
    expect(steps).toEqual([
      "Drawing the 16 px icon…",
      "Drawing the 48 px icon…",
    ])
    const icons = vi.mocked(deps.compress).mock.calls
    expect(
      icons.map((call) => [call[0], call[1].width, call[1].height, call[2]])
    ).toEqual([
      ["png", 16, 16, "lossless"],
      ["png", 48, 48, "lossless"],
    ])
    // The 32×16 source is letterboxed: the top row of a 16 px icon is transparent.
    expect(icons[0][1].data[3]).toBe(0)
    await convert(photo(), "ico", settings({ icoSizes: [8] }), setup())
  })

  it("makes PDF pages from a JPEG, flattening transparency", async () => {
    const deps = setup()
    const out = await convert(
      photo(0),
      "pdf",
      settings({ background: "black" }),
      deps
    )
    expect(new TextDecoder().decode(out.bytes.subarray(0, 8))).toBe("%PDF-1.4")
    expect(out.page).toMatchObject({ kind: "dct", width: 32, height: 16 })
    expect(out.similarity).toBe(0.97)
    const [format, pixels, preset] = vi.mocked(deps.compress).mock.calls[0]
    expect([format, preset]).toEqual(["jpeg", "smart"])
    expect([...pixels.data.subarray(0, 4)]).toEqual([0, 0, 0, 255])
    const opaque = setup()
    await convert(photo(), "pdf", settings(), opaque)
    expect(vi.mocked(opaque.compress).mock.calls[0][1].data[0]).toBe(
      photo().data[0]
    )
  })

  it("makes lossless PDF pages with compressed RGB", async () => {
    const deps = setup()
    const steps: string[] = []
    const out = await convert(
      photo(),
      "pdf",
      settings({ quality: "lossless" }),
      deps,
      (label) => void steps.push(label)
    )
    expect(out.page).toMatchObject({ kind: "flate" })
    expect(out.similarity).toBe(1)
    expect(vi.mocked(deps.deflate).mock.calls[0][0].length).toBe(32 * 16 * 3)
    expect(deps.compress).not.toHaveBeenCalled()
    expect(steps).toEqual(["Packing the PDF page…"])
    await convert(photo(), "pdf", settings({ quality: "lossless" }), setup())
  })
})
