// @vitest-environment node
/**
 * Tags changed in files FFmpeg makes, of every kind with a writer here,
 * read back by FFprobe, ExifTool and Mediabunny; FFmpeg's hash of the
 * sound's packets shows the sound was not touched.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import type { Container } from "./formats"
import { retag } from "./retag"
import { changed, valuesOf, type TagChange, type TagValues } from "./tags"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-retag-"))
const at = (name: string) => join(folder, name)

const ffmpeg = (args: string[]) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args])

ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "color=c=teal:s=32x24",
  "-frames:v",
  "1",
  at("cover.png"),
])
ffmpeg([
  "-f",
  "lavfi",
  "-i",
  "color=c=red:s=40x30",
  "-frames:v",
  "1",
  at("old.jpg"),
])
const png = new Uint8Array(readFileSync(at("cover.png")))

const OLD = [
  "-metadata",
  "title=Old title",
  "-metadata",
  "artist=Old artist",
  "-metadata",
  "album=Kept album",
  "-metadata",
  "genre=Rock",
]

/** Two seconds of a tone, written by FFmpeg with these arguments. */
function made(name: string, args: string[], cover = false) {
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=2:sample_rate=44100",
    ...(cover
      ? [
          "-i",
          at("old.jpg"),
          "-map",
          "0",
          "-map",
          "1",
          "-c:v",
          "copy",
          "-disposition:v",
          "attached_pic",
        ]
      : []),
    ...args,
    at(name),
  ])
  return new Uint8Array(readFileSync(at(name)))
}

/** FFmpeg's hash of the sound's packets, copied as they are. */
function soundHash(bytes: Uint8Array, name: string) {
  writeFileSync(at(name), bytes)
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    at(name),
    "-map",
    "0:a",
    "-c",
    "copy",
    "-f",
    "md5",
    "-",
  ])
    .toString()
    .trim()
}

/** What FFmpeg says when it decodes the whole file; empty when all is well. */
function decodeErrors(bytes: Uint8Array, name: string) {
  writeFileSync(at(name), bytes)
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", at(name), "-f", "null", "-"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }
  ).trim()
}

/** What FFprobe reads of the file's tags, keys in lower case. */
function probed(bytes: Uint8Array, name: string) {
  writeFileSync(at(name), bytes)
  const json = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format_tags:stream_tags:stream=codec_type,disposition",
      "-of",
      "json",
      at(name),
    ]).toString()
  ) as {
    format: { tags?: Record<string, string> }
    streams: {
      codec_type: string
      tags?: Record<string, string>
      disposition?: Record<string, number>
    }[]
  }
  const tags: Record<string, string> = {}
  const add = (from?: Record<string, string>) => {
    for (const [key, value] of Object.entries(from ?? {}))
      tags[key.toLowerCase()] = value
  }
  add(json.format.tags)
  // Ogg keeps its comments on the stream.
  for (const stream of json.streams)
    if (stream.codec_type === "audio") add(stream.tags)
  return {
    tags,
    pictures: json.streams.filter((stream) => stream.codec_type === "video")
      .length,
  }
}

/** What ExifTool reads: its fields, and any warning it gives. */
function exif(bytes: Uint8Array, name: string) {
  writeFileSync(at(name), bytes)
  return JSON.parse(
    execFileSync("exiftool", ["-j", "-a", "-G1", at(name)]).toString()
  )[0] as Record<string, unknown>
}

/** What Mediabunny reads. */
async function readBack(bytes: Uint8Array) {
  const input = new mediabunny.Input({
    source: new mediabunny.BufferSource(bytes),
    formats: mediabunny.ALL_FORMATS,
  })
  try {
    const tags = await input.getMetadataTags()
    return {
      values: valuesOf(tags),
      cover:
        tags.images?.find((image) => image.kind === "coverFront") ??
        tags.images?.[0] ??
        null,
    }
  } finally {
    input.dispose()
  }
}

const everything: TagChange = {
  fields: {
    title: "Новая песня ✓",
    artist: "KeepSimp",
    year: "2024",
    track: "3",
    tracks: "12",
    disc: "1",
    discs: "2",
    genre: "Jazz",
    comment: "Written on the device",
    lyrics: "La la la\nLa la",
  },
  cover: { data: png, mimeType: "image/png" },
}

const kinds: {
  name: string
  container: Container
  args: string[]
  cover?: boolean
}[] = [
  {
    name: "v24.mp3",
    container: "mp3",
    args: ["-c:a", "libmp3lame", "-b:a", "96k", "-id3v2_version", "4", ...OLD],
    cover: true,
  },
  {
    name: "v23.mp3",
    container: "mp3",
    args: [
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-id3v2_version",
      "3",
      "-write_id3v1",
      "1",
      ...OLD,
    ],
  },
  {
    name: "bare.mp3",
    container: "mp3",
    args: [
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-id3v2_version",
      "0",
      "-map_metadata",
      "-1",
    ],
  },
  {
    name: "tone.aac",
    container: "adts",
    args: [
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-f",
      "adts",
      "-write_id3v2",
      "1",
      ...OLD,
    ],
  },
  {
    name: "tone.flac",
    container: "flac",
    args: ["-c:a", "flac", ...OLD],
    cover: true,
  },
  {
    name: "end.m4a",
    container: "mp4",
    args: ["-c:a", "aac", "-b:a", "96k", ...OLD],
    cover: true,
  },
  {
    name: "start.m4a",
    container: "mp4",
    args: ["-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", ...OLD],
  },
  {
    name: "tone.opus",
    container: "ogg",
    args: ["-c:a", "libopus", "-b:a", "64k", ...OLD],
  },
  {
    name: "tone.ogg",
    container: "ogg",
    args: ["-ac", "2", "-c:a", "vorbis", "-strict", "-2", ...OLD],
  },
  { name: "tone.wav", container: "wav", args: ["-c:a", "pcm_s16le", ...OLD] },
]

