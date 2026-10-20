// @vitest-environment node
/**
 * Levels written by the engine and measured by FFmpeg's ebur128 filter: a
 * file normalised to a loudness reaches it with its true peak under the
 * ceiling, one normalised to a peak reaches that peak, and one made louder
 * is held under the ceiling by the limiter, with nothing added or lost.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { defaultLevel, type Level } from "./level"
import { defaultSound, type SoundSettings } from "./sound"
import { TONE_PRESETS } from "./tone"
import { convertAudio, readAudio } from "./mediabunny-audio"
import type { OutputFormat } from "./formats"
import { defaultSettings, planFor } from "./settings"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-level-"))
const RATE = 44100

/** Ten seconds of pink noise, quiet with two loud bursts (or steady), as a 16-bit WAV. */
function source(steady = false) {
  const path = join(folder, steady ? "steady.wav" : "source.wav")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=d=10:c=pink:a=0.25:s=3",
    "-af",
    steady
      ? "volume=0.3,aformat=channel_layouts=stereo"
      : "volume='if(between(t,3,3.5)+between(t,7,7.2),3,0.15)':eval=frame,aformat=channel_layouts=stereo",
    "-ar",
    String(RATE),
    "-c:a",
    "pcm_s16le",
    path,
  ])
  return new Uint8Array(readFileSync(path))
}

/** What FFmpeg measures of a file: integrated loudness, true peak, and length in frames. */
function measured(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const text = execFileSync(
    "sh",
    [
      "-c",
      `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true -f null - 2>&1`,
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 }
  )
  const tail = text.slice(text.lastIndexOf("Summary:"))
  const frames =
    execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "s16le", "-"], {
      maxBuffer: 1 << 30,
    }).length / 4
  return {
    integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)![1]),
    truePeak: Number(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(tail)![1]),
    frames,
  }
}

const wav = source()
const before = measured(wav, "before.wav")

const steady = source(true)

async function leveled(
  level: Level,
  format: OutputFormat = "wav",
  bytes: Uint8Array = wav,
  sound: SoundSettings = defaultSound
) {
  const blob = new Blob([bytes as BlobPart])
  const facts = await readAudio(mediabunny, blob, "wav")
  const plan = planFor({ ...defaultSettings, format, level, sound }, facts)
  return convertAudio(mediabunny, blob, plan, facts, {
    keepTags: false,
    level,
    sound,
  })
}

/** A file FFmpeg makes from a lavfi source, as a 16-bit stereo WAV. */
function made(name: string, source: string) {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    source,
    "-af",
    "aformat=channel_layouts=stereo",
    "-ar",
    String(RATE),
    "-c:a",
    "pcm_s16le",
    path,
  ])
  return new Uint8Array(readFileSync(path))
}

/** FFmpeg's loudness range of a file, in LU. */
function rangeOf(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const text = execFileSync(
    "sh",
    [
      "-c",
      `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128 -f null - 2>&1`,
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 }
  )
  return Number(
    /LRA:\s+(-?[\d.]+) LU/.exec(text.slice(text.lastIndexOf("Summary:")))![1]
  )
}

