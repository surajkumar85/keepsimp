import { describe, expect, it } from "vitest"
import type { Heard } from "./check"
import { joinJob, joinPlan, resultProblems, tagsOf, writeJob } from "./jobs"
import type { ReadFacts } from "./mediabunny-audio"
import { defaultSettings, type AudioSettings } from "./settings"
import { defaultSound } from "./sound"

const facts = (overrides: Partial<ReadFacts> = {}): ReadFacts => ({
  container: "mp3",
  codec: "mp3",
  sampleRate: 44100,
  channels: 2,
  duration: 10,
  hasVideo: false,
  tags: { title: "Song", artist: "Band" },
  cover: { data: Uint8Array.of(1, 2), mimeType: "image/png" },
  decodable: true,
  kept: { start: 529, length: 441000 },
  ...overrides,
})
const file = new Blob(["sound"])
const wav = new Blob(["wav"])
const same: AudioSettings = { ...defaultSettings, format: "same" }

describe("the jobs the audio worker is given", () => {
  it("keeps a file's tags for its decoded copy, with or without a cover", () => {
    expect(tagsOf(facts({ cover: null }))).toEqual(
      tagsOf(facts({ cover: null, tags: { title: "Song", artist: "Band" } }))
    )
    expect(Object.keys(tagsOf(facts())).length).toBeGreaterThan(
      Object.keys(tagsOf(facts({ cover: null }))).length
    )
  })

  it("writes a file as it came, with its tags", () => {
    const job = writeJob(
      "a",
      { file, container: "mp3", facts: facts(), edits: [] },
      defaultSettings,
      "key"
    )
    expect(job).toMatchObject({
      job: "convert",
      id: "a",
      file,
      container: "mp3",
      key: "key",
      tags: undefined,
      keepTags: true,
    })
    expect(job.plan.format).toBe("mp3")
    expect(job.change).toEqual({ fields: {} })
    expect(job.facts.kept).toEqual({ start: 529, length: 441000 })
  })

  it("writes from the page's WAV, with the file's own tags, unless the sound is copied", () => {
    const decoded = writeJob(
      "a",
      {
        file,
        container: "mp3",
        facts: facts(),
        decoded: wav,
        edits: [],
        change: { fields: { title: "New" } },
      },
      { ...defaultSettings, format: "flac" },
      "key"
    )
    expect(decoded).toMatchObject({
      file: wav,
      container: "wav",
      change: { fields: { title: "New" } },
    })
    expect(decoded.facts.kept).toBeNull()
    expect(decoded.tags).toEqual(tagsOf(facts()))
    // A copy never decodes, so it is made from the file itself.
    const copied = writeJob(
      "a",
      { file, container: "mp3", facts: facts(), decoded: wav, edits: [] },
      same,
      "key"
    )
    expect(copied.plan.copy).toBe(true)
    expect(copied).toMatchObject({ file, container: "mp3", tags: undefined })
  })

  it("writes an edited file, or its parts, encoded again and at its edited length", () => {
    const edited = writeJob(
      "a",
      {
        file,
        container: "mp3",
        facts: facts(),
        edits: [{ do: "keep", from: 2, to: 6 }],
      },
      same,
      "key"
    )
    expect(edited.plan.copy).toBe(false)
    const parts = [
      { from: 0, to: 4 },
      { from: 4, to: 10 },
    ]
    const split = writeJob(
      "split:a",
      { file, container: "mp3", facts: facts(), edits: [] },
      same,
      "key",
      parts
    )
    expect(split).toMatchObject({ job: "split", id: "split:a", parts })
    expect(split.plan.copy).toBe(false)
  })

  it("joins files in order, with as many channels as the most and the first file's tags", () => {
    const plan = joinPlan(
      [facts({ channels: 1 }), facts({ channels: 2 })],
      defaultSettings,
      20
    )
    expect(plan.channels).toBe(2)
    expect(joinPlan([], defaultSettings, 5)).toMatchObject({
      format: "mp3",
      sampleRate: 44100,
    })
    const job = joinJob(
      [
        {
          file,
          container: "mp3",
          facts: facts(),
          edits: [],
          title: "One",
          change: { fields: { title: "Both" } },
        },
        {
          file,
          container: "flac",
          facts: facts({ container: "flac" }),
          decoded: wav,
          edits: [],
          title: "Two",
        },
      ],
      {
        settings: { ...defaultSettings, format: "m4a" },
        joining: { gap: 0, crossfade: 1 },
        chapters: true,
        length: 19,
        key: "join-key",
      }
    )
    expect(job).toMatchObject({
      job: "join",
      id: "join",
      chapters: true,
      key: "join-key",
      joining: { crossfade: 1 },
    })
    expect(job.parts[0]).toMatchObject({ file, container: "mp3", title: "One" })
    expect(job.parts[1]).toMatchObject({
      file: wav,
      container: "wav",
      title: "Two",
    })
    expect(job.parts[1].facts.kept).toBeNull()
    expect(job.tags).toBeTruthy()
    const plain = joinJob(
      [{ file, container: "mp3", facts: facts(), edits: [], title: "One" }],
      {
        settings: {
          ...defaultSettings,
          keepTags: false,
          changes: { ...defaultSettings.changes, reverse: true },
        },
        joining: { gap: 0, crossfade: 0 },
        chapters: true,
        length: 10,
        key: "k",
      }
    )
    // Reversed sound has no chapters to keep in order; no tags were asked for.
    expect(plain).toMatchObject({ chapters: false, tags: undefined })
    expect(
      joinJob(
        [{ file, container: "mp3", facts: facts(), edits: [], title: "One" }],
        {
          settings: { ...defaultSettings, format: "wav" },
          joining: { gap: 0, crossfade: 0 },
          chapters: true,
          length: 10,
          key: "k",
        }
      ).chapters
    ).toBe(false)
  })
})

