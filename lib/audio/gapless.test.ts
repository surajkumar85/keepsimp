// @vitest-environment node
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { checkResult, lengthTolerance } from "./check"
import {
  crc16,
  lameTagged,
  MP3_DECODER_DELAY,
  mp3Gapless,
  mp3Kept,
} from "./gapless"
import { PeakBuilder, peakLevel } from "./peaks"
import { bitrateForSize, fittedSaid, OVERHEAD_BYTES } from "./target-size"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))

/** How many samples FFmpeg, which reads the LAME header, decodes from a file. */
const ffmpegSamples = (name: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    `tests/fixtures/audio/${name}`,
    "-ac",
    "1",
    "-f",
    "s16le",
    "-",
  ]).length / 2

/** An MP3's first frame with a Xing or Info tag and an encoder's extension, made by hand. */
function header({
  first = [0xff, 0xfb, 0x90, 0x64],
  name = "Info",
  flags = 15,
  encoder = "LAME3.100",
  delay = 576,
  padding = 1000,
  id3 = 0,
}: {
  first?: number[]
  name?: string
  flags?: number
  encoder?: string
  delay?: number
  padding?: number
  id3?: number
} = {}) {
  const bytes = new Uint8Array(id3 + 600)
  if (id3) bytes.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, id3 - 10])
  const at = id3
  bytes.set(first, at)
  const mono = first[3] >> 6 === 3
  const mpeg1 = ((first[1] >> 3) & 3) === 3
  const tag = at + 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17)
  bytes.set(
    Array.from(name, (letter) => letter.charCodeAt(0)),
    tag
  )
  bytes.set([0, 0, 0, flags], tag + 4)
  let next = tag + 8
  if (flags & 1) {
    bytes.set([0, 0, 0, 100], next)
    next += 4
  }
  if (flags & 2) next += 4
  if (flags & 4) next += 100
  if (flags & 8) next += 4
  bytes.set(
    Array.from(encoder, (letter) => letter.charCodeAt(0)),
    next
  )
  bytes[next + 21] = delay >> 4
  bytes[next + 22] = ((delay & 15) << 4) | (padding >> 8)
  bytes[next + 23] = padding & 255
  return bytes
}

describe("mp3Gapless", () => {
  it.each(["tone.mp3", "tone-mono.mp3"])(
    "keeps as many samples of %s as FFmpeg decodes",
    (name) => {
      const gapless = mp3Gapless(fixture(name))!
      expect(gapless.frameSamples).toBe(576)
      const kept = mp3Kept(gapless)
      expect(kept.start).toBe(gapless.delay + MP3_DECODER_DELAY)
      expect(kept.length).toBe(ffmpegSamples(name))
      expect(kept.length).toBe(11025)
    }
  )

  it("reads a LAME header by hand: MPEG-1, mono, after an ID3 tag, with or without its fields", () => {
    expect(mp3Gapless(header())).toEqual({
      delay: 576,
      padding: 1000,
      frames: 100,
      frameSamples: 1152,
    })
    expect(
      mp3Gapless(header({ first: [0xff, 0xfb, 0x90, 0xc4], id3: 40 }))
    ).toMatchObject({ frames: 100 })
    expect(mp3Gapless(header({ flags: 0 }))).toMatchObject({ frames: null })
    expect(mp3Kept(mp3Gapless(header({ flags: 0 }))!)).toEqual({
      start: 1105,
      length: null,
    })
    // A decoder that puts nothing first (Safari's): the sound starts at the encoder's delay.
    expect(mp3Kept(mp3Gapless(header())!, 0)).toEqual({
      start: 576,
      length: 100 * 1152 - 576 - 1000,
    })
    expect(
      mp3Kept({ delay: 576, padding: 9999, frames: 1, frameSamples: 1152 })
    ).toMatchObject({ length: 0 })
    expect(mp3Gapless(header({ name: "Xing", encoder: "Lavf" }))).not.toBeNull()
    // An ID3 tag with a footer is followed by ten more bytes.
    const footer = header({ id3: 50 })
    footer[5] = 0x10
    footer[9] = 30
    expect(mp3Gapless(footer)).not.toBeNull()
  })

  it("says nothing when there is no header to read", () => {
    expect(mp3Gapless(new Uint8Array(10))).toBeNull()
    expect(mp3Gapless(header({ name: "VBRI" }))).toBeNull()
    expect(mp3Gapless(header({ encoder: "XXXX" }))).toBeNull()
    // MPEG version 1 is reserved; layer I is not layer III; bad rates.
    expect(mp3Gapless(header({ first: [0xff, 0xeb, 0x90, 0x64] }))).toBeNull()
    expect(mp3Gapless(header({ first: [0xff, 0xff, 0x90, 0x64] }))).toBeNull()
    expect(mp3Gapless(header({ first: [0xff, 0xfb, 0xf0, 0x64] }))).toBeNull()
    expect(mp3Gapless(header({ first: [0xff, 0xfb, 0x9c, 0x64] }))).toBeNull()
    // Cut off before the tag, and before the extension.
    expect(mp3Gapless(header().subarray(0, 20))).toBeNull()
    expect(mp3Gapless(header().subarray(0, 160))).toBeNull()
  })
})

