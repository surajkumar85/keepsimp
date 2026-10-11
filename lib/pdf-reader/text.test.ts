import { describe, expect, it } from "vitest"
import {
  lineQuad,
  placeLine,
  plainText,
  quadBox,
  stretch,
  type Quad,
  type TextLine,
} from "./text"

/** A level box: left, top, width, height. */
const level = (left: number, top: number, width: number, height: number) =>
  [
    left,
    top,
    left + width,
    top,
    left,
    top + height,
    left + width,
    top + height,
  ] as unknown as Quad

const line = (quad: Quad, text = "words", size = 12): TextLine => ({
  text,
  quad,
  size,
})

describe("lineQuad", () => {
  it("runs from the first letter's left side to the last letter's right side", () => {
    expect(lineQuad(level(10, 20, 6, 12), level(90, 20, 8, 12))).toEqual(
      level(10, 20, 88, 12)
    )
  })
})

describe("placeLine", () => {
  it("places a level line at its upper left corner", () => {
    expect(placeLine(line(level(56, 80, 213, 38)))).toEqual({
      left: 56,
      top: 80,
      length: 213,
      height: 38,
      angle: 0,
    })
  })

  it("turns a line that runs down the page", () => {
    // Read from top to bottom: "up" for its letters is to the right.
    const down = [100, 50, 100, 250, 88, 50, 88, 250] as unknown as Quad
    expect(placeLine(line(down))).toEqual({
      left: 100,
      top: 50,
      length: 200,
      height: 12,
      angle: 90,
    })
  })

  it("turns a line that runs up the page", () => {
    const up = [100, 250, 100, 50, 112, 250, 112, 50] as unknown as Quad
    const placed = placeLine(line(up))
    expect(placed.angle).toBe(-90)
    expect(placed.length).toBe(200)
    expect(placed.height).toBe(12)
  })

  it("keeps a slanted line's own angle and length", () => {
    const slanted = [0, 0, 30, 40, -8, 6, 22, 46] as unknown as Quad
    const placed = placeLine(line(slanted))
    expect(placed.length).toBeCloseTo(50)
    expect(placed.height).toBeCloseTo(10)
    expect(placed.angle).toBeCloseTo(53.13, 2)
  })

  it("calls a line level when it is off by rounding only", () => {
    const nearly = [0, 10, 100, 10.00001, 0, 22, 100, 22] as unknown as Quad
    expect(placeLine(line(nearly)).angle).toBe(0)
  })
})

describe("stretch", () => {
  it("makes the browser's letters end where the page's do", () => {
    expect(stretch(100, 150)).toBe(1.5)
    expect(stretch(200, 100)).toBe(0.5)
  })

  it("leaves alone what cannot be measured", () => {
    expect(stretch(0, 100)).toBe(1)
    expect(stretch(100, 0)).toBe(1)
  })

  it("never stretches beyond reason", () => {
    expect(stretch(1, 1000)).toBe(20)
    expect(stretch(1000, 1)).toBe(0.05)
  })
})

describe("quadBox", () => {
  it("is the quad itself when level", () => {
    expect(quadBox(level(10, 20, 30, 40))).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    })
  })

  it("surrounds a turned quad", () => {
    expect(
      quadBox([100, 50, 100, 250, 88, 50, 88, 250] as unknown as Quad)
    ).toEqual({ left: 88, top: 50, width: 12, height: 200 })
  })
})

describe("plainText", () => {
  it("joins lines, dropping empty ones and space at the ends", () => {
    expect(
      plainText([
        line(level(0, 0, 1, 1), "First line  "),
        line(level(0, 0, 1, 1), "   "),
        line(level(0, 0, 1, 1), "Second"),
      ])
    ).toBe("First line\nSecond")
  })

  it("is empty for a page without text", () => {
    expect(plainText([])).toBe("")
  })
})
