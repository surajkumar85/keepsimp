import { describe, expect, it } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import type { CaptionLayout } from "./effects"
import { decorate, type ConvertDeps } from "./pipeline"
import { defaultSettings, type AnimationSettings } from "./settings"
import type { Frame } from "./types"

const WIDTH = 10
const HEIGHT = 10

const flat = (level: number, width = WIDTH, height = HEIGHT): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4)
    data.set([level, level, level, 255], i)
  return { data, width, height }
}
const frames = (levels: number[], duration = 100): Frame[] =>
  levels.map((level) => ({ ...flat(level), duration }))
const at = (image: Pixels, x: number, y: number) => [
  ...image.data.subarray(
    (y * image.width + x) * 4,
    (y * image.width + x) * 4 + 3
  ),
]
const make = (change: Partial<AnimationSettings>): AnimationSettings => ({
  ...defaultSettings,
  ...change,
})

/** Text is a band along the top row, the bottom row, or both. */
function fakeDeps() {
  const calls = {
    captions: [] as CaptionLayout[],
    resize: [] as string[],
    progress: [] as string[],
    checkpoints: 0,
  }
  const deps = {
    renderCaption: async (layout: CaptionLayout) => {
      calls.captions.push(layout)
      const data = new Uint8ClampedArray(layout.width * layout.height * 4)
      for (let x = 0; x < layout.width; x++) {
        if (layout.top) data.set([...layout.colour, 255], x * 4)
        if (layout.bottom)
          data.set(
            [...layout.colour, 255],
            ((layout.height - 1) * layout.width + x) * 4
          )
      }
      return { data, width: layout.width, height: layout.height }
    },
    resize: async (
      pixels: Pixels,
      size: { width: number; height: number },
      kernel: string
    ) => {
      calls.resize.push(`${size.width}x${size.height} ${kernel}`)
      // An ImageData-like result: only its three fields may be relied on.
      return Object.assign(Object.create({ colorSpace: "srgb" }), {
        ...flat(pixels.data[0], size.width, size.height),
      }) as Pixels
    },
    checkpoint: async () => void calls.checkpoints++,
    progress: (label: string) => void calls.progress.push(label),
  } as unknown as ConvertDeps
  return { deps, calls }
}

