import { describe, expect, it } from "vitest"
import { ByteWriter, ascii, u16be, u16le, u24le, u32be, u32le } from "./bytes"
import { Compositor } from "./compose"
import { changedRect, cropPixels, evenRect, settle } from "./delta"
import type { Patch } from "./types"

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const CLEAR = [0, 0, 0, 0]

const fill = (width: number, height: number, colour: number[]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(colour, i * 4)
  return data
}
const patch = (change: Partial<Patch> = {}): Patch => ({
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  duration: 100,
  dispose: "none",
  blend: "source",
  ...change,
})
const pixel = (
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number
) => [...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]

describe("ByteWriter", () => {
  it("writes numbers both ways round and reads them back", () => {
    const bytes = new ByteWriter()
      .ascii("AB")
      .u8(0x1ff)
      .u16le(0x1234)
      .u24le(0x123456)
      .u32le(0xfedcba98)
      .u16be(0x1234)
      .u32be(0xfedcba98)
      .bytes(Uint8Array.of(9))
      .bytes([7])
    expect(bytes.length).toBe(20)
    const out = bytes.finish()
    expect([...out]).toEqual([
      0x41, 0x42, 0xff, 0x34, 0x12, 0x56, 0x34, 0x12, 0x98, 0xba, 0xdc, 0xfe,
      0x12, 0x34, 0xfe, 0xdc, 0xba, 0x98, 9, 7,
    ])
    expect(ascii(out, 0, 2)).toBe("AB")
    expect(u16le(out, 3)).toBe(0x1234)
    expect(u24le(out, 5)).toBe(0x123456)
    expect(u32le(out, 8)).toBe(0xfedcba98)
    expect(u16be(out, 12)).toBe(0x1234)
    expect(u32be(out, 14)).toBe(0xfedcba98)
  })
})

describe("Compositor", () => {
  it("starts clear and draws a patch where it belongs", () => {
    const compositor = new Compositor(4, 2)
    const canvas = compositor.draw(patch({ x: 2 }), fill(2, 2, RED))
    expect(pixel(canvas.data, 4, 0, 0)).toEqual(CLEAR)
    expect(pixel(canvas.data, 4, 2, 1)).toEqual(RED)
    expect(canvas).toBe(compositor.canvas)
  })

  it("leaves a patch in place when it asks for nothing", () => {
    const compositor = new Compositor(4, 2)
    compositor.draw(patch(), fill(2, 2, RED))
    const canvas = compositor.draw(patch({ x: 2 }), fill(2, 2, BLUE))
    expect(pixel(canvas.data, 4, 0, 0)).toEqual(RED)
    expect(pixel(canvas.data, 4, 3, 1)).toEqual(BLUE)
  })

  it("clears a patch that asks for the background", () => {
    const compositor = new Compositor(4, 2)
    compositor.draw(patch({ dispose: "background" }), fill(2, 2, RED))
    const canvas = compositor.draw(patch({ x: 2 }), fill(2, 2, BLUE))
    expect(pixel(canvas.data, 4, 0, 0)).toEqual(CLEAR)
    expect(pixel(canvas.data, 4, 2, 0)).toEqual(BLUE)
  })

  it("puts back what a patch covered when it asks for the previous picture", () => {
    const compositor = new Compositor(4, 2)
    compositor.draw(patch({ width: 4 }), fill(4, 2, RED))
    const during = compositor.draw(
      patch({ x: 1, width: 2, dispose: "previous" }),
      fill(2, 2, BLUE)
    )
    expect(pixel(during.data, 4, 1, 0)).toEqual(BLUE)
    const after = compositor.draw(patch({ x: 3, width: 1 }), fill(1, 2, BLUE))
    expect(pixel(after.data, 4, 1, 0)).toEqual(RED)
    expect(pixel(after.data, 4, 2, 1)).toEqual(RED)
    expect(pixel(after.data, 4, 3, 1)).toEqual(BLUE)
  })

  it("paints over what is there, mixing soft pixels", () => {
    const compositor = new Compositor(2, 1)
    compositor.draw(patch({ height: 1 }), fill(2, 1, RED))
    const top = new Uint8ClampedArray([0, 0, 255, 128, 0, 0, 0, 0])
    const canvas = compositor.draw(patch({ height: 1, blend: "over" }), top)
    // Half blue over solid red; a clear pixel changes nothing.
    expect(pixel(canvas.data, 2, 0, 0)).toEqual([127, 0, 128, 255])
    expect(pixel(canvas.data, 2, 1, 0)).toEqual(RED)
  })

  it("mixes soft pixels over a clear canvas without darkening them", () => {
    const compositor = new Compositor(1, 1)
    const canvas = compositor.draw(
      patch({ width: 1, height: 1, blend: "over" }),
      new Uint8ClampedArray([0, 0, 255, 128])
    )
    expect(pixel(canvas.data, 1, 0, 0)).toEqual([0, 0, 255, 128])
  })

  it("replaces soft pixels outright when a patch is the source", () => {
    const compositor = new Compositor(1, 1)
    compositor.draw(patch({ width: 1, height: 1 }), fill(1, 1, RED))
    const canvas = compositor.draw(
      patch({ width: 1, height: 1 }),
      new Uint8ClampedArray([0, 0, 255, 128])
    )
    expect(pixel(canvas.data, 1, 0, 0)).toEqual([0, 0, 255, 128])
  })

  it("keeps the part of a patch that hangs off the canvas out of the picture", () => {
    const compositor = new Compositor(2, 2)
    const data = fill(3, 3, BLUE)
    data.set(RED, 4 * 4)
    // The patch starts one pixel up and left, so its centre lands at 0, 0.
    const canvas = compositor.draw(
      patch({ x: -1, y: -1, width: 3, height: 3, dispose: "background" }),
      data
    )
    expect(pixel(canvas.data, 2, 0, 0)).toEqual(RED)
    expect(pixel(canvas.data, 2, 1, 1)).toEqual(BLUE)
    const next = compositor.draw(
      patch({ x: 5, y: 5, dispose: "previous" }),
      fill(2, 2, RED)
    )
    expect(pixel(next.data, 2, 0, 0)).toEqual(CLEAR)
  })
})

