import type { MetadataTags } from "mediabunny"
import { describe, expect, it } from "vitest"
import {
  changed,
  cleaned,
  isTagChanged,
  LARGEST_COVER,
  noTagChange,
  pictureSize,
  shared,
  tagKey,
  tagProblem,
  valuesOf,
  withChange,
} from "./tags"

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** A JPEG's start: an APP0, a DHT, then a frame of this size. */
function jpeg(width: number, height: number, frame = 0xc0) {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc4,
    0x00,
    0x03,
    0x00,
    0xff,
    frame,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x00,
    0x00,
  ])
}

describe("tag changes", () => {
  it("cleans text: lines only where they may be, ends trimmed", () => {
    expect(cleaned("title", "  Two\r\nlines  ")).toBe("Two lines")
    expect(cleaned("lyrics", " One\r\nTwo\rThree ")).toBe("One\nTwo\nThree")
  })

  it("says what cannot be written", () => {
    expect(tagProblem(noTagChange)).toBeNull()
    expect(
      tagProblem({ fields: { year: "2024", track: "", title: "Fine" } })
    ).toBeNull()
    expect(tagProblem({ fields: { year: "0" } })).toBeNull()
    expect(tagProblem({ fields: { year: "twenty" } })).toContain("year")
    expect(tagProblem({ fields: { track: "0" } })).toContain("track")
    expect(tagProblem({ fields: { discs: "12345" } })).toContain("discs in all")
    expect(tagProblem({ fields: { title: "a\0b" } })).toContain("title")
    expect(
      tagProblem({
        fields: {},
        cover: { data: new Uint8Array(4), mimeType: "image/gif" },
      })
    ).toContain("JPEG or PNG")
    expect(
      tagProblem({
        fields: {},
        cover: {
          data: new Uint8Array(LARGEST_COVER + 1),
          mimeType: "image/png",
        },
      })
    ).toContain("16 MB")
    expect(
      tagProblem({
        fields: {},
        cover: { data: png(1, 1), mimeType: "image/png" },
      })
    ).toBeNull()
    expect(tagProblem({ fields: {}, cover: null })).toBeNull()
  })

  it("applies a change to values: set, taken away, left", () => {
    expect(isTagChanged(noTagChange)).toBe(false)
    expect(isTagChanged({ fields: {}, cover: null })).toBe(true)
    expect(isTagChanged({ fields: { title: "" } })).toBe(true)
    expect(
      changed(
        { title: "Old", artist: "Kept", genre: "Rock" },
        { fields: { title: " New ", genre: "" } }
      )
    ).toEqual({ title: "New", artist: "Kept" })
  })

  it("reads the values of what Mediabunny read", () => {
    const tags: MetadataTags = {
      title: " A title ",
      artist: "Artist",
      album: "",
      albumArtist: "Group",
      date: new Date(Date.UTC(1999, 4, 3)),
      trackNumber: 3,
      tracksTotal: 12,
      discNumber: 0,
      discsTotal: Number.NaN,
      genre: "Jazz",
      comment: "Note",
      lyrics: "La",
    }
    expect(valuesOf(tags)).toEqual({
      title: "A title",
      artist: "Artist",
      albumArtist: "Group",
      year: "1999",
      track: "3",
      tracks: "12",
      genre: "Jazz",
      comment: "Note",
      lyrics: "La",
    })
    expect(valuesOf({ date: new Date(Number.NaN) })).toEqual({})
  })

  it("changes the tags of a file written again", () => {
    const tags: MetadataTags = {
      title: "Old",
      artist: "Kept",
      trackNumber: 2,
      raw: { TIT2: "Old" },
      images: [{ data: png(1, 1), mimeType: "image/png", kind: "coverFront" }],
    }
    expect(withChange(tags, noTagChange)).toBe(tags)
    const cover = { data: png(2, 2), mimeType: "image/png" }
    const out = withChange(tags, {
      fields: {
        title: "New",
        year: "2024",
        track: "",
        tracks: "9",
        disc: "1",
        discs: "2",
        genre: "",
        lyrics: "La",
      },
      cover,
    })
    expect(out).toEqual({
      title: "New",
      artist: "Kept",
      date: new Date(Date.UTC(2024, 0, 1)),
      tracksTotal: 9,
      discNumber: 1,
      discsTotal: 2,
      lyrics: "La",
      images: [{ data: cover.data, mimeType: "image/png", kind: "coverFront" }],
    })
    // The cover left as it was.
    expect(withChange(tags, { fields: { title: "X" } }).images).toBe(
      tags.images
    )
    const none = withChange(tags, { fields: { year: "" }, cover: null })
    expect(none.images).toBeUndefined()
    expect(none.date).toBeUndefined()
    expect(none.raw).toBeUndefined()
  })

  it("names a change, cover and all", () => {
    expect(tagKey(noTagChange)).toBe("same")
    const a = tagKey({ fields: { title: "A" } })
    expect(a).not.toBe(tagKey({ fields: { title: "B" } }))
    expect(tagKey({ fields: {}, cover: null })).toContain("none")
    const one = tagKey({
      fields: {},
      cover: { data: png(1, 1), mimeType: "image/png" },
    })
    expect(one).not.toBe(
      tagKey({ fields: {}, cover: { data: png(1, 2), mimeType: "image/png" } })
    )
    expect(tagKey({ fields: { title: "A" }, cover: undefined })).toBe(a)
  })

  it("finds what every file shares", () => {
    expect(shared([{ album: "A" }, { album: "A" }], "album")).toBe("A")
    expect(shared([{ album: "A" }, {}], "album")).toBeNull()
    expect(shared([{}, {}], "album")).toBe("")
    expect(shared([], "album")).toBe("")
  })

  it("reads a picture's size from its header", () => {
    expect(pictureSize(png(640, 480))).toEqual({ width: 640, height: 480 })
    expect(pictureSize(jpeg(300, 200))).toEqual({ width: 300, height: 200 })
    expect(pictureSize(jpeg(30, 20, 0xc2))).toEqual({ width: 30, height: 20 })
    // A JPEG whose frame is never found, and one that is broken.
    expect(
      pictureSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]))
    ).toEqual({ width: 0, height: 0 })
    expect(
      pictureSize(
        Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])
      )
    ).toEqual({ width: 0, height: 0 })
    expect(pictureSize(new Uint8Array(8))).toEqual({ width: 0, height: 0 })
  })
})
