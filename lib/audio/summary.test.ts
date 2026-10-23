import { describe, expect, it } from "vitest"
import { defaultChanges } from "./change"
import { defaultLevel } from "./level"
import { noRepair } from "./repair"
import { defaultSettings, type AudioSettings } from "./settings"
import { defaultSound } from "./sound"
import {
  AUDIO_GROUPS,
  audioChanged,
  audioChangedGroups,
  audioReset,
  audioSummary,
  lossyOf,
  shownGroups,
} from "./summary"
import { TONE_PRESETS } from "./tone"

const with_ = (change: Partial<AudioSettings>): AudioSettings => ({
  ...defaultSettings,
  ...change,
})
const MB = 1024 * 1024

describe("audio settings groups", () => {
  it("knows the lossy codec of each format", () => {
    expect(lossyOf("mp3")).toBe("mp3")
    expect(lossyOf("m4a")).toBe("aac")
    expect(lossyOf("m4r")).toBe("aac")
    expect(lossyOf("opus")).toBe("opus")
    expect(lossyOf("flac")).toBeNull()
    expect(lossyOf("wav")).toBeNull()
    expect(lossyOf("same")).toBeNull()
  })

  it("shows quality for lossy formats and bit depth for the others", () => {
    expect(shownGroups(defaultSettings)).toEqual(
      AUDIO_GROUPS.filter((group) => group !== "depth")
    )
    expect(shownGroups(with_({ format: "flac" }))).toEqual(
      AUDIO_GROUPS.filter((group) => group !== "quality")
    )
  })

  it("finds the groups shown that differ, objects compared by value", () => {
    expect(audioChangedGroups(defaultSettings, defaultSettings)).toEqual([])
    const changed = with_({
      targetBytes: 2 * MB,
      level: { ...defaultLevel, mode: "loudness" },
      sound: { ...defaultSound, repair: { ...noRepair, hum: 50 } },
    })
    expect(audioChangedGroups(changed, defaultSettings)).toEqual([
      "level",
      "repair",
      "limit",
    ])
    // A copy of the same settings is not a change.
    expect(
      audioChanged("level", with_({ level: { ...defaultLevel } }), with_({}))
    ).toBe(false)
    // The equaliser and repair share a setting but are told apart.
    expect(audioChanged("tone", changed, defaultSettings)).toBe(false)
    // A group hidden by the format is not counted.
    expect(
      audioChangedGroups(with_({ format: "wav", preset: "high" }), with_({}))
    ).toEqual(["format"])
  })

  it("tells every group's change apart", () => {
    const usual = defaultSettings
    const changes: Record<string, Partial<AudioSettings>> = {
      format: { format: "flac" },
      quality: { bitrate: 320 },
      depth: { depth: 24 },
      level: { level: { ...defaultLevel, louder: 3 } },
      changes: { changes: { ...defaultChanges, reverse: true } },
      repair: {
        sound: { ...defaultSound, repair: { ...noRepair, declick: true } },
      },
      tone: { sound: { ...defaultSound, compressor: "voice" } },
      output: { keepTags: false },
      limit: { targetBytes: MB },
    }
    for (const group of AUDIO_GROUPS) {
      const settings = with_(changes[group])
      expect(audioChanged(group, settings, usual)).toBe(true)
      // Putting it back leaves nothing changed in it.
      const back = { ...settings, ...audioReset(group, settings, usual) }
      expect(audioChanged(group, back, usual)).toBe(false)
    }
  })

  it("puts a sound group back without touching the other", () => {
    const settings = with_({
      sound: {
        tone: TONE_PRESETS.bass.tone,
        compressor: "music",
        repair: { ...noRepair, denoise: 1 },
      },
    })
    expect(audioReset("repair", settings, defaultSettings)).toEqual({
      sound: { ...settings.sound, repair: noRepair },
    })
    expect(audioReset("tone", settings, defaultSettings)).toEqual({
      sound: { ...defaultSound, repair: { ...noRepair, denoise: 1 } },
    })
    expect(audioReset("output", settings, defaultSettings)).toEqual({
      sampleRate: "same",
      channels: "same",
      keepTags: true,
    })
    expect(audioReset("quality", settings, defaultSettings)).toEqual({
      preset: "balanced",
      bitrate: 192,
    })
  })
})

