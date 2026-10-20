// @vitest-environment node
/**
 * Files joined by the engine, read back by FFmpeg: straight on, sample for
 * sample; with a gap of silence; crossfaded, as long as it should be; as an
 * MP3 with a chapter for each file and exactly its length; and two files of
 * different loudness normalised to match.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { straight, type Joining } from "./join"
import { defaultLevel, type Level } from "./level"
import { LoudnessMeter, integrated } from "./loudness"
import { joinAudio, readAudio, type JoinPart } from "./mediabunny-audio"
import type { OutputFormat } from "./formats"
import { defaultSettings, planFor } from "./settings"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-join-"))
const RATE = 44100

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
    "-ac",
    "2",
    "-ar",
    String(RATE),
    "-c:a",
    "pcm_s16le",
    path,
  ])
  return new Uint8Array(readFileSync(path))
}

/** Interleaved 16-bit samples FFmpeg decodes from a file. */
function pcm(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-"],
    {
      maxBuffer: 1 << 28,
    }
  )
  return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
}

const first = made("a.wav", "sine=f=440:d=1,volume=0.3")
const second = made("b.wav", "sine=f=880:d=1.5,volume=0.08")

async function joined(
  joining: Joining,
  format: OutputFormat = "wav",
  level: Level = defaultLevel
) {
  const parts: JoinPart[] = []
  for (const [index, bytes] of [first, second].entries()) {
    const file = new Blob([bytes as BlobPart])
    const facts = await readAudio(mediabunny, file, "wav")
    parts.push({ file, facts, edits: [], title: `Part ${index + 1}` })
  }
  const facts = await readAudio(mediabunny, parts[0].file, "wav")
  const plan = planFor(
    { ...defaultSettings, format, level },
    { ...facts, duration: 2.5 },
    true
  )
  return joinAudio(mediabunny, parts, plan, { joining, level, chapters: true })
}

describe("joined", { timeout: 120_000 }, () => {
  it("straight on: every sample of the first, then every sample of the second", async () => {
    const { bytes, length } = await joined(straight)
    expect(length).toBe(2.5)
    const out = pcm(bytes, "straight.wav")
    const a = pcm(first, "a2.wav")
    const b = pcm(second, "b2.wav")
    expect(out.length).toBe(a.length + b.length)
    expect(out.subarray(0, a.length)).toEqual(a)
    expect(out.subarray(a.length)).toEqual(b)
  })

  it("with half a second of silence between", async () => {
    const { bytes, length } = await joined({ gap: 0.5, crossfade: 0 })
    expect(length).toBe(3)
    const out = pcm(bytes, "gap.wav")
    const gap = out.subarray(RATE * 2, RATE * 2 + RATE)
    expect(gap.every((value) => value === 0)).toBe(true)
  })

  it("crossfaded over half a second, half a second shorter", async () => {
    const { bytes, length } = await joined({ gap: 0, crossfade: 0.5 })
    expect(length).toBe(2)
    expect(pcm(bytes, "fade.wav").length / 2).toBe(2 * RATE)
  })

  it("as an MP3 of exactly its length, with a chapter for each file", async () => {
    const { bytes } = await joined(straight, "mp3")
    expect(pcm(bytes, "joined.mp3").length / 2).toBe(2.5 * RATE)
    const path = join(folder, "joined.mp3")
    const said = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_chapters",
        "-of",
        "json",
        path,
      ]).toString()
    ) as { chapters: { start_time: string; tags: { title: string } }[] }
    expect(said.chapters.map((chapter) => chapter.tags.title)).toEqual([
      "Part 1",
      "Part 2",
    ])
    expect(Number(said.chapters[1].start_time)).toBeCloseTo(1, 2)
  })

  it("two files of different loudness brought to the same", async () => {
    const level: Level = { ...defaultLevel, mode: "loudness", target: -20 }
    const { bytes, level: result } = await joined(straight, "wav", level)
    const out = pcm(bytes, "matched.wav")
    const loudness = (from: number, to: number) => {
      const meter = new LoudnessMeter(RATE, 2)
      const frames = (to - from) * RATE
      const planes = [new Float32Array(frames), new Float32Array(frames)]
      for (let index = 0; index < frames; index++) {
        planes[0][index] = out[(from * RATE + index) * 2] / 32768
        planes[1][index] = out[(from * RATE + index) * 2 + 1] / 32768
      }
      meter.push(planes)
      return integrated(meter.result())
    }
    expect(loudness(0, 1)).toBeCloseTo(-20, 0)
    expect(loudness(1, 2.5)).toBeCloseTo(-20, 0)
    expect(result!.each![1]).toBeGreaterThan(result!.each![0])
  })
})
