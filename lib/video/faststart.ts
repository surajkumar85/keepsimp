/**
 * "Fast start" for a written MP4 or MOV: its index (the movie box) moved
 * in front of the media, so a player or a site can start before the whole
 * file is read. YouTube asks for it. Mediabunny writes the index last when
 * it streams to disk; this moves it afterwards, as qt-faststart does.
 *
 * Only the index is read and changed. The media stays where it is in the
 * file it was written to: the result is that file's slices put in another
 * order, so nothing large is copied or held in memory.
 */
import { ascii, boxes, type Box } from "@/lib/audio/mp4-edit"

/** A box at the top of the file. */
export interface TopBox {
  type: string
  start: number
  size: number
}

/** Index boxes bigger than this are left at the end rather than read whole. */
export const MOST_INDEX_BYTES = 256 * 1024 * 1024
const MOST_TOP_BOXES = 10_000

/** The boxes at the top of a file, read from their headers; null when they do not fit. */
export async function topBoxes(file: Blob): Promise<TopBox[] | null> {
  const found: TopBox[] = []
  for (let at = 0; at + 8 <= file.size;) {
    if (found.length >= MOST_TOP_BOXES) return null
    const head = new Uint8Array(
      await file.slice(at, Math.min(at + 16, file.size)).arrayBuffer()
    )
    const view = new DataView(head.buffer)
    const small = view.getUint32(0)
    let size: number
    let header = 8
    if (small === 1) {
      if (head.length < 16) return null
      size = Number(view.getBigUint64(8))
      header = 16
    } else size = small === 0 ? file.size - at : small
    if (size < header || at + size > file.size) return null
    found.push({ type: ascii(head, 4), start: at, size })
    at += size
  }
  return found
}

export type FastStart =
  | { file: Blob; moved: true; edited: boolean }
  | {
      file: Blob
      moved: false
      reason: "already" | "unreadable" | "fragmented" | "large" | "offsets"
    }

/** The chunk offset tables of a movie box held in `moov`; null when a box in the way cannot be read. */
function offsetTables(moov: Uint8Array): Box[] | null {
  const tables: Box[] = []
  const walk = (list: Box[] | null): boolean => {
    if (!list) return false
    for (const box of list) {
      if (box.type === "stco" || box.type === "co64") tables.push(box)
      if (
        ["trak", "mdia", "minf", "stbl"].includes(box.type) &&
        !walk(boxes(moov, box.body, box.start + box.size))
      )
        return false
    }
    return true
  }
  return walk(boxes(moov, 8, moov.length)) ? tables : null
}

/**
 * Put the index of an MP4 or MOV in front of its media, changed by `edit`
 * on the way (an edit list for the sound, say; null leaves it). The limits
 * are for tests.
 */
export async function fastStart(
  file: Blob,
  {
    mostIndex = MOST_INDEX_BYTES,
    mostOffset = 0xffff_ffff,
    edit,
  }: {
    mostIndex?: number
    mostOffset?: number
    edit?: (index: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> | null
  } = {}
): Promise<FastStart> {
  const top = await topBoxes(file)
  const moov = top?.find((box) => box.type === "moov")
  const mdat = top?.find((box) => box.type === "mdat")
  if (!top || !moov || !mdat)
    return { file, moved: false, reason: "unreadable" }
  if (top.some((box) => box.type === "moof"))
    return { file, moved: false, reason: "fragmented" }
  if (moov.start < mdat.start) return { file, moved: false, reason: "already" }
  if (moov.size > mostIndex) return { file, moved: false, reason: "large" }

  const read = new Uint8Array(
    await file.slice(moov.start, moov.start + moov.size).arrayBuffer()
  )
  const changed = edit?.(read) ?? null
  const index = changed ?? read
  // Everything from the first media box to the index moves on by its size.
  const from = mdat.start
  const to = moov.start
  const delta = index.length
  const write = new DataView(index.buffer)
  const tables = offsetTables(index)
  if (!tables) return { file, moved: false, reason: "unreadable" }
  for (const table of tables) {
    const count = write.getUint32(table.body + 4)
    const wide = table.type === "co64"
    const step = wide ? 8 : 4
    if (table.body + 8 + count * step > table.start + table.size)
      return { file, moved: false, reason: "unreadable" }
    for (let entry = 0; entry < count; entry++) {
      const where = table.body + 8 + entry * step
      const offset = wide
        ? Number(write.getBigUint64(where))
        : write.getUint32(where)
      if (offset < from || offset >= to) continue
      if (wide) write.setBigUint64(where, BigInt(offset + delta))
      else if (offset + delta > mostOffset)
        return { file, moved: false, reason: "offsets" }
      else write.setUint32(where, offset + delta)
    }
  }
  return {
    file: new Blob(
      [
        file.slice(0, from),
        index,
        file.slice(from, to),
        file.slice(moov.start + moov.size),
      ],
      { type: file.type }
    ),
    moved: true,
    edited: changed !== null,
  }
}
