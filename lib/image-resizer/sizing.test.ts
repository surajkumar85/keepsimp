import { describe, expect, it } from "vitest"
import { CENTER } from "./focus"
import {
  resolveLayout,
  scaleTarget,
  shiftFocus,
  type FitMode,
  type SizeTarget,
} from "./sizing"

const landscape = { width: 4000, height: 3000 }
const portrait = { width: 3000, height: 4000 }
const options = { enlarge: true, multiple: 1 as const, focus: CENTER }
const box = (width: number, height: number, fit: FitMode): SizeTarget => ({
  kind: "box",
  width,
  height,
  fit,
})

describe("proportional sizes", () => {
  it.each<[SizeTarget, number, number]>([
    [{ kind: "width", pixels: 800 }, 800, 600],
    [{ kind: "height", pixels: 300 }, 400, 300],
    [{ kind: "longest", pixels: 2000 }, 2000, 1500],
    [{ kind: "shortest", pixels: 1500 }, 2000, 1500],
    [{ kind: "percent", percent: 25 }, 1000, 750],
    [{ kind: "megapixels", megapixels: 3 }, 2000, 1500],
  ])("resolves %o", (target, width, height) => {
    const layout = resolveLayout(landscape, target, options)
    expect(layout.output).toEqual({ width, height })
    expect(layout.sourceRect).toEqual({ x: 0, y: 0, ...landscape })
    expect(layout.drawRect).toEqual({ x: 0, y: 0, width, height })
    expect(layout).toMatchObject({
      padded: false,
      cropped: false,
      enlarged: false,
    })
  })

  it("uses the longer or shorter side of portraits too", () => {
    expect(
      resolveLayout(portrait, { kind: "longest", pixels: 2000 }, options).output
    ).toEqual({ width: 1500, height: 2000 })
    expect(
      resolveLayout(portrait, { kind: "shortest", pixels: 300 }, options).output
    ).toEqual({ width: 300, height: 400 })
  })

  it("enlarges only when allowed", () => {
    const target: SizeTarget = { kind: "width", pixels: 8000 }
    expect(resolveLayout(landscape, target, options)).toMatchObject({
      output: { width: 8000, height: 6000 },
      enlarged: true,
    })
    expect(
      resolveLayout(landscape, target, { ...options, enlarge: false })
    ).toMatchObject({ output: landscape, enlarged: false, scale: 1 })
  })

  it("rounds to the requested multiple", () => {
    expect(
      resolveLayout(
        landscape,
        { kind: "percent", percent: 25.03 },
        { ...options, multiple: 2 }
      ).output
    ).toEqual({ width: 1002, height: 750 })
    expect(
      resolveLayout(
        landscape,
        { kind: "width", pixels: 1003 },
        { ...options, multiple: 8 }
      ).output
    ).toEqual({ width: 1000, height: 752 })
  })

  it.each<[SizeTarget, string]>([
    [{ kind: "percent", percent: 0 }, "percentage"],
    [{ kind: "megapixels", megapixels: -1 }, "megapixels"],
    [{ kind: "width", pixels: NaN }, "size above zero"],
    [box(0, 100, "cover"), "width and height"],
    [box(100, Infinity, "cover"), "width and height"],
    [{ kind: "width", pixels: 20000 }, "16,383"],
  ])("rejects %o", (target, message) => {
    expect(() => resolveLayout(landscape, target, options)).toThrow(message)
  })
})

