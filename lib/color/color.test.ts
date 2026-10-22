import { describe, expect, it } from "vitest"
import {
  bounded,
  bulkConvert,
  composite,
  contrast,
  contrastSuggestion,
  css,
  defaults,
  difference,
  hex,
  inspect,
  mixColors,
  parseColor,
  spaces,
} from "./core"
import {
  checkImageHeader,
  exportPalette,
  gradient,
  gradientFallback,
  gradientSample,
  harmony,
  paletteFromPixels,
  tones,
  type ExportFormat,
  type Harmony,
} from "./palette"
import { simulate } from "./vision"
import { brands } from "./brands"
import { drawStrip, STRIP_SIDE, stripSize } from "./strip"

describe("color conversion", () => {
  it.each([
    ["red", "#ff0000"],
    ["#abc", "#aabbcc"],
    ["#abc8", "#aabbcc88"],
    ["rgb(255 0 0 / .5)", "#ff000080"],
    ["hsl(120 100% 50%)", "#00ff00"],
    ["hwb(240 0% 0%)", "#0000ff"],
    ["transparent", "#00000000"],
    ["hsv(0 100% 100%)", "#ff0000"],
    ["hsb(-120 100 100)", "#0000ff"],
    ["hsv(0 0% 100%)", "#ffffff"],
    ["hsv(120 100% 0%)", "#000000"],
    ["hsv(60 100% 50%)", "#808000"],
    ["cmyk(0% 100% 100% 0%)", "#ff0000"],
    ["cmyk(0 0 0 100)", "#000000"],
  ])("reads %s", (text, value) => expect(hex(parseColor(text))).toBe(value))
  it.each([
    "",
    "a".repeat(513),
    "rgb(NaN 0 0)",
    "rgb(Infinity 0 0)",
    "rgb(none 0 0)",
    "var(--brand)",
    "currentColor",
    "rgb(from red r g b)",
    "red; background:url(x)",
    "<svg>",
    "url(https://example.com)",
    "unknown-color",
    "rgb(1 2 3) junk",
    "cmyk(0 0)",
    "hsv(0 100% 101%)",
    "hsv(0 broken 10)",
    "lab(1000001 0 0)",
    "cmyk(0 0 0 -1)",
  ])("rejects %s", (text) => expect(() => parseColor(text)).toThrow())
  it("keeps modern and wide-gamut coordinates while flagging mapped fallbacks", () => {
    const p3 = inspect("color(display-p3 0 1 0)")
    expect(p3.inSrgb).toBe(false)
    expect(p3.inP3).toBe(true)
    expect(p3.rows.find((r) => r.label === "Display P3")!.value).toBe(
      "color(display-p3 0 1 0)"
    )
    expect(p3.rows.find((r) => r.label === "HEX")!.mapped).toBe(true)
    expect(parseColor(p3.hex).inGamut("srgb")).toBe(true)
    expect(p3.color.spaceId).toBe("p3")
    expect(inspect("oklch(0.7 0.5 30)").inP3).toBe(false)
  })
  it.each([
    "red",
    "black",
    "white",
    "transparent",
    "#00786f",
    "#abc8",
    "lab(50 20 30)",
    "lch(60 20 220)",
    "oklab(.6 .1 -.05)",
    "color(display-p3 .7 .1 .2)",
    "rgb(300 -10 0)",
  ])("has finite reusable representations for %s", (input) => {
    const info = inspect(input)
    expect(info.rows).toHaveLength(spaces.length + 3)
    for (const row of info.rows) {
      expect(row.value).not.toMatch(/NaN|Infinity|none/)
      const reparsed = parseColor(row.value)
      expect(reparsed.coords.every((c) => Number.isFinite(c))).toBe(true)
    }
  })
  it("handles achromatic HSV/CMYK and limits alpha without silently changing source gamut", () => {
    expect(
      inspect("black").rows.find((r) => r.label === "CMYK (approximate)")!.value
    ).toBe("cmyk(0% 0% 0% 100%)")
    expect(
      inspect("white").rows.find((r) => r.label === "HSV / HSB")!.value
    ).toBe("hsv(0 0% 100%)")
    expect(parseColor("rgb(10 20 30 / 2)").alpha).toBe(1)
    expect(hex(parseColor("#1234"), false)).toBe("#112233")
    expect(css(parseColor("black"))).toMatch(/oklch/)
    expect(() => parseColor("color(srgb 1e309 0 0)")).toThrow()
  })
  it("converts batch lines independently and bounds work", () => {
    expect(bulkConvert("red\r\nbad\r\n#abc", "hex")).toMatchObject([
      { line: 1, value: "#ff0000" },
      { line: 2, error: expect.any(String) },
      { line: 3, value: "#aabbcc" },
    ])
    expect(bulkConvert("red", "rgb")[0].value).toContain("rgb(")
    expect(bulkConvert("red", "oklch")[0].value).toContain("oklch(")
    expect(() => bulkConvert("red\n".repeat(101), "hex")).toThrow(/100/)
    expect(() => bulkConvert("a".repeat(52001), "rgb")).toThrow(/52,000/)
    expect(bulkConvert("", "hex")[0].error).toBeTruthy()
  })
  it("bounds nonfinite input", () => {
    expect(bounded(0, 0, 1)).toBe(0)
    expect(bounded(1, 0, 1)).toBe(1)
    expect(() => bounded(NaN, 0, 1)).toThrow()
    expect(() => bounded(-1, 0, 1)).toThrow()
    expect(() => bounded(2, 0, 1)).toThrow()
  })
})
describe("contrast and perceptual checks", () => {
  it("matches the normative black-white contrast and never rounds a failing threshold up", () => {
    const r = contrast("black", "white")
    expect(r.ratio).toBeCloseTo(21, 10)
    expect(r).toMatchObject({
      aa: true,
      largeAA: true,
      aaa: true,
      largeAAA: true,
      graphics: true,
    })
    expect(contrast("white", "white")).toMatchObject({
      ratio: 1,
      aa: false,
      largeAA: false,
      aaa: false,
      largeAAA: false,
      graphics: false,
    })
    const close = contrast("rgb(118.66 118.66 118.66)", "white")
    expect(close.ratio).toBeLessThan(4.5)
    expect(close.aa).toBe(false)
  })
  it("composites both layers over an opaque canvas using sRGB source-over", () => {
    expect(
      hex(composite(parseColor("rgb(255 0 0 / .5)"), parseColor("blue")))
    ).toBe("#800080")
    expect(
      contrast("rgb(0 0 0 / .5)", "rgb(255 255 255 / .5)", "black").ratio
    ).toBeGreaterThan(2)
    expect(() => contrast("red", "white", "#ffffff80")).toThrow(/opaque/)
    expect(contrast("transparent", "white").ratio).toBe(1)
  })
  it.each([3, 4.5, 7])(
    "only suggests an exported color that passes %s",
    (target) => {
      const value = contrastSuggestion("#aaa", "white", defaults.white, target)
      expect(value).toBeTruthy()
      expect(contrast(value!, "white").ratio).toBeGreaterThanOrEqual(target)
    }
  )
  it("reports no solution if the requested threshold cannot be reached", () => {
    expect(contrastSuggestion("gray", "#777", defaults.white, 7)).toBeNull()
  })
  it("compares colors as perceptual coordinates, independent of alpha", () => {
    expect(difference("red", "#f00")).toBeCloseTo(0)
    expect(difference("#f008", "red")).toBeCloseTo(0)
    expect(difference("red", "blue")).toBeGreaterThan(40)
  })
  it.each(["protan", "deutan", "tritan", "grayscale"] as const)(
    "simulates %s in linear light",
    (kind) => {
      expect(hex(parseColor(simulate("red", kind)))).toMatch(/^#[0-9a-f]{6}$/)
      expect(simulate("black", kind)).toBe("#000000")
      expect(simulate("white", kind)).toBe("#ffffff")
      expect(simulate("#f008", kind)).toMatch(/88$/)
    }
  )
  it("uses linear luminance for grayscale", () => {
    const gray = parseColor(simulate("red", "grayscale")).coords
    expect(gray[0]).toBeCloseTo(gray[1]!, 8)
    expect(gray[1]).toBeCloseTo(gray[2]!, 8)
    expect(gray[0]).toBeGreaterThan(0.49)
  })
})
describe("palette operations and exports", () => {
  it.each([
    "analogous",
    "complementary",
    "split",
    "triadic",
    "tetradic",
    "monochrome",
  ] as Harmony[])("rotates %s in OKLCH and returns reusable colors", (mode) => {
    const values = harmony("#00786f", mode)
    expect(values.length).toBeGreaterThanOrEqual(2)
    values.forEach((value) => expect(() => parseColor(value)).not.toThrow())
    expect(harmony("black", mode).length).toBe(values.length)
  })
  it("builds an ordered tonal scale and maps its chroma into sRGB", () => {
    const scale = tones("oklch(.6 .4 20)")
    expect(scale).toHaveLength(11)
    expect(scale[0].label).toBe("50")
    expect(scale.at(-1)!.label).toBe("1000")
    expect(parseColor(scale[0].value).to("oklab").coords[0]).toBeGreaterThan(
      parseColor(scale.at(-1)!.value).to("oklab").coords[0]!
    )
    scale.forEach((s) => expect(parseColor(s.value).inGamut("srgb")).toBe(true))
  })
  it("mixes in the selected space and premultiplies alpha", () => {
    expect(hex(parseColor(mixColors("red", "blue", 0, "oklab")))).toBe(
      "#ff0000"
    )
    expect(hex(parseColor(mixColors("red", "blue", 1, "oklab")))).toBe(
      "#0000ff"
    )
    expect(hex(parseColor(mixColors("red", "blue", 0.5, "srgb")))).toBe(
      "#800080"
    )
    expect(hex(parseColor(mixColors("transparent", "red", 0.5, "srgb")))).toBe(
      "#ff000080"
    )
    expect(() => mixColors("red", "blue", 2, "oklab")).toThrow()
  })
  it.each([
    "css",
    "scss",
    "json",
    "tokens",
    "tailwind",
    "gpl",
    "svg",
  ] as ExportFormat[])(
    "exports %s without untrusted text injection",
    (format) => {
      const out = exportPalette(["red", "#00ff0080"], format)
      expect(out.extension).toBeTruthy()
      expect(out.text).toBeTruthy()
      expect(out.text).not.toMatch(/NaN|undefined/)
      expect(() => exportPalette(["<script>"], format)).toThrow()
    }
  )
  it("keeps alpha in structured exports and emits safe color tokens", () => {
    const plain = JSON.parse(exportPalette(["red", "#00ff0080"], "json").text)
    expect(plain["color-2"]).toBe("#00ff0080")
    const tokens = JSON.parse(exportPalette(["#00ff0080"], "tokens").text)
    expect(tokens["color-1"].$value).toMatchObject({
      colorSpace: "srgb",
      components: [0, 1, 0],
      alpha: 128 / 255,
    })
    expect(tokens["color-1"].$type).toBe("color")
    expect(exportPalette(["red"], "gpl").text).toContain("255 0 0 Color 1")
    expect(exportPalette(["#f008"], "svg").text).toContain(
      'fill-opacity="0.5333333333333333"'
    )
    expect(() => exportPalette([], "css")).toThrow()
    expect(() => exportPalette(Array(17).fill("red"), "css")).toThrow()
  })
  it("only exposes sourced, reusable brand references", () => {
    expect(brands.length).toBeGreaterThanOrEqual(12)
    for (const brand of brands) {
      expect(brand.source).toMatch(/^https:\/\//)
      expect(brand.scope.length).toBeGreaterThan(25)
      expect(brand.checked).toBe("2026-10-13")
      brand.colors.forEach((color) =>
        expect(hex(parseColor(color.value))).toBe(color.value)
      )
      expect(
        exportPalette(
          brand.colors.map((c) => c.value),
          "css"
        ).text
      ).toContain("--color-1")
    }
  })
})
describe("gradients and image sampling", () => {
  const stops = [
    { color: "red", position: 0 },
    { color: "blue", position: 100 },
  ]
  it.each(["linear", "radial", "conic"] as const)(
    "validates and exports %s with a fallback",
    (kind) => {
      expect(gradient(stops, kind, 90, "oklab").css).toContain(
        `${kind}-gradient(`
      )
      expect(gradientFallback(stops, kind, 90, "oklab")).not.toContain(
        " in oklab"
      )
      expect(gradientFallback(stops, kind, 90, "srgb")).toContain("#800080 50%")
    }
  )
  it("clamps sampling to the end colors and retains hard stops", () => {
    expect(
      gradientSample(
        [
          { color: "red", position: 10 },
          { color: "blue", position: 90 },
        ],
        0,
        "srgb"
      )
    ).toBe("red")
    expect(gradientSample(stops, 100, "srgb")).toBe("blue")
    expect(hex(parseColor(gradientSample(stops, 50, "srgb")))).toBe("#800080")
    const hard = [
      { color: "red", position: 50 },
      { color: "blue", position: 50 },
    ]
    expect(gradientSample(hard, 50, "srgb")).toBe("blue")
    expect(gradientFallback(hard, "linear", 0, "srgb")).toContain(
      "#ff0000 50%, #0000ff 50%"
    )
  })
  it("rejects malformed positions and excessive stops", () => {
    expect(() => gradient([], "linear", 0, "srgb")).toThrow()
    expect(() =>
      gradient(Array(9).fill(stops[0]), "linear", 0, "srgb")
    ).toThrow()
    expect(() => gradient([...stops].reverse(), "linear", 0, "srgb")).toThrow(
      /smallest/
    )
    expect(() =>
      gradient([{ color: "red", position: -1 }, stops[1]], "linear", 0, "srgb")
    ).toThrow()
    expect(() => gradientFallback(stops, "linear", 361, "srgb")).toThrow()
    expect(() => gradient(stops, "linear", 0, "srgb")).not.toThrow()
  })
  it("extracts dominant, separated colors from real RGBA pixels", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 254, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 0,
    ])
    const result = paletteFromPixels(pixels, 2)
    expect(result).toHaveLength(2)
    expect(result[0].color).toBe("#ff0000")
    expect(result[1].color).toBe("#0000ff")
    expect(result[0].share).toBeCloseTo(2 / 3)
    expect(paletteFromPixels(new Uint8ClampedArray([0, 0, 0, 0]), 2)).toEqual(
      []
    )
    const near = new Uint8ClampedArray([
      240, 0, 0, 255, 230, 0, 0, 255, 0, 0, 240, 255,
    ])
    expect(paletteFromPixels(near, 8)).toHaveLength(2)
  })
  it("bounds image sample memory and palette counts", () => {
    expect(() => paletteFromPixels(new Uint8ClampedArray(), 2)).toThrow()
    expect(() => paletteFromPixels(new Uint8ClampedArray(3), 2)).toThrow()
    expect(() =>
      paletteFromPixels(new Uint8ClampedArray(256 * 256 * 4 + 4), 2)
    ).toThrow()
    expect(() => paletteFromPixels(new Uint8ClampedArray(4), 2.5)).toThrow()
    expect(() => paletteFromPixels(new Uint8ClampedArray(4), 13)).toThrow()
  })
})

