import { describe, expect, it } from "vitest"
import { Compressor, COMPRESSORS, reductionAt } from "./dynamics"

const RATE = 44100

const sine = (seconds: number, dbfs: number, frequency = 440) =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, index) =>
      10 ** (dbfs / 20) * Math.sin((2 * Math.PI * frequency * index) / RATE)
  )

const peakDb = (plane: Float32Array, from: number, to: number) => {
  let peak = 0
  for (
    let index = Math.round(from * RATE);
    index < Math.round(to * RATE);
    index++
  )
    peak = Math.max(peak, Math.abs(plane[index]))
  return 20 * Math.log10(peak)
}

describe("the curve", () => {
  it("turns down above the threshold by the ratio, softly at the knee", () => {
    const gentle = COMPRESSORS.gentle
    expect(reductionAt(-40, gentle)).toBe(0)
    expect(reductionAt(-21, gentle)).toBe(0)
    // At the threshold, half way into the knee: (1/2 − 1) × 3² / 12.
    expect(reductionAt(-18, gentle)).toBeCloseTo(-0.375, 5)
    expect(reductionAt(-6, gentle)).toBeCloseTo(-6, 5)
    expect(reductionAt(0, COMPRESSORS.voice)).toBeCloseTo(-16, 5)
  })
})

describe("Compressor", () => {
  it("brings a steady loud tone down to where the curve says, both channels alike", () => {
    const left = sine(1, -6)
    const right = sine(1, -12)
    const compressor = new Compressor(COMPRESSORS.gentle, RATE)
    for (let at = 0; at < left.length; at += 512)
      compressor.process([
        left.subarray(at, at + 512),
        right.subarray(at, at + 512),
      ])
    expect(peakDb(left, 0.5, 1)).toBeCloseTo(-12, 0)
    // The quieter channel is turned down as much, so the image stays.
    expect(peakDb(right, 0.5, 1)).toBeCloseTo(-18, 0)
    expect(compressor.most).toBeLessThan(-5.5)
  })

  it("leaves quiet sound and silence alone, and acts within its attack", () => {
    const quiet = sine(0.5, -30)
    const copy = quiet.slice()
    new Compressor(COMPRESSORS.music, RATE).process([quiet])
    expect(quiet).toEqual(copy)
    const silence = new Float32Array(1000)
    new Compressor(COMPRESSORS.voice, RATE).process([silence])
    expect(silence.every((value) => value === 0)).toBe(true)
    // A loud burst after quiet: down by most of the way within a few attacks.
    const burst = new Float32Array(RATE)
    burst.set(sine(0.5, -40))
    burst.set(sine(0.5, 0), RATE / 2)
    const voice = new Compressor(COMPRESSORS.voice, RATE)
    voice.process([burst])
    expect(peakDb(burst, 0.55, 1)).toBeCloseTo(-16, 0)
    expect(new Compressor(COMPRESSORS.voice, RATE).most).toBe(0)
    new Compressor(COMPRESSORS.voice, RATE).process([])
  })
})
