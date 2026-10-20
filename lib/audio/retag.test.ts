import { describe, expect, it } from "vitest"
import { FLAC_PADDING, retagFlac } from "./flac-tags"
import { frameOf, readId3, type Id3Tag } from "./id3"
import { retagMp4 } from "./mp4-tags"
import { oggCrc } from "./ogg-end"
import { retagOgg } from "./ogg-tags"
import { keepsKind, retag, retagId3File } from "./retag"
import type { TagChange } from "./tags"
import {
  base64,
  changedLines,
  flacPicture,
  readComments,
  writeComments,
} from "./vorbis-comments"
import { retagWav } from "./wav-tags"

const latin = (text: string) =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
const be32 = (value: number) =>
  Uint8Array.of(
    value >>> 24,
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  )
const le32 = (value: number) =>
  Uint8Array.of(
    value & 255,
    (value >> 8) & 255,
    (value >> 16) & 255,
    value >>> 24
  )
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
/** Where bytes (or Latin-1 text) first are in bytes, counted in bytes. */
function find(bytes: Uint8Array, what: Uint8Array | string) {
  const needle = typeof what === "string" ? latin(what) : what
  outer: for (let at = 0; at + needle.length <= bytes.length; at++) {
    for (let index = 0; index < needle.length; index++)
      if (bytes[at + index] !== needle[index]) continue outer
    return at
  }
  return -1
}
const endsWith = (bytes: Uint8Array, tail: Uint8Array) =>
  bytes
    .subarray(bytes.length - tail.length)
    .every((byte, index) => byte === tail[index])

const SOUND = latin("these bytes are the sound and never change")
const title = (value: string): TagChange => ({ fields: { title: value } })
const png = join(Uint8Array.of(0x89, 0x50, 0x4e, 0x47), new Uint8Array(29))

describe("Vorbis comments", () => {
  it("reads and writes them, and says when they do not fit", () => {
    const bytes = writeComments({ vendor: "v", lines: ["TITLE=A", "X=y"] })
    expect(readComments(bytes, 0)).toEqual({
      comments: { vendor: "v", lines: ["TITLE=A", "X=y"] },
      end: bytes.length,
    })
    expect(readComments(bytes, 0, 3)).toBeNull()
    expect(readComments(le32(50), 0)).toBeNull()
    expect(readComments(join(le32(1), latin("v")), 0)).toBeNull()
    expect(
      readComments(join(le32(1), latin("v"), le32(1), le32(9)), 0)
    ).toBeNull()
  })

  it("replaces each field under every name it goes by", () => {
    const lines = [
      "ALBUM ARTIST=Old",
      "TRACKNUMBER=3/12",
      "DISCNUMBER=2",
      "TOTALDISCS=4",
      "COVERART=xx",
      "REPLAYGAIN_TRACK_GAIN=-6 dB",
    ]
    expect(
      changedLines(
        lines,
        { fields: { albumArtist: "New", tracks: "13", discs: "" } },
        false
      )
    ).toEqual([
      "COVERART=xx",
      "REPLAYGAIN_TRACK_GAIN=-6 dB",
      "ALBUMARTIST=New",
      "TRACKNUMBER=3",
      "TRACKTOTAL=13",
      "DISCNUMBER=2",
    ])
    // The number changed, its total left as it was.
    expect(
      changedLines(
        ["TRACKNUMBER=3", "TRACKTOTAL=9"],
        { fields: { track: "4" } },
        false
      )
    ).toEqual(["TRACKNUMBER=4", "TRACKTOTAL=9"])
    // A total alone is written; a number that is not one is not.
    expect(
      changedLines(["TRACKNUMBER=x"], { fields: { tracks: "5" } }, false)
    ).toEqual(["TRACKTOTAL=5"])
    expect(changedLines(["TITLE=A"], { fields: { title: "" } }, false)).toEqual(
      []
    )
    const cover = { data: png, mimeType: "image/png" }
    const ogg = changedLines(["COVERART=xx"], { fields: {}, cover }, true)
    expect(ogg).toEqual([
      `METADATA_BLOCK_PICTURE=${base64(flacPicture(cover))}`,
    ])
    expect(
      changedLines(["METADATA_BLOCK_PICTURE=xx"], { fields: {}, cover }, false)
    ).toEqual([])
    expect(
      changedLines(
        ["METADATA_BLOCK_PICTURE=xx", "A=b"],
        { fields: {}, cover: null },
        true
      )
    ).toEqual(["A=b"])
  })

  it("makes FLAC pictures and long base64", () => {
    const jpeg = flacPicture({
      data: Uint8Array.of(0xff, 0xd8),
      mimeType: "image/jpeg",
    })
    const view = new DataView(jpeg.buffer)
    expect(view.getUint32(0)).toBe(3)
    expect(view.getUint32(8 + 10 + 12)).toBe(24)
    const long = new Uint8Array(0x8000 * 2 + 5).map((_, index) => index & 255)
    expect(atob(base64(long)).length).toBe(long.length)
  })
})

