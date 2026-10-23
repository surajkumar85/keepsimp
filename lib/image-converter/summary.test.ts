import { describe, expect, it } from "vitest"
import { defaultSettings, type ConverterSettings } from "./settings"
import { converterChanged, converterChanges, converterSummary } from "./summary"

const with_ = (change: Partial<ConverterSettings>): ConverterSettings => ({
  ...defaultSettings,
  ...change,
})

describe("converter groups", () => {
  it("counts only the changes that reach the files", () => {
    expect(converterChanges(defaultSettings, defaultSettings)).toBe(0)
    expect(
      converterChanges(
        with_({ target: "png", greyscale: true, pattern: "{name}-small" }),
        defaultSettings
      )
    ).toBe(3)
  })

  it("leaves out what no chosen format reads", () => {
    const changed = (
      group: Parameters<typeof converterChanged>[0],
      settings: Partial<ConverterSettings>,
      usual: Partial<ConverterSettings> = {}
    ) => converterChanged(group, with_(settings), with_(usual))
    // One format at a time: the list for several is kept aside, and the other way round.
    expect(changed("format", { targets: ["png"] })).toBe(false)
    expect(
      changed("format", { multi: true, target: "png" }, { multi: true })
    ).toBe(false)
    expect(
      changed("format", { multi: true, targets: ["png"] }, { multi: true })
    ).toBe(true)
    expect(changed("ico", { icoSizes: [256] })).toBe(false)
    expect(
      changed("ico", { target: "ico", icoSizes: [256] }, { target: "ico" })
    ).toBe(true)
    expect(changed("pdf", { pdfCombine: true })).toBe(false)
    expect(
      changed("pdf", { target: "pdf", pdfMargin: "none" }, { target: "pdf" })
    ).toBe(false)
    expect(
      changed("pdf", { target: "pdf", pdfDpi: 72 }, { target: "pdf" })
    ).toBe(true)
    expect(
      changed(
        "pdf",
        { target: "pdf", pdfPage: "a4", pdfDpi: 72, pdfMargin: "none" },
        { target: "pdf", pdfPage: "a4" }
      )
    ).toBe(true)
    expect(changed("gif", { dithering: false })).toBe(false)
    expect(
      changed("gif", { target: "gif", dithering: false }, { target: "gif" })
    ).toBe(true)
    // BMP has no quality to choose; Custom's number counts only when chosen.
    expect(
      changed("quality", { target: "bmp", quality: "high" }, { target: "bmp" })
    ).toBe(false)
    expect(changed("quality", { customQuality: 10 })).toBe(false)
    expect(
      changed(
        "quality",
        { quality: "custom", customQuality: 10 },
        { quality: "custom" }
      )
    ).toBe(true)
    expect(changed("options", { background: "black" })).toBe(false)
    expect(
      changed(
        "options",
        { target: "jpeg", background: "black" },
        {
          target: "jpeg",
        }
      )
    ).toBe(true)
    expect(
      changed(
        "options",
        { target: "jpeg", backgroundColor: "#000000" },
        { target: "jpeg" }
      )
    ).toBe(false)
    expect(
      changed(
        "options",
        { target: "jpeg", background: "custom", backgroundColor: "#000000" },
        { target: "jpeg", background: "custom" }
      )
    ).toBe(true)
    expect(changed("options", { customLimit: "99", dpi: 72 })).toBe(false)
    expect(
      changed(
        "options",
        { limit: "custom", customLimit: "99" },
        {
          limit: "custom",
        }
      )
    ).toBe(true)
    expect(
      changed("options", { embedDpi: true, dpi: 72 }, { embedDpi: true })
    ).toBe(true)
  })
})

describe("converter summaries", () => {
  it("says the formats", () => {
    expect(converterSummary("format", defaultSettings)).toBe("WebP")
    expect(converterSummary("format", with_({ multi: true }))).toBe(
      "JPEG, WebP and AVIF"
    )
    expect(
      converterSummary(
        "format",
        with_({ multi: true, targets: ["png", "ico"] })
      )
    ).toBe("PNG and ICO")
    expect(
      converterSummary("format", with_({ multi: true, targets: [] }))
    ).toBe("No format chosen")
  })

  it("says the options of icons, PDFs and GIFs", () => {
    expect(converterSummary("ico", defaultSettings)).toBe("16, 32 and 48 px")
    expect(converterSummary("ico", with_({ icoSizes: [256] }))).toBe("256 px")
    expect(converterSummary("ico", with_({ icoSizes: [] }))).toBe(
      "No sizes chosen"
    )
    expect(converterSummary("pdf", defaultSettings)).toBe(
      "Page the size of the image at 150 DPI · a PDF for each image"
    )
    expect(
      converterSummary(
        "pdf",
        with_({ pdfPage: "letter", pdfMargin: "none", pdfCombine: true })
      )
    ).toBe("US Letter, no margins · one PDF for all")
    expect(converterSummary("pdf", with_({ pdfPage: "a4" }))).toBe(
      "A4, small margins · a PDF for each image"
    )
    expect(converterSummary("gif", defaultSettings)).toBe(
      "256 colours · dithered"
    )
    expect(
      converterSummary("gif", with_({ gifColours: 16, dithering: false }))
    ).toBe("16 colours · no dithering")
  })

  it("says the quality, options and names", () => {
    expect(converterSummary("quality", defaultSettings)).toBe("Balanced")
    expect(
      converterSummary(
        "quality",
        with_({ quality: "custom", customQuality: 33 })
      )
    ).toBe("Quality 33")
    expect(converterSummary("options", defaultSettings)).toBe("Original size")
    expect(
      converterSummary(
        "options",
        with_({
          target: "jpeg",
          limit: "1920",
          greyscale: true,
          embedDpi: true,
          dpi: 96,
        })
      )
    ).toBe(
      "Longest side 1920 px at most · greyscale · 96 DPI saved · white background"
    )
    expect(
      converterSummary(
        "options",
        with_({
          target: "jpeg",
          limit: "custom",
          customLimit: "800",
          background: "custom",
          backgroundColor: "#112233",
        })
      )
    ).toBe("Longest side 800 px at most · #112233 background")
    expect(
      converterSummary("options", with_({ limit: "custom", customLimit: "" }))
    ).toBe("Longest side ? px at most")
    expect(converterSummary("names", defaultSettings)).toBe("{name}")
    expect(converterSummary("names", with_({ pattern: "  " }))).toBe(
      "Original names"
    )
  })
})
