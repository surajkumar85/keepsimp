import { describe, expect, it } from "vitest"
import { FakePool } from "@/tests/agent-image-fake"
import type { ReadFacts } from "@/lib/audio/mediabunny-audio"
import type { AudioJob, AudioResponse, Written } from "@/lib/audio/protocol"
import type { LevelResult } from "@/lib/audio/level"
import type { Peaks } from "@/lib/audio/peaks"
import type {
  TranscribeJob,
  TranscribeMessage,
} from "@/lib/audio/transcribe.worker"
import type { VideoJob, VideoMessage } from "@/lib/audio/video.worker"
import { editedBy, lengthOf } from "@/lib/audio/edits"
import { LoudnessMeter, type LoudnessMap } from "@/lib/audio/loudness"
import { Agent } from "./agent"
import { audioTools, settingsOf } from "./audio"
import { PoolJobs } from "./pool-jobs"

const ID3 = Uint8Array.of(0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0)
const FLAC = Uint8Array.of(0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 34)
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16)
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)

const facts = (overrides: Partial<ReadFacts> = {}): ReadFacts => ({
  container: "mp3",
  codec: "mp3",
  sampleRate: 44100,
  channels: 2,
  duration: 10,
  hasVideo: false,
  tags: { title: "Song", artist: "Band" },
  cover: null,
  decodable: true,
  kept: { start: 529, length: 441000 },
  ...overrides,
})

/** A waveform 10 s long, loud but for a pause from 4 to 5 s. */
function peaksWithPause(): Peaks {
  const min = new Float32Array(1000).fill(-0.5)
  const max = new Float32Array(1000).fill(0.5)
  min.fill(0, 400, 500)
  max.fill(0, 400, 500)
  return { min, max }
}

/** A loudness map of 2 s of a quiet sine, or of silence. */
function loudness(level = 0.25) {
  const meter = new LoudnessMeter(44100, 2)
  const plane = new Float32Array(88200).map(
    (_, index) => Math.sin(index / 10) * level
  )
  meter.push([plane, plane])
  return meter.result()
}

interface Told {
  /** What reading each file finds, by its blob. */
  facts: Map<Blob, Partial<ReadFacts> | "none" | "broken">
  /** The waveform reading finds. */
  peaks: Peaks | null
  /** Whether the worker can listen to what it wrote. */
  heard: boolean
  /** How long what it wrote is, against what it should be. */
  stretch: number
  level: LevelResult | null
  inPlace: boolean
  loudness: LoudnessMap | null
}

