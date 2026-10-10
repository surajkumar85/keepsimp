import { describe, expect, it } from "vitest"
import {
  DEFAULT_PATTERN,
  fileName,
  safeSegment,
  uniqueNames,
  unknownTokens,
} from "./naming"
import {
  findPreset,
  presetGroups,
  presets,
  presetsIn,
  presetSources,
} from "./presets"
import { imgSnippet, parseWidths, widthSet } from "./srcset"

const values = {
  name: "Summer Trip (1).HEIC",
  width: 1080,
  height: 1350,
  format: "jpg",
  index: 3,
  preset: "instagram-portrait",
}

describe("file names", () => {
  it("fills every placeholder", () => {
    expect(fileName(DEFAULT_PATTERN, values)).toBe(
      "Summer-Trip-1-1080x1350.jpg"
    )
    expect(fileName("{index}_{preset}_{width}w.{format}", values)).toBe(
      "03_instagram-portrait_1080w.jpg.jpg"
    )
    expect(fileName("{height}px", values)).toBe("1350px.jpg")
  })

  it("falls back for empty or unsafe patterns and keeps unknown text", () => {
    expect(fileName("   ", values)).toBe("Summer-Trip-1-1080x1350.jpg")
    expect(fileName("../../{name}", values)).toBe("Summer-Trip-1.jpg")
    expect(fileName("///", values)).toBe("image.jpg")
    expect(fileName("{date}-{name}", values)).toBe("date-Summer-Trip-1.jpg")
    expect(fileName("x".repeat(300), values)).toHaveLength(124)
    expect(unknownTokens("{name}-{date}-{w}")).toEqual(["date", "w"])
    expect(unknownTokens(DEFAULT_PATTERN)).toEqual([])
    expect(safeSegment("--a  b//c..")).toBe("a-b-c")
  })

  it("keeps batch names unique without clashing with existing ones", () => {
    expect(
      uniqueNames(["a.jpg", "A.jpg", "a.jpg", "a-2.jpg", "b.png"])
    ).toEqual(["a.jpg", "A-2.jpg", "a-3.jpg", "a-2-2.jpg", "b.png"])
  })
})

describe("presets", () => {
  it("has unique ids, valid sizes and a group for each preset", () => {
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(
      presets.length
    )
    for (const preset of presets) {
      expect(preset.width).toBeGreaterThan(0)
      expect(preset.height).toBeGreaterThan(0)
      expect(presetGroups.some((group) => group.id === preset.group)).toBe(true)
    }
    for (const group of presetGroups)
      expect(presetsIn(group.id).length).toBeGreaterThan(0)
    expect(
      presetSources.every((source) => source.url.startsWith("https://"))
    ).toBe(true)
  })

  it("defines print presets at 300 DPI and story safe areas", () => {
    expect(findPreset("print-4x6")).toMatchObject({
      width: 1200,
      height: 1800,
      dpi: 300,
    })
    expect(findPreset("instagram-story")?.safeArea).toEqual({
      top: 0.14,
      bottom: 0.2,
    })
    expect(findPreset("nope")).toBeNull()
    expect(findPreset(null)).toBeNull()
  })
})

describe("responsive sets", () => {
  it("parses and merges widths", () => {
    expect(parseWidths("800, 400;  1200 abc -5 2.5 800")).toEqual([
      400, 800, 1200,
    ])
    expect(widthSet([1280, 640], "640, 480")).toEqual([480, 640, 1280])
    expect(
      widthSet(
        Array.from({ length: 20 }, (_, i) => i + 1),
        ""
      )
    ).toHaveLength(12)
  })

  it("writes an img tag with srcset, sizes and a middle fallback", () => {
    const html = imgSnippet(
      [
        { name: "a b-1280.webp", width: 1280, height: 720 },
        { name: "a b-640.webp", width: 640, height: 360 },
        { name: "a b-1920.webp", width: 1920, height: 1080 },
      ],
      'A "quoted" <alt> & more'
    )
    expect(html).toContain('src="a%20b-1280.webp"')
    expect(html).toContain("a%20b-640.webp 640w")
    expect(html.indexOf("640w")).toBeLessThan(html.indexOf("1920w"))
    expect(html).toContain('width="1280"')
    expect(html).toContain('alt="A &quot;quoted&quot; &lt;alt> &amp; more"')
    expect(html).toContain('sizes="100vw"')
    expect(imgSnippet([])).toBe("")
  })
})