describe("audio settings in a line", () => {
  it("says the format", () => {
    expect(audioSummary("format", defaultSettings)).toBe("MP3")
    expect(audioSummary("format", with_({ format: "same" }))).toBe(
      "Same as the file"
    )
    expect(audioSummary("format", with_({ format: "m4a" }))).toBe("M4A (AAC)")
  })

  it("says the quality by preset and codec, or the bitrate", () => {
    expect(audioSummary("quality", defaultSettings)).toBe(
      "Balanced · 192 kbit/s"
    )
    expect(
      audioSummary("quality", with_({ format: "opus", preset: "small" }))
    ).toBe("Small · 48 kbit/s")
    expect(
      audioSummary("quality", with_({ format: "m4a", preset: "high" }))
    ).toBe("High · 256 kbit/s")
    expect(
      audioSummary("quality", with_({ preset: "custom", bitrate: 128 }))
    ).toBe("128 kbit/s")
    expect(audioSummary("quality", with_({ format: "wav" }))).toBe("192 kbit/s")
  })

  it("says the bit depth", () => {
    expect(audioSummary("depth", defaultSettings)).toBe("Same as the file")
    expect(audioSummary("depth", with_({ depth: 16 }))).toBe("16-bit")
    expect(audioSummary("depth", with_({ depth: 24 }))).toBe("24-bit")
    expect(audioSummary("depth", with_({ depth: 32 }))).toBe("32-bit float")
  })

  it("says the loudness", () => {
    const level = (change: Partial<AudioSettings["level"]>) =>
      audioSummary("level", with_({ level: { ...defaultLevel, ...change } }))
    expect(level({})).toBe("As it is")
    expect(level({ mode: "loudness" })).toBe(
      "Normalized to −14 LUFS · peaks under −1 dBTP"
    )
    expect(level({ mode: "peak", ceiling: -0.1 })).toBe(
      "Peaks normalized to −0.1 dBTP"
    )
    expect(level({ mode: "louder" })).toBe("6 dB louder · peaks under −1 dBTP")
    // A figure still being typed.
    expect(level({ mode: "loudness", target: NaN })).toBe(
      "Normalized to ? LUFS · peaks under −1 dBTP"
    )
  })

  it("says the speed, pitch and channels", () => {
    const changes = (change: Partial<AudioSettings["changes"]>) =>
      audioSummary(
        "changes",
        with_({ changes: { ...defaultChanges, ...change } })
      )
    expect(changes({})).toBe("Normal speed")
    expect(changes({ tempo: 1.25, pitch: 2 })).toBe("1.25× speed · pitch +2")
    expect(changes({ pitch: -3 })).toBe("Normal speed · pitch −3")
    expect(changes({ tempo: 0.5, keepPitch: false })).toBe(
      "0.5× speed · pitch follows"
    )
    expect(changes({ tempo: NaN })).toBe("?× speed")
    expect(changes({ channels: "karaoke", balance: -0.2, reverse: true })).toBe(
      "Normal speed · karaoke · balance left 20% · backwards"
    )
    expect(changes({ channels: "swap", balance: 0.35 })).toBe(
      "Normal speed · left and right swapped · balance right 35%"
    )
  })

  it("says the repairs", () => {
    const repair = (change: Partial<AudioSettings["sound"]["repair"]>) =>
      audioSummary(
        "repair",
        with_({
          sound: { ...defaultSound, repair: { ...noRepair, ...change } },
        })
      )
    expect(repair({})).toBe("Off")
    expect(repair({ denoise: 1 })).toBe("Noise 100%")
    expect(
      repair({ denoise: 0.5, hum: 60, declick: true, deess: "gentle" })
    ).toBe("Noise 50% · 60 Hz hum · clicks · harsh “s” gentle")
    expect(repair({ hum: 50 })).toBe("50 Hz hum")
  })

  it("says the tone and the compressor", () => {
    expect(audioSummary("tone", defaultSettings)).toBe(
      "Flat tone · no compressor"
    )
    expect(
      audioSummary(
        "tone",
        with_({
          sound: {
            ...defaultSound,
            tone: TONE_PRESETS.voice.tone,
            compressor: "voice",
          },
        })
      )
    ).toBe("Voice clarity tone · voice compressor")
    expect(
      audioSummary(
        "tone",
        with_({
          sound: { ...defaultSound, tone: { ...defaultSound.tone, bass: 5 } },
        })
      )
    ).toBe("Custom tone · no compressor")
  })

  it("says the sample rate, channels and tags", () => {
    expect(audioSummary("output", defaultSettings)).toBe(
      "Same rate · same channels · tags kept"
    )
    expect(
      audioSummary(
        "output",
        with_({ sampleRate: 44100, channels: 1, keepTags: false })
      )
    ).toBe("44.1 kHz · mono · no tags")
    expect(audioSummary("output", with_({ channels: 2 }))).toBe(
      "Same rate · stereo · tags kept"
    )
  })

  it("says the size limit", () => {
    expect(audioSummary("limit", defaultSettings)).toBe("No limit")
    expect(audioSummary("limit", with_({ targetBytes: 5 * MB }))).toBe(
      "Under 5 MB"
    )
    expect(
      audioSummary("limit", with_({ targetBytes: Math.round(2.5 * MB) }))
    ).toBe("Under 2.5 MB")
  })
})
