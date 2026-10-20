/**
 * An MP4 (M4A, M4R) file's tags changed in place: the items of
 * moov/udta/meta/ilst that a change names are written anew and every other
 * item is kept as it was. When the free box iTunes leaves beside the list
 * can take up the difference, nothing else moves; otherwise the boxes
 * around it grow or shrink and, when the sound comes after the movie box,
 * every chunk offset moves with it. Fragmented files are not changed.
 */

import { ascii, boxes, child, shiftChunks, type Box } from "./mp4-edit"
import { cleaned, isTagChanged, type TagChange, type TagField } from "./tags"

const encoder = new TextEncoder()

const u32 = (value: number) =>
  Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  )

const join = (parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A box: its size, its type (Latin-1, for ©) and what it holds. */
function box(type: string, ...parts: Uint8Array[]) {
  const body = join(parts)
  return join([
    u32(8 + body.length),
    Uint8Array.from(type, (char) => char.charCodeAt(0)),
    body,
  ])
}

/** An item holding one value of a kind (1 text, 0 numbers, 13 JPEG, 14 PNG). */
const item = (type: string, kind: number, value: Uint8Array) =>
  box(type, box("data", u32(kind), u32(0), value))

/** The text items of each field. */
const TEXT_ITEMS: Partial<Record<TagField, string>> = {
  title: "©nam",
  artist: "©ART",
  album: "©alb",
  albumArtist: "aART",
  year: "©day",
  genre: "©gen",
  comment: "©cmt",
  lyrics: "©lyr",
}

/** The value of an item's data box. */
function valueOf(bytes: Uint8Array, entry: Box) {
  const data = child(bytes, entry, "data")
  return data ? bytes.subarray(data.body + 8, data.start + data.size) : null
}

/** A number and its total, from a trkn or disk item. */
function pairOf(bytes: Uint8Array, items: readonly Box[], type: string) {
  const found = items.find((entry) => entry.type === type)
  const value = found ? valueOf(bytes, found) : null
  const read = (at: number) =>
    value && value.length >= at + 2 ? (value[at] << 8) | value[at + 1] : 0
  const text = (number: number) => (number > 0 ? String(number) : "")
  return { number: text(read(2)), total: text(read(4)) }
}

/** The list's items after a change, as bytes. */
function changedItems(
  bytes: Uint8Array,
  items: readonly Box[],
  change: TagChange
) {
  const value = (field: TagField) => {
    const given = change.fields[field]
    return given === undefined ? undefined : cleaned(field, given)
  }
  const dropped = new Set<string>()
  const added: Uint8Array[] = []
  for (const [field, type] of Object.entries(TEXT_ITEMS) as [
    TagField,
    string,
  ][]) {
    const text = value(field)
    if (text === undefined) continue
    dropped.add(type)
    // A genre by number is the old way of saying one.
    if (field === "genre") dropped.add("gnre")
    if (text) added.push(item(type, 1, encoder.encode(text)))
  }
  for (const [type, numberField, totalField, size] of [
    ["trkn", "track", "tracks", 8],
    ["disk", "disc", "discs", 6],
  ] as const) {
    const number = value(numberField)
    const total = value(totalField)
    if (number === undefined && total === undefined) continue
    const had = pairOf(bytes, items, type)
    const n = Number(number ?? had.number) || 0
    const t = Number(total ?? had.total) || 0
    dropped.add(type)
    if (!n && !t) continue
    const data = new Uint8Array(size)
    data.set([0, 0, n >> 8, n & 0xff, t >> 8, t & 0xff])
    added.push(item(type, 0, data))
  }
  if (change.cover !== undefined) {
    dropped.add("covr")
    if (change.cover)
      added.push(
        item(
          "covr",
          change.cover.mimeType === "image/png" ? 14 : 13,
          change.cover.data
        )
      )
  }
  const kept = items
    .filter((entry) => !dropped.has(entry.type))
    .map((entry) => bytes.subarray(entry.start, entry.start + entry.size))
  return join([...kept, ...added])
}

/** The handler a metadata box names: iTunes' item list. */
const HANDLER = box(
  "hdlr",
  u32(0),
  u32(0),
  encoder.encode("mdirappl"),
  u32(0),
  u32(0),
  Uint8Array.of(0)
)

/** Where a metadata box's children start: after its version and flags, unless QuickTime left them out. */
const childrenOf = (bytes: Uint8Array, meta: Box) =>
  ascii(bytes, meta.body + 4) === "hdlr" ? meta.body : meta.body + 4

/**
 * The largest 32-bit chunk offset (stco) of the movie box; infinite when
 * its tables cannot all be found, so a file whose chunks cannot all be
 * moved is not changed.
 */
function largestOffset(bytes: Uint8Array, inMoov: Box[]) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let largest = 0
  const walk = (list: Box[] | null): boolean =>
    list !== null &&
    list.every((entry) => {
      if (entry.type === "stco") {
        const count = view.getUint32(entry.body + 4)
        for (let index = 0; index < count; index++)
          largest = Math.max(
            largest,
            view.getUint32(entry.body + 8 + index * 4)
          )
      }
      return ["trak", "mdia", "minf", "stbl"].includes(entry.type)
        ? walk(boxes(bytes, entry.body, entry.start + entry.size))
        : true
    })
  return walk(inMoov) ? largest : Infinity
}

