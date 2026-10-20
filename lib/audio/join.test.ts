import { describe, expect, it } from "vitest"
import {
  Joiner,
  joiningProblem,
  joinsFor,
  startsOf,
  straight,
  type Joining,
} from "./join"

const RATE = 100

/** Join constant sounds (1, 2, 3 …) pushed in chunks of `size`, as one array. */
function join(lengths: number[], joining: Joining, size = 7, channels = 1) {
  const joins = joinsFor(lengths, joining)
  const out: number[][] = Array.from({ length: channels }, () => [])
  const joiner = new Joiner(RATE, channels, joins, (planes) =>
    planes.forEach((plane, channel) => out[channel].push(...plane))
  )
  lengths.forEach((seconds, index) => {
    const frames = Math.round(seconds * RATE)
    for (let at = 0; at < frames; at += size) {
      const count = Math.min(size, frames - at)
      joiner.push(
        Array.from({ length: channels }, () =>
          new Float32Array(count).fill(index + 1)
        )
      )
    }
    if (index < lengths.length - 1) joiner.next()
  })
  joiner.finish()
  return { out, joins }
}

describe("joinsFor and startsOf", () => {
  it("puts gaps or crossfades between files, never a crossfade over half a file", () => {
    const joins = joinsFor([10, 1, 10], { gap: 0, crossfade: 2 })
    expect(joins).toEqual([
      straight,
      { gap: 0, crossfade: 0.5 },
      { gap: 0, crossfade: 0.5 },
    ])
    expect(startsOf([10, 1, 10], joins)).toEqual({
      starts: [0, 9.5, 10],
      length: 20,
    })
    const gaps = joinsFor([3, 4], { gap: 1, crossfade: 0 })
    expect(startsOf([3, 4], gaps)).toEqual({ starts: [0, 4], length: 8 })
  })

  it("refuses gaps and crossfades out of bounds, or both at once", () => {
    expect(joiningProblem(straight)).toBeNull()
    expect(joiningProblem({ gap: 11, crossfade: 0 })).toBe(
      "Choose a gap of at most 10 seconds."
    )
    expect(joiningProblem({ gap: 0, crossfade: -1 })).toBe(
      "Choose a crossfade of at most 10 seconds."
    )
    expect(joiningProblem({ gap: 1, crossfade: 1 })).toBe(
      "Choose a gap or a crossfade, not both."
    )
  })
})

describe("Joiner", () => {
  it("joins straight on, every frame in order", () => {
    const { out } = join([0.5, 0.3], straight)
    expect(out[0]).toEqual([...Array(50).fill(1), ...Array(30).fill(2)])
  })

  it("puts silence between, as long as asked", () => {
    const { out } = join([0.2, 0.2], { gap: 0.1, crossfade: 0 }, 3, 2)
    expect(out[1]).toEqual([
      ...Array(20).fill(1),
      ...Array(10).fill(0),
      ...Array(20).fill(2),
    ])
  })

  it("crossfades at equal power, the length shortened by the overlap", () => {
    const { out } = join([1, 1, 1], { gap: 0, crossfade: 0.2 }, 13)
    const joined = out[0]
    expect(joined).toHaveLength(260)
    // Before the first fade, the first sound as it was; after it, the second.
    expect(joined[79]).toBe(1)
    expect(joined[100]).toBe(2)
    // Half way through, both at about 0.71: 1 × 0.71 + 2 × 0.71.
    expect(joined[90]).toBeCloseTo((1 + 2) * Math.SQRT1_2, 1)
    // The same whatever the chunks.
    expect(join([1, 1, 1], { gap: 0, crossfade: 0.2 }, 1000).out[0]).toEqual(
      joined
    )
  })

  it("fades a short file over its own length, and lets out a tail that waits", () => {
    const { out } = join([0.1, 0.04], { gap: 0, crossfade: 1 })
    // Crossfade 0.02 s: 10 + 4 − 2 frames.
    expect(out[0]).toHaveLength(12)
    // A crossfade asked of a joiner given too little of the next sound fades out alone.
    const emitted: number[] = []
    const joiner = new Joiner(
      RATE,
      1,
      [straight, { gap: 0, crossfade: 0.1 }],
      (planes) => emitted.push(...planes[0])
    )
    joiner.push([new Float32Array(20).fill(1)])
    joiner.next()
    joiner.push([new Float32Array(3).fill(2)])
    joiner.finish()
    expect(emitted).toHaveLength(20)
    expect(emitted[19]).toBeLessThan(0.1)
    joiner.push([])
  })

  it("holds back a long crossfade's worth at a real rate", () => {
    const rate = 48000
    const out: number[] = []
    const joins = joinsFor([1, 1], { gap: 0, crossfade: 0.1 })
    const joiner = new Joiner(rate, 1, joins, (planes) =>
      out.push(planes[0].length)
    )
    joiner.push([new Float32Array(rate).fill(1)])
    joiner.next()
    joiner.push([new Float32Array(rate).fill(1)])
    joiner.finish()
    expect(out.reduce((sum, count) => sum + count, 0)).toBe(2 * rate - 4800)
  })

  it("lets out what it held when it is finished early", () => {
    const out: number[] = []
    const joiner = new Joiner(
      RATE,
      1,
      [straight, { gap: 0, crossfade: 0.1 }],
      (planes) => out.push(...planes[0])
    )
    joiner.push([new Float32Array(20).fill(1)])
    joiner.finish()
    expect(out).toHaveLength(20)
  })
})
