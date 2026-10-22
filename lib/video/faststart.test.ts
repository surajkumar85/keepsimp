import { describe, expect, it } from "vitest"
import { fastStart, topBoxes } from "./faststart"

const u32 = (value: number) => {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}
const u64 = (value: number) => {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigUint64(0, BigInt(value))
  return out
}
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
const text = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0))
const box = (type: string, ...body: Uint8Array[]) => {
  const inside = join(...body)
  return join(u32(inside.length + 8), text(type), inside)
}
/** A table of offsets: version and flags, a count, then the entries. */
const table = (
  type: "stco" | "co64",
  offsets: number[],
  count = offsets.length
) =>
  box(
    type,
    u32(0),
    u32(count),
    ...offsets.map((offset) => (type === "stco" ? u32(offset) : u64(offset)))
  )
const movie = (...tables: Uint8Array[]) =>
  box("moov", box("trak", box("mdia", box("minf", box("stbl", ...tables)))))

const ftyp = box("ftyp", text("isom"), u32(512), text("isom"))
const media = box("mdat", text("0123456789abcdef"))
/** The two chunks of `media`, where they are while the index is last. */
const chunks = [ftyp.length + 8, ftyp.length + 16]

const offsetsOf = async (file: Blob, type: "stco" | "co64") => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const at = Array.from(bytes).findIndex(
    (_, index) =>
      String.fromCharCode(...bytes.subarray(index, index + 4)) === type
  )
  const view = new DataView(bytes.buffer)
  const count = view.getUint32(at + 8)
  return Array.from({ length: count }, (_, index) =>
    type === "stco"
      ? view.getUint32(at + 12 + index * 4)
      : Number(view.getBigUint64(at + 12 + index * 8))
  )
}

describe("moving the index in front", () => {
  it("moves it after the file type and shifts every offset into the media", async () => {
    const index = movie(table("stco", chunks))
    const file = new Blob([join(ftyp, media, index)], { type: "video/mp4" })
    const result = await fastStart(file)
    expect(result.moved).toBe(true)
    expect(result.file.type).toBe("video/mp4")
    expect(result.file.size).toBe(file.size)
    const types = (await topBoxes(result.file))!.map((one) => one.type)
    expect(types).toEqual(["ftyp", "moov", "mdat"])
    expect(await offsetsOf(result.file, "stco")).toEqual(
      chunks.map((offset) => offset + index.length)
    )
    // The media is the same bytes, where the offsets now say.
    const bytes = new Uint8Array(await result.file.arrayBuffer())
    const first = (await offsetsOf(result.file, "stco"))[0]
    expect(String.fromCharCode(...bytes.subarray(first, first + 8))).toBe(
      "01234567"
    )
  })

  it("shifts 64-bit offsets, and leaves those outside the moved part", async () => {
    const after = box("free", text("tail"))
    const index = movie(
      table("co64", [0, ...chunks]),
      table("stco", [chunks[0]])
    )
    const file = new Blob([join(ftyp, media, index, after)])
    const result = await fastStart(file)
    expect(result.moved).toBe(true)
    expect(await offsetsOf(result.file, "co64")).toEqual([
      0,
      ...chunks.map((offset) => offset + index.length),
    ])
    const types = (await topBoxes(result.file))!.map((one) => one.type)
    expect(types).toEqual(["ftyp", "moov", "mdat", "free"])
  })

  it("leaves a file whose index is already in front", async () => {
    const file = new Blob([join(ftyp, movie(table("stco", [])), media)])
    expect(await fastStart(file)).toEqual({
      file,
      moved: false,
      reason: "already",
    })
  })

  it("leaves fragmented files, which are already made for streaming", async () => {
    const file = new Blob([
      join(ftyp, box("moof"), media, movie(table("stco", []))),
    ])
    expect(await fastStart(file)).toMatchObject({
      moved: false,
      reason: "fragmented",
    })
  })

  it("leaves files it cannot read", async () => {
    for (const bytes of [
      join(ftyp, media),
      join(ftyp, movie()),
      join(ftyp, u32(9999), text("mdat")),
      join(ftyp, media, movie(table("stco", [1, 2], 50))),
      join(ftyp, media, box("moov", box("trak", u32(999), text("mdia")))),
    ])
      expect(await fastStart(new Blob([bytes]))).toMatchObject({
        moved: false,
        reason: "unreadable",
      })
  })

  it("leaves an index too large to read whole, or offsets that would overflow", async () => {
    const file = new Blob([join(ftyp, media, movie(table("stco", chunks)))])
    expect(await fastStart(file, { mostIndex: 40 })).toMatchObject({
      moved: false,
      reason: "large",
    })
    expect(await fastStart(file, { mostOffset: 90 })).toMatchObject({
      moved: false,
      reason: "offsets",
    })
  })
})

describe("reading the top boxes", () => {
  it("reads 64-bit sizes and a last box that runs to the end", async () => {
    const wide = join(u32(1), text("mdat"), u64(24), text("abcdefgh"))
    const open = join(u32(0), text("free"), text("rest"))
    expect(await topBoxes(new Blob([join(ftyp, wide, open)]))).toEqual([
      { type: "ftyp", start: 0, size: ftyp.length },
      { type: "mdat", start: ftyp.length, size: 24 },
      { type: "free", start: ftyp.length + 24, size: 12 },
    ])
  })

  it("refuses sizes that do not fit, a cut 64-bit header and endless lists", async () => {
    expect(await topBoxes(new Blob([join(u32(4), text("free"))]))).toBeNull()
    expect(
      await topBoxes(new Blob([join(u32(1), text("mdat"), u32(0))]))
    ).toBeNull()
    const many = new Blob(
      Array.from({ length: 10_001 }, () => join(u32(8), text("free")))
    )
    expect(await topBoxes(many)).toBeNull()
    expect(await topBoxes(new Blob([]))).toEqual([])
  })
})
