/**
 * Vorbis comments, the tags of FLAC, Opus and Vorbis files: a vendor
 * string and a list of KEY=value lines. A change replaces the lines of the
 * fields it names (each under every name players use for it) and leaves
 * the rest as they were. Pictures are FLAC picture structures: blocks of
 * their own in a FLAC file, and base64 in a METADATA_BLOCK_PICTURE line in
 * an Ogg one.
 */

import {
  cleaned,
  pictureSize,
  type Cover,
  type TagChange,
  type TagField,
} from "./tags"

export interface VorbisComments {
  vendor: string
  lines: string[]
}

const utf8 = new TextDecoder()
const encoder = new TextEncoder()

/** The comments at `at`, little-endian as Vorbis writes them, and where they end; null when they do not fit. */
export function readComments(
  bytes: Uint8Array,
  at: number,
  end = bytes.length
): { comments: VorbisComments; end: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const string = (from: number) => {
    if (from + 4 > end) return null
    const length = view.getUint32(from, true)
    if (from + 4 + length > end) return null
    return {
      text: utf8.decode(bytes.subarray(from + 4, from + 4 + length)),
      next: from + 4 + length,
    }
  }
  const vendor = string(at)
  if (!vendor || vendor.next + 4 > end) return null
  const count = view.getUint32(vendor.next, true)
  let next = vendor.next + 4
  const lines: string[] = []
  for (let index = 0; index < count; index++) {
    const line = string(next)
    if (!line) return null
    lines.push(line.text)
    next = line.next
  }
  return { comments: { vendor: vendor.text, lines }, end: next }
}

/** Comments as bytes. */
export function writeComments(comments: VorbisComments): Uint8Array {
  const strings = [comments.vendor, ...comments.lines].map((text) =>
    encoder.encode(text)
  )
  const out = new Uint8Array(
    4 + strings.reduce((sum, string) => sum + 4 + string.length, 0)
  )
  const view = new DataView(out.buffer)
  let at = 0
  const put = (string: Uint8Array) => {
    view.setUint32(at, string.length, true)
    out.set(string, at + 4)
    at += 4 + string.length
  }
  put(strings[0])
  view.setUint32(at, comments.lines.length, true)
  at += 4
  for (const string of strings.slice(1)) put(string)
  return out
}

/** The names each field goes by, the one written first. */
const NAMES: Record<TagField, readonly string[]> = {
  title: ["TITLE"],
  artist: ["ARTIST"],
  album: ["ALBUM"],
  albumArtist: ["ALBUMARTIST", "ALBUM ARTIST"],
  year: ["DATE", "YEAR"],
  track: ["TRACKNUMBER"],
  tracks: ["TRACKTOTAL", "TOTALTRACKS"],
  disc: ["DISCNUMBER"],
  discs: ["DISCTOTAL", "TOTALDISCS"],
  genre: ["GENRE"],
  comment: ["COMMENT", "DESCRIPTION"],
  lyrics: ["LYRICS", "UNSYNCEDLYRICS"],
}

const keyOf = (line: string) => line.slice(0, line.indexOf("=")).toUpperCase()

/** A FLAC picture structure: the front cover, its size read from the picture. */
export function flacPicture(cover: Cover): Uint8Array {
  const mime = encoder.encode(cover.mimeType)
  const { width, height } = pictureSize(cover.data)
  const out = new Uint8Array(32 + mime.length + cover.data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, 3)
  view.setUint32(4, mime.length)
  out.set(mime, 8)
  let at = 8 + mime.length
  view.setUint32(at, 0) // No description.
  view.setUint32(at + 4, width)
  view.setUint32(at + 8, height)
  view.setUint32(at + 12, cover.mimeType === "image/png" ? 32 : 24)
  view.setUint32(at + 16, 0)
  view.setUint32(at + 20, cover.data.length)
  at += 24
  out.set(cover.data, at)
  return out
}

/** Bytes as base64, a piece at a time. */
export function base64(bytes: Uint8Array) {
  let text = ""
  for (let at = 0; at < bytes.length; at += 0x8000)
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

/** A track or disc number and its total, from "3/12". */
function pairOf(
  lines: readonly string[],
  numberKey: string,
  totalKeys: readonly string[]
) {
  const find = (keys: readonly string[]) =>
    lines
      .find((line) => keys.includes(keyOf(line)))
      ?.split("=")
      .slice(1)
      .join("=")
      .trim() ?? ""
  const [number = "", inline = ""] = find([numberKey])
    .split("/")
    .map((part) => part.trim())
  const whole = (text: string) =>
    /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : ""
  return {
    number: whole(number),
    total: whole(find(totalKeys)) || whole(inline),
  }
}

/**
 * The lines after a change. Pictures go into the lines (`inLines`, for
 * Ogg) or are kept apart (FLAC's blocks), when the lines' own are taken out.
 */
export function changedLines(
  lines: readonly string[],
  change: TagChange,
  inLines: boolean
): string[] {
  let kept = [...lines]
  const added: string[] = []
  const value = (field: TagField) => {
    const given = change.fields[field]
    return given === undefined ? undefined : cleaned(field, given)
  }
  const drop = (names: readonly string[]) => {
    kept = kept.filter((line) => !names.includes(keyOf(line)))
  }
  for (const field of [
    "title",
    "artist",
    "album",
    "albumArtist",
    "year",
    "genre",
    "comment",
    "lyrics",
  ] as const) {
    const text = value(field)
    if (text === undefined) continue
    drop(NAMES[field])
    if (text) added.push(`${NAMES[field][0]}=${text}`)
  }
  for (const [numberField, totalField] of [
    ["track", "tracks"],
    ["disc", "discs"],
  ] as const) {
    const number = value(numberField)
    const total = value(totalField)
    if (number === undefined && total === undefined) continue
    const had = pairOf(kept, NAMES[numberField][0], NAMES[totalField])
    const n = number ?? had.number
    const t = total ?? had.total
    drop([...NAMES[numberField], ...NAMES[totalField]])
    if (n) added.push(`${NAMES[numberField][0]}=${n}`)
    if (t) added.push(`${NAMES[totalField][0]}=${t}`)
  }
  if (change.cover !== undefined) {
    drop(["METADATA_BLOCK_PICTURE", "COVERART", "COVERARTMIME"])
    if (change.cover && inLines)
      added.push(`METADATA_BLOCK_PICTURE=${base64(flacPicture(change.cover))}`)
  }
  return [...kept, ...added]
}
