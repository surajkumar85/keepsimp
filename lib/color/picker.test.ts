import { describe, expect, it } from "vitest"
import { hex, parseColor } from "./core"
import {
  clamp,
  hueTrack,
  pickerColor,
  pickerPoint,
  pickerValue,
} from "./picker"

const previous = { hue: 240, saturation: 80, brightness: 30, alpha: 100 }
describe("visual picker coordinates", () => {
  it("reads actual RGB, alpha and the hue of a chromatic color", () => {
    expect(pickerValue("rgb(255 0 0 / .5)", previous)).toEqual({
      hue: 0,
      saturation: 100,
      brightness: 100,
      alpha: 50,
    })
    expect(pickerValue("blue", previous)).toEqual({
      hue: 240,
      saturation: 100,
      brightness: 100,
      alpha: 100,
    })
  })
  it("keeps hue in gray and hue plus saturation at black", () => {
    expect(pickerValue("white", previous)).toEqual({
      ...previous,
      saturation: 0,
      brightness: 100,
    })
    expect(pickerValue("black", previous)).toEqual({
      ...previous,
      brightness: 0,
    })
    const gray = pickerValue("rgb(128 128 128)", previous)
    expect(gray.hue).toBe(240)
    expect(gray.saturation).toBe(0)
    expect(gray.brightness).toBeCloseTo((128 / 255) * 100)
  })
  it("maps pointer positions, clamps captured drags beyond edges and tolerates a zero-size stage", () => {
    expect(pickerPoint(100, 25, 200, 100)).toEqual({
      saturation: 50,
      brightness: 75,
    })
    expect(pickerPoint(-10, -10, 100, 100)).toEqual({
      saturation: 0,
      brightness: 100,
    })
    expect(pickerPoint(300, 300, 200, 200)).toEqual({
      saturation: 100,
      brightness: 0,
    })
    expect(pickerPoint(0, 0, 0, 0)).toEqual({ saturation: 0, brightness: 100 })
  })
  it("serializes known HSV values, preserves opacity and bounds channels", () => {
    expect(
      hex(
        parseColor(
          pickerColor({ hue: 240, saturation: 100, brightness: 100, alpha: 25 })
        )
      )
    ).toBe("#0000ff40")
    expect(
      hex(
        parseColor(
          pickerColor({
            hue: 360,
            saturation: 150,
            brightness: 150,
            alpha: 150,
          })
        )
      )
    ).toBe("#ff0000")
    expect(
      hex(
        parseColor(
          pickerColor({
            hue: -10,
            saturation: -10,
            brightness: -10,
            alpha: -10,
          })
        )
      )
    ).toBe("#00000000")
    expect(clamp(45)).toBe(45)
    expect(clamp(400, 360)).toBe(360)
    expect(hueTrack).toContain("hsl(0 100% 50%)")
    expect(hueTrack).toContain("hsl(360 100% 50%)")
  })
  it("never mutates a wide-gamut source while reading its preview", () => {
    const source = "color(display-p3 0 1 0 / .75)"
    const result = pickerValue(source, previous)
    expect(result.alpha).toBe(75)
    expect(result.brightness).toBeLessThanOrEqual(100)
    expect(parseColor(source).space.id).toBe("p3")
  })
})