function setup() {
  let pool!: FakePool<AudioJob, AudioResponse>
  const told: Told = {
    facts: new Map(),
    peaks: peaksWithPause(),
    heard: true,
    stretch: 1,
    level: null,
    inPlace: false,
    loudness: loudness(),
  }
  const written = (
    seconds: number,
    plan: { sampleRate: number; channels: number }
  ): Written => ({
    bytes: new Uint8Array(Math.round(seconds * 24_000)),
    heard: told.heard
      ? {
          duration: seconds * told.stretch,
          sampleRate: plan.sampleRate,
          channels: plan.channels,
          peak: 0.5,
          loudness: { integrated: -14, truePeak: -1.5 },
        }
      : null,
    level: told.level,
  })
  const audio = new PoolJobs<AudioJob, AudioResponse>(
    (listener, next) =>
      (pool = new FakePool<AudioJob, AudioResponse>(listener, next, (job) => {
        if (job.job === "read") {
          const found = told.facts.get(job.file) ?? {}
          if (found === "broken")
            return [
              {
                type: "open-error",
                id: job.id,
                message: "This file is damaged.",
              } as never,
            ]
          return [
            { type: "progress", id: job.id, key: "", fraction: 0.5 },
            ...(found === "none"
              ? []
              : [{ type: "facts" as const, id: job.id, facts: facts(found) }]),
            {
              type: "done",
              id: job.id,
              job: "read",
              peaks: told.peaks,
              spectrum: null,
              loudness: told.loudness,
            },
          ]
        }
        if (job.job === "join")
          return [
            { type: "progress", id: job.id, key: job.key, fraction: 0.5 },
            {
              type: "done",
              id: job.id,
              job: "join",
              key: job.key,
              plan: job.plan,
              written: written(job.plan.sampleRate ? 19 : 0, job.plan),
              length: 19,
            },
          ]
        const length =
          lengthOf(editedBy(job.facts.duration, job.edits)) / job.changes.tempo
        if (job.job === "split")
          return [
            { type: "progress", id: job.id, key: job.key, fraction: 0.5 },
            {
              type: "done",
              id: job.id,
              job: "split",
              key: job.key,
              plan: job.plan,
              parts: job.parts.map((part) =>
                written(part.to - part.from, job.plan)
              ),
            },
          ]
        return [
          { type: "progress", id: job.id, key: job.key, fraction: 0.5 },
          // Something the tool was not waiting for is let be.
          { type: "facts", id: job.id, facts: facts() },
          {
            type: "done",
            id: job.id,
            job: "convert",
            key: job.key,
            plan: job.plan,
            ...written(length, job.plan),
            inPlace: told.inPlace,
          },
        ]
      })),
    "audio"
  )
  const decoded: Blob[] = []
  let decodable = true
  const transcriptions: TranscribeJob[] = []
  let transcribing: ((message: TranscribeMessage) => void) | null = null
  const videos: VideoJob[] = []
  let drawing: ((message: VideoMessage) => void) | null = null
  const stopped = { transcribe: 0, video: 0 }
  const agent = new Agent(
    audioTools({
      pool: audio,
      decode: async (file) => {
        decoded.push(file)
        if (!decodable) throw new Error("No decoder.")
        const plane = new Float32Array(44100).map(
          (_, index) => Math.sin(index / 10) / 2
        )
        return { planes: [plane, plane], sampleRate: 44100 }
      },
      transcribe: (job, onMessage) => {
        transcriptions.push(job)
        transcribing = onMessage
        return () => stopped.transcribe++
      },
      video: (job, onMessage) => {
        videos.push(job)
        drawing = onMessage
        return () => stopped.video++
      },
      colours: () => ({
        background: "rgb(0, 0, 0)",
        foreground: "rgb(1, 1, 1)",
        muted: "rgb(2, 2, 2)",
        accent: "rgb(3, 3, 3)",
      }),
    })
  )
  const add = (
    bytes: Uint8Array,
    name: string,
    found: Partial<ReadFacts> | "none" | "broken" = {}
  ) => {
    const ref = agent.files.add(new Blob([bytes as BlobPart]), name)
    told.facts.set(agent.files.get(ref.id).blob, found)
    return ref.id
  }
  const progress: [number, string][] = []
  const call = (name: string, input: unknown, signal?: AbortSignal) =>
    agent.call(name, input, {
      caller: "page",
      signal,
      onProgress: (fraction, note) => progress.push([fraction, note]),
    })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    agent,
    add,
    call,
    told,
    progress,
    pool: () => pool,
    decoded,
    noDecoder: () => (decodable = false),
    transcriptions,
    transcribing: (message: TranscribeMessage) => transcribing!(message),
    videos,
    drawing: (message: VideoMessage) => drawing!(message),
    stopped,
    settle,
  }
}

describe("the settings a tool writes with", () => {
  it("lays what is asked over the workspace's defaults, and refuses what the workspace refuses", () => {
    expect(settingsOf({}, "same")).toMatchObject({
      format: "same",
      preset: "balanced",
      keepTags: true,
      targetBytes: null,
    })
    expect(
      settingsOf(
        {
          bitrate: 100,
          maxKilobytes: 100,
          channels: 1,
          sampleRate: 48000,
          depth: 24,
          keepTags: false,
          preset: "high",
        },
        "mp3"
      )
    ).toMatchObject({
      preset: "custom",
      bitrate: 100,
      targetBytes: 102400,
      channels: 1,
      sampleRate: 48000,
      depth: 24,
      keepTags: false,
    })
    expect(settingsOf({ preset: "small" }, "mp3").preset).toBe("small")
    expect(() => settingsOf({ maxKilobytes: 1 }, "mp3")).toThrow(
      /at least 16 KB/
    )
  })
})

