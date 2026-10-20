/**
 * A WAV file's tags changed in place. RIFF INFO, which Windows reads, holds
 * a few fields in Latin-1 only; an id3 chunk (read by FFmpeg, players and
 * Mediabunny) holds them all, cover and lyrics too. Both are written: the
 * id3 chunk with every field, INFO with the ones it can hold. Every other
 * chunk, the sound first of all, is kept byte for byte; chunks that were
 * not there are added at the end.
 */

import { readId3, rewrittenId3 } from "./id3"
import { cleaned, isTagChanged, type TagChange, type TagField } from "./tags"

interface Chunk {
  id: string
  start: number
  /** The chunk with its header and padding. */
  end: number
  data: Uint8Array
}

const latin1 = new TextDecoder("latin1")

/** The fields INFO holds, by its names. */
const INFO: Partial<Record<TagField, string>> = {
  title: "INAM",
  artist: "IART",
  album: "IPRD",
  year: "ICRD",
  genre: "IGNR",
  comment: "ICMT",
  track: "ITRK",
}

function chunksOf(bytes: Uint8Array, from: number, to: number): Chunk[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: Chunk[] = []
  for (let at = from; at + 8 <= to;) {
    const size = view.getUint32(at + 4, true)
    const end = at + 8 + size + (size & 1)
    // The last chunk's padding byte may be missing.
    if (at + 8 + size > to) return null
    found.push({
      id: latin1.decode(bytes.subarray(at, at + 4)),
      start: at,
      end: Math.min(end, to),
      data: bytes.subarray(at + 8, at + 8 + size),
    })
    at = end
  }
  return found
}

function chunk(id: string, data: Uint8Array) {
  const out = new Uint8Array(8 + data.length + (data.length & 1))
  out.set(Array.from(id, (char) => char.charCodeAt(0)))
  new DataView(out.buffer).setUint32(4, data.length, true)
  out.set(data, 8)
  return out
}

const isLatin1 = (text: string) => /^[\u0001-ÿ]*$/.test(text)

/** The INFO list after a change; null when it would hold nothing. */
function changedInfo(old: Chunk | null, change: TagChange) {
  const inside = old ? (chunksOf(old.data, 4, old.data.length) ?? []) : []
  const dropped = new Set<string>()
  const added: Uint8Array[] = []
  for (const [field, id] of Object.entries(INFO) as [TagField, string][]) {
    const given = change.fields[field]
    if (given === undefined) continue
    dropped.add(id)
    const text = cleaned(field, given).replace(/\n/g, " ")
    if (text && isLatin1(text))
      added.push(
        chunk(
          id,
          Uint8Array.from(`${text}\0`, (char) => char.charCodeAt(0))
        )
      )
  }
  const kept = inside
    .filter((one) => !dropped.has(one.id))
    .map((one) => old!.data.subarray(one.start, one.end))
  if (!kept.length && !added.length) return null
  const parts = [Uint8Array.from([0x49, 0x4e, 0x46, 0x4f]), ...kept, ...added]
  const body = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    body.set(part, at)
    at += part.length
  }
  return chunk("LIST", body)
}

const isInfo = (one: Chunk) =>
  one.id === "LIST" && latin1.decode(one.data.subarray(0, 4)) === "INFO"
const isId3 = (one: Chunk) => one.id === "id3 " || one.id === "ID3 "

/** The file after a change, or with no tags when `keep` is off; null when it is not a WAV this can change. */
export function retagWav(
  bytes: Uint8Array,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  if (
    latin1.decode(bytes.subarray(0, 4)) !== "RIFF" ||
    latin1.decode(bytes.subarray(8, 12)) !== "WAVE"
  )
    return null
  const declared = new DataView(bytes.buffer, bytes.byteOffset).getUint32(
    4,
    true
  )
  const chunks = chunksOf(bytes, 12, Math.min(bytes.length, 8 + declared))
  if (!chunks || !chunks.some((one) => one.id === "data")) return null
  const info = chunks.find(isInfo) ?? null
  const id3Chunk = chunks.find(isId3) ?? null
  const old = id3Chunk ? readId3(id3Chunk.data) : null
  if (old === "unsure") return null
  if (keep && !isTagChanged(change)) return bytes
  if (!keep && !info && !id3Chunk) return bytes

  const newInfo = keep ? changedInfo(info, change) : null
  const newId3 = keep ? chunk("id3 ", rewrittenId3(old, change)) : null
  const parts: Uint8Array[] = [bytes.subarray(0, 12)]
  for (const one of chunks) {
    const whole = bytes.subarray(one.start, one.end)
    if (isInfo(one)) {
      if (newInfo) parts.push(newInfo)
    } else if (isId3(one)) {
      if (newId3) parts.push(newId3)
    } else {
      parts.push(whole)
      // A chunk of odd length whose padding was left out gets it, before another follows.
      if (one.end - one.start < 8 + one.data.length + (one.data.length & 1))
        parts.push(Uint8Array.of(0))
    }
  }
  if (newInfo && !info) parts.push(newInfo)
  if (newId3 && !id3Chunk) parts.push(newId3)
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  new DataView(out.buffer).setUint32(4, out.length - 8, true)
  return out
}
