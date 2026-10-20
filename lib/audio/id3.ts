/**
 * ID3v2 tags (at the start of an MP3 or ADTS file, and in a WAV's id3
 * chunk), changed frame by frame: the frames a change names are written
 * anew and every other frame is kept byte for byte, chapters and all.
 * Version 2.4 is written as UTF-8 and 2.3 as Latin-1 or UTF-16, each in its
 * own version. A tag this cannot be sure of (2.2, unsynchronised, or one
 * whose frames do not add up) is not changed: the caller writes the file
 * another way. The ID3v1 tag at the end of a file is kept in step.
 */

import { cleaned, type Cover, type TagChange, type TagField } from "./tags"

export interface Id3Frame {
  id: string
  /** The frame as it is in the file, header and all. */
  raw: Uint8Array
  /** Its data, when its flags leave it plain; null otherwise. */
  data: Uint8Array | null
}

export interface Id3Tag {
  version: 3 | 4
  /** Bytes from the start of the header to the end of the padding (and footer). */
  size: number
  frames: Id3Frame[]
}

const latin1 = new TextDecoder("latin1")
const utf8 = new TextDecoder()
const encoder = new TextEncoder()

const join = (parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const synchsafe = (value: number) => [
  (value >> 21) & 0x7f,
  (value >> 14) & 0x7f,
  (value >> 7) & 0x7f,
  value & 0x7f,
]

const readSynchsafe = (bytes: Uint8Array, at: number) =>
  ((bytes[at] & 0x7f) << 21) |
  ((bytes[at + 1] & 0x7f) << 14) |
  ((bytes[at + 2] & 0x7f) << 7) |
  (bytes[at + 3] & 0x7f)

const readU32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) |
    (bytes[at + 1] << 16) |
    (bytes[at + 2] << 8) |
    bytes[at + 3]) >>>
  0

/** Whether bytes start an ID3v2 tag. */
export const startsId3 = (bytes: Uint8Array, at = 0) =>
  bytes.length >= at + 10 &&
  bytes[at] === 0x49 &&
  bytes[at + 1] === 0x44 &&
  bytes[at + 2] === 0x33

/** The frames of a tag body, sizes read one way; null when they do not add up. */
function walk(
  body: Uint8Array,
  version: 3 | 4,
  safe: boolean
): Id3Frame[] | null {
  const frames: Id3Frame[] = []
  let at = 0
  while (at + 10 <= body.length && body[at] !== 0) {
    const id = latin1.decode(body.subarray(at, at + 4))
    if (!/^[A-Z0-9]{4}$/.test(id)) return null
    const size = safe ? readSynchsafe(body, at + 4) : readU32(body, at + 4)
    if (at + 10 + size > body.length) return null
    // The format flags: compressed, encrypted, unsynchronised and the like.
    const format = body[at + 9]
    const plain = version === 4 ? (format & 0x4f) === 0 : (format & 0xe0) === 0
    // Frames that ask to be dropped when the tag is changed.
    const status = body[at + 8]
    const alterDrop = version === 4 ? status & 0x40 : status & 0x80
    if (!alterDrop)
      frames.push({
        id,
        raw: body.subarray(at, at + 10 + size),
        data: plain ? body.subarray(at + 10, at + 10 + size) : null,
      })
    at += 10 + size
  }
  // What follows the last frame is padding.
  for (; at < body.length; at++) if (body[at] !== 0) return null
  return frames
}

/** The tag at `at`; null when there is none, "unsure" when it cannot be changed safely. */
export function readId3(bytes: Uint8Array, at = 0): Id3Tag | null | "unsure" {
  if (!startsId3(bytes, at)) return null
  const major = bytes[at + 3]
  const flags = bytes[at + 5]
  const declared = readSynchsafe(bytes, at + 6)
  const footer = major === 4 && flags & 0x10 ? 10 : 0
  const size = 10 + declared + footer
  if ((major !== 3 && major !== 4) || flags & 0x80 || at + size > bytes.length)
    return "unsure"
  let start = 10
  // An extended header comes first: 2.4 counts itself, 2.3 does not.
  if (flags & 0x40) {
    const head = bytes.subarray(at + 10)
    start += major === 4 ? readSynchsafe(head, 0) : readU32(head, 0) + 4
    if (start > 10 + declared) return "unsure"
  }
  const body = bytes.subarray(at + start, at + 10 + declared)
  const version = major as 3 | 4
  // Some writers put plain sizes in a 2.4 tag; whichever adds up is used.
  const frames =
    walk(body, version, version === 4) ??
    (version === 4 ? walk(body, version, false) : null)
  return frames ? { version, size, frames } : "unsure"
}

