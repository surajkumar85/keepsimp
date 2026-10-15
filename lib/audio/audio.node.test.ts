// @vitest-environment node
/**
 * The engine with real files, in Node: what it reads is compared with what
 * FFmpeg reads, and what it writes is read back by FFmpeg. Node has no
 * WebCodecs, so only sound Mediabunny decodes itself (PCM) is decoded
 * here; lossy files are written (MP3 and FLAC through their WASM
 * encoders) and checked by FFmpeg. The browser tests cover the rest.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { checkResult } from "./check"
import { sniffContainer } from "./formats"
import { convertAudio, hearAudio, peaksOf, readAudio } from "./mediabunny-audio"
import { peakLevel } from "./peaks"
import { defaultSettings, planFor, type AudioSettings } from "./settings"
import { wavFromAiff } from "./wav"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))
const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart])
const folder = mkdtempSync(join(tmpdir(), "keepsimp-audio-"))

/** What FFprobe says of a file's sound and tags. */
function probe(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample,sample_fmt,duration,bit_rate:format_tags",
      "-of",
      "json",
      path,
    ]).toString()
  ) as {
    streams: Record<string, string | number>[]
    format: { tags?: Record<string, string> }
  }
}

/** How many samples per channel FFmpeg decodes from a file. */
function ffmpegFrames(bytes: Uint8Array, name: string, channels: number) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return (
    execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "s16le", "-"])
      .length /
    (2 * channels)
  )
}

const settings = (change: Partial<AudioSettings>): AudioSettings => ({
  ...defaultSettings,
  ...change,
})

describe("reading", () => {
  it("reads a WAV's facts and waveform as FFmpeg does", async () => {
    const wav = fixture("tone.wav")
    const facts = await readAudio(mediabunny, blob(wav), "wav")
    expect(facts).toMatchObject({
      container: "wav",
      codec: "pcm-s16",
      sampleRate: 22050,
      channels: 2,
      hasVideo: false,
      decodable: true,
      kept: null,
    })
    expect(facts.duration).toBeCloseTo(0.5, 5)
    const peaks = await peaksOf(mediabunny, blob(wav), facts)
    expect(peaks.min.length).toBe(2000)
    // A full-scale tone from FFmpeg's sine source peaks at 1/8.
    expect(peakLevel(peaks)).toBeGreaterThan(0.12)
    expect(peakLevel(peaks)).toBeLessThan(0.13)
  })

  it("reads an AIFF through the WAV it equals, keeping its tags", async () => {
    const made = wavFromAiff(fixture("tone-24.aiff"))
    const facts = await readAudio(mediabunny, blob(made.wav), "aiff")
    expect(facts).toMatchObject({
      container: "aiff",
      codec: "pcm-s24",
      sampleRate: 22050,
      channels: 2,
    })
  })

  it("says plainly when a file has no sound or cannot be read", async () => {
    await expect(
      readAudio(mediabunny, blob(new Uint8Array(100)), "wav")
    ).rejects.toThrow("This file could not be read.")
  })

  it("finds the MP3's sound without its encoder delay and padding", async () => {
    const mp3 = fixture("tone.mp3")
    expect(sniffContainer(mp3)).toBe("mp3")
    const facts = await readAudio(mediabunny, blob(mp3), "mp3")
    expect(facts.kept).toEqual({ start: expect.any(Number), length: 11025 })
    expect(facts.duration).toBe(0.5)
    // Node cannot decode MP3; a browser can.
    expect(facts.decodable).toBe(false)
  })
})

