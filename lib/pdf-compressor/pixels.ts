/**
 * Pixels on their way between the PDF engine, which stores a picture's
 * channels as they are (grey, RGB or CMYK), and the picture codecs, which
 * take RGBA.
 */
import type { Pixels } from "@/lib/image-compressor/ssim"

/** Rows as the engine holds them, which may be padded, copied out with nothing between them. */
export function tight(
  data: ArrayLike<number>,
  width: number,
  height: number,
  stride: number,
  channels: number
) {
  const row = width * channels
  const out = new Uint8Array(row * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < row; x++) out[y * row + x] = data[y * stride + x]
  return out
}

/** Grey (1 channel) or RGB (3 channels) bytes as RGBA, fully opaque. */
export function toRgba(
  bytes: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index++) {
    const from = index * channels
    const to = index * 4
    data[to] = bytes[from]
    data[to + 1] = bytes[from + (channels === 3 ? 1 : 0)]
    data[to + 2] = bytes[from + (channels === 3 ? 2 : 0)]
    data[to + 3] = 255
  }
  return { data, width, height }
}

/** RGBA back to grey (its red channel) or RGB bytes. */
export function fromRgba(pixels: Pixels, channels: 1 | 3) {
  const count = pixels.width * pixels.height
  const out = new Uint8Array(count * channels)
  for (let index = 0; index < count; index++)
    for (let channel = 0; channel < channels; channel++)
      out[index * channels + channel] = pixels.data[index * 4 + channel]
  return out
}

/**
 * CMYK bytes as two RGBA pictures the codecs can resize: cyan, magenta and
 * yellow in one, black in the other.
 */
export function splitCmyk(bytes: Uint8Array, width: number, height: number) {
  const count = width * height
  const colour = new Uint8ClampedArray(count * 4)
  const black = new Uint8ClampedArray(count * 4)
  for (let index = 0; index < count; index++) {
    const at = index * 4
    colour[at] = bytes[at]
    colour[at + 1] = bytes[at + 1]
    colour[at + 2] = bytes[at + 2]
    colour[at + 3] = 255
    black[at] = black[at + 1] = black[at + 2] = bytes[at + 3]
    black[at + 3] = 255
  }
  return {
    colour: { data: colour, width, height } satisfies Pixels,
    black: { data: black, width, height } satisfies Pixels,
  }
}

/** The two halves of `splitCmyk`, put back together. */
export function joinCmyk(colour: Pixels, black: Pixels) {
  const count = colour.width * colour.height
  const out = new Uint8Array(count * 4)
  for (let index = 0; index < count; index++) {
    const at = index * 4
    out[at] = colour.data[at]
    out[at + 1] = colour.data[at + 1]
    out[at + 2] = colour.data[at + 2]
    out[at + 3] = black.data[at]
  }
  return out
}

export function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++)
    if (a[index] !== b[index]) return false
  return true
}

/** True when RGB bytes hold only greys, and those greys are exactly `grey`. */
export function greyMatches(rgb: Uint8Array, grey: Uint8Array) {
  if (rgb.length !== grey.length * 3) return false
  for (let index = 0; index < grey.length; index++) {
    const at = index * 3
    if (
      rgb[at] !== grey[index] ||
      rgb[at + 1] !== grey[index] ||
      rgb[at + 2] !== grey[index]
    )
      return false
  }
  return true
}

/** The side of the square tiles a sample is made of. */
export const TILE = 256

/**
 * A smaller stand-in for a large picture: square tiles taken evenly from
 * across it and laid side by side. Finding the right quality on the sample
 * takes a fraction of the time and lands within a step or two of the whole
 * picture's answer. A picture within `budget` pixels is its own sample.
 * Works for any picture with four bytes per pixel.
 */
export function samplePixels(pixels: Pixels, budget: number): Pixels {
  const { width, height } = pixels
  if (width * height <= budget || width < TILE || height < TILE) return pixels
  const tiles = Math.max(1, Math.floor(budget / (TILE * TILE)))
  // As many columns as rows, or one more, and never more than fit.
  const columns = Math.min(
    Math.floor(width / TILE),
    Math.ceil(Math.sqrt(tiles))
  )
  const rows = Math.min(
    Math.floor(height / TILE),
    Math.max(1, Math.floor(tiles / columns))
  )
  const data = new Uint8ClampedArray(columns * TILE * rows * TILE * 4)
  for (let row = 0; row < rows; row++) {
    // Tiles sit in the middle of equal bands, so the edges are not favoured.
    const top = Math.floor(((row + 0.5) * height) / rows - TILE / 2)
    for (let column = 0; column < columns; column++) {
      const left = Math.floor(((column + 0.5) * width) / columns - TILE / 2)
      for (let y = 0; y < TILE; y++) {
        const from = ((top + y) * width + left) * 4
        const to = ((row * TILE + y) * columns * TILE + column * TILE) * 4
        data.set(pixels.data.subarray(from, from + TILE * 4), to)
      }
    }
  }
  return { data, width: columns * TILE, height: rows * TILE }
}
