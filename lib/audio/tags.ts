/**
 * Tags as the page edits them. A change names only the fields it sets (an
 * empty one takes the field away) and, apart, the cover: everything else a
 * file holds is left as it was. Writing them into a file without touching
 * its sound is `retag.ts`; when a file is written again, the change is
 * applied to the tags Mediabunny read (`withChange`).
 */

import type { MetadataTags } from "mediabunny"

export const TAG_FIELDS = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "year",
  "track",
  "tracks",
  "disc",
  "discs",
  "genre",
  "comment",
  "lyrics",
] as const

export type TagField = (typeof TAG_FIELDS)[number]

export const TAG_LABELS: Record<TagField, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  albumArtist: "Album artist",
  year: "Year",
  track: "Track",
  tracks: "Tracks in all",
  disc: "Disc",
  discs: "Discs in all",
  genre: "Genre",
  comment: "Comment",
  lyrics: "Lyrics",
}

/** Fields that hold a whole number. */
export const NUMBER_FIELDS: readonly TagField[] = [
  "year",
  "track",
  "tracks",
  "disc",
  "discs",
]

/** Fields whose text may run over several lines. */
export const LONG_FIELDS: readonly TagField[] = ["comment", "lyrics"]

export interface Cover {
  data: Uint8Array
  mimeType: string
}

/** The kinds of picture a cover can be, and the largest. */
export const COVER_TYPES = ["image/jpeg", "image/png"] as const
export const LARGEST_COVER = 16 * 1024 * 1024 - 64

/** What a file's tags are, as text. */
export type TagValues = Partial<Record<TagField, string>>

export interface TagChange {
  /** Each field set; an empty one is taken away. */
  fields: Partial<Record<TagField, string>>
  /** A new cover; null takes every picture away; absent leaves them. */
  cover?: Cover | null
}

export const noTagChange: TagChange = { fields: {} }

export const isTagChanged = (change: TagChange) =>
  Object.keys(change.fields).length > 0 || change.cover !== undefined

/** A field's value as it is written: lines kept only where they may be, ends trimmed. */
export function cleaned(field: TagField, value: string) {
  const one = LONG_FIELDS.includes(field)
    ? value.replace(/\r\n?/g, "\n")
    : value.replace(/[\r\n]+/g, " ")
  return one.trim()
}

/** Why a change cannot be written; null when it can. */
export function tagProblem(change: TagChange): string | null {
  for (const field of NUMBER_FIELDS) {
    const value = change.fields[field]
    if (value === undefined || value === "") continue
    if (
      !/^\d{1,4}$/.test(value.trim()) ||
      Number(value) < (field === "year" ? 0 : 1)
    )
      return field === "year"
        ? "Write the year as a number, such as 2024."
        : `Write the ${TAG_LABELS[field].toLowerCase()} as a whole number from 1 to 9999.`
  }
  for (const field of TAG_FIELDS) {
    const value = change.fields[field]
    if (value !== undefined && value.includes("\0"))
      return `The ${TAG_LABELS[field].toLowerCase()} cannot hold that character.`
  }
  const cover = change.cover
  if (cover) {
    if (!(COVER_TYPES as readonly string[]).includes(cover.mimeType))
      return "Choose a JPEG or PNG picture for the cover."
    if (cover.data.length > LARGEST_COVER)
      return "Choose a cover picture smaller than 16 MB."
  }
  return null
}

/** The values a file has after a change. */
export function changed(values: TagValues, change: TagChange): TagValues {
  const out: TagValues = { ...values }
  for (const field of TAG_FIELDS) {
    const value = change.fields[field]
    if (value === undefined) continue
    const clean = cleaned(field, value)
    if (clean) out[field] = clean
    else delete out[field]
  }
  return out
}

/** A file's values, from what Mediabunny read. */
export function valuesOf(tags: MetadataTags): TagValues {
  const out: TagValues = {}
  const text = (field: TagField, value: string | undefined) => {
    if (value?.trim()) out[field] = value.trim()
  }
  const whole = (field: TagField, value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value) && value > 0)
      out[field] = String(Math.round(value))
  }
  text("title", tags.title)
  text("artist", tags.artist)
  text("album", tags.album)
  text("albumArtist", tags.albumArtist)
  if (tags.date && !Number.isNaN(tags.date.getTime()))
    out.year = String(tags.date.getUTCFullYear())
  whole("track", tags.trackNumber)
  whole("tracks", tags.tracksTotal)
  whole("disc", tags.discNumber)
  whole("discs", tags.discsTotal)
  text("genre", tags.genre)
  text("comment", tags.comment)
  text("lyrics", tags.lyrics)
  return out
}

/** The change applied to the tags Mediabunny read, for a file written again. */
export function withChange(
  tags: MetadataTags,
  change: TagChange
): MetadataTags {
  if (!isTagChanged(change)) return tags
  // The format's own tags would say the old values again.
  const out: MetadataTags = { ...tags }
  delete out.raw
  const number = (value: string) => (value ? Number(value) : undefined)
  for (const field of TAG_FIELDS) {
    const given = change.fields[field]
    if (given === undefined) continue
    const value = cleaned(field, given)
    if (field === "year")
      out.date = value ? new Date(Date.UTC(Number(value), 0, 1)) : undefined
    else if (field === "track") out.trackNumber = number(value)
    else if (field === "tracks") out.tracksTotal = number(value)
    else if (field === "disc") out.discNumber = number(value)
    else if (field === "discs") out.discsTotal = number(value)
    else out[field] = value || undefined
  }
  if (change.cover === null) out.images = undefined
  else if (change.cover)
    out.images = [
      {
        data: change.cover.data,
        mimeType: change.cover.mimeType,
        kind: "coverFront",
      },
    ]
  for (const key of Object.keys(out) as (keyof MetadataTags)[])
    if (out[key] === undefined) delete out[key]
  return out
}

/** FNV-1a over a picture's bytes, to tell covers apart in a key. */
function fingerprint(bytes: Uint8Array) {
  let hash = 0x811c9dc5
  for (let index = 0; index < bytes.length; index++) {
    hash ^= bytes[index]
    hash = Math.imul(hash, 0x01000193)
  }
  return `${bytes.length}:${(hash >>> 0).toString(16)}`
}

/** Names a change, so a result written with another is out of date. */
export const tagKey = (change: TagChange) =>
  isTagChanged(change)
    ? JSON.stringify([
        TAG_FIELDS.map((field) => change.fields[field] ?? null),
        change.cover === undefined
          ? "keep"
          : change.cover === null
            ? "none"
            : fingerprint(change.cover.data),
      ])
    : "same"

/** The value every file has, or null when they differ. */
export function shared(list: readonly TagValues[], field: TagField) {
  const first = list[0]?.[field] ?? ""
  return list.every((values) => (values[field] ?? "") === first) ? first : null
}

/** A picture's width and height from its header (PNG or JPEG); zeros when it does not say. */
export function pictureSize(bytes: Uint8Array): {
  width: number
  height: number
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { width: view.getUint32(16), height: view.getUint32(20) }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) break
      const marker = bytes[at + 1]
      const length = view.getUint16(at + 2)
      // Start of frame (baseline, progressive and the rest, not DHT, JPG or DAC).
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      )
        return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
      at += 2 + length
    }
  }
  return { width: 0, height: 0 }
}