describe("the PNG palette strip", () => {
  it("draws one square swatch for each colour, opacity kept", () => {
    const drawn: string[] = []
    const context = {
      fillStyle: "",
      fillRect(x: number, y: number, width: number, height: number) {
        drawn.push(`${this.fillStyle} ${x} ${y} ${width} ${height}`)
      },
    }
    drawStrip(context as unknown as CanvasRenderingContext2D, [
      "red",
      "rgb(0 0 255 / 0.5)",
    ])
    expect(drawn).toEqual([
      `#ff0000 0 0 ${STRIP_SIDE} ${STRIP_SIDE}`,
      `#0000ff80 ${STRIP_SIDE} 0 ${STRIP_SIDE} ${STRIP_SIDE}`,
    ])
    expect(stripSize(3)).toEqual({ width: 480, height: 160 })
  })
})

describe("local image type checks", () => {
  it.each([
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["image/jpeg", [255, 216, 255]],
    ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
    ["image/gif", [71, 73, 70, 56, 55, 97]],
    ["image/gif", [71, 73, 70, 56, 57, 97]],
  ])("accepts the %s signature", (type, values) => {
    expect(() =>
      checkImageHeader(new Uint8Array(values as number[]), type as string)
    ).not.toThrow()
  })
  it.each([
    ["image/png", []],
    ["image/jpeg", [255, 0, 255]],
    ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0]],
    ["image/webp", []],
    ["image/gif", []],
    ["image/gif", [71, 73, 70, 56, 56, 97]],
    ["image/gif", [71, 73, 70, 56, 57, 0]],
    ["image/svg+xml", []],
  ])("refuses malformed or disguised %s data", (type, values) => {
    expect(() =>
      checkImageHeader(new Uint8Array(values as number[]), type as string)
    ).toThrow(/bytes do not match/)
  })
})

it("uses the exact normative WCAG sRGB luminance weights", () => {
  expect(contrast("red", "white").ratio).toBeCloseTo(1.05 / (0.2126 + 0.05), 10)
  expect(contrast("blue", "black").ratio).toBeCloseTo(
    (0.0722 + 0.05) / 0.05,
    10
  )
})
