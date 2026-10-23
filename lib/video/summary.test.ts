import { describe, expect, it } from "vitest"
import {
  changedGroups,
  differs,
  line,
  resetAll,
  resetOf,
} from "@/lib/settings-groups"
import { defaultSettings, MB, type VideoSettings } from "./settings"
import { VIDEO_GROUPS, videoSummary } from "./summary"

const with_ = (change: Partial<VideoSettings>) => ({
  ...defaultSettings,
  ...change,
})

describe("settings groups", () => {
  it("finds the groups that differ, objects compared by value", () => {
    expect(
      changedGroups(defaultSettings, defaultSettings, VIDEO_GROUPS)
    ).toEqual([])
    const changed = with_({ speed: 2, limit: { bytes: 8 * MB } })
    expect(changedGroups(changed, defaultSettings, VIDEO_GROUPS)).toEqual([
      "limit",
      "timing",
    ])
    expect(
      differs(
        with_({ limit: { share: 0.5 } }),
        with_({ limit: { share: 0.5 } }),
        ["limit"]
      )
    ).toBe(false)
  })

  it("puts a group, or all of them, back", () => {
    expect(resetOf(defaultSettings, VIDEO_GROUPS.timing)).toEqual({
      speed: 1,
      fadeIn: 0,
      fadeOut: 0,
    })
    const changed = with_({ speed: 2, format: "webm", captionTop: "Hi" })
    expect({ ...changed, ...resetAll(defaultSettings, VIDEO_GROUPS) }).toEqual(
      defaultSettings
    )
  })

  it("joins the parts of a line, leaving out empty ones", () => {
    expect(line("a", false, null, "", undefined, "b")).toBe("a · b")
  })
})

describe("videoSummary", () => {
  it("says each group as it is by default", () => {
    expect(
      Object.keys(VIDEO_GROUPS).map((group) =>
        videoSummary(group as keyof typeof VIDEO_GROUPS, defaultSettings)
      )
    ).toEqual([
      "MP4 · codec chosen for you",
      "Original quality · same size · same frame rate",
      "No limit",
      "As it is",
      "Normal speed · no fades",
      "Sound kept",
      "No text or logo",
    ])
  })

  it("says what was changed", () => {
    expect(
      videoSummary("format", with_({ format: "same", codec: "hevc" }))
    ).toBe("Same as the file · HEVC")
    expect(
      videoSummary(
        "quality",
        with_({ quality: "custom", bitrate: 2500, size: 720, frameRate: 30 })
      )
    ).toBe("2500 kbit/s · 720p at most · 30 fps at most")
    expect(
      videoSummary("quality", with_({ quality: "small", size: 2160 }))
    ).toBe("Small · 4K at most · same frame rate")
    expect(videoSummary("limit", with_({ limit: { bytes: 8 * MB } }))).toBe(
      "Under 8 MB"
    )
    expect(videoSummary("limit", with_({ limit: { bytes: 1.5 * MB } }))).toBe(
      "Under 1.5 MB"
    )
    expect(videoSummary("limit", with_({ limit: { share: 0.5 } }))).toBe(
      "Half of each file's size"
    )
    expect(videoSummary("limit", with_({ limit: { share: 0.25 } }))).toBe(
      "A quarter of each file's size"
    )
    expect(videoSummary("limit", with_({ limit: { share: 0.4 } }))).toBe(
      "40% of each file's size"
    )
    expect(
      videoSummary("shape", with_({ rotate: 90, flip: true, shape: "9:16" }))
    ).toBe("Turned 90° right · mirrored · cut to 9:16")
    expect(videoSummary("timing", with_({ speed: 2, fadeIn: 1 }))).toBe(
      "2× speed · fades in 1 s"
    )
    expect(videoSummary("timing", with_({ fadeIn: 1, fadeOut: 2 }))).toBe(
      "Normal speed · fades in 1 s · out 2 s"
    )
    expect(
      videoSummary(
        "sound",
        with_({ sound: "convert", loudness: -14, keepTags: false })
      )
    ).toBe("Sound converted · −14 LUFS · details left out")
    expect(videoSummary("sound", with_({ sound: "none", loudness: -14 }))).toBe(
      "No sound"
    )
    expect(
      videoSummary(
        "overlay",
        with_({ captionTop: " Hello ", captionBottom: "Bye" }),
        true
      )
    ).toBe("“Hello” at the top · “Bye” at the bottom · a logo")
  })
})
