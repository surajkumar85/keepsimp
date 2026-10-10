// @vitest-environment node
/**
 * Runs the animation pipeline with the real codecs. Sources are written by
 * other software (sharp, UPNG) and results are read back by it, so neither
 * our readers nor our writers are only checked against themselves.
 */
import { describe, expect, it } from "vitest"
import sharp from "sharp"
import UPNG from "upng-js"
import { installNodeCodecShims } from "@/tests/node-codecs"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { createDeps } from "./deps"
import { BEST_TOO_LARGE, convertAnimation } from "./pipeline"
import {
  defaultSettings,
  noTrim,
  type AnimationSettings,
  type Target,
  type Trim,
} from "./settings"
import { identify, openAnimation, type SourceFormat } from "./source"

installNodeCodecShims()

const WIDTH = 64
const HEIGHT = 48
const deps = createDeps()

/** A square that moves right over a fixed backdrop; `clear` leaves the backdrop see-through. */
function scene(count: number, clear = false) {
  return Array.from({ length: count }, (_, frame) => {
    const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const inside =
          x >= 4 + frame * 4 && x < 16 + frame * 4 && y >= 16 && y < 32
        const colour = inside
          ? [220, 40, 40, 255]
          : clear
            ? [0, 0, 0, 0]
            : [20, 60 + (y >> 3) * 16, 120, 255]
        data.set(colour, (y * WIDTH + x) * 4)
      }
    return data
  })
}

const stacked = (frames: Uint8ClampedArray[]) => {
  const all = new Uint8Array(frames.length * WIDTH * HEIGHT * 4)
  frames.forEach((frame, index) => all.set(frame, index * frame.length))
  return sharp(all, {
    raw: {
      width: WIDTH,
      height: HEIGHT * frames.length,
      channels: 4,
      pageHeight: HEIGHT,
    },
  })
}

async function sourceFile(
  format: SourceFormat,
  frames: Uint8ClampedArray[],
  delay = 80,
  loop = 0
) {
  const delays = frames.map(() => delay)
  if (format === "gif")
    return new Uint8Array(
      await stacked(frames).gif({ delay: delays, loop, effort: 1 }).toBuffer()
    )
  if (format === "webp")
    return new Uint8Array(
      await stacked(frames)
        .webp({ delay: delays, loop, lossless: true })
        .toBuffer()
    )
  return new Uint8Array(
    UPNG.encode(
      frames.map((frame) => frame.buffer as ArrayBuffer),
      WIDTH,
      HEIGHT,
      0,
      delays
    )
  )
}

/** Read a result back with other software: whole frames, delays and loop count. */
async function readBack(target: Target, bytes: Uint8Array) {
  if (target === "apng") {
    const image = UPNG.decode(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    )
    return {
      width: image.width,
      height: image.height,
      frames: UPNG.toRGBA8(image).map((frame) => new Uint8Array(frame)),
      delays: image.frames.map((frame) => frame.delay),
      // UPNG does not report the play count; it is read from the acTL chunk.
      plays: new DataView(bytes.buffer, bytes.byteOffset).getUint32(
        bytes.indexOf(0x61, 33) + 8
      ),
    }
  }
  const image = sharp(Buffer.from(bytes), { animated: true })
  const meta = await image.metadata()
  const height = meta.pageHeight!
  const raw = await image.ensureAlpha().raw().toBuffer()
  const size = meta.width! * height * 4
  return {
    width: meta.width!,
    height,
    frames: Array.from({ length: meta.pages! }, (_, index) =>
      raw.subarray(index * size, (index + 1) * size)
    ),
    delays: meta.delay!,
    plays: meta.loop!,
  }
}

const convert = async (
  file: Uint8Array,
  change: Partial<AnimationSettings>,
  trim: Trim = noTrim
) =>
  convertAnimation(
    openAnimation(file, deps),
    { ...defaultSettings, ...change },
    trim,
    deps
  )

/** Largest difference in any channel between two frames. */
const worst = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let most = 0
  for (let i = 0; i < a.length; i++)
    most = Math.max(most, Math.abs(a[i] - b[i]))
  return most
}

async function collect(file: Uint8Array) {
  const frames: Pixels[] = []
  for await (const frame of openAnimation(file, deps).frames())
    frames.push({ ...frame, data: frame.data.slice() })
  return frames
}

