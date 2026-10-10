import { describe, expect, it } from "vitest"
import { lzw } from "@/lib/image-converter/encoders/gif"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  buildApngIndexed,
  buildGif,
  buildWebp,
  hasClearPixels,
  sampleFrames,
  type Palette,
} from "./build"
import { ByteWriter } from "./bytes"
import { pngChunk, pngSignature } from "./decoders/apng"
import { readApng } from "./decoders/apng"
import { decodeGifFrame, readGif, unlzw } from "./decoders/gif"
import { readWebp, riffChunk, webpFile } from "./decoders/webp"
import { retimeGif, writeGif } from "./encoders/gif"
import { convertAnimation, gatherFrames, type ConvertDeps } from "./pipeline"
import { defaultSettings, noTrim } from "./settings"
import {
  identify,
  NOT_ANIMATED,
  openAnimation,
  UNSUPPORTED,
  type Source,
} from "./source"
import type { Colour, Frame } from "./types"

const GREY: Colour[] = Array.from({ length: 4 }, (_, level) => [
  level * 85,
  level * 85,
  level * 85,
  255,
])

/** Colours are matched by their red channel; nothing is compressed. */
function fakeDeps(colours: Colour[] = GREY) {
  const calls = {
    palette: [] as number[],
    remap: [] as boolean[],
    webp: [] as { lossless: boolean; quality: number; pixels: number }[],
    resize: [] as string[],
    gifski: 0,
    progress: [] as string[],
    freed: 0,
  }
  const palette: Palette = {
    colours,
    remap(pixels, dithering) {
      calls.remap.push(dithering)
      const indices = new Uint8Array(pixels.width * pixels.height)
      for (let i = 0; i < indices.length; i++) {
        const alpha = pixels.data[i * 4 + 3]
        const clear = colours.findIndex((colour) => colour[3] === 0)
        indices[i] =
          alpha < 128 && clear >= 0
            ? clear
            : Math.min(3, Math.round(pixels.data[i * 4] / 85))
      }
      return indices
    },
    free: () => void calls.freed++,
  }
  const deps: ConvertDeps = {
    palette: async (_sample, count) => {
      calls.palette.push(count)
      return palette
    },
    encodeWebp: async (pixels, options) => {
      calls.webp.push({ ...options, pixels: pixels.width * pixels.height })
      // Lossless output is smaller for flat patches (low red), larger otherwise.
      const flat = pixels.data[0] < 128
      const size = options.lossless ? (flat ? 2 : 9) : 5
      const body = new ByteWriter()
      riffChunk(body, options.lossless ? "VP8L" : "VP8 ", new Uint8Array(size))
      return webpFile(body.finish())
    },
    deflate: async (bytes) => bytes,
    gifski: async (frames) => {
      calls.gifski++
      return writeGif({
        width: frames[0].width,
        height: frames[0].height,
        palette: GREY,
        plays: 0,
        images: frames.map((frame) => ({
          x: 0,
          y: 0,
          width: frame.width,
          height: frame.height,
          indices: new Uint8Array(frame.width * frame.height),
          delay: 1,
          dispose: "none" as const,
          transparent: null,
        })),
      })
    },
    resize: async (pixels, size, kernel) => {
      calls.resize.push(kernel)
      if (size.width === pixels.width && size.height === pixels.height)
        return pixels
      // Nearest neighbour is enough to check sizes and order.
      const data = new Uint8ClampedArray(size.width * size.height * 4)
      for (let y = 0; y < size.height; y++)
        for (let x = 0; x < size.width; x++) {
          const from =
            (Math.floor((y * pixels.height) / size.height) * pixels.width +
              Math.floor((x * pixels.width) / size.width)) *
            4
          data.set(
            pixels.data.subarray(from, from + 4),
            (y * size.width + x) * 4
          )
        }
      return { data, ...size }
    },
    checkpoint: async () => {},
    progress: (label) => void calls.progress.push(label),
  }
  return { deps, calls }
}

const solid = (width: number, height: number, level: number, alpha = 255) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++)
    data.set([level, level, level, alpha], i * 4)
  return { data, width, height }
}
const frame = (pixels: Pixels, duration = 100): Frame => ({
  ...pixels,
  duration,
})