describe("box fits", () => {
  it("crops to fill around the focus", () => {
    const centre = resolveLayout(landscape, box(1000, 1000, "cover"), options)
    expect(centre).toMatchObject({
      output: { width: 1000, height: 1000 },
      sourceRect: { x: 500, y: 0, width: 3000, height: 3000 },
      cropped: true,
      padded: false,
    })
    const left = resolveLayout(landscape, box(1000, 1000, "cover"), {
      ...options,
      focus: { x: 0, y: 0 },
    })
    expect(left.sourceRect.x).toBe(0)
    const right = resolveLayout(portrait, box(1000, 500, "cover"), {
      ...options,
      focus: { x: 1, y: 1 },
    })
    expect(right.sourceRect).toEqual({
      x: 0,
      y: 2500,
      width: 3000,
      height: 1500,
    })
  })

  it("does not crop when the shape already matches", () => {
    expect(
      resolveLayout(landscape, box(800, 600, "cover"), options)
    ).toMatchObject({
      sourceRect: { x: 0, y: 0, ...landscape },
      cropped: false,
    })
  })

  it("crops without enlarging small images", () => {
    const layout = resolveLayout(
      { width: 400, height: 300 },
      box(1000, 1000, "cover"),
      {
        ...options,
        enlarge: false,
      }
    )
    expect(layout).toMatchObject({
      output: { width: 400, height: 300 },
      scale: 1,
      enlarged: false,
    })
  })

  it("pads to the frame and aligns by focus", () => {
    const layout = resolveLayout(landscape, box(1000, 1000, "contain"), options)
    expect(layout).toMatchObject({
      output: { width: 1000, height: 1000 },
      drawRect: { x: 0, y: 125, width: 1000, height: 750 },
      sourceRect: { x: 0, y: 0, ...landscape },
      padded: true,
    })
    expect(
      resolveLayout(landscape, box(1000, 1000, "contain"), {
        ...options,
        focus: { x: 0.5, y: 0 },
      }).drawRect.y
    ).toBe(0)
    expect(
      resolveLayout(landscape, box(800, 600, "contain"), options).padded
    ).toBe(false)
    expect(
      resolveLayout({ width: 100, height: 100 }, box(400, 400, "contain"), {
        ...options,
        enlarge: false,
      }).drawRect
    ).toEqual({ x: 150, y: 150, width: 100, height: 100 })
  })

  it("fits inside or covers at least without cropping", () => {
    expect(
      resolveLayout(landscape, box(1000, 1000, "inside"), options).output
    ).toEqual({ width: 1000, height: 750 })
    expect(
      resolveLayout(landscape, box(1000, 1000, "outside"), options).output
    ).toEqual({ width: 1333, height: 1000 })
  })

  it("stretches, optionally without enlarging", () => {
    expect(
      resolveLayout(landscape, box(500, 2000, "stretch"), options)
    ).toMatchObject({
      output: { width: 500, height: 2000 },
      enlarged: false,
    })
    expect(
      resolveLayout(landscape, box(8000, 100, "stretch"), options).enlarged
    ).toBe(true)
    expect(
      resolveLayout(landscape, box(8000, 100, "stretch"), {
        ...options,
        enlarge: false,
      }).output
    ).toEqual({ width: 4000, height: 100 })
  })
})

describe("dragging and responsive sets", () => {
  it("moves a crop against the drag direction", () => {
    const layout = resolveLayout(landscape, box(1000, 1000, "cover"), options)
    expect(shiftFocus(layout, landscape, 100, 0).x).toBeCloseTo(0.2)
    expect(shiftFocus(layout, landscape, -9999, 0).x).toBe(1)
    expect(shiftFocus(layout, landscape, 0, 50).y).toBe(0.5)
  })

  it("moves a padded image with the drag", () => {
    const layout = resolveLayout(landscape, box(1000, 1000, "contain"), options)
    expect(shiftFocus(layout, landscape, 0, -125)).toEqual({ x: 0.5, y: 0 })
    expect(shiftFocus(layout, landscape, 0, 9999).y).toBe(1)
    const plain = resolveLayout(
      landscape,
      { kind: "width", pixels: 800 },
      options
    )
    expect(shiftFocus(plain, landscape, 10, 10)).toEqual({ x: 0.5, y: 0.5 })
  })

  it("scales targets to each width of a set", () => {
    expect(scaleTarget(box(1200, 630, "cover"), 600)).toEqual(
      box(600, 315, "cover")
    )
    expect(scaleTarget(box(1200, 630, "inside"), 600)).toEqual({
      kind: "width",
      pixels: 600,
    })
    expect(scaleTarget(box(1200, 630, "outside"), 600)).toEqual({
      kind: "width",
      pixels: 600,
    })
    expect(scaleTarget({ kind: "percent", percent: 50 }, 640)).toEqual({
      kind: "width",
      pixels: 640,
    })
    expect(scaleTarget(box(1000, 1, "contain"), 100)).toEqual(
      box(100, 1, "contain")
    )
  })
})