describe("audio_info", () => {
  it("says what a file holds and how loud it is", async () => {
    const { add, call, told } = setup()
    const info = await call("audio_info", {
      file: add(ID3, "song.mp3", {
        cover: { data: JPEG, mimeType: "image/jpeg" },
        hasVideo: true,
      }),
    })
    expect(info.summary).toMatch(
      /^song\.mp3: MP3 in MP3, 10\.0 s, 44\.1 kHz, stereo, with video\. /
    )
    expect(info.data).toMatchObject({
      container: "mp3",
      seconds: 10,
      cover: "image/jpeg",
      tags: { title: "Song" },
    })
    expect(info.summary).toMatch(/ LUFS · range .* dBTP\.$/)
    const measured = (info.data as { loudness: { integrated: number } })
      .loudness
    expect(measured.integrated).toBeLessThan(-5)
    // Silence measures as no number, rather than minus infinity.
    told.loudness = loudness(0)
    const silent = await call("audio_info", { file: add(ID3, "s.mp3") })
    expect(silent.summary).toMatch(/Too quiet or too short to measure\.$/)
    expect(silent.data).toMatchObject({
      loudness: { integrated: null, truePeak: null },
    })
    told.peaks = null
    told.loudness = null
    const plain = await call("audio_info", { file: add(ID3, "b.mp3") })
    expect(plain.data).toMatchObject({ cover: null, loudness: null })
    expect(plain.summary).toMatch(/stereo\.$/)
  })

  it("refuses what is not sound, what the worker cannot read, and what says nothing", async () => {
    const { add, call } = setup()
    await expect(
      call("audio_info", {
        file: add(new TextEncoder().encode("hello"), "a.txt"),
      })
    ).rejects.toThrow(
      "a.txt is not a sound or video file that can be read here."
    )
    await expect(
      call("audio_info", { file: add(ID3, "a.mp3", "broken") })
    ).rejects.toThrow("This file is damaged.")
    await expect(
      call("audio_info", { file: add(ID3, "b.mp3", "none") })
    ).rejects.toThrow("b.mp3 could not be read.")
  })

  it("decodes on the page what the worker cannot, and says when the page cannot either", async () => {
    const { add, call, decoded, noDecoder } = setup()
    const info = await call("audio_info", {
      file: add(FLAC, "a.flac", {
        container: "flac",
        codec: "flac",
        decodable: false,
      }),
    })
    expect(decoded).toHaveLength(1)
    expect(info.summary).toMatch(/LUFS/)
    noDecoder()
    await expect(
      call("audio_info", { file: add(FLAC, "b.flac", { decodable: false }) })
    ).rejects.toThrow("This browser cannot decode the sound of b.flac.")
  })
})

describe("convert_audio", () => {
  it("writes an MP3 by default, checked, and says what the check found", async () => {
    const { add, call, pool, told, progress } = setup()
    const result = await call("convert_audio", {
      file: add(ID3, "a.wav", { container: "wav", codec: "pcm-s16" }),
    })
    expect(result.files![0]).toMatchObject({
      name: "a.mp3",
      type: "audio/mpeg",
    })
    expect(result.summary).toMatch(
      /^MP3, 234\.4 KB, 10\.0 s\. .*Checked: decoded again/
    )
    expect(pool().jobs.at(-1)).toMatchObject({
      job: "convert",
      plan: { format: "mp3", copy: false },
    })
    expect(progress).toContainEqual([0.5, "Writing"])
    told.heard = false
    expect(
      (await call("convert_audio", { file: add(ID3, "b.wav"), format: "same" }))
        .summary
    ).toMatch(/copied as it was.*cannot decode this format to check it/)
    told.heard = true
    told.stretch = 0.5
    const short = await call("convert_audio", { file: add(ID3, "c.wav") })
    expect(short.summary).toMatch(/The check found: /)
    expect(
      (short.data as { problems: string[] }).problems.length
    ).toBeGreaterThan(0)
    // A file with no waveform is taken to have sound.
    told.stretch = 1
    told.peaks = null
    const nameless = await call("convert_audio", { file: add(ID3, "d.mp3") })
    expect(nameless.summary).toMatch(/Checked/)
  })

  it("writes what the page decoded from its WAV, with the file's own tags", async () => {
    const { add, call, pool } = setup()
    await call("convert_audio", {
      file: add(FLAC, "a.flac", {
        container: "flac",
        codec: "flac",
        decodable: false,
      }),
      format: "m4a",
    })
    expect(pool().jobs.at(-1)).toMatchObject({
      container: "wav",
      tags: { title: "Song" },
    })
  })
})

