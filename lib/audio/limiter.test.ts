import { describe, expect, it } from "vitest"
import { Limiter } from "./limiter"
import { decibels, LoudnessMeter, peaksIn } from "./loudness"

const RATE = 44100

/** Everything a limiter gives for a signal fed in chunks of `size`. */
function limit(
  planes: Float32Array[],
  ceiling: number,
  size = 1000,
  rate = RATE
) {
  const limiter = new Limiter(rate, planes.length, ceiling)
  const parts: Float32Array[][] = []
  for (let at = 0; at < planes[0].length; at += size)
    parts.push(
      limiter.process(planes.map((plane) => plane.subarray(at, at + size)))
    )
  parts.push(limiter.flush())
  const joined = planes.map((_, channel) => {
    const all = new Float32Array(
      parts.reduce((sum, part) => sum + part[channel].length, 0)
    )
    let at = 0
    for (const part of parts) {
      all.set(part[channel], at)
      at += part[channel].length
    }
    return all
  })
  return { out: joined, limiter }
}

const truePeakOf = (planes: Float32Array[], rate = RATE) => {
  const meter = new LoudnessMeter(rate, planes.length)
  meter.push(planes)
  return decibels(peaksIn(meter.result()).truePeak)
}

const sine = (
  frames: number,
  frequency: number,
  amplitude: number,
  phase = 0
) =>
  Float32Array.from(
    { length: frames },
    (_, index) =>
      amplitude * Math.sin(phase + (2 * Math.PI * frequency * index) / RATE)
  )

describe("Limiter", () => {
  it("leaves a sound under the ceiling exactly as it was, as long as it was", () => {
    const left = sine(RATE, 440, 0.5)
    const right = sine(RATE, 660, 0.3)
    const { out, limiter } = limit([left, right], 0.9)
    expect(out[0]).toEqual(left)
    expect(out[1]).toEqual(right)
    expect(limiter.lowest).toBe(1)
    expect(limiter.limited).toBe(0)
  })

  it("keeps a sound twice too loud under the ceiling, and gives every frame back", () => {
    const loud = sine(RATE * 2, 1000, 1.6)
    const { out, limiter } = limit([loud, loud], 0.891)
    expect(out[0].length).toBe(loud.length)
    expect(truePeakOf(out)).toBeLessThanOrEqual(-1 + 0.05)
    // About 5 dB taken off, and most of it limited.
    expect(decibels(limiter.lowest)).toBeCloseTo(-5.1, 0)
    expect(limiter.limited).toBeGreaterThan(loud.length * 0.9)
  })

  it("catches a sudden burst from its very first sample, and lets go after", () => {
    const signal = new Float32Array(RATE * 2)
    // Quiet, a 50 ms burst at full scale, quiet again.
    signal.set(sine(RATE, 300, 0.2))
    signal.set(sine(2205, 300, 1, 0.3), RATE / 2)
    const { out } = limit([signal], 0.5)
    expect(truePeakOf(out)).toBeLessThanOrEqual(decibels(0.5) + 0.05)
    // Before the burst and long after it, untouched.
    expect(out[0][1000]).toBe(signal[1000])
    expect(Math.abs(out[0][RATE + 2000] - signal[RATE + 2000])).toBeLessThan(
      1e-4
    )
  })

  it("lowers peaks between samples that no sample shows", () => {
    // At a quarter of the rate, 45° off: samples at 0.707, crests at 1.
    const wave = Float32Array.from({ length: RATE }, (_, index) =>
      Math.sin(Math.PI / 4 + (Math.PI / 2) * index)
    )
    expect(Math.abs(truePeakOf([wave]))).toBeLessThan(0.1)
    const { out } = limit([wave], 0.8)
    expect(truePeakOf([out[0]])).toBeLessThanOrEqual(decibels(0.8) + 0.05)
  })

  it("gives the same sound whatever the chunks", () => {
    const loud = sine(20000, 2000, 1.3)
    const one = limit([loud], 0.7, 20000).out[0]
    const many = limit([loud], 0.7, 137).out[0]
    expect(many).toEqual(one)
  })

  it("holds a sound shorter than its look-ahead until the end, at other rates too", () => {
    const short = Float32Array.of(0.1, 0.9, -0.95, 0.2)
    const limiter = new Limiter(48000, 1, 0.5)
    expect(limiter.process([short])[0].length).toBe(0)
    const rest = limiter.flush()[0]
    expect(rest.length).toBe(4)
    expect(Math.max(...rest.map(Math.abs))).toBeLessThanOrEqual(0.5)
    expect(new Limiter(192000, 1, 1).flush()[0].length).toBe(0)
    expect(new Limiter(96000, 2, 1).process([])).toEqual([
      new Float32Array(0),
      new Float32Array(0),
    ])
  })
})
