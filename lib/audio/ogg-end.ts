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

/** The file with the pre-skip its first page declares set, and that page's checksum written again. */
function withPreSkip(bytes: Uint8Array, head: number, preSkip: number) {
  const size = pageSize(bytes, 0)
  const out = bytes.slice()
  const write = new DataView(out.buffer)
  write.setUint16(head + 10, preSkip, true)
  write.setUint32(22, 0, true)
  write.setUint32(22, oggCrc(out.subarray(0, size)), true)
  return out
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

/** The pre-skip an Ogg Opus file declares; null when it is not one. */
export function opusPreSkip(bytes: Uint8Array): number | null {
  const head = find(bytes.subarray(0, 4096), "OpusHead")
  if (head < 0 || !isPage(bytes, 0)) return null
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(head + 10, true)
}

/**
 * An Ogg Opus file that ends after `samples` samples at 48 kHz, and skips
 * no more at the start than its encoder can have put there. An encoder
 * that puts samples before the sound writes that many more than it was
 * given; one that wrote no more than it was given put none, whatever the
 * file says (WebKit on Linux declares 312 and puts none, so players cut
 * the start of the sound). Returned as it was when it is not Ogg Opus or
 * there is nothing to change.
 */
export function withOpusEnd(bytes: Uint8Array, samples: number): Uint8Array {
  const head = find(bytes.subarray(0, 4096), "OpusHead")
  // The header must lie whole in the first page, whose checksum is written again.
  if (head < 0 || !isPage(bytes, 0) || head + 12 > pageSize(bytes, 0))
    return bytes
  // The last page: walk the pages from the first, which is whole, as their lengths say.
  let last = 0
  for (
    let at = pageSize(bytes, 0);
    at + 27 <= bytes.length && isPage(bytes, at);
  ) {
    const size = pageSize(bytes, at)
    if (!size) break
    last = at
    at += size
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const written = Number(view.getBigInt64(last + 6, true))
  const declared = view.getUint16(head + 10, true)
  // Fewer samples than the sound means some were lost at the end, which
  // says nothing of the start: the file's own word stands then.
  const preSkip =
    written >= samples ? Math.min(declared, written - samples) : declared
  // Skipping less ends the sound exactly where the file does.
  if (preSkip !== declared) return withPreSkip(bytes, head, preSkip)
  const end = preSkip + samples
  if (written <= end) return bytes
  const out = bytes.slice()
  const write = new DataView(out.buffer)
  const size = pageSize(out, last)
  write.setBigInt64(last + 6, BigInt(end), true)
  write.setUint32(last + 22, 0, true)
  write.setUint32(last + 22, oggCrc(out.subarray(last, last + size)), true)
  return out
}
