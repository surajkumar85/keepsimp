/**
 * A PNG taken apart so its picture data can go into a PDF as it is. A PDF
 * stores lossless pictures the way a PNG does (rows with a filter byte,
 * deflated), so the data of a well-packed PNG needs no second packing.
 */

export type PngColour = "grey" | "rgb" | "palette"

export interface PngParts {
  width: number
  height: number
  /** Bits per sample: 1, 2, 4 or 8. */
  bits: number
  colour: PngColour
  /** Three bytes per colour, for a palette picture. */
  palette: Uint8Array | null
  /** The deflated rows, joined from every data chunk. */
  data: Uint8Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const COLOURS: Record<number, PngColour> = { 0: "grey", 2: "rgb", 3: "palette" }

const word = (bytes: Uint8Array, at: number) =>
  ((bytes[at] << 24) |
    (bytes[at + 1] << 16) |
    (bytes[at + 2] << 8) |
    bytes[at + 3]) >>>
  0

/**
 * Take a PNG apart. Null for one a PDF cannot hold as it is: see-through,
 * interlaced, 16 bits deep, or not a PNG at all.
 */
export function readPng(bytes: Uint8Array): PngParts | null {
  if (bytes.length < 8 || SIGNATURE.some((byte, at) => bytes[at] !== byte))
    return null
  let head: Omit<PngParts, "palette" | "data"> | null = null
  let palette: Uint8Array | null = null
  const chunks: Uint8Array[] = []
  let at = 8
  while (at + 12 <= bytes.length) {
    const length = word(bytes, at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    const start = at + 8
    if (start + length + 4 > bytes.length) return null
    if (type === "IHDR") {
      if (length < 13) return null
      const colour = COLOURS[bytes[start + 9]]
      const bits = bytes[start + 8]
      // Colour types 4 and 6 carry transparency; byte 12 marks interlacing.
      if (!colour || bits > 8 || bytes[start + 12] !== 0) return null
      head = {
        width: word(bytes, start),
        height: word(bytes, start + 4),
        bits,
        colour,
      }
    } else if (type === "PLTE") palette = bytes.slice(start, start + length)
    else if (type === "tRNS") return null
    else if (type === "IDAT") chunks.push(bytes.subarray(start, start + length))
    else if (type === "IEND") break
    at = start + length + 4
  }
  if (!head || !chunks.length) return null
  if (head.colour === "palette" && !palette) return null
  const data = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0)
  )
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }
  return {
    ...head,
    palette: head.colour === "palette" ? palette : null,
    data,
  }
}

/** Samples per pixel in the stored rows. */
export const samplesOf = (colour: PngColour) => (colour === "rgb" ? 3 : 1)

/**
 * A grey palette as one byte per colour, for a picture whose colours are
 * shades of grey. Null when any colour is not grey.
 */
export function greyPalette(palette: Uint8Array) {
  const greys = new Uint8Array(palette.length / 3)
  for (let index = 0; index < greys.length; index++) {
    const at = index * 3
    if (palette[at] !== palette[at + 1] || palette[at] !== palette[at + 2])
      return null
    greys[index] = palette[at]
  }
  return greys
}

/**
 * Rows ready to deflate with the PNG "up" filter: each row is stored as its
 * difference from the row above, behind a byte naming the filter. Flat areas
 * and upright edges become runs of zeros.
 */
export function filterUp(bytes: Uint8Array, rowBytes: number) {
  const rows = bytes.length / rowBytes
  const out = new Uint8Array(bytes.length + rows)
  for (let row = 0; row < rows; row++) {
    const from = row * rowBytes
    const to = row * (rowBytes + 1)
    out[to] = 2
    for (let index = 0; index < rowBytes; index++)
      out[to + 1 + index] =
        bytes[from + index] - (row ? bytes[from - rowBytes + index] : 0)
  }
  return out
}
