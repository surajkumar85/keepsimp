import { describe, expect, it } from "vitest"
import { editedBy, untouched } from "./edits"
import { clockLabel, parseClock } from "./labels"
import {
  columnsOf,
  FEWEST_PEAKS,
  MOST_PEAKS,
  peakCount,
  ticksOf,
  windowAround,
} from "./view"

/** Peaks of 10 s at 10 per second: every peak 0.5 high, except 0.9 at 3–4 s. */
function peaks() {
  const min = new Float32Array(100).fill(-0.5)
  const max = new Float32Array(100).fill(0.5)
  for (let at = 30; at < 40; at++) {
    min[at] = -0.9
    max[at] = 0.9
  }
  return { min, max }
}

describe("columnsOf", () => {
  it("shows the source as it is when nothing is edited", () => {
    const shown = columnsOf(peaks(), 10, untouched(10), 0, 10, 10)
    expect(Array.from(shown.max)).toEqual(
      [0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5].map(Math.fround)
    )
    expect(shown.min[3]).toBeCloseTo(-0.9)
  })

  it("closes up what was cut, flattens silence and lowers what was made quieter", () => {
    const edited = editedBy(10, [
      { do: "cut", from: 2, to: 4 },
      { do: "silence", from: 0, to: 1 },
      { do: "gain", from: 5, to: 6, db: -6.0206 },
    ])
    const shown = columnsOf(peaks(), 10, edited, 0, 8, 8)
    expect(shown.max[0]).toBe(0)
    expect(shown.min[0]).toBe(0)
    // 2–3 s of the edited sound is 4–5 s of the source: the loud part is gone.
    expect(shown.max[2]).toBeCloseTo(0.5)
    expect(shown.max[5]).toBeCloseTo(0.25, 2)
  })

  it("draws a column narrower than one peak from the peak under it", () => {
    const shown = columnsOf(peaks(), 10, untouched(10), 3.5, 3.6, 4)
    expect(shown.max[0]).toBeCloseTo(0.9)
  })
})

describe("ticksOf", () => {
  it("marks the ruler at the smallest step that leaves room between marks", () => {
    expect(ticksOf(0, 10, 800)).toEqual({
      step: 1,
      ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    })
    expect(ticksOf(1.05, 1.3, 1000).step).toBe(0.02)
    expect(ticksOf(1.05, 1.3, 1000).ticks[0]).toBe(1.06)
    // Longer than the largest step allows: marks every hour.
    expect(ticksOf(0, 1e6, 100).step).toBe(3600)
  })
})

describe("peakCount and windowAround", () => {
  it("reads a file into 200 peaks a second, within bounds", () => {
    expect(peakCount(1)).toBe(FEWEST_PEAKS)
    expect(peakCount(60)).toBe(12000)
    expect(peakCount(1e6)).toBe(MOST_PEAKS)
  })

  it("keeps a window inside the sound", () => {
    expect(windowAround(5, 2, 10)).toEqual({ from: 4, to: 6 })
    expect(windowAround(0.5, 2, 10)).toEqual({ from: 0, to: 2 })
    expect(windowAround(9.5, 2, 10)).toEqual({ from: 8, to: 10 })
    expect(windowAround(5, 20, 10)).toEqual({ from: 0, to: 10 })
    expect(windowAround(5, 0, 10).to - windowAround(5, 0, 10).from).toBeCloseTo(
      0.01
    )
  })
})

describe("clockLabel and parseClock", () => {
  it("shows a moment to the millisecond", () => {
    expect(clockLabel(7.25)).toBe("0:07.250")
    expect(clockLabel(62.0004)).toBe("1:02.000")
    expect(clockLabel(3723.5)).toBe("1:02:03.500")
    expect(clockLabel(-1)).toBe("0:00.000")
  })

  it("reads what people type as times, and refuses what is not one", () => {
    expect(parseClock("7.25")).toBe(7.25)
    expect(parseClock(" 1:07,5 ")).toBe(67.5)
    expect(parseClock("1:02:03")).toBe(3723)
    expect(parseClock(".5")).toBe(0.5)
    expect(parseClock("12.")).toBe(12)
    expect(parseClock(clockLabel(3723.5))).toBe(3723.5)
    for (const bad of ["", "a", "1:60", "1:2:3:4", "-1", "1.5:20", "1::2"])
      expect(parseClock(bad)).toBeNull()
  })
})
