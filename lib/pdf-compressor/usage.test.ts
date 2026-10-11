import { describe, expect, it } from "vitest"
import { drawnSize, largest, resolution, sizeFor } from "./usage"

describe("drawnSize", () => {
  it("reads the size straight off an upright picture", () => {
    expect(drawnSize([400, 0, 0, 300, 50, 142])).toEqual({
      width: 400,
      height: 300,
    })
  })

  it("measures a turned picture along its own sides", () => {
    const size = drawnSize([0, 300, -400, 0, 0, 0])
    expect(size).toEqual({ width: 300, height: 400 })
  })

  it("measures a skewed picture by the length of each side", () => {
    expect(drawnSize([30, 40, 0, 10, 0, 0])).toEqual({ width: 50, height: 10 })
  })
})

describe("largest", () => {
  it("takes the first use as it is", () => {
    expect(largest(undefined, { width: 10, height: 20 })).toEqual({
      width: 10,
      height: 20,
    })
  })

  it("keeps the larger of each side", () => {
    expect(
      largest({ width: 100, height: 20 }, { width: 40, height: 60 })
    ).toEqual({ width: 100, height: 60 })
  })
})

describe("resolution", () => {
  it("counts pixels per inch along the less detailed side", () => {
    // 144 pixels over one inch across, 72 over one inch down.
    expect(
      resolution({ width: 144, height: 72 }, { width: 72, height: 72 })
    ).toBe(72)
    expect(
      resolution({ width: 72, height: 144 }, { width: 72, height: 72 })
    ).toBe(72)
  })

  it("cannot judge a picture drawn almost to nothing", () => {
    expect(
      resolution({ width: 100, height: 100 }, { width: 0.5, height: 50 })
    ).toBeNull()
    expect(
      resolution({ width: 100, height: 100 }, { width: 50, height: 0 })
    ).toBeNull()
  })
})

describe("sizeFor", () => {
  const pixels = { width: 2000, height: 1500 }

  it("brings a picture down to the wanted pixels per inch", () => {
    // 400 points is 5.56 inches: 360 dpi down to 150.
    expect(sizeFor(pixels, { width: 400, height: 300 }, 150, 1.25)).toEqual({
      width: 833,
      height: 625,
    })
  })

  it("leaves a picture that is only a little over", () => {
    // 2000 pixels over 11.1 inches is 180 dpi, within a quarter of 150.
    expect(sizeFor(pixels, { width: 800, height: 600 }, 150, 1.25)).toBeNull()
    expect(sizeFor(pixels, { width: 4000, height: 3000 }, 150, 1.25)).toBeNull()
  })

  it("leaves a picture nothing is known about", () => {
    expect(sizeFor(pixels, null, 150, 1.25)).toBeNull()
    expect(sizeFor(pixels, { width: 0, height: 0 }, 150, 1.25)).toBeNull()
  })

  it("never goes below one pixel a side", () => {
    // 216 dpi down to 10: a width of 3 pixels would round to none.
    expect(
      sizeFor({ width: 3, height: 3000 }, { width: 1, height: 1000 }, 10, 1)
    ).toEqual({ width: 1, height: 139 })
  })
})
