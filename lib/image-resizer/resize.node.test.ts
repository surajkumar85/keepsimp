// @vitest-environment node
/**
 * Runs the resizer's render path with the real WebAssembly resampler and
 * encoders, and checks the results with independent tools (sharp, fflate).
 */
import { describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import sharp from "sharp"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { encodeImage, resizePixels } from "@/lib/image-compressor/codecs"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { applyDensity } from "./metadata"
import { fileName } from "./naming"
import { render } from "./pipeline"
import {
  backdrop,
  defaultSettings,
  planOutputs,
  type Kernel,
  type ResizerSettings,
} from "./settings"
import { smartFocus } from "./smart-focus"
import { createZip } from "./zip"

installNodeCodecShims()

/** 400×300 with one colour per quadrant: red, green / blue, yellow. */
function quadrants(): Pixels {
  const width = 400
  const height = 300
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(
        y < 150
          ? x < 200
            ? [220, 30, 30, 255]
            : [30, 180, 30, 255]
          : x < 200
            ? [30, 30, 220, 255]
            : [230, 210, 30, 255],
        (y * width + x) * 4
      )
  return { data, width, height }
}

const deps = {
  resize: (
    pixels: Pixels,
    size: { width: number; height: number },
    kernel: Exclude<Kernel, "nearest">
  ) => resizePixels(pixels, size, kernel),
}
const upright = { rotation: 0 as const, flipX: false, flipY: false }
const settingsWith = (change: Partial<ResizerSettings>) => ({
  ...defaultSettings,
  ...change,
})
async function resized(
  source: Pixels,
  change: Partial<ResizerSettings>,
  focus = { x: 0.5, y: 0.5 }
) {
  const settings = settingsWith(change)
  const { plans, error } = planOutputs(settings, { size: source, focus })
  expect(error).toBeNull()
  return render(source, settings, plans[0], backdrop(settings), deps)
}
const at = (image: Pixels, x: number, y: number) =>
  Array.from(
    image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4
    )
  )
const near = (actual: number[], expected: number[], tolerance = 12) =>
  expect(
    actual.every(
      (value, index) => Math.abs(value - expected[index]) <= tolerance
    )
  ).toBe(true)

describe("real resampler", () => {
  it.each<Exclude<Kernel, "nearest">>([
    "lanczos3",
    "magicKernelSharp2021",
    "mitchell",
    "catrom",
    "triangle",
  ])(
    "resizes with %s to exact dimensions and keeps the colours",
    async (kernel) => {
      const out = await resized(quadrants(), { width: "200", kernel })
      expect([out.width, out.height]).toEqual([200, 150])
      near(at(out, 20, 20), [220, 30, 30, 255])
      near(at(out, 180, 130), [230, 210, 30, 255])
    }
  )

  it("crops to fill from the chosen corner", async () => {
    const box = { width: "100", height: "100" }
    const topLeft = await resized(quadrants(), box, { x: 0, y: 0 })
    expect([topLeft.width, topLeft.height]).toEqual([100, 100])
    near(at(topLeft, 10, 10), [220, 30, 30, 255])
    near(at(topLeft, 10, 90), [30, 30, 220, 255])
    const right = await resized(quadrants(), box, { x: 1, y: 0 })
    near(at(right, 90, 10), [30, 180, 30, 255])
    // A centred square crop of a 4:3 image loses 50 px on each side.
    const centre = await resized(quadrants(), box)
    near(at(centre, 5, 10), [220, 30, 30, 255])
    near(at(centre, 95, 90), [230, 210, 30, 255])
  })

  it("pads with a colour, transparency and a blurred copy", async () => {
    const frame = { width: "200", height: "200", fit: "contain" as const }
    const green = await resized(quadrants(), {
      ...frame,
      background: "custom",
      backgroundColor: "#00ff00",
    })
    expect([green.width, green.height]).toEqual([200, 200])
    expect(at(green, 100, 5)).toEqual([0, 255, 0, 255])
    near(at(green, 20, 40), [220, 30, 30, 255])
    const clear = await resized(quadrants(), {
      ...frame,
      background: "transparent",
    })
    expect(at(clear, 100, 195)[3]).toBe(0)
    const blurred = await resized(quadrants(), { ...frame, background: "blur" })
    expect(at(blurred, 100, 5)[3]).toBe(255)
    // The blurred fill mixes neighbouring quadrants instead of showing a flat colour.
    expect(at(blurred, 100, 5)).not.toEqual(at(blurred, 5, 5))
    const top = await resized(quadrants(), frame, { x: 0.5, y: 0 })
    near(at(top, 20, 5), [220, 30, 30, 255])
  })

  it("fits inside, covers at least, stretches and respects 'do not enlarge'", async () => {
    const frame = { width: "200", height: "200" }
    const inside = await resized(quadrants(), { ...frame, fit: "inside" })
    expect([inside.width, inside.height]).toEqual([200, 150])
    const outside = await resized(quadrants(), { ...frame, fit: "outside" })
    expect([outside.width, outside.height]).toEqual([267, 200])
    const stretched = await resized(quadrants(), { ...frame, fit: "stretch" })
    expect([stretched.width, stretched.height]).toEqual([200, 200])
    const kept = await resized(quadrants(), { width: "2000", enlarge: false })
    expect([kept.width, kept.height]).toEqual([400, 300])
    const pixelArt = await resized(quadrants(), {
      width: "800",
      kernel: "nearest",
    })
    expect([pixelArt.width, pixelArt.height]).toEqual([800, 600])
    expect(at(pixelArt, 399, 299)).toEqual([220, 30, 30, 255])
  })

  it("rotates, flips and converts print sizes", async () => {
    const turned = await resized(quadrants(), { width: "150", rotation: 90 })
    expect([turned.width, turned.height]).toEqual([150, 200])
    near(at(turned, 10, 10), [30, 30, 220, 255])
    const mirrored = await resized(quadrants(), { width: "200", flipX: true })
    near(at(mirrored, 10, 10), [30, 180, 30, 255])
    const print = await resized(quadrants(), {
      width: "1",
      height: "0.5",
      unit: "in",
      dpi: 300,
    })
    expect([print.width, print.height]).toEqual([300, 150])
  })
})

