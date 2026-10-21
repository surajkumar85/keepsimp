import { describe, expect, it } from "vitest"
import {
  BLOCK,
  floatWavHeader,
  levelOf,
  mostFrames,
  PAUSE_FADE,
  recordingName,
  Take,
} from "./record"

const RATE = 8000
const ramp = (length: number, from = 0) =>
  Float32Array.from({ length }, (_, index) => ((from + index) % 100) / 100)

/** The samples of a WAV of floats, interleaved. */
async function samplesOf(wav: Blob) {
  const bytes = new Uint8Array(await wav.arrayBuffer())
  return new Float32Array(bytes.slice(58).buffer)
}

describe("a recording", () => {
  it("writes a header for floats that says its size", () => {
    const header = floatWavHeader(10, 48000, 2)
    const view = new DataView(header.buffer)
    const ascii = (at: number) =>
      String.fromCharCode(...header.subarray(at, at + 4))
    expect([ascii(0), ascii(8), ascii(12), ascii(38), ascii(50)]).toEqual([
      "RIFF",
      "WAVE",
      "fmt ",
      "fact",
      "data",
    ])
    expect(view.getUint32(4, true)).toBe(50 + 80)
    expect(view.getUint16(20, true)).toBe(3)
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint32(28, true)).toBe(48000 * 8)
    expect(view.getUint16(32, true)).toBe(8)
    expect(view.getUint16(34, true)).toBe(32)
    expect(view.getUint32(46, true)).toBe(10)
    expect(view.getUint32(54, true)).toBe(80)
    expect(mostFrames(2) * 8 + 50).toBeLessThanOrEqual(0xffffffff)
  })

  it("measures peaks and RMS, and silence as nothing", () => {
    expect(levelOf([new Float32Array(10)])).toEqual({
      peak: -Infinity,
      rms: -Infinity,
    })
    expect(levelOf([])).toEqual({ peak: -Infinity, rms: -Infinity })
    const sine = Float32Array.from({ length: 8000 }, (_, index) =>
      Math.sin((2 * Math.PI * 100 * index) / 8000)
    )
    const level = levelOf([sine, Float32Array.of(-1)])
    expect(level.peak).toBeCloseTo(0, 6)
    expect(level.rms).toBeCloseTo(-3.01, 1)
  })

  it("is named for when it started, without spaces", () => {
    expect(recordingName(new Date(2026, 9, 21, 9, 5, 7))).toBe(
      "recording-2026-10-21-090507.wav"
    )
  })

  it("keeps every sample, letting go of a second at a time", async () => {
    const parts: Blob[] = []
    const take = new Take(RATE, 2, (part) => parts.push(part))
    const left = ramp(RATE * 2 + 123)
    const right = ramp(RATE * 2 + 123, 50)
    expect(take.push([left.subarray(0, 5000), right.subarray(0, 5000)])).toBe(
      true
    )
    expect(take.push([left.subarray(5000), right.subarray(5000)])).toBe(true)
    expect(take.frames).toBe(left.length)
    expect(take.seconds).toBeCloseTo(left.length / RATE)
    // Whole seconds were let go of as they filled.
    expect(parts.length).toBe(
      Math.floor((left.length - PAUSE_FADE * RATE) / (BLOCK * RATE))
    )
    const samples = await samplesOf(take.wav())
    expect(samples.length).toBe(left.length * 2)
    for (let index = 0; index < left.length; index++) {
      expect(samples[index * 2]).toBe(left[index])
      expect(samples[index * 2 + 1]).toBe(right[index])
    }
  })

  it("puts a mono microphone in every channel", async () => {
    const take = new Take(RATE, 2)
    take.push([Float32Array.of(0.5, 0.25)])
    expect(Array.from(await samplesOf(take.wav()))).toEqual([
      0.5, 0.5, 0.25, 0.25,
    ])
  })

  it("fades out at a pause and in after it", async () => {
    const take = new Take(RATE, 1)
    const fade = Math.round(PAUSE_FADE * RATE)
    take.push([new Float32Array(100).fill(1)])
    take.pause()
    take.push([new Float32Array(100).fill(1)])
    const samples = await samplesOf(take.wav())
    // Down to almost nothing before the pause, and up from almost nothing after.
    expect(samples[100 - fade - 1]).toBe(1)
    expect(samples[100 - 1]).toBeCloseTo(1 / (fade + 1))
    expect(samples[100]).toBeCloseTo(1 / (fade + 1))
    expect(samples[100 + fade - 1]).toBeCloseTo(fade / (fade + 1))
    expect(samples[100 + fade]).toBe(1)
    for (let index = 100 - fade; index < 100 - 1; index++)
      expect(samples[index]).toBeGreaterThan(samples[index + 1])
    // A pause at the very start has nothing to fade out.
    const early = new Take(RATE, 1)
    early.pause()
    early.push([Float32Array.of(1)])
    expect((await samplesOf(early.wav()))[0]).toBeCloseTo(1 / (fade + 1))
  })

  it("stops taking sound at the most a WAV can hold, and says so", () => {
    const take = new Take(RATE, 1)
    take.frames = mostFrames(1) - 2
    expect(take.push([new Float32Array(5)])).toBe(false)
    expect(take.frames).toBe(mostFrames(1))
    expect(take.push([new Float32Array(0)])).toBe(true)
    expect(take.push([])).toBe(true)
  })

  it("makes an empty take into a WAV with no sound", async () => {
    expect((await new Take(RATE, 1).wav().arrayBuffer()).byteLength).toBe(58)
  })
})
