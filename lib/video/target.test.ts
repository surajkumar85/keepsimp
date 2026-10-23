import { describe, expect, it } from "vitest"
import {
  correctedBitrate,
  fitToSize,
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