describe("edit_audio", () => {
  it("edits in steps, each in the times the steps before left", async () => {
    const { add, call, pool } = setup()
    const result = await call("edit_audio", {
      file: add(ID3, "a.mp3"),
      steps: [
        { do: "keep", from: 1, to: 9 },
        { do: "cut", from: 0, to: 2 },
        { do: "fade", from: 0, to: 1 },
        { do: "fade", from: 5, to: 6, direction: "out", curve: "linear" },
        { do: "gain", from: 1, to: 2, db: -6 },
        { do: "gain", from: 2, to: 3 },
        { do: "silence", from: 3, to: 4 },
      ],
      tone: "voice",
      compressor: "gentle",
    })
    expect(result.files![0].name).toBe("a-edited.mp3")
    expect((result.data as { seconds: number }).seconds).toBeCloseTo(6)
    const job = pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>
    expect(job.edits[2]).toEqual({
      do: "fade",
      from: 0,
      to: 1,
      direction: "in",
      curve: "power",
    })
    expect(job.edits[5]).toMatchObject({ do: "gain", db: 0 })
    expect(job.sound).toMatchObject({
      compressor: "gentle",
      tone: { highPass: 80 },
    })
    const plain = await call("edit_audio", {
      file: add(ID3, "b.mp3"),
      steps: [{ do: "cut", from: 0, to: 1 }],
    })
    expect(plain.summary).toMatch(/Checked/)
  })

  it("names the step that does not fit", async () => {
    const { add, call } = setup()
    await expect(
      call("edit_audio", {
        file: add(ID3, "a.mp3"),
        steps: [
          { do: "keep", from: 0, to: 4 },
          { do: "cut", from: 3, to: 6 },
        ],
      })
    ).rejects.toThrow(
      "Step 2 (cut): Choose a part inside the sound. The sound is 4.00 s long at that step."
    )
  })
})

describe("make_ringtone", () => {
  it("makes the longest the phone takes, faded, from where it is asked", async () => {
    const { add, call, pool } = setup()
    const iphone = await call("make_ringtone", {
      file: add(ID3, "a.mp3", { duration: 60 }),
      kind: "iphone",
      start: 5,
    })
    expect(iphone.data).toMatchObject({ from: 5, to: 45 })
    expect(iphone.files![0].name).toBe("a-ringtone.m4r")
    expect(iphone.summary).toMatch(
      /^iPhone ringtone: 40\.0 s from 5\.00 s\. .*Finder/
    )
    const android = await call("make_ringtone", {
      file: add(ID3, "b.mp3"),
      kind: "android",
      start: 2,
      end: 20,
    })
    expect(android.data).toMatchObject({ from: 2, to: 10 })
    expect(android.summary).not.toMatch(/Finder/)
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).plan.format
    ).toBe("mp3")
    const alert = await call("make_ringtone", {
      file: add(ID3, "c.mp3"),
      kind: "alert",
      end: 5,
    })
    expect(alert.data).toMatchObject({ from: 0, to: 5 })
  })
})

describe("normalize_audio", () => {
  it("reaches a loudness, or makes louder, and says what it measures", async () => {
    const { add, call, pool, told } = setup()
    told.level = {
      mode: "loudness",
      before: null,
      db: 4,
      after: { integrated: -14, range: 5, truePeak: -1.2, peak: -1.5 },
      limited: 0,
      notes: ["Note from the level."],
    }
    const result = await call("normalize_audio", {
      file: add(ID3, "a.mp3"),
      target: -16,
    })
    expect(result.summary).toMatch(
      /Made 4 dB louder to −14 LUFS\. Note from the level\..* It measures -14\.0 LUFS, true peak -1\.2 dBTP\.$/
    )
    expect(result.files![0].name).toBe("a-normalised.mp3")
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).level
    ).toMatchObject({ mode: "loudness", target: -16, ceiling: -1 })
    told.level = null
    const louder = await call("normalize_audio", {
      file: add(ID3, "b.mp3"),
      mode: "louder",
      louder: 3,
      ceiling: -2,
    })
    expect(louder.files![0].name).toBe("b-louder.mp3")
    expect(louder.summary).not.toMatch(/It measures/)
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).level
    ).toMatchObject({ mode: "louder", louder: 3, ceiling: -2 })
  })
})

describe("change_audio_speed", () => {
  it("changes speed, pitch and channels, and holds the length at the new speed", async () => {
    const { add, call, pool } = setup()
    const result = await call("change_audio_speed", {
      file: add(ID3, "a.mp3"),
      tempo: 2,
      pitch: 3,
      keepPitch: false,
      reverse: true,
      channelChange: "karaoke",
      balance: 0.5,
    })
    expect(result.summary).toMatch(/Checked/)
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).changes
    ).toEqual({
      tempo: 2,
      pitch: 3,
      keepPitch: false,
      reverse: true,
      channels: "karaoke",
      balance: 0.5,
    })
    await call("change_audio_speed", { file: add(ID3, "b.mp3") })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).changes
    ).toMatchObject({ tempo: 1, keepPitch: true, channels: "same" })
  })
})

