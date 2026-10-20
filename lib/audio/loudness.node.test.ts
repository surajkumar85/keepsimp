// @vitest-environment node
/**
 * The meter against FFmpeg's ebur128 filter (BS.1770 and EBU Tech 3341/3342)
 * on signals FFmpeg makes: tones, pink noise at changing levels, at several
 * rates and layouts.
 */
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { LoudnessMeter, loudnessOf } from "./loudness"

function summary(source: string, rate: number, layout: string) {
  const text = execFileSync(
    "sh",
    [
      "-c",
      `ffmpeg -hide_banner -nostats -f lavfi -i "${source}" -af "aformat=sample_fmts=flt:sample_rates=${rate}:channel_layouts=${layout},ebur128=peak=true" -f null - 2>&1`,
    ],
    { encoding: "utf8", maxBuffer: 1 << 28 }
  )
  const tail = text.slice(text.lastIndexOf("Summary:"))
  const number = (pattern: RegExp) => Number(pattern.exec(tail)![1])
  return {
    integrated: number(/I:\s+(-?[\d.]+) LUFS/),
    range: number(/LRA:\s+(-?[\d.]+) LU/),
    truePeak: number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/),
  }
}

/** The same signal decoded to floats, measured here in chunks of odd sizes. */
function ours(source: string, rate: number, layout: string, channels: number) {
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      source,
      "-af",
      `aformat=sample_fmts=flt:sample_rates=${rate}:channel_layouts=${layout}`,
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 1 << 30 }
  )
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
  const frames = all.length / channels
  const meter = new LoudnessMeter(rate, channels)
  let at = 0
  let size = 997
  while (at < frames) {
    const count = Math.min(size, frames - at)
    meter.push(
      Array.from({ length: channels }, (_, channel) =>
        Float32Array.from(
          { length: count },
          (_, index) => all[(at + index) * channels + channel]
        )
      )
    )
    at += count
    size = size === 997 ? 4096 : 997
  }
  return loudnessOf(meter.result())
}

const cases: [string, string, number, string, number][] = [
  // EBU Tech 3341 case 1: a 1 kHz tone at −23 dBFS in both channels is −23 LUFS.
  ["tone at −23 dBFS", "sine=f=1000:d=20,volume=-23dB", 48000, "stereo", 2],
  [
    "pink noise rising and falling",
    "anoisesrc=d=30:c=pink:a=0.3:s=7,volume='if(lt(t,10),0.2,if(lt(t,20),1,0.05))':eval=frame",
    44100,
    "stereo",
    2,
  ],
  [
    "mono speech-like noise",
    "anoisesrc=d=12:c=brown:a=0.5:s=7",
    22050,
    "mono",
    1,
  ],
  ["5.1 pink noise", "anoisesrc=d=8:c=pink:a=0.2:s=7", 48000, "5.1", 6],
]

describe("the meter against FFmpeg's ebur128", () => {
  it.each(cases)("%s", (_, source, rate, layout, channels) => {
    const theirs = summary(source, rate, layout)
    const measured = ours(source, rate, layout, channels)
    expect(measured.integrated).toBeCloseTo(theirs.integrated, 1)
    expect(Math.abs(measured.range - theirs.range)).toBeLessThan(0.6)
    expect(Math.abs(measured.truePeak - theirs.truePeak)).toBeLessThan(0.3)
  })
})

describe("true peak, where the samples miss the crests", () => {
  it("finds the crest of a tone at a quarter of the rate, 3 dB above every sample", () => {
    // Samples at 45° from each crest: each is 0.354, the wave reaches 0.5.
    // Faded in and out over 50 ms: starting or stopping at once would ring above the crest.
    const wave = String.raw`0.5*min(min(1\,t/0.05)\,(4-t)/0.05)*sin(2*PI*11025*t+PI/4)`
    const source = `aevalsrc=${wave}|${wave}:s=44100:d=4`
    const measured = ours(source, 44100, "stereo", 2)
    expect(measured.peak).toBeCloseTo(-9.03, 1)
    expect(Math.abs(measured.truePeak - -6.02)).toBeLessThan(0.1)
  })
})
