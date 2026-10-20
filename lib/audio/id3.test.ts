import { describe, expect, it } from "vitest"
import {
  changedFrames,
  frameOf,
  id3v1At,
  ID3_PADDING,
  readId3,
  rewrittenId3,
  rewrittenId3v1,
  startsId3,
  textOf,
  type Id3Frame,
  type Id3Tag,
} from "./id3"

const encoder = new TextEncoder()
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
const synchsafe = (value: number) =>
  Uint8Array.of(
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f
  )
const plain = (value: number) =>
  Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  )

/** A frame with any sizes and flags. */
const raw = (
  id: string,
  data: Uint8Array,
  size: Uint8Array,
  status = 0,
  format = 0
) => join(latin(id), size, Uint8Array.of(status, format), data)

/** A tag around a body. */
function tag(version: number, body: Uint8Array, flags = 0, padding = 0) {
  return join(
    latin("ID3"),
    Uint8Array.of(version, 0, flags),
    synchsafe(body.length + padding),
    body,
    new Uint8Array(padding)
  )
}

const text4 = (id: string, value: string) =>
  frameOf(id, join(Uint8Array.of(3), encoder.encode(value)), 4)

describe("reading ID3v2", () => {
  it("knows a tag and its version", () => {
    expect(startsId3(latin("ID3\x04\x00\x00\x00\x00\x00\x00"))).toBe(true)
    expect(startsId3(latin("ID3"))).toBe(false)
    expect(readId3(latin("fLaC"))).toBeNull()
    const read = readId3(
      tag(4, join(text4("TIT2", "Title"), text4("TPE1", "Artist")), 0, 20)
    ) as Id3Tag
    expect(read.version).toBe(4)
    expect(read.size).toBe(
      10 + 20 + read.frames.reduce((sum, frame) => sum + frame.raw.length, 0)
    )
    expect(read.frames.map((frame) => [frame.id, textOf(frame)])).toEqual([
      ["TIT2", "Title"],
      ["TPE1", "Artist"],
    ])
  })

  it("is not sure of 2.2, unsynchronised tags, tags past the end and frames that do not add up", () => {
    expect(readId3(tag(2, new Uint8Array(10)))).toBe("unsure")
    expect(readId3(tag(4, text4("TIT2", "A"), 0x80))).toBe("unsure")
    expect(readId3(tag(4, text4("TIT2", "A")).subarray(0, 12))).toBe("unsure")
    // A frame name that is not one, a frame past the end, and bytes after the padding.
    expect(readId3(tag(4, raw("ti!2", new Uint8Array(1), synchsafe(1))))).toBe(
      "unsure"
    )
    expect(readId3(tag(3, raw("TIT2", new Uint8Array(1), plain(99))))).toBe(
      "unsure"
    )
    expect(
      readId3(tag(4, join(text4("TIT2", "A"), Uint8Array.of(0, 0, 7))))
    ).toBe("unsure")
  })

  it("reads past an extended header, of either version", () => {
    const frame = text4("TIT2", "A")
    // 2.4 counts the header in its size; 2.3 does not.
    const four = readId3(
      tag(4, join(synchsafe(6), Uint8Array.of(1, 0), frame), 0x40)
    ) as Id3Tag
    expect(four.frames.map((one) => one.id)).toEqual(["TIT2"])
    const three = frameOf("TIT2", join(Uint8Array.of(0), latin("A")), 3)
    const read = readId3(
      tag(3, join(plain(6), new Uint8Array(6), three), 0x40)
    ) as Id3Tag
    expect(read.frames.map((one) => one.id)).toEqual(["TIT2"])
    expect(readId3(tag(4, join(synchsafe(99), frame), 0x40))).toBe("unsure")
  })

  it("takes the plain sizes some writers put in 2.4, and a footer", () => {
    const data = join(Uint8Array.of(3), new Uint8Array(200).fill(0x61))
    const wrong = raw("TIT2", data, plain(data.length))
    const read = readId3(tag(4, join(wrong, text4("TPE1", "B")))) as Id3Tag
    expect(read.frames.map((one) => one.id)).toEqual(["TIT2", "TPE1"])
    const footed = join(
      latin("ID3"),
      Uint8Array.of(4, 0, 0x10),
      synchsafe(text4("TIT2", "A").length),
      text4("TIT2", "A"),
      latin("3DI"),
      new Uint8Array(7)
    )
    expect((readId3(footed) as Id3Tag).size).toBe(footed.length)
    // 2.3 has no second way.
    expect(readId3(tag(3, raw("TIT2", data, synchsafe(data.length))))).toBe(
      "unsure"
    )
  })

  it("leaves frames with flags unread, and drops those that ask to go when the tag changes", () => {
    const body = join(
      raw("TIT2", Uint8Array.of(3, 0x41), synchsafe(2), 0, 0x08),
      raw("TPE1", Uint8Array.of(3, 0x41), synchsafe(2), 0x40),
      text4("TALB", "C")
    )
    const read = readId3(tag(4, body)) as Id3Tag
    expect(read.frames.map((one) => one.id)).toEqual(["TIT2", "TALB"])
    expect(read.frames[0].data).toBeNull()
    expect(textOf(read.frames[0])).toBe("")
    const three = readId3(
      tag(
        3,
        join(
          raw("TIT2", Uint8Array.of(0, 0x41), plain(2), 0x80),
          raw("TALB", Uint8Array.of(0, 0x41), plain(2), 0, 0x80)
        )
      )
    ) as Id3Tag
    expect(three.frames.map((one) => [one.id, one.data])).toEqual([
      ["TALB", null],
    ])
  })

  it("reads text in every encoding", () => {
    const frame = (data: Uint8Array): Id3Frame => ({
      id: "TIT2",
      raw: data,
      data,
    })
    expect(textOf(frame(join(Uint8Array.of(0), latin("Caf\xe9\0more"))))).toBe(
      "Café"
    )
    expect(textOf(frame(Uint8Array.of(1, 0xff, 0xfe, 0x41, 0, 0x42, 0)))).toBe(
      "AB"
    )
    expect(textOf(frame(Uint8Array.of(1, 0xfe, 0xff, 0, 0x41)))).toBe("A")
    expect(textOf(frame(Uint8Array.of(2, 0, 0x41)))).toBe("A")
    expect(textOf(frame(Uint8Array.of(1, 0x41, 0)))).toBe("A")
    expect(textOf(frame(join(Uint8Array.of(3), encoder.encode("✓"))))).toBe("✓")
    expect(textOf(frame(Uint8Array.of(9, 0x41)))).toBe("")
    expect(textOf(frame(new Uint8Array(0)))).toBe("")
  })
})

