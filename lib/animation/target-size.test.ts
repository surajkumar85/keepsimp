import { describe, expect, it } from "vitest"
import { rankSizes } from "./compare"
import {
  applyDestination,
  destinations,
  DESTINATIONS_CHECKED,
  matchingDestination,
} from "./presets"
import { defaultSettings, type AnimationSettings } from "./settings"
import { applyLevel, describeLevel, fitLadder, LADDER } from "./target-size"

const make = (change: Partial<AnimationSettings> = {}): AnimationSettings => ({
  ...defaultSettings,
  ...change,
})

describe("the ladder", () => {
  it("starts with the chosen settings and only ever gets smaller", () => {
    expect(LADDER[0]).toEqual({ quality: 0, fps: null, scale: 1 })
    for (let index = 1; index < LADDER.length; index++) {
      const [before, after] = [LADDER[index - 1], LADDER[index]]
      expect(after.quality).toBeGreaterThanOrEqual(before.quality)
      expect(after.scale).toBeLessThanOrEqual(before.scale)
      expect(after.fps ?? Infinity).toBeLessThanOrEqual(before.fps ?? Infinity)
      expect(after).not.toEqual(before)
    }
  })
})

describe("applyLevel", () => {
  const rung = (
    quality: 0 | 1 | 2 | 3,
    fps: number | null = null,
    scale = 1
  ) => ({
    quality,
    fps,
    scale,
  })

  it("changes nothing on the first rung", () => {
    const settings = make({ target: "gif", fps: 12 })
    expect(applyLevel(settings, LADDER[0])).toEqual(settings)
  })

  it("lowers WebP quality, never raising a lower one already chosen", () => {
    expect(applyLevel(make({ target: "webp" }), rung(1))).toMatchObject({
      quality: "custom",
      customQuality: 60,
    })
    expect(
      applyLevel(make({ target: "webp", quality: "lossless" }), rung(3))
    ).toMatchObject({
      quality: "custom",
      customQuality: 30,
    })
    expect(
      applyLevel(
        make({ target: "webp", quality: "custom", customQuality: 20 }),
        rung(1)
      ).customQuality
    ).toBe(20)
  })

  it("uses fewer colours for GIF and APNG, and stops dithering once they are few", () => {
    expect(applyLevel(make({ target: "gif" }), rung(1))).toMatchObject({
      quality: "custom",
      colours: 128,
      dithering: true,
    })
    expect(applyLevel(make({ target: "gif" }), rung(2))).toMatchObject({
      colours: 64,
      dithering: false,
    })
    expect(
      applyLevel(make({ target: "gif", dithering: false }), rung(1)).dithering
    ).toBe(false)
    // APNG keeps twice the colours at each step: its files start larger but its colours matter more.
    expect(applyLevel(make({ target: "apng" }), rung(3)).colours).toBe(64)
    expect(
      applyLevel(
        make({ target: "gif", quality: "custom", colours: 16 }),
        rung(1)
      ).colours
    ).toBe(16)
  })

  it("lowers gifski's quality number", () => {
    expect(
      applyLevel(make({ target: "gif", gifEngine: "best" }), rung(2))
    ).toMatchObject({
      quality: "custom",
      customQuality: 50,
    })
  })

  it("leaves video quality to the bitrate, and PNG frames exact", () => {
    const video = make({ target: "mp4", quality: "high" })
    expect(applyLevel(video, rung(3, 10, 0.5))).toMatchObject({
      quality: "high",
      fps: 10,
      shrink: 0.5,
    })
    const png = make({ target: "frames", frameFormat: "png" })
    expect(applyLevel(png, rung(3)).quality).toBe(png.quality)
    expect(
      applyLevel(make({ target: "sprite", frameFormat: "jpeg" }), rung(2))
    ).toMatchObject({
      quality: "custom",
      customQuality: 45,
    })
  })

  it("caps the frame rate without raising a lower cap", () => {
    expect(applyLevel(make(), rung(0, 15)).fps).toBe(15)
    expect(applyLevel(make({ fps: 10 }), rung(0, 15)).fps).toBe(10)
    expect(applyLevel(make({ fps: 24 }), rung(0)).fps).toBe(24)
  })

  it("never scales an exact size", () => {
    expect(applyLevel(make({ resize: "exact" }), rung(3, 8, 0.2)).shrink).toBe(
      1
    )
    expect(applyLevel(make({ resize: "width" }), rung(3, 8, 0.2)).shrink).toBe(
      0.2
    )
  })
})

describe("describeLevel", () => {
  it("says nothing when nothing changed", () => {
    expect(describeLevel(make(), LADDER[0])).toEqual([])
    expect(
      describeLevel(make({ fps: 8 }), { quality: 0, fps: 20, scale: 1 })
    ).toEqual([])
  })

  it("names each lever that was pulled", () => {
    expect(describeLevel(make({ target: "webp" }), LADDER[6])).toEqual([
      "quality 30",
      "at most 12 frames a second",
      "70% of the size",
    ])
    expect(describeLevel(make({ target: "gif" }), LADDER[2])).toEqual([
      "64 colours",
    ])
    expect(describeLevel(make({ target: "mp4" }), LADDER[4])).toEqual([
      "at most 15 frames a second",
      "85% of the size",
    ])
    expect(
      describeLevel(make({ target: "apng", resize: "exact" }), LADDER[11])
    ).toEqual(["64 colours", "at most 8 frames a second"])
  })
})

