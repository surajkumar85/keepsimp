import { describe, expect, it } from "vitest"
import { resetAll, resetOf } from "@/lib/settings-groups"
import { applyDestination, destinations } from "./presets"
import { defaultSettings, noTrim, type AnimationSettings } from "./settings"
import {
  ANIMATION_GROUPS,
  animationSummary,
  changedCount,
  comparedSoFar,
  comparisonSummary,
  destinationSummary,
  limitLabel,
  problemGroup,
  trimSummary,
  usesPalette,
  type AnimationGroup,
} from "./summary"

const with_ = (change: Partial<AnimationSettings>): AnimationSettings => ({
  ...defaultSettings,
  ...change,
})
const say = (group: AnimationGroup, change: Partial<AnimationSettings> = {}) =>
  animationSummary(group, with_(change))

describe("groups", () => {
  it("hold every setting a person chooses, once", () => {
    const held = Object.values(ANIMATION_GROUPS).flat()
    expect(new Set(held).size).toBe(held.length)
    expect(
      Object.keys(defaultSettings).filter(
        (key) => !held.includes(key as keyof AnimationSettings)
      )
    ).toEqual(["shrink"])
  })

  it("count what differs, and a logo as a change to its group", () => {
    expect(changedCount(defaultSettings, false)).toBe(0)
    expect(changedCount(defaultSettings, true)).toBe(1)
    expect(changedCount(with_({ speed: 2, overlaySize: 40 }), true)).toBe(2)
    expect(changedCount(with_({ speed: 2, overlaySize: 40 }), false)).toBe(2)
  })

  it("put back what a destination set", () => {
    const sticker = applyDestination(defaultSettings, destinations[1])
    expect(changedCount(sticker, false)).toBe(3)
    expect({
      ...sticker,
      ...resetAll(defaultSettings, ANIMATION_GROUPS),
    }).toEqual(defaultSettings)
    expect(resetOf(defaultSettings, ANIMATION_GROUPS.turn)).toEqual({
      rotation: 0,
      flipX: false,
      flipY: false,
    })
  })
})