describe("decorate", () => {
  it("hands the frames back untouched when nothing is asked for", async () => {
    const { deps, calls } = fakeDeps()
    const input = frames([10, 20])
    const before = [...input]
    const result = await decorate(input, make({}), null, deps)
    expect(result).toBe(input)
    expect(result).toEqual(before)
    expect(result[0]).toBe(before[0])
    expect(calls.progress).toEqual([])
    expect(calls.captions).toEqual([])
  })

  it("changes colours once for each distinct picture", async () => {
    const { deps, calls } = fakeDeps()
    const input = frames([10, 200])
    // A held frame: the same picture shown again.
    input.push({ ...input[0], duration: 300 })
    const originals = input.map((frame) => frame.data)
    const result = await decorate(input, make({ filter: "invert" }), null, deps)
    // The list itself is filled with the results, so the originals can be let go.
    expect(result).toBe(input)
    expect(result.map((frame) => at(frame, 0, 0))).toEqual([
      [245, 245, 245],
      [55, 55, 55],
      [245, 245, 245],
    ])
    expect(result.map((frame) => frame.duration)).toEqual([100, 100, 300])
    expect(result[2].data).toBe(result[0].data)
    // The original pictures themselves are not written on.
    expect(originals[0][0]).toBe(10)
    expect(calls.progress).toEqual(["Adding text and effects…"])
    // One pause per distinct picture.
    expect(calls.checkpoints).toBe(2)
  })

  it("paints the logo at its size, place and opacity", async () => {
    const { deps, calls } = fakeDeps()
    const small = flat(255, 2, 2)
    const result = await decorate(
      frames([0, 0]),
      make({
        overlayCorner: "bottom-right",
        overlaySize: 50,
        overlayOpacity: 50,
      }),
      small,
      deps
    )
    // Half of a 10 px frame, enlarged from 2 px, so with the smooth filter.
    expect(calls.resize).toEqual(["5x5 mitchell"])
    // There is no margin on so small a frame: the logo fills the corner.
    expect(at(result[0], 9, 9)).toEqual([128, 128, 128])
    expect(at(result[0], 5, 5)).toEqual([128, 128, 128])
    expect(at(result[0], 4, 4)).toEqual([0, 0, 0])
    expect(at(result[1], 9, 9)).toEqual([128, 128, 128])

    const large = fakeDeps()
    await decorate(
      frames([0]),
      make({ overlaySize: 20 }),
      flat(255, 40, 20),
      large.deps
    )
    expect(large.calls.resize).toEqual(["2x1 lanczos3"])
  })

  it("puts the logo over adjusted colours, not under them", async () => {
    const { deps } = fakeDeps()
    const [result] = await decorate(
      frames([0]),
      make({
        filter: "invert",
        overlayCorner: "top-left",
        overlaySize: 50,
        overlayOpacity: 100,
      }),
      flat(40, 1, 1),
      deps
    )
    expect(at(result, 0, 0)).toEqual([40, 40, 40])
    expect(at(result, 9, 9)).toEqual([255, 255, 255])
  })

  it("writes captions over the frames their times cover", async () => {
    const { deps, calls } = fakeDeps()
    // One picture held for four steps, as a slowed-down animation has.
    const [picture] = frames([0])
    const result = await decorate(
      [picture, picture, picture, picture],
      make({
        captionTop: "hello",
        captionBottom: "world",
        captionSize: "large",
        captionColour: "custom",
        captionCustomColour: "#ff0000",
        captionUppercase: true,
        captionFrom: 0.1,
        captionUntil: 0.3,
      }),
      null,
      deps
    )
    expect(calls.captions).toEqual([
      {
        width: 10,
        height: 10,
        fontSize: 8,
        margin: 2,
        colour: [255, 0, 0],
        // Red is dark enough to need a light line around it.
        outline: [255, 255, 255],
        top: "HELLO",
        bottom: "WORLD",
      },
    ])
    expect(result.map((frame) => at(frame, 3, 0))).toEqual([
      [0, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      [0, 0, 0],
    ])
    expect(at(result[1], 3, 9)).toEqual([255, 0, 0])
    expect(at(result[1], 3, 5)).toEqual([0, 0, 0])
    // Frames with the same picture and the same text share one result.
    expect(result[2].data).toBe(result[1].data)
    expect(result[3].data).toBe(result[0].data)
  })

  it("fades in from and out to black in shared steps", async () => {
    const { deps } = fakeDeps()
    const input = frames(Array.from({ length: 10 }, () => 200))
    const originals = input.map((frame) => frame.data)
    const result = await decorate(
      input,
      make({ fadeIn: 0.4, fadeOut: 0.2 }),
      null,
      deps
    )
    expect(result.map((frame) => frame.data[0])).toEqual([
      0, 50, 100, 150, 200, 200, 200, 200, 100, 0,
    ])
    // Untouched frames are the picture itself.
    expect(result[5].data).toBe(originals[5])
  })

  it("shares faded pictures between steps of a held frame, there and back", async () => {
    const { deps } = fakeDeps()
    const [picture] = frames([200])
    const [other] = frames([100])
    // A boomerang: the first picture comes round again at the end.
    const result = await decorate(
      [picture, other, other, picture],
      make({ fadeIn: 0.1, fadeOut: 0.1 }),
      null,
      deps
    )
    expect(result.map((frame) => frame.data[0])).toEqual([0, 100, 100, 0])
    expect(result[3].data).toBe(result[0].data)
    expect(result[2].data).toBe(result[1].data)
    expect(result[1].data).toBe(other.data)
  })

  it("fades to the background colour when one is chosen, with text and logo fading too", async () => {
    const { deps } = fakeDeps()
    const result = await decorate(
      frames([0, 0, 0]),
      make({
        fadeIn: 0.2,
        background: "white",
        captionTop: "hi",
        captionColour: "black",
      }),
      null,
      deps
    )
    expect(result.map((frame) => at(frame, 0, 5))).toEqual([
      [255, 255, 255],
      [128, 128, 128],
      [0, 0, 0],
    ])
    // The text is as faded as the picture under it.
    expect(at(result[0], 0, 0)).toEqual([255, 255, 255])
    expect(at(result[2], 0, 0)).toEqual([0, 0, 0])
  })
})