describe("reading animations written by other software", () => {
  for (const format of ["gif", "webp", "apng"] as const)
    it(`reads every frame, delay and the loop count of a ${format}`, async () => {
      const frames = scene(6)
      const file = await sourceFile(
        format,
        frames,
        80,
        format === "apng" ? 0 : 3
      )
      expect(identify(file)).toEqual({ format })
      const source = openAnimation(file, deps)
      expect([source.width, source.height]).toEqual([WIDTH, HEIGHT])
      expect(source.durations).toEqual([80, 80, 80, 80, 80, 80])
      // sharp counts plays, as we do; GIF itself stores one fewer.
      expect(source.plays).toBe(format === "apng" ? 0 : 3)
      const read = await collect(file)
      expect(read).toHaveLength(6)
      // sharp rounds colours slightly when it builds a GIF palette.
      read.forEach((frame, index) =>
        expect(worst(frame.data, frames[index])).toBeLessThanOrEqual(
          format === "gif" ? 2 : 0
        )
      )
    })

  it("keeps see-through pixels", async () => {
    for (const format of ["gif", "webp", "apng"] as const) {
      const frames = scene(4, true)
      const read = await collect(await sourceFile(format, frames))
      read.forEach((frame, index) =>
        expect(worst(frame.data, frames[index]), format).toBeLessThanOrEqual(
          format === "gif" ? 2 : 0
        )
      )
    }
  })
})

describe("writing animations other software can read", () => {
  it("writes exact WebP and APNG, frame for frame", async () => {
    const frames = scene(6)
    const file = await sourceFile("apng", frames)
    for (const target of ["webp", "apng"] as const) {
      const result = await convert(file, { target, quality: "lossless" })
      const back = await readBack(target, result.bytes)
      expect([back.width, back.height], target).toEqual([WIDTH, HEIGHT])
      expect(back.frames, target).toHaveLength(6)
      back.frames.forEach((frame, index) =>
        expect(worst(frame, frames[index]), `${target} ${index}`).toBe(0)
      )
      expect(back.delays, target).toEqual([80, 80, 80, 80, 80, 80])
      expect(back.plays, target).toBe(0)
    }
  })

  it("writes a GIF with a shared palette and only the changes", async () => {
    const frames = scene(6)
    const file = await sourceFile("webp", frames)
    const result = await convert(file, { target: "gif", quality: "high" })
    const back = await readBack("gif", result.bytes)
    expect(back.frames).toHaveLength(6)
    back.frames.forEach((frame, index) =>
      expect(worst(frame, frames[index])).toBeLessThanOrEqual(12)
    )
    expect(back.delays).toEqual([80, 80, 80, 80, 80, 80])
    expect(back.plays).toBe(0)
    // Six full frames would be far larger than one frame plus five small patches.
    const full = await sourceFile("gif", frames)
    expect(result.bytes.length).toBeLessThan(full.length * 1.2)
  })

  it("keeps see-through pixels in every format", async () => {
    const frames = scene(5, true)
    const file = await sourceFile("apng", frames)
    for (const [target, quality] of [
      ["gif", "high"],
      ["webp", "lossless"],
      ["apng", "lossless"],
      ["apng", "balanced"],
    ] as const) {
      const result = await convert(file, { target, quality })
      const back = await readBack(target, result.bytes)
      expect(back.frames, target).toHaveLength(5)
      back.frames.forEach((frame, index) => {
        // Corner stays clear; the square is solid and close to its colour.
        expect(frame[3], `${target} ${quality}`).toBe(0)
        const inside = (20 * WIDTH + 8 + index * 4) * 4
        expect(frame[inside + 3]).toBe(255)
        expect(Math.abs(frame[inside] - 220)).toBeLessThanOrEqual(12)
      })
    }
  })

  it("makes smaller files at lower quality", async () => {
    const photo = await sharp("public/images/coastline.jpg")
      .resize(WIDTH + 40, HEIGHT)
      .ensureAlpha()
      .raw()
      .toBuffer()
    const frames = Array.from({ length: 8 }, (_, frame) => {
      const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
      for (let y = 0; y < HEIGHT; y++)
        data.set(
          photo.subarray(
            (y * (WIDTH + 40) + frame * 5) * 4,
            (y * (WIDTH + 40) + frame * 5 + WIDTH) * 4
          ),
          y * WIDTH * 4
        )
      return data
    })
    const file = await sourceFile("apng", frames)
    for (const target of ["gif", "webp", "apng"] as const) {
      const high = await convert(file, { target, quality: "high" })
      const small = await convert(file, { target, quality: "small" })
      expect(small.bytes.length, target).toBeLessThan(high.bytes.length)
      const back = await readBack(target, small.bytes)
      expect(back.frames, target).toHaveLength(8)
      expect(worst(back.frames[3], frames[3]), target).toBeLessThan(140)
    }
  })
})

