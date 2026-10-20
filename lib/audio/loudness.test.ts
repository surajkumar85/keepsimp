import { describe, expect, it } from "vitest"
import {
  channelWeights,
  decibels,
  integrated,
  interpolators,
  kWeighting,
  LoudnessMeter,
  loudnessOf,
  loudnessOfParts,
  loudnessRange,
  lufsOf,
  oversampling,
  peaksIn,
  shortTerm,
  SILENT,
} from "./loudness"

/** A 1 kHz tone at `dbfs` for `seconds`, in every channel. */
function tone(rate: number, seconds: number, dbfs: number) {
  const amplitude = 10 ** (dbfs / 20)
  return Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * 1000 * index) / rate)
  )
}

/** Tones one after another, measured in chunks of 4,000 frames. */
function measure(
  parts: [seconds: number, dbfs: number][],
  rate = 48000,
  channels = 2
) {
  const meter = new LoudnessMeter(rate, channels)
  for (const [seconds, dbfs] of parts) {
    const signal = tone(rate, seconds, dbfs)
    for (let at = 0; at < signal.length; at += 4000) {
      const piece = signal.subarray(at, at + 4000)
      meter.push(Array.from({ length: channels }, () => piece))
    }
  }
  return meter.result()
}

describe("K-weighting", () => {
  it("is the filter printed in BS.1770 at 48 kHz", () => {
    const [shelf, highPass] = kWeighting(48000)
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 9)
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 9)
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 9)
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 9)
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 9)
    expect(highPass.a1).toBeCloseTo(-1.99004745483398, 9)
    expect(highPass.a2).toBeCloseTo(0.99007225036621, 9)
  })

  it("weighs the surrounds more and leaves out the LFE", () => {
    expect(channelWeights(2)).toEqual([1, 1])
    expect(channelWeights(6)).toEqual([1, 1, 1, 0, 1.41, 1.41])
    expect(channelWeights(8)).toEqual([1, 1, 1, 0, 1.41, 1.41, 1.41, 1.41])
    expect(channelWeights(3)).toEqual([1, 1, 1])
  })
})

describe("integrated loudness (EBU Tech 3341)", () => {
  it("case 1: a 1 kHz tone at −23 dBFS in both channels is −23 LUFS", () => {
    expect(integrated(measure([[20, -23]]))).toBeCloseTo(-23, 1)
  })

  it("case 3: quiet parts under the relative gate are left out", () => {
    const map = measure([
      [10, -36],
      [60, -23],
      [10, -36],
    ])
    expect(integrated(map)).toBeCloseTo(-23, 1)
  })

  it("case 5: the relative gate follows the level of what passes the absolute one", () => {
    const map = measure([
      [20, -26],
      [20.1, -20],
      [20, -26],
    ])
    expect(Math.abs(integrated(map) - -23)).toBeLessThan(0.1)
  })

  it("measures a part, at other rates and in mono", () => {
    const map = measure(
      [
        [5, -30],
        [5, -20],
      ],
      11025,
      1
    )
    // Mono: one channel at −20 dBFS is 3 LU under two.
    expect(integrated(map, 5, 10)).toBeCloseTo(-23, 0)
    expect(integrated(map, 0, 5)).toBeCloseTo(-33, 0)
  })

  it("says nothing of silence or of under 400 ms", () => {
    const silent = new LoudnessMeter(48000, 2)
    silent.push([new Float32Array(48000), new Float32Array(48000)])
    expect(integrated(silent.result())).toBe(SILENT)
    expect(loudnessRange(silent.result())).toBe(0)
    expect(integrated(measure([[0.3, -10]]))).toBe(SILENT)
    expect(lufsOf(0)).toBe(SILENT)
    expect(decibels(0)).toBe(SILENT)
    expect(decibels(0.5)).toBeCloseTo(-6.02, 2)
  })
})

describe("loudness range (EBU Tech 3342)", () => {
  it("case 1: 20 s at −20 dBFS then 20 s at −30 is a range of 10 LU", () => {
    const map = measure([
      [20, -20],
      [20, -30],
    ])
    expect(Math.abs(loudnessRange(map) - 10)).toBeLessThan(1)
  })

  it("is nothing for a steady tone", () => {
    expect(loudnessRange(measure([[10, -20]]))).toBeCloseTo(0, 1)
  })
})