describe("lameTagged", () => {
  it("adds the delay and padding to an Xing frame, read back as written", () => {
    const written = header({ name: "Xing", encoder: "", delay: 0, padding: 0 })
    const samples = 100 * 1152 - 576 - 300
    const tagged = lameTagged(written, samples)
    expect(mp3Gapless(tagged)).toEqual({
      delay: 576,
      padding: 300,
      frames: 100,
      frameSamples: 1152,
    })
    expect(mp3Kept(mp3Gapless(tagged)!).length).toBe(samples)
    // The rest of the file is untouched, and the header's check sum is right.
    expect(tagged.length).toBe(written.length)
    expect(Array.from(tagged.subarray(417))).toEqual(
      Array.from(written.subarray(417))
    )
    const lame = 4 + 32 + 16
    const view = new DataView(tagged.buffer)
    expect(view.getUint16(lame + 34)).toBe(crc16(tagged.subarray(0, lame + 34)))
    expect(tagged[lame + 20]).toBe(128)
  })

  it("leaves a file as it was when it cannot say it", () => {
    const written = header()
    for (const bytes of [
      new Uint8Array(8),
      header({ first: [0xff, 0xeb, 0x90, 0x64] }),
      header({ first: [0xff, 0xff, 0x90, 0x64] }),
      header({ first: [0xff, 0xfb, 0x9c, 0x64] }),
      header({ name: "VBRI" }),
      header({ flags: 14 }),
      // 8 kbit/s MPEG-2: a frame of 26 bytes has no room.
      header({ first: [0xff, 0xf3, 0x14, 0x64] }),
      // A free-format bitrate index, and a forbidden one.
      header({ first: [0xff, 0xfb, 0x00, 0x64] }),
      header({ first: [0xff, 0xfb, 0xf0, 0x64] }),
      // MPEG-2.5 at 8 kbit/s: too small as well.
      header({ first: [0xff, 0xe3, 0x14, 0x64] }),
    ])
      expect(lameTagged(bytes, 1000)).toBe(bytes)
    // More samples than the frames hold, or padding beyond 12 bits.
    expect(lameTagged(written, 200_000)).toBe(written)
    expect(lameTagged(written, 1000)).toBe(written)
    expect(lameTagged(written, 100 * 1152 - 600, 5000)).toBe(written)
  })

  it("tags a mono MPEG-1 frame, whose tag starts sooner", () => {
    const mono = header({
      first: [0xff, 0xfb, 0x90, 0xc4],
      encoder: "",
      delay: 0,
      padding: 0,
    })
    expect(mp3Gapless(lameTagged(mono, 100 * 1152 - 576))).toMatchObject({
      delay: 576,
      padding: 0,
    })
  })

  it("tags a mono MPEG-2 frame, of 576 samples", () => {
    const low = header({
      first: [0xff, 0xf3, 0x90, 0xc4],
      encoder: "",
      delay: 0,
      padding: 0,
    })
    expect(mp3Gapless(lameTagged(low, 100 * 576 - 576 - 100))).toEqual({
      delay: 576,
      padding: 100,
      frames: 100,
      frameSamples: 576,
    })
  })

  it("works the standard CRC-16 out", () => {
    expect(
      crc16(new Uint8Array(Array.from("123456789", (c) => c.charCodeAt(0))))
    ).toBe(0xbb3d)
  })
})

