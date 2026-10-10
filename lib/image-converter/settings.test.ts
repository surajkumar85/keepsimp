import { describe, expect, it } from "vitest"
import { rankComparisons } from "./compare"
import { toGreyscale } from "./greyscale"
import { pictureSnippet } from "./picture"
import {
  activeTargets,
  defaultSettings,
  densityFor,
  flattenedTargets,
  limitedSize,
  losslessAvailable,
  matte,
  pdfOptions,
  processingKey,
  qualityApplies,
  qualityFor,
  sameAsSource,
  settingsProblem,
  usesTarget,
  type ConverterSettings,
} from "./settings"
import {
  comparable,
  isCompressorTarget,
  sortTargets,
  targetOrder,
  targets,
} from "./targets"

const make = (change: Partial<ConverterSettings> = {}): ConverterSettings => ({
  ...defaultSettings,
  ...change,
})

describe("format catalogue", () => {
  it("describes every format once, with a unique extension", () => {
    expect(targetOrder).toHaveLength(Object.keys(targets).length)
    expect(
      new Set(targetOrder.map((target) => targets[target].extension)).size
    ).toBe(targetOrder.length)
    for (const target of targetOrder) {
      expect(targets[target].mime).toMatch(/^(image|application)\//)
      expect(targets[target].hint.length).toBeGreaterThan(10)
    }
    expect(comparable.every((target) => targets[target].web)).toBe(true)
  })

  it("knows which formats the compressor encodes and sorts selections", () => {
    expect(targetOrder.filter(isCompressorTarget)).toEqual([
      "jpeg",
      "png",
      "webp",
      "avif",
    ])
    expect(sortTargets(["pdf", "avif", "jpeg"])).toEqual([
      "jpeg",
      "avif",
      "pdf",
    ])
  })
})

describe("settings", () => {
  it("lists one format, or several in catalogue order", () => {
    expect(activeTargets(make())).toEqual(["webp"])
    expect(
      activeTargets(make({ multi: true, targets: ["webp", "jpeg", "avif"] }))
    ).toEqual(["jpeg", "webp", "avif"])
    expect(usesTarget(make({ target: "ico" }), "ico")).toBe(true)
    expect(usesTarget(make(), "ico")).toBe(false)
  })

  it("explains what must be fixed", () => {
    expect(settingsProblem(make())).toBeNull()
    expect(settingsProblem(make({ multi: true, targets: [] }))).toContain(
      "at least one format"
    )
    expect(settingsProblem(make({ target: "ico", icoSizes: [] }))).toContain(
      "icon size"
    )
    expect(settingsProblem(make({ target: "ico" }))).toBeNull()
    for (const customLimit of ["", "abc", "0", "10.5"])
      expect(settingsProblem(make({ limit: "custom", customLimit }))).toContain(
        "longest side"
      )
    expect(
      settingsProblem(make({ limit: "custom", customLimit: "800" }))
    ).toBeNull()
  })

  it("limits the long edge without enlarging", () => {
    const source = { width: 4000, height: 3000 }
    expect(limitedSize(make(), source)).toEqual(source)
    expect(limitedSize(make({ limit: "1920" }), source)).toEqual({
      width: 1920,
      height: 1440,
    })
    expect(
      limitedSize(make({ limit: "custom", customLimit: "100" }), source)
    ).toEqual({
      width: 100,
      height: 75,
    })
    expect(
      limitedSize(make({ limit: "4096" }), { width: 800, height: 600 })
    ).toEqual({
      width: 800,
      height: 600,
    })
  })

  it("maps quality choices per format", () => {
    expect(qualityFor(make(), "webp").preset).toBe("smart")
    expect(qualityFor(make({ quality: "small" }), "jpeg").preset).toBe(
      "smallest"
    )
    expect(qualityFor(make({ quality: "high" }), "avif").preset).toBe("high")
    expect(qualityFor(make({ quality: "lossless" }), "png").preset).toBe(
      "lossless"
    )
    expect(qualityFor(make({ quality: "lossless" }), "jpeg").preset).toBe(
      "high"
    )
    expect(
      qualityFor(make({ quality: "custom", customQuality: 33 }), "jxl")
    ).toEqual({
      preset: "custom",
      quality: 33,
    })
    expect(losslessAvailable(make({ target: "jpeg" }))).toBe(false)
    expect(
      losslessAvailable(make({ multi: true, targets: ["jpeg", "png"] }))
    ).toBe(true)
    expect(qualityApplies(make({ target: "bmp" }))).toBe(false)
    expect(qualityApplies(make({ target: "pdf" }))).toBe(true)
  })

  it("resolves backgrounds, flattened formats, PDF options and density", () => {
    expect(matte(make())).toEqual([255, 255, 255])
    expect(matte(make({ background: "black" }))).toEqual([0, 0, 0])
    expect(
      matte(make({ background: "custom", backgroundColor: "#0a141e" }))
    ).toEqual([10, 20, 30])
    expect(matte(make({ background: "custom", backgroundColor: "x" }))).toEqual(
      [255, 255, 255]
    )
    expect(
      flattenedTargets(make({ multi: true, targets: ["jpeg", "png", "pdf"] }))
    ).toEqual(["jpeg", "pdf"])
    expect(
      pdfOptions(make({ pdfPage: "a4", pdfDpi: 300, pdfMargin: "none" }))
    ).toEqual({
      page: "a4",
      dpi: 300,
      margin: "none",
    })
    expect(densityFor(make({ embedDpi: true, dpi: 150 }), "tiff")).toBe(150)
    expect(densityFor(make({ embedDpi: true }), "webp")).toBeNull()
    expect(densityFor(make(), "jpeg")).toBeNull()
  })

  it("keys results by what changes bytes for the selected formats only", () => {
    const key = processingKey(make())
    expect(processingKey(make({ pattern: "x" }))).toBe(key)
    expect(processingKey(make({ pdfCombine: true }))).toBe(key)
    expect(processingKey(make({ icoSizes: [256] }))).toBe(key)
    expect(processingKey(make({ gifColours: 16, dithering: false }))).toBe(key)
    expect(
      processingKey(make({ pdfPage: "a4", pdfDpi: 72, pdfMargin: "none" }))
    ).toBe(key)
    expect(processingKey(make({ targets: ["png"] }))).toBe(key)
    expect(processingKey(make({ quality: "high" }))).not.toBe(key)
    expect(processingKey(make({ target: "ico" }))).not.toBe(
      processingKey(make({ target: "ico", icoSizes: [256] }))
    )
    expect(processingKey(make({ target: "gif" }))).not.toBe(
      processingKey(make({ target: "gif", gifColours: 16 }))
    )
    expect(processingKey(make({ target: "pdf" }))).not.toBe(
      processingKey(make({ target: "pdf", pdfPage: "a4" }))
    )
    const multi = make({ multi: true })
    expect(processingKey({ ...multi, target: "png" })).toBe(
      processingKey(multi)
    )
    expect(processingKey({ ...multi, targets: ["png"] })).not.toBe(
      processingKey(multi)
    )
  })

  it("recognises converting to the source's own format", () => {
    expect(sameAsSource("png", "png")).toBe(true)
    expect(sameAsSource("png", "heic")).toBe(false)
    expect(sameAsSource("png", undefined)).toBe(false)
  })
})

describe("helpers", () => {
  it("turns colour into luma and keeps alpha", () => {
    const grey = toGreyscale({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 10, 20, 30, 77]),
    })
    expect([...grey.data.subarray(0, 4)]).toEqual([54, 54, 54, 255])
    expect(grey.data[4]).toBe(grey.data[5])
    expect(grey.data[7]).toBe(77)
  })

  it("ranks comparison results against the original", () => {
    const ranked = rankComparisons(
      [
        { target: "jpeg", bytes: 300, similarity: 0.97 },
        { target: "avif", bytes: 100, similarity: 0.96 },
        { target: "png", bytes: 900, similarity: null },
      ],
      600
    )
    expect(ranked.map((row) => row.target)).toEqual(["avif", "jpeg", "png"])
    expect(ranked[0]).toMatchObject({ smallest: true, ratio: 100 / 600 })
    expect(ranked[2]).toMatchObject({ smallest: false, ratio: 1.5 })
    expect(
      rankComparisons([{ target: "webp", bytes: 5, similarity: 1 }], 0)[0].ratio
    ).toBe(1)
    expect(rankComparisons([], 10)).toEqual([])
  })

  it("writes a picture element with efficient sources and a safe fallback", () => {
    const file = (
      target: "avif" | "jxl" | "webp" | "jpeg" | "png" | "tiff",
      name: string
    ) => ({
      target,
      name,
      width: 800,
      height: 600,
    })
    const html = pictureSnippet(
      [
        file("jpeg", "my photo.jpg"),
        file("webp", "my photo.webp"),
        file("jxl", "my photo.jxl"),
        file("avif", "my photo.avif"),
        file("tiff", "my photo.tiff"),
      ],
      'A "great" <view> & more'
    )
    const order = ["image/avif", "image/jxl", "image/webp"].map((type) =>
      html.indexOf(type)
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order.every((index) => index > 0)).toBe(true)
    expect(html).toContain('src="my%20photo.jpg"')
    expect(html).toContain('alt="A &quot;great&quot; &lt;view> &amp; more"')
    expect(html).not.toContain("tiff")
    // WebP is the fallback when it is the most compatible format present.
    const modern = pictureSnippet([
      file("avif", "a.avif"),
      file("webp", "a.webp"),
    ])
    expect(modern).toContain('src="a.webp"')
    expect(modern).toContain("image/avif")
    expect(modern).not.toContain('type="image/webp"')
    // Nothing sensible to write without a compatible fallback or without sources.
    expect(pictureSnippet([file("avif", "a.avif")])).toBe("")
    expect(pictureSnippet([file("jpeg", "a.jpg"), file("png", "a.png")])).toBe(
      ""
    )
    expect(pictureSnippet([])).toBe("")
  })
})