describe("fitLadder", () => {
  /** A ladder whose rungs have these sizes. */
  const run = async (sizes: number[], limit: number) => {
    const tried: number[] = []
    const fitted = await fitLadder(
      sizes.length,
      limit,
      async (index, tries) => {
        tried.push(index)
        expect(tries).toBe(tried.length)
        return { result: `rung ${index}`, bytes: sizes[index] }
      }
    )
    return { ...fitted, tried }
  }

  it("keeps the chosen settings when they already fit", async () => {
    expect(await run([90, 80, 70], 100)).toEqual({
      index: 0,
      result: "rung 0",
      fits: true,
      tries: 1,
      tried: [0],
    })
  })

  it("finds the gentlest rung that fits, in few tries", async () => {
    const sizes = [900, 800, 700, 600, 500, 400, 300, 200, 150, 120, 90, 60]
    const fitted = await run(sizes, 450)
    expect(fitted).toMatchObject({ index: 5, result: "rung 5", fits: true })
    expect(fitted.tries).toBeLessThanOrEqual(5)
    expect((await run(sizes, 60)).index).toBe(11)
    expect((await run(sizes, 850)).index).toBe(1)
    // Each rung is tried once at most.
    expect(new Set(fitted.tried).size).toBe(fitted.tried.length)
  })

  it("returns the last rung, marked as not fitting, when nothing fits", async () => {
    expect(await run([900, 800, 700, 600], 100)).toMatchObject({
      index: 3,
      result: "rung 3",
      fits: false,
    })
    expect(await run([900], 100)).toEqual({
      index: 0,
      result: "rung 0",
      fits: false,
      tries: 1,
      tried: [0],
    })
  })
})

describe("destinations", () => {
  it("each has a source, a limit and a sentence about it", () => {
    expect(DESTINATIONS_CHECKED).toMatch(/^[A-Z][a-z]+ \d{4}$/)
    expect(new Set(destinations.map((item) => item.id)).size).toBe(
      destinations.length
    )
    for (const item of destinations) {
      expect(item.source.url, item.id).toMatch(/^https:\/\//)
      expect(item.limit, item.id).toBeGreaterThan(100_000)
      expect(item.note, item.id).toMatch(/\.$/)
      // A figure the service does not publish is said to be reported.
      if (!item.official) expect(item.note, item.id).toMatch(/Guides give/)
    }
  })

  it("applies an exact canvas, a size to stay within, or no size", () => {
    const by = (id: string) => destinations.find((item) => item.id === id)!
    expect(applyDestination(make(), by("discord-sticker"))).toMatchObject({
      target: "apng",
      resize: "exact",
      resizeValue: 320,
      resizeHeight: 320,
      enlarge: true,
      sizeLimit: 512_000,
      maxSeconds: null,
      fps: null,
    })
    expect(
      applyDestination(make({ fps: 60 }), by("telegram-sticker"))
    ).toMatchObject({
      target: "webm",
      resize: "longEdge",
      resizeValue: 512,
      enlarge: false,
      sizeLimit: 256_000,
      maxSeconds: 3,
      fps: 30,
    })
    expect(
      applyDestination(make({ resize: "width", resizeValue: 99 }), by("github"))
    ).toMatchObject({
      target: "gif",
      resize: "original",
      sizeLimit: 10_000_000,
    })
    // Everything else is left as it was.
    expect(
      applyDestination(make({ speed: 2, reverse: true }), by("github"))
    ).toMatchObject({
      speed: 2,
      reverse: true,
    })
  })

  it("is recognised while its settings stand, and not after one is changed", () => {
    for (const item of destinations)
      expect(
        matchingDestination(applyDestination(make(), item))?.id,
        item.id
      ).toBe(item.id)
    expect(matchingDestination(make())).toBeNull()
    const emoji = applyDestination(make(), destinations[0])
    expect(matchingDestination({ ...emoji, sizeLimit: 1_000_000 })).toBeNull()
    expect(matchingDestination({ ...emoji, target: "webp" })).toBeNull()
    // Settings a destination does not touch can change freely.
    expect(
      matchingDestination({ ...emoji, speed: 2, quality: "small" })?.id
    ).toBe(destinations[0].id)
  })
})

describe("rankSizes", () => {
  it("orders sizes smallest first and marks the winner", () => {
    expect(
      rankSizes(
        [
          { target: "gif", bytes: 500 },
          { target: "mp4", bytes: 50 },
          { target: "webp", bytes: 250 },
        ],
        1000
      )
    ).toEqual([
      { target: "mp4", bytes: 50, ratio: 0.05, smallest: true },
      { target: "webp", bytes: 250, ratio: 0.25, smallest: false },
      { target: "gif", bytes: 500, ratio: 0.5, smallest: false },
    ])
  })

  it("marks nothing when there is only one, and copes with an empty original", () => {
    expect(rankSizes([{ target: "gif", bytes: 10 }], 0)).toEqual([
      { target: "gif", bytes: 10, ratio: 1, smallest: false },
    ])
    expect(rankSizes([], 100)).toEqual([])
  })
})