describe("peaks", () => {
  it("finds a crest between samples that every sample misses", () => {
    // At a quarter of the rate, 45° from each crest: samples are 0.354, the wave 0.5.
    const rate = 44100
    const wave = Float32Array.from(
      { length: rate },
      (_, index) => 0.5 * Math.sin(Math.PI / 4 + (Math.PI / 2) * index)
    )
    const meter = new LoudnessMeter(rate, 2)
    meter.push([wave, wave])
    const { truePeak, peak } = peaksIn(meter.result())
    expect(decibels(peak)).toBeCloseTo(-9.03, 1)
    expect(Math.abs(decibels(truePeak) - -6.02)).toBeLessThan(0.1)
  })

  it("oversamples less at high rates, and interpolates a constant unchanged", () => {
    expect(oversampling(44100)).toBe(4)
    expect(oversampling(96000)).toBe(2)
    expect(oversampling(192000)).toBe(1)
    for (const taps of interpolators(4))
      expect(taps.reduce((sum, tap) => sum + tap, 0)).toBeCloseTo(1, 6)
    // At 192 kHz the samples themselves are the peak.
    const meter = new LoudnessMeter(192000, 1)
    meter.push([tone(192000, 0.5, -6)])
    expect(decibels(peaksIn(meter.result()).truePeak)).toBeCloseTo(-6, 1)
  })

  it("keeps peaks for a part, and a tiny file", () => {
    const map = measure([
      [1, -30],
      [1, -10],
    ])
    expect(decibels(peaksIn(map, 0, 1).peak)).toBeCloseTo(-30, 1)
    expect(decibels(peaksIn(map).peak)).toBeCloseTo(-10, 1)
    const tiny = new LoudnessMeter(48000, 1)
    tiny.push([Float32Array.of(0.25, -0.5, 0.25)])
    tiny.push([new Float32Array(0)])
    expect(peaksIn(tiny.result()).peak).toBe(0.5)
    // Asked again, the same answer.
    expect(tiny.result()).toBe(tiny.result())
    expect(new LoudnessMeter(48000, 1).result().energy.length).toBe(0)
    const none = new LoudnessMeter(48000, 1)
    none.push([])
    expect(none.result().energy.length).toBe(0)
    // At a rate that is not a multiple of ten, segments start at rounded frames.
    const oddMeter = new LoudnessMeter(8001, 1)
    const signal = tone(8001, 1, -20)
    for (let at = 0; at < signal.length; at += 800)
      oddMeter.push([signal.subarray(at, at + 800)])
    const odd = oddMeter.result()
    expect(Array.from(odd.frames.slice(0, 3))).toEqual([800, 800, 800])
    expect(odd.frames.reduce((sum, count) => sum + count, 0)).toBe(8001)
    // A short last segment makes no block of its own.
    const map045 = measure([[0.45, -20]])
    expect(map045.frames[4]).toBe(2400)
    expect(integrated(map045)).toBeCloseTo(-20, 0)
  })
})

describe("parts taken as one", () => {
  it("gates the blocks of every part together, and takes the highest peak", () => {
    const map = measure([
      [4, -40],
      [4, -20],
      [4, -30],
    ])
    const both = loudnessOfParts(map, [
      [4, 8],
      [8, 12],
    ])
    expect(both.integrated).toBeCloseTo(integrated(map, 4, 12), 1)
    expect(both.peak).toBeCloseTo(-20, 1)
    expect(loudnessOfParts(map, [[0, 4]]).integrated).toBeCloseTo(-40, 0)
    expect(loudnessOfParts(map, []).integrated).toBe(SILENT)
  })
})

describe("for the page", () => {
  it("draws short-term loudness, and says it all in one", () => {
    const map = measure([
      [4, -40],
      [4, -20],
    ])
    const series = shortTerm(map)
    expect(series.length).toBe(80)
    expect(series[35]).toBeCloseTo(-40, 0)
    expect(series[79]).toBeCloseTo(-20, 0)
    const said = loudnessOf(map, 4, 8)
    expect(said.integrated).toBeCloseTo(-20, 0)
    expect(said.peak).toBeCloseTo(-20, 1)
    expect(said.truePeak).toBeCloseTo(-20, 1)
    expect(said.range).toBeCloseTo(0, 0)
    const silent = new LoudnessMeter(48000, 1)
    silent.push([new Float32Array(9600)])
    expect(shortTerm(silent.result())[1]).toBe(SILENT)
  })
})
