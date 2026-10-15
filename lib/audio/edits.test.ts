import { describe, expect, it } from "vitest"
import {
  apply,
  curveValue,
  editedBy,
  editsKey,
  gainAt,
  JOIN_FADE,
  lengthOf,
  outputAt,
  piecesOf,
  sourceAt,
  stepProblem,
  stepSaid,
  untouched,
  type Step,
} from "./edits"

describe("cutting and keeping", () => {
  it("keeps a part, then cuts from what is left, in the times as they stand", () => {
    // Keep 2–8 of 10 s, then cut 1–2 of those 6 s (3–4 of the source).
    const edited = editedBy(10, [
      { do: "keep", from: 2, to: 8 },
      { do: "cut", from: 1, to: 2 },
    ])
    expect(edited.segments).toEqual([
      [2, 3],
      [4, 8],
    ])
    expect(lengthOf(edited)).toBe(5)
    expect(sourceAt(edited, 0)).toBe(2)
    expect(sourceAt(edited, 1.5)).toBe(4.5)
    expect(sourceAt(edited, 99)).toBe(8)
    expect(sourceAt(edited, -1)).toBe(2)
    expect(outputAt(edited, 4.5)).toBe(1.5)
    expect(outputAt(edited, 3.5)).toBeNull()
  })

  it("keeps parts on both sides of an earlier cut, and cuts across two parts", () => {
    const edited = editedBy(10, [
      { do: "cut", from: 4, to: 6 },
      { do: "keep", from: 3, to: 5 },
    ])
    expect(edited.segments).toEqual([
      [3, 4],
      [6, 7],
    ])
    expect(apply(edited, { do: "cut", from: 0.5, to: 1.5 }).segments).toEqual([
      [3, 3.5],
      [6.5, 7],
    ])
  })

  it("maps a stretch of the edited sound onto the source, with progress through it", () => {
    const edited = editedBy(10, [{ do: "cut", from: 4, to: 6 }])
    expect(piecesOf(edited, 3, 5)).toEqual([
      { from: 3, to: 4, p0: 0, p1: 0.5 },
      { from: 6, to: 7, p0: 0.5, p1: 1 },
    ])
    // A stretch inside one part touches only that part.
    expect(piecesOf(edited, 1, 2)).toEqual([{ from: 1, to: 2, p0: 0, p1: 1 }])
  })

  it("an empty sound has nothing to edit", () => {
    expect(untouched(0).segments).toEqual([])
    expect(sourceAt(untouched(0), 1)).toBe(0)
    expect(lengthOf(untouched(0))).toBe(0)
  })
})

