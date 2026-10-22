/**
 * Sound encoded again starts late by its encoder's priming: the encoder
 * puts a run of samples (1,024 for FFmpeg's AAC, 2,112 for Apple's) before
 * the sound, and the browser hands its packets out from time 0. In an MP4
 * or MOV, an edit list on the sound's track tells players to start after
 * the priming, which puts the sound back in step with the picture.
 *
 * This changes only the sound track inside an index held on its own (a
 * movie box from offset 0). The movie's own duration and the picture's
 * track are left as they are.
 */
import { ascii, boxes, child, editBox, timing } from "@/lib/audio/mp4-edit"

/**
 * The index with the sound track set to skip `priming` seconds; null when
 * it has no sound track or is not one this can change.
 */
export function soundStart(index: Uint8Array<ArrayBuffer>, priming: number) {
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength)
  const top = boxes(index, 0, index.length)
  const moov = top?.[0]
  if (!moov || moov.type !== "moov") return null
  const inside = boxes(index, moov.body, moov.start + moov.size)
  const mvhd = inside?.find((box) => box.type === "mvhd")
  const trak = inside?.find((box) => {
    if (box.type !== "trak") return false
    const mdia = child(index, box, "mdia")
    const hdlr = mdia && child(index, mdia, "hdlr")
    return hdlr !== null && ascii(index, hdlr.body + 8) === "soun"
  })
  if (!mvhd || !trak) return null
  const tkhd = child(index, trak, "tkhd")
  const mdia = child(index, trak, "mdia")
  const mdhd = mdia && child(index, mdia, "mdhd")
  if (!tkhd || !mdhd) return null
  const movie = timing(view, mvhd, [16, 24])
  const media = timing(view, mdhd, [16, 24])
  const mediaLength = media.version
    ? Number(view.getBigUint64(media.duration))
    : view.getUint32(media.duration)
  const start = Math.round(priming * media.timescale)
  if (start <= 0 || start >= mediaLength) return null
  const length = Math.round(
    ((mediaLength - start) * movie.timescale) / media.timescale
  )
  const edit = editBox(length, start)
  const old = child(index, trak, "edts")
  // The new edit list goes where the old one was, or after the track header.
  const at = old ? old.start : tkhd.start + tkhd.size
  const removed = old ? old.size : 0
  const delta = edit.length - removed
  const out = new Uint8Array(index.length + delta)
  out.set(index.subarray(0, at))
  out.set(edit, at)
  out.set(index.subarray(at + removed), at + edit.length)
  const write = new DataView(out.buffer)
  write.setUint32(moov.start, moov.size + delta)
  write.setUint32(trak.start, trak.size + delta)
  // The track lasts as long as the sound it plays.
  const tkhdVersion = view.getUint8(tkhd.body)
  const where =
    (tkhd.start < at ? tkhd.body : tkhd.body + delta) + (tkhdVersion ? 28 : 20)
  if (tkhdVersion) write.setBigUint64(where, BigInt(length))
  else write.setUint32(where, Math.min(0xffff_ffff, length))
  return out
}
