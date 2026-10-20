import { describe, expect, it } from "vitest"
import {
  defaultSound,
  isPlain,
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
    }
    expect(isPlain(voice)).toBe(false)
    expect(soundKey(voice)).not.toBe(
      soundKey({ ...voice, compressor: "gentle" })
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
      { tone: TONE_PRESETS.rumble.tone, compressor: "gentle" },
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
})
