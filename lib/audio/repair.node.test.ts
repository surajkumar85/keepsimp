// @vitest-environment node
/**
 * Repair through the engine, with the real RNNoise: noise taken out of
 * speech (measured against the speech alone), hum notched out, clicks drawn
 * over; every file exactly as long as it was, read back by FFmpeg.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { beforeAll, describe, expect, it } from "vitest"
import { convertAudio, readAudio } from "./mediabunny-audio"
import { noRepair, type Repair, type Rnnoise } from "./repair"
import { defaultSettings, planFor } from "./settings"
import { defaultSound } from "./sound"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-repair-"))
const SPEECH = "tests/fixtures/audio/speech.flac"
const RATE = 44100

/** A WAV FFmpeg makes from the speech and a filter, at 44.1 kHz. */
function made(name: string, filter: string, extra: string[] = []) {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    SPEECH,
    ...extra,
    "-filter_complex",
    filter,
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    path,
  ])
  return new Uint8Array(readFileSync(path))
}

function pcm(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-"],
    {
      maxBuffer: 1 << 28,
    }
  )
  return new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)
  )
}

const energy = (plane: Float32Array) =>
  plane.reduce((sum, value) => sum + value * value, 0)
/** The 20 ms stretches where the speech is silent, and where it speaks. */
function parts(speech: Float32Array) {
  const size = Math.round(0.02 * RATE)
  const pauses: number[] = []
  const voiced: number[] = []
  for (let at = 0; at + size <= speech.length; at += size) {
    const level =
      10 * Math.log10(energy(speech.subarray(at, at + size)) / size + 1e-12)
    if (level < -60) pauses.push(at)
    else if (level > -30) voiced.push(at)
  }
  return { pauses, voiced }
}

/** The level of a sound over some 20 ms stretches, in dB. */
function db(sound: Float32Array, starts: number[]) {
  const size = Math.round(0.02 * RATE)
  let sum = 0
  for (const at of starts) sum += energy(sound.subarray(at, at + size))
  return 10 * Math.log10(sum / (starts.length * size) + 1e-15)
}

/** A tone's level in a sound, by correlating with it, in dB. */
function toneDb(sound: Float32Array, frequency: number) {
  let re = 0
  let im = 0
  for (let index = RATE; index < sound.length; index++) {
    const w = (2 * Math.PI * frequency * index) / RATE
    re += sound[index] * Math.cos(w)
    im += sound[index] * Math.sin(w)
  }
  return 20 * Math.log10((2 * Math.hypot(re, im)) / (sound.length - RATE))
}

/** How far a sound is from the speech, as a ratio in dB. */
const snr = (speech: Float32Array, sound: Float32Array) => {
  let error = 0
  for (let index = 0; index < speech.length; index++)
    error += (sound[index] - speech[index]) ** 2
  return 10 * Math.log10(energy(speech) / error)
}

let rnnoise: Rnnoise
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).WorkerGlobalScope = class {}
  const { Rnnoise } = await import("@shiguredo/rnnoise-wasm")
  rnnoise = await Rnnoise.load()
})

async function repaired(bytes: Uint8Array, repair: Partial<Repair>) {
  const blob = new Blob([bytes as BlobPart])
  const facts = await readAudio(mediabunny, blob, "wav")
  const sound = { ...defaultSound, repair: { ...noRepair, ...repair } }
  const plan = planFor({ ...defaultSettings, format: "wav", sound }, facts)
  return convertAudio(mediabunny, blob, plan, facts, {
    keepTags: false,
    sound,
    rnnoise,
  })
}

const clean = made("clean.wav", "[0:a]anull")

describe("repair written", { timeout: 120_000 }, () => {
  it("takes background noise out of speech, keeping the speech and its length", async () => {
    const noisy = made(
      "noisy.wav",
      "[0:a]volume=1[s];anoisesrc=c=pink:a=0.05:s=5:d=10[n];[s][n]amix=inputs=2:duration=first:normalize=0"
    )
    const speech = pcm(clean, "clean-in.wav")
    const before = pcm(noisy, "noisy-in.wav")
    const { bytes, level } = await repaired(noisy, { denoise: 1 })
    const after = pcm(bytes, "denoised.wav")
    expect(after.length).toBe(before.length)
    const { pauses, voiced } = parts(speech)
    // The noise in the pauses: much quieter.
    expect(db(after, pauses) - db(before, pauses)).toBeLessThan(-12)
    // The speech: as loud as it was, within a few dB.
    expect(Math.abs(db(after, voiced) - db(speech, voiced))).toBeLessThan(3)
    expect(level).not.toBeNull()
  })

  it("half way: between the noisy and the denoised", async () => {
    const noisy = made(
      "noisy2.wav",
      "[0:a]volume=1[s];anoisesrc=c=white:a=0.03:s=9:d=10[n];[s][n]amix=inputs=2:duration=first:normalize=0"
    )
    const { pauses } = parts(pcm(clean, "clean-in2.wav"))
    const full = db(
      pcm((await repaired(noisy, { denoise: 1 })).bytes, "full.wav"),
      pauses
    )
    const half = db(
      pcm((await repaired(noisy, { denoise: 0.5 })).bytes, "half.wav"),
      pauses
    )
    const none = db(pcm(noisy, "none.wav"), pauses)
    // Half as much of the denoised: about 6 dB under the noise as it was.
    expect(half).toBeLessThan(none - 4)
    expect(half).toBeGreaterThan(full + 3)
  })

  it("notches out 50 Hz hum and its harmonics, leaving the speech as loud", async () => {
    const hummed = made(
      "hum.wav",
      "[0:a]volume=1[s];sine=f=50:d=10,volume=0.1[h];sine=f=150:d=10,volume=0.05[i];[s][h][i]amix=inputs=3:duration=first:normalize=0"
    )
    const before = pcm(hummed, "hum-in.wav")
    const after = pcm(
      (await repaired(hummed, { hum: 50 })).bytes,
      "unhummed.wav"
    )
    for (const frequency of [50, 150])
      expect(toneDb(after, frequency) - toneDb(before, frequency)).toBeLessThan(
        -20
      )
    const speech = pcm(clean, "clean-in3.wav")
    const { voiced } = parts(speech)
    expect(Math.abs(db(after, voiced) - db(speech, voiced))).toBeLessThan(0.5)
  })

  it("draws over clicks, and says how many", async () => {
    const speech = pcm(clean, "clean-in4.wav")
    const clicked = speech.slice()
    const at = [20000, 90000, 160000, 230000, 300000]
    for (const where of at) clicked[where] += 0.7
    const path = join(folder, "clicked.raw")
    writeFileSync(path, new Uint8Array(clicked.buffer))
    const wav = join(folder, "clicked.wav")
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "f32le",
      "-ar",
      String(RATE),
      "-ac",
      "1",
      "-i",
      path,
      "-c:a",
      "pcm_f32le",
      wav,
    ])
    const { bytes, level } = await repaired(new Uint8Array(readFileSync(wav)), {
      declick: true,
    })
    const after = pcm(bytes, "declicked.wav")
    expect(level!.clicks).toBe(at.length)
    for (const where of at)
      expect(Math.abs(after[where] - speech[where])).toBeLessThan(0.1)
    expect(snr(speech, after)).toBeGreaterThan(snr(speech, clicked) + 10)
  })
})