describe("remove_background_noise", () => {
  it("runs RNNoise fully by default, with what else is asked", async () => {
    const { add, call, pool } = setup()
    await call("remove_background_noise", { file: add(ID3, "a.mp3") })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).sound.repair
    ).toEqual({ denoise: 1, hum: 0, declick: false, deess: "off" })
    const result = await call("remove_background_noise", {
      file: add(ID3, "b.mp3"),
      denoise: 0.5,
      hum: 50,
      declick: true,
      deess: "gentle",
      tone: "rumble",
    })
    expect(result.files![0].name).toBe("b-clean.mp3")
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).sound
    ).toMatchObject({
      repair: { denoise: 0.5, hum: 50, declick: true, deess: "gentle" },
      tone: { highPass: 80 },
    })
  })
})

describe("edit_audio_tags", () => {
  it("changes fields and the cover, in place where it can", async () => {
    const { add, call, pool, told } = setup()
    told.inPlace = true
    const result = await call("edit_audio_tags", {
      file: add(ID3, "a.mp3"),
      fields: { title: "New", year: "2024" },
      cover: add(JPEG, "c.jpg"),
    })
    expect(result.summary).toMatch(/^Written in place/)
    expect(result.files![0].name).toBe("a.mp3")
    const job = pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>
    expect(job.change).toMatchObject({
      fields: { title: "New" },
      cover: { mimeType: "image/jpeg" },
    })
    await call("edit_audio_tags", {
      file: add(ID3, "b.mp3"),
      cover: add(PNG, "c.png"),
    })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).change.cover
    ).toMatchObject({ mimeType: "image/png" })
    await call("edit_audio_tags", {
      file: add(ID3, "d.mp3"),
      removeCover: true,
    })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).change
    ).toEqual({ fields: {}, cover: null })
  })

  it("refuses what cannot be written", async () => {
    const { add, call } = setup()
    const file = add(ID3, "a.mp3")
    await expect(
      call("edit_audio_tags", {
        file,
        cover: add(JPEG, "c.jpg"),
        removeCover: true,
      })
    ).rejects.toThrow('Give "cover" or "removeCover", not both.')
    await expect(call("edit_audio_tags", { file })).rejects.toThrow(
      'Give "fields", "cover" or "removeCover".'
    )
    await expect(
      call("edit_audio_tags", { file, cover: add(ID3, "c.gif") })
    ).rejects.toThrow("c.gif is not a JPEG or PNG picture.")
    await expect(
      call("edit_audio_tags", { file, fields: { year: "last year" } })
    ).rejects.toThrow(/year as a number/)
  })
})

describe("split_audio", () => {
  it("splits by minutes, by count and at pauses, each part checked", async () => {
    const { add, call, pool, told } = setup()
    const every = await call("split_audio", {
      file: add(ID3, "a.mp3", { duration: 150 }),
      by: "every",
      minutes: 1,
    })
    expect(every.files!.map((file) => file.name)).toEqual([
      "a-01.mp3",
      "a-02.mp3",
      "a-03.mp3",
    ])
    expect(every.summary).toMatch(
      /^Split into 3 parts of MP3\. Each was decoded again/
    )
    expect(pool().jobs.at(-1)).toMatchObject({ job: "split" })
    const count = await call("split_audio", {
      file: add(ID3, "b.mp3"),
      by: "count",
      parts: 4,
      format: "wav",
    })
    expect(count.files).toHaveLength(4)
    expect(count.files![0].name).toBe("b-01.wav")
    const pauses = await call("split_audio", {
      file: add(ID3, "c.mp3"),
      by: "silence",
      pause: 0.5,
    })
    expect(
      (pauses.data as { parts: { from: number }[] }).parts[1].from
    ).toBeCloseTo(4.5, 1)
    const dropped = await call("split_audio", {
      file: add(ID3, "d.mp3"),
      by: "silence",
      dropPauses: true,
      pause: 0.5,
    })
    expect(
      (dropped.data as { parts: { to: number }[] }).parts[0].to
    ).toBeCloseTo(4.1, 1)
    told.stretch = 2
    const long = await call("split_audio", {
      file: add(ID3, "e.mp3"),
      by: "count",
    })
    expect(long.summary).toMatch(/The check found: Part 1: /)
  })

  it("says when a rule gives one part, as a file with no waveform has no pauses", async () => {
    const { add, call, told } = setup()
    await expect(
      call("split_audio", { file: add(ID3, "a.mp3"), by: "every" })
    ).rejects.toThrow(/only one part/)
    told.peaks = null
    await expect(
      call("split_audio", { file: add(ID3, "b.mp3"), by: "silence" })
    ).rejects.toThrow(/only one part/)
  })
})