describe("loudness", () => {
  it("silences, changes volume and fades, multiplying where they meet", () => {
    const edited = editedBy(10, [
      { do: "silence", from: 1, to: 2 },
      { do: "gain", from: 3, to: 5, db: -6 },
      { do: "gain", from: 4, to: 5, db: -6 },
      { do: "fade", from: 6, to: 8, direction: "in", curve: "linear" },
      { do: "fade", from: 8, to: 10, direction: "out", curve: "linear" },
    ])
    expect(gainAt(edited, 1.5)).toBe(0)
    expect(gainAt(edited, 3.5)).toBeCloseTo(0.501, 3)
    expect(gainAt(edited, 4.5)).toBeCloseTo(0.251, 3)
    expect(gainAt(edited, 6)).toBe(0)
    expect(gainAt(edited, 7)).toBeCloseTo(0.5)
    expect(gainAt(edited, 8.5)).toBeCloseTo(0.75)
    expect(gainAt(edited, 0.5)).toBe(1)
    expect(gainAt(edited, 10)).toBe(1)
  })

  it("keeps a fade's shape across a cut made after it", () => {
    const edited = editedBy(10, [
      { do: "fade", from: 0, to: 10, direction: "in", curve: "linear" },
      { do: "cut", from: 2, to: 8 },
    ])
    // What is left of 0–10 is 0–2 and 8–10: the fade still runs as it did there.
    expect(gainAt(edited, 1)).toBeCloseTo(0.1)
    expect(gainAt(edited, 9)).toBeCloseTo(0.9)
  })

  it("fades a part that spans a join as one fade", () => {
    const edited = editedBy(10, [
      { do: "cut", from: 4, to: 6 },
      { do: "fade", from: 2, to: 6, direction: "out", curve: "linear" },
    ])
    // Output 2–6 is source 2–4 then 6–8: half-way is the join.
    expect(gainAt(edited, 3)).toBeCloseTo(0.75)
    expect(gainAt(edited, 7)).toBeCloseTo(0.25)
  })

  it("fades the ends of kept parts where the source was cut, not at its own ends", () => {
    const edited = editedBy(10, [{ do: "cut", from: 4, to: 6 }])
    expect(gainAt(edited, 4 - JOIN_FADE / 2)).toBeCloseTo(0.5)
    expect(gainAt(edited, 6 + JOIN_FADE / 2)).toBeCloseTo(0.5)
    expect(gainAt(edited, 0)).toBe(1)
    expect(gainAt(edited, 10)).toBe(1)
    expect(gainAt(edited, 5)).toBe(1)
  })

  it("rises along each curve from silence to full", () => {
    for (const curve of ["linear", "power", "s-curve"] as const) {
      expect(curveValue(curve, 0)).toBe(0)
      expect(curveValue(curve, 1)).toBeCloseTo(1)
      expect(curveValue(curve, -1)).toBe(0)
      expect(curveValue(curve, 2)).toBeCloseTo(1)
    }
    expect(curveValue("linear", 0.5)).toBe(0.5)
    expect(curveValue("power", 0.5)).toBeCloseTo(Math.SQRT1_2)
    expect(curveValue("s-curve", 0.5)).toBeCloseTo(0.5)
    expect(curveValue("s-curve", 0.25)).toBeLessThan(0.25)
  })
})

describe("steps that cannot be made", () => {
  it("says why, and leaves the sound as it was", () => {
    const edited = untouched(10)
    const cases: [Step, string][] = [
      [{ do: "cut", from: -1, to: 2 }, "Choose a part inside the sound."],
      [{ do: "cut", from: 2, to: 11 }, "Choose a part inside the sound."],
      [{ do: "cut", from: 2, to: 2 }, "Choose a part of the sound first."],
      [
        { do: "cut", from: 0, to: 10 },
        "Cutting all of it would leave nothing. Choose a part to cut.",
      ],
      [
        { do: "gain", from: 0, to: 1, db: 40 },
        "Choose a change of at most 24 dB either way.",
      ],
    ]
    for (const [step, said] of cases) {
      expect(stepProblem(step, 10)).toBe(said)
      expect(apply(edited, step)).toBe(edited)
    }
    expect(stepProblem({ do: "keep", from: 0, to: 10 }, 10)).toBeNull()
  })
})

describe("words and keys", () => {
  it("says each step, and names the list", () => {
    expect(stepSaid({ do: "keep", from: 1, to: 2.5 })).toBe(
      "Kept 0:01.000–0:02.500"
    )
    expect(stepSaid({ do: "cut", from: 0, to: 1 })).toBe(
      "Cut out 0:00.000–0:01.000"
    )
    expect(stepSaid({ do: "silence", from: 0, to: 1 })).toBe(
      "Silenced 0:00.000–0:01.000"
    )
    expect(
      stepSaid({
        do: "fade",
        from: 0,
        to: 1,
        direction: "in",
        curve: "s-curve",
      })
    ).toBe("Faded in 0:00.000–0:01.000 (S-curve)")
    expect(stepSaid({ do: "gain", from: 0, to: 1, db: 3 })).toBe(
      "Louder by 3 dB, 0:00.000–0:01.000"
    )
    expect(stepSaid({ do: "gain", from: 0, to: 1, db: -3 })).toBe(
      "Quieter by 3 dB, 0:00.000–0:01.000"
    )
    expect(editsKey([])).toBe("[]")
  })
})