describe("PeakBuilder", () => {
  it("keeps the lowest and highest sample of each bucket, over every channel", () => {
    const builder = new PeakBuilder(8, 4)
    builder.push([Float32Array.of(0.1, -0.2, 0.3), Float32Array.of(-0.5, 0, 0)])
    builder.push([
      Float32Array.of(0, 0.9, 0, 0, -1),
      Float32Array.of(0, 0, 0, 0, 0),
    ])
    const peaks = builder.result()
    expect(Array.from(peaks.min)).toEqual([-0.5, 0, 0, -1].map(Math.fround))
    expect(
      Array.from(peaks.max).map((value) => Math.round(value * 10) / 10)
    ).toEqual([0.1, 0.3, 0.9, 0])
    expect(peakLevel(peaks)).toBe(1)
    // More frames than expected land in the last bucket; no channels, nothing.
    builder.push([Float32Array.of(0.95)])
    builder.push([])
    expect(builder.result().max[3]).toBeCloseTo(0.95)
    expect(new PeakBuilder(0, 0).result().min.length).toBe(1)
  })
})

describe("checkResult", () => {
  const expected = {
    duration: 10,
    sampleRate: 44100,
    channels: 2,
    copy: false,
    audible: true,
  }
  it("passes a result as asked, within about two codec frames", () => {
    expect(
      checkResult(expected, {
        duration: 10.05,
        sampleRate: 44100,
        channels: 2,
        peak: 0.5,
      })
    ).toEqual([])
    expect(lengthTolerance({ ...expected, duration: 3600 })).toBeCloseTo(3.6)
    expect(lengthTolerance({ ...expected, copy: true })).toBe(0.25)
  })

  it("holds a normalised result to its loudness, and a lossless one to its ceiling", () => {
    const heard = (integrated: number, truePeak: number) => ({
      duration: 10,
      sampleRate: 44100,
      channels: 2,
      peak: 0.5,
      loudness: { integrated, truePeak },
    })
    const asked = { ...expected, loudness: -14, ceiling: -1 }
    expect(checkResult(asked, heard(-14.6, -1.1))).toEqual([])
    expect(checkResult(asked, heard(-15.4, -1.1))).toEqual([
      "It measures −15.4 LUFS, not −14.",
    ])
    expect(checkResult(asked, heard(-14, -0.5))).toEqual([
      "Its peaks reach −0.5 dBTP, over −1.",
    ])
    // Not normalised, or lossy: only what was asked is held.
    expect(
      checkResult({ ...expected, loudness: null, ceiling: null }, heard(-30, 0))
    ).toEqual([])
    expect(checkResult(asked, { ...heard(0, 0), loudness: undefined })).toEqual(
      []
    )
  })

  it("says each way a result is not as asked", () => {
    expect(
      checkResult(expected, {
        duration: 9,
        sampleRate: 48000,
        channels: 1,
        peak: 0,
      })
    ).toEqual([
      "It is 9.00 s long, not 10.00 s.",
      "Its sample rate is 48000 Hz, not 44100 Hz.",
      "It has 1 channels, not 2.",
      "It is silent, though the original is not.",
    ])
    expect(
      checkResult(
        { ...expected, audible: false },
        {
          duration: 10,
          sampleRate: 44100,
          channels: 2,
          peak: 0,
        }
      )
    ).toEqual([])
    // A constant-bitrate file well under its bitrate was written at another.
    expect(
      checkResult(
        { ...expected, bitrate: 192_000, bytes: 42_500 },
        { duration: 10, sampleRate: 44100, channels: 2, peak: 0.5 }
      )
    ).toEqual(["It was written at about 34 kbit/s, not 192."])
    expect(
      checkResult(
        { ...expected, bitrate: 192_000, bytes: 250_000 },
        { duration: 10, sampleRate: 44100, channels: 2, peak: 0.5 }
      )
    ).toEqual([])
    expect(checkResult(expected, null)).toEqual([
      "The file that was written could not be read back.",
    ])
  })
})

describe("bitrateForSize", () => {
  const allowed = [32, 64, 128, 192, 320]
  it("gives the highest bitrate that fits, with room for the container", () => {
    // 1 MB for 60 s: (1,048,576 × 0.97 − 8 KB) × 8 / 60 ≈ 134.5 kbit/s.
    expect(bitrateForSize(1024 * 1024, 60, allowed)).toBe(128)
    expect(bitrateForSize(100 * 1024 * 1024, 60, allowed)).toBe(320)
    expect(bitrateForSize(OVERHEAD_BYTES, 60, allowed)).toBeNull()
    expect(bitrateForSize(1000, 0, allowed)).toBe(320)
    expect(fittedSaid(1024 * 1024, 128, 32)).toBe(
      "To fit under 1.00 MB, it is written at 128 kbit/s."
    )
    expect(fittedSaid(20 * 1024, null, 32)).toBe(
      "It cannot fit under 20.0 KB even at 32 kbit/s, the lowest offered, so it is written at that."
    )
  })
})
