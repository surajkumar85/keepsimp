import { describe, expect, it } from "vitest"
import { defaultSettings, type CompressorSettings } from "./settings"
import {
  compressorChanged,
  compressorChanges,
  compressorSummary,
  sentence,
  turnSaid,
} from "./summary"

const with_ = (change: Partial<CompressorSettings>): CompressorSettings => ({
  ...defaultSettings,
  ...change,
})

describe("compressor groups", () => {
  it("counts only the changes that reach the file", () => {
    expect(compressorChanges(defaultSettings, defaultSettings)).toBe(0)
    // A slider or target that the chosen level never reads is not a change.
    expect(
      compressorChanged(
        "compression",
        with_({ quality: 30, targetSize: "90", allowDownscale: false }),
        defaultSettings
      )
    ).toBe(false)
    expect(
      compressorChanged("compression", with_({ compression: "custom" }), {
        ...defaultSettings,
      })
    ).toBe(true)
    expect(
      compressorChanged(
        "compression",
        with_({ compression: "custom", quality: 30 }),
        with_({ compression: "custom" })
      )
    ).toBe(true)
    expect(
      compressorChanged(
        "compression",
        with_({ compression: "target", targetSize: "90" }),
        with_({ compression: "target" })
      )
    ).toBe(true)
    expect(
      compressorChanged(
        "size",
        with_({ longEdge: 640, customWidth: "10", lock: false, fit: "cover" }),
        defaultSettings
      )
    ).toBe(false)
    const custom = with_({ size: "custom" })
    expect(
      compressorChanged("size", with_({ size: "custom", fit: "cover" }), custom)
    ).toBe(false)
    expect(
      compressorChanged(
        "size",
        with_({ size: "custom", lock: false, fit: "cover" }),
        custom
      )
    ).toBe(true)
    expect(
      compressorChanged(
        "size",
        with_({ size: "long-edge", longEdge: 640 }),
        with_({ size: "long-edge" })
      )
    ).toBe(true)
    expect(
      compressorChanged(
        "advanced",
        with_({ backgroundColor: "#000000" }),
        defaultSettings
      )
    ).toBe(false)
    expect(
      compressorChanged(
        "advanced",
        with_({ background: "custom", backgroundColor: "#000000" }),
        with_({ background: "custom" })
      )
    ).toBe(true)
    expect(
      compressorChanges(
        with_({ format: "webp", rotation: 90, effort: "max" }),
        defaultSettings
      )
    ).toBe(3)
  })
})

describe("compressor summaries", () => {
  it("says the format", () => {
    expect(compressorSummary("format", defaultSettings)).toBe(
      "Same as original"
    )
    expect(compressorSummary("format", with_({ format: "auto" }))).toBe(
      "Auto (smallest)"
    )
    expect(compressorSummary("format", with_({ format: "avif" }))).toBe("AVIF")
  })

  it("says the level of compression", () => {
    expect(compressorSummary("compression", defaultSettings)).toBe("Smart")
    expect(
      compressorSummary("compression", with_({ compression: "lossless" }))
    ).toBe("Lossless")
    expect(
      compressorSummary(
        "compression",
        with_({ compression: "custom", quality: 42 })
      )
    ).toBe("Quality 42")
    expect(
      compressorSummary("compression", with_({ compression: "target" }))
    ).toBe("At most 200 KB · may shrink to fit")
    expect(
      compressorSummary(
        "compression",
        with_({
          compression: "target",
          targetSize: "1.5",
          targetUnit: "MB",
          allowDownscale: false,
        })
      )
    ).toBe("At most 1.5 MB")
    expect(
      compressorSummary(
        "compression",
        with_({ compression: "target", targetSize: " " })
      )
    ).toBe("No target size yet")
  })

  it("says the size", () => {
    expect(compressorSummary("size", defaultSettings)).toBe("Original size")
    expect(compressorSummary("size", with_({ size: "50" }))).toBe(
      "50% of the original"
    )
    expect(compressorSummary("size", with_({ size: "long-edge" }))).toBe(
      "Long edge 1920 px"
    )
    expect(
      compressorSummary(
        "size",
        with_({ size: "custom", customWidth: "200", customHeight: "" })
      )
    ).toBe("200 × auto px")
    expect(
      compressorSummary(
        "size",
        with_({
          size: "custom",
          customWidth: "",
          customHeight: "90",
          lock: false,
          fit: "cover",
        })
      )
    ).toBe("auto × 90 px · filled and cropped")
    expect(
      compressorSummary(
        "size",
        with_({
          size: "custom",
          unit: "percent",
          customWidth: "40",
          customHeight: "40",
        })
      )
    ).toBe("40% of the original")
    expect(
      compressorSummary(
        "size",
        with_({
          size: "custom",
          unit: "percent",
          customWidth: "40",
          customHeight: "20",
          lock: false,
          fit: "stretch",
        })
      )
    ).toBe("40% × 20% · stretched")
  })

  it("says the crop and turn", () => {
    expect(compressorSummary("crop", defaultSettings)).toBe("No crop or turn")
    expect(
      compressorSummary(
        "crop",
        with_({ crop: { x: 0, y: 0, width: 300, height: 200 }, rotation: 90 })
      )
    ).toBe("Cropped to 300 × 200 px · turned 90° right")
    expect(compressorSummary("crop", with_({ flipY: true }))).toBe(
      "Flipped vertically"
    )
    expect(turnSaid(180, true, false)).toBe(
      "turned 180° · flipped horizontally"
    )
    expect(turnSaid(270, true, true)).toBe(
      "turned 90° left · flipped both ways"
    )
    expect(turnSaid(0, false, false)).toBe("")
    expect(sentence("")).toBe("")
  })

  it("says the advanced options", () => {
    expect(compressorSummary("advanced", defaultSettings)).toBe(
      "Balanced effort · Lanczos"
    )
    expect(
      compressorSummary(
        "advanced",
        with_({
          effort: "max",
          resample: "catrom",
          chroma444: true,
          progressive: false,
          pngColors: 64,
          dithering: false,
          background: "black",
        })
      )
    ).toBe(
      "Maximum effort · Catmull-Rom · full colour detail · baseline JPEG · 64 PNG colours · no dithering · black behind transparency"
    )
    expect(
      compressorSummary(
        "advanced",
        with_({
          effort: "fast",
          resample: "mitchell",
          background: "custom",
          backgroundColor: "#123456",
        })
      )
    ).toBe("Fast effort · Mitchell · #123456 behind transparency")
  })
})