/** A source of flat frames, one grey level each. */
function source(levels: number[], size = { width: 4, height: 2 }): Source {
  return {
    format: "gif",
    ...size,
    plays: 0,
    durations: levels.map(() => 100),
    async *frames() {
      const canvas = solid(size.width, size.height, 0)
      for (const level of levels) {
        for (let i = 0; i < canvas.data.length; i += 4)
          canvas.data.set([level, level, level, 255], i)
        yield canvas
      }
    },
  }
}

describe("identify and openAnimation", () => {
  const gif = (frames: number) =>
    writeGif({
      width: 1,
      height: 1,
      palette: GREY,
      plays: 0,
      images: Array.from({ length: frames }, () => ({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        indices: Uint8Array.of(1),
        delay: 5,
        dispose: "none" as const,
        transparent: null,
      })),
    })

  it("tells animations from stills and from other files", () => {
    expect(identify(gif(2))).toEqual({ format: "gif" })
    expect(identify(gif(1))).toEqual({ problem: NOT_ANIMATED })
    // A JPEG is an image we know, just not one that moves.
    expect(identify(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16))).toEqual({
      problem: NOT_ANIMATED,
    })
    expect(
      identify(Uint8Array.from("plain text", (c) => c.charCodeAt(0)))
    ).toEqual({
      problem: UNSUPPORTED,
    })
    expect(() => openAnimation(gif(1), fakeDeps().deps as never)).toThrow(
      NOT_ANIMATED
    )
  })

  it("treats 'restore previous' on the first frame as clearing", async () => {
    const out = pngSignature(new ByteWriter())
    pngChunk(
      out,
      "IHDR",
      new ByteWriter().u32be(1).u32be(1).bytes([8, 6, 0, 0, 0]).finish()
    )
    pngChunk(out, "acTL", new ByteWriter().u32be(2).u32be(0).finish())
    const control = (dispose: number) =>
      new ByteWriter()
        .u32be(0)
        .u32be(1)
        .u32be(1)
        .u32be(0)
        .u32be(0)
        .u16be(1)
        .u16be(10)
        .u8(dispose)
        .u8(1)
        .finish()
    pngChunk(out, "fcTL", control(2))
    pngChunk(out, "IDAT", Uint8Array.of(1))
    pngChunk(out, "fcTL", control(0))
    pngChunk(out, "fdAT", Uint8Array.of(0, 0, 0, 1, 2))
    const bytes = out.finish()
    expect(identify(bytes)).toEqual({ format: "apng" })
    const opened = openAnimation(bytes, {
      // First frame red and half see-through, second fully clear.
      decodeStill: async (format, png) => ({
        data: new Uint8ClampedArray(
          Buffer.from(png).includes(Buffer.from([0x49, 0x44, 0x41, 0x54, 1]))
            ? [255, 0, 0, 128]
            : [0, 0, 0, 0]
        ),
        width: 1,
        height: 1,
      }),
    })
    expect(opened.durations).toEqual([100, 100])
    const seen: number[][] = []
    for await (const canvas of opened.frames()) seen.push([...canvas.data])
    // The first frame was cleared, not "put back", so the second shows nothing.
    expect(seen).toEqual([
      [255, 0, 0, 128],
      [0, 0, 0, 0],
    ])
  })

  it("opens an animated WebP through the still decoder", async () => {
    const body = new ByteWriter()
    riffChunk(body, "VP8X", Uint8Array.of(0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    for (const value of [10, 20]) {
      const part = new ByteWriter().bytes(new Uint8Array(12)).u24le(30).u8(0x02)
      riffChunk(part, "VP8L", Uint8Array.of(value))
      riffChunk(body, "ANMF", part.finish())
    }
    const opened = openAnimation(webpFile(body.finish()), {
      decodeStill: async (format, webp) => ({
        data: new Uint8ClampedArray([webp[webp.length - 2], 0, 0, 255]),
        width: 1,
        height: 1,
      }),
    })
    expect(opened.format).toBe("webp")
    const seen: number[] = []
    for await (const canvas of opened.frames()) seen.push(canvas.data[0])
    expect(seen).toEqual([10, 20])
  })
})

describe("gatherFrames", () => {
  it("reads only the frames the result needs, and stops after the last one", async () => {
    const { deps, calls } = fakeDeps()
    const frames = await gatherFrames(
      source([0, 85, 170, 255]),
      { ...defaultSettings, reverse: true },
      { start: 100, end: 300 },
      deps
    )
    expect(frames.map((item) => item.data[0])).toEqual([170, 85])
    expect(frames.map((item) => item.duration)).toEqual([100, 100])
    expect(calls.resize).toEqual(["lanczos3", "lanczos3"])
    expect(calls.progress).toEqual([
      "Reading frame 1 of 3",
      "Reading frame 2 of 3",
      "Reading frame 3 of 3",
    ])
  })

  it("turns, fills the background and enlarges with a smooth filter", async () => {
    const { deps, calls } = fakeDeps()
    const clear: Source = {
      ...source([0]),
      async *frames() {
        yield solid(4, 2, 0, 0)
      },
    }
    const [only] = await gatherFrames(
      clear,
      {
        ...defaultSettings,
        rotation: 90,
        background: "black",
        resize: "percent",
        resizeValue: 200,
      },
      noTrim,
      deps
    )
    expect([only.width, only.height]).toEqual([4, 8])
    expect([...only.data.subarray(0, 4)]).toEqual([0, 0, 0, 255])
    expect(calls.resize).toEqual(["mitchell"])
  })

  it("refuses a result that would not fit in memory", async () => {
    const big = source(
      Array.from({ length: 60 }, () => 0),
      {
        width: 1920,
        height: 1080,
      }
    )
    await expect(
      gatherFrames(big, defaultSettings, noTrim, fakeDeps().deps)
    ).rejects.toThrow(
      /60 frames at 1920 × 1080 is more than this tool can hold/
    )
  })
})

describe("convertAnimation", () => {
  it("reports what it made", async () => {
    const { deps } = fakeDeps()
    const result = await convertAnimation(
      source([0, 85, 170]),
      {
        ...defaultSettings,
        target: "gif",
        loop: "count",
        loopCount: 3,
        speed: 2,
      },
      noTrim,
      deps
    )
    expect(result).toMatchObject({
      width: 4,
      height: 2,
      frames: 3,
      duration: 150,
      plays: 3,
      note: null,
    })
    expect(readGif(result.bytes).plays).toBe(3)
  })

  it("uses each writer for its format", async () => {
    for (const [change, check] of [
      [
        { target: "webp" },
        (bytes: Uint8Array) => readWebp(bytes).frames.length,
      ],
      [
        { target: "apng", quality: "lossless" },
        (bytes: Uint8Array) => readApng(bytes).frames.length,
      ],
      [
        { target: "apng", quality: "balanced" },
        (bytes: Uint8Array) => readApng(bytes).frames.length,
      ],
      [
        { target: "gif", gifEngine: "best" },
        (bytes: Uint8Array) => readGif(bytes).frames.length,
      ],
    ] as const) {
      const { deps } = fakeDeps()
      const result = await convertAnimation(
        source([0, 85, 170]),
        { ...defaultSettings, ...change },
        noTrim,
        deps
      )
      expect(check(result.bytes), JSON.stringify(change)).toBe(3)
    }
  })

  it("keeps gifski's own timing when it merged frames", async () => {
    const { deps } = fakeDeps()
    deps.gifski = async () =>
      retimeGif(
        writeGif({
          width: 4,
          height: 2,
          palette: GREY,
          plays: 0,
          images: [
            {
              x: 0,
              y: 0,
              width: 4,
              height: 2,
              indices: new Uint8Array(8),
              delay: 30,
              dispose: "none",
              transparent: null,
            },
          ],
        }),
        0,
        null
      )
    const result = await convertAnimation(
      source([0, 0]),
      { ...defaultSettings, target: "gif", gifEngine: "best", loop: "once" },
      noTrim,
      deps
    )
    const file = readGif(result.bytes)
    expect(file.plays).toBe(1)
    expect(file.frames.map((item) => item.duration)).toEqual([300])
  })
})

describe("buildGif", () => {
  const options = { colours: 256, dithering: true, tolerance: 0 }

  it("asks for one colour fewer than GIF holds, and frees the palette", async () => {
    const { deps, calls } = fakeDeps()
    await buildGif([frame(solid(2, 2, 0))], 0, options, deps)
    expect(calls.palette).toEqual([255])
    expect(calls.freed).toBe(1)
    await buildGif(
      [frame(solid(2, 2, 0))],
      0,
      { ...options, colours: 16 },
      deps
    )
    expect(calls.palette).toEqual([255, 16])
  })

  it("stores only the changed patch, with unchanged pixels left clear", async () => {
    const { deps } = fakeDeps()
    const second = solid(4, 2, 0)
    second.data.set([255, 255, 255, 255], (1 * 4 + 1) * 4)
    second.data.set([255, 255, 255, 255], (1 * 4 + 3) * 4)
    const bytes = await buildGif(
      [frame(solid(4, 2, 0)), frame(second, 60)],
      0,
      options,
      deps
    )
    const file = readGif(bytes)
    expect(file.frames[1]).toMatchObject({
      x: 1,
      y: 1,
      width: 3,
      height: 1,
      duration: 60,
      dispose: "none",
      transparent: 4,
    })
    expect([...unlzw(bytes, file.frames[1].data, 3)]).toEqual([3, 4, 3])
    // The first frame is whole and has no clear colour.
    expect(file.frames[0].transparent).toBeNull()
  })

  it("holds a frame longer instead of repeating it, up to GIF's limit", async () => {
    const { deps } = fakeDeps()
    const still = solid(2, 2, 85)
    const bytes = await buildGif(
      [
        frame(still, 400_000),
        frame(still, 400_000),
        frame(solid(2, 2, 170), 50),
      ],
      0,
      options,
      deps
    )
    const file = readGif(bytes)
    expect(file.frames.map((item) => item.duration)).toEqual([655_350, 50])
  })

  it("draws see-through animations whole, clearing between frames", async () => {
    const { deps } = fakeDeps([...GREY.slice(0, 3), [0, 0, 0, 0]])
    const first = solid(2, 1, 85)
    first.data[7] = 0
    const second = solid(2, 1, 170)
    second.data[3] = 100
    const bytes = await buildGif(
      [frame(first), frame(second)],
      0,
      options,
      deps
    )
    const file = readGif(bytes)
    expect(
      file.frames.map((item) => [item.width, item.dispose, item.transparent])
    ).toEqual([
      [2, "background", 3],
      [2, "background", 3],
    ])
    expect([...decodeGifFrame(bytes, file.frames[0])]).toEqual([
      85, 85, 85, 255, 0, 0, 0, 0,
    ])
    // A faint pixel becomes clear: GIF pixels are there or not.
    expect(decodeGifFrame(bytes, file.frames[1])[3]).toBe(0)
  })

  it("turns faint palette colours into the clear one", async () => {
    const { deps } = fakeDeps([
      [0, 0, 0, 255],
      [85, 85, 85, 100],
      [170, 170, 170, 255],
      [255, 255, 255, 255],
    ])
    const bytes = await buildGif([frame(solid(1, 1, 85))], 0, options, deps)
    const file = readGif(bytes)
    // Index 1 is faint, so the pixel is written with the added clear entry.
    expect([...unlzw(bytes, file.frames[0].data, 1)]).toEqual([4])
    expect(lzw(Uint8Array.of(4), 3).length).toBeGreaterThan(0)
  })
})

describe("buildWebp", () => {
  const lossy = { quality: 70, lossless: false, mixed: false, tolerance: 0 }

  it("writes changed patches on even pixels and holds still frames", async () => {
    const { deps, calls } = fakeDeps()
    const second = solid(6, 4, 0)
    second.data.set([255, 0, 0, 255], (3 * 6 + 3) * 4)
    const bytes = await buildWebp(
      [frame(solid(6, 4, 0)), frame(solid(6, 4, 0)), frame(second, 5)],
      2,
      lossy,
      deps
    )
    const file = readWebp(bytes)
    expect(file.plays).toBe(2)
    expect(file.frames).toHaveLength(2)
    expect(file.frames[0].duration).toBe(200)
    expect(file.frames[1]).toMatchObject({
      x: 2,
      y: 2,
      width: 2,
      height: 2,
      blend: "source",
    })
    // A frame shorter than browsers honour is lengthened to 11 ms.
    expect(file.frames[1].duration).toBe(11)
    expect(calls.webp.map((call) => call.pixels)).toEqual([24, 4])
    expect(bytes[20] & 0x10).toBe(0)
  })

  it("sets the alpha flag for see-through animations", async () => {
    const { deps } = fakeDeps()
    const bytes = await buildWebp([frame(solid(2, 2, 0, 200))], 0, lossy, deps)
    expect(bytes[20] & 0x10).toBe(0x10)
  })

  it("tries both ways on the first patches and keeps the smaller way", async () => {
    const flat = fakeDeps()
    await buildWebp(
      [0, 85, 0, 85].map((level) => frame(solid(2, 2, level))),
      0,
      { ...lossy, mixed: true },
      flat.deps
    )
    // Two trial patches written both ways, then lossless for the rest.
    expect(flat.calls.webp.map((call) => call.lossless)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ])
    const busy = fakeDeps()
    const bytes = await buildWebp(
      [170, 255, 170].map((level) => frame(solid(2, 2, level))),
      0,
      { ...lossy, mixed: true },
      busy.deps
    )
    expect(busy.calls.webp.map((call) => call.lossless)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ])
    expect(readWebp(bytes).frames).toHaveLength(3)
  })
})