describe("tags changed in place", () => {
  for (const kind of kinds) {
    it(`${kind.name}: every field and the cover, the sound untouched`, async () => {
      const source = made(kind.name, kind.args, kind.cover)
      const before = await readBack(source)
      const out = retag(source, kind.container, everything, true)
      expect(out).not.toBeNull()
      expect(soundHash(out!, `new-${kind.name}`)).toBe(
        soundHash(source, `old-${kind.name}`)
      )

      // Mediabunny: every field as asked, the album (not asked about) kept, the new cover.
      const after = await readBack(out!)
      const wanted: TagValues = changed(before.values, everything)
      expect(after.values).toEqual(wanted)
      if (before.values.album) expect(after.values.album).toBe("Kept album")
      expect(after.cover?.mimeType).toBe("image/png")
      expect(new Uint8Array(after.cover!.data)).toEqual(png)

      // FFprobe.
      const { tags, pictures } = probed(out!, `probe-${kind.name}`)
      expect(tags.title).toBe("Новая песня ✓")
      expect(tags.artist).toBe("KeepSimp")
      if (before.values.album) expect(tags.album).toBe("Kept album")
      expect(tags.genre).toBe("Jazz")
      expect(tags.date ?? tags.year ?? tags.date_recorded ?? "").toContain(
        "2024"
      )
      expect(tags.track).toMatch(/^3(\/12)?$/)
      if (kind.container !== "ogg") expect(pictures).toBe(1)

      // ExifTool, which says when a tag is malformed.
      const read = exif(out!, `exif-${kind.name}`)
      const text = JSON.stringify(read)
      expect(text).toContain("Новая песня ✓")
      expect(text).toContain("KeepSimp")
      expect(
        Object.keys(read).filter((key) => /Warning|Error/.test(key))
      ).toEqual([])

      // A second, small change: only what it names changes.
      const again = retag(
        out!,
        kind.container,
        { fields: { title: "Short" } },
        true
      )!
      expect((await readBack(again)).values).toEqual({
        ...wanted,
        title: "Short",
      })
      expect(soundHash(again, `again-${kind.name}`)).toBe(
        soundHash(source, `old2-${kind.name}`)
      )

      // Taken away, and the sound still the same.
      const bare = retag(out!, kind.container, { fields: {} }, false)!
      const stripped = await readBack(bare)
      expect(stripped.values.title).toBeUndefined()
      expect(stripped.values.artist).toBeUndefined()
      expect(stripped.cover).toBeNull()
      expect(soundHash(bare, `bare-${kind.name}`)).toBe(
        soundHash(source, `old3-${kind.name}`)
      )

      // FFmpeg decodes every result from end to end without a word.
      for (const [bytes, name] of [
        [out!, "decode"],
        [again, "decode-again"],
        [bare, "decode-bare"],
      ] as const)
        expect(decodeErrors(bytes, `${name}-${kind.name}`)).toBe("")

      // Nothing asked: the very same bytes.
      expect(retag(source, kind.container, { fields: {} }, true)).toBe(source)
    })
  }
})

describe("a large cover", () => {
  // Noise does not compress: a picture of about 270 KB.
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "nullsrc=s=300x300,geq=random(1)*255:128:128",
    "-frames:v",
    "1",
    at("big.png"),
  ])
  const big = new Uint8Array(readFileSync(at("big.png")))

  for (const kind of kinds.filter((one) =>
    [
      "v24.mp3",
      "tone.flac",
      "start.m4a",
      "tone.opus",
      "tone.ogg",
      "tone.wav",
    ].includes(one.name)
  ))
    it(`${kind.name}: goes in whole, and the sound still plays`, async () => {
      const source = made(`big-${kind.name}`, kind.args, kind.cover)
      const out = retag(
        source,
        kind.container,
        { fields: {}, cover: { data: big, mimeType: "image/png" } },
        true
      )!
      expect(new Uint8Array((await readBack(out)).cover!.data)).toEqual(big)
      expect(soundHash(out, `big-new-${kind.name}`)).toBe(
        soundHash(source, `big-old-${kind.name}`)
      )
      expect(decodeErrors(out, `big-decode-${kind.name}`)).toBe("")
      // And out again, back to a small header.
      const small = retag(
        out,
        kind.container,
        { fields: {}, cover: null },
        true
      )!
      expect((await readBack(small)).cover).toBeNull()
      expect(soundHash(small, `big-small-${kind.name}`)).toBe(
        soundHash(source, `big-old2-${kind.name}`)
      )
      expect(decodeErrors(small, `big-small-decode-${kind.name}`)).toBe("")
    })
})