describe("animationSummary", () => {
  it("says each group as it is by default", () => {
    expect(
      (Object.keys(ANIMATION_GROUPS) as AnimationGroup[]).map((group) =>
        animationSummary(group, defaultSettings)
      )
    ).toEqual([
      "No limit",
      "WebP",
      "Balanced",
      "Normal speed · original frame rate",
      "No limit",
      "Forwards · loops forever",
      "Original size",
      "As it is",
      "Transparency kept",
      "{name}.webp",
      "No text",
      "As it is",
      "No fades",
      "No logo",
    ])
  })

  it("says a file size limit in KB or MB", () => {
    expect(say("limit", { sizeLimit: 256_000 })).toBe("Under 256 KB")
    expect(say("limit", { sizeLimit: 2_500_000 })).toBe("Under 2.5 MB")
    expect(limitLabel(300_500)).toBe("300.5 KB")
  })

  it("says the format, its encoder and the format of frames", () => {
    expect(say("format", { target: "gif" })).toBe("GIF · fast encoder")
    expect(say("format", { target: "gif", gifEngine: "best" })).toBe(
      "GIF · gifski"
    )
    expect(say("format", { target: "frames", frameFormat: "jpeg" })).toBe(
      "Frames · JPEG images"
    )
    expect(say("format", { target: "sprite" })).toBe("Sprite sheet · PNG sheet")
  })

  it("says the quality, a custom figure and dithering left off", () => {
    expect(say("quality", { quality: "high" })).toBe("High")
    expect(say("quality", { quality: "custom", customQuality: 40 })).toBe(
      "Quality 40"
    )
    expect(
      say("quality", { quality: "custom", target: "gif", colours: 32 })
    ).toBe("32 colours")
    expect(say("quality", { target: "gif", dithering: false })).toBe(
      "Balanced · no dithering"
    )
    // Small files never dither, and WebP has no palette.
    expect(
      say("quality", { target: "gif", quality: "small", dithering: false })
    ).toBe("Small file")
    expect(say("quality", { dithering: false })).toBe("Balanced")
  })

  it("knows which results are reduced to a palette", () => {
    expect(usesPalette(with_({ target: "gif" }))).toBe(true)
    expect(usesPalette(with_({ target: "gif", gifEngine: "best" }))).toBe(false)
    expect(usesPalette(with_({ target: "gif", quality: "lossless" }))).toBe(
      false
    )
    expect(usesPalette(with_({ target: "apng" }))).toBe(true)
    expect(usesPalette(with_({ target: "apng", quality: "high" }))).toBe(false)
    expect(usesPalette(defaultSettings)).toBe(false)
  })

  it("says speed, frame rate and length", () => {
    expect(say("timing", { speed: 2, fps: 10 })).toBe(
      "2× speed · 10 fps at most"
    )
    expect(say("length", { maxSeconds: 3 })).toBe("3 s at most")
  })

  it("says the direction, and loops only where a file has them", () => {
    expect(say("direction", { reverse: true, loop: "once" })).toBe(
      "Reversed · plays once"
    )
    expect(say("direction", { boomerang: true, loop: "count" })).toBe(
      "Boomerang · plays 3 times"
    )
    expect(
      say("direction", { boomerang: true, reverse: true, target: "sprite" })
    ).toBe("Boomerang, reversed · loops forever")
    expect(say("direction", { target: "mp4" })).toBe("Forwards")
  })

  it("says every kind of size", () => {
    expect(say("size", { resize: "width", resizeValue: 320 })).toBe(
      "320 px wide"
    )
    expect(say("size", { resize: "height", resizeValue: 200 })).toBe(
      "200 px high"
    )
    expect(
      say("size", { resize: "longEdge", resizeValue: 128, enlarge: false })
    ).toBe("128 px on the longest side · never enlarged")
    expect(say("size", { resize: "percent", resizeValue: 50 })).toBe(
      "50% of the size"
    )
    expect(
      say("size", { resize: "exact", resizeValue: 512, resizeHeight: 320 })
    ).toBe("Exactly 512 × 320 px")
  })

  it("says turns and flips", () => {
    expect(say("turn", { rotation: 90 })).toBe("Turned right")
    expect(say("turn", { rotation: 180, flipY: true })).toBe(
      "Turned upside down · flipped vertically"
    )
    expect(say("turn", { rotation: 270 })).toBe("Turned left")
    expect(say("turn", { flipX: true })).toBe("Flipped horizontally")
  })

  it("says what fills see-through areas", () => {
    expect(say("background", { target: "mp4" })).toBe("Filled with white")
    expect(say("background", { background: "black" })).toBe("Filled with black")
    expect(
      say("background", { background: "custom", backgroundColor: "#00786f" })
    ).toBe("Filled with #00786f")
  })

  it("says the name pattern with the format's extension", () => {
    expect(say("names", { pattern: "{index}-{name}", target: "apng" })).toBe(
      "{index}-{name}.png"
    )
  })

  it("says the text, colour changes and fades", () => {
    expect(say("text", { captionTop: " Hello ", captionBottom: "" })).toBe(
      "“Hello” at the top"
    )
    expect(say("text", { captionBottom: "the end" })).toBe(
      "“the end” at the bottom"
    )
    expect(
      say("colour", {
        filter: "sepia",
        brightness: 20,
        contrast: -10,
        saturation: 5,
      })
    ).toBe("Sepia · brightness +20 · contrast -10 · saturation +5")
    expect(say("colour", { brightness: -30 })).toBe("Brightness -30")
    expect(say("fade", { fadeIn: 1 })).toBe("Fades in 1 s")
    expect(say("fade", { fadeIn: 0.5, fadeOut: 2 })).toBe(
      "Fades in 0.5 s · fades out 2 s"
    )
    expect(say("fade", { fadeOut: 2 })).toBe("Fades out 2 s")
  })

  it("says the logo only once there is one", () => {
    expect(animationSummary("logo", defaultSettings, "mark.png")).toBe(
      "mark.png · bottom right · 20% wide · 80% opacity"
    )
    expect(
      animationSummary(
        "logo",
        with_({ overlayCorner: "centre", overlaySize: 50 }),
        "mark.png"
      )
    ).toBe("mark.png · centre · 50% wide · 80% opacity")
  })

  it("names the destination in force", () => {
    expect(destinationSummary(defaultSettings)).toBe("Anywhere")
    expect(
      destinationSummary(applyDestination(defaultSettings, destinations[0]))
    ).toBe("Discord emoji")
  })
})

