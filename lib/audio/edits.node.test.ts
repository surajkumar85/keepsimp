// @vitest-environment node
/**
 * Edits rendered by the engine and read back by FFmpeg, sample by sample:
 * the source is a 16-bit WAV, written again as a 16-bit WAV, so every
 * sample an edit leaves as it was must come out as it was.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { JOIN_FADE, type Step } from "./edits"
import { convertAudio, readAudio } from "./mediabunny-audio"
import type { OutputFormat } from "./formats"
import { defaultSettings, planFor } from "./settings"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-edits-"))
const RATE = 22050
const wav = new Uint8Array(readFileSync("tests/fixtures/audio/tone.wav"))

/** The left channel FFmpeg decodes from a file, as numbers. */
function left(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-"],
    { maxBuffer: 1 << 30 }
  )
  const all = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
  return Int16Array.from({ length: all.length / 2 }, (_, at) => all[at * 2])
}

async function edited(steps: Step[], format: OutputFormat = "wav") {
  const blob = new Blob([wav])
  const facts = await readAudio(mediabunny, blob, "wav")
  const plan = planFor({ ...defaultSettings, format }, facts, true)
  return convertAudio(mediabunny, blob, plan, facts, {
    keepTags: false,
    edits: steps,
  })
}

const original = left(wav, "original.wav")
const join_ = Math.ceil(JOIN_FADE * RATE)

describe("edits written", () => {
  it("keeps a part: exactly its samples, faded in and out over a few at its cut ends", async () => {
    const out = left(
      await edited([{ do: "keep", from: 0.1, to: 0.4 }]),
      "keep.wav"
    )
    expect(out.length).toBe(0.3 * RATE)
    const from = 0.1 * RATE
    for (let at = join_; at < out.length - join_; at++)
      expect(out[at]).toBe(original[from + at])
    // The very first sample of a part cut out of the middle is faded to nothing.
    expect(Math.abs(out[0])).toBeLessThanOrEqual(1)
  })

  it("cuts a part out: the rest closes up, sample for sample", async () => {
    const out = left(
      await edited([{ do: "cut", from: 0.1, to: 0.2 }]),
      "cut.wav"
    )
    expect(out.length).toBe(0.4 * RATE)
    const cut = 0.1 * RATE
    for (let at = 0; at < cut - join_; at++) expect(out[at]).toBe(original[at])
    for (let at = cut + join_; at < out.length; at++)
      expect(out[at]).toBe(original[at + cut])
  })

  it("silences a part, and leaves the rest", async () => {
    const out = left(
      await edited([{ do: "silence", from: 0.1, to: 0.2 }]),
      "silence.wav"
    )
    expect(out.length).toBe(0.5 * RATE)
    for (let at = 0.1 * RATE; at < 0.2 * RATE; at++) expect(out[at]).toBe(0)
    expect(out[0.3 * RATE]).toBe(original[0.3 * RATE])
  })

  it("fades in, and makes a part quieter by 6 dB", async () => {
    const faded = left(
      await edited([
        { do: "fade", from: 0, to: 0.5, direction: "in", curve: "linear" },
      ]),
      "fade.wav"
    )
    const loudest = (samples: Int16Array, from: number, to: number) =>
      samples
        .subarray(from, to)
        .reduce((most, value) => Math.max(most, Math.abs(value)), 0)
    expect(loudest(faded, 0, 1000)).toBeLessThan(
      loudest(original, 0, 1000) * 0.1
    )
    expect(loudest(faded, 10000, 11000)).toBeGreaterThan(
      loudest(original, 10000, 11000) * 0.85
    )
    const quieter = left(
      await edited([{ do: "gain", from: 0, to: 0.5, db: -6 }]),
      "gain.wav"
    )
    for (let at = 1000; at < 1100; at++)
      expect(
        Math.abs(quieter[at] - original[at] * 10 ** (-6 / 20))
      ).toBeLessThanOrEqual(1)
  })

  it("writes an edited MP3 exactly as long as the edited sound", async () => {
    const out = left(
      await edited(
        [
          { do: "keep", from: 0.05, to: 0.45 },
          { do: "cut", from: 0.1, to: 0.2 },
        ],
        "mp3"
      ),
      "edited.mp3"
    )
    expect(out.length).toBe(Math.round(0.3 * RATE))
  })
})
