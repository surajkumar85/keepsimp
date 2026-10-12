import { describe, expect, it } from "vitest"
import {
  labelPlace,
  lengthOf,
  measured,
  measureTicks,
  MEASURE_TICK,
} from "./measure"

const at = (x: number, y: number) => ({ x, y })

describe("measuring a line", () => {
  it("gives its length in every unit", () => {
    const inch = [at(0, 0), at(72, 0)] as const
    expect(measured(...inch, "in", 1)).toBe("1 in")
    expect(measured(...inch, "pt", 1)).toBe("72 pt")
    expect(measured(...inch, "mm", 1)).toBe("25.4 mm")
    expect(measured(...inch, "cm", 1)).toBe("2.54 cm")
    expect(measured(...inch, "m", 1)).toBe("0.03 m")
    expect(measured(at(0, 0), at(0, 864), "ft", 1)).toBe("1 ft")
    expect(lengthOf(at(0, 0), at(3, 4))).toBe(5)
  })

  it("gives as many decimals as the number is worth", () => {
    expect(measured(at(0, 0), at(10, 0), "mm", 1)).toBe("3.53 mm")
    expect(measured(at(0, 0), at(100, 0), "mm", 1)).toBe("35.3 mm")
    expect(measured(at(0, 0), at(500, 0), "mm", 1)).toBe("176 mm")
    expect(measured(at(0, 0), at(0, 0), "cm", 1)).toBe("0 cm")
  })

  it("measures a drawing by its scale", () => {
    // One to fifty: a centimetre on the page is half a metre in the world.
    const centimetre = 72 / 2.54
    expect(measured(at(0, 0), at(centimetre, 0), "m", 50)).toBe("0.5 m")
    expect(measured(at(0, 0), at(centimetre * 4, 0), "mm", 50)).toBe("2,000 mm")
  })
})

describe("drawing a measuring line", () => {
  it("puts a mark across each end", () => {
    expect(measureTicks(at(10, 20), at(110, 20))).toEqual([
      [at(10, 20 - MEASURE_TICK), at(10, 20 + MEASURE_TICK)],
      [at(110, 20 - MEASURE_TICK), at(110, 20 + MEASURE_TICK)],
    ])
    const [[up, down]] = measureTicks(at(0, 0), at(0, 50))
    expect(up.x).toBeCloseTo(MEASURE_TICK)
    expect(down.x).toBeCloseTo(-MEASURE_TICK)
    expect(measureTicks(at(5, 5), at(5, 5))).toEqual([])
  })

  it("turns the label with the line, and never upside down", () => {
    expect(labelPlace(at(0, 0), at(100, 0))).toEqual({
      middle: at(50, 0),
      angle: 0,
    })
    expect(labelPlace(at(0, 0), at(100, 100)).angle).toBeCloseTo(45)
    // Standing upright it is read from below, whichever end it began at.
    expect(labelPlace(at(0, 0), at(0, 100)).angle).toBeCloseTo(-90)
    // Running leftwards, it is read from the other end.
    expect(labelPlace(at(100, 0), at(0, 0)).angle).toBe(0)
    expect(labelPlace(at(100, 100), at(0, 0)).angle).toBeCloseTo(45)
    expect(labelPlace(at(0, 0), at(-100, 100)).angle).toBeCloseTo(-45)
    expect(labelPlace(at(0, 100), at(0, 0)).angle).toBeCloseTo(-90)
    expect(labelPlace(at(0, 0), at(-100, -1)).angle).toBeCloseTo(0.57, 1)
  })
})
