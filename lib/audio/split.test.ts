import { describe, expect, it } from "vitest"
import { KEPT_EDGE } from "./silence"
import {
  defaultSplit,
  MOST_PARTS,
  partNames,
  partsOf,
  partStep,
  splitKey,
  splitProblem,
} from "./split"

const pauses = [
  { from: 0, to: 1 },
  { from: 3, to: 5 },
  { from: 7, to: 7.3 },
  { from: 9, to: 10 },
]

describe("partsOf", () => {
  it("splits every few minutes, the last part what is left", () => {
    expect(partsOf({ by: "every", minutes: 1 }, 150, [], [])).toEqual([
      { from: 0, to: 60 },
      { from: 60, to: 120 },
      { from: 120, to: 150 },
    ])
    expect(partsOf(defaultSplit, 100, [], [])).toEqual([{ from: 0, to: 100 }])
  })

  it("splits into equal parts", () => {
    expect(partsOf({ by: "count", parts: 4 }, 10, [], [])).toEqual([
      { from: 0, to: 2.5 },
      { from: 2.5, to: 5 },
      { from: 5, to: 7.5 },
      { from: 7.5, to: 10 },
    ])
  })

  it("splits at markers, in order, leaving out those at the ends or too close", () => {
    expect(partsOf({ by: "marks" }, 10, [6, 2, 0.05, 6.02, 9.98], [])).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 6 },
      { from: 6, to: 10 },
    ])
    expect(partsOf({ by: "marks" }, 10, [], [])).toEqual([{ from: 0, to: 10 }])
  })

  it("splits at the middle of long pauses, or leaves the pauses out", () => {
    expect(
      partsOf({ by: "silence", pause: 1, drop: false }, 10, [], pauses)
    ).toEqual([
      { from: 0, to: 4 },
      { from: 4, to: 10 },
    ])
    const dropped = partsOf(
      { by: "silence", pause: 1, drop: true },
      10,
      [],
      pauses
    )
    expect(dropped[0].from).toBeCloseTo(1 - KEPT_EDGE)
    expect(dropped[0].to).toBeCloseTo(3 + KEPT_EDGE)
    expect(dropped[1].from).toBeCloseTo(5 - KEPT_EDGE)
    expect(dropped[1].to).toBeCloseTo(9 + KEPT_EDGE)
    // No silence at the ends: the parts run to them.
    expect(
      partsOf(
        { by: "silence", pause: 1, drop: true },
        10,
        [],
        [{ from: 3, to: 5 }]
      )
    ).toEqual([
      { from: 0, to: 3 + KEPT_EDGE },
      { from: 5 - KEPT_EDGE, to: 10 },
    ])
  })

  it("makes nothing of nothing, nor of a rule that cannot be used, and stops at the most parts", () => {
    expect(partsOf(defaultSplit, 0, [], [])).toEqual([])
    expect(partsOf({ by: "count", parts: 1 }, 10, [], [])).toEqual([])
    expect(
      partsOf({ by: "every", minutes: 0.1 }, 6 * 60 * 60, [], [])
    ).toHaveLength(MOST_PARTS)
    const silence = Array.from({ length: 600 }, (_, index) => ({
      from: index * 2 + 1,
      to: index * 2 + 1.5,
    }))
    expect(
      partsOf({ by: "silence", pause: 0.5, drop: true }, 1300, [], silence)
    ).toHaveLength(MOST_PARTS)
  })
})

describe("the rest", () => {
  it("refuses rules out of bounds", () => {
    expect(splitProblem(defaultSplit)).toBeNull()
    expect(splitProblem({ by: "every", minutes: 0 })).toBe(
      "Choose from 0.1 to 600 minutes."
    )
    expect(splitProblem({ by: "count", parts: 2.5 })).toBe(
      "Choose from 2 to 500 parts."
    )
    expect(splitProblem({ by: "marks" })).toBeNull()
  })

  it("names the parts, makes their steps and keys", () => {
    expect(partNames("talk", 3)).toEqual([
      "talk - 01",
      "talk - 02",
      "talk - 03",
    ])
    expect(partNames("talk", 120)[0]).toBe("talk - 001")
    expect(partStep({ from: 1, to: 2 })).toEqual({ do: "keep", from: 1, to: 2 })
    expect(splitKey([{ from: 0, to: 1 }])).toBe("[[0,1]]")
  })
})
