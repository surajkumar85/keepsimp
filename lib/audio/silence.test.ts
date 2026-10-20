import { describe, expect, it } from "vitest"
import { editedBy, lengthOf, untouched } from "./edits"
import {
  KEPT_EDGE,
  KEPT_PAUSE,
  shortenPauses,
  silentRuns,
  trimEnds,
} from "./silence"

/** Peaks of 10 s at 200 a second: loud from 1 to 3 s and from 5.5 to 9 s, quiet hiss elsewhere. */
function peaks() {
  const min = new Float32Array(2000).fill(-0.001)
  const max = new Float32Array(2000).fill(0.001)
  for (const [from, to] of [
    [1, 3],
    [5.5, 9],
  ]) {
    for (let index = from * 200; index < to * 200; index++) {
      min[index] = -0.5
      max[index] = 0.5
    }
  }
  return { min, max }
}

describe("silentRuns", () => {
  it("finds the quiet stretches long enough, under the level", () => {
    const runs = silentRuns(peaks(), 10, untouched(10), -50, 0.5)
    expect(
      runs.map((run) =>
        [run.from, run.to].map((t) => Math.round(t * 100) / 100)
      )
    ).toEqual([
      [0, 1],
      [3, 5.5],
      [9, 10],
    ])
    // Hiss at −60 dBFS is not silent under −70; nothing is short of a minute.
    expect(silentRuns(peaks(), 10, untouched(10), -70, 0.5)).toEqual([])
    expect(silentRuns(peaks(), 10, untouched(10), -50, 60)).toEqual([])
  })

  it("follows the edits: what was cut is gone, what was silenced is silent", () => {
    const edited = editedBy(10, [
      { do: "cut", from: 0, to: 1 },
      { do: "silence", from: 0, to: 2 },
    ])
    const runs = silentRuns(peaks(), 10, edited, -50, 0.5)
    // 0–2 s of the edited sound is source 1–3, silenced: one pause to 4.5 s.
    expect(runs[0].from).toBe(0)
    expect(runs[0].to).toBeCloseTo(4.5, 1)
    expect(lengthOf(edited)).toBe(9)
  })
})

describe("trimEnds and shortenPauses", () => {
  const runs = silentRuns(peaks(), 10, untouched(10), -50, 0.5)

  it("keeps the sound between the silent ends, with a little of each", () => {
    const step = trimEnds(runs, 10)!
    expect(step.do).toBe("keep")
    expect(step.from).toBeCloseTo(1 - KEPT_EDGE, 2)
    expect(step.to).toBeCloseTo(9 + KEPT_EDGE, 2)
    // Silent only at the start, or nowhere at the ends.
    expect(trimEnds([{ from: 0, to: 2 }], 10)).toMatchObject({
      from: 2 - KEPT_EDGE,
      to: 10,
    })
    expect(trimEnds([{ from: 3, to: 4 }], 10)).toBeNull()
    expect(trimEnds([], 10)).toBeNull()
    // All silent: nothing would be left to keep.
    expect(trimEnds([{ from: 0, to: 10 }], 10)).toBeNull()
  })

  it("shortens the long pauses inside, last first, and says how much went", () => {
    const { steps, removed } = shortenPauses(runs, 10, 1)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ do: "cut" })
    expect(steps[0].from).toBeCloseTo(3 + KEPT_PAUSE / 2, 2)
    expect(steps[0].to).toBeCloseTo(5.5 - KEPT_PAUSE / 2, 2)
    expect(removed).toBeCloseTo(2.5 - KEPT_PAUSE, 2)
    const edited = editedBy(10, steps)
    expect(lengthOf(edited)).toBeCloseTo(10 - removed, 5)
    // Two pauses: the later is cut first, so the earlier's times still hold.
    const two = shortenPauses(
      [
        { from: 2, to: 4 },
        { from: 6, to: 8 },
      ],
      10,
      1
    )
    expect(two.steps.map((step) => step.from)).toEqual([6.2, 2.2])
    // Nothing longer than asked; and a pause just over too short to cut.
    expect(shortenPauses(runs, 10, 5).steps).toEqual([])
    expect(shortenPauses([{ from: 2, to: 2.402 }], 10, 0.4).steps).toEqual([])
  })
})