describe("FLAC", () => {
  const block = (type: number, body: Uint8Array, last = false) =>
    join(
      Uint8Array.of(
        (last ? 0x80 : 0) | type,
        body.length >> 16,
        (body.length >> 8) & 255,
        body.length & 255
      ),
      body
    )
  const info = (last = false) => block(0, new Uint8Array(34), last)
  const comment = (lines: string[], last = false) =>
    block(4, writeComments({ vendor: "ref", lines }), last)
  const flac = (...blocks: Uint8Array[]) =>
    join(latin("fLaC"), ...blocks, SOUND)
  /** The blocks of a FLAC file: type, length, whether last. */
  function blocksOf(bytes: Uint8Array, at = 0) {
    const out: [number, number, boolean][] = []
    let next = at + 4
    for (;;) {
      const length =
        (bytes[next + 1] << 16) | (bytes[next + 2] << 8) | bytes[next + 3]
      out.push([bytes[next] & 0x7f, length, Boolean(bytes[next] & 0x80)])
      next += 4 + length
      if (bytes[next - 4 - length] & 0x80) break
    }
    return out
  }

  it("refuses what it cannot be sure of", () => {
    expect(retagFlac(latin("OggS1234"), title("A"), true)).toBeNull()
    expect(
      retagFlac(join(latin("fLaC"), Uint8Array.of(0, 0)), title("A"), true)
    ).toBeNull()
    expect(
      retagFlac(flac(block(127, new Uint8Array(2), true)), title("A"), true)
    ).toBeNull()
    expect(
      retagFlac(
        join(latin("fLaC"), Uint8Array.of(0x80, 0, 9, 0)),
        title("A"),
        true
      )
    ).toBeNull()
    expect(retagFlac(flac(comment([], true)), title("A"), true)).toBeNull()
    expect(
      retagFlac(
        join(latin("ID3\x02\x00\x00\x00\x00\x00\x00"), flac(info(true))),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagFlac(
        flac(info(), block(4, Uint8Array.of(9, 0, 0, 0), true)),
        title("A"),
        true
      )
    ).toBeNull()
  })

  it("adds a comment block after the stream's description, with padding", () => {
    const source = flac(info(), block(2, latin("app!"), true))
    expect(retagFlac(source, { fields: {} }, true)).toBe(source)
    const out = retagFlac(source, title("Café"), true)!
    expect(blocksOf(out).map(([type]) => type)).toEqual([0, 4, 2, 1])
    expect(blocksOf(out).at(-1)).toEqual([1, FLAC_PADDING, true])
    expect(text(out)).toContain("TITLE=Café")
    expect(endsWith(out, SOUND)).toBe(true)
  })

  it("changes the comments where they are, the padding taking up the difference", () => {
    const source = flac(
      info(),
      comment(["TITLE=Old", "ARTIST=Kept"]),
      block(1, new Uint8Array(100), true)
    )
    const out = retagFlac(source, title("New"), true)!
    expect(out.length).toBe(source.length)
    expect(text(out)).toContain("ARTIST=Kept")
    // The encoder's own vendor string stays.
    expect(text(out)).toContain("ref")
    // Exactly the room there was: no padding at all.
    const tight = flac(info(), comment(["TITLE=A"], true))
    const same = retagFlac(tight, title("B"), true)!
    expect(same.length).toBe(tight.length)
    expect(blocksOf(same).map(([type, , last]) => [type, last])).toEqual([
      [0, false],
      [4, true],
    ])
  })

  it("puts a new cover in place of every picture, and takes them away", () => {
    const old = block(6, flacPicture({ data: png, mimeType: "image/png" }))
    const source = flac(info(), old, comment(["TITLE=A"], true))
    const covered = retagFlac(
      source,
      {
        fields: {},
        cover: { data: Uint8Array.of(0xff, 0xd8), mimeType: "image/jpeg" },
      },
      true
    )!
    expect(blocksOf(covered).map(([type]) => type)).toEqual([0, 4, 6, 1])
    expect(text(covered)).toContain("image/jpeg")
    expect(
      blocksOf(retagFlac(source, { fields: {}, cover: null }, true)!).map(
        ([type]) => type
      )
    ).toEqual([0, 4, 1])
    const huge = { data: new Uint8Array(0x1000000), mimeType: "image/png" }
    expect(retagFlac(source, { fields: {}, cover: huge }, true)).toBeNull()
  })

  it("takes every tag away, an ID3 tag before it too", () => {
    const id3 = join(latin("ID3\x04\x00\x00"), Uint8Array.of(0, 0, 0, 0))
    const source = join(
      id3,
      flac(info(), block(6, new Uint8Array(4)), comment(["TITLE=A"], true))
    )
    const out = retagFlac(source, { fields: {} }, false)!
    expect(text(out.subarray(0, 4))).toBe("fLaC")
    expect(blocksOf(out).map(([type]) => type)).toEqual([0, 1])
    expect(endsWith(out, SOUND)).toBe(true)
    // With the ID3 tag kept when tags are kept.
    expect(text(retagFlac(source, title("B"), true)!.subarray(0, 3))).toBe(
      "ID3"
    )
  })
})

describe("Ogg", () => {
  /** A page of whole packets (the last left open when `open`). */
  function page(
    packets: Uint8Array[],
    options: {
      bos?: boolean
      serial?: number
      seq?: number
      open?: boolean
    } = {}
  ) {
    const lacing: number[] = []
    packets.forEach((packet, index) => {
      for (let left = packet.length; ; left -= 255) {
        if (left >= 255) lacing.push(255)
        else {
          if (!(options.open && index === packets.length - 1)) lacing.push(left)
          break
        }
      }
    })
    const head = new Uint8Array(27 + lacing.length)
    const view = new DataView(head.buffer)
    head.set(latin("OggS"))
    head[5] = options.bos ? 2 : 0
    view.setUint32(14, options.serial ?? 7, true)
    view.setUint32(18, options.seq ?? 0, true)
    head[26] = lacing.length
    head.set(lacing, 27)
    return join(head, ...packets)
  }
  const opusHead = join(latin("OpusHead"), new Uint8Array(11))
  const opusTags = (lines: string[], extra = new Uint8Array(0)) =>
    join(latin("OpusTags"), writeComments({ vendor: "libopus", lines }), extra)
  const vorbisId = join(latin("\x01vorbis"), new Uint8Array(23))
  const vorbisComment = (lines: string[]) =>
    join(
      latin("\x03vorbis"),
      writeComments({ vendor: "Xiph", lines }),
      Uint8Array.of(1)
    )
  const setup = join(latin("\x05vorbis"), new Uint8Array(40).fill(9))
  const audio = page([SOUND], { seq: 2 })
  const opus = (tags = opusTags(["TITLE=Old"])) =>
    join(page([opusHead], { bos: true }), page([tags], { seq: 1 }), audio)

  it("refuses what it cannot be sure of", () => {
    expect(
      retagOgg(latin("not an ogg file at all, no"), title("A"), true)
    ).toBeNull()
    expect(
      retagOgg(
        join(page([opusHead]), page([opusTags([])], { seq: 1 })),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagOgg(page([opusHead, opusHead], { bos: true }), title("A"), true)
    ).toBeNull()
    expect(
      retagOgg(page([latin("FLAChead")], { bos: true }), title("A"), true)
    ).toBeNull()
    expect(
      retagOgg(
        join(
          page([opusHead], { bos: true }),
          page([opusTags([])], { seq: 1, serial: 9 })
        ),
        title("A"),
        true
      )
    ).toBeNull()
    expect(retagOgg(join(opus(), latin("OggS")), title("A"), true)).toBeNull()
    expect(
      retagOgg(
        page([opusHead], { bos: true, seq: 0 }).subarray(0, 30),
        title("A"),
        true
      )
    ).toBeNull()
    // Cut inside its table of segments.
    expect(
      retagOgg(
        page([opusHead], { bos: true, seq: 0 }).subarray(0, 27),
        title("A"),
        true
      )
    ).toBeNull()
    // The headers end inside a page, or never end.
    expect(
      retagOgg(
        join(
          page([opusHead], { bos: true }),
          page([opusTags([]), SOUND], { seq: 1 })
        ),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagOgg(
        join(
          page([opusHead], { bos: true }),
          page([new Uint8Array(255)], { seq: 1, open: true })
        ),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagOgg(
        opus(join(latin("NotTags!"), new Uint8Array(8))),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagOgg(opus(join(latin("OpusTags"), le32(99))), title("A"), true)
    ).toBeNull()
  })

  it("rewrites Opus' comment header and keeps the pages of sound as they were", () => {
    const source = opus(
      opusTags(["TITLE=Old", "ARTIST=Kept"], Uint8Array.of(1, 2, 3))
    )
    expect(retagOgg(source, { fields: {} }, true)).toBe(source)
    const out = retagOgg(source, title("New"), true)!
    expect(text(out)).toContain("TITLE=New")
    expect(text(out)).toContain("ARTIST=Kept")
    expect(text(out)).not.toContain("TITLE=Old")
    // Opus' own data after the comments, then the page of sound as it was.
    const at = find(out, "TITLE=New") + "TITLE=New".length
    expect(Array.from(out.subarray(at, at + 3))).toEqual([1, 2, 3])
    expect(endsWith(out, audio)).toBe(true)
    // Its page is whole and its checksum right.
    const header = out.subarray(
      page([opusHead], { bos: true }).length,
      out.length - audio.length
    )
    const stored = new DataView(header.buffer, header.byteOffset).getUint32(
      22,
      true
    )
    const zeroed = header.slice()
    zeroed.fill(0, 22, 26)
    expect(oggCrc(zeroed)).toBe(stored)
    const bare = retagOgg(source, { fields: {} }, false)!
    expect(text(bare)).not.toContain("TITLE")
    expect(text(bare)).toContain("libopus")
  })

  it("lays Vorbis' comment and setup into new pages, numbering the sound's after them", () => {
    const source = join(
      page([vorbisId], { bos: true }),
      page([vorbisComment(["TITLE=Old"]), setup], { seq: 1 }),
      audio
    )
    const big = retagOgg(
      source,
      { fields: { lyrics: "la ".repeat(40000) } },
      true
    )!
    expect(text(big)).toContain("\x05vorbis")
    // The headers take more pages now: the sound's page is numbered after them, with its checksum.
    const last = big.subarray(big.length - audio.length)
    const view = new DataView(last.buffer, last.byteOffset)
    expect(view.getUint32(18, true)).toBeGreaterThan(2)
    const zeroed = last.slice()
    zeroed.fill(0, 22, 26)
    expect(oggCrc(zeroed)).toBe(view.getUint32(22, true))
    expect(text(last).endsWith(text(SOUND))).toBe(true)
    // A page on which no packet ends has no position.
    const second = big.subarray(page([vorbisId], { bos: true }).length)
    expect(
      new DataView(second.buffer, second.byteOffset).getBigInt64(6, true)
    ).toBe(BigInt(-1))
    expect(second[5]).toBe(0)
    const third = second.subarray(27 + 255 + 255 * 255)
    expect(third[5]).toBe(1)
  })
})

describe("MP4", () => {
  const box = (type: string, ...parts: Uint8Array[]) => {
    const body = join(...parts)
    return join(be32(8 + body.length), latin(type), body)
  }
  const data = (kind: number, value: Uint8Array) =>
    box("data", be32(kind), be32(0), value)
  const item = (type: string, kind: number, value: Uint8Array) =>
    box(type, data(kind, value))
  const stco = (offset: number) => box("stco", be32(0), be32(1), be32(offset))
  const trak = (offset: number) =>
    box("trak", box("mdia", box("minf", box("stbl", stco(offset)))))
  const hdlr = box("hdlr", new Uint8Array(25))
  const meta = (...inside: Uint8Array[]) =>
    box("meta", be32(0), hdlr, ...inside)
  const ilst = (...items: Uint8Array[]) => box("ilst", ...items)
  const mdat = box("mdat", SOUND)
  const ftyp = box("ftyp", latin("M4A "), be32(0))
  /** The offset of the one chunk, and where the sound really is. */
  function chunk(bytes: Uint8Array) {
    const at = find(bytes, "stco") + 4 + 8
    const offset = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at)
    return { offset, real: find(bytes, SOUND) }
  }
  /** A file with the sound after the movie box, its offset right. */
  function first(udta: Uint8Array | null) {
    const build = (offset: number) =>
      join(ftyp, box("moov", trak(offset), ...(udta ? [udta] : [])), mdat)
    const draft = build(0)
    return build(find(draft, SOUND))
  }

  it("refuses what it cannot be sure of", () => {
    expect(
      retagMp4(Uint8Array.of(0, 0, 0, 3, 1, 2, 3, 4), title("A"), true)
    ).toBeNull()
    expect(retagMp4(join(ftyp, mdat), title("A"), true)).toBeNull()
    expect(
      retagMp4(
        join(
          ftyp,
          box("moov", Uint8Array.of(0, 0, 0, 1, 0x6d, 0x76, 0x68, 0x64))
        ),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagMp4(join(ftyp, box("moov", box("mvex"))), title("A"), true)
    ).toBeNull()
    expect(
      retagMp4(
        first(
          box(
            "udta",
            box(
              "meta",
              be32(0),
              Uint8Array.of(0, 0, 0, 2, 0x66, 0x72, 0x65, 0x65)
            )
          )
        ),
        title("A"),
        true
      )
    ).toBeNull()
    expect(
      retagMp4(
        first(
          box(
            "udta",
            meta(box("ilst", Uint8Array.of(0, 0, 0, 2, 0x66, 0x72, 0x65, 0x65)))
          )
        ),
        title("A"),
        true
      )
    ).toBeNull()
    // A track whose boxes do not add up: its chunks cannot all be moved.
    const broken = box(
      "trak",
      Uint8Array.of(0, 0, 0, 2, 0x6d, 0x64, 0x69, 0x61)
    )
    expect(
      retagMp4(join(ftyp, box("moov", broken), mdat), title("A"), true)
    ).toBeNull()
    // A chunk offset that would pass 4 GB.
    expect(
      retagMp4(
        join(ftyp, box("moov", trak(0xfffffff0)), mdat),
        title("A"),
        true
      )
    ).toBeNull()
  })

  it("changes the items it is given, keeps the others, and moves the chunks with the sound", () => {
    const source = first(
      box(
        "udta",
        meta(
          ilst(
            item("©nam", 1, latin("Old")),
            item("----", 1, latin("free form")),
            item("gnre", 0, Uint8Array.of(0, 8))
          )
        )
      )
    )
    expect(retagMp4(source, { fields: {} }, true)).toBe(source)
    const out = retagMp4(
      source,
      { fields: { title: "A much longer title", genre: "Jazz" } },
      true
    )!
    expect(text(out)).toContain("A much longer title")
    expect(text(out)).toContain("free form")
    expect(text(out)).not.toContain("gnre")
    const { offset, real } = chunk(out)
    expect(offset).toBe(real)
    expect(endsWith(out, SOUND)).toBe(true)
    // The sound before the movie: nothing to move.
    const late = join(
      ftyp,
      mdat,
      box("moov", trak(16), box("udta", meta(ilst())))
    )
    expect(chunk(retagMp4(late, title("Long title"), true)!).offset).toBe(16)
  })

  it("takes up the difference in iTunes' free box when it can", () => {
    const source = first(
      box(
        "udta",
        meta(
          ilst(item("©nam", 1, latin("Old"))),
          box("free", new Uint8Array(64))
        )
      )
    )
    const out = retagMp4(source, title("Newer"), true)!
    expect(out.length).toBe(source.length)
    expect(chunk(out).offset).toBe(chunk(source).offset)
    // Too much for it: the boxes grow instead.
    const grown = retagMp4(source, title("x".repeat(200)), true)!
    expect(grown.length).toBeGreaterThan(source.length)
    expect(chunk(grown).offset).toBe(chunk(grown).real)
  })

  it("makes the boxes that are missing, QuickTime's meta too", () => {
    for (const udta of [
      null,
      box("udta", box("chpl", new Uint8Array(9))),
      box("udta", box("meta", hdlr)),
    ]) {
      const out = retagMp4(first(udta), title("Made"), true)!
      expect(text(out)).toContain("ilst")
      expect(text(out)).toContain("Made")
      expect(chunk(out).offset).toBe(chunk(out).real)
    }
  })

  it("writes numbers and covers, and takes them away", () => {
    const source = first(
      box(
        "udta",
        meta(
          ilst(
            item("trkn", 0, Uint8Array.of(0, 0, 0, 3, 0, 12, 0, 0)),
            box("disk", box("free"))
          )
        )
      )
    )
    const out = retagMp4(
      source,
      {
        fields: { tracks: "13", disc: "2" },
        cover: { data: png, mimeType: "image/png" },
      },
      true
    )!
    const at = (type: string) => find(out, type)
    const value = (type: string) =>
      out.subarray(at(type) + 4 + 16, at(type) + 4 + 16 + 6)
    expect(Array.from(value("trkn"))).toEqual([0, 0, 0, 3, 0, 13])
    expect(Array.from(value("disk"))).toEqual([0, 0, 0, 2, 0, 0])
    expect(out[at("covr") + 4 + 8 + 3]).toBe(14)
    const jpeg = retagMp4(
      source,
      {
        fields: {},
        cover: { data: Uint8Array.of(0xff, 0xd8), mimeType: "image/jpeg" },
      },
      true
    )!
    expect(jpeg[find(jpeg, "covr") + 4 + 8 + 3]).toBe(13)
    const none = retagMp4(
      out,
      { fields: { track: "", tracks: "", title: "" }, cover: null },
      true
    )!
    expect(text(none)).not.toContain("trkn")
    expect(text(none)).not.toContain("covr")
  })

  it("takes every tag away", () => {
    const source = first(box("udta", meta(ilst(item("©nam", 1, latin("Old"))))))
    const out = retagMp4(source, { fields: {} }, false)!
    expect(text(out)).not.toContain("ilst")
    expect(text(out)).toContain("hdlr")
    expect(chunk(out).offset).toBe(chunk(out).real)
    const bare = first(null)
    expect(retagMp4(bare, { fields: {} }, false)).toBe(bare)
  })
})

describe("WAV", () => {
  const chunk = (id: string, body: Uint8Array, pad = true) =>
    join(
      latin(id),
      le32(body.length),
      body,
      pad && body.length & 1 ? Uint8Array.of(0) : new Uint8Array(0)
    )
  const riff = (...chunks: Uint8Array[]) => {
    const body = join(latin("WAVE"), ...chunks)
    return join(latin("RIFF"), le32(body.length), body)
  }
  const fmt = chunk("fmt ", new Uint8Array(16))
  const data = chunk("data", SOUND)
  const info = (...fields: [string, string][]) =>
    chunk(
      "LIST",
      join(
        latin("INFO"),
        ...fields.map(([id, value]) => chunk(id, latin(`${value}\0`)))
      )
    )

  it("refuses what it cannot be sure of", () => {
    expect(retagWav(latin("RIFX0000WAVE"), title("A"), true)).toBeNull()
    expect(retagWav(riff(fmt), title("A"), true)).toBeNull()
    expect(
      retagWav(riff(fmt, join(latin("data"), le32(999))), title("A"), true)
    ).toBeNull()
    expect(
      retagWav(
        riff(
          fmt,
          data,
          chunk("id3 ", latin("ID3\x02\x00\x00\x00\x00\x00\x00"))
        ),
        title("A"),
        true
      )
    ).toBeNull()
  })

  it("adds INFO and an id3 chunk at the end, INFO holding only Latin text", () => {
    const source = riff(fmt, data)
    expect(retagWav(source, { fields: {} }, true)).toBe(source)
    expect(retagWav(source, { fields: {} }, false)).toBe(source)
    const out = retagWav(
      source,
      { fields: { title: "Новая", artist: "Café", lyrics: "La" } },
      true
    )!
    const riffSize = new DataView(out.buffer).getUint32(4, true)
    expect(riffSize).toBe(out.length - 8)
    expect(new TextDecoder("latin1").decode(out)).toContain("Café\0")
    expect(text(out)).not.toContain("INAM")
    const id3 = out.subarray(find(out, "ID3"))
    expect((readId3(id3) as Id3Tag).frames.map((frame) => frame.id)).toEqual([
      "TIT2",
      "TPE1",
      "USLT",
    ])
    expect(find(out, "data")).toBeLessThan(find(out, "LIST"))
  })

  it("changes the chunks where they are, and keeps the rest", () => {
    const id3 = join(
      latin("ID3\x04\x00\x00"),
      Uint8Array.of(0, 0, 0, 20),
      frameOf("TIT2", join(Uint8Array.of(3), latin("Old")), 4),
      new Uint8Array(6)
    )
    const source = riff(
      fmt,
      info(["INAM", "Old"], ["IART", "Kept"]),
      data,
      chunk("id3 ", id3),
      chunk("junk", latin("odd"))
    )
    const out = retagWav(source, title("New"), true)!
    expect(text(out)).toContain("New\0")
    expect(text(out)).toContain("Kept")
    expect(text(out)).toContain("junk")
    // INFO with nothing left in it goes.
    const only = riff(fmt, info(["INAM", "Old"]), data)
    expect(text(retagWav(only, title("✓"), true)!)).not.toContain("INFO")
    // Tags taken away: INFO and id3 both.
    const bare = retagWav(source, { fields: {} }, false)!
    expect(text(bare)).not.toContain("INFO")
    expect(text(bare)).not.toContain("ID3")
    expect(text(bare)).toContain("junk")
  })

  it("mends a last chunk whose padding was left out, and an INFO list that does not add up", () => {
    const source = riff(fmt, chunk("data", latin("odd"), false))
    const out = retagWav(source, title("A"), true)!
    expect(find(out, "LIST") % 2).toBe(0)
    const broken = riff(
      fmt,
      data,
      chunk("LIST", join(latin("INFO"), latin("INAM"), le32(99)))
    )
    expect(text(retagWav(broken, title("B"), true)!)).toContain("B\0")
  })
})

describe("in place, by kind", () => {
  it("knows which results are the same kind of file", () => {
    expect(keepsKind("mp3", "mp3")).toBe(true)
    expect(keepsKind("flac", "flac")).toBe(true)
    expect(keepsKind("wav", "wav")).toBe(true)
    expect(keepsKind("ogg", "opus")).toBe(true)
    expect(keepsKind("ogg", "ogg")).toBe(true)
    expect(keepsKind("mp4", "m4a")).toBe(true)
    expect(keepsKind("mp4", "m4r")).toBe(false)
    expect(keepsKind("adts", "m4a")).toBe(false)
    expect(keepsKind("webm", "opus")).toBe(false)
  })

  it("sends each kind to its writer", () => {
    expect(retag(latin("FORM"), "aiff", title("A"), true)).toBeNull()
    const none = latin("nothing here")
    for (const container of ["flac", "ogg", "mp4", "wav"] as const)
      expect(retag(none, container, title("A"), true)).toBeNull()
    // Bytes with no tag get one in front.
    for (const container of ["mp3", "adts"] as const)
      expect(
        text(retag(none, container, title("A"), true)!.subarray(0, 3))
      ).toBe("ID3")
  })

  it("changes an MP3's ID3v2 tag and its ID3v1 tag at the end", () => {
    const v1 = join(latin("TAG"), new Uint8Array(125))
    const source = join(SOUND, v1)
    const out = retagId3File(source, title("New"), true)!
    expect(text(out.subarray(0, 3))).toBe("ID3")
    expect(text(out.subarray(out.length - 125, out.length - 122))).toBe("New")
    expect(retagId3File(source, { fields: {} }, true)).toBe(source)
    expect(retagId3File(out, { fields: {} }, false)).toEqual(SOUND)
    expect(
      retagId3File(
        join(latin("ID3\x02\x00\x00\x00\x00\x00\x00"), SOUND),
        title("A"),
        true
      )
    ).toBeNull()
    const tag = join(latin("ID3\x04\x00\x00"), Uint8Array.of(0, 0, 0, 0))
    expect(retagId3File(join(tag, tag, SOUND), title("A"), true)).toBeNull()
    expect(
      retagId3File(SOUND, title("A"), true)!.subarray(-SOUND.length)
    ).toEqual(SOUND)
  })
})
