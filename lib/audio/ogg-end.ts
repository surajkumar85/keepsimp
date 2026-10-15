/**
 * Gapless Opus in Ogg. An Opus file says where its sound ends in the
 * granule position of its last page: the pre-skip plus the samples of the
 * sound, at 48 kHz. The encoder pads the end to a whole packet, and the
 * file Mediabunny writes counts that padding, so players play it as
 * silence. This sets the last page's granule position to the sound's end
 * and writes the page's checksum again.
 */

/** Ogg's CRC-32: polynomial 0x04c11db7, not reflected, starting at 0. */
const TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let crc = index << 24
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1
    table[index] = crc >>> 0
  }
  return table
})()

export function oggCrc(bytes: Uint8Array) {
  let crc = 0
  for (const byte of bytes)
    crc = ((crc << 8) ^ TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0
  return crc
}

const isPage = (bytes: Uint8Array, at: number) =>
  bytes[at] === 0x4f &&
  bytes[at + 1] === 0x67 &&
  bytes[at + 2] === 0x67 &&
  bytes[at + 3] === 0x53

/** How long the page at `at` is, header and all; 0 when it runs past the end. */
function pageSize(bytes: Uint8Array, at: number) {
  const segments = bytes[at + 26]
  let size = 27 + segments
  for (let index = 0; index < segments; index++) size += bytes[at + 27 + index]
  return at + size > bytes.length ? 0 : size
}

/** Where a run of ASCII letters first is, or -1. */
function find(bytes: Uint8Array, text: string) {
  const codes = Array.from(text, (letter) => letter.charCodeAt(0))
  outer: for (let at = 0; at + codes.length <= bytes.length; at++) {
    for (let index = 0; index < codes.length; index++)
      if (bytes[at + index] !== codes[index]) continue outer
    return at
  }
  return -1
}

/**
 * An Ogg Opus file whose last page ends the sound after `samples` samples
 * at 48 kHz. Returned as it was when it is not one, or when its end is
 * already at or before that.
 */
export function withOpusEnd(bytes: Uint8Array, samples: number): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const head = find(bytes.subarray(0, 4096), "OpusHead")
  if (head < 0 || !isPage(bytes, 0)) return bytes
  const preSkip = view.getUint16(head + 10, true)
  // The last page: walk the pages from the start, as their lengths say.
  let last = -1
  for (let at = 0; at + 27 <= bytes.length && isPage(bytes, at);) {
    const size = pageSize(bytes, at)
    if (!size) break
    last = at
    at += size
  }
  if (last < 0) return bytes
  const end = BigInt(preSkip + samples)
  if (view.getBigInt64(last + 6, true) <= end) return bytes
  const size = pageSize(bytes, last)
  const out = bytes.slice()
  const write = new DataView(out.buffer)
  write.setBigInt64(last + 6, end, true)
  write.setUint32(last + 22, 0, true)
  write.setUint32(last + 22, oggCrc(out.subarray(last, last + size)), true)
  return out
}
