// @vitest-environment node
/**
 * Speed, pitch, direction and channels written by the engine and read back
 * by FFmpeg: lengths to the frame, the note where it should be, a file
 * reversed sample for sample, channels swapped exactly.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { defaultChanges, framesAfter, ratioOf, type Changes } from "./change"
import { convertAudio, readAudio } from "./mediabunny-audio"
import type { OutputFormat } from "./formats"
import { defaultSettings, planFor } from "./settings"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-change-"))
const RATE = 44100

/** Two seconds: 440 Hz on the left, 660 Hz quieter on the right. */
function source() {
  const path = join(folder, "source.wav")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.5*sin(2*PI*440*t)|0.25*sin(2*PI*660*t):s=44100:d=2",
    "-c:a",
    "pcm_s16le",
    path,
  ])
  return new Uint8Array(readFileSync(path))
}
const wav = source()

/** The channels FFmpeg decodes from a file, as numbers. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-"],
    {
      maxBuffer: 1 << 28,
    }
  )
  const all = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
  const frames = all.length / 2
  return [0, 1].map((channel) =>
    Int16Array.from({ length: frames }, (_, index) => all[index * 2 + channel])
  )
}

function frequencyOf(plane: Int16Array) {
  const from = Math.floor(plane.length / 4)
  const to = Math.floor((plane.length * 3) / 4)
  const crossings: number[] = []
  for (let index = from + 1; index < to; index++)
    if (plane[index - 1] < 0 && plane[index] >= 0)
      crossings.push(index - plane[index] / (plane[index] - plane[index - 1]))
  return (
    ((crossings.length - 1) /
      (crossings[crossings.length - 1] - crossings[0])) *
    RATE
  )
}

async function changed(change: Partial<Changes>, format: OutputFormat = "wav") {
  const blob = new Blob([wav as BlobPart])
  const facts = await readAudio(mediabunny, blob, "wav")
  const changes = { ...defaultChanges, ...change }
  const plan = planFor({ ...defaultSettings, format, changes }, facts)
  const { bytes } = await convertAudio(mediabunny, blob, plan, facts, {
    keepTags: false,
    changes,
  })
  return bytes
}

const [left, right] = decoded(wav, "source.wav")

describe("changes written", { timeout: 120_000 }, () => {
  it("1.5 times faster: the same notes, exactly two thirds as long", async () => {
    const [l, r] = decoded(await changed({ tempo: 1.5 }), "fast.wav")
    expect(l.length).toBe(
      framesAfter(2 * RATE, { ...defaultChanges, tempo: 1.5 })
    )
    expect(frequencyOf(l)).toBeCloseTo(440, -0.5)
    expect(frequencyOf(r)).toBeCloseTo(660, -0.5)
  })

  it("an octave up as an MP3: as long as it was, to the frame", async () => {
    const [l] = decoded(await changed({ pitch: 12 }, "mp3"), "up.mp3")
    expect(l.length).toBe(2 * RATE)
    expect(frequencyOf(l)).toBeCloseTo(880, -1)
  })

  it("slower on tape: lower and longer together", async () => {
    const [l] = decoded(
      await changed({ tempo: 0.8, keepPitch: false }),
      "tape.wav"
    )
    expect(l.length).toBe(Math.round((2 * RATE) / 0.8))
    expect(frequencyOf(l)).toBeCloseTo(440 * 0.8, -0.5)
  })

  it("backwards: every sample of the file, last first", async () => {
    const [l, r] = decoded(await changed({ reverse: true }), "back.wav")
    expect(l).toEqual(left.slice().reverse())
    expect(r).toEqual(right.slice().reverse())
  })

  it("left and right swapped, exactly", async () => {
    const [l, r] = decoded(await changed({ channels: "swap" }), "swap.wav")
    expect(l).toEqual(right)
    expect(r).toEqual(left)
  })

  it("backwards and faster, a fifth up", async () => {
    const [l] = decoded(
      await changed({ reverse: true, tempo: 1.25, pitch: 7 }),
      "all.wav"
    )
    expect(l.length).toBe(
      framesAfter(2 * RATE, { ...defaultChanges, tempo: 1.25 })
    )
    expect(frequencyOf(l)).toBeCloseTo(440 * ratioOf(7), -1)
  })
})