describe("changing ID3v2", () => {
  const everything = {
    fields: {
      title: "Title",
      artist: "Artist",
      album: "",
      albumArtist: "Group",
      year: "2024",
      track: "3",
      tracks: "12",
      disc: "1",
      discs: "",
      genre: "Jazz",
      comment: "Note",
      lyrics: "La",
    },
    cover: { data: Uint8Array.of(1, 2, 3), mimeType: "image/png" },
  }

  it("writes the fields it is given and keeps the rest", () => {
    const old = readId3(
      tag(
        4,
        join(
          text4("TALB", "Old album"),
          text4("TSSE", "Encoder"),
          text4("TYER", "1999"),
          frameOf(
            "COMM",
            join(
              Uint8Array.of(3),
              latin("eng"),
              latin("iTunNORM\0"),
              latin("x")
            ),
            4
          ),
          frameOf(
            "COMM",
            join(Uint8Array.of(3), latin("eng\0"), latin("old")),
            4
          ),
          frameOf("APIC", Uint8Array.of(0), 4)
        )
      )
    ) as Id3Tag
    const frames = changedFrames(old.frames, everything, 4)
    const ids = frames.map((frame) =>
      new TextDecoder().decode(frame.subarray(0, 4))
    )
    expect(ids).toEqual([
      "TSSE",
      "COMM",
      "TIT2",
      "TPE1",
      "TPE2",
      "TCON",
      "TDRC",
      "TRCK",
      "TPOS",
      "COMM",
      "USLT",
      "APIC",
    ])
    const read = readId3(
      join(
        latin("ID3\x04\x00\x00"),
        synchsafe(frames.reduce((sum, one) => sum + one.length, 0)),
        ...frames
      )
    ) as Id3Tag
    const text = (id: string) =>
      textOf(read.frames.find((frame) => frame.id === id)!)
    expect(text("TRCK")).toBe("3/12")
    expect(text("TPOS")).toBe("1")
    expect(text("TDRC")).toBe("2024")
  })

  it("takes the year and the pictures away", () => {
    const old = readId3(
      tag(
        4,
        join(
          text4("TDRC", "2020"),
          text4("TYER", "2020"),
          text4("TIT2", "A"),
          frameOf("APIC", Uint8Array.of(0), 4)
        )
      )
    ) as Id3Tag
    const frames = changedFrames(
      old.frames,
      { fields: { year: "" }, cover: null },
      4
    )
    expect(
      frames.map((frame) => new TextDecoder().decode(frame.subarray(0, 4)))
    ).toEqual(["TIT2"])
  })

  it("writes 2.3 as 2.3: Latin-1 or UTF-16, plain sizes, TYER", () => {
    const frames = changedFrames(
      [],
      { fields: { title: "Café", artist: "✓ check", year: "2001" } },
      3
    )
    const read = readId3(
      join(
        latin("ID3\x03\x00\x00"),
        synchsafe(frames.reduce((sum, one) => sum + one.length, 0)),
        ...frames
      )
    ) as Id3Tag
    expect(
      read.frames.map((frame) => [frame.id, frame.data![0], textOf(frame)])
    ).toEqual([
      ["TIT2", 0, "Café"],
      ["TPE1", 1, "✓ check"],
      ["TYER", 0, "2001"],
    ])
    const comment = changedFrames([], { fields: { comment: "✓" } }, 3)[0]
    // UTF-16 with a byte order mark, and an empty description ending in two zeros.
    expect(Array.from(comment.subarray(10, 18))).toEqual([
      1, 0x65, 0x6e, 0x67, 0, 0, 0xff, 0xfe,
    ])
    expect(
      changedFrames(
        [],
        {
          fields: {},
          cover: { data: Uint8Array.of(9), mimeType: "image/jpeg" },
        },
        3
      )[0][10]
    ).toBe(0)
  })

  it("keeps a number's total, or its number, when only the other changes", () => {
    const old = readId3(
      tag(4, join(text4("TRCK", "4/10"), text4("TPOS", "x")))
    ) as Id3Tag
    const only = (fields: Record<string, string>) => {
      const frames = changedFrames(old.frames, { fields }, 4)
      const read = readId3(
        join(
          latin("ID3\x04\x00\x00"),
          synchsafe(frames.reduce((sum, one) => sum + one.length, 0)),
          ...frames
        )
      ) as Id3Tag
      return read.frames.map((frame) => [frame.id, textOf(frame)])
    }
    expect(only({ tracks: "11" })).toEqual([
      ["TPOS", "x"],
      ["TRCK", "4/11"],
    ])
    expect(only({ track: "5" })).toEqual([
      ["TPOS", "x"],
      ["TRCK", "5/10"],
    ])
    // A total alone has nowhere to go; a disc number that was not one is replaced.
    expect(only({ track: "" })).toEqual([["TPOS", "x"]])
    expect(only({ discs: "2" })).toEqual([["TRCK", "4/10"]])
    // Wide text in a comment with a description that is not read.
    const unread = { id: "COMM", raw: Uint8Array.of(0), data: null }
    const short = { id: "COMM", raw: Uint8Array.of(0), data: Uint8Array.of(0) }
    const wide = {
      id: "COMM",
      raw: Uint8Array.of(1),
      data: Uint8Array.of(1, 0x65, 0x6e, 0x67, 0x41, 0, 0, 0),
    }
    // A description that never ends is a description all the same.
    const endless = {
      id: "COMM",
      raw: Uint8Array.of(2),
      data: Uint8Array.of(3, 0x65, 0x6e, 0x67, 0x61, 0x62),
    }
    expect(
      changedFrames(
        [unread, short, wide, endless],
        { fields: { comment: "" } },
        4
      )
    ).toEqual([wide.raw, endless.raw])
  })

  it("rewrites a tag in its own room, or larger with padding", () => {
    const old = readId3(tag(4, text4("TIT2", "Old"), 0, 100)) as Id3Tag
    const same = rewrittenId3(old, { fields: { title: "New" } })
    expect(same.length).toBe(old.size)
    const big = rewrittenId3(old, { fields: { lyrics: "x".repeat(200) } })
    expect(big.length).toBeGreaterThan(old.size)
    expect((readId3(big) as Id3Tag).size).toBe(big.length)
    expect(
      big.length -
        10 -
        (readId3(big) as Id3Tag).frames.reduce(
          (sum, one) => sum + one.raw.length,
          0
        )
    ).toBe(ID3_PADDING)
    // Fewer than ten bytes would be left: it grows instead.
    const tight = readId3(tag(4, text4("TIT2", "Old"), 0, 5)) as Id3Tag
    expect(
      rewrittenId3(tight, { fields: { title: "Olde" } }).length
    ).toBeGreaterThan(tight.size)
    const fresh = rewrittenId3(null, { fields: { title: "A" } })
    expect(fresh[3]).toBe(4)
    expect(frameOf("TIT2", new Uint8Array(300), 3).subarray(4, 8)).toEqual(
      plain(300)
    )
  })
})

