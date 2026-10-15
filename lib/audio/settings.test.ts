import { describe, expect, it } from "vitest"
import {
  bitrateOf,
  defaultSettings,
  depthOf,
  nearest,
  planFor,
  settingsKey,
  settingsProblem,
  type AudioSettings,
  type SourceFacts,
} from "./settings"

const song: SourceFacts = {
  container: "mp3",
  codec: "mp3",
  sampleRate: 44100,
  channels: 2,
  duration: 200,
  hasVideo: false,
}
const film: SourceFacts = {
  container: "mp4",
  codec: "aac",
  sampleRate: 48000,
  channels: 6,
  duration: 90,
  hasVideo: true,
}
const settings = (change: Partial<AudioSettings> = {}): AudioSettings => ({
  ...defaultSettings,
  ...change,
})

describe("planFor", () => {
  it("writes MP3 at the preset's bitrate, keeping rate and channels", () => {
    expect(planFor(settings(), song)).toEqual({
      format: "mp3",
      codec: "mp3",
      copy: false,
      bitrate: 192_000,
      sampleRate: 44100,
      channels: 2,
      sampleFormat: null,
      notes: [],
    })
    expect(planFor(settings({ preset: "high" }), song).bitrate).toBe(320_000)
    expect(
      planFor(settings({ format: "m4a", channels: 1 }), song)
    ).toMatchObject({ codec: "aac", bitrate: 96_000, channels: 1 })
  })

  it("keeps a video's sound as it is under “Same as the file”, and says it came out of a video", () => {
    const plan = planFor(settings({ format: "same" }), film)
    expect(plan).toMatchObject({
      format: "m4a",
      codec: "aac",
      copy: true,
      bitrate: null,
      sampleRate: 48000,
      channels: 6,
    })
    expect(plan.notes).toEqual([
      "The sound is taken out of the video as it is, without being encoded again.",
    ])
    for (const [codec, format] of [
      ["mp3", "mp3"],
      ["opus", "opus"],
      ["vorbis", "ogg"],
      ["flac", "flac"],
      ["pcm-s24", "wav"],
    ])
      expect(
        planFor(settings({ format: "same" }), { ...song, codec })
      ).toMatchObject({ format, codec, copy: true })
  })

  it("encodes the file's own sound again when something about it must change", () => {
    const plan = planFor(
      settings({ format: "same", channels: 2, preset: "high" }),
      film
    )
    expect(plan).toMatchObject({ copy: false, codec: "aac", channels: 2 })
    expect(plan.bitrate).toBe(256_000)
    expect(plan.notes).toEqual([
      "The sound is encoded again in its own format, to meet what was chosen.",
      "The sound is taken out of the video; the picture is left behind.",
    ])
    // A size limit means encoding; a lossless file with one stays as it is.
    expect(
      planFor(settings({ format: "same", targetBytes: 1e6 }), song).copy
    ).toBe(false)
    expect(
      planFor(settings({ format: "same", targetBytes: 1e6 }), {
        ...song,
        codec: "flac",
      }).copy
    ).toBe(true)
    // A depth asked of a lossless file means encoding it again.
    expect(
      planFor(settings({ format: "same", depth: 24 }), {
        ...song,
        codec: "pcm-s16",
      })
    ).toMatchObject({ copy: false, codec: "pcm-s24", sampleFormat: "s32" })
  })

  it("writes Vorbis that must change as Opus, since only Firefox encodes Vorbis", () => {
    const plan = planFor(settings({ format: "same", channels: 1 }), {
      ...song,
      container: "ogg",
      codec: "vorbis",
    })
    expect(plan).toMatchObject({ format: "opus", codec: "opus", channels: 1 })
    expect(plan.notes).toContain(
      "Vorbis cannot be written here, so the sound is written as Opus, which plays wherever Vorbis does."
    )
  })

  it("writes sound it cannot keep as AAC, and says why", () => {
    const plan = planFor(settings({ format: "same" }), {
      ...film,
      codec: "ac3",
      channels: 2,
    })
    expect(plan).toMatchObject({ format: "m4a", codec: "aac", copy: false })
    expect(plan.notes[0]).toBe(
      "This file's sound (ac3) cannot be kept as it is, so it is written as AAC in an M4A file."
    )
    expect(
      planFor(settings({ format: "same" }), { ...song, codec: null }).notes[0]
    ).toContain("(of an unknown kind)")
  })

  it("mixes many channels down to stereo for lossy formats, and keeps them for lossless ones", () => {
    const plan = planFor(settings({ format: "opus" }), film)
    expect(plan.channels).toBe(2)
    expect(plan.notes).toContain(
      "The 6 channels are mixed down to stereo: Opus is written in mono or stereo here."
    )
    expect(planFor(settings({ format: "flac" }), film).channels).toBe(6)
  })

  it("writes at a rate the codec can hold, and says when it is not the one asked", () => {
    const opus = planFor(settings({ format: "opus" }), song)
    expect(opus.sampleRate).toBe(48000)
    expect(opus.notes).toEqual(["Opus is always written at 48 kHz."])
    expect(
      planFor(settings({ format: "opus", sampleRate: 48000 }), song).notes
    ).toEqual([])
    const mp3 = planFor(settings({ sampleRate: 96000 }), song)
    expect(mp3.sampleRate).toBe(48000)
    expect(mp3.notes).toEqual([
      "MP3 cannot be written at 96 kHz, so 48 kHz is used.",
    ])
    expect(
      planFor(settings({ format: "wav", sampleRate: 22050 }), song).sampleRate
    ).toBe(22050)
  })

  it("writes FLAC and WAV at the depth asked, or the file's own", () => {
    expect(planFor(settings({ format: "flac" }), song)).toMatchObject({
      codec: "flac",
      sampleFormat: "s16",
      bitrate: null,
    })
    expect(
      planFor(settings({ format: "flac" }), { ...song, codec: "pcm-s24" })
        .sampleFormat
    ).toBe("s32")
    const deep = planFor(settings({ format: "flac", depth: 32 }), song)
    expect(deep.sampleFormat).toBe("s32")
    expect(deep.notes).toEqual([
      "FLAC holds at most 24 bits, so 24 are written.",
    ])
    expect(planFor(settings({ format: "wav" }), song)).toMatchObject({
      codec: "pcm-s16",
      sampleFormat: "s16",
    })
    expect(planFor(settings({ format: "wav", depth: 24 }), song)).toMatchObject(
      { codec: "pcm-s24", sampleFormat: "s32" }
    )
    expect(planFor(settings({ format: "wav", depth: 32 }), song)).toMatchObject(
      { codec: "pcm-f32", sampleFormat: "f32" }
    )
  })

  it("writes MP3 below 32 kHz at 160 kbit/s at most", () => {
    const low = planFor(settings({ preset: "high", sampleRate: 22050 }), song)
    expect(low.bitrate).toBe(160_000)
    expect(low.notes).toEqual([
      "At 22.05 kHz, an MP3 holds at most 160 kbit/s, so it is written at that.",
    ])
    expect(
      planFor(settings({ preset: "small", sampleRate: 22050 }), song).notes
    ).toEqual([])
  })

  it("fits lossy files under a size, and says lossless ones cannot be", () => {
    const fitted = planFor(settings({ targetBytes: 2 * 1024 * 1024 }), song)
    // 2 MB over 200 s: about 81 kbit/s, so 80.
    expect(fitted.bitrate).toBe(80_000)
    expect(fitted.notes).toEqual([
      "To fit under 2.00 MB, it is written at 80 kbit/s.",
    ])
    const tiny = planFor(settings({ targetBytes: 20 * 1024 }), song)
    expect(tiny.bitrate).toBe(32_000)
    expect(tiny.notes[0]).toContain("cannot fit under 20.0 KB")
    // A limit above what the preset writes changes nothing.
    expect(planFor(settings({ targetBytes: 1e9 }), song).notes).toEqual([])
    expect(
      planFor(settings({ format: "wav", targetBytes: 1e6 }), song).notes
    ).toEqual([
      "WAV keeps every sample, so it cannot be made to fit a size; choose MP3, M4A or Opus for that.",
    ])
  })

  it("warns that an iPhone will not take a ringtone longer than 40 seconds", () => {
    expect(planFor(settings({ format: "m4r" }), song)).toMatchObject({
      format: "m4r",
      codec: "aac",
    })
    expect(planFor(settings({ format: "m4r" }), song).notes[0]).toContain(
      "at most 40 seconds"
    )
    expect(
      planFor(settings({ format: "m4r" }), { ...song, duration: 30 }).notes
    ).toEqual([])
  })
})

