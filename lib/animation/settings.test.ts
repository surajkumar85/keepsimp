import { describe, expect, it } from "vitest"
import {
  BEST_BUDGET,
  bestFits,
  budgetProblem,
  captionColour,
  customIsNumeric,
  defaultSettings,
  frameFormats,
  keepsTransparency,
  layoutFor,
  MAX_SIZE_LIMIT,
  MIN_SIZE_LIMIT,
  encodePlan,
  fadeColour,
  FRAME_BUDGET,
  hasCaption,
  losslessApplies,
  matte,
  MAX_EDGE,
  noTrim,
  outputSize,
  playsFor,
  processingKey,
  settingsProblem,
  targetOrder,
  targets,
  type AnimationSettings,
} from "./settings"

const make = (change: Partial<AnimationSettings> = {}): AnimationSettings => ({
  ...defaultSettings,
  ...change,
})

describe("targets", () => {
  it("lists each format once, with what the page needs", () => {
    expect(targetOrder).toEqual([
      "gif",
      "webp",
      "apng",
      "mp4",
      "webm",
      "frames",
      "sprite",
    ])
    expect(targetOrder.map((target) => targets[target].kind)).toEqual([
      "animation",
      "animation",
      "animation",
      "video",
      "video",
      "bundle",
      "bundle",
    ])
    expect(Object.keys(frameFormats)).toEqual(["png", "webp", "jpeg"])
    expect(Object.keys(targets).sort()).toEqual([...targetOrder].sort())
    expect(targets.apng).toMatchObject({ extension: "png", mime: "image/png" })
    for (const target of targetOrder)
      expect(targets[target].hint).toMatch(/\.$/)
  })

  it("knows which formats can be lossless", () => {
    expect(losslessApplies(make({ target: "gif" }))).toBe(false)
    expect(losslessApplies(make({ target: "webp" }))).toBe(true)
    expect(losslessApplies(make({ target: "apng" }))).toBe(true)
    expect(losslessApplies(make({ target: "mp4" }))).toBe(false)
    // A ZIP of frames is as exact as the images in it.
    expect(
      losslessApplies(make({ target: "frames", frameFormat: "png" }))
    ).toBe(true)
    expect(
      losslessApplies(make({ target: "sprite", frameFormat: "jpeg" }))
    ).toBe(false)
  })

  it("knows which results can be see-through", () => {
    expect(keepsTransparency(make({ target: "gif" }))).toBe(true)
    expect(keepsTransparency(make({ target: "webm" }))).toBe(false)
    expect(
      keepsTransparency(make({ target: "frames", frameFormat: "webp" }))
    ).toBe(true)
    expect(
      keepsTransparency(make({ target: "sprite", frameFormat: "jpeg" }))
    ).toBe(false)
  })

  it("knows whether Custom sets a quality or a number of colours", () => {
    expect(customIsNumeric(make({ target: "webp" }))).toBe(true)
    expect(customIsNumeric(make({ target: "mp4" }))).toBe(true)
    expect(customIsNumeric(make({ target: "frames" }))).toBe(true)
    expect(customIsNumeric(make({ target: "apng", gifEngine: "best" }))).toBe(
      false
    )
    expect(customIsNumeric(make({ target: "gif" }))).toBe(false)
    expect(customIsNumeric(make({ target: "gif", gifEngine: "best" }))).toBe(
      true
    )
  })
})

describe("playsFor", () => {
  it("turns the loop choice into a number of plays", () => {
    expect(playsFor(make({ loop: "forever", loopCount: 9 }))).toBe(0)
    expect(playsFor(make({ loop: "once", loopCount: 9 }))).toBe(1)
    expect(playsFor(make({ loop: "count", loopCount: 9 }))).toBe(9)
  })
})