describe("writing", () => {
  const wav = fixture("tone.wav")
  const facts = async () => readAudio(mediabunny, blob(wav), "wav")

  it("writes WAV at another depth and rate, heard back as asked", async () => {
    const read = await facts()
    const plan = planFor(
      settings({ format: "wav", depth: 24, sampleRate: 44100, channels: 1 }),
      read
    )
    const bytes = await convertAudio(mediabunny, blob(wav), plan, read, {
      keepTags: true,
    })
    const [stream] = probe(bytes, "deep.wav").streams
    expect(stream).toMatchObject({
      codec_name: "pcm_s24le",
      sample_rate: "44100",
      channels: 1,
    })
    expect(ffmpegFrames(bytes, "deep.wav", 1)).toBe(22050)
    const heard = await hearAudio(mediabunny, bytes)
    expect(
      checkResult(
        {
          duration: 0.5,
          sampleRate: 44100,
          channels: 1,
          copy: false,
          audible: true,
        },
        heard
      )
    ).toEqual([])
  })

  it("writes FLAC with libFLAC at 16 and 24 bits, read back by FFmpeg sample for sample", async () => {
    const read = await facts()
    for (const depth of [16, 24] as const) {
      const plan = planFor(settings({ format: "flac", depth }), read)
      const bytes = await convertAudio(mediabunny, blob(wav), plan, read, {
        keepTags: true,
      })
      const [stream] = probe(bytes, `tone-${depth}.flac`).streams
      expect(stream).toMatchObject({
        codec_name: "flac",
        sample_rate: "22050",
        channels: 2,
      })
      expect(Number(stream.bits_per_raw_sample)).toBe(depth)
      // Lossless: FFmpeg decodes the same samples as from the WAV.
      const ours = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        join(folder, `tone-${depth}.flac`),
        "-f",
        "s16le",
        "-",
      ])
      const original = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        "tests/fixtures/audio/tone.wav",
        "-f",
        "s16le",
        "-",
      ])
      expect(ours.equals(original)).toBe(true)
    }
  })

  it("writes MP3 with LAME at the planned bitrate and length", async () => {
    const read = await facts()
    const plan = planFor(settings({ format: "mp3", preset: "high" }), read)
    // 22.05 kHz is MPEG-2: 160 kbit/s at most.
    expect(plan.bitrate).toBe(160_000)
    const bytes = await convertAudio(mediabunny, blob(wav), plan, read, {
      keepTags: true,
    })
    const [stream] = probe(bytes, "tone.mp3").streams
    expect(stream).toMatchObject({
      codec_name: "mp3",
      sample_rate: "22050",
      channels: 2,
    })
    // FFprobe gives the average over the file, the header frame and all.
    expect(Number(stream.bit_rate)).toBeGreaterThan(150_000)
    expect(Number(stream.bit_rate)).toBeLessThanOrEqual(160_000)
    // The LAME header we write gives the delay and padding: exactly the original length.
    expect(ffmpegFrames(bytes, "tone-out.mp3", 2)).toBe(11025)
  })

  it("keeps a file's tags, or writes none", async () => {
    // A WAV with a title, made by FFmpeg.
    const path = join(folder, "titled.wav")
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      "tests/fixtures/audio/tone.wav",
      "-metadata",
      "title=Tone",
      "-metadata",
      "artist=Ada",
      "-c",
      "copy",
      path,
    ])
    const titled = new Uint8Array(readFileSync(path))
    const read = await readAudio(mediabunny, blob(titled), "wav")
    expect(read.tags).toMatchObject({ title: "Tone", artist: "Ada" })
    const plan = planFor(settings({ format: "flac" }), read)
    const kept = await convertAudio(mediabunny, blob(titled), plan, read, {
      keepTags: true,
    })
    const tags = probe(kept, "kept.flac").format.tags ?? {}
    expect(tags.TITLE ?? tags.title).toBe("Tone")
    expect(tags.ARTIST ?? tags.artist).toBe("Ada")
    const none = await convertAudio(mediabunny, blob(titled), plan, read, {
      keepTags: false,
    })
    const left = probe(none, "none.flac").format.tags ?? {}
    expect(left.TITLE ?? left.title).toBeUndefined()
    // Given tags replace the file's own (for sound the page decoded).
    const given = await convertAudio(mediabunny, blob(wav), plan, read, {
      keepTags: true,
      tags: { title: "Given" },
    })
    const set = probe(given, "given.flac").format.tags ?? {}
    expect(set.TITLE ?? set.title).toBe("Given")
  })

  it("copies sound as it is under “Same as the file”", async () => {
    const read = await facts()
    const plan = planFor(settings({ format: "same" }), read)
    expect(plan.copy).toBe(true)
    const bytes = await convertAudio(mediabunny, blob(wav), plan, read, {
      keepTags: true,
    })
    expect(ffmpegFrames(bytes, "copy.wav", 2)).toBe(11025)
  })
})
