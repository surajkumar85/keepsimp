// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { AiffProblem, readExtended, wavFromAiff, wavFromPlanes } from "./wav"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))

/** A WAV's format fields and the bytes of its data chunk. */
function wavParts(wav: Uint8Array) {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const text = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4))
  let format = { kind: 0, channels: 0, rate: 0, bits: 0 }
  for (let at = 12; at + 8 <= wav.length;) {
    const size = view.getUint32(at + 4, true)
    if (text(at) === "fmt ")
      format = {
        kind: view.getUint16(at + 8, true),
        channels: view.getUint16(at + 10, true),
        rate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      }
    if (text(at) === "data")
      return { ...format, data: wav.subarray(at + 8, at + 8 + size) }
    at += 8 + size + (size % 2)
  }
  throw new Error("no data")
}

describe("wavFromAiff", () => {
  it.each([
    ["tone.aiff", "tone.wav", 16, 1],
    ["tone-24.aiff", "tone-24.wav", 24, 1],
    ["tone-8.aiff", "tone-8.wav", 8, 1],
    ["tone-sowt.aifc", "tone.wav", 16, 1],
    ["tone-float.aifc", "tone-float.wav", 32, 3],
  ])(
    "turns %s into the WAV FFmpeg makes of the same sound, sample for sample",
    (aiff, wav, bits, kind) => {
      const made = wavFromAiff(fixture(aiff))
      const ours = wavParts(made.wav)
      const theirs = wavParts(fixture(wav))
      expect(made).toMatchObject({ sampleRate: 22050, channels: 2, bits })
      expect(ours).toMatchObject({ kind, channels: 2, rate: 22050, bits })
      expect(ours.data.length).toBe(theirs.data.length)
      expect(Buffer.from(ours.data).equals(Buffer.from(theirs.data))).toBe(true)
    }
  )

  /** An AIFF made by hand: a COMM chunk, optional others, and an SSND chunk. */
  function aiff({
    form = "AIFF",
    kind = "",
    bits = 16,
    frames = 2,
    channels = 1,
    sound = [0x12, 0x34, 0x56, 0x78],
    extra = [] as [string, string][],
    odd = false,
  } = {}) {
    const parts: number[] = []
    const word = (value: number, length: number) => {
      for (let shift = (length - 1) * 8; shift >= 0; shift -= 8)
        parts.push((value >>> shift) & 0xff)
    }
    const ascii = (value: string) =>
      parts.push(...Array.from(value, (letter) => letter.charCodeAt(0)))
    ascii("FORM")
    word(0, 4)
    ascii(form)
    ascii("COMM")
    word(kind ? 22 : 18, 4)
    word(channels, 2)
    word(frames, 4)
    word(bits, 2)
    // 44100 as an 80-bit extended number.
    parts.push(0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0)
    if (kind) ascii(kind)
    for (const [id, value] of extra) {
      ascii(id)
      word(value.length, 4)
      ascii(value)
      if (value.length % 2) parts.push(0)
    }
    if (sound.length) {
      ascii("SSND")
      word(8 + sound.length, 4)
      word(0, 4)
      word(0, 4)
      parts.push(...sound)
      if (odd) parts.push(0)
    }
    return new Uint8Array(parts)
  }

  it("reads the tags of its own chunks, and skips the pad byte of odd ones", () => {
    const made = wavFromAiff(
      aiff({
        extra: [
          ["NAME", "Song"],
          ["AUTH", "Ada"],
          ["ANNO", "Live"],
          ["(c) ", "2026"],
          ["MARK", "x"],
        ],
      })
    )
    expect(made.tags).toEqual({
      title: "Song",
      artist: "Ada",
      comment: "Live",
      copyright: "2026",
    })
    expect(made.sampleRate).toBe(44100)
    expect(Array.from(wavParts(made.wav).data)).toEqual([
      0x34, 0x12, 0x78, 0x56,
    ])
  })

  it("keeps only whole frames that are there, and reads plain AIFF-C", () => {
    const short = wavFromAiff(aiff({ frames: 9 }))
    expect(wavParts(short.wav).data.length).toBe(4)
    const twos = wavFromAiff(aiff({ form: "AIFC", kind: "twos" }))
    expect(Array.from(wavParts(twos.wav).data)).toEqual([
      0x34, 0x12, 0x78, 0x56,
    ])
    const none = wavFromAiff(aiff({ form: "AIFC", kind: "NONE" }))
    expect(wavParts(none.wav).data.length).toBe(4)
  })

  it("refuses what it cannot read, saying why", () => {
    const refused = (bytes: Uint8Array) => {
      try {
        wavFromAiff(bytes)
      } catch (error) {
        expect(error).toBeInstanceOf(AiffProblem)
        return (error as Error).message
      }
      return "read"
    }
    expect(refused(new Uint8Array(4))).toBe("This is not an AIFF file.")
    expect(refused(fixture("tone.wav"))).toBe("This is not an AIFF file.")
    expect(refused(aiff({ sound: [] }))).toBe(
      "This AIFF file has no sound in it."
    )
    expect(refused(aiff({ form: "AIFC", kind: "ima4" }))).toBe(
      "This AIFF-C file is compressed (ima4), which is not read here."
    )
    expect(refused(aiff({ bits: 12 }))).toBe(
      "AIFF files of 12 bits are not read here."
    )
  })

  it("reads 80-bit sample rates, zero among them", () => {
    const rate = new Uint8Array([0x40, 0x0e, 0xbb, 0x80, 0, 0, 0, 0, 0, 0])
    expect(readExtended(rate, 0)).toBe(48000)
    expect(readExtended(new Uint8Array(10), 0)).toBe(0)
    expect(
      readExtended(
        new Uint8Array([0xc0, 0x0e, 0xbb, 0x80, 0, 0, 0, 0, 0, 0]),
        0
      )
    ).toBe(-48000)
  })
})

describe("wavFromPlanes", () => {
  it("writes floats, interleaved, with a header that says so", () => {
    const wav = wavFromPlanes(
      [Float32Array.of(0.5, -1), Float32Array.of(0.25, 1)],
      48000
    )
    const parts = wavParts(wav)
    expect(parts).toMatchObject({ kind: 3, channels: 2, rate: 48000, bits: 32 })
    const view = new DataView(parts.data.buffer, parts.data.byteOffset)
    expect([0, 4, 8, 12].map((at) => view.getFloat32(at, true))).toEqual([
      0.5, 0.25, -1, 1,
    ])
    expect(wavFromPlanes([], 8000).length).toBe(44)
  })
})