describe("matte", () => {
  it("fills formats without transparency with white unless a colour is chosen", () => {
    expect(matte(make({ target: "mp4" }))).toEqual([255, 255, 255])
    expect(matte(make({ target: "frames", frameFormat: "jpeg" }))).toEqual([
      255, 255, 255,
    ])
    expect(matte(make({ target: "frames", frameFormat: "png" }))).toBeNull()
    expect(matte(make({ target: "webm", background: "black" }))).toEqual([
      0, 0, 0,
    ])
  })

  it("keeps transparency unless a colour is chosen", () => {
    expect(matte(make())).toBeNull()
    expect(matte(make({ background: "white" }))).toEqual([255, 255, 255])
    expect(matte(make({ background: "black" }))).toEqual([0, 0, 0])
    expect(
      matte(make({ background: "custom", backgroundColor: "#00786f" }))
    ).toEqual([0, 120, 111])
    // A colour that cannot be read falls back to white.
    expect(
      matte(make({ background: "custom", backgroundColor: "teal" }))
    ).toEqual([255, 255, 255])
  })
})

describe("outputSize", () => {
  const source = { width: 400, height: 200 }

  it("keeps the size by default, turned when rotated", () => {
    expect(outputSize(source, make())).toEqual(source)
    expect(outputSize(source, make({ rotation: 90 }))).toEqual({
      width: 200,
      height: 400,
    })
  })

  it("scales by width, height, longest side or percent, keeping proportions", () => {
    expect(
      outputSize(source, make({ resize: "width", resizeValue: 100 }))
    ).toEqual({
      width: 100,
      height: 50,
    })
    expect(
      outputSize(source, make({ resize: "height", resizeValue: 50 }))
    ).toEqual({
      width: 100,
      height: 50,
    })
    expect(
      outputSize(source, make({ resize: "longEdge", resizeValue: 800 }))
    ).toEqual({
      width: 800,
      height: 400,
    })
    expect(
      outputSize(source, make({ resize: "percent", resizeValue: 25 }))
    ).toEqual({
      width: 100,
      height: 50,
    })
    // Sizes follow the turned picture.
    expect(
      outputSize(
        source,
        make({ resize: "width", resizeValue: 100, rotation: 270 })
      )
    ).toEqual({ width: 100, height: 200 })
  })

  it("gives video even sides", () => {
    expect(
      outputSize({ width: 225, height: 151 }, make({ target: "mp4" }))
    ).toEqual({
      width: 224,
      height: 150,
    })
    expect(
      outputSize({ width: 224, height: 150 }, make({ target: "webm" }))
    ).toEqual({
      width: 224,
      height: 150,
    })
    expect(
      outputSize(
        { width: 400, height: 200 },
        make({ target: "mp4", resize: "width", resizeValue: 1 })
      )
    ).toEqual({ width: 2, height: 2 })
    // Animated images keep odd sides.
    expect(
      outputSize({ width: 225, height: 151 }, make({ target: "gif" }))
    ).toEqual({
      width: 225,
      height: 151,
    })
  })

  it("never goes below one pixel or above the largest side", () => {
    expect(
      outputSize(source, make({ resize: "width", resizeValue: 1 }))
    ).toEqual({
      width: 1,
      height: 1,
    })
    expect(
      outputSize(source, make({ resize: "percent", resizeValue: 400 }))
    ).toEqual({
      width: 1600,
      height: 800,
    })
    expect(outputSize({ width: 4000, height: 1000 }, make())).toEqual({
      width: MAX_EDGE,
      height: MAX_EDGE / 4,
    })
    expect(
      outputSize(source, make({ resize: "width", resizeValue: 100_000 }))
    ).toEqual({ width: MAX_EDGE, height: MAX_EDGE / 2 })
  })
})

