import { describe, expect, it } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  adjustPixels,
  adjusts,
  captionLayout,
  captionShows,
  fadeAmount,
  fadePixels,
  fitLines,
  overlayRect,
  paintOver,
  wrapText,
  type Adjustments,
} from "./effects"

const neutral: Adjustments = {
  filter: "none",
  brightness: 0,
  contrast: 0,
  saturation: 0,
}
const pixels = (...values: number[][]): Pixels => ({
  data: new Uint8ClampedArray(values.flat()),
  width: values.length,
  height: 1,
})
const adjusted = (pixel: number[], change: Partial<Adjustments>) => [
  ...adjustPixels(pixels(pixel), { ...neutral, ...change }).data,
]

describe("adjusts", () => {
  it("is true as soon as one adjustment is set", () => {
    expect(adjusts(neutral)).toBe(false)
    expect(adjusts({ ...neutral, filter: "invert" })).toBe(true)
    expect(adjusts({ ...neutral, brightness: -5 })).toBe(true)
    expect(adjusts({ ...neutral, contrast: 5 })).toBe(true)
    expect(adjusts({ ...neutral, saturation: 5 })).toBe(true)
  })
})

describe("adjustPixels", () => {
  it("returns an equal copy when nothing is set", () => {
    const original = pixels([10, 120, 250, 77], [0, 0, 0, 0])
    const copy = adjustPixels(original, neutral)
    expect(copy).toEqual(original)
    expect(copy.data).not.toBe(original.data)
  })

  it("lifts or lowers every colour by up to half the range", () => {
    expect(adjusted([10, 120, 250, 77], { brightness: 100 })).toEqual([
      138, 248, 255, 77,
    ])
    expect(adjusted([0, 0, 0, 255], { brightness: 100 })).toEqual([
      127, 127, 127, 255,
    ])
    expect(adjusted([200, 100, 10, 255], { brightness: -100 })).toEqual([
      73, 0, 0, 255,
    ])
  })

  it("stretches or flattens contrast around mid grey", () => {
    expect(adjusted([28, 128, 228, 255], { contrast: 50 })).toEqual([
      0, 128, 255, 255,
    ])
    expect(adjusted([28, 128, 228, 255], { contrast: -50 })).toEqual([
      78, 128, 178, 255,
    ])
    // No contrast at all leaves one flat grey.
    expect(adjusted([0, 90, 255, 255], { contrast: -100 })).toEqual([
      128, 128, 128, 255,
    ])
  })

  it("removes or deepens colour without changing its lightness", () => {
    // Pure red has a lightness of about 54.
    expect(adjusted([255, 0, 0, 255], { saturation: -100 })).toEqual([
      54, 54, 54, 255,
    ])
    expect(adjusted([200, 100, 100, 9], { saturation: 100 })).toEqual([
      255, 79, 79, 9,
    ])
    // A colour that is already as deep as it goes stays inside the range.
    expect(adjusted([255, 0, 0, 255], { saturation: 100 })).toEqual([
      255, 0, 0, 255,
    ])
    // A grey has no colour to deepen.
    expect(adjusted([90, 90, 90, 255], { saturation: 100 })).toEqual([
      90, 90, 90, 255,
    ])
  })

  it("applies each filter", () => {
    expect(adjusted([255, 0, 0, 200], { filter: "greyscale" })).toEqual([
      54, 54, 54, 200,
    ])
    expect(adjusted([0, 255, 0, 255], { filter: "greyscale" })).toEqual([
      182, 182, 182, 255,
    ])
    expect(adjusted([100, 100, 100, 255], { filter: "sepia" })).toEqual([
      135, 120, 94, 255,
    ])
    // Bright colours stay inside the range.
    expect(adjusted([255, 255, 255, 255], { filter: "sepia" })).toEqual([
      255, 255, 239, 255,
    ])
    expect(adjusted([0, 100, 255, 30], { filter: "invert" })).toEqual([
      255, 155, 0, 30,
    ])
  })

  it("adjusts first and filters afterwards", () => {
    expect(
      adjusted([0, 0, 0, 255], { brightness: 100, filter: "invert" })
    ).toEqual([128, 128, 128, 255])
  })
})