describe("holding a written file to what was asked", () => {
  const heard = (overrides: Partial<Heard> = {}): Heard => ({
    duration: 10,
    sampleRate: 44100,
    channels: 2,
    peak: 0.5,
    ...overrides,
  })
  const plan = writeJob(
    "a",
    { file, container: "mp3", facts: facts(), edits: [] },
    defaultSettings,
    "k"
  ).plan

  it("says nothing of a file that could not be listened to", () => {
    expect(
      resultProblems({
        plan,
        written: { heard: null, level: null },
        bytes: 1,
        duration: 10,
        settings: defaultSettings,
        audible: true,
      })
    ).toEqual([])
  })

  it("holds the length at the speed written, and an MP3 to its bitrate", () => {
    const fast = {
      ...defaultSettings,
      changes: { ...defaultSettings.changes, tempo: 2 },
    }
    const right = resultProblems({
      plan,
      written: { heard: heard({ duration: 5 }), level: null },
      bytes: 120_000,
      duration: 10,
      settings: fast,
      audible: true,
    })
    expect(right).toEqual([])
    const joined = resultProblems({
      plan,
      written: { heard: heard({ duration: 5 }), level: null },
      bytes: 120_000,
      duration: 5,
      settings: fast,
      audible: true,
      atSpeed: true,
    })
    expect(joined).toEqual([])
    const short = resultProblems({
      plan,
      written: { heard: heard({ duration: 2 }), level: null },
      bytes: 120_000,
      duration: 10,
      settings: defaultSettings,
      audible: true,
    })
    expect(short.join(" ")).toMatch(/s long/)
    const thin = resultProblems({
      plan,
      written: { heard: heard(), level: null },
      bytes: 100,
      duration: 10,
      settings: defaultSettings,
      audible: true,
    })
    expect(thin.length).toBeGreaterThan(0)
  })

  it("holds loudness and a lossless file's ceiling where they were asked", () => {
    const flac = writeJob(
      "a",
      { file, container: "mp3", facts: facts(), edits: [] },
      { ...defaultSettings, format: "flac" },
      "k"
    ).plan
    const loud = {
      ...defaultSettings,
      format: "flac" as const,
      level: {
        ...defaultSettings.level,
        mode: "loudness" as const,
        target: -14,
        ceiling: -1,
      },
    }
    const over = resultProblems({
      plan: flac,
      written: {
        heard: heard({ loudness: { integrated: -20, truePeak: 1 } }),
        level: { notes: [] } as never,
      },
      bytes: 1e6,
      duration: 10,
      settings: loud,
      audible: true,
    })
    expect(over.length).toBeGreaterThan(0)
    // The page said why it could not reach the loudness: it is not held to it.
    const said = resultProblems({
      plan: flac,
      written: {
        heard: heard({ loudness: { integrated: -20, truePeak: -2 } }),
        level: { notes: ["too quiet"] } as never,
      },
      bytes: 1e6,
      duration: 10,
      settings: loud,
      audible: true,
    })
    expect(said).toEqual([])
    const shaped = {
      ...defaultSettings,
      format: "flac" as const,
      sound: { ...defaultSound, compressor: "voice" as const },
    }
    expect(
      resultProblems({
        plan: flac,
        written: {
          heard: heard({ loudness: { integrated: -10, truePeak: 0.5 } }),
          level: null,
        },
        bytes: 1e6,
        duration: 10,
        settings: shaped,
        audible: true,
      }).length
    ).toBeGreaterThan(0)
    const plainFlac = { ...defaultSettings, format: "flac" as const }
    expect(
      resultProblems({
        plan: flac,
        written: {
          heard: heard({ loudness: { integrated: -10, truePeak: 3 } }),
          level: null,
        },
        bytes: 1e6,
        duration: 10,
        settings: plainFlac,
        audible: false,
      })
    ).toEqual([])
  })
})
