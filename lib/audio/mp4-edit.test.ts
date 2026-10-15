// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { withEditList } from "./mp4-edit"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))
const folder = mkdtempSync(join(tmpdir(), "keepsimp-mp4-"))

/** The samples FFmpeg decodes from a file, which follows the edit list. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "s16le", "-"])
}

/** The length a file declares for its sound, as FFprobe reads it, in seconds. */
function declared(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      path,
    ])
      .toString()
      .trim()
  )
}

/**
 * Samples per channel FFmpeg decodes. FFmpeg 7 and later end where the
 * edit list ends; older ones only start where it starts, and play the
 * encoder's padding of under one frame (1,024 samples) at the end.
 */
const frames = (bytes: Buffer) => bytes.length / 4
const playedAs = (count: number, length: number) =>
  count === length || (count > length && count - length < 1024)

describe("withEditList", () => {
  it("makes FFmpeg play exactly the sound of an AAC file that had no edit list", () => {
    const plain = fixture("tone-noedit.m4a")
    // Without one, the encoder's priming and padding are played as sound.
    expect(decoded(plain, "plain.m4a").length / 4).toBeGreaterThan(11025)
    const edited = withEditList(plain, 1024, 11025)
    expect(declared(edited, "edited.m4a")).toBe(0.5)
    expect(playedAs(frames(decoded(edited, "edited.m4a")), 11025)).toBe(true)
    // The same samples as FFmpeg's own file, which has the edit list it wrote.
    expect(
      decoded(edited, "edited.m4a").equals(
        decoded(fixture("tone.m4a"), "own.m4a")
      )
    ).toBe(true)
  })

  it("replaces an edit list, and moves the chunk offsets when the movie comes first", () => {
    for (const name of ["tone.m4a", "tone-faststart.m4a"]) {
      const shorter = withEditList(fixture(name), 1024, 8000)
      expect(declared(shorter, `short-${name}`)).toBeCloseTo(8000 / 22050, 6)
      const played = decoded(shorter, `short-${name}`)
      expect(playedAs(frames(played), 8000)).toBe(true)
      // The samples played are the first of the file's own: it starts where it did.
      const full = decoded(fixture(name), name)
      expect(played.equals(full.subarray(0, played.length))).toBe(true)
    }
  })

  it("leaves a file it cannot change as it was", () => {
    const wav = fixture("tone.wav")
    expect(withEditList(wav, 1024, 100)).toBe(wav)
    const cut = fixture("tone.m4a").slice(0, 40)
    expect(withEditList(cut, 1024, 100)).toBe(cut)
  })
})

/** A minimal MP4 built by hand, for layouts FFmpeg does not write. */
function box(type: string, ...parts: Uint8Array[]) {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, size)
  out.set(
    Array.from(type, (letter) => letter.charCodeAt(0)),
    4
  )
  let at = 8
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
const words = (...values: number[]) => {
  const out = new Uint8Array(values.length * 4)
  values.forEach((value, index) =>
    new DataView(out.buffer).setUint32(index * 4, value)
  )
  return out
}
const text = (value: string) =>
  new Uint8Array(Array.from(value, (letter) => letter.charCodeAt(0)))

function mp4({
  version = 0,
  handler = "soun",
  table = "co64" as "co64" | "stco",
  edts = false,
  edtsFirst = false,
  tkhd = true,
  mdhd = true,
} = {}) {
  // Version 1 headers: 64-bit times and durations.
  const header = (timescale: number) =>
    version
      ? words(0x01000000, 0, 0, 0, 0, timescale, 0, 999)
      : words(0, 0, 0, timescale, 999)
  const tkhdBox = version
    ? box("tkhd", words(0x01000000, 0, 0, 0, 0, 1, 0, 0, 999))
    : box("tkhd", words(0, 0, 0, 1, 0, 999))
  const offsets =
    table === "co64"
      ? box("co64", words(0, 1, 0, 2000))
      : box("stco", words(0, 1, 2000))
  const mdia = box(
    "mdia",
    ...(mdhd ? [box("mdhd", header(48000))] : []),
    box("hdlr", words(0, 0), text(handler), words(0, 0, 0)),
    box("minf", box("stbl", offsets))
  )
  const trak = box(
    "trak",
    ...(edtsFirst
      ? [box("edts", box("elst", words(0, 1, 5, 5, 0x10000)))]
      : []),
    ...(tkhd ? [tkhdBox] : []),
    ...(edts ? [box("edts", box("elst", words(0, 1, 5, 5, 0x10000)))] : []),
    mdia
  )
  const moov = box("moov", box("mvhd", header(1000)), trak)
  return new Uint8Array([
    ...box("ftyp", text("M4A ")),
    ...moov,
    ...box("mdat", new Uint8Array(4)),
  ])
}

describe("withEditList on boxes made by hand", () => {
  const view = (bytes: Uint8Array) => new DataView(bytes.buffer)
  const find = (bytes: Uint8Array, type: string) =>
    Buffer.from(bytes).indexOf(type) - 4

  it("writes a 64-bit edit list for long files, and moves 64-bit chunk offsets", () => {
    const made = mp4({ version: 1 })
    const out = withEditList(made, 2 ** 31, 2 ** 40)
    const elst = find(out, "elst")
    expect(view(out).getUint8(elst + 8)).toBe(1)
    expect(view(out).getBigUint64(elst + 16)).toBe(
      BigInt(Math.round((2 ** 40 * 1000) / 48000))
    )
    expect(view(out).getBigInt64(elst + 24)).toBe(BigInt(2 ** 31))
    const co64 = find(out, "co64")
    expect(view(out).getBigUint64(co64 + 16)).toBe(BigInt(2000 + 44))
  })

  it("replaces an edit list that is there, and moves 32-bit chunk offsets", () => {
    const made = mp4({ table: "stco", edts: true })
    const out = withEditList(made, 1024, 48000)
    const elst = find(out, "elst")
    expect(view(out).getUint32(elst + 16)).toBe(1000)
    expect(view(out).getInt32(elst + 20)).toBe(1024)
    // The old edit list (36 bytes) gave way to a new one of the same size.
    expect(out.length).toBe(made.length)
    expect(view(out).getUint32(find(out, "stco") + 16)).toBe(2000)
  })

  it("leaves files without a sound track or its headers alone", () => {
    for (const made of [
      mp4({ handler: "vide" }),
      mp4({ tkhd: false }),
      mp4({ mdhd: false }),
    ])
      expect(withEditList(made, 1024, 48000)).toBe(made)
    const broken = mp4()
    new DataView(broken.buffer).setUint32(0, 3)
    expect(withEditList(broken, 1024, 48000)).toBe(broken)
    // A movie box whose own boxes do not add up.
    const inner = mp4()
    new DataView(inner.buffer).setUint32(find(inner, "mvhd"), 9999)
    expect(withEditList(inner, 1024, 48000)).toBe(inner)
  })

  it("finds the track header where an edit list came before it", () => {
    const made = mp4({ edtsFirst: true })
    const out = withEditList(made, 1024, 48000)
    const tkhd = find(out, "tkhd")
    expect(view(out).getUint32(tkhd + 28)).toBe(1000)
    expect(view(out).getUint32(find(out, "mvhd") + 24)).toBe(1000)
  })
})
