import { describe, expect, it } from "vitest"
import {
  cookbook,
  Equaliser,
  filtersOf,
  flatTone,
  isFlat,
  presetOf,
  responseAt,
  TONE_PRESETS,
  toneProblem,
  type Tone,
} from "./tone"

const RATE = 48000

/** The level a sine comes out at, in dB, after the transient. */
function through(tone: Tone, frequency: number, rate = RATE) {
  const equaliser = new Equaliser(tone, rate, 1)
  const wave = Float32Array.from({ length: rate }, (_, index) =>
    Math.sin((2 * Math.PI * frequency * index) / rate)
  )
  // In chunks, as it streams.
  for (let at = 0; at < wave.length; at += 1000)
    equaliser.process([wave.subarray(at, at + 1000)])
  let peak = 0
  for (let index = rate / 2; index < rate; index++)
    peak = Math.max(peak, Math.abs(wave[index]))
  return 20 * Math.log10(peak)
}

describe("the cookbook filters", () => {
  it("cut, shelve and lift where they should", () => {
    const high = cookbook("highpass", RATE, 80)
    expect(responseAt([high], RATE, 80)).toBeCloseTo(-3.01, 1)
    expect(responseAt([high], RATE, 40)).toBeLessThan(-11)
    expect(responseAt([high], RATE, 1000)).toBeCloseTo(0, 1)
    const low = cookbook("lowpass", RATE, 3400)
    expect(responseAt([low], RATE, 3400)).toBeCloseTo(-3.01, 1)
    expect(responseAt([low], RATE, 12000)).toBeLessThan(-20)
    expect(
      responseAt([cookbook("lowshelf", RATE, 120, 6)], RATE, 30)
    ).toBeCloseTo(6, 0)
    expect(
      responseAt([cookbook("highshelf", RATE, 8000, -6)], RATE, 20000)
    ).toBeCloseTo(-6, 0)
    expect(
      responseAt([cookbook("peaking", RATE, 1000, 3, 0.8)], RATE, 1000)
    ).toBeCloseTo(3, 2)
    // A filter asked for past the top of the rate is kept under it.
    expect(Number.isFinite(cookbook("lowpass", 8000, 9000).b0)).toBe(true)
  })

  it("does to a streamed sine what the response says", () => {
    const voice = TONE_PRESETS.voice.tone
    for (const frequency of [50, 1000, 12345])
      expect(through(voice, frequency)).toBeCloseTo(
        responseAt(filtersOf(voice, RATE), RATE, frequency),
        1
      )
    // Flat is nothing at all, and a low-pass over the top of the rate is left out.
    expect(filtersOf(flatTone, RATE)).toEqual([])
    expect(filtersOf({ ...flatTone, lowPass: 20000 }, 22050).length).toBe(0)
    expect(through(TONE_PRESETS.telephone.tone, 100)).toBeLessThan(-15)
  })
})

describe("presets and bounds", () => {
  it("names a tone by its preset, or none", () => {
    expect(presetOf(TONE_PRESETS.bass.tone)).toBe("bass")
    expect(presetOf(flatTone)).toBe("flat")
    expect(presetOf({ ...flatTone, treble: 1 })).toBeNull()
    expect(isFlat(flatTone)).toBe(true)
    expect(isFlat(TONE_PRESETS.rumble.tone)).toBe(false)
  })

  it("refuses bands, high-passes and low-passes out of bounds", () => {
    expect(toneProblem(TONE_PRESETS.telephone.tone)).toBeNull()
    expect(toneProblem({ ...flatTone, bass: 13 })).toBe(
      "Choose a change of at most 12 dB for each band."
    )
    expect(toneProblem({ ...flatTone, mid: NaN })).not.toBeNull()
    expect(toneProblem({ ...flatTone, highPass: 5 })).toBe(
      "Choose a high-pass from 20 Hz to 1 kHz."
    )
    expect(toneProblem({ ...flatTone, lowPass: 500 })).toBe(
      "Choose a low-pass from 1 to 20 kHz."
    )
  })
})