describe("problemGroup", () => {
  it("finds no group when the settings are fine", () => {
    expect(problemGroup(defaultSettings)).toBeNull()
  })

  it("finds the group of each problem", () => {
    const cases: [Partial<AnimationSettings>, AnimationGroup][] = [
      [{ loop: "count", loopCount: 1 }, "direction"],
      [{ fps: 0 }, "timing"],
      [{ speed: Number.NaN }, "timing"],
      [{ resize: "width", resizeValue: 0 }, "size"],
      [{ maxSeconds: 0 }, "length"],
      [{ sizeLimit: 5 }, "limit"],
      // A colour count belongs to the quality, whatever format asks for it.
      [{ target: "gif", quality: "custom", colours: 1 }, "quality"],
      [{ background: "custom", backgroundColor: "red" }, "background"],
      [{ brightness: 200 }, "colour"],
      [{ fadeIn: 20 }, "fade"],
      [{ captionTop: "Hi", captionFrom: 2, captionUntil: 1 }, "text"],
      [{ overlayOpacity: 5 }, "logo"],
      [{ pattern: "{nope}" }, "names"],
    ]
    for (const [change, group] of cases)
      expect(problemGroup(with_(change)), JSON.stringify(change)).toBe(group)
  })

  it("finds the first problem when there are several", () => {
    expect(problemGroup(with_({ fps: 0, pattern: "{nope}" }))).toBe("timing")
  })
})

describe("trimSummary", () => {
  it("says what is kept", () => {
    expect(trimSummary(noTrim, 1000)).toBe("The whole animation")
    expect(trimSummary({ start: 0, end: 5000 }, 1000)).toBe(
      "The whole animation"
    )
    expect(trimSummary({ start: 200, end: 800 }, 1000)).toBe(
      "0.20 s to 0.80 s · 0.60 s kept"
    )
    expect(trimSummary({ start: 400, end: null }, 1000)).toBe(
      "0.40 s to 1.00 s · 0.60 s kept"
    )
  })
})

describe("comparisons", () => {
  const order = ["gif", "webp", "apng"] as const

  it("count the formats done from the worker's lines", () => {
    expect(comparedSoFar("Trying GIF…", order, 0)).toBe(0)
    expect(comparedSoFar("Trying APNG…", order, 1)).toBe(2)
    // Other lines, such as a codec loading, leave the count as it was.
    expect(comparedSoFar("Loading the WebP encoder…", order, 1)).toBe(1)
  })

  it("say where a comparison stands", () => {
    expect(comparisonSummary({ status: "idle" })).toBe("Not compared yet")
    expect(
      comparisonSummary({
        status: "running",
        label: "Trying WebP…",
        done: 1,
        total: 3,
      })
    ).toBe("Comparing: 1 of 3 done")
    expect(comparisonSummary({ status: "error", message: "No" })).toBe(
      "The comparison did not finish"
    )
    expect(
      comparisonSummary({
        status: "done",
        rows: [{ target: "webp", bytes: 2048, ratio: 0.5, smallest: true }],
      })
    ).toBe("WebP is smallest · 2.0 KB")
    expect(comparisonSummary({ status: "done", rows: [] })).toBe(
      "No format could be written"
    )
  })
})
