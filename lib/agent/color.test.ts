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

const agent = (sample = async () => pixels()) => new Agent(colorTools(sample))
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
      /Fails AA for text\. #[0-9a-f]{6} would pass AA\.$/
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
    const empty = agent(async () => new Uint8ClampedArray(16))
    const clearImage = empty.files.add(
      new Blob([PNG], { type: "image/png" }),
      "c.png"
    )
    await expect(
      call(empty, "colors_from_image", { file: clearImage.id })
    ).rejects.toThrow(/no visible pixels/)
  })
})
