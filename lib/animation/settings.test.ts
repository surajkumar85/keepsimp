import { describe, expect, it } from "vitest"
import {
  BEST_BUDGET,
  bestFits,
  budgetProblem,
  defaultSettings,
  encodePlan,
  FRAME_BUDGET,
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
    expect(targetOrder).toEqual(["gif", "webp", "apng"])
    expect(Object.keys(targets).sort()).toEqual([...targetOrder].sort())
    expect(targets.apng).toMatchObject({ extension: "png", mime: "image/png" })
    for (const target of targetOrder)
      expect(targets[target].hint).toMatch(/\.$/)
  })

  it("knows which formats can be lossless", () => {
    expect(losslessApplies(make({ target: "gif" }))).toBe(false)
    expect(losslessApplies(make({ target: "webp" }))).toBe(true)
    expect(losslessApplies(make({ target: "apng" }))).toBe(true)
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

describe("processingKey", () => {
  it("changes with anything that changes the bytes, and not with the file name", () => {
    const base = processingKey(make(), noTrim)
    expect(processingKey(make({ pattern: "{name}-small" }), noTrim)).toBe(base)
    expect(processingKey(make({ speed: 2 }), noTrim)).not.toBe(base)
    expect(processingKey(make(), { start: 100, end: null })).not.toBe(base)
    expect(processingKey(make(), { start: 0, end: 500 })).not.toBe(base)
    // The page reads the format back out of the key.
    expect(
      JSON.parse(processingKey(make({ target: "apng" }), noTrim)).target
    ).toBe("apng")
  })
})