describe("join_audio", () => {
  it("joins files in order, with chapters titled from their tags or names", async () => {
    const { add, call, pool, progress } = setup()
    const result = await call("join_audio", {
      files: [add(ID3, "one.mp3"), add(ID3, "two.mp3", { tags: {} })],
      crossfade: 1,
    })
    expect(result.files![0].name).toBe("one-joined.mp3")
    expect(result.summary).toMatch(
      /^Joined 2 files, with a chapter for each\. /
    )
    const job = pool().jobs.at(-1) as Extract<AudioJob, { job: "join" }>
    expect(job.parts.map((part) => part.title)).toEqual(["Song", "two"])
    expect(job.joining).toEqual({ gap: 0, crossfade: 1 })
    expect(progress).toContainEqual([0.5, "Joining"])
    const plain = await call("join_audio", {
      files: [add(ID3, "a.mp3"), add(ID3, "b.mp3")],
      chapters: false,
      gap: 1,
      format: "wav",
    })
    expect(plain.summary).toMatch(/^Joined 2 files\. /)
  })

  it("refuses a gap and a crossfade together", async () => {
    const { add, call } = setup()
    await expect(
      call("join_audio", {
        files: [add(ID3, "a.mp3"), add(ID3, "b.mp3")],
        gap: 1,
        crossfade: 1,
      })
    ).rejects.toThrow("Choose a gap or a crossfade, not both.")
  })
})

describe("transcribe_audio", () => {
  it("writes text, SRT and VTT from what Whisper heard", async () => {
    const {
      add,
      call,
      transcribing,
      transcriptions,
      progress,
      stopped,
      settle,
    } = setup()
    const running = call("transcribe_audio", {
      file: add(ID3, "talk.mp3"),
      language: "en",
      times: true,
      model: "small",
      translate: true,
    })
    while (!transcriptions.length) await settle()
    expect(transcriptions[0]).toMatchObject({
      kept: { start: 529 },
      model: "small",
      language: "en",
      translate: true,
      duration: 10,
    })
    transcribing({ type: "loading", fraction: 0.5 })
    transcribing({ type: "language", code: "en" })
    transcribing({
      type: "segments",
      segments: [{ from: 0, to: 2, text: "Hello there." }] as never,
      done: 5,
    })
    transcribing({ type: "done" })
    const result = await running
    expect(result.files!.map((file) => file.name)).toEqual([
      "talk.txt",
      "talk.srt",
      "talk.vtt",
    ])
    expect(result.summary).toMatch(
      /^Transcribed 1 phrase, as text, SRT and VTT\. Whisper can mishear/
    )
    expect((result.data as { text: string }).text).toMatch(/Hello there\./)
    expect(progress).toContainEqual([0.1, "Loading Whisper"])
    expect(progress[1][0]).toBeCloseTo(0.6)
    expect(stopped.transcribe).toBe(1)
  })

  it("hears a decoded copy from its start, says when nothing was said, and keeps long text out of the answer", async () => {
    const { add, call, transcribing, transcriptions, settle } = setup()
    const silent = call("transcribe_audio", {
      file: add(FLAC, "a.flac", { decodable: false }),
    })
    while (!transcriptions.length) await settle()
    expect(transcriptions[0]).toMatchObject({
      kept: null,
      model: "base",
      language: "",
      translate: false,
    })
    expect(transcriptions[0].file.type).toBe("audio/wav")
    transcribing({ type: "done" })
    expect((await silent).summary).toBe("No speech was heard.")
    const long = call("transcribe_audio", { file: add(ID3, "b.mp3") })
    while (transcriptions.length < 2) await settle()
    transcribing({
      type: "segments",
      segments: [{ from: 0, to: 2, text: "word ".repeat(5000) }] as never,
      done: 2,
    })
    transcribing({ type: "done" })
    expect((await long).data).toMatchObject({ text: undefined, phrases: 1 })
  })

  it("says what Whisper could not do, and stops when asked", async () => {
    const { add, call, transcribing, transcriptions, stopped, settle } = setup()
    const failing = call("transcribe_audio", { file: add(ID3, "a.mp3") })
    while (!transcriptions.length) await settle()
    transcribing({ type: "error", message: "The model could not be loaded." })
    await expect(failing).rejects.toThrow("The model could not be loaded.")
    const stop = new AbortController()
    const running = call(
      "transcribe_audio",
      { file: add(ID3, "b.mp3") },
      stop.signal
    )
    while (transcriptions.length < 2) await settle()
    stop.abort()
    await expect(running).rejects.toThrow()
    expect(stopped.transcribe).toBe(2)
  })
})