describe("layoutFor", () => {
  const source = { width: 400, height: 200 }

  it("fills the canvas with the picture unless an exact size is asked for", () => {
    expect(
      layoutFor(source, make({ resize: "width", resizeValue: 100 }))
    ).toEqual({
      canvas: { width: 100, height: 50 },
      picture: { width: 100, height: 50 },
      x: 0,
      y: 0,
    })
  })

  it("fits the picture inside an exact size and centres it", () => {
    expect(
      layoutFor(
        source,
        make({ resize: "exact", resizeValue: 320, resizeHeight: 320 })
      )
    ).toEqual({
      canvas: { width: 320, height: 320 },
      picture: { width: 320, height: 160 },
      x: 0,
      y: 80,
    })
    // A tall canvas for a wide picture, and a turned picture.
    expect(
      layoutFor(
        source,
        make({
          resize: "exact",
          resizeValue: 100,
          resizeHeight: 400,
          rotation: 90,
        })
      )
    ).toMatchObject({ picture: { width: 100, height: 200 }, x: 0, y: 100 })
  })

  it("leaves a small picture at its own size inside an exact canvas when enlarging is off", () => {
    expect(
      layoutFor(
        { width: 40, height: 20 },
        make({
          resize: "exact",
          resizeValue: 100,
          resizeHeight: 100,
          enlarge: false,
        })
      )
    ).toEqual({
      canvas: { width: 100, height: 100 },
      picture: { width: 40, height: 20 },
      x: 30,
      y: 40,
    })
  })

  it("keeps an exact size within the largest side, and even for video", () => {
    expect(
      outputSize(
        source,
        make({ resize: "exact", resizeValue: 5000, resizeHeight: 0 })
      )
    ).toEqual({ width: MAX_EDGE, height: 1 })
    expect(
      layoutFor(
        source,
        make({
          target: "mp4",
          resize: "exact",
          resizeValue: 101,
          resizeHeight: 51,
        })
      ).canvas
    ).toEqual({ width: 100, height: 50 })
  })

  it("never enlarges when asked not to", () => {
    const small = make({
      resize: "longEdge",
      resizeValue: 1280,
      enlarge: false,
    })
    expect(outputSize(source, small)).toEqual(source)
    expect(outputSize({ width: 2560, height: 1280 }, small)).toEqual({
      width: 1280,
      height: 640,
    })
    expect(
      outputSize(
        source,
        make({ resize: "percent", resizeValue: 200, enlarge: false })
      )
    ).toEqual(source)
  })

  it("sizes from the crop when there is one", () => {
    const crop = { width: 100, height: 100 }
    expect(outputSize(source, make(), crop)).toEqual(crop)
    expect(
      outputSize(source, make({ resize: "width", resizeValue: 50 }), crop)
    ).toEqual({
      width: 50,
      height: 50,
    })
  })

  it("applies the tool's own shrink on top of the chosen size", () => {
    expect(outputSize(source, make({ shrink: 0.5 }))).toEqual({
      width: 200,
      height: 100,
    })
    expect(
      outputSize(
        source,
        make({ resize: "width", resizeValue: 100, shrink: 0.5 })
      )
    ).toEqual({ width: 50, height: 25 })
  })
})

