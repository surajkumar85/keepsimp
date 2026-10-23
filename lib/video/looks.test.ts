import { describe, expect, it } from "vitest"
import { lookSize, looksSaid, moments } from "./looks"

describe("comparing frames", () => {
  it("spreads the moments from a tenth in to nine tenths", () => {
    expect(moments(0, 10)).toEqual(
      [1, 2.6, 4.2, 5.8, 7.4, 9].map((t) => expect.closeTo(t, 9))
    )
    expect(moments(2, 10, 1)).toEqual([7])
  })

  it("draws frames at most 480 wide, even, in shape", () => {
    expect(lookSize(1920, 1080)).toEqual({ width: 480, height: 270 })
    expect(lookSize(1080, 1920)).toEqual({ width: 480, height: 854 })
    expect(lookSize(320, 181)).toEqual({ width: 320, height: 182 })
    expect(lookSize(1, 1)).toEqual({ width: 2, height: 2 })
  })

  it("says how close in words and numbers", () => {
    const said = (mean: number) =>
      looksSaid({ mean, least: mean - 0.02, frames: 6 })
    expect(said(0.995)).toBe(
      "Looks hard to tell apart from the original: SSIM 0.995 on average over 6 frames, 0.975 at the least."
    )
    expect(said(0.96)).toMatch(/^Looks very close to the original:/)
    expect(said(0.92)).toMatch(/^Looks close to the original, a little softer:/)
    expect(said(0.8)).toMatch(/^Looks noticeably softer than the original:/)
  })
})