/** Text in a frame, by its encoding byte. */
function decodeText(encoding: number, bytes: Uint8Array) {
  if (encoding === 0) return latin1.decode(bytes)
  if (encoding === 3) return utf8.decode(bytes)
  if (encoding === 1 || encoding === 2) {
    let little = encoding === 1
    let from = 0
    // A byte order mark says which way round, and is not text.
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      little = true
      from = 2
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      little = false
      from = 2
    }
    return new TextDecoder(little ? "utf-16le" : "utf-16be").decode(
      bytes.subarray(from)
    )
  }
  return ""
}

/** A text frame's first value. */
export function textOf(frame: Id3Frame) {
  if (!frame.data || !frame.data.length) return ""
  return decodeText(frame.data[0], frame.data.subarray(1)).split("\0")[0]
}

/** Where the text after a terminated string starts, by encoding. */
function afterTerminated(data: Uint8Array, from: number, encoding: number) {
  const wide = encoding === 1 || encoding === 2
  for (let at = from; at < data.length; at += wide ? 2 : 1)
    if (data[at] === 0 && (!wide || data[at + 1] === 0))
      return at + (wide ? 2 : 1)
  return data.length
}

/** A comment or lyrics frame's description. */
function descriptionOf(frame: Id3Frame) {
  const data = frame.data
  if (!data || data.length < 4) return null
  const end = afterTerminated(data, 4, data[0])
  const wide = data[0] === 1 || data[0] === 2
  return decodeText(data[0], data.subarray(4, end - (wide ? 2 : 1)))
}

const isLatin1 = (text: string) => /^[\u0000-ÿ]*$/.test(text)

/** A string, its encoding byte and its terminator, as this version writes. */
function encoded(text: string, version: 3 | 4) {
  if (version === 4)
    return { encoding: 3, bytes: encoder.encode(text), end: Uint8Array.of(0) }
  if (isLatin1(text))
    return {
      encoding: 0,
      bytes: Uint8Array.from(text, (char) => char.charCodeAt(0)),
      end: Uint8Array.of(0),
    }
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xff
  out[1] = 0xfe
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    out[2 + index * 2] = code & 0xff
    out[3 + index * 2] = code >> 8
  }
  return { encoding: 1, bytes: out, end: Uint8Array.of(0, 0) }
}

/** A frame with its header, as this version writes sizes. */
export function frameOf(id: string, data: Uint8Array, version: 3 | 4) {
  const size =
    version === 4
      ? synchsafe(data.length)
      : [
          (data.length >>> 24) & 0xff,
          (data.length >>> 16) & 0xff,
          (data.length >>> 8) & 0xff,
          data.length & 0xff,
        ]
  return join([
    encoder.encode(id),
    Uint8Array.from(size),
    Uint8Array.of(0, 0),
    data,
  ])
}

const textFrame = (id: string, text: string, version: 3 | 4) => {
  const { encoding, bytes } = encoded(text, version)
  return frameOf(id, join([Uint8Array.of(encoding), bytes]), version)
}

/** A comment or lyrics frame with no description, in English. */
const describedFrame = (id: string, text: string, version: 3 | 4) => {
  const { encoding, bytes, end } = encoded(text, version)
  return frameOf(
    id,
    join([Uint8Array.of(encoding), encoder.encode("eng"), end, bytes]),
    version
  )
}

function pictureFrame(cover: Cover, version: 3 | 4) {
  const { encoding, end } = encoded("", version)
  return frameOf(
    "APIC",
    join([
      Uint8Array.of(encoding),
      encoder.encode(cover.mimeType),
      Uint8Array.of(0, 3),
      end,
      cover.data,
    ]),
    version
  )
}

/** The plain text frames of each field. */
const TEXT_FRAMES: Partial<Record<TagField, string>> = {
  title: "TIT2",
  artist: "TPE1",
  album: "TALB",
  albumArtist: "TPE2",
  genre: "TCON",
}

/** A number and its total, from "3/12". */
function pairOf(frames: readonly Id3Frame[], id: string) {
  const frame = frames.find((one) => one.id === id)
  const [number = "", total = ""] = (frame ? textOf(frame) : "")
    .split("/")
    .map((part) => part.trim())
  const whole = (text: string) =>
    /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : ""
  return { number: whole(number), total: whole(total) }
}

