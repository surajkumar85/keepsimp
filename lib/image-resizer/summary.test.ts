import { describe, expect, it } from "vitest"
import { defaultSettings, type ResizerSettings } from "./settings"
import {
  printSized,
  resizerChanged,
  resizerChanges,
  resizerSummary,
} from "./summary"

const with_ = (change: Partial<ResizerSettings>): ResizerSettings => ({
  ...defaultSettings,
  ...change,
})
const box = { width: "100", height: "100" }

describe("resizer groups", () => {
  it("counts only the changes that reach the files", () => {
    expect(resizerChanges(defaultSettings, defaultSettings)).toBe(0)
    expect(
      resizerChanges(
        with_({ format: "webp", rotation: 90, sharpen: "light" }),
        defaultSettings
      )
    ).toBe(3)
  })

  it("leaves out sizes the chosen way of resizing never reads", () => {
    const changed = (settings: Partial<ResizerSettings>, usual = {}) =>
      resizerChanged("size", with_(settings), with_(usual))
    expect(changed({ side: "640", percent: "10", megapixels: "9" })).toBe(false)
    expect(changed({ presetId: "web-hero", presetGroup: "web" })).toBe(false)
    expect(changed({ dpi: 72 })).toBe(false)
    expect(changed({ unit: "in", dpi: 72 }, { unit: "in" })).toBe(true)
    expect(changed({ mode: "width", height: "5", lock: false })).toBe(true)
    expect(
      changed({ mode: "width", height: "5", lock: false }, { mode: "width" })
    ).toBe(false)
    expect(changed({ mode: "height", width: "5" }, { mode: "height" })).toBe(
      false
    )
    expect(
      changed({ mode: "longest", unit: "cm", width: "1" }, { mode: "longest" })
    ).toBe(false)
    expect(changed({ mode: "longest", side: "640" }, { mode: "longest" })).toBe(
      true
    )
    expect(
      changed({ mode: "percent", percent: "20" }, { mode: "percent" })
    ).toBe(true)
    expect(
      changed({ mode: "megapixels", megapixels: "8" }, { mode: "megapixels" })
    ).toBe(true)
    expect(
      changed({ mode: "preset", presetId: "web-hero" }, { mode: "preset" })
    ).toBe(true)
  })

  it("leaves out framing that does not apply", () => {
    const changed = (settings: Partial<ResizerSettings>, usual = {}) =>
      resizerChanged("fit", with_(settings), with_(usual))
    // Without both sides there is no frame to fit.
    expect(changed({ fit: "stretch" })).toBe(false)
    expect(changed({ ...box, fit: "stretch" }, box)).toBe(true)
    expect(
      changed(
        { ...box, fit: "inside", focusMode: "smart", background: "black" },
        { ...box, fit: "inside" }
      )
    ).toBe(false)
    expect(changed({ ...box, focusMode: "smart" }, box)).toBe(true)
    expect(
      changed(
        { ...box, focusMode: "smart", focus: { x: 0, y: 0 } },
        { ...box, focusMode: "smart" }
      )
    ).toBe(false)
    expect(changed({ ...box, focus: { x: 0, y: 0 } }, box)).toBe(true)
    expect(
      changed(
        { ...box, fit: "contain", backgroundColor: "#000000" },
        { ...box, fit: "contain" }
      )
    ).toBe(false)
    expect(
      changed(
        {
          ...box,
          fit: "contain",
          background: "custom",
          backgroundColor: "#0f0",
        },
        { ...box, fit: "contain", background: "custom" }
      )
    ).toBe(true)
    expect(
      resizerChanged(
        "fit",
        with_({ mode: "preset", fit: "inside" }),
        with_({ mode: "preset" })
      )
    ).toBe(true)
  })

  it("leaves out output details that are not written", () => {
    expect(
      resizerChanged("output", with_({ customQuality: 20 }), defaultSettings)
    ).toBe(false)
    expect(
      resizerChanged(
        "output",
        with_({ quality: "custom", customQuality: 20 }),
        with_({ quality: "custom" })
      )
    ).toBe(true)
    expect(resizerChanged("names", with_({ dpi: 72 }), defaultSettings)).toBe(
      false
    )
    expect(
      resizerChanged(
        "names",
        with_({ embedDpi: true, dpi: 72 }),
        with_({ embedDpi: true })
      )
    ).toBe(true)
    // With a print size the resolution belongs to the size, not to the files' details.
    expect(
      resizerChanged(
        "names",
        with_({ unit: "cm", embedDpi: true, dpi: 72 }),
        with_({ unit: "cm" })
      )
    ).toBe(false)
    expect(
      resizerChanged("sizes", with_({ widths: [320] }), defaultSettings)
    ).toBe(false)
    expect(
      resizerChanged(
        "sizes",
        with_({ multi: true, widths: [320] }),
        with_({ multi: true })
      )
    ).toBe(true)
  })

  it("knows a print size", () => {
    expect(printSized(with_({ unit: "in" }))).toBe(true)
    expect(printSized(with_({ unit: "in", mode: "longest" }))).toBe(false)
    expect(printSized(defaultSettings)).toBe(false)
  })
})

