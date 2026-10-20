/**
 * Chapters in a joined file, one for each file joined, written after the
 * file is made (Mediabunny writes none). An MP3 gets the ID3v2 chapter
 * frames (CHAP, and a CTOC listing them in order) in the ID3v2.4 tag at its
 * start, made when it has none. An M4A gets a Nero chapter list (a `chpl`
 * box in moov/udta), which FFmpeg, VLC and foobar2000 read; Apple's own
 * apps read chapters from a text track instead, which is not written.
 */

import { boxes, child, shiftChunks } from "./mp4-edit"

export interface Chapter {
  title: string
  /** Seconds from the start. */
  start: number
}

/** The most chapters a Nero list holds. */
export const MOST_CHAPTERS = 255

const encoder = new TextEncoder()

/** A 28-bit number as ID3v2.4 writes sizes: seven bits in each byte. */
function synchsafe(value: number) {
  return [
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]
}

const readSynchsafe = (bytes: Uint8Array, at: number) =>
  (bytes[at] << 21) |
  (bytes[at + 1] << 14) |
  (bytes[at + 2] << 7) |
  bytes[at + 3]

/** An ID3v2.4 frame. */
function frame(id: string, data: Uint8Array) {
  const out = new Uint8Array(10 + data.length)
  out.set(encoder.encode(id), 0)
  out.set(synchsafe(data.length), 4)
  out.set(data, 10)
  return out
}

const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const u32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
]

/** The CHAP frames and the CTOC frame for chapters of a sound `length` seconds long. */
function chapterFrames(chapters: readonly Chapter[], length: number) {
  const ids = chapters.map((_, index) => `chp${index}`)
  const chaps = chapters.map((chapter, index) => {
    const end = chapters[index + 1]?.start ?? length
    const title = frame(
      "TIT2",
      join([Uint8Array.of(3), encoder.encode(chapter.title)])
    )
    return frame(
      "CHAP",
      join([
        encoder.encode(`${ids[index]}\0`),
        Uint8Array.from([
          ...u32(Math.round(chapter.start * 1000)),
          ...u32(Math.round(end * 1000)),
          // No byte offsets: the times are used.
          ...u32(0xffffffff),
          ...u32(0xffffffff),
        ]),
        title,
      ])
    )
  })
  const toc = frame(
    "CTOC",
    join([
      encoder.encode("toc\0"),
      // The top level, and in order.
      Uint8Array.of(0x03, chapters.length),
      ...ids.map((id) => encoder.encode(`${id}\0`)),
    ])
  )
  return join([toc, ...chaps])
}

/** An MP3 with chapters in its ID3v2 tag, made when it has none. */
export function withMp3Chapters(
  bytes: Uint8Array,
  chapters: readonly Chapter[],
  length: number
): Uint8Array {
  if (!chapters.length) return bytes
  const added = chapterFrames(chapters, length)
  const tagged =
    bytes.length >= 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33 &&
    bytes[3] === 4
  // A tag of another version, or with a footer or flags, is left alone.
  if (
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33 &&
    (!tagged || bytes[5] !== 0)
  )
    return bytes
  const size = tagged ? readSynchsafe(bytes, 6) : 0
  const body = tagged ? bytes.subarray(10, 10 + size) : new Uint8Array(0)
  // Frames run up to the first byte of padding.
  let end = 0
  while (end + 10 <= body.length && body[end] !== 0)
    end += 10 + readSynchsafe(body, end + 4)
  const frames = join([body.subarray(0, end), added])
  const header = Uint8Array.from([
    0x49,
    0x44,
    0x33,
    4,
    0,
    0,
    ...synchsafe(frames.length),
  ])
  return join([header, frames, bytes.subarray(tagged ? 10 + size : 0)])
}

/** A Nero chapter list box: start times in 100 ns, titles of up to 255 bytes. */
function chplBox(chapters: readonly Chapter[]) {
  const entries = chapters.slice(0, MOST_CHAPTERS).map((chapter) => {
    const title = encoder.encode(chapter.title).subarray(0, 255)
    const entry = new Uint8Array(9 + title.length)
    const view = new DataView(entry.buffer)
    view.setBigUint64(0, BigInt(Math.round(chapter.start * 1e7)))
    entry[8] = title.length
    entry.set(title, 9)
    return entry
  })
  // Size, type, version 1 and flags, four bytes FFmpeg passes over, the count.
  const head = Uint8Array.from([
    0,
    0,
    0,
    0,
    0x63,
    0x68,
    0x70,
    0x6c,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    entries.length,
  ])
  const box = join([head, ...entries])
  new DataView(box.buffer).setUint32(0, box.length)
  return box
}

/** An M4A with a Nero chapter list in moov/udta; as it was when it cannot be changed. */
export function withMp4Chapters(
  bytes: Uint8Array,
  chapters: readonly Chapter[]
): Uint8Array {
  if (!chapters.length) return bytes
  const top = boxes(bytes, 0, bytes.length)
  const moov = top?.find((box) => box.type === "moov")
  if (!top || !moov) return bytes
  const udta = child(bytes, moov, "udta")
  const old = udta ? child(bytes, udta, "chpl") : null
  const chpl = chplBox(chapters)
  // Into the user data box (made when there is none), in place of a list there.
  const insert = udta
    ? chpl
    : join([
        Uint8Array.from([...u32(8 + chpl.length), 0x75, 0x64, 0x74, 0x61]),
        chpl,
      ])
  const at = old
    ? old.start
    : udta
      ? udta.start + udta.size
      : moov.start + moov.size
  const removed = old ? old.size : 0
  const delta = insert.length - removed
  const out = new Uint8Array(bytes.length + delta)
  out.set(bytes.subarray(0, at))
  out.set(insert, at)
  out.set(bytes.subarray(at + removed), at + insert.length)
  const write = new DataView(out.buffer)
  write.setUint32(moov.start, moov.size + delta)
  if (udta) write.setUint32(udta.start, udta.size + delta)
  if (top.some((box) => box.type === "mdat" && box.start > moov.start))
    shiftChunks(out, moov.start, moov.size + delta, delta)
  return out
}

/** Whether a format holds chapters written here. */
export const holdsChapters = (format: string) =>
  format === "mp3" || format === "m4a" || format === "m4r"
