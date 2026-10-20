/**
 * A file's tags changed without touching its sound: each kind of file has
 * its own writer, which changes only its tags and keeps every byte of
 * sound (and every tag it was not asked to change) as it was. Null when a
 * file is not one these can change safely; it is then written another way.
 */

import type { Container, WrittenFormat } from "./formats"
import { retagFlac } from "./flac-tags"
import {
  id3v1At,
  readId3,
  rewrittenId3,
  rewrittenId3v1,
  startsId3,
} from "./id3"
import { retagMp4 } from "./mp4-tags"
import { retagOgg } from "./ogg-tags"
import { isTagChanged, type TagChange } from "./tags"
import { retagWav } from "./wav-tags"

/** An MP3 or ADTS file: its ID3v2 tag at the start, and its ID3v1 tag at the end when it has one. */
export function retagId3File(
  bytes: Uint8Array,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  const tag = readId3(bytes)
  if (tag === "unsure") return null
  if (keep && !isTagChanged(change)) return bytes
  const start = tag ? tag.size : 0
  // A second tag straight after the first is not one this can be sure of.
  if (startsId3(bytes, start)) return null
  const v1 = id3v1At(bytes)
  const end = v1 >= start ? v1 : bytes.length
  if (!keep) return bytes.slice(start, end)
  const head = rewrittenId3(tag, change)
  const tail = v1 >= start ? rewrittenId3v1(bytes.subarray(v1), change) : null
  const out = new Uint8Array(head.length + (end - start) + (tail?.length ?? 0))
  out.set(head)
  out.set(bytes.subarray(start, end), head.length)
  if (tail) out.set(tail, head.length + end - start)
  return out
}

/** Whether a file written in a format is the same kind of file, so its tags can be changed in place. */
export const keepsKind = (container: Container, format: WrittenFormat) =>
  (container === "mp3" && format === "mp3") ||
  (container === "flac" && format === "flac") ||
  (container === "wav" && format === "wav") ||
  (container === "ogg" && (format === "ogg" || format === "opus")) ||
  (container === "mp4" && format === "m4a")

/** The file with its tags changed (or taken away when `keep` is off); null when it cannot be done here. */
export function retag(
  bytes: Uint8Array,
  container: Container,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  switch (container) {
    case "mp3":
    case "adts":
      return retagId3File(bytes, change, keep)
    case "flac":
      return retagFlac(bytes, change, keep)
    case "ogg":
      return retagOgg(bytes, change, keep)
    case "mp4":
      return retagMp4(bytes, change, keep)
    case "wav":
      return retagWav(bytes, change, keep)
    default:
      return null
  }
}
