import { describe, expect, it, vi } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { nearest } from "./canvas"
import { CENTER } from "./focus"
import { render, type RenderDeps } from "./pipeline"
import {
  defaultSettings,
  planOutputs,
  type Backdrop,
  type ResizerSettings,
} from "./settings"

/** 8×4 image: left half red, right half blue. */
const source: Pixels = {
  width: 8,
  height: 4,
  data: new Uint8ClampedArray(
    Array.from({ length: 32 }, (_, i) =>
      i % 8 < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]
    ).flat()
  ),
}
const pixel = (image: Pixels, x: number, y: number) =>
  Array.from(
    image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4
    )
  )

function setup() {
  const resize = vi.fn<RenderDeps["resize"]>(async (pixels, size) =>
    nearest(pixels, size)
  )
  return { deps: { resize }, resize }
}
const plan = (change: Partial<ResizerSettings>, focus = CENTER) =>
  planOutputs({ ...defaultSettings, ...change }, { size: source, focus })
    .plans[0]
const upright = { rotation: 0 as const, flipX: false, flipY: false }
const white: Backdrop = { kind: "colour", rgb: [255, 255, 255] }

describe("render", () => {
  it("returns the source untouched when nothing changes", async () => {
    const { deps, resize } = setup()
    const out = await render(source, upright, plan({ width: "8" }), white, deps)
    expect([out.width, out.height]).toEqual([8, 4])
    expect(resize).not.toHaveBeenCalled()
  })

  it("resamples with the planned kernel", async () => {
    const { deps, resize } = setup()
    const out = await render(source, upright, plan({ width: "4" }), white, deps)
    expect([out.width, out.height]).toEqual([4, 2])
    expect(resize).toHaveBeenCalledWith(
      expect.anything(),
      { width: 4, height: 2 },
      "lanczos3"
    )
  })

  it("uses nearest neighbour without the resampler", async () => {
    const { deps, resize } = setup()
    const out = await render(
      source,
      upright,
      plan({ width: "16", kernel: "nearest" }),
      white,
      deps
    )
    expect(out.width).toBe(16)
    expect(resize).not.toHaveBeenCalled()
  })

  it("crops around the focus and applies rotation", async () => {
    const { deps } = setup()
    const left = await render(
      source,
      upright,
      plan({ width: "4", height: "4" }, { x: 0, y: 0.5 }),
      white,
      deps
    )
    expect(pixel(left, 3, 0)).toEqual([255, 0, 0, 255])
    const right = await render(
      source,
      upright,
      plan({ width: "4", height: "4" }, { x: 1, y: 0.5 }),
      white,
      deps
    )
    expect(pixel(right, 0, 0)).toEqual([0, 0, 255, 255])
    const turned = await render(
      source,
      { rotation: 90, flipX: false, flipY: false },
      plan({ width: "4", rotation: 90 }),
      white,
      deps
    )
    expect([turned.width, turned.height]).toEqual([4, 8])
    expect(pixel(turned, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(turned, 0, 7)).toEqual([0, 0, 255, 255])
  })

  it("sharpens reductions", async () => {
    const { deps } = setup()
    // Mid greys, so the extra edge contrast is not clipped at 0 or 255.
    const grey: Pixels = {
      width: 8,
      height: 4,
      data: new Uint8ClampedArray(
        Array.from({ length: 32 }, (_, i) =>
          i % 8 < 4 ? [100, 100, 100, 255] : [180, 180, 180, 255]
        ).flat()
      ),
    }
    const soft = await render(grey, upright, plan({ width: "4" }), white, deps)
    const sharp = await render(
      grey,
      upright,
      plan({ width: "4", sharpen: "strong" }),
      white,
      deps
    )
    expect(pixel(soft, 1, 0)[0]).toBe(100)
    expect(pixel(sharp, 1, 0)[0]).toBeLessThan(100)
    expect(pixel(sharp, 2, 0)[0]).toBeGreaterThan(180)
  })

  it("pads with a colour, transparency or a blurred copy", async () => {
    const { deps, resize } = setup()
    const contain = plan({ width: "8", height: "8", fit: "contain" })
    const coloured = await render(
      source,
      upright,
      contain,
      { kind: "colour", rgb: [0, 255, 0] },
      deps
    )
    expect([coloured.width, coloured.height]).toEqual([8, 8])
    expect(pixel(coloured, 0, 0)).toEqual([0, 255, 0, 255])
    expect(pixel(coloured, 0, 3)).toEqual([255, 0, 0, 255])
    const clear = await render(
      source,
      upright,
      contain,
      { kind: "transparent" },
      deps
    )
    expect(pixel(clear, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(clear, 7, 4)).toEqual([0, 0, 255, 255])
    resize.mockClear()
    const blurred = await render(
      source,
      upright,
      contain,
      { kind: "blur" },
      deps
    )
    expect(pixel(blurred, 0, 0)[3]).toBe(255)
    expect(pixel(blurred, 0, 0)).not.toEqual([0, 0, 0, 255])
    expect(pixel(blurred, 7, 4)).toEqual([0, 0, 255, 255])
    expect(resize.mock.calls.map((call) => call[2])).toEqual([
      "triangle",
      "triangle",
    ])
  })

  it("shrinks large canvases before blurring", async () => {
    const { deps, resize } = setup()
    const big = planOutputs(
      { ...defaultSettings, width: "400", height: "400", fit: "contain" },
      { size: source, focus: CENTER }
    ).plans[0]
    const out = await render(source, upright, big, { kind: "blur" }, deps)
    expect([out.width, out.height]).toEqual([400, 400])
    expect(resize.mock.calls[1][1]).toEqual({ width: 64, height: 64 })
  })
})
