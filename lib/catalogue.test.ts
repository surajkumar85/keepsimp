import { describe, expect, it } from "vitest"
import {
  filterTools,
  isActivePath,
  parseCategory,
  tools,
  type Tool,
  listed,
} from "./catalogue"

describe("doors", () => {
  it("lists every tool once, without the pages that open another tool for one job", () => {
    const doors = tools.filter((tool) => tool.partOf)
    expect(doors.map((tool) => tool.id)).toEqual([
      "video-converter",
      "video-compressor",
      "video-trimmer",
      "crop-video",
      "change-video-speed",
      "mute-video",
      "add-music-to-video",
      "add-text-to-video",
      "video-to-gif",
      "merge-videos",
      "add-subtitles-to-video",
      "audio-converter",
      "audio-extractor",
      "audio-trimmer",
      "ringtone-maker",
      "normalize-audio",
      "volume-booster",
      "change-audio-speed",
      "remove-background-noise",
      "audio-to-video",
      "transcribe-audio",
      "voice-recorder",
      "edit-audio-tags",
      "join-audio",
      "split-audio",
      "pdf-annotator",
      "sign-pdf",
      "fill-pdf-form",
      "crop-pdf",
      "add-page-numbers",
      "watermark-pdf",
      "redact-pdf",
      "create-pdf-form",
      "verify-pdf-signature",
      "ocr-pdf",
      "markdown-to-html",
      "markdown-to-pdf",
      "markdown-to-word",
      "html-to-markdown",
      "word-to-markdown",
      "markdown-table-generator",
    ])
    expect(listed).toHaveLength(tools.length - doors.length)
    expect(listed.some((tool) => tool.partOf)).toBe(false)
    // A door opens a tool that is there, is ready, and is of the same kind.
    for (const door of doors) {
      const opens = listed.find((tool) => tool.id === door.partOf)
      expect(opens, door.id).toBeDefined()
      expect(opens!.status).toBe("available")
      expect(opens!.category).toBe(door.category)
    }
  })

  it("still finds a door by searching", () => {
    expect(filterTools("highlight", "all").map((tool) => tool.id)).toContain(
      "pdf-annotator"
    )
    expect(filterTools("signature", "all").map((tool) => tool.id)).toEqual([
      "sign-pdf",
      "create-pdf-form",
      "verify-pdf-signature",
    ])
    expect(filterTools("fillable", "all").map((tool) => tool.id)).toEqual([
      "fill-pdf-form",
      "create-pdf-form",
    ])
    expect(filterTools("margins", "all").map((tool) => tool.id)).toEqual([
      "crop-pdf",
    ])
    expect(filterTools("bates", "all").map((tool) => tool.id)).toEqual([
      "add-page-numbers",
    ])
    expect(filterTools("confidential", "all").map((tool) => tool.id)).toEqual([
      "watermark-pdf",
    ])
    expect(filterTools("blackout", "all").map((tool) => tool.id)).toEqual([
      "redact-pdf",
    ])
    expect(filterTools("scanned", "all").map((tool) => tool.id)).toEqual([
      "ocr-pdf",
    ])
    expect(filterTools("tampered", "all").map((tool) => tool.id)).toEqual([
      "verify-pdf-signature",
    ])
  })
})

describe("catalogue search", () => {
  it("returns the full catalogue for whitespace without changing its order", () => {
    expect(filterTools(" \t\n", "all")).toEqual(tools)
  })
  it("combines all query terms with the selected category", () => {
    expect(
      filterTools(" VIDEO   CONVERT ", "video").map((tool) => tool.id)
    ).toEqual(["video-editor", "video-converter"])
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