describe("real files", () => {
  it("embeds the print resolution in encoded JPEG and PNG", async () => {
    const pixels = await resized(quadrants(), { width: "120" })
    const base = {
      quality: 80,
      lossless: false,
      effort: "fast" as const,
      chroma444: false,
      progressive: true,
      colors: 256,
      dithering: true,
    }
    for (const format of ["jpeg", "png"] as const) {
      const bytes = applyDensity(
        format,
        new Uint8Array(
          await encodeImage(format, pixels, {
            ...base,
            lossless: format === "png",
          })
        ),
        300
      )
      const metadata = await sharp(bytes).metadata()
      expect(metadata).toMatchObject({
        format,
        width: 120,
        height: 90,
        density: 300,
      })
    }
  })

  it("packs a responsive set into a ZIP that unpacks to valid images", async () => {
    const settings = settingsWith({
      multi: true,
      widths: [100, 200],
      format: "webp",
    })
    const { plans } = planOutputs(settings, {
      size: quadrants(),
      focus: { x: 0.5, y: 0.5 },
    })
    const entries = []
    for (const plan of plans) {
      const pixels = await render(
        quadrants(),
        upright,
        plan,
        backdrop(settings),
        deps
      )
      const bytes = await encodeImage("webp", pixels, {
        quality: 80,
        lossless: false,
        effort: "fast",
        chroma444: false,
        progressive: true,
        colors: 256,
        dithering: true,
      })
      entries.push({
        name: fileName(settings.pattern, {
          name: "quadrants.png",
          width: pixels.width,
          height: pixels.height,
          format: "webp",
          index: 1,
          preset: "",
        }),
        data: new Uint8Array(bytes),
      })
    }
    const unpacked = unzipSync(createZip(entries))
    expect(Object.keys(unpacked)).toEqual([
      "quadrants-100x75.webp",
      "quadrants-200x150.webp",
    ])
    for (const [name, data] of Object.entries(unpacked)) {
      const metadata = await sharp(data).metadata()
      expect(metadata.format).toBe("webp")
      expect(name).toContain(`${metadata.width}x${metadata.height}`)
    }
  })

  it("finds the subject of a real photograph", async () => {
    // The house in the sample sits in the left third of the frame.
    const { data, info } = await sharp("public/images/coastline.jpg")
      .resize(600)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const photo = {
      data: new Uint8ClampedArray(
        data.buffer,
        data.byteOffset,
        data.length
      ) as Uint8ClampedArray<ArrayBuffer>,
      width: info.width,
      height: info.height,
    }
    const focus = smartFocus(photo, 9 / 16)
    expect(focus.x).toBeLessThan(0.5)
  })
})
