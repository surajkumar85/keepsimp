/**
 * A FLAC file's tags changed in place: its Vorbis comment block and its
 * picture blocks are written anew and every other block is kept, in order.
 * Padding takes up the difference, so when the new blocks fit where the old
 * ones were, the frames of sound do not move by a byte.
 */

import { readId3 } from "./id3"
import { isTagChanged, type TagChange } from "./tags"
import {
  changedLines,
  flacPicture,
  readComments,
  writeComments,
} from "./vorbis-comments"

const STREAMINFO = 0
const PADDING = 1
const COMMENT = 4
const PICTURE = 6

/** Padding given when the blocks grow, so the next change fits in place. */
export const FLAC_PADDING = 4096
/** The most a block holds. */
const LARGEST_BLOCK = 0xffffff

interface Block {
  type: number
  body: Uint8Array
}

function blockOf(type: number, body: Uint8Array, last: boolean) {
  const out = new Uint8Array(4 + body.length)
  out[0] = (last ? 0x80 : 0) | type
  out[1] = (body.length >> 16) & 0xff
  out[2] = (body.length >> 8) & 0xff
  out[3] = body.length & 0xff
  out.set(body, 4)
  return out
}

/** The file after a change, or with no tags when `keep` is off; null when it is not a FLAC file this can change. */
export function retagFlac(
  bytes: Uint8Array,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  const id3 = readId3(bytes)
  if (id3 === "unsure") return null
  const at = id3 ? id3.size : 0
  if (
    bytes[at] !== 0x66 ||
    bytes[at + 1] !== 0x4c ||
    bytes[at + 2] !== 0x61 ||
    bytes[at + 3] !== 0x43
  )
    return null
  const blocks: Block[] = []
  let next = at + 4
  for (;;) {
    if (next + 4 > bytes.length) return null
    const head = bytes[next]
    const length =
      (bytes[next + 1] << 16) | (bytes[next + 2] << 8) | bytes[next + 3]
    if ((head & 0x7f) === 127 || next + 4 + length > bytes.length) return null
    blocks.push({
      type: head & 0x7f,
      body: bytes.subarray(next + 4, next + 4 + length),
    })
    next += 4 + length
    if (head & 0x80) break
  }
  if (blocks[0]?.type !== STREAMINFO) return null
  if (keep && !isTagChanged(change)) return bytes
  const room = next - (at + 4)

  const old = blocks.find((block) => block.type === COMMENT)
  const read = old ? readComments(old.body, 0) : null
  if (old && !read) return null
  const pictures = !keep || change.cover !== undefined
  const made: Block[] = []
  const comment = (): Block => ({
    type: COMMENT,
    body: writeComments({
      vendor: read?.comments.vendor ?? "KeepSimp",
      lines: changedLines(read?.comments.lines ?? [], change, false),
    }),
  })
  for (const block of blocks) {
    if (block.type === PADDING) continue
    if (block.type === PICTURE && pictures) continue
    if (block.type === COMMENT) {
      if (keep) made.push(comment())
      continue
    }
    made.push(block)
    // A new comment block goes after the stream's description, which is first.
    if (block.type === STREAMINFO && !old && keep) made.push(comment())
  }
  if (keep && change.cover)
    made.push({ type: PICTURE, body: flacPicture(change.cover) })
  if (made.some((block) => block.body.length > LARGEST_BLOCK)) return null

  const need = made.reduce((sum, block) => sum + 4 + block.body.length, 0)
  const padding =
    need === room ? null : need + 4 <= room ? room - need - 4 : FLAC_PADDING
  if (padding !== null)
    made.push({ type: PADDING, body: new Uint8Array(padding) })
  const written = made.map((block, index) =>
    blockOf(block.type, block.body, index === made.length - 1)
  )
  const start = keep ? bytes.subarray(0, at + 4) : bytes.subarray(at, at + 4)
  const out = new Uint8Array(
    start.length +
      written.reduce((sum, one) => sum + one.length, 0) +
      bytes.length -
      next
  )
  out.set(start)
  let to = start.length
  for (const one of written) {
    out.set(one, to)
    to += one.length
  }
  out.set(bytes.subarray(next), to)
  return out
}
