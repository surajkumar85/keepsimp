import { describe, expect, it } from "vitest"
import { noRepair, RNNOISE_DELAY, type Rnnoise } from "./repair"
import {
  defaultSound,
  isPlain,
  needsRnnoise,
  SoundShaper,
  soundKey,
  soundProblem,
} from "./sound"
import { TONE_PRESETS } from "./tone"

describe("sound settings", () => {
  it("knows when nothing is done, and names what is", () => {
    expect(isPlain(defaultSound)).toBe(true)
    expect(soundKey(defaultSound)).toBe("plain")
    const voice = {
      tone: TONE_PRESETS.voice.tone,
      compressor: "voice" as const,
      repair: noRepair,
    }
    expect(isPlain(voice)).toBe(false)
    expect(soundKey(voice)).not.toBe(
      soundKey({ ...voice, compressor: "gentle", repair: noRepair })
    )
    expect(
      soundProblem({
        ...defaultSound,
        tone: { ...defaultSound.tone, bass: 20 },
      })
    ).not.toBeNull()
    expect(soundProblem(defaultSound)).toBeNull()
  })

  it("runs the equaliser then the compressor, and says how much it compressed", () => {
    const loud = Float32Array.from(
      { length: 44100 },
      (_, index) => 0.9 * Math.sin((2 * Math.PI * 440 * index) / 44100)
    )
    const shaper = new SoundShaper(
      {
        tone: TONE_PRESETS.rumble.tone,
        compressor: "gentle",
        repair: noRepair,
      },
      44100,
      1
    )
    const out = shaper.process([loud])
    expect(out[0]).toBe(loud)
    expect(shaper.compressed).toBeLessThan(-5)
    // Plain: nothing at all.
    const plain = new SoundShaper(defaultSound, 44100, 1)
    const copy = loud.slice()
    plain.process([loud])
    expect(loud).toEqual(copy)
    expect(plain.compressed).toBe(0)
  })

  it("repairs first and de-esses last, holding frames back until the end", () => {
    const rate = 48000
    // A fake RNNoise: late by its delay, halving what it hears.
    const rnnoise: Rnnoise = {
      createDenoiseState() {
        let tail = new Float32Array(RNNOISE_DELAY)
        return {
          processFrame(frame: Float32Array) {
            const all = new Float32Array(tail.length + frame.length)
            all.set(tail)
            all.set(frame, tail.length)
            frame.set(all.subarray(0, frame.length).map((x) => x / 2))
            tail = all.slice(frame.length)
            return 0.5
          },
          destroy() {},
        }
      },
    }
    const sound = {
      ...defaultSound,
      repair: {
        denoise: 1,
        hum: 50 as const,
        declick: true,
        deess: "strong" as const,
      },
    }
    expect(needsRnnoise(sound)).toBe(true)
    expect(needsRnnoise(defaultSound)).toBe(false)
    expect(isPlain(sound)).toBe(false)
    expect(soundKey(sound)).not.toBe(soundKey(defaultSound))
    // Half a second of a bright tone, then a low one with a click on it.
    const input = Float32Array.from({ length: rate }, (_, index) =>
      index < rate / 2
        ? 0.5 * Math.sin((2 * Math.PI * 7000 * index) / rate)
        : 0.3 * Math.sin((2 * Math.PI * 220 * index) / rate)
    )
    input[(rate * 3) / 4] = 1
    const shaper = new SoundShaper(sound, rate, 1, rnnoise)
    expect(shaper.holds).toBe(true)
    const first = shaper.process([input.slice(0, (rate * 3) / 4 + 100)])
    const rest = shaper.process([input.slice((rate * 3) / 4 + 100)], true)
    expect(first[0].length + rest[0].length).toBe(rate)
    expect(shaper.clicks).toBe(1)
    expect(shaper.deessed).toBeLessThan(-1)
    // Without RNNoise, the rest still runs; nothing is held with nothing to repair.
    const without = new SoundShaper(sound, rate, 1)
    expect(without.process([input.slice()], true)[0].length).toBe(rate)
    const plain = new SoundShaper(defaultSound, rate, 1)
    expect(plain.holds).toBe(false)
    expect(plain.clicks).toBe(0)
    expect(plain.deessed).toBe(0)
  })
})