describe("fadeAmount", () => {
  it("shows everything when there is no fade", () => {
    expect(fadeAmount(0, 100, 1000, 0, 0)).toBe(1)
    expect(fadeAmount(900, 1000, 1000, 0, 0)).toBe(1)
  })

  it("rises from nothing at the start", () => {
    expect(fadeAmount(0, 100, 1000, 400, 0)).toBe(0)
    expect(fadeAmount(100, 200, 1000, 400, 0)).toBe(0.25)
    expect(fadeAmount(400, 500, 1000, 400, 0)).toBe(1)
    expect(fadeAmount(900, 1000, 1000, 400, 0)).toBe(1)
  })

  it("falls to nothing at the end", () => {
    expect(fadeAmount(900, 1000, 1000, 0, 400)).toBe(0)
    expect(fadeAmount(800, 900, 1000, 0, 400)).toBe(0.25)
    expect(fadeAmount(0, 100, 1000, 0, 400)).toBe(1)
  })

  it("takes the lower of the two when fades overlap, and never goes below nothing", () => {
    expect(fadeAmount(100, 200, 400, 400, 400)).toBe(0.25)
    expect(fadeAmount(200, 300, 400, 400, 400)).toBe(0.25)
    // Times past the end, as rounding can produce.
    expect(fadeAmount(0, 1100, 1000, 0, 400)).toBe(0)
  })
})

describe("fadePixels", () => {
  it("mixes towards the colour and keeps opacity", () => {
    const original = pixels([200, 100, 0, 128])
    expect([...fadePixels(original, [0, 0, 0], 1).data]).toEqual([
      200, 100, 0, 128,
    ])
    expect([...fadePixels(original, [0, 0, 0], 0.5).data]).toEqual([
      100, 50, 0, 128,
    ])
    expect([...fadePixels(original, [255, 255, 255], 0).data]).toEqual([
      255, 255, 255, 128,
    ])
    expect(fadePixels(original, [0, 0, 0], 1).data).not.toBe(original.data)
  })
})

describe("paintOver", () => {
  const grid = (width: number, height: number, value: number[]): Pixels => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) data.set(value, i * 4)
    return { data, width, height }
  }
  const at = (image: Pixels, x: number, y: number) => [
    ...image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4
    ),
  ]

  it("replaces what is under a solid layer and leaves the rest", () => {
    const frame = grid(3, 2, [10, 10, 10, 255])
    const result = paintOver(frame, grid(1, 1, [200, 0, 0, 255]), 1, 1)
    expect(at(result, 1, 1)).toEqual([200, 0, 0, 255])
    expect(at(result, 0, 0)).toEqual([10, 10, 10, 255])
    expect(at(result, 2, 1)).toEqual([10, 10, 10, 255])
    // The frame handed in is not changed.
    expect(at(frame, 1, 1)).toEqual([10, 10, 10, 255])
    expect(result).toMatchObject({ width: 3, height: 2 })
  })

  it("blends a see-through layer, and applies the extra opacity", () => {
    const frame = grid(1, 1, [0, 0, 0, 255])
    const half = grid(1, 1, [255, 255, 255, 128])
    expect(at(paintOver(frame, half), 0, 0)).toEqual([128, 128, 128, 255])
    expect(
      at(paintOver(frame, grid(1, 1, [200, 100, 0, 255]), 0, 0, 0.5), 0, 0)
    ).toEqual([100, 50, 0, 255])
    // Clear layer pixels change nothing, whatever colour they carry.
    expect(at(paintOver(frame, grid(1, 1, [255, 0, 0, 0])), 0, 0)).toEqual([
      0, 0, 0, 255,
    ])
    expect(
      at(paintOver(frame, grid(1, 1, [255, 0, 0, 255]), 0, 0, 0), 0, 0)
    ).toEqual([0, 0, 0, 255])
  })

  it("paints onto clear and half-clear pixels", () => {
    const layer = grid(1, 1, [200, 100, 0, 128])
    expect(at(paintOver(grid(1, 1, [9, 9, 9, 0]), layer), 0, 0)).toEqual([
      200, 100, 0, 128,
    ])
    // Half over half: three quarters solid, the layer counting twice as much.
    expect(
      at(
        paintOver(grid(1, 1, [0, 0, 0, 128]), grid(1, 1, [255, 255, 255, 128])),
        0,
        0
      )
    ).toEqual([170, 170, 170, 192])
  })

  it("leaves out the parts of a layer that fall outside the frame", () => {
    const frame = grid(2, 2, [0, 0, 0, 255])
    const layer = grid(2, 2, [255, 255, 255, 255])
    const corner = paintOver(frame, layer, -1, -1)
    expect(at(corner, 0, 0)).toEqual([255, 255, 255, 255])
    expect(at(corner, 1, 0)).toEqual([0, 0, 0, 255])
    expect(at(corner, 0, 1)).toEqual([0, 0, 0, 255])
    const far = paintOver(frame, layer, 1, 1)
    expect(at(far, 1, 1)).toEqual([255, 255, 255, 255])
    expect(at(far, 0, 1)).toEqual([0, 0, 0, 255])
    expect([...paintOver(frame, layer, 5, 5).data]).toEqual([...frame.data])
    expect([...paintOver(frame, layer, -5, -5).data]).toEqual([...frame.data])
  })
})