describe("audio_to_video", () => {
  const done = (
    seconds = 10,
    check = { video: true, audio: true, seconds }
  ): VideoMessage => ({
    type: "done",
    video: { bytes: new Uint8Array(1000), container: "mp4", seconds },
    check,
  })

  it("draws the written sound with its cover, title and the theme's colours", async () => {
    const { add, call, agent, videos, drawing, progress, settle } = setup()
    const running = call("audio_to_video", {
      file: add(ID3, "song.mp3", {
        cover: { data: JPEG, mimeType: "image/jpeg" },
      }),
      shape: "portrait",
    })
    while (!videos.length) await settle()
    expect(videos[0]).toMatchObject({
      title: "Song",
      artist: "Band",
      look: { shape: "portrait", waveform: true, title: true },
      colours: { accent: "rgb(3, 3, 3)" },
    })
    expect(videos[0].picture!.type).toBe("image/jpeg")
    expect(videos[0].file.type).toBe("audio/mpeg")
    drawing({ type: "progress", fraction: 0.25 })
    drawing(done())
    const result = await running
    expect(result.summary).toMatch(
      /^Checked: MP4 with H\.264 and AAC, 10\.0 s, 1000 B, Portrait/
    )
    expect(progress).toContainEqual([0.25, "Drawing the video"])
    // Only the song and the video are kept: the sound written for it was a step on the way.
    expect(agent.files.list().map((file) => file.name)).toEqual([
      "song.mp3",
      "song-video.mp4",
    ])
  })

  it("takes a picture of the person's, or none, and says when it writes WebM", async () => {
    const { add, call, videos, drawing, settle } = setup()
    const picture = add(PNG, "p.png")
    const running = call("audio_to_video", {
      file: add(ID3, "a.mp3", { tags: {} }),
      picture,
      waveform: false,
      title: false,
    })
    while (!videos.length) await settle()
    expect(videos[0]).toMatchObject({
      title: "a",
      artist: "",
      look: { waveform: false, title: false },
    })
    drawing({
      type: "done",
      video: { bytes: new Uint8Array(10), container: "webm", seconds: 10 },
      check: { video: true, audio: true, seconds: 10 },
    })
    expect((await running).summary).toMatch(/WebM with VP9 and Opus/)
    const none = call("audio_to_video", { file: add(ID3, "b.mp3") })
    while (videos.length < 2) await settle()
    expect(videos[1].picture).toBeNull()
    drawing(done())
    await none
  })

  it("decodes on the page what the worker cannot, once", async () => {
    const { add, call, videos, drawing, decoded, settle, noDecoder } = setup()
    const running = call("audio_to_video", { file: add(ID3, "a.mp3") })
    while (!videos.length) await settle()
    drawing({ type: "undecodable" })
    while (videos.length < 2) await settle()
    expect(videos[1].file.type).toBe("audio/wav")
    expect(decoded).toHaveLength(1)
    drawing({ type: "undecodable" })
    await expect(running).rejects.toThrow(
      "This browser cannot decode this sound to make a video."
    )
    noDecoder()
    const failing = call("audio_to_video", { file: add(ID3, "b.mp3") })
    while (videos.length < 3) await settle()
    drawing({ type: "undecodable" })
    await expect(failing).rejects.toThrow(
      "This browser cannot decode this sound to make a video."
    )
  })

  it("hands over no video that does not hold, and stops when asked", async () => {
    const { add, call, videos, drawing, stopped, settle } = setup()
    const asked = async (message: VideoMessage) => {
      const running = call("audio_to_video", { file: add(ID3, "a.mp3") })
      const count = videos.length
      while (videos.length === count) await settle()
      drawing(message)
      return running
    }
    await expect(
      asked({ type: "error", message: "No encoder." })
    ).rejects.toThrow("No encoder.")
    await expect(
      asked(done(10, { video: false, audio: true, seconds: 10 }))
    ).rejects.toThrow(/without its picture or its sound/)
    await expect(
      asked(done(10, { video: true, audio: true, seconds: 8 }))
    ).rejects.toThrow(
      "The video came out 8.00 s long for 10.0 s of sound, so it is not handed over."
    )
    const stop = new AbortController()
    const running = call(
      "audio_to_video",
      { file: add(ID3, "b.mp3") },
      stop.signal
    )
    while (videos.length < 4) await settle()
    const before = stopped.video
    stop.abort()
    await expect(running).rejects.toThrow()
    expect(stopped.video).toBe(before + 1)
  })
})