describe("bitrates and helpers", () => {
  it("rounds custom bitrates to those the codec offers, lower for mono", () => {
    expect(bitrateOf("mp3", { preset: "custom", bitrate: 150 }, 2)).toBe(160)
    expect(bitrateOf("mp3", { preset: "custom", bitrate: 150 }, 1)).toBe(96)
    expect(bitrateOf("opus", { preset: "custom", bitrate: 20 }, 1)).toBe(16)
    expect(bitrateOf("aac", { preset: "small", bitrate: 0 }, 1)).toBe(64)
  })

  it("picks the nearest value, the higher on a tie", () => {
    expect(nearest([8000, 16000], 12000)).toBe(16000)
    expect(nearest([44100, 48000], 46000)).toBe(44100)
  })

  it("reads a PCM codec's depth", () => {
    expect(depthOf("pcm-s24")).toBe(24)
    expect(depthOf("pcm-f32be")).toBe(32)
    expect(depthOf("flac")).toBeNull()
    expect(depthOf(null)).toBeNull()
  })

  it("refuses limits that cannot be met, and keys settings by what changes a result", () => {
    expect(settingsProblem(settings())).toBeNull()
    expect(settingsProblem(settings({ targetBytes: 1000 }))).toBe(
      "Choose a file size limit of at least 16 KB."
    )
    for (const sampleRate of [500, 384000])
      expect(settingsProblem(settings({ sampleRate }))).toBe(
        "Choose a sample rate between 8 and 192 kHz."
      )
    expect(settingsKey(settings({ bitrate: 64 }))).toBe(settingsKey(settings()))
    expect(settingsKey(settings({ preset: "custom", bitrate: 64 }))).not.toBe(
      settingsKey(settings({ preset: "custom", bitrate: 96 }))
    )
  })
})