describe("overlayRect", () => {
  const frame = { width: 200, height: 100 }
  const logo = { width: 40, height: 20 }

  it("sizes by the frame's width, keeping the image's shape", () => {
    expect(overlayRect(frame, logo, "top-left", 25)).toEqual({
      x: 4,
      y: 4,
      width: 50,
      height: 25,
    })
  })

  it("sits a margin away from the edges of its corner", () => {
    expect(overlayRect(frame, logo, "top-right", 25)).toMatchObject({
      x: 146,
      y: 4,
    })
    expect(overlayRect(frame, logo, "bottom-left", 25)).toMatchObject({
      x: 4,
      y: 71,
    })
    expect(overlayRect(frame, logo, "bottom-right", 25)).toMatchObject({
      x: 146,
      y: 71,
    })
    expect(overlayRect(frame, logo, "centre", 25)).toMatchObject({
      x: 75,
      y: 38,
    })
  })

  it("gives up the margin when there is no room for it", () => {
    // Full width: nothing is pushed off the side.
    expect(overlayRect(frame, logo, "bottom-right", 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    // 98% leaves 4 px: 2 px on the side it sits against.
    expect(overlayRect(frame, logo, "top-left", 98)).toMatchObject({
      x: 2,
      y: 1,
    })
    expect(overlayRect(frame, logo, "top-right", 98)).toMatchObject({ x: 2 })
    // Taller than the frame: it stays against its edge, and the rest is cut off.
    const tall = { width: 10, height: 30 }
    expect(overlayRect(frame, tall, "bottom-left", 50)).toEqual({
      x: 4,
      y: -200,
      width: 100,
      height: 300,
    })
    expect(overlayRect(frame, tall, "top-left", 50)).toMatchObject({ y: 0 })
  })

  it("never shrinks to nothing", () => {
    expect(
      overlayRect(
        { width: 4, height: 4 },
        { width: 100, height: 1 },
        "centre",
        5
      )
    ).toMatchObject({ width: 1, height: 1 })
  })
})

describe("wrapText and fitLines", () => {
  // Every character is as wide as the text is tall.
  const measure = (text: string, size = 1) => text.length * size

  it("breaks at spaces when a line would be too wide", () => {
    expect(wrapText("one two three four", 9, measure)).toEqual([
      "one two",
      "three",
      "four",
    ])
    expect(wrapText("one two", 100, measure)).toEqual(["one two"])
  })

  it("keeps typed line breaks and drops spare spaces", () => {
    expect(wrapText("  top   line \n\n second ", 100, measure)).toEqual([
      "top line",
      "second",
    ])
    expect(wrapText("   ", 100, measure)).toEqual([])
  })

  it("keeps a word that is too long whole", () => {
    expect(wrapText("a incomprehensible b", 5, measure)).toEqual([
      "a",
      "incomprehensible",
      "b",
    ])
  })

  it("keeps the text size when the lines fit", () => {
    expect(fitLines("one two three", 100, 10, measure)).toEqual({
      lines: ["one two", "three"],
      fontSize: 10,
    })
  })

  it("makes the text smaller until the longest word fits", () => {
    // The size drops a tenth at a time: 18, 16, 14, 12, then 10, where nine characters fit.
    expect(fitLines("so wonderful", 100, 20, measure)).toEqual({
      lines: ["so", "wonderful"],
      fontSize: 10,
    })
  })

  it("stops shrinking at the smallest readable size", () => {
    expect(fitLines("incomprehensibilities", 50, 20, measure)).toEqual({
      lines: ["incomprehensibilities"],
      fontSize: 8,
    })
    // A size below the smallest is raised to it.
    expect(fitLines("hi", 100, 3, measure).fontSize).toBe(8)
  })
})

describe("captionLayout", () => {
  const caption = {
    top: " Hello ",
    bottom: "",
    size: "medium" as const,
    colour: [255, 255, 255] as [number, number, number],
    outline: true,
    uppercase: false,
  }

  it("is nothing without text", () => {
    expect(
      captionLayout({ width: 100, height: 50 }, { ...caption, top: "  " })
    ).toBeNull()
  })

  it("sizes text and margin by the shorter side", () => {
    expect(captionLayout({ width: 400, height: 200 }, caption)).toEqual({
      width: 400,
      height: 200,
      fontSize: 20,
      margin: 8,
      colour: [255, 255, 255],
      outline: [0, 0, 0],
      top: "Hello",
      bottom: "",
    })
    expect(
      captionLayout({ width: 200, height: 400 }, { ...caption, size: "small" })
    ).toMatchObject({ fontSize: 14 })
    expect(
      captionLayout({ width: 400, height: 200 }, { ...caption, size: "large" })
    ).toMatchObject({ fontSize: 28 })
    // A tiny animation still gets text that can be read.
    expect(captionLayout({ width: 20, height: 20 }, caption)).toMatchObject({
      fontSize: 8,
      margin: 2,
    })
  })

  it("writes capitals when asked, top and bottom", () => {
    expect(
      captionLayout(
        { width: 100, height: 100 },
        { ...caption, bottom: "the end", uppercase: true }
      )
    ).toMatchObject({ top: "HELLO", bottom: "THE END" })
    expect(
      captionLayout(
        { width: 100, height: 100 },
        { ...caption, top: "", bottom: "b" }
      )
    ).toMatchObject({ top: "", bottom: "b" })
  })

  it("outlines light text in black, dark text in white, or not at all", () => {
    const size = { width: 100, height: 100 }
    expect(
      captionLayout(size, { ...caption, colour: [20, 20, 60] })
    ).toMatchObject({ outline: [255, 255, 255] })
    expect(
      captionLayout(size, { ...caption, colour: [250, 220, 0] })
    ).toMatchObject({ outline: [0, 0, 0] })
    expect(captionLayout(size, { ...caption, outline: false })).toMatchObject({
      outline: null,
    })
  })
})

describe("captionShows", () => {
  it("shows all the way through without times", () => {
    expect(captionShows(0, 100, null, null)).toBe(true)
    expect(captionShows(5000, 5100, null, null)).toBe(true)
  })

  it("shows on frames that overlap its times", () => {
    expect(captionShows(0, 100, 0.1, null)).toBe(false)
    expect(captionShows(50, 150, 0.1, null)).toBe(true)
    expect(captionShows(100, 200, 0.1, 0.2)).toBe(true)
    expect(captionShows(200, 300, 0.1, 0.2)).toBe(false)
    expect(captionShows(150, 250, null, 0.2)).toBe(true)
  })
})