describe("the editor's silence tools, its own equaliser, split times and a plain video", () => {
  /** 10 s: silent for the first second, loud, a pause from 4 to 5 s, loud, silent for the last second. */
  function quietEnds(): Peaks {
    const peaks = peaksWithPause()
    peaks.min.fill(0, 0, 100)
    peaks.max.fill(0, 0, 100)
    peaks.min.fill(0, 900, 1000)
    peaks.max.fill(0, 900, 1000)
    return peaks
  }

  it("trims silence at the ends and shortens pauses, after the steps given", async () => {
    const { add, call, pool, told } = setup()
    told.peaks = quietEnds()
    const done = await call("edit_audio", {
      file: add(ID3, "a.mp3"),
      trimSilence: true,
      shortenPauses: 0.5,
      silentUnder: -60,
    })
    expect(done.summary).toMatch(
      /^The silence at the ends was trimmed\. 1 pause shortened, 0\.60 s taken out\. /
    )
    const job = pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>
    expect(job.edits[0]).toMatchObject({ do: "keep" })
    expect(job.edits[0].from).toBeCloseTo(0.9, 1)
    expect(job.edits[1]).toMatchObject({ do: "cut" })
    // A file with no silence at its ends and no long pause is left as it was.
    told.peaks = peaksWithPause()
    await expect(
      call("edit_audio", {
        file: add(ID3, "b.mp3"),
        trimSilence: true,
        shortenPauses: 2,
      })
    ).rejects.toThrow(
      "There was no silence at the ends to trim. No pause was longer than 2 s. Nothing was changed."
    )
    // Without a waveform there is no silence to find.
    told.peaks = null
    await expect(
      call("edit_audio", { file: add(ID3, "c.mp3"), trimSilence: true })
    ).rejects.toThrow(
      "There was no silence at the ends to trim. Nothing was changed."
    )
    await expect(
      call("edit_audio", { file: add(ID3, "d.mp3") })
    ).rejects.toThrow('Give "steps", "trimSilence" or "shortenPauses".')
  })

  it("takes the equaliser's own settings, or a preset, not both", async () => {
    const { add, call, pool } = setup()
    await call("edit_audio", {
      file: add(ID3, "a.mp3"),
      steps: [{ do: "cut", from: 0, to: 1 }],
      equaliser: { highPass: 60, bass: -3, treble: 2 },
    })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).sound.tone
    ).toEqual({
      highPass: 60,
      lowPass: null,
      bass: -3,
      mid: 0,
      treble: 2,
    })
    await call("remove_background_noise", {
      file: add(ID3, "b.mp3"),
      equaliser: { lowPass: 8000, mid: 4 },
    })
    expect(
      (pool().jobs.at(-1) as Extract<AudioJob, { job: "convert" }>).sound.tone
    ).toEqual({
      highPass: null,
      lowPass: 8000,
      bass: 0,
      mid: 4,
      treble: 0,
    })
    await expect(
      call("edit_audio", {
        file: add(ID3, "c.mp3"),
        steps: [{ do: "cut", from: 0, to: 1 }],
        tone: "voice",
        equaliser: { bass: 1 },
      })
    ).rejects.toThrow(
      'Give an equaliser preset ("tone") or its settings ("equaliser"), not both.'
    )
  })

  it("splits at the times given, and asks for them", async () => {
    const { add, call } = setup()
    const done = await call("split_audio", {
      file: add(ID3, "a.mp3"),
      by: "times",
      at: [2, 7],
    })
    expect(
      (done.data as { parts: { from: number; to: number }[] }).parts.map(
        (part) => [part.from, part.to]
      )
    ).toEqual([
      [0, 2],
      [2, 7],
      [7, 10],
    ])
    await expect(
      call("split_audio", { file: add(ID3, "b.mp3"), by: "times" })
    ).rejects.toThrow('Give the times to split at as "at".')
  })

  it("leaves the cover out of a video when asked", async () => {
    const { add, call, videos, drawing, settle } = setup()
    const running = call("audio_to_video", {
      file: add(ID3, "a.mp3", {
        cover: { data: JPEG, mimeType: "image/jpeg" },
      }),
      cover: false,
    })
    while (!videos.length) await settle()
    expect(videos[0].picture).toBeNull()
    drawing({
      type: "done",
      video: { bytes: new Uint8Array(10), container: "mp4", seconds: 10 },
      check: { video: true, audio: true, seconds: 10 },
    })
    await running
  })
})