describe("frame differences", () => {
  const frame = (colour: number[]) => ({
    data: fill(4, 3, colour),
    width: 4,
    height: 3,
  })

  it("finds the smallest rectangle around what changed", () => {
    const before = frame(RED)
    const after = frame(RED)
    after.data.set(BLUE, (1 * 4 + 1) * 4)
    after.data.set(BLUE, (2 * 4 + 3) * 4)
    expect(changedRect(before, after)).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 2,
    })
    expect(changedRect(before, frame(RED))).toBeNull()
  })

  it("ignores changes within the tolerance, in any channel", () => {
    const before = frame([100, 100, 100, 255])
    for (const colour of [
      [104, 100, 100, 255],
      [100, 96, 100, 255],
      [100, 100, 104, 255],
      [100, 100, 100, 251],
    ]) {
      expect(changedRect(before, frame(colour), 4)).toBeNull()
      expect(changedRect(before, frame(colour), 3)).toEqual({
        x: 0,
        y: 0,
        width: 4,
        height: 3,
      })
    }
  })

  it("moves a rectangle to even coordinates by growing it", () => {
    expect(evenRect({ x: 3, y: 5, width: 2, height: 2 })).toEqual({
      x: 2,
      y: 4,
      width: 3,
      height: 3,
    })
    expect(evenRect({ x: 2, y: 4, width: 2, height: 2 })).toEqual({
      x: 2,
      y: 4,
      width: 2,
      height: 2,
    })
  })

  it("copies a rectangle out of a frame", () => {
    const source = frame(RED)
    source.data.set(BLUE, (1 * 4 + 2) * 4)
    const cut = cropPixels(source, { x: 2, y: 1, width: 2, height: 2 })
    expect([cut.width, cut.height]).toEqual([2, 2])
    expect(pixel(cut.data, 2, 0, 0)).toEqual(BLUE)
    expect(pixel(cut.data, 2, 1, 1)).toEqual(RED)
  })

  it("marks unchanged pixels and remembers the changed ones", () => {
    const reference = frame([100, 100, 100, 255])
    const after = frame([102, 100, 100, 255])
    after.data.set(BLUE, (1 * 4 + 1) * 4)
    const unchanged = settle(
      reference,
      after,
      { x: 1, y: 1, width: 2, height: 1 },
      4
    )
    expect([...unchanged]).toEqual([0, 1])
    expect(pixel(reference.data, 4, 1, 1)).toEqual(BLUE)
    // A pixel within the tolerance keeps its remembered colour, so slow drift cannot build up.
    expect(pixel(reference.data, 4, 2, 1)).toEqual([100, 100, 100, 255])
  })
})
