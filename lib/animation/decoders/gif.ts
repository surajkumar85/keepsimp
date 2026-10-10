import { ascii, u16le } from "../bytes"
import type { Patch } from "../types"

export interface GifFrame extends Patch {
  interlaced: boolean
  /** Red, green, blue for each colour. */
  palette: Uint8Array
  transparent: number | null
  /** Where the frame's compressed pixels start, at the minimum code size. */
  data: number
}

export interface GifFile {
  width: number
  height: number
  /** Times the animation plays; 0 means forever. */
  plays: number
  frames: GifFrame[]
}

/** Browsers show frames faster than 20 ms at 100 ms instead. */
export const gifDuration = (hundredths: number) =>
  hundredths < 2 ? 100 : hundredths * 10

function skipSubBlocks(bytes: Uint8Array, offset: number) {
  while (offset < bytes.length && bytes[offset] !== 0)
    offset += bytes[offset] + 1
  return offset + 1
}

/** Read a GIF's structure without decompressing any pixels. */
export function readGif(bytes: Uint8Array): GifFile {
  const signature = ascii(bytes, 0, 6)
  if (signature !== "GIF89a" && signature !== "GIF87a")
    throw new Error("This is not a GIF file.")
  const width = u16le(bytes, 6)
  const height = u16le(bytes, 8)
  let offset = 13
  let global: Uint8Array = new Uint8Array(0)
  if (bytes[10] & 0x80) {
    const size = 3 * 2 ** ((bytes[10] & 0x07) + 1)
    global = bytes.subarray(offset, offset + size)
    offset += size
  }
  const frames: GifFrame[] = []
  // A file without a loop block plays once.
  let plays = 1
  let control = { delay: 0, dispose: 0, transparent: null as number | null }
  while (offset < bytes.length) {
    const block = bytes[offset]
    if (block === 0x21) {
      const label = bytes[offset + 1]
      if (label === 0xf9) {
        const packed = bytes[offset + 3]
        control = {
          delay: u16le(bytes, offset + 4),
          dispose: (packed >> 2) & 0x07,
          transparent: packed & 0x01 ? bytes[offset + 6] : null,
        }
      } else if (
        label === 0xff &&
        ascii(bytes, offset + 3, 11) === "NETSCAPE2.0" &&
        bytes[offset + 15] === 1
      ) {
        const repeats = u16le(bytes, offset + 16)
        plays = repeats === 0 ? 0 : repeats + 1
      }
      offset = skipSubBlocks(bytes, offset + 2)
    } else if (block === 0x2c) {
      const packed = bytes[offset + 9]
      let palette = global
      let data = offset + 10
      if (packed & 0x80) {
        const size = 3 * 2 ** ((packed & 0x07) + 1)
        palette = bytes.subarray(data, data + size)
        data += size
      }
      frames.push({
        x: u16le(bytes, offset + 1),
        y: u16le(bytes, offset + 3),
        width: u16le(bytes, offset + 5),
        height: u16le(bytes, offset + 7),
        duration: gifDuration(control.delay),
        dispose:
          control.dispose === 2
            ? "background"
            : control.dispose === 3
              ? "previous"
              : "none",
        blend: "over",
        interlaced: (packed & 0x40) !== 0,
        palette,
        transparent: control.transparent,
        data,
      })
      control = { delay: 0, dispose: 0, transparent: null }
      offset = skipSubBlocks(bytes, data + 1)
    } else break
  }
  if (!width || !height || !frames.length)
    throw new Error("This GIF has no frames.")
  return { width, height, plays, frames }
}

/**
 * Undo GIF's LZW compression. Damaged or short data leaves the remaining
 * pixels at colour 0 instead of failing.
 * @param offset Position of the minimum code size byte.
 */
export function unlzw(bytes: Uint8Array, offset: number, count: number) {
  const output = new Uint8Array(count)
  const minimum = bytes[offset++]
  const clear = 1 << minimum
  const end = clear + 1
  const prefix = new Int16Array(4096)
  const suffix = new Uint8Array(4096)
  const stack = new Uint8Array(4097)
  let codeSize = minimum + 1
  let next = end + 1
  let previous = -1
  let first = 0
  let buffer = 0
  let bits = 0
  let left = 0
  let written = 0
  while (written < count) {
    while (bits < codeSize) {
      if (left === 0) {
        left = bytes[offset++] ?? 0
        if (left === 0) return output
      }
      buffer |= (bytes[offset++] ?? 0) << bits
      bits += 8
      left--
    }
    const code = buffer & ((1 << codeSize) - 1)
    buffer >>>= codeSize
    bits -= codeSize
    if (code === clear) {
      codeSize = minimum + 1
      next = end + 1
      previous = -1
      continue
    }
    if (code === end) break
    if (previous === -1) {
      output[written++] = code
      previous = code
      first = code
      continue
    }
    let current = code
    let depth = 0
    // A code one past the table means "the previous string plus its own first colour".
    if (code >= next) {
      stack[depth++] = first
      current = previous
    }
    while (current >= clear) {
      stack[depth++] = suffix[current]
      current = prefix[current]
    }
    first = current
    stack[depth++] = current
    while (depth > 0 && written < count) output[written++] = stack[--depth]
    if (next < 4096) {
      prefix[next] = previous
      suffix[next] = first
      next++
      if (next === 1 << codeSize && codeSize < 12) codeSize++
    }
    previous = code
  }
  return output
}

/** Rows of an interlaced image arrive in four passes. */
function deinterlace(indices: Uint8Array, width: number, height: number) {
  const output = new Uint8Array(indices.length)
  let row = 0
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ])
    for (let y = start; y < height; y += step, row++)
      output.set(indices.subarray(row * width, (row + 1) * width), y * width)
  return output
}

/** One frame's patch as RGBA; the transparent colour becomes clear pixels. */
export function decodeGifFrame(bytes: Uint8Array, frame: GifFrame) {
  const count = frame.width * frame.height
  let indices = unlzw(bytes, frame.data, count)
  if (frame.interlaced)
    indices = deinterlace(indices, frame.width, frame.height)
  const pixels = new Uint8ClampedArray(count * 4)
  for (let index = 0; index < count; index++) {
    const colour = indices[index]
    if (colour === frame.transparent) continue
    pixels[index * 4] = frame.palette[colour * 3] ?? 0
    pixels[index * 4 + 1] = frame.palette[colour * 3 + 1] ?? 0
    pixels[index * 4 + 2] = frame.palette[colour * 3 + 2] ?? 0
    pixels[index * 4 + 3] = 255
  }
  return pixels
}
