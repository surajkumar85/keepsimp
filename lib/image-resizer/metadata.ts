import type { OutputFormat } from "@/lib/image-compressor/formats"
import { crc32 } from "./zip"

const ascii = (text: string) =>
  Uint8Array.from(text, (char) => char.charCodeAt(0))
const PHYS = ascii("pHYs")
const IDAT = ascii("IDAT")
const sameType = (bytes: Uint8Array, offset: number, type: Uint8Array) =>
  type.every((value, index) => bytes[offset + index] === value)

/** Write the print density into a PNG's pHYs chunk (pixels per metre). */
export function setPngDensity(bytes: Uint8Array, dpi: number) {
  const perMetre = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set(PHYS, 4)
  view.setUint32(8, perMetre)
  view.setUint32(12, perMetre)
  chunk[16] = 1
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  // Walk the chunks: drop any existing pHYs and insert ours before the first IDAT.
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  let inserted = false
  while (offset + 12 <= bytes.length) {
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4
    ).getUint32(0)
    const end = offset + 12 + length
    if (sameType(bytes, offset + 4, IDAT) && !inserted) {
      parts.push(chunk)
      inserted = true
    }
    if (!sameType(bytes, offset + 4, PHYS))
      parts.push(bytes.subarray(offset, end))
    offset = end
  }
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0)
  )
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.length
  }
  return out
}

/** Write the print density into a JPEG's JFIF header, adding one if it is missing. */
export function setJpegDensity(bytes: Uint8Array, dpi: number) {
  const density = Math.min(65535, Math.round(dpi))
  const hasJfif =
    bytes[2] === 0xff && bytes[3] === 0xe0 && sameType(bytes, 6, ascii("JFIF"))
  if (hasJfif) {
    const out = new Uint8Array(bytes)
    out[13] = 1
    new DataView(out.buffer).setUint16(14, density)
    new DataView(out.buffer).setUint16(16, density)
    return out
  }
  const header = new Uint8Array(18)
  const view = new DataView(header.buffer)
  header.set([0xff, 0xe0], 0)
  view.setUint16(2, 16)
  header.set(ascii("JFIF"), 4)
  header.set([0, 1, 2, 1], 8)
  view.setUint16(12, density)
  view.setUint16(14, density)
  const out = new Uint8Array(bytes.length + header.length)
  out.set(bytes.subarray(0, 2), 0)
  out.set(header, 2)
  out.set(bytes.subarray(2), 20)
  return out
}

/** Formats whose files can carry a print density. */
export const carriesDensity = (format: OutputFormat) =>
  format === "jpeg" || format === "png"

export function applyDensity(
  format: OutputFormat,
  bytes: Uint8Array,
  dpi: number
) {
  if (format === "png") return setPngDensity(bytes, dpi)
  if (format === "jpeg") return setJpegDensity(bytes, dpi)
  return bytes
}
