import { describe, expect, it } from "vitest"
import { boxes, child } from "@/lib/audio/mp4-edit"
import { fastStart, topBoxes } from "./faststart"
import { soundStart } from "./sound-start"

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
/** mvhd and mdhd: version 0 or 1, with a timescale and a duration. */
const timed = (
  type: string,
  timescale: number,
  duration: number,
  wide = false
) =>
  wide
    ? box(type, u32(1 << 24), u64(0), u64(0), u32(timescale), u64(duration))
    : box(type, u32(0), u32(0), u32(0), u32(timescale), u32(duration))
const tkhd = (duration: number, wide = false) =>
  wide
    ? box("tkhd", u32(1 << 24), u64(0), u64(0), u32(2), u32(0), u64(duration))
    : box("tkhd", u32(0), u32(0), u32(0), u32(2), u32(0), u32(duration))
const hdlr = (kind: string) => box("hdlr", u32(0), u32(0), text(kind))
const track = (kind: string, extra: Uint8Array[] = [], wide = false) =>
  box(
    "trak",
    tkhd(10_000, wide),
    ...extra,
    box("mdia", timed("mdhd", 48000, 480_000, wide), hdlr(kind))
  )
const moovOf = (...tracks: Uint8Array[]) =>
  box("moov", timed("mvhd", 1000, 10_000), ...tracks)

/** The sound track's edit list and duration, as written. */
function read(index: Uint8Array<ArrayBuffer>) {
  const view = new DataView(index.buffer)
  const moov = boxes(index, 0, index.length)![0]
  const trak = boxes(index, moov.body, moov.start + moov.size)!.find(
    (one) =>
      one.type === "trak" &&
      String.fromCharCode(
        ...index.subarray(
          child(index, child(index, one, "mdia")!, "hdlr")!.body + 8,
          child(index, child(index, one, "mdia")!, "hdlr")!.body + 12
        )
      ) === "soun"
  )!
  const edts = child(index, trak, "edts")!
  const elst = child(index, edts, "elst")!
  const header = child(index, trak, "tkhd")!
  const wide = view.getUint8(header.body) === 1
  return {
    moovSize: view.getUint32(0),
    entries: view.getUint32(elst.body + 4),
    length: view.getUint32(elst.body + 8),
    start: view.getInt32(elst.body + 12),
    trackDuration: wide
      ? Number(view.getBigUint64(header.body + 28))
      : view.getUint32(header.body + 20),
  }
}

describe("starting the sound after its encoder's priming", () => {
  it("writes an edit list on the sound track only", () => {
    const index = moovOf(track("vide"), track("soun"))
    const out = soundStart(index, 1024 / 48000)!
    expect(out.length).toBe(index.length + 36)
    const said = read(out)
    expect(said).toEqual({
      moovSize: out.length,
      entries: 1,
      // 10 s less the priming, in the movie's 1,000ths.
      length: Math.round(((480_000 - 1024) * 1000) / 48000),
      start: 1024,
      trackDuration: Math.round(((480_000 - 1024) * 1000) / 48000),
    })
    // The picture's track has no edit list added.
    const moov = boxes(out, 0, out.length)![0]
    const video = boxes(out, moov.body, moov.start + moov.size)!.find(
      (one) => one.type === "trak"
    )!
    expect(child(out, video, "edts")).toBeNull()
  })

  it("replaces an edit list the track already has, and reads 64-bit headers", () => {
    const old = box(
      "edts",
      box("elst", u32(0), u32(1), u32(1), u32(0), u32(1 << 16))
    )
    const out = soundStart(moovOf(track("soun", [old], true)), 2112 / 48000)!
    expect(read(out)).toMatchObject({ entries: 1, start: 2112 })
    expect(out.length).toBe(
      moovOf(track("soun", [old], true)).length + 36 - old.length
    )
  })

  it("finds the track header after an edit list placed before it", () => {
    const old = box(
      "edts",
      box("elst", u32(0), u32(1), u32(1), u32(0), u32(1 << 16))
    )
    const first = box(
      "trak",
      old,
      tkhd(10_000),
      box("mdia", timed("mdhd", 48000, 480_000), hdlr("soun"))
    )
    const out = soundStart(moovOf(first), 1024 / 48000)!
    expect(read(out)).toMatchObject({
      start: 1024,
      trackDuration: Math.round(((480_000 - 1024) * 1000) / 48000),
    })
  })

  it("leaves what it cannot change", () => {
    expect(soundStart(moovOf(track("vide")), 0.02)).toBeNull()
    expect(soundStart(box("free", u32(0)), 0.02)).toBeNull()
    expect(soundStart(moovOf(track("soun")), 0)).toBeNull()
    expect(soundStart(moovOf(track("soun")), 11)).toBeNull()
    expect(soundStart(box("moov", track("soun")), 0.02)).toBeNull()
    expect(
      soundStart(
        moovOf(
          box("trak", box("mdia", timed("mdhd", 48000, 480_000), hdlr("soun")))
        ),
        0.02
      )
    ).toBeNull()
    expect(
      soundStart(moovOf(box("trak", tkhd(1), box("mdia", hdlr("soun")))), 0.02)
    ).toBeNull()
    expect(soundStart(box("moov", u32(99), text("bad!")), 0.02)).toBeNull()
  })

  it("is applied by fast start, the media's offsets moved by the larger index", async () => {
    const ftyp = box("ftyp", text("isom"), u32(512))
    const media = box("mdat", text("0123456789abcdef"))
    const chunk = ftyp.length + 8
    const index = box(
      "moov",
      timed("mvhd", 1000, 10_000),
      box(
        "trak",
        tkhd(10_000),
        box(
          "mdia",
          timed("mdhd", 48000, 480_000),
          hdlr("soun"),
          box("minf", box("stbl", box("stco", u32(0), u32(1), u32(chunk))))
        )
      )
    )
    const file = new Blob([join(ftyp, media, index)])
    const result = await fastStart(file, {
      edit: (read) => soundStart(read, 1024 / 48000),
    })
    expect(result).toMatchObject({ moved: true, edited: true })
    const bytes = new Uint8Array(await result.file.arrayBuffer())
    const top = (await topBoxes(result.file))!
    expect(top.map((one) => one.type)).toEqual(["ftyp", "moov", "mdat"])
    const grown = top[1].size
    expect(grown).toBe(index.length + 36)
    const at = bytes.findIndex(
      (_, i) => String.fromCharCode(...bytes.subarray(i, i + 4)) === "stco"
    )
    expect(new DataView(bytes.buffer).getUint32(at + 12)).toBe(chunk + grown)
    // An edit that changes nothing leaves the index as it was.
    expect(await fastStart(file, { edit: () => null })).toMatchObject({
      moved: true,
      edited: false,
    })
  })
})
