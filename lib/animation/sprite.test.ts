import { describe, expect, it } from "vitest"
import {
  cellOf,
  composeSheet,
  sheetLayout,
  spriteCss,
  spriteJson,
} from "./sprite"
import type { Frame } from "./types"

const frame = (
  width: number,
  height: number,
  level: number,
  duration = 100
): Frame => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++)
    data.set([level, level, level, 255], i * 4)
  return { data, width, height, duration }
}

describe("sheetLayout", () => {
  it("arranges frames in a grid close to square", () => {
    expect(sheetLayout(20, 224, 150, 8192)).toEqual({
      columns: 4,
      rows: 5,
      width: 224,
      height: 150,
      sheetWidth: 896,
      sheetHeight: 750,
    })
    // Tall frames get more columns than rows.
    expect(sheetLayout(12, 50, 200, 8192)).toMatchObject({
      columns: 7,
      rows: 2,
    })
    expect(sheetLayout(1, 64, 48, 8192)).toMatchObject({ columns: 1, rows: 1 })
    expect(sheetLayout(3, 100, 100, 8192)).toMatchObject({
      columns: 2,
      rows: 2,
    })
  })

  it("uses fewer columns when the sheet would be too wide", () => {
    expect(sheetLayout(100, 1000, 10, 4000)).toMatchObject({
      columns: 1,
      rows: 100,
      sheetWidth: 1000,
      sheetHeight: 1000,
    })
    expect(sheetLayout(9, 300, 300, 700)).toBeNull()
    expect(sheetLayout(4, 300, 300, 700)).toMatchObject({ columns: 2, rows: 2 })
  })

  it("says when no sheet can hold the frames", () => {
    expect(sheetLayout(0, 10, 10, 8192)).toBeNull()
    expect(sheetLayout(2, 9000, 10, 8192)).toBeNull()
    expect(sheetLayout(500, 1000, 1000, 8192)).toBeNull()
  })
})

describe("composeSheet", () => {
  it("draws frames left to right, top to bottom", () => {
    const layout = sheetLayout(3, 2, 1, 8192)!
    expect([layout.columns, layout.rows]).toEqual([2, 2])
    expect(cellOf(layout, 0)).toEqual({ x: 0, y: 0 })
    expect(cellOf(layout, 1)).toEqual({ x: 2, y: 0 })
    expect(cellOf(layout, 2)).toEqual({ x: 0, y: 1 })
    const sheet = composeSheet(
      [frame(2, 1, 10), frame(2, 1, 20), frame(2, 1, 30)],
      layout
    )
    expect([sheet.width, sheet.height]).toEqual([4, 2])
    const reds = Array.from({ length: 8 }, (_, index) => sheet.data[index * 4])
    expect(reds).toEqual([10, 10, 20, 20, 30, 30, 0, 0])
    // The unused cell stays clear.
    expect(sheet.data[7 * 4 + 3]).toBe(0)
  })
})

describe("spriteJson", () => {
  it("lists each frame's place and time", () => {
    const frames = [
      frame(8, 4, 0, 100),
      frame(8, 4, 0, 33.3333),
      frame(8, 4, 0, 50),
    ]
    const layout = sheetLayout(3, 8, 4, 8192)!
    const data = JSON.parse(spriteJson(frames, layout, "sprite.png", 0))
    expect(data.frames).toEqual([
      { frame: { x: 0, y: 0, w: 8, h: 4 }, duration: 100 },
      { frame: { x: 8, y: 0, w: 8, h: 4 }, duration: 33.333 },
      { frame: { x: 0, y: 4, w: 8, h: 4 }, duration: 50 },
    ])
    expect(data.meta).toMatchObject({
      image: "sprite.png",
      size: { w: 16, h: 8 },
      frameSize: { w: 8, h: 4 },
      plays: 0,
    })
  })
})

describe("spriteCss", () => {
  it("gives each frame a keyframe at the moment it starts", () => {
    const frames = [
      frame(10, 10, 0, 100),
      frame(10, 10, 0, 300),
      frame(10, 10, 0, 100),
    ]
    const layout = sheetLayout(3, 10, 10, 8192)!
    const css = spriteCss(frames, layout, "sprite.webp", 0)
    expect(css).toContain("width: 10px;")
    expect(css).toContain(
      'background: url("sprite.webp") 0 0 / 20px 20px no-repeat;'
    )
    expect(css).toContain("animation: sprite-play 0.5s step-end infinite;")
    expect(css).toContain("  0% { background-position: 0 0; }")
    expect(css).toContain("  20% { background-position: -10px 0; }")
    expect(css).toContain("  80% { background-position: 0 -10px; }")
    expect(css).toContain("prefers-reduced-motion: reduce")
  })

  it("plays a set number of times, and copes with frames of no length", () => {
    const layout = sheetLayout(2, 4, 4, 8192)!
    expect(
      spriteCss([frame(4, 4, 0), frame(4, 4, 0)], layout, "s.png", 3)
    ).toContain("0.2s step-end 3;")
    const still = spriteCss(
      [frame(4, 4, 0, 0), frame(4, 4, 0, 0)],
      layout,
      "s.png",
      1
    )
    expect(still).toContain("  0% { background-position: -4px 0; }")
    expect(still).toContain("sprite-play 0s step-end 1;")
  })
})
