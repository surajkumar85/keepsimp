import { describe, expect, it } from "vitest"
import { sampleProblem, sampleSize } from "@/lib/color/sample"
import { Agent } from "./agent"
import { colorTools } from "./color"

const PNG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0)

/** Pixels as a drawing would give them: half teal, half white, a corner clear. */
function pixels() {
  const data = new Uint8ClampedArray(16 * 16 * 4)
  for (let index = 0; index < 256; index++) {
    const teal = index < 128
    data.set(teal ? [0, 120, 111, 255] : [255, 255, 255, 255], index * 4)
  }
  data[3] = 0
  return data
}

const drawing = (data = pixels()) => ({ data, width: 16, height: 16 })
const strip = async (colors: string[]) =>
  new Blob([colors.join(",")], { type: "image/png" })
const agent = (sample = async () => drawing()) =>
  new Agent(colorTools(sample, strip))
const call = (made: Agent, name: string, input: unknown) =>
  made.call(name, input, { caller: "page" })

describe("the sample rules", () => {
  it("takes the four image types up to 10 MiB, drawn at most 256 wide", () => {
    expect(sampleProblem("image/png", 10)).toBeNull()
    expect(sampleProblem("image/svg+xml", 10)).toMatch(/Choose a PNG/)
    expect(sampleProblem("image/png", 11 * 1024 * 1024)).toMatch(/10 MiB/)
    expect(sampleSize(1000, 500)).toEqual({ width: 256, height: 128 })
    expect(sampleSize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(sampleSize(10000, 1)).toEqual({ width: 256, height: 1 })
    expect(() => sampleSize(6000, 6000)).toThrow(/30 million/)
  })
})

describe("the colour tools", () => {
  it("converts colours, saying which could not be read", async () => {
    const result = await call(agent(), "convert_color", {
      colors: ["color(display-p3 1 0 0)", "nonsense"],
    })
    expect(result.summary).toBe(
      "Read 1 of 2 colours; the others could not be read."
    )
    const [p3, bad] = result.data as [
      {
        inSrgb: boolean
        inDisplayP3: boolean
        values: { space: string; mapped: boolean }[]
      },
      { problem: string },
    ]
    expect([p3.inSrgb, p3.inDisplayP3]).toEqual([false, true])
    expect(p3.values.find((value) => value.space === "HEX")?.mapped).toBe(true)
    expect(bad.problem).toBeTruthy()
    expect(
      (await call(agent(), "convert_color", { colors: ["#00786f"] })).summary
    ).toBe("Read 1 colour.")
    expect(
      (await call(agent(), "convert_color", { colors: ["red", "blue"] }))
        .summary
    ).toBe("Read 2 colours.")
  })

  it("gives one value for each colour, as the batch converter does", async () => {
    const result = await call(agent(), "convert_color", {
      colors: ["#00786f", "nonsense", "color(display-p3 1 0 0)"],
      format: "hex",
    })
    expect(result.summary).toBe(
      "Read 2 of 3 colours; the others could not be read."
    )
    const [teal, bad, red] = result.data as {
      value?: string
      problem?: string
    }[]
    expect(teal).toEqual({ input: "#00786f", value: "#00786f" })
    expect(bad.problem).toBeTruthy()
    // Mapped by reducing chroma, as CSS does, not clipped to #ff0000.
    expect(red.value).toBe("#ff0b0c")
    const oklch = await call(agent(), "convert_color", {
      colors: ["#00786f"],
      format: "oklch",
    })
    expect((oklch.data as { value: string }[])[0].value).toMatch(/^oklch\(/)
  })

  it("checks contrast over the canvas and suggests a passing colour", async () => {
    const good = await call(agent(), "check_contrast", {
      foreground: "#141413",
      background: "#faf9f5",
    })
    expect(good.summary).toMatch(/^1\d\.\d+:1\. Passes AA for text and AAA\.$/)
    const pale = await call(agent(), "check_contrast", {
      foreground: "#999999",
      background: "#ffffff",
    })
    expect(pale.summary).toMatch(
      /Fails AA for text\. #[0-9a-f]{6} would reach 4\.5:1\.$/
    )
    const suggested = (pale.data as { suggestion: string }).suggestion
    expect(
      (
        (
          await call(agent(), "check_contrast", {
            foreground: suggested,
            background: "#ffffff",
          })
        ).data as { aa: boolean }
      ).aa
    ).toBe(true)
    const middling = await call(agent(), "check_contrast", {
      foreground: "#666666",
      background: "#ffffff",
    })
    expect(middling.summary).toMatch(/Passes AA for text\.$/)
    const clear = await call(agent(), "check_contrast", {
      foreground: "#000000",
      background: "rgb(0 0 0 / 0)",
      canvas: "#000000",
    })
    expect((clear.data as { ratio: number }).ratio).toBe(1)
    await expect(
      call(agent(), "check_contrast", { foreground: "x", background: "#fff" })
    ).rejects.toThrow()
  })

  it("aims at the target asked for, with ΔE2000 and vision previews", async () => {
    const stricter = await call(agent(), "check_contrast", {
      foreground: "#666666",
      background: "#ffffff",
      target: 7,
    })
    expect(stricter.summary).toMatch(
      /Passes AA for text\. #[0-9a-f]{6} would reach 7:1\.$/
    )
    const data = stricter.data as {
      target: number
      suggestion: string
      difference: number
      vision: Record<string, { foreground: string; background: string }>
    }
    expect(data.target).toBe(7)
    expect(
      (
        (
          await call(agent(), "check_contrast", {
            foreground: data.suggestion,
            background: "#ffffff",
          })
        ).data as { aaa: boolean }
      ).aaa
    ).toBe(true)
    expect(data.difference).toBe(43.13)
    expect(Object.keys(data.vision)).toEqual([
      "protan",
      "deutan",
      "tritan",
      "grayscale",
    ])
    expect(data.vision.grayscale).toEqual({
      foreground: "#666666",
      background: "#ffffff",
    })
    const red = await call(agent(), "check_contrast", {
      foreground: "#ff0000",
      background: "#00ff00",
    })
    const { vision } = red.data as typeof data
    expect(vision.deutan.foreground).not.toBe("#ff0000")
    const impossible = await call(agent(), "check_contrast", {
      foreground: "#000000",
      background: "#777777",
      target: 7,
    })
    expect(impossible.summary).toMatch(
      /No opaque text colour reaches 7:1 on this background\.$/
    )
    expect((impossible.data as typeof data).suggestion).toBeNull()
  })

  it("makes harmonies and tones, or exports a palette as a file", async () => {
    const tools = agent()
    const made = await call(tools, "make_palette", {
      color: "#00786f",
      harmony: "triadic",
      format: "css",
    })
    expect(made.summary).toBe(
      "3 colours and a scale of 11 tones. Written as css to palette.css."
    )
    const { palette, tones } = made.data as {
      palette: string[]
      tones: unknown[]
    }
    expect(palette).toHaveLength(3)
    expect(tones).toHaveLength(11)
    const css = await tools.files.get(made.files![0].id).blob.text()
    expect(css).toContain("--color-1:")
    const plain = await call(tools, "make_palette", { color: "red" })
    expect((plain.data as { palette: string[] }).palette).toHaveLength(3)
    const own = await call(tools, "make_palette", {
      colors: ["red", "blue"],
      format: "gpl",
    })
    expect(own.summary).toBe("2 colours. Written as gpl to palette.gpl.")
    expect(own.data).toEqual({ palette: ["red", "blue"], tones: undefined })
    await expect(call(tools, "make_palette", {})).rejects.toThrow(
      'Give either "color" or "colors".'
    )
    await expect(
      call(tools, "make_palette", { colors: ["red"], harmony: "split" })
    ).rejects.toThrow(/one colour/)
    await expect(call(tools, "make_palette", { color: "x" })).rejects.toThrow()
    await expect(
      call(tools, "make_palette", { colors: ["x"], format: "css" })
    ).rejects.toThrow()
    const png = await call(tools, "make_palette", {
      colors: ["red", "blue"],
      format: "png",
    })
    expect(png.summary).toBe("2 colours. Written as png to palette.png.")
    const strip = tools.files.get(png.files![0].id).blob
    expect([strip.type, await strip.text()]).toEqual(["image/png", "red,blue"])
  })

  it("mixes two colours in the space asked for", async () => {
    const half = await call(agent(), "mix_colors", {
      first: "#000000",
      second: "#ffffff",
    })
    expect(half.summary).toMatch(/^#[0-9a-f]{6}: 50% of #ffffff in #000000\.$/)
    const linear = await call(agent(), "mix_colors", {
      first: "#000000",
      second: "#ffffff",
      amount: 0.5,
      space: "srgb-linear",
    })
    expect((linear.data as { hex: string }).hex).toBe("#bcbcbc")
    const srgb = await call(agent(), "mix_colors", {
      first: "#000000",
      second: "#ffffff",
      amount: 0.25,
      space: "srgb",
    })
    expect(srgb.data).toMatchObject({ hex: "#404040", inSrgb: true })
    const wide = await call(agent(), "mix_colors", {
      first: "color(display-p3 1 0 0)",
      second: "color(display-p3 1 0 0)",
      space: "oklch",
    })
    expect(wide.summary).toContain("(mapped into sRGB)")
    await expect(
      call(agent(), "mix_colors", { first: "x", second: "#fff" })
    ).rejects.toThrow()
  })

  it("writes gradients with a fallback, keeping hard edges", async () => {
    const plain = await call(agent(), "make_gradient", {
      stops: [
        { color: "red", position: 0 },
        { color: "blue", position: 100 },
      ],
    })
    expect(plain.summary).toBe(
      "A linear gradient of 2 stops, blended in oklab."
    )
    const data = plain.data as {
      css: string
      modern: string
      fallback: string
    }
    expect(data.modern).toBe(
      "linear-gradient(90deg in oklab, #ff0000 0%, #0000ff 100%)"
    )
    expect(data.css).toBe(
      `background: ${data.fallback};\nbackground: ${data.modern};`
    )
    const hard = await call(agent(), "make_gradient", {
      stops: [
        { color: "red", position: 0 },
        { color: "red", position: 50 },
        { color: "blue", position: 50 },
        { color: "blue", position: 100 },
      ],
      kind: "conic",
      angle: 45,
      space: "srgb",
    })
    const { fallback, modern } = hard.data as typeof data
    expect(modern).toMatch(/^conic-gradient\(from 45deg in srgb,/)
    expect(fallback).toContain("#ff0000 50%, #0000ff 50%")
    await expect(
      call(agent(), "make_gradient", {
        stops: [
          { color: "red", position: 60 },
          { color: "blue", position: 10 },
        ],
      })
    ).rejects.toThrow(/smallest to largest/)
  })

  it("lists brand colours with their sources and writes them", async () => {
    const tools = agent()
    const list = await call(tools, "brand_colors", {})
    const names = (list.data as { name: string }[]).map((brand) => brand.name)
    expect(names).toContain("Microsoft")
    expect(list.summary).toMatch(/^\d+ companies: /)
    await expect(
      call(tools, "brand_colors", { format: "css" })
    ).rejects.toThrow(/Name the "brand"/)
    const microsoft = await call(tools, "brand_colors", { brand: "Microsoft" })
    expect(microsoft.files).toEqual([])
    expect(microsoft.data).toMatchObject({
      name: "Microsoft",
      source: expect.stringMatching(/^https:\/\//),
    })
    const written = await call(tools, "brand_colors", {
      brand: "Microsoft",
      format: "png",
    })
    expect(written.summary).toMatch(
      /Written as png to microsoft-colors\.png\.$/
    )
    const css = await call(tools, "brand_colors", {
      brand: "Microsoft",
      format: "css",
    })
    expect(await tools.files.get(css.files![0].id).blob.text()).toContain(
      "--color-1: #0078d4;"
    )
  })

  it("finds the main colours of an image, leaving clear pixels out", async () => {
    const tools = agent()
    const image = tools.files.add(
      new Blob([PNG], { type: "image/png" }),
      "a.png"
    )
    const found = await call(tools, "colors_from_image", {
      file: image.id,
      count: 2,
    })
    expect(found.summary).toBe("2 main colours of a.png.")
    expect(found.data).toEqual([
      { color: "#ffffff", share: 0.502 },
      { color: "#00786f", share: 0.498 },
    ])
    const svg = tools.files.add(
      new Blob(["<svg/>"], { type: "image/svg+xml" }),
      "a.svg"
    )
    await expect(
      call(tools, "colors_from_image", { file: svg.id })
    ).rejects.toThrow(/Choose a PNG/)
    const lying = tools.files.add(
      new Blob(["not a png"], { type: "image/png" }),
      "b.png"
    )
    await expect(
      call(tools, "colors_from_image", { file: lying.id })
    ).rejects.toThrow(/do not match/)
    const empty = agent(async () => drawing(new Uint8ClampedArray(16)))
    const clearImage = empty.files.add(
      new Blob([PNG], { type: "image/png" }),
      "c.png"
    )
    await expect(
      call(empty, "colors_from_image", { file: clearImage.id })
    ).rejects.toThrow(/no visible pixels/)
  })

  it("reads one pixel of the drawn image, opacity included", async () => {
    const tools = agent()
    const image = tools.files.add(
      new Blob([PNG], { type: "image/png" }),
      "a.png"
    )
    const corner = await call(tools, "pick_image_color", {
      file: image.id,
      x: 0,
      y: 0,
    })
    expect(corner.data).toEqual({
      color: "rgb(0 120 111 / 0.000000)",
      hex: "#00786f00",
      sample: { width: 16, height: 16 },
    })
    const white = await call(tools, "pick_image_color", {
      file: image.id,
      x: 5,
      y: 10,
    })
    expect(white.summary).toBe("Pixel 5, 10 of a.png is #ffffff.")
    await expect(
      call(tools, "pick_image_color", { file: image.id, x: 16, y: 0 })
    ).rejects.toThrow(
      "a.png is drawn 16 × 16 pixels; give x under 16 and y under 16."
    )
    await expect(
      call(tools, "pick_image_color", { file: image.id, x: 0, y: 20 })
    ).rejects.toThrow(/y under 16/)
  })
})
