import { describe, expect, it } from "vitest"
import {
  correctedBitrate,
  fitToSize,
  floorSaid,
  nextPass,
  stepDown,
  LEAST_BITS_PER_PIXEL,
  OVERHEAD_BYTES,
  OVERHEAD_SHARE,
  passStands,
  pictureBudget,
  willMiss,
} from "./target"

const MB = 1024 * 1024
const base = {
  duration: 30,
  soundBits: 128_000,
  width: 1920,
  height: 1080,
  frameRate: 30,
  efficiency: 1,
}

describe("the budget", () => {
  it("leaves room for the container and the sound", () => {
    const usable = 25 * MB * (1 - OVERHEAD_SHARE) - OVERHEAD_BYTES
    expect(pictureBudget(25 * MB, 30, 128_000)).toBe(
      Math.floor((usable * 8) / 30 - 128_000)
    )
    // A file with no length counts as a thousandth of a second.
    expect(pictureBudget(MB, 0, 0)).toBeGreaterThan(1e9)
  })
})

describe("fitting a size", () => {
  it("keeps the size and rate when the budget is enough", () => {
    const fit = fitToSize({ ...base, target: 25 * MB })
    expect(fit).toMatchObject({
      width: 1920,
      height: 1080,
      frameRate: null,
      short: null,
    })
    expect(fit.bitrate).toBe(pictureBudget(25 * MB, 30, 128_000))
  })

  it("steps the size down as the budget thins: 25 MB holds a minute of 1080p, two of 720p, four of 480p", () => {
    const sizes = [60, 120, 240].map((duration) => {
      const fit = fitToSize({ ...base, duration, target: 25 * MB })
      return [fit.width, fit.height]
    })
    expect(sizes).toEqual([
      [1920, 1080],
      [1280, 720],
      [854, 480],
    ])
  })

  it("lowers 60 frames a second to 30 before the size", () => {
    const fit = fitToSize({
      ...base,
      frameRate: 60,
      duration: 30,
      target: 15 * MB,
    })
    expect(fit).toMatchObject({ width: 1920, height: 1080, frameRate: 30 })
  })

  it("needs fewer bits with a better codec", () => {
    const avc = fitToSize({ ...base, duration: 90, target: 25 * MB })
    const av1 = fitToSize({
      ...base,
      efficiency: 0.4,
      duration: 90,
      target: 25 * MB,
    })
    expect(av1.width).toBeGreaterThan(avc.width)
  })

  it("keeps the shape of an upright video and never enlarges", () => {
    const fit = fitToSize({
      ...base,
      width: 1080,
      height: 1920,
      duration: 120,
      target: 25 * MB,
    })
    expect([fit.width, fit.height]).toEqual([720, 1280])
    const small = fitToSize({
      ...base,
      width: 320,
      height: 180,
      target: 10 * MB,
    })
    expect([small.width, small.height]).toEqual([320, 180])
  })

  it("says how small it can go when the target is too small", () => {
    const fit = fitToSize({ ...base, duration: 600, target: MB })
    expect([fit.width, fit.height]).toEqual([426, 240])
    const needed = LEAST_BITS_PER_PIXEL * 426 * 240 * 30
    expect(fit.bitrate).toBeCloseTo(needed)
    expect(fit.short!.least).toBe(
      Math.ceil(
        (((needed + 128_000) * 600) / 8 + OVERHEAD_BYTES) / (1 - OVERHEAD_SHARE)
      )
    )
    expect(fit.short!.least).toBeGreaterThan(MB)
  })
})

describe("passes", () => {
  it("corrects the bitrate by what the last pass wrote, a little under", () => {
    expect(correctedBitrate(1_000_000, 10 * MB, 12 * MB)).toBe(
      Math.floor(1_000_000 * (10 / 12) * 0.97)
    )
    expect(correctedBitrate(1_000_000, 10 * MB, 5 * MB)).toBe(1_940_000)
  })

  it("stands when under the target and not wastefully far under it", () => {
    expect(passStands(10, 9.5, false)).toBe(true)
    expect(passStands(10, 10.1, true)).toBe(false)
    expect(passStands(10, 5, false)).toBe(false)
    expect(passStands(10, 5, true)).toBe(true)
  })

  it("sees a miss coming once a quarter is written", () => {
    expect(willMiss(100, 40, 0.2)).toBe(false)
    expect(willMiss(100, 30, 0.25)).toBe(true)
    expect(willMiss(100, 27, 0.25)).toBe(false)
  })
})

describe("an encoder at its floor", () => {
  it("steps the picture down to a size with fewer pixels, in its shape", () => {
    expect(stepDown(960, 540)).toEqual({ width: 854, height: 480 })
    expect(stepDown(540, 960)).toEqual({ width: 480, height: 854 })
    expect(stepDown(1920, 1080, 0.5)).toEqual({ width: 1280, height: 720 })
    expect(stepDown(960, 540, 0.55)).toEqual({ width: 640, height: 360 })
    // Nothing has so few pixels: the smallest step.
    expect(stepDown(960, 540, 0.01)).toEqual({ width: 426, height: 240 })
    expect(stepDown(426, 240)).toBeNull()
  })

  it("lowers the bitrate when the encoder follows it, and the size when it does not", () => {
    const pass = { bitrate: 878_000, width: 960, height: 540 }
    // Over by a little: the encoder follows its bitrate, so ask less.
    expect(nextPass(pass, 783_000, 860_000, 783_000)).toEqual({
      ...pass,
      bitrate: correctedBitrate(878_000, 783_000, 860_000),
      smaller: false,
    })
    // Firefox on Linux in CI: 1.35 MB for 765 KB asked; the same bitrate, smaller.
    expect(nextPass(pass, 783_000, 1_415_619, 783_000)).toEqual({
      bitrate: 878_000,
      width: 640,
      height: 360,
      smaller: true,
    })
    // At the smallest size there is nothing to step down to.
    expect(
      nextPass({ bitrate: 100_000, width: 426, height: 240 }, 1000, 5000, 1000)
    ).toMatchObject({ width: 426, smaller: false })
    // A lower bitrate that wrote about as much: the floor, seen over two passes.
    const lower = { ...pass, bitrate: 680_000 }
    expect(
      nextPass(lower, 783_000, 930_000, 700_000, {
        bitrate: 878_000,
        written: 950_000,
      })
    ).toMatchObject({
      width: 640,
      height: 360,
      bitrate: 680_000,
      smaller: true,
    })
    // One that came down with it is followed.
    expect(
      nextPass(lower, 783_000, 800_000, 700_000, {
        bitrate: 878_000,
        written: 950_000,
      }).smaller
    ).toBe(false)
    // Under the target is never a floor.
    expect(nextPass(pass, 1_000_000, 700_000, 400_000).smaller).toBe(false)
    expect(floorSaid({ width: 854, height: 480 })).toBe(
      "This browser's encoder would not come down to the bitrate asked, so the picture was made smaller, 854 × 480, to fit."
    )
  })
})