describe("ID3v1", () => {
  const v1 = (
    title: string,
    comment: string,
    track: number | null,
    genre = 17
  ) => {
    const out = new Uint8Array(128)
    out.set(latin("TAG"))
    out.set(latin(title), 3)
    out.set(latin("Artist"), 33)
    out.set(latin("Album"), 63)
    out.set(latin("1999"), 93)
    out.set(latin(comment), 97)
    if (track !== null) {
      out[125] = 0
      out[126] = track
    }
    out[127] = genre
    return out
  }
  const field = (bytes: Uint8Array, at: number, room: number) =>
    new TextDecoder("latin1")
      .decode(bytes.subarray(at, at + room))
      .replace(/\0+$/, "")

  it("is found at the end", () => {
    expect(id3v1At(join(new Uint8Array(10), v1("A", "", null)))).toBe(10)
    expect(id3v1At(new Uint8Array(200))).toBe(-1)
    expect(id3v1At(new Uint8Array(10))).toBe(-1)
  })

  it("is kept in step: cut to its room, Latin-1, the genre unknown once changed", () => {
    const out = rewrittenId3v1(v1("Old", "x".repeat(30), null), {
      fields: {
        title: "Новая",
        artist: "A".repeat(40),
        album: "B",
        year: "2024",
        comment: "Two\nlines",
        genre: "Jazz",
      },
    })
    expect(field(out, 3, 30)).toBe("?????")
    expect(field(out, 33, 30)).toBe("A".repeat(30))
    expect(field(out, 63, 30)).toBe("B")
    expect(field(out, 93, 4)).toBe("2024")
    // Version 1.0: thirty letters of comment.
    expect(field(out, 97, 30)).toBe("Two lines")
    expect(out[127]).toBe(255)
    // Version 1.1: twenty-eight, then the track.
    const numbered = rewrittenId3v1(v1("T", "c", 4), {
      fields: { comment: "y".repeat(40) },
    })
    expect(field(numbered, 97, 28)).toBe("y".repeat(28))
    expect(numbered[126]).toBe(4)
    expect(numbered[127]).toBe(17)
    expect(
      rewrittenId3v1(v1("T", "c", null), { fields: { track: "7" } })[126]
    ).toBe(7)
    expect(
      rewrittenId3v1(v1("T", "c", 4), { fields: { track: "300" } })[126]
    ).toBe(0)
    expect(
      rewrittenId3v1(v1("T", "c", 4), { fields: { track: "" } })[126]
    ).toBe(0)
    // A 1.0 comment whose last letters are not a track is left as it was.
    const long = v1("T", "z".repeat(30), null)
    expect(rewrittenId3v1(long, { fields: { track: "" } })).toEqual(long)
  })
})
