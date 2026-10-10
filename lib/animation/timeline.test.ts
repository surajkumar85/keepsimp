import { describe, expect, it } from "vitest"
import {
  describeTiming,
  frameAt,
  planFrames,
  sum,
  wholeUnits,
  type Timing,
} from "./timeline"

const plain: Timing = {
  start: 0,
  end: null,
  speed: 1,
  fps: null,
  reverse: false,
  boomerang: false,
}
const plan = (durations: number[], change: Partial<Timing> = {}) =>
  planFrames(durations, { ...plain, ...change })
const sources = (steps: { source: number }[]) =>
  steps.map((step) => step.source)
const lengths = (steps: { duration: number }[]) =>
  steps.map((step) => step.duration)

describe("frameAt", () => {
  it("finds the frame on screen at a time", () => {
    const durations = [100, 50, 200]
    expect(frameAt(durations, 0)).toBe(0)
    expect(frameAt(durations, 99)).toBe(0)
    expect(frameAt(durations, 100)).toBe(1)
    expect(frameAt(durations, 149)).toBe(1)
    expect(frameAt(durations, 150)).toBe(2)
  })

  it("stays on the last frame past the end, and on the first when there are none", () => {
    expect(frameAt([100, 50], 10_000)).toBe(1)
    expect(frameAt([], 5)).toBe(0)
  })
})

describe("planFrames", () => {
  it("keeps everything by default, as its own copy", () => {
    const durations = [100, 50, 200]
    const steps = plan(durations)
    expect(sources(steps)).toEqual([0, 1, 2])
    expect(lengths(steps)).toEqual(durations)
    steps[0].duration = 1
    expect(lengths(plan(durations))).toEqual(durations)
  })

  it("returns nothing for nothing", () => {
    expect(plan([])).toEqual([])
  })

  it("trims inside frames, shortening the first and last", () => {
    const steps = plan([100, 100, 100, 100], { start: 150, end: 320 })
    expect(sources(steps)).toEqual([1, 2, 3])
    expect(lengths(steps)).toEqual([50, 100, 20])
  })

  it("trims on frame boundaries without leaving empty frames", () => {
    const steps = plan([100, 100, 100], { start: 100, end: 200 })
    expect(sources(steps)).toEqual([1])
    expect(lengths(steps)).toEqual([100])
  })

  it("clamps a trim to the animation, and shows one frame for an empty window", () => {
    expect(lengths(plan([100, 100], { start: -50, end: 5000 }))).toEqual([
      100, 100,
    ])
    expect(plan([100, 80], { start: 150, end: 150 })).toEqual([
      { source: 1, duration: 80 },
    ])
    // An end before the start is treated as an empty window at the start.
    expect(plan([100, 80], { start: 120, end: 20 })).toEqual([
      { source: 1, duration: 80 },
    ])
    expect(plan([100, 80], { start: 9999 })).toEqual([
      { source: 1, duration: 80 },
    ])
  })

  it("cuts to a longest length, counted from the start of the trim", () => {
    const durations = [100, 100, 100, 100, 100]
    expect(lengths(plan(durations, { longest: 250 }))).toEqual([100, 100, 50])
    expect(sources(plan(durations, { start: 200, longest: 150 }))).toEqual([
      2, 3,
    ])
    // The earlier of the trim's end and the limit wins.
    expect(
      lengths(plan(durations, { start: 100, end: 200, longest: 300 }))
    ).toEqual([100])
    expect(lengths(plan(durations, { longest: 5000 }))).toEqual(durations)
    expect(lengths(plan(durations, { longest: null }))).toEqual(durations)
    // The limit is on the original, before speed is applied.
    expect(lengths(plan(durations, { longest: 200, speed: 2 }))).toEqual([
      50, 50,
    ])
  })

  it("changes speed by scaling every frame", () => {
    expect(lengths(plan([100, 50], { speed: 2 }))).toEqual([50, 25])
    expect(lengths(plan([100, 50], { speed: 0.5 }))).toEqual([200, 100])
  })

  it("limits the frame rate by dropping frames and keeps the length", () => {
    const durations = Array.from({ length: 10 }, () => 40)
    const steps = plan(durations, { fps: 10 })
    expect(sources(steps)).toEqual([0, 2, 5, 7])
    expect(sum(lengths(steps))).toBe(400)
  })

  it("never adds frames when the animation is already slower than the limit", () => {
    const steps = plan([500, 500], { fps: 30 })
    expect(steps).toEqual([
      { source: 0, duration: 500 },
      { source: 1, duration: 500 },
    ])
  })

  it("holds a slow frame once instead of repeating it", () => {
    const steps = plan([20, 20, 20, 300, 20, 20], { fps: 20 })
    expect(sources(steps)).toEqual([0, 2, 3])
    expect(sum(lengths(steps))).toBe(400)
    expect(steps[2].duration).toBe(300)
  })

  it("reverses", () => {
    const steps = plan([100, 50, 200], { reverse: true })
    expect(sources(steps)).toEqual([2, 1, 0])
    expect(lengths(steps)).toEqual([200, 50, 100])
  })

  it("plays there and back without repeating the ends", () => {
    expect(sources(plan([10, 20, 30, 40], { boomerang: true }))).toEqual([
      0, 1, 2, 3, 2, 1,
    ])
    // With two frames the loop already goes back and forth.
    expect(sources(plan([10, 20], { boomerang: true }))).toEqual([0, 1])
    expect(sources(plan([10], { boomerang: true }))).toEqual([0])
  })

  it("applies trim, then speed, then the rate limit, then direction", () => {
    const steps = plan(
      Array.from({ length: 8 }, () => 50),
      {
        start: 100,
        end: 300,
        speed: 0.5,
        fps: 5,
        reverse: true,
        boomerang: true,
      }
    )
    // 200 ms kept, 400 ms at half speed, a frame every 200 ms: frames 2 and 4.
    expect(sources(steps)).toEqual([4, 2])
    expect(lengths(steps)).toEqual([200, 200])
  })
})

describe("wholeUnits", () => {
  it("rounds to units and carries the error so the total holds", () => {
    const units = wholeUnits([33.3, 33.3, 33.3, 33.3, 33.3, 33.3], 10)
    expect(units).toEqual([3, 4, 3, 3, 4, 3])
    expect(sum(units) * 10).toBe(200)
  })

  it("keeps every frame at or above the minimum", () => {
    expect(wholeUnits([5, 5, 5, 100], 10, 2)).toEqual([2, 2, 2, 6])
    expect(wholeUnits([0.2, 0.2], 1)).toEqual([1, 1])
  })

  it("leaves whole values alone", () => {
    expect(wholeUnits([80, 120, 40], 1, 11)).toEqual([80, 120, 40])
  })
})

describe("describeTiming", () => {
  it("counts frames, length and average rate", () => {
    expect(describeTiming([100, 100, 50])).toEqual({
      frames: 3,
      duration: 250,
      fps: 12,
    })
    expect(describeTiming([])).toEqual({ frames: 0, duration: 0, fps: 0 })
  })
})