describe("resizer summaries", () => {
  it("says the size", () => {
    const say = (change: Partial<ResizerSettings>) =>
      resizerSummary("size", with_(change))
    expect(say({})).toBe("1200 px wide")
    expect(say(box)).toBe("100 × 100 px")
    expect(say({ width: "", height: "50" })).toBe("50 px high")
    expect(say({ width: "", height: " " })).toBe("No size yet")
    expect(say({ mode: "width", unit: "percent", width: "50" })).toBe(
      "50 % wide"
    )
    expect(say({ mode: "width", width: "" })).toBe("? px wide")
    expect(say({ mode: "height", height: "80" })).toBe("80 px high")
    expect(say({ mode: "height", height: "" })).toBe("? px high")
    expect(say({ mode: "longest" })).toBe("Longest side 1920 px")
    expect(say({ mode: "longest", side: "" })).toBe("Longest side ? px")
    expect(say({ mode: "shortest" })).toBe("Shortest side 1920 px")
    expect(say({ mode: "shortest", side: "" })).toBe("Shortest side ? px")
    expect(say({ mode: "percent" })).toBe("50% of each image")
    expect(say({ mode: "percent", percent: "" })).toBe("?% of each image")
    expect(say({ mode: "megapixels" })).toBe("2 megapixels")
    expect(say({ mode: "megapixels", megapixels: "" })).toBe("? megapixels")
    expect(say({ mode: "preset" })).toMatch(/^Instagram square, \d+ × \d+ px$/)
    expect(say({ mode: "preset", presetId: "gone" })).toBe("No preset chosen")
    expect(
      say({ unit: "in", width: "4", height: "6", dpi: 150, enlarge: false })
    ).toBe("4 × 6 in · 150 DPI · never enlarged")
  })

  it("says how the image fills its frame", () => {
    const say = (change: Partial<ResizerSettings>) =>
      resizerSummary("fit", with_(change))
    expect(say({})).toBe("Crop to fill · keeps centre")
    expect(say({ focus: { x: 0.2, y: 0.3 } })).toBe(
      "Crop to fill · keeps a chosen spot"
    )
    expect(say({ focusMode: "smart" })).toBe("Crop to fill · smart focus")
    expect(say({ fit: "contain", background: "blur" })).toBe(
      "Fit with padding · blurred padding"
    )
    expect(
      say({ fit: "contain", background: "custom", backgroundColor: "#00ff00" })
    ).toBe("Fit with padding · #00ff00 padding")
    expect(say({ fit: "outside" })).toBe("Cover at least")
  })

  it("says the turn, output, names, sizes and advanced options", () => {
    expect(resizerSummary("turn", defaultSettings)).toBe("As it is")
    expect(resizerSummary("turn", with_({ rotation: 270, flipX: true }))).toBe(
      "Turned 90° left · flipped horizontally"
    )
    expect(resizerSummary("output", defaultSettings)).toBe(
      "Same as original · balanced quality"
    )
    expect(
      resizerSummary(
        "output",
        with_({ format: "avif", quality: "custom", customQuality: 55 })
      )
    ).toBe("AVIF · quality 55")
    expect(resizerSummary("names", defaultSettings)).toBe(
      "{name}-{width}x{height}"
    )
    expect(
      resizerSummary("names", with_({ pattern: " ", embedDpi: true, dpi: 96 }))
    ).toBe("Original names · 96 DPI saved")
    expect(resizerSummary("names", with_({ unit: "mm", embedDpi: true }))).toBe(
      "{name}-{width}x{height}"
    )
    expect(resizerSummary("sizes", defaultSettings)).toBe("One size")
    expect(resizerSummary("sizes", with_({ multi: true }))).toBe(
      "3 widths: 640, 1280, 1920 px"
    )
    expect(
      resizerSummary(
        "sizes",
        with_({ multi: true, widths: [], customWidths: "480" })
      )
    ).toBe("1 width: 480 px")
    expect(resizerSummary("sizes", with_({ multi: true, widths: [] }))).toBe(
      "No widths chosen"
    )
    expect(resizerSummary("advanced", defaultSettings)).toBe(
      "Auto resampling · no sharpening · exact sizes"
    )
    expect(
      resizerSummary(
        "advanced",
        with_({ kernel: "nearest", sharpen: "strong", multiple: 8 })
      )
    ).toBe("Nearest (pixel art) · strong sharpening · multiples of 8")
  })
})
