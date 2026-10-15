/**
 * Gapless AAC in MP4. An AAC encoder puts a run of samples (its priming)
 * before the sound and pads the end, and an MP4 says which samples to play
 * in an edit list. Browser encoders hand their packets out from time 0, so
 * the file Mediabunny writes plays the priming as a short silence. This
 * writes the edit list into the file afterwards: play from the end of the
 * priming, for exactly the length of the sound.
 */

interface Box {
  type: string
  start: number
  size: number
  /** Where its children or fields begin. */
  body: number
}

const ascii = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])

/** The boxes between `from` and `to`; null when one does not fit or uses a 64-bit size. */
function boxes(bytes: Uint8Array, from: number, to: number): Box[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: Box[] = []
  for (let at = from; at + 8 <= to;) {
    const size = view.getUint32(at)
    if (size < 8 || at + size > to) return null
    found.push({ type: ascii(bytes, at + 4), start: at, size, body: at + 8 })
    at += size
  }
  return found
}

const child = (bytes: Uint8Array, parent: Box, type: string) =>
  boxes(bytes, parent.body, parent.start + parent.size)?.find(
    (box) => box.type === type
  ) ?? null

/** A full box's timescale and where its duration is, by its version. */
function timing(view: DataView, box: Box, durationAt: [number, number]) {
  const version = view.getUint8(box.body)
  const timescale = view.getUint32(box.body + (version ? 20 : 12))
  return {
    version,
    timescale,
    duration: box.body + durationAt[version ? 1 : 0],
  }
}

/** The edit list: play `length` (movie timescale) from `start` (media timescale). */
function editBox(length: number, start: number) {
  const wide = length > 0xffffffff || start > 0x7fffffff
  const elstSize = 16 + (wide ? 20 : 12)
  const out = new Uint8Array(8 + elstSize)
  const view = new DataView(out.buffer)
  view.setUint32(0, out.length)
  out.set([0x65, 0x64, 0x74, 0x73], 4) // edts
  view.setUint32(8, elstSize)
  out.set([0x65, 0x6c, 0x73, 0x74], 12) // elst
  view.setUint8(16, wide ? 1 : 0)
  view.setUint32(20, 1)
  if (wide) {
    view.setBigUint64(24, BigInt(length))
    view.setBigInt64(32, BigInt(start))
    view.setInt16(40, 1)
  } else {
    view.setUint32(24, length)
    view.setInt32(28, start)
    view.setInt16(32, 1)
  }
  return out
}

/**
 * An MP4 with its sound track's edit list set to skip `priming` samples
 * and play `samples` of them. The file is returned as it was when it is
 * not one this can change (no sound track, 64-bit box sizes).
 */
export function withEditList(
  bytes: Uint8Array,
  priming: number,
  samples: number
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const top = boxes(bytes, 0, bytes.length)
  const moov = top?.find((box) => box.type === "moov")
  if (!top || !moov) return bytes
  const inside = boxes(bytes, moov.body, moov.start + moov.size)
  if (!inside) return bytes
  const mvhd = inside.find((box) => box.type === "mvhd")
  const trak = inside.find((box) => {
    if (box.type !== "trak") return false
    const mdia = child(bytes, box, "mdia")
    const hdlr = mdia && child(bytes, mdia, "hdlr")
    return hdlr !== null && ascii(bytes, hdlr.body + 8) === "soun"
  })
  if (!mvhd || !trak) return bytes
  const tkhd = child(bytes, trak, "tkhd")
  const mdia = child(bytes, trak, "mdia")!
  const mdhd = child(bytes, mdia, "mdhd")
  if (!tkhd || !mdhd) return bytes
  const movie = timing(view, mvhd, [16, 24])
  const media = timing(view, mdhd, [16, 24])
  const tkhdVersion = view.getUint8(tkhd.body)
  const length = Math.round((samples * movie.timescale) / media.timescale)
  const edit = editBox(length, priming)
  const old = child(bytes, trak, "edts")
  // The new edit list goes where the old one was, or after the track header.
  const at = old ? old.start : tkhd.start + tkhd.size
  const removed = old ? old.size : 0
  const delta = edit.length - removed
  const out = new Uint8Array(bytes.length + delta)
  out.set(bytes.subarray(0, at))
  out.set(edit, at)
  out.set(bytes.subarray(at + removed), at + edit.length)
  const write = new DataView(out.buffer)
  write.setUint32(moov.start, moov.size + delta)
  write.setUint32(trak.start, trak.size + delta)
  // Durations: the movie's and the track's are the length played.
  const setDuration = (where: number, version: number, value: number) =>
    version
      ? write.setBigUint64(where, BigInt(value))
      : write.setUint32(where, Math.min(0xffffffff, value))
  setDuration(movie.duration, movie.version, length)
  setDuration(
    (tkhd.start < at ? tkhd.body : tkhd.body + delta) + (tkhdVersion ? 28 : 20),
    tkhdVersion,
    length
  )
  // Sound stored after the movie box has moved: its chunk offsets move with it.
  const shift = top.some((box) => box.type === "mdat" && box.start > moov.start)
  if (shift) {
    const moved = boxes(out, moov.body, moov.start + moov.size + delta)!
    const tables: Box[] = []
    const walk = (list: Box[]) => {
      for (const box of list) {
        if (box.type === "stco" || box.type === "co64") tables.push(box)
        if (["trak", "mdia", "minf", "stbl"].includes(box.type))
          walk(boxes(out, box.body, box.start + box.size)!)
      }
    }
    walk(moved)
    for (const table of tables) {
      const count = write.getUint32(table.body + 4)
      for (let index = 0; index < count; index++)
        if (table.type === "stco") {
          const where = table.body + 8 + index * 4
          write.setUint32(where, write.getUint32(where) + delta)
        } else {
          const where = table.body + 8 + index * 8
          write.setBigUint64(where, write.getBigUint64(where) + BigInt(delta))
        }
    }
  }
  return out
}