describe("encodePlan", () => {
  it("maps quality to WebP settings", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "webp", ...change }))
    expect(plan({ quality: "lossless" })).toEqual({
      kind: "webp",
      quality: 100,
      lossless: true,
      mixed: false,
      tolerance: 0,
    })
    expect(plan({ quality: "high" })).toMatchObject({
      quality: 90,
      lossless: false,
      mixed: true,
    })
    expect(plan({ quality: "balanced" })).toMatchObject({
      quality: 75,
      mixed: true,
    })
    expect(plan({ quality: "small" })).toMatchObject({
      quality: 50,
      mixed: false,
    })
    expect(plan({ quality: "custom", customQuality: 33 })).toMatchObject({
      quality: 33,
      mixed: false,
      tolerance: 3,
    })
  })

  it("maps quality to APNG settings", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "apng", ...change }))
    expect(plan({ quality: "lossless" })).toEqual({ kind: "apng-exact" })
    expect(plan({ quality: "high" })).toEqual({ kind: "apng-exact" })
    expect(plan({ quality: "balanced", dithering: false })).toEqual({
      kind: "apng-indexed",
      colours: 256,
      dithering: false,
      tolerance: 3,
    })
    expect(plan({ quality: "small" })).toEqual({
      kind: "apng-indexed",
      colours: 64,
      dithering: false,
      tolerance: 8,
    })
    expect(plan({ quality: "custom", colours: 12 })).toMatchObject({
      colours: 12,
      dithering: true,
    })
  })

  it("maps quality to the fast GIF encoder", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "gif", ...change }))
    expect(plan({ quality: "high" })).toEqual({
      kind: "gif",
      colours: 256,
      dithering: true,
      tolerance: 2,
    })
    // GIF cannot be lossless, so Lossless means its best.
    expect(plan({ quality: "lossless" })).toEqual(plan({ quality: "high" }))
    expect(plan({ quality: "balanced" })).toMatchObject({
      colours: 128,
      tolerance: 4,
    })
    expect(plan({ quality: "small" })).toEqual({
      kind: "gif",
      colours: 64,
      dithering: false,
      tolerance: 10,
    })
    expect(
      plan({ quality: "custom", colours: 20, dithering: false })
    ).toMatchObject({
      colours: 20,
      dithering: false,
    })
  })

  it("maps quality to video", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "mp4", ...change }))
    expect(plan({ quality: "balanced" })).toEqual({
      kind: "video",
      container: "mp4",
      level: "balanced",
    })
    expect(plan({ quality: "small" })).toMatchObject({ level: "small" })
    expect(plan({ quality: "high" })).toMatchObject({ level: "high" })
    // Video here is never lossless, so Lossless means its best.
    expect(plan({ quality: "lossless" })).toMatchObject({ level: "high" })
    expect(
      encodePlan(make({ target: "webm", quality: "custom", customQuality: 1 }))
    ).toEqual({
      kind: "video",
      container: "webm",
      level: 0.01,
    })
    expect(plan({ quality: "custom", customQuality: 100 })).toMatchObject({
      level: 0.4,
    })
  })

  it("maps quality to frames and sprite sheets", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "frames", ...change }))
    // PNG is always exact.
    expect(plan({ frameFormat: "png", quality: "small" })).toEqual({
      kind: "frames",
      format: "png",
      lossless: true,
      quality: 100,
    })
    expect(plan({ frameFormat: "webp", quality: "high" })).toMatchObject({
      lossless: true,
    })
    expect(plan({ frameFormat: "webp", quality: "lossless" })).toMatchObject({
      lossless: true,
    })
    expect(plan({ frameFormat: "webp", quality: "balanced" })).toMatchObject({
      lossless: false,
      quality: 80,
    })
    expect(plan({ frameFormat: "webp", quality: "small" })).toMatchObject({
      quality: 60,
    })
    expect(plan({ frameFormat: "jpeg", quality: "high" })).toMatchObject({
      lossless: false,
      quality: 92,
    })
    expect(plan({ frameFormat: "jpeg", quality: "lossless" })).toMatchObject({
      quality: 92,
    })
    expect(
      plan({ frameFormat: "jpeg", quality: "custom", customQuality: 41 })
    ).toMatchObject({
      quality: 41,
    })
    expect(encodePlan(make({ target: "sprite", frameFormat: "webp" }))).toEqual(
      {
        kind: "sprite",
        format: "webp",
        lossless: false,
        quality: 80,
      }
    )
  })

  it("maps quality to gifski", () => {
    const plan = (change: Partial<AnimationSettings>) =>
      encodePlan(make({ target: "gif", gifEngine: "best", ...change }))
    expect(plan({ quality: "high" })).toEqual({ kind: "gifski", quality: 100 })
    expect(plan({ quality: "lossless" })).toEqual({
      kind: "gifski",
      quality: 100,
    })
    expect(plan({ quality: "balanced" })).toEqual({
      kind: "gifski",
      quality: 85,
    })
    expect(plan({ quality: "small" })).toEqual({ kind: "gifski", quality: 60 })
    expect(plan({ quality: "custom", customQuality: 42 })).toEqual({
      kind: "gifski",
      quality: 42,
    })
  })
})