describe("timing and shape", () => {
  it("trims, changes speed and limits the frame rate", async () => {
    const file = await sourceFile("gif", scene(10), 100)
    const trimmed = await convert(
      file,
      { target: "webp" },
      { start: 200, end: 700 }
    )
    expect((await readBack("webp", trimmed.bytes)).delays).toEqual([
      100, 100, 100, 100, 100,
    ])
    expect(trimmed.duration).toBe(500)

    const fast = await convert(file, { target: "gif", speed: 2 })
    expect((await readBack("gif", fast.bytes)).delays).toEqual(
      Array.from({ length: 10 }, () => 50)
    )

    const limited = await convert(file, {
      target: "apng",
      fps: 5,
      quality: "lossless",
    })
    const back = await readBack("apng", limited.bytes)
    expect(back.frames).toHaveLength(5)
    expect(back.delays).toEqual([200, 200, 200, 200, 200])
    expect(limited.duration).toBe(1000)
  })

  it("reverses, plays there and back, and sets the loop count", async () => {
    const frames = scene(4)
    const file = await sourceFile("webp", frames)
    const reversed = await readBack(
      "apng",
      (
        await convert(file, {
          target: "apng",
          quality: "lossless",
          reverse: true,
        })
      ).bytes
    )
    reversed.frames.forEach((frame, index) =>
      expect(worst(frame, frames[3 - index])).toBe(0)
    )

    const boomerang = await readBack(
      "webp",
      (
        await convert(file, {
          target: "webp",
          quality: "lossless",
          boomerang: true,
          loop: "count",
          loopCount: 3,
        })
      ).bytes
    )
    expect(boomerang.frames).toHaveLength(6)
    ;[0, 1, 2, 3, 2, 1].forEach((source, index) =>
      expect(worst(boomerang.frames[index], frames[source])).toBe(0)
    )
    expect(boomerang.plays).toBe(3)

    const once = await readBack(
      "apng",
      (
        await convert(file, {
          target: "apng",
          quality: "lossless",
          loop: "once",
        })
      ).bytes
    )
    expect(once.plays).toBe(1)
    const twiceBytes = (
      await convert(file, { target: "gif", loop: "count", loopCount: 2 })
    ).bytes
    expect((await readBack("gif", twiceBytes)).plays).toBe(2)
    // GIF itself stores the repeats after the first play: one.
    const raw = Buffer.from(twiceBytes).toString("latin1")
    expect(raw.charCodeAt(raw.indexOf("NETSCAPE2.0") + 13)).toBe(1)
  })

  it("resizes, turns and fills the background", async () => {
    const file = await sourceFile("apng", scene(3, true))
    const result = await convert(file, {
      target: "apng",
      quality: "lossless",
      resize: "width",
      resizeValue: 32,
      rotation: 90,
      background: "custom",
      backgroundColor: "#00786f",
    })
    // Turned, the 64 × 48 picture is 48 × 64; 32 wide makes it 32 × 43.
    expect([result.width, result.height]).toEqual([32, 43])
    const back = await readBack("apng", result.bytes)
    expect([back.width, back.height]).toEqual([32, 43])
    expect([...back.frames[0].subarray(0, 4)]).toEqual([0, 120, 111, 255])
  })

  it("stores still moments once", async () => {
    const frames = scene(3)
    const file = await sourceFile("apng", [
      frames[0],
      frames[0],
      frames[0],
      frames[1],
    ])
    for (const target of ["gif", "webp", "apng"] as const) {
      const result = await convert(file, { target, quality: "lossless" })
      const back = await readBack(target, result.bytes)
      expect(back.delays, target).toEqual([240, 80])
      expect(result.frames).toBe(4)
    }
  })
})

describe("gifski", () => {
  it("writes a GIF with our timing and loop count", async () => {
    const frames = scene(5)
    const file = await sourceFile("webp", frames, 120)
    const result = await convert(file, {
      target: "gif",
      gifEngine: "best",
      loop: "count",
      loopCount: 4,
    })
    expect(result.note).toBeNull()
    const back = await readBack("gif", result.bytes)
    expect(back.frames).toHaveLength(5)
    expect(back.delays).toEqual([120, 120, 120, 120, 120])
    expect(back.plays).toBe(4)
    back.frames.forEach((frame, index) =>
      expect(worst(frame, frames[index])).toBeLessThanOrEqual(24)
    )
  }, 60_000)

  it("falls back to the fast encoder for one frame, without a note", async () => {
    const file = await sourceFile("gif", scene(4), 100)
    const result = await convert(
      file,
      { target: "gif", gifEngine: "best" },
      { start: 0, end: 100 }
    )
    expect(result.note).toBeNull()
    expect(result.note).not.toBe(BEST_TOO_LARGE)
    expect((await readBack("gif", result.bytes)).frames).toHaveLength(1)
  })
})