/** The frames of a tag after a change: those it names anew, the rest as they were. */
export function changedFrames(
  frames: readonly Id3Frame[],
  change: TagChange,
  version: 3 | 4
): Uint8Array[] {
  let kept = [...frames]
  const added: Uint8Array[] = []
  const value = (field: TagField) => {
    const given = change.fields[field]
    return given === undefined ? undefined : cleaned(field, given)
  }
  for (const [field, id] of Object.entries(TEXT_FRAMES) as [
    TagField,
    string,
  ][]) {
    const text = value(field)
    if (text === undefined) continue
    kept = kept.filter((frame) => frame.id !== id)
    if (text) added.push(textFrame(id, text, version))
  }
  const year = value("year")
  if (year !== undefined) {
    kept = kept.filter((frame) => frame.id !== "TDRC" && frame.id !== "TYER")
    if (year)
      added.push(textFrame(version === 4 ? "TDRC" : "TYER", year, version))
  }
  for (const [id, numberField, totalField] of [
    ["TRCK", "track", "tracks"],
    ["TPOS", "disc", "discs"],
  ] as const) {
    const number = value(numberField)
    const total = value(totalField)
    if (number === undefined && total === undefined) continue
    const had = pairOf(kept, id)
    const n = number ?? had.number
    const t = total ?? had.total
    kept = kept.filter((frame) => frame.id !== id)
    // A total alone has no frame to go in.
    if (n) added.push(textFrame(id, t ? `${n}/${t}` : n, version))
  }
  for (const [field, id] of [
    ["comment", "COMM"],
    ["lyrics", "USLT"],
  ] as const) {
    const text = value(field)
    if (text === undefined) continue
    // Comments with a description (an encoder's notes) are left.
    kept = kept.filter(
      (frame) => frame.id !== id || (descriptionOf(frame) ?? "") !== ""
    )
    if (text) added.push(describedFrame(id, text, version))
  }
  if (change.cover !== undefined) {
    kept = kept.filter((frame) => frame.id !== "APIC")
    if (change.cover) added.push(pictureFrame(change.cover, version))
  }
  return [...kept.map((frame) => frame.raw), ...added]
}

/** Padding given to a tag that grows, so the next change fits in place. */
export const ID3_PADDING = 1024

/**
 * A tag after a change, as bytes: the same size as `old` when it fits
 * (so nothing after it moves), otherwise larger with padding.
 */
export function rewrittenId3(
  old: Id3Tag | null,
  change: TagChange
): Uint8Array {
  const version = old?.version ?? 4
  const body = join(changedFrames(old?.frames ?? [], change, version))
  const room = old ? old.size - 10 : 0
  // Readers such as ExifTool take fewer than ten bytes after the last frame
  // for a broken frame, so the old size is kept only with room for that.
  const size = body.length + 10 <= room ? room : body.length + ID3_PADDING
  const out = new Uint8Array(10 + size)
  out.set([0x49, 0x44, 0x33, version, 0, 0, ...synchsafe(size)])
  out.set(body, 10)
  return out
}

/** The ID3v1 tag at the end of a file, from where it starts; -1 when there is none. */
export const id3v1At = (bytes: Uint8Array) =>
  bytes.length >= 128 &&
  bytes[bytes.length - 128] === 0x54 &&
  bytes[bytes.length - 127] === 0x41 &&
  bytes[bytes.length - 126] === 0x47
    ? bytes.length - 128
    : -1

/** An ID3v1 tag after a change: fields cut to their room in Latin-1, the genre unknown once changed. */
export function rewrittenId3v1(old: Uint8Array, change: TagChange) {
  const out = old.slice()
  const put = (at: number, room: number, text: string) => {
    out.fill(0, at, at + room)
    for (let index = 0; index < Math.min(room, text.length); index++) {
      const code = text.charCodeAt(index)
      out[at + index] = code <= 0xff ? code : 0x3f
    }
  }
  const value = (field: TagField) => {
    const given = change.fields[field]
    return given === undefined ? undefined : cleaned(field, given)
  }
  const title = value("title")
  if (title !== undefined) put(3, 30, title)
  const artist = value("artist")
  if (artist !== undefined) put(33, 30, artist)
  const album = value("album")
  if (album !== undefined) put(63, 30, album)
  const year = value("year")
  if (year !== undefined) put(93, 4, year)
  // ID3v1.1 ends the comment with a zero and the track.
  const track = value("track")
  const numbered =
    track !== undefined ? !!track : old[125] === 0 && old[126] !== 0
  const comment = value("comment")
  if (comment !== undefined)
    put(97, numbered ? 28 : 30, comment.replace(/\n/g, " "))
  if (track !== undefined) {
    if (track) {
      out[125] = 0
      out[126] = Number(track) <= 255 ? Number(track) : 0
    } else if (old[125] === 0) out[126] = 0
  }
  if (value("genre") !== undefined) out[127] = 255
  return out
}
