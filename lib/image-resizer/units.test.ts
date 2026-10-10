import { describe, expect, it } from "vitest"
import {
  formatValue,
  fromPixels,
  isPhysical,
  megapixelScale,
  printLength,
  roundTo,
  toPixels,
} from "./units"

describe("unit conversion", () => {
  it("converts every unit to pixels", () => {
    expect(toPixels(640, "px", 300, 1000)).toBe(640)
    expect(toPixels(25, "percent", 300, 1000)).toBe(250)
    expect(toPixels(4, "in", 300, 0)).toBe(1200)
    expect(toPixels(2.54, "cm", 300, 0)).toBeCloseTo(300)
    expect(toPixels(25.4, "mm", 96, 0)).toBeCloseTo(96)
  })

  it("converts pixels back to each unit", () => {
    expect(fromPixels(640, "px", 300, 1000)).toBe(640)
    expect(fromPixels(250, "percent", 300, 1000)).toBe(25)
    expect(fromPixels(1200, "in", 300, 0)).toBe(4)
    expect(fromPixels(300, "cm", 300, 0)).toBeCloseTo(2.54)
    expect(fromPixels(96, "mm", 96, 0)).toBeCloseTo(25.4)
  })

  it("formats values for input fields", () => {
    expect(formatValue(1199.6, "px")).toBe("1200")
    expect(formatValue(10.16, "cm")).toBe("10.16")
    expect(formatValue(4, "in")).toBe("4")
    expect(formatValue(101.64, "mm")).toBe("101.6")
    expect(formatValue(33.333, "percent")).toBe("33.3")
  })

  it("knows which units need a print resolution", () => {
    expect(["in", "cm", "mm"].map((unit) => isPhysical(unit as "in"))).toEqual([
      true,
      true,
      true,
    ])
    expect(isPhysical("px")).toBe(false)
    expect(isPhysical("percent")).toBe(false)
  })

  it("scales to a megapixel count and rounds to multiples", () => {
    const scale = megapixelScale({ width: 4000, height: 3000 }, 3)
    expect(4000 * scale * 3000 * scale).toBeCloseTo(3_000_000)
    expect(roundTo(1001, 2)).toBe(1002)
    expect(roundTo(1003, 8)).toBe(1000)
    expect(roundTo(3, 8)).toBe(8)
    expect(roundTo(0.2, 1)).toBe(1)
  })

  it("reports print sizes", () => {
    expect(printLength(1200, 300, "in")).toBe(4)
    expect(printLength(1200, 300, "cm")).toBe(10.16)
    expect(printLength(1200, 300, "mm")).toBe(102)
  })
})
