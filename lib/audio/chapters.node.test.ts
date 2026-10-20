// @vitest-environment node
/**
 * Chapters written into files FFmpeg makes, read back by FFprobe; the sound
 * decodes exactly as it did.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  holdsChapters,
  MOST_CHAPTERS,
  withMp3Chapters,
  withMp4Chapters,
} from "./chapters"
import { boxes, child, shiftChunks } from "./mp4-edit"

/** An MP4 with its moov/udta taken out, chunk offsets put right. */
function withoutUdta(bytes: Uint8Array) {
  const top = boxes(bytes, 0, bytes.length)!
  const moov = top.find((box) => box.type === "moov")!
  const udta = child(bytes, moov, "udta")
  if (!udta) return bytes
  const out = new Uint8Array(bytes.length - udta.size)
  out.set(bytes.subarray(0, udta.start))
  out.set(bytes.subarray(udta.start + udta.size), udta.start)
  new DataView(out.buffer).setUint32(moov.start, moov.size - udta.size)
  if (top.some((box) => box.type === "mdat" && box.start > moov.start))
    shiftChunks(out, moov.start, moov.size - udta.size, -udta.size)
  return out
}

const folder = mkdtempSync(join(tmpdir(), "keepsimp-chapters-"))

function made(name: string, args: string[]) {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=f=440:d=6",
    ...args,
    path,
  ])
  return new Uint8Array(readFileSync(path))
}

function chaptersOf(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return (
    JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_chapters",
        "-of",
        "json",
        path,
      ]).toString()
    ) as {
      chapters: {
        start_time: string
        end_time: string
        tags?: { title?: string }
      }[]
    }
  ).chapters.map((chapter) => ({
    start: Number(chapter.start_time),
    title: chapter.tags?.title,
  }))
}

const decoded = (bytes: Uint8Array, name: string) => {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-"],
    {
      maxBuffer: 1 << 28,
    }
  )
}

const chapters = [
  { title: "Intro", start: 0 },
  { title: "Le deuxième", start: 2.5 },
  { title: "The end", start: 4 },
]

describe("MP3 chapters", () => {
  it("go into an ID3v2.4 tag that has frames, keeping them", () => {
    const mp3 = made("tagged.mp3", [
      "-id3v2_version",
      "4",
      "-metadata",
      "title=Joined",
    ])
    const out = withMp3Chapters(mp3, chapters, 6)
    expect(chaptersOf(out, "tagged-out.mp3")).toEqual(chapters)
    const probed = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format_tags=title",
        "-of",
        "json",
        join(folder, "tagged-out.mp3"),
      ]).toString()
    )
    expect(probed.format.tags.title).toBe("Joined")
    expect(decoded(out, "a.mp3").equals(decoded(mp3, "b.mp3"))).toBe(true)
  })

  it("make a tag when there is none, and leave other tag versions alone", () => {
    const bare = made("bare.mp3", ["-write_id3v2", "0"])
    const out = withMp3Chapters(bare, chapters, 6)
    expect(chaptersOf(out, "bare-out.mp3")).toEqual(chapters)
    expect(decoded(out, "c.mp3").equals(decoded(bare, "d.mp3"))).toBe(true)
    // An MP3 with no tag at all: one is made.
    const tagged = made("strip.mp3", ["-id3v2_version", "4"])
    const tagSize =
      10 +
      ((tagged[6] << 21) | (tagged[7] << 14) | (tagged[8] << 7) | tagged[9])
    const untagged = tagged.slice(tagSize)
    expect(untagged[0]).not.toBe(0x49)
    expect(
      chaptersOf(withMp3Chapters(untagged, chapters, 6), "untagged.mp3")
    ).toEqual(chapters)
    const old = made("old.mp3", ["-id3v2_version", "3", "-metadata", "title=x"])
    expect(withMp3Chapters(old, chapters, 6)).toBe(old)
    expect(withMp3Chapters(bare, [], 6)).toBe(bare)
  })
})

describe("M4A chapters", () => {
  it("go into moov/udta, with the movie box before the sound or after it", () => {
    for (const [name, args] of [
      ["first.m4a", ["-c:a", "aac", "-movflags", "+faststart"]],
      ["last.m4a", ["-c:a", "aac"]],
      [
        "plain.m4a",
        [
          "-c:a",
          "aac",
          "-map_metadata",
          "-1",
          "-fflags",
          "+bitexact",
          "-movflags",
          "+faststart",
        ],
      ],
    ] as const) {
      const m4a = made(name, [...args])
      const out = withMp4Chapters(m4a, chapters)
      const read = chaptersOf(out, `out-${name}`)
      expect(read.map((chapter) => chapter.title)).toEqual(
        chapters.map((c) => c.title)
      )
      read.forEach((chapter, index) =>
        expect(chapter.start).toBeCloseTo(chapters[index].start, 2)
      )
      expect(decoded(out, `e-${name}`).equals(decoded(m4a, `f-${name}`))).toBe(
        true
      )
      // Written twice, the list is replaced, not doubled.
      expect(
        chaptersOf(withMp4Chapters(out, chapters.slice(0, 1)), `twice-${name}`)
      ).toHaveLength(1)
    }
  })

  it("make the user data box when there is none", () => {
    const m4a = withoutUdta(
      made("bare.m4a", ["-c:a", "aac", "-movflags", "+faststart"])
    )
    expect(
      child(
        m4a,
        boxes(m4a, 0, m4a.length)!.find((box) => box.type === "moov")!,
        "udta"
      )
    ).toBeNull()
    const out = withMp4Chapters(m4a, chapters)
    expect(
      chaptersOf(out, "bare-out.m4a").map((chapter) => chapter.title)
    ).toEqual(chapters.map((chapter) => chapter.title))
    expect(decoded(out, "g.m4a").equals(decoded(m4a, "h.m4a"))).toBe(true)
    expect(holdsChapters("mp3")).toBe(true)
    expect(holdsChapters("m4r")).toBe(true)
    expect(holdsChapters("flac")).toBe(false)
  })

  it("leave what is not an MP4 alone, and hold at most 255", () => {
    const junk = Uint8Array.of(1, 2, 3)
    expect(withMp4Chapters(junk, chapters)).toBe(junk)
    const m4a = made("many.m4a", ["-c:a", "aac"])
    expect(withMp4Chapters(m4a, [])).toBe(m4a)
    const many = Array.from({ length: 300 }, (_, index) => ({
      title: `Part ${index + 1}`,
      start: index * 0.01,
    }))
    expect(chaptersOf(withMp4Chapters(m4a, many), "many-out.m4a")).toHaveLength(
      MOST_CHAPTERS
    )
  })
})
