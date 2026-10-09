export type InputFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "heic"
  | "gif"
  | "bmp"
  | "tiff"
  | "ico"
  | "svg"
  | "jxl"

export type OutputFormat = "jpeg" | "png" | "webp" | "avif"

export const MAX_INPUT_BYTES = 50 * 1024 * 1024

export const inputFormats: Record<InputFormat, { label: string }> = {
  jpeg: { label: "JPEG" },
  png: { label: "PNG" },
  webp: { label: "WebP" },
  avif: { label: "AVIF" },
  heic: { label: "HEIC" },
  gif: { label: "GIF" },
  bmp: { label: "BMP" },
  tiff: { label: "TIFF" },
  ico: { label: "ICO" },
  svg: { label: "SVG" },
  jxl: { label: "JPEG XL" },
}

export const outputFormats: Record<
  OutputFormat,
  {
    label: string
    mime: string
    extension: string
    alpha: boolean
    lossless: boolean
  }
> = {
  jpeg: {
    label: "JPEG",
    mime: "image/jpeg",
    extension: "jpg",
    alpha: false,
    lossless: false,
  },
  png: {
    label: "PNG",
    mime: "image/png",
    extension: "png",
    alpha: true,
    lossless: true,
  },
  webp: {
    label: "WebP",
    mime: "image/webp",
    extension: "webp",
    alpha: true,
    lossless: true,
  },
  avif: {
    label: "AVIF",
    mime: "image/avif",
    extension: "avif",
    alpha: true,
    lossless: false,
  },
}

/** Formats the compressor accepts, for the file picker. Sniffing decides the real type. */
export const acceptedInput = [
  "image/*",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".ico",
  ".svg",
  ".jxl",
].join(",")

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((value, index) => bytes[offset + index] === value)

function isoBrands(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return []
  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  const end = Math.min(bytes.length, Math.max(boxSize, 12))
  const brands = [ascii(bytes, 8, 4)]
  for (let offset = 16; offset + 4 <= end; offset += 4)
    brands.push(ascii(bytes, offset, 4))
  return brands
}

function looksLikeSvg(bytes: Uint8Array) {
  const text = new TextDecoder()
    .decode(bytes.subarray(0, 4096))
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trimStart()
  return /^<svg[\s>]/i.test(text)
}

/** Identify an image from its leading bytes. File names and MIME types are often missing or wrong. */
export function sniffFormat(bytes: Uint8Array): InputFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg"
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "png"
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  )
    return "webp"
  const brands = isoBrands(bytes)
  if (brands.some((brand) => brand === "avif" || brand === "avis"))
    return "avif"
  if (
    brands.some((brand) =>
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(
        brand
      )
    )
  )
    return "heic"
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return "gif"
  if (startsWith(bytes, [0x42, 0x4d]) && bytes.length >= 26) return "bmp"
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return "tiff"
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes.length >= 22)
    return "ico"
  if (
    startsWith(bytes, [0xff, 0x0a]) ||
    startsWith(
      bytes,
      [0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]
    )
  )
    return "jxl"
  if (looksLikeSvg(bytes)) return "svg"
  return null
}

function skipSubBlocks(bytes: Uint8Array, offset: number) {
  while (offset < bytes.length && bytes[offset] !== 0)
    offset += bytes[offset] + 1
  return offset + 1
}

function gifFrames(bytes: Uint8Array) {
  let offset = 13
  if (bytes.length < offset) return 0
  if (bytes[10] & 0x80) offset += 3 * 2 ** ((bytes[10] & 0x07) + 1)
  let frames = 0
  while (offset < bytes.length) {
    const block = bytes[offset]
    if (block === 0x3b) break
    if (block === 0x21) offset = skipSubBlocks(bytes, offset + 2)
    else if (block === 0x2c) {
      frames++
      if (frames > 1) break
      const packed = bytes[offset + 9]
      offset += 10
      if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1)
      offset = skipSubBlocks(bytes, offset + 1)
    } else break
  }
  return frames
}

function pngHasAnimation(bytes: Uint8Array) {
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    const type = ascii(bytes, offset + 4, 4)
    if (type === "acTL") return true
    if (type === "IDAT" || type === "IEND") return false
    offset += 12 + length
  }
  return false
}

/** True for animated GIF, APNG and animated WebP; only their first frame is compressed. */
export function isAnimated(bytes: Uint8Array, format: InputFormat) {
  if (format === "gif") return gifFrames(bytes) > 1
  if (format === "png") return pngHasAnimation(bytes)
  if (format === "webp")
    return (
      bytes.length >= 21 &&
      ascii(bytes, 12, 4) === "VP8X" &&
      (bytes[20] & 0x02) !== 0
    )
  return false
}

/** The output format matching the input, when the input can be written directly. */
export function sameFormatOutput(format: InputFormat): OutputFormat | null {
  return format === "jpeg" ||
    format === "png" ||
    format === "webp" ||
    format === "avif"
    ? format
    : null
}

export function outputFilename(name: string, format: OutputFormat) {
  const base =
    name
      .replace(/\.[^.]*$/, "")
      .replace(/[^\p{L}\p{N}._-]/gu, "-")
      .slice(0, 100) || "image"
  return `${base}-keepsimp.${outputFormats[format].extension}`
}

export function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