describe("settingsProblem", () => {
  const problem = (change: Partial<AnimationSettings>) =>
    settingsProblem(make(change))

  it("accepts the defaults and every preset choice", () => {
    expect(problem({})).toBeNull()
    expect(
      problem({ fps: 12, speed: 4, loop: "count", loopCount: 2 })
    ).toBeNull()
    expect(problem({ resize: "percent", resizeValue: 400 })).toBeNull()
    expect(problem({ resize: "longEdge", resizeValue: MAX_EDGE })).toBeNull()
    expect(
      problem({ background: "custom", backgroundColor: "#abcdef" })
    ).toBeNull()
  })

  it("checks the loop count only when it is used", () => {
    expect(problem({ loop: "forever", loopCount: NaN })).toBeNull()
    expect(problem({ loop: "count", loopCount: 1 })).toMatch(/2 or more/)
    expect(problem({ loop: "count", loopCount: 2.5 })).toMatch(/2 or more/)
    expect(problem({ loop: "count", loopCount: NaN })).toMatch(/2 or more/)
    expect(problem({ loop: "count", loopCount: 1001 })).toMatch(/1,000/)
  })

  it("checks the frame rate and speed", () => {
    expect(problem({ fps: 0 })).toMatch(/1 to 60/)
    expect(problem({ fps: 61 })).toMatch(/1 to 60/)
    expect(problem({ fps: NaN })).toMatch(/1 to 60/)
    expect(problem({ speed: 0.05 })).toMatch(/0\.1× to 10×/)
    expect(problem({ speed: 11 })).toMatch(/0\.1× to 10×/)
    expect(problem({ speed: NaN })).toMatch(/0\.1× to 10×/)
  })

  it("checks sizes in their own unit", () => {
    expect(problem({ resize: "original", resizeValue: NaN })).toBeNull()
    expect(problem({ resize: "percent", resizeValue: 0 })).toMatch(/1% to 400%/)
    expect(problem({ resize: "percent", resizeValue: 401 })).toMatch(
      /1% to 400%/
    )
    expect(problem({ resize: "width", resizeValue: 0 })).toMatch(/whole pixels/)
    expect(problem({ resize: "height", resizeValue: 10.5 })).toMatch(
      /whole pixels/
    )
    expect(problem({ resize: "longEdge", resizeValue: NaN })).toMatch(
      /whole pixels/
    )
    expect(problem({ resize: "width", resizeValue: MAX_EDGE + 1 })).toMatch(
      /1,920/
    )
  })

  it("checks both sides of an exact size", () => {
    expect(
      problem({ resize: "exact", resizeValue: 320, resizeHeight: 320 })
    ).toBeNull()
    expect(
      problem({ resize: "exact", resizeValue: 320, resizeHeight: 0 })
    ).toMatch(/whole pixels/)
    expect(
      problem({ resize: "exact", resizeValue: 320, resizeHeight: NaN })
    ).toMatch(/whole pixels/)
    expect(
      problem({ resize: "exact", resizeValue: 320, resizeHeight: MAX_EDGE + 1 })
    ).toMatch(/1,920/)
    // The height is ignored for every other way of sizing.
    expect(
      problem({ resize: "width", resizeValue: 320, resizeHeight: NaN })
    ).toBeNull()
  })

  it("checks the length and file-size limits", () => {
    expect(problem({ maxSeconds: 3 })).toBeNull()
    expect(problem({ maxSeconds: 0 })).toMatch(/0\.1 to 600 seconds/)
    expect(problem({ maxSeconds: 601 })).toMatch(/0\.1 to 600 seconds/)
    expect(problem({ maxSeconds: NaN })).toMatch(/0\.1 to 600 seconds/)
    expect(problem({ sizeLimit: 256_000 })).toBeNull()
    expect(problem({ sizeLimit: MIN_SIZE_LIMIT - 1 })).toMatch(
      /10 KB to 100 MB/
    )
    expect(problem({ sizeLimit: MAX_SIZE_LIMIT + 1 })).toMatch(
      /10 KB to 100 MB/
    )
    expect(problem({ sizeLimit: NaN })).toMatch(/10 KB to 100 MB/)
  })

  it("checks the custom quality that the chosen encoder uses", () => {
    const custom = (change: Partial<AnimationSettings>) =>
      problem({ quality: "custom", ...change })
    expect(custom({ target: "webp", customQuality: 0 })).toMatch(/1 to 100/)
    expect(custom({ target: "webp", customQuality: 101 })).toMatch(/1 to 100/)
    // WebP ignores the colour count.
    expect(custom({ target: "webp", colours: 999 })).toBeNull()
    expect(
      custom({ target: "gif", gifEngine: "best", customQuality: NaN })
    ).toMatch(/1 to 100/)
    expect(custom({ target: "gif", colours: 1 })).toMatch(/2 to 256/)
    expect(custom({ target: "gif", colours: 257 })).toMatch(/2 to 256/)
    expect(custom({ target: "gif", colours: 16.5 })).toMatch(/2 to 256/)
    // The fast GIF encoder ignores the quality number.
    expect(custom({ target: "gif", customQuality: 999 })).toBeNull()
    // APNG takes colours whichever GIF encoder was last chosen.
    expect(custom({ target: "apng", gifEngine: "best", colours: 1 })).toMatch(
      /2 to 256/
    )
    expect(
      custom({ target: "apng", gifEngine: "best", customQuality: 999 })
    ).toBeNull()
    expect(custom({ target: "mp4", customQuality: 0 })).toMatch(/1 to 100/)
    expect(custom({ target: "sprite", customQuality: 101 })).toMatch(/1 to 100/)
    // Outside Custom neither number matters.
    expect(
      problem({ quality: "high", colours: 1, customQuality: 0 })
    ).toBeNull()
  })

  it("checks the background colour and the file name", () => {
    expect(problem({ background: "custom", backgroundColor: "teal" })).toMatch(
      /hex colour/
    )
    expect(problem({ background: "white", backgroundColor: "teal" })).toBeNull()
    expect(problem({ pattern: "{name}-{frames}" })).toBe(
      "The file name has a part we do not know: {frames}."
    )
    expect(
      problem({ pattern: "{name}-{width}x{height}-{index}.{format}" })
    ).toBeNull()
  })
})

