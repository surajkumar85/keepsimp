import { describe, expect, it } from "vitest"
import {
  filterTools,
  isActivePath,
  parseCategory,
  tools,
  type Tool,
} from "./catalogue"

describe("catalogue search", () => {
  it("returns the full catalogue for whitespace without changing its order", () => {
    expect(filterTools(" \t\n", "all")).toEqual(tools)
  })
  it("combines all query terms with the selected category", () => {
    expect(
      filterTools(" VIDEO   CONVERT ", "video").map((tool) => tool.id)
    ).toEqual(["video-converter"])
    expect(filterTools("mp3", "video")).toEqual([])
  })
  it("matches aliases and descriptions", () => {
    expect(filterTools("webp", "all")[0].id).toBe("image-converter")
    expect(filterTools("paper", "all")).toEqual([])
    expect(filterTools("soundtrack", "audio")[0].id).toBe("audio-extractor")
  })
  it("normalizes accents and Unicode compatibility characters", () => {
    const sample: Tool[] = [
      { ...tools[0], name: "Café format", keywords: ["ＦＬＡＣ"] },
    ]
    expect(filterTools("cafe flac", "all", sample)).toEqual(sample)
  })
  it("treats regex syntax as literal input and never mutates data", () => {
    const snapshot = JSON.stringify(tools)
    expect(filterTools(".*[", "all")).toEqual([])
    filterTools("pdf", "all")
    expect(JSON.stringify(tools)).toBe(snapshot)
  })
})

describe("URL category validation", () => {
  it.each([null, undefined, "", "unknown", "VIDEO", "<script>"])(
    "falls back for %s",
    (value) => expect(parseCategory(value)).toBe("all")
  )
  it.each(["all", "video", "audio", "image", "document", "developer"])(
    "accepts %s",
    (value) => expect(parseCategory(value)).toBe(value)
  )
})

describe("active navigation", () => {
  it.each([
    ["/", "/", true],
    ["///", "/", true],
    ["/design-system/", "/", false],
    ["/design-system/", "/design-system", true],
    ["/design-system/buttons/", "/design-system", true],
    ["/design-systematic", "/design-system", false],
    ["/other", "/design-system", false],
  ])("compares %s with %s", (path, target, active) =>
    expect(isActivePath(path, target)).toBe(active)
  )
})
