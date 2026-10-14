/**
 * The bytes of a signed PDF. A signature covers every byte of the file but
 * the room kept for itself: the file is written with a signature
 * dictionary that holds a placeholder for which bytes are covered
 * (`/ByteRange`) and a run of zeros where the signature goes
 * (`/Contents`). Both are filled in afterwards, in place and at the same
 * length, so that nothing else moves.
 */

/** What the engine writes for `/ByteRange` while it is not known: 0 and three names of ten stars. */
export const RANGE_HOLDER = "[0/**********/**********/**********]"
/** The name of ten stars that stands for each number. */
export const STARS = "**********"

/** Where the placeholders of a signature are in a file. */
export interface Holder {
  /** Where the `/ByteRange` placeholder starts. */
  range: number
  /** Where the room for the signature starts (at its "<") and ends (after its ">"). */
  from: number
  to: number
}

const text = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")

/**
 * The placeholders of the last signature written into a file, or null
 * when there are none: the room for the signature is the hex string that
 * `/Contents` gives in the same object, after the placeholder.
 */
export function findHolder(bytes: Uint8Array): Holder | null {
  const all = text(bytes)
  const range = all.lastIndexOf(RANGE_HOLDER)
  if (range < 0) return null
  const end = all.indexOf("endobj", range)
  const contents = all.indexOf("/Contents", range)
  if (contents < 0 || (end >= 0 && contents > end)) return null
  const from = all.indexOf("<", contents)
  const to = all.indexOf(">", from) + 1
  // The room is zeros in hex: the opening "<" follows `/Contents` at once.
  if (from < 0 || to <= from || all.slice(contents + 9, from).trim())
    return null
  if (!/^0+$/.test(all.slice(from + 1, to - 1))) return null
  return { range, from, to }
}

/** The bytes the signature covers: from the start to its room, and from after it to the end. */
export const rangesOf = (holder: Holder, length: number) =>
  [0, holder.from, holder.to, length - holder.to] as const

/** `/ByteRange` as it is written over its placeholder: the same length, padded with spaces. */
export function rangeText(ranges: readonly number[]) {
  const written = `[${ranges.join(" ")}`
  // Ten figures for each: a file of up to 9,999,999,999 bytes.
  if (written.length + 1 > RANGE_HOLDER.length)
    throw new Error("This file is too large to be signed here.")
  return `${written}${" ".repeat(RANGE_HOLDER.length - written.length - 1)}]`
}

/** The file with its `/ByteRange` filled in. */
export function withRanges(bytes: Uint8Array, holder: Holder) {
  const filled = rangeText(rangesOf(holder, bytes.length))
  const out = bytes.slice()
  for (let at = 0; at < filled.length; at++)
    out[holder.range + at] = filled.charCodeAt(at)
  return out
}

/** The bytes a signature covers, put together. */
export function coveredBy(bytes: Uint8Array, ranges: readonly number[]) {
  const [start, first, second, last] = ranges
  const out = new Uint8Array(first + last)
  out.set(bytes.subarray(start, start + first), 0)
  out.set(bytes.subarray(second, second + last), first)
  return out
}

/** The file with a signature put into its room, in hex, the rest of the room left as zeros. */
export function withSignature(
  bytes: Uint8Array,
  holder: Holder,
  signature: Uint8Array
) {
  const room = holder.to - holder.from - 2
  const hex = Array.from(signature, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  if (hex.length > room)
    throw new Error("The signature is larger than the room kept for it.")
  const out = bytes.slice()
  for (let at = 0; at < hex.length; at++)
    out[holder.from + 1 + at] = hex.charCodeAt(at)
  return out
}