describe("budgets", () => {
  it("allows results that fit in memory", () => {
    expect(budgetProblem(100, { width: 640, height: 480 }, make())).toBeNull()
    expect(
      budgetProblem(FRAME_BUDGET / 100, { width: 10, height: 10 }, make())
    ).toBeNull()
  })

  it("explains what to change when a result is too large", () => {
    const size = { width: 1920, height: 1080 }
    expect(budgetProblem(2000, size, make())).toBe(
      "2,000 frames at 1920 × 1080 is more than this tool can hold at once. Trim it, lower the frame rate or make it smaller."
    )
    // With a frame rate limit already set, that advice is left out.
    expect(budgetProblem(2000, size, make({ fps: 10 }))).toMatch(
      /Trim it or make it smaller\.$/
    )
  })

  it("lets gifski take only what it can hold, and at least two frames", () => {
    expect(bestFits(100, { width: 480, height: 320 })).toBe(true)
    expect(bestFits(1, { width: 10, height: 10 })).toBe(false)
    expect(bestFits(BEST_BUDGET / 100 + 1, { width: 10, height: 10 })).toBe(
      false
    )
    expect(bestFits(BEST_BUDGET / 100, { width: 10, height: 10 })).toBe(true)
  })
})

describe("text, effects and overlay settings", () => {
  const problem = (change: Partial<AnimationSettings>) =>
    settingsProblem(make(change))

  it("checks the colour adjustments and fades", () => {
    expect(
      problem({ brightness: -100, contrast: 100, saturation: 0 })
    ).toBeNull()
    expect(problem({ brightness: 101 })).toMatch(/-100 to 100/)
    expect(problem({ contrast: -101 })).toMatch(/-100 to 100/)
    expect(problem({ saturation: NaN })).toMatch(/-100 to 100/)
    expect(problem({ fadeIn: 10, fadeOut: 0.5 })).toBeNull()
    expect(problem({ fadeIn: -1 })).toMatch(/0 to 10 seconds/)
    expect(problem({ fadeOut: 11 })).toMatch(/0 to 10 seconds/)
    expect(problem({ fadeOut: NaN })).toMatch(/0 to 10 seconds/)
  })

  it("checks captions: their length, colour and times", () => {
    expect(problem({ captionTop: "x".repeat(200) })).toBeNull()
    expect(problem({ captionTop: "x".repeat(201) })).toMatch(/200 characters/)
    expect(problem({ captionBottom: "x".repeat(201) })).toMatch(
      /200 characters/
    )
    const custom = {
      captionColour: "custom",
      captionCustomColour: "teal",
    } as const
    // The colour only matters when there is something to write.
    expect(problem(custom)).toBeNull()
    expect(problem({ ...custom, captionTop: " " })).toBeNull()
    expect(problem({ ...custom, captionTop: "Hi" })).toMatch(/hex colour/)
    expect(problem({ ...custom, captionBottom: "Hi" })).toMatch(/hex colour/)
    expect(
      problem({ ...custom, captionCustomColour: "#008080", captionTop: "Hi" })
    ).toBeNull()

    expect(problem({ captionFrom: 0, captionUntil: 0.5 })).toBeNull()
    expect(problem({ captionFrom: 1 })).toBeNull()
    expect(problem({ captionUntil: 2 })).toBeNull()
    expect(problem({ captionFrom: -1 })).toMatch(/start before the end/)
    expect(problem({ captionFrom: NaN })).toMatch(/start before the end/)
    expect(problem({ captionUntil: 0 })).toMatch(/start before the end/)
    expect(problem({ captionUntil: NaN })).toMatch(/start before the end/)
    expect(problem({ captionFrom: 2, captionUntil: 2 })).toMatch(
      /start before the end/
    )
  })

  it("checks the overlay's size and opacity", () => {
    expect(problem({ overlaySize: 5, overlayOpacity: 10 })).toBeNull()
    expect(problem({ overlaySize: 100, overlayOpacity: 100 })).toBeNull()
    expect(problem({ overlaySize: 4 })).toMatch(/5% to 100%/)
    expect(problem({ overlaySize: 101 })).toMatch(/5% to 100%/)
    expect(problem({ overlaySize: NaN })).toMatch(/5% to 100%/)
    expect(problem({ overlayOpacity: 9 })).toMatch(/10% to 100%/)
    expect(problem({ overlayOpacity: 101 })).toMatch(/10% to 100%/)
    expect(problem({ overlayOpacity: NaN })).toMatch(/10% to 100%/)
  })

  it("knows when there is text, and its colour", () => {
    expect(hasCaption(make())).toBe(false)
    expect(hasCaption(make({ captionTop: "  " }))).toBe(false)
    expect(hasCaption(make({ captionTop: "a" }))).toBe(true)
    expect(hasCaption(make({ captionBottom: "b" }))).toBe(true)
    expect(captionColour(make())).toEqual([255, 255, 255])
    expect(captionColour(make({ captionColour: "black" }))).toEqual([0, 0, 0])
    expect(
      captionColour(
        make({ captionColour: "custom", captionCustomColour: "#102030" })
      )
    ).toEqual([16, 32, 48])
    // The page refuses a colour it cannot read; white is only a guard.
    expect(
      captionColour(
        make({ captionColour: "custom", captionCustomColour: "nope" })
      )
    ).toEqual([255, 255, 255])
  })

  it("fades to black unless a background colour is chosen", () => {
    expect(fadeColour(make())).toEqual([0, 0, 0])
    // A video is filled with white, but still fades to black.
    expect(fadeColour(make({ target: "mp4" }))).toEqual([0, 0, 0])
    expect(fadeColour(make({ background: "white" }))).toEqual([255, 255, 255])
    expect(
      fadeColour(make({ background: "custom", backgroundColor: "#ff0000" }))
    ).toEqual([255, 0, 0])
  })

  it("converts again only when an option that is in use changes", () => {
    const base = processingKey(make(), noTrim)
    // Options for text that is not written.
    for (const change of [
      { captionSize: "large" },
      { captionColour: "black" },
      { captionColour: "custom", captionCustomColour: "#123456" },
      { captionOutline: false },
      { captionUppercase: true },
      { captionFrom: 1 },
      { captionUntil: 2 },
      // Options for an overlay that is not there.
      { overlayCorner: "centre" },
      { overlaySize: 50 },
      { overlayOpacity: 30 },
    ] as Partial<AnimationSettings>[])
      expect(processingKey(make(change), noTrim), JSON.stringify(change)).toBe(
        base
      )
    for (const change of [
      { filter: "sepia" },
      { brightness: 10 },
      { contrast: 10 },
      { saturation: 10 },
      { fadeIn: 1 },
      { fadeOut: 1 },
      { captionTop: "Hi" },
      { captionBottom: "Hi" },
    ] as Partial<AnimationSettings>[])
      expect(
        processingKey(make(change), noTrim),
        JSON.stringify(change)
      ).not.toBe(base)

    const written = make({ captionTop: "Hi" })
    const withText = processingKey(written, noTrim)
    for (const change of [
      { captionSize: "large" },
      { captionColour: "black" },
      { captionOutline: false },
      { captionUppercase: true },
      { captionFrom: 1 },
      { captionUntil: 2 },
    ] as Partial<AnimationSettings>[])
      expect(
        processingKey({ ...written, ...change }, noTrim),
        JSON.stringify(change)
      ).not.toBe(withText)
    // The custom colour counts only while "Custom" is chosen.
    expect(
      processingKey({ ...written, captionCustomColour: "#123456" }, noTrim)
    ).toBe(withText)
    const custom = { ...written, captionColour: "custom" as const }
    expect(
      processingKey({ ...custom, captionCustomColour: "#123456" }, noTrim)
    ).not.toBe(processingKey(custom, noTrim))

    const stamped = processingKey(make(), noTrim, "logo-1")
    expect(stamped).not.toBe(base)
    expect(processingKey(make(), noTrim, "logo-2")).not.toBe(stamped)
    for (const change of [
      { overlayCorner: "centre" },
      { overlaySize: 50 },
      { overlayOpacity: 30 },
    ] as Partial<AnimationSettings>[])
      expect(
        processingKey(make(change), noTrim, "logo-1"),
        JSON.stringify(change)
      ).not.toBe(stamped)
  })
})

describe("processingKey", () => {
  it("changes with anything that changes the bytes, and not with the file name", () => {
    const base = processingKey(make(), noTrim)
    expect(processingKey(make({ pattern: "{name}-small" }), noTrim)).toBe(base)
    expect(processingKey(make({ speed: 2 }), noTrim)).not.toBe(base)
    expect(processingKey(make(), { start: 100, end: null })).not.toBe(base)
    expect(processingKey(make(), { start: 0, end: 500 })).not.toBe(base)
    expect(
      processingKey(make(), {
        start: 0,
        end: null,
        crop: { x: 1, y: 1, width: 5, height: 5 },
      })
    ).not.toBe(base)
    expect(processingKey(make({ sizeLimit: 256_000 }), noTrim)).not.toBe(base)
    // "shrink" is set by the tool while it works, not chosen.
    expect(processingKey(make({ shrink: 0.5 }), noTrim)).toBe(base)
    // The page reads the format back out of the key.
    expect(
      JSON.parse(processingKey(make({ target: "apng" }), noTrim)).target
    ).toBe("apng")
  })
})