/** The file after a change, or with no tags when `keep` is off; null when it is not one this can change. */
export function retagMp4(
  bytes: Uint8Array,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  const top = boxes(bytes, 0, bytes.length)
  const moov = top?.find((entry) => entry.type === "moov")
  if (!top || !moov) return null
  const inMoov = boxes(bytes, moov.body, moov.start + moov.size)
  if (!inMoov || inMoov.some((entry) => entry.type === "mvex")) return null
  const udta = child(bytes, moov, "udta")
  const meta = udta ? child(bytes, udta, "meta") : null
  const inMeta = meta
    ? boxes(bytes, childrenOf(bytes, meta), meta.start + meta.size)
    : []
  if (!inMeta) return null
  const ilstAt = inMeta.findIndex((entry) => entry.type === "ilst")
  const ilst = ilstAt >= 0 ? inMeta[ilstAt] : null
  const items = ilst ? boxes(bytes, ilst.body, ilst.start + ilst.size) : []
  if (!items) return null
  if (keep && !isTagChanged(change)) return bytes
  if (!keep && !ilst) return bytes

  const list = keep ? box("ilst", changedItems(bytes, items, change)) : null
  // What is put in, where, in place of how much, inside which boxes.
  let insert: Uint8Array
  let at: number
  let removed: number
  let around: Box[]
  if (ilst) {
    insert = list ?? new Uint8Array(0)
    at = ilst.start
    removed = ilst.size
    around = [moov, udta!, meta!]
    // iTunes' free box beside the list takes up the difference.
    const free = inMeta[ilstAt + 1]
    if (free?.type === "free") {
      const room = ilst.size + free.size
      if (insert.length + 8 <= room) {
        insert = join([
          insert,
          box("free", new Uint8Array(room - insert.length - 8)),
        ])
        removed = room
      }
    }
  } else if (meta) {
    insert = list!
    at = meta.start + meta.size
    removed = 0
    around = [moov, udta!, meta]
  } else {
    const made = box("meta", u32(0), HANDLER, list!)
    insert = udta ? made : box("udta", made)
    at = udta ? udta.start + udta.size : moov.start + moov.size
    removed = 0
    around = udta ? [moov, udta] : [moov]
  }
  const delta = insert.length - removed
  const after = top.some(
    (entry) => entry.type === "mdat" && entry.start > moov.start
  )
  if (after && largestOffset(bytes, inMoov) + delta > 0xffffffff) return null
  const out = new Uint8Array(bytes.length + delta)
  out.set(bytes.subarray(0, at))
  out.set(insert, at)
  out.set(bytes.subarray(at + removed), at + insert.length)
  if (delta) {
    const write = new DataView(out.buffer)
    for (const parent of around)
      write.setUint32(parent.start, parent.size + delta)
    if (after) shiftChunks(out, moov.start, moov.size + delta, delta)
  }
  return out
}
