import { describe, expect, it } from "vitest"
import {
  dbLabel,
  defaultLevel,
  gainFor,
  levelKey,
  levelProblem,
  levelSaid,
  loudnessSaid,
  MOST_RAISE,
  needsMeasure,
  takenOff,
  TARGETS,
  type Level,
  type LevelResult,
} from "./level"
import { SILENT, type Loudness } from "./loudness"

const measured = (integrated: number, truePeak = -3): Loudness => ({
  integrated,
  truePeak,
  peak: truePeak - 0.5,
  range: 5,
})
const level = (change: Partial<Level>): Level => ({
  ...defaultLevel,
  ...change,
})

describe("the figures", () => {
  it("writes decibels with a true minus, and a plus when asked", () => {
    expect(dbLabel(-1)).toBe("−1")
    expect(dbLabel(-14.04)).toBe("−14")
    expect(dbLabel(4.56)).toBe("4.6")
    expect(dbLabel(3, true)).toBe("+3")
    expect(dbLabel(-0.01, true)).toBe("0")
    expect(TARGETS[0]).toMatchObject({ lufs: -14 })
  })

  it("refuses targets, ceilings and boosts out of bounds", () => {
    expect(levelProblem(defaultLevel)).toBeNull()
    expect(levelProblem(level({ mode: "loudness", target: -14 }))).toBeNull()
    expect(levelProblem(level({ mode: "loudness", target: -3 }))).toBe(
      "Choose a loudness from −40 to −5 LUFS."
    )
    expect(
      levelProblem(level({ mode: "loudness", target: NaN }))
    ).not.toBeNull()
    expect(levelProblem(level({ mode: "peak", ceiling: 1 }))).toBe(
      "Choose a peak from −9 to 0 dBTP."
    )
    expect(levelProblem(level({ mode: "louder", louder: 0 }))).toBe(
      "Choose how much louder, up to 30 dB."
    )
    expect(levelProblem(level({ mode: "louder", louder: 31 }))).not.toBeNull()
    expect(levelProblem(level({ mode: "louder", louder: 6 }))).toBeNull()
    // A target out of bounds does not matter when it is not used.
    expect(levelProblem(level({ mode: "peak", target: 99 }))).toBeNull()
  })

  it("names only what changes a result", () => {
    expect(levelKey(level({ target: -20 }))).toBe("same")
    expect(levelKey(level({ mode: "peak", target: -20 }))).toBe(
      levelKey(level({ mode: "peak", target: -14 }))
    )
    expect(levelKey(level({ mode: "loudness", target: -20 }))).not.toBe(
      levelKey(level({ mode: "loudness", target: -14 }))
    )
    expect(levelKey(level({ mode: "louder", louder: 3 }))).not.toBe(
      levelKey(level({ mode: "louder", louder: 4 }))
    )
    expect(needsMeasure(level({ mode: "loudness" }))).toBe(true)
    expect(needsMeasure(level({ mode: "peak" }))).toBe(true)
    expect(needsMeasure(level({ mode: "louder" }))).toBe(false)
    expect(needsMeasure(defaultLevel)).toBe(false)
  })
})

describe("gainFor", () => {
  it("gives a loudness the difference to its target, with the limiter", () => {
    const gain = gainFor(
      level({ mode: "loudness", target: -14 }),
      measured(-20)
    )
    expect(gain.db).toBeCloseTo(6)
    expect(gain.ceiling).toBeCloseTo(10 ** (-1 / 20))
    expect(gain.notes).toEqual([])
  })

  it("raises a very quiet file no more than 30 dB, and says so", () => {
    const gain = gainFor(
      level({ mode: "loudness", target: -14 }),
      measured(-60)
    )
    expect(gain.db).toBe(MOST_RAISE)
    expect(gain.notes[0]).toBe(
      "It would need to be 46 dB louder; it is made 30 dB louder, the most done here, and stays under the target."
    )
  })

  it("leaves silence and what cannot be measured as it is", () => {
    for (const mode of ["loudness", "peak"] as const) {
      expect(gainFor(level({ mode }), measured(SILENT, SILENT))).toMatchObject({
        db: 0,
        ceiling: null,
      })
      expect(gainFor(level({ mode }), null).notes).toHaveLength(1)
    }
  })

  it("takes the highest true peak to the level asked, without a limiter", () => {
    const gain = gainFor(
      level({ mode: "peak", ceiling: -1 }),
      measured(-20, -6)
    )
    expect(gain).toEqual({ db: 5, ceiling: null, notes: [] })
  })

  it("makes louder by the amount asked, limited; and does nothing for the same", () => {
    expect(gainFor(level({ mode: "louder", louder: 9 }), null).db).toBe(9)
    expect(gainFor(defaultLevel, null)).toEqual({
      db: 0,
      ceiling: null,
      notes: [],
    })
  })
})

describe("levelSaid", () => {
  const result = (change: Partial<LevelResult>): LevelResult => ({
    mode: "loudness",
    before: measured(-20),
    db: 6,
    after: measured(-14, -1),
    limited: 0,
    notes: [],
    ...change,
  })

  it("says how much louder, to what, and what the limiter did", () => {
    expect(levelSaid(result({}))).toBe("Made 6 dB louder to −14 LUFS.")
    expect(levelSaid(result({ limited: 2.34 }))).toBe(
      "Made 6 dB louder to −14 LUFS; the limiter took at most 2.3 dB off the loudest moments to keep peaks under the ceiling."
    )
    expect(levelSaid(result({ db: -3.2, mode: "peak" }))).toBe(
      "Made 3.2 dB quieter so its peak is −1 dBTP."
    )
    expect(levelSaid(result({ db: 0.01, mode: "louder" }))).toBe(
      "Its level is left as it is."
    )
    expect(levelSaid(result({ mode: "same", db: 0, compressed: 7.25 }))).toBe(
      "Its level is left as it is. The compressor turned the loudest moments down by up to 7.3 dB."
    )
  })

  it("says a loudness, or that there is none to measure", () => {
    expect(loudnessSaid(measured(-18.26, -0.44))).toBe(
      "−18.3 LUFS · range 5 LU · peaks up to −0.4 dBTP"
    )
    expect(loudnessSaid(measured(SILENT))).toBe(
      "Too quiet or too short to measure"
    )
  })

  it("turns the limiter's lowest gain into decibels taken off", () => {
    expect(takenOff(1)).toBe(0)
    expect(takenOff(0.5)).toBeCloseTo(6.02, 2)
  })
})