// Each writes a file up to three times; under coverage that takes a while.
describe("levels written", { timeout: 120_000 }, () => {
  it("starts quiet, with loud bursts", () => {
    expect(before.integrated).toBeLessThan(-18)
    expect(before.frames).toBe(10 * RATE)
  })

  it("normalises to −14 LUFS with true peaks under −1 dBTP, every frame kept", async () => {
    const level: Level = { ...defaultLevel, mode: "loudness", target: -14 }
    const { bytes, level: result } = await leveled(level)
    const after = measured(bytes, "loud.wav")
    expect(Math.abs(after.integrated - -14)).toBeLessThan(0.5)
    expect(after.truePeak).toBeLessThanOrEqual(-1 + 0.2)
    expect(after.frames).toBe(10 * RATE)
    // What the engine says it did, as FFmpeg measured it.
    expect(result!.mode).toBe("loudness")
    expect(result!.before!.integrated).toBeCloseTo(before.integrated, 0)
    expect(result!.db).toBeGreaterThan(5)
    expect(result!.after.integrated).toBeCloseTo(after.integrated, 0)
  })

  it("reaches −9 LUFS by limiting hard, and still keeps the ceiling", async () => {
    const level: Level = { ...defaultLevel, mode: "loudness", target: -9 }
    const { bytes, level: result } = await leveled(level, "wav", steady)
    const after = measured(bytes, "louder-still.wav")
    expect(Math.abs(after.integrated - -9)).toBeLessThan(0.5)
    expect(after.truePeak).toBeLessThanOrEqual(-1 + 0.2)
    expect(result!.limited).toBeGreaterThan(2)
    expect(result!.notes).toEqual([])
  })

  it("says so when the ceiling keeps it from the target, and keeps its best try", async () => {
    // Its loudness is all in short bursts: limited to −1 dBTP they cannot reach −9.
    const level: Level = { ...defaultLevel, mode: "loudness", target: -9 }
    const { bytes, level: result } = await leveled(level)
    const after = measured(bytes, "short-of.wav")
    expect(after.truePeak).toBeLessThanOrEqual(-1 + 0.2)
    expect(after.integrated).toBeGreaterThan(-14)
    expect(result!.notes[0]).toMatch(
      /^Under a −1 dBTP ceiling it reaches only −1\d(\.\d)? LUFS; a higher ceiling lets it get louder\.$/
    )
  })

  it("normalises to −23 LUFS quieter, the limiter idle", async () => {
    const level: Level = { ...defaultLevel, mode: "loudness", target: -23 }
    const { bytes, level: result } = await leveled(level)
    const after = measured(bytes, "broadcast.wav")
    expect(Math.abs(after.integrated - -23)).toBeLessThan(0.3)
    expect(after.truePeak).toBeLessThanOrEqual(-1 + 0.2)
    expect(result!.limited).toBeLessThan(2)
  })

  it("normalises the highest true peak to −1 dBTP, without a limiter", async () => {
    const level: Level = { ...defaultLevel, mode: "peak", ceiling: -1 }
    const { bytes, level: result } = await leveled(level)
    const after = measured(bytes, "peak.wav")
    expect(Math.abs(after.truePeak - -1)).toBeLessThan(0.3)
    expect(result!.limited).toBe(0)
    expect(after.integrated - before.integrated).toBeCloseTo(result!.db, 0)
  })

  it("makes it 12 dB louder, held under the ceiling, as an MP3 of exactly its length", async () => {
    const level: Level = { ...defaultLevel, mode: "louder", louder: 12 }
    const { bytes, level: result } = await leveled(level, "mp3")
    const after = measured(bytes, "louder.mp3")
    expect(after.frames).toBe(10 * RATE)
    expect(after.integrated - before.integrated).toBeGreaterThan(9)
    // An MP3 encoder adds a little to the peaks; the limiter held them before it.
    expect(result!.after.truePeak).toBeLessThanOrEqual(-1 + 0.1)
    expect(after.truePeak).toBeLessThan(0)
  })

  it("leaves the level alone when asked, and says nothing of it", async () => {
    const { level: result } = await leveled(defaultLevel)
    expect(result).toBeNull()
  })

  it("cuts rumble: a 40 Hz hum 12 dB down, a 1 kHz tone as it was", async () => {
    const hum = made("hum.wav", "sine=f=40:d=3")
    const tone = made("tone.wav", "sine=f=1000:d=3")
    const rumble = {
      tone: TONE_PRESETS.rumble.tone,
      compressor: "off" as const,
    }
    const humAfter = await leveled(defaultLevel, "wav", hum, rumble)
    const toneAfter = await leveled(defaultLevel, "wav", tone, rumble)
    const level = (bytes: Uint8Array, name: string) =>
      measured(bytes, name).integrated
    // K-weighting itself cuts 40 Hz: compare like with like.
    expect(
      level(humAfter.bytes, "hum-cut.wav") - level(hum, "hum.wav")
    ).toBeLessThan(-10)
    expect(
      Math.abs(level(toneAfter.bytes, "tone-cut.wav") - level(tone, "tone.wav"))
    ).toBeLessThan(0.2)
    // Its level is left as it is: the limiter only stands guard.
    expect(humAfter.level!.mode).toBe("same")
    expect(humAfter.level!.db).toBe(0)
  })

  it("compresses a voice-like recording, then normalises it to −16 LUFS", async () => {
    const level: Level = { ...defaultLevel, mode: "loudness", target: -16 }
    const sound: SoundSettings = {
      tone: TONE_PRESETS.voice.tone,
      compressor: "voice",
    }
    const { bytes, level: result } = await leveled(level, "wav", wav, sound)
    const after = measured(bytes, "voice.wav")
    expect(Math.abs(after.integrated - -16)).toBeLessThan(0.5)
    expect(after.truePeak).toBeLessThanOrEqual(-1 + 0.2)
    expect(after.frames).toBe(10 * RATE)
    // Compressed: louder and quieter parts closer together.
    expect(rangeOf(bytes, "voice-range.wav")).toBeLessThan(
      rangeOf(wav, "source-range.wav") - 2
    )
    expect(result!.compressed).toBeGreaterThan(3)
  })
})