describe("buildApngIndexed", () => {
  const options = { colours: 256, dithering: false, tolerance: 0 }

  it("paints changes over a solid animation and holds still frames", async () => {
    const { deps, calls } = fakeDeps()
    const second = solid(3, 1, 0)
    second.data.set([255, 255, 255, 255], 4)
    const bytes = await buildApngIndexed(
      [frame(solid(3, 1, 0)), frame(solid(3, 1, 0)), frame(second, 40_000)],
      0,
      options,
      deps
    )
    expect(calls.palette).toEqual([255])
    expect(calls.freed).toBe(1)
    const file = readApng(bytes)
    expect(
      file.frames.map((item) => [item.x, item.width, item.blend, item.duration])
    ).toEqual([
      [0, 3, "source", 200],
      [1, 1, "over", 40_000],
    ])
    // A clear entry was added to the palette for unchanged pixels.
    const text = Buffer.from(bytes).toString("latin1")
    expect(
      bytes.subarray(text.indexOf("PLTE") - 4, text.indexOf("PLTE"))
    ).toEqual(Uint8Array.of(0, 0, 0, 15))
    expect(text).toContain("tRNS")
  })

  it("caps a very long hold at what PNG can store", async () => {
    const { deps } = fakeDeps()
    const still = solid(1, 1, 0)
    const bytes = await buildApngIndexed(
      [frame(still, 40_000), frame(still, 40_000)],
      0,
      options,
      deps
    )
    expect(readApng(bytes).frames.map((item) => item.duration)).toEqual([
      65_535,
    ])
  })

  it("replaces each patch of a see-through animation, using every colour", async () => {
    const { deps, calls } = fakeDeps([...GREY.slice(0, 3), [0, 0, 0, 0]])
    const second = solid(2, 1, 85, 255)
    second.data[7] = 0
    const bytes = await buildApngIndexed(
      [frame(solid(2, 1, 85, 200)), frame(second)],
      1,
      options,
      deps
    )
    expect(calls.palette).toEqual([256])
    const file = readApng(bytes)
    expect(file.plays).toBe(1)
    expect(file.frames.map((item) => item.blend)).toEqual(["source", "source"])
  })
})

describe("helpers", () => {
  it("looks for see-through pixels once per distinct frame", () => {
    const clear = solid(2, 2, 0, 200)
    const opaque = solid(2, 2, 0)
    expect(hasClearPixels([opaque, opaque, clear], 255)).toBe(true)
    expect(hasClearPixels([opaque, clear], 128)).toBe(false)
    expect(hasClearPixels([], 255)).toBe(false)
  })

  it("builds one picture from frames spread across the animation", () => {
    const frames = [0, 50, 100, 150, 200, 250].map((level) =>
      solid(300, 100, level)
    )
    const sample = sampleFrames([...frames, frames[0]], 3, 100)
    // Every third pixel of three frames, stacked.
    expect([sample.width, sample.height]).toEqual([100, 34 * 3])
    expect([
      sample.data[0],
      sample.data[34 * 100 * 4],
      sample.data[2 * 34 * 100 * 4],
    ]).toEqual([0, 100, 200])
    const small = sampleFrames([solid(4, 4, 7)])
    expect([small.width, small.height, small.data[0]]).toEqual([4, 4, 7])
  })
})
