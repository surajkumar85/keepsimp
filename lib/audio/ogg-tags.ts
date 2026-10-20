/**
 * An Ogg Opus or Ogg Vorbis file's tags changed in place. The comment
 * header (OpusTags, or Vorbis' comment packet, which shares its pages with
 * the setup packet) is written anew into fresh header pages; the first
 * page and every page of sound are kept, their sequence numbers moved (and
 * checksums written again) only when the header takes more or fewer pages.
 * A file with more than one stream (multiplexed or chained) is not changed.
 */

import { oggCrc } from "./ogg-end"
import { isTagChanged, type TagChange } from "./tags"
import { changedLines, readComments, writeComments } from "./vorbis-comments"

interface Page {
  start: number
  end: number
  serial: number
  segments: Uint8Array
  data: number
}

const encoder = new TextEncoder()

function pageAt(bytes: Uint8Array, at: number): Page | null {
  if (
    at + 27 > bytes.length ||
    bytes[at] !== 0x4f ||
    bytes[at + 1] !== 0x67 ||
    bytes[at + 2] !== 0x67 ||
    bytes[at + 3] !== 0x53 ||
    bytes[at + 4] !== 0
  )
    return null
  const count = bytes[at + 26]
  if (at + 27 + count > bytes.length) return null
  const segments = bytes.subarray(at + 27, at + 27 + count)
  const data = at + 27 + count
  const end = data + segments.reduce((sum, one) => sum + one, 0)
  if (end > bytes.length) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    start: at,
    end,
    serial: view.getUint32(at + 14, true),
    segments,
    data,
  }
}

const startsWith = (bytes: Uint8Array, text: string) =>
  Array.from(text).every(
    (letter, index) => bytes[index] === letter.charCodeAt(0)
  )

/** Packets laid into pages, numbered from `sequence`, with their checksums. */
function pagesOf(
  packets: readonly Uint8Array[],
  serial: number,
  sequence: number
) {
  // Each packet is segments of 255 bytes and a last shorter one (maybe 0).
  const lacing: { size: number; ends: boolean }[] = []
  for (const packet of packets) {
    const full = Math.floor(packet.length / 255)
    for (let index = 0; index < full; index++)
      lacing.push({ size: 255, ends: false })
    lacing.push({ size: packet.length % 255, ends: true })
  }
  const all = new Uint8Array(
    packets.reduce((sum, packet) => sum + packet.length, 0)
  )
  let filled = 0
  for (const packet of packets) {
    all.set(packet, filled)
    filled += packet.length
  }
  const pages: Uint8Array[] = []
  let from = 0
  let continued = false
  for (let first = 0; first < lacing.length; first += 255) {
    const run = lacing.slice(first, first + 255)
    const size = run.reduce((sum, one) => sum + one.size, 0)
    const page = new Uint8Array(27 + run.length + size)
    const view = new DataView(page.buffer)
    page.set([0x4f, 0x67, 0x67, 0x53, 0])
    page[5] = continued ? 1 : 0
    // A page on which no packet ends has no position.
    const ends = run.some((one) => one.ends)
    view.setBigInt64(6, BigInt(ends ? 0 : -1), true)
    view.setUint32(14, serial, true)
    view.setUint32(18, sequence + pages.length, true)
    page[26] = run.length
    run.forEach((one, index) => (page[27 + index] = one.size))
    page.set(all.subarray(from, from + size), 27 + run.length)
    from += size
    view.setUint32(22, oggCrc(page), true)
    pages.push(page)
    continued = !run[run.length - 1].ends
  }
  return pages
}

/** The file after a change, or with no tags when `keep` is off; null when it is not one this can change. */
export function retagOgg(
  bytes: Uint8Array,
  change: TagChange,
  keep: boolean
): Uint8Array | null {
  const first = pageAt(bytes, 0)
  if (!first || !(bytes[5] & 0x02) || first.segments.length !== 1) return null
  const head = bytes.subarray(first.data, first.end)
  const kind = startsWith(head, "OpusHead")
    ? "opus"
    : startsWith(head, "\x01vorbis")
      ? "vorbis"
      : null
  if (!kind) return null
  // Every page, all of one stream.
  const pages: Page[] = [first]
  for (let at = first.end; at < bytes.length;) {
    const page = pageAt(bytes, at)
    if (!page || page.serial !== first.serial) return null
    pages.push(page)
    at = page.end
  }
  // The header packets after the first: the comments, and Vorbis' setup.
  const wanted = kind === "opus" ? 1 : 2
  const packets: Uint8Array[] = []
  let pending: Uint8Array[] = []
  let last = 0
  for (
    let index = 1;
    index < pages.length && packets.length < wanted;
    index++
  ) {
    const page = pages[index]
    let at = page.data
    for (let segment = 0; segment < page.segments.length; segment++) {
      const size = page.segments[segment]
      pending.push(bytes.subarray(at, at + size))
      at += size
      if (size < 255) {
        const packet = new Uint8Array(
          pending.reduce((sum, one) => sum + one.length, 0)
        )
        let to = 0
        for (const one of pending) {
          packet.set(one, to)
          to += one.length
        }
        packets.push(packet)
        pending = []
        // The headers must end where a page does.
        if (packets.length === wanted && segment !== page.segments.length - 1)
          return null
      }
    }
    last = index
  }
  if (packets.length < wanted) return null
  if (keep && !isTagChanged(change)) return bytes

  const prefix =
    kind === "opus" ? encoder.encode("OpusTags") : encoder.encode("\x03vorbis")
  const tags = packets[0]
  if (!startsWith(tags, kind === "opus" ? "OpusTags" : "\x03vorbis"))
    return null
  const read = readComments(tags, prefix.length)
  if (!read) return null
  const written = writeComments({
    vendor: read.comments.vendor,
    lines: keep ? changedLines(read.comments.lines, change, true) : [],
  })
  // What follows the comments (Vorbis' framing bit, Opus' own data) stays.
  const after = tags.subarray(read.end)
  const comment = new Uint8Array(prefix.length + written.length + after.length)
  comment.set(prefix)
  comment.set(written, prefix.length)
  comment.set(after, prefix.length + written.length)

  const header = pagesOf([comment, ...packets.slice(1)], first.serial, 1)
  const shift = header.length - last
  const rest = pages.slice(last + 1).map((page) => {
    if (!shift) return bytes.subarray(page.start, page.end)
    const one = bytes.slice(page.start, page.end)
    {
      const view = new DataView(one.buffer)
      view.setUint32(18, view.getUint32(18, true) + shift, true)
      view.setUint32(22, 0, true)
      view.setUint32(22, oggCrc(one), true)
    }
    return one
  })
  const parts = [bytes.subarray(0, first.end), ...header, ...rest]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let to = 0
  for (const part of parts) {
    out.set(part, to)
    to += part.length
  }
  return out
}
