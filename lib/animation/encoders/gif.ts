import { lzw } from "@/lib/image-converter/encoders/gif"
import { ByteWriter } from "../bytes"
import type { Colour, Rect } from "../types"

/** One image block of an animated GIF. */
export interface GifImage extends Rect {
  /** One palette index per pixel. */
  indices: Uint8Array
  /** Hundredths of a second on screen. */
  delay: number
  /** "background" clears the patch before the next image. */
  dispose: "none" | "background"
  /** The palette index that shows what is already on screen, if any. */
  transparent: number | null
}

export interface GifAnimation {
  width: number
  height: number
  /** Up to 256 colours shared by every image. */
  palette: Colour[]
  /** Times to play; 0 means forever. */
  plays: number
  images: GifImage[]
}

/** Bits needed to index a palette; GIF tables hold a power of two. */
export const paletteBits = (colours: number) =>
  Math.max(1, Math.ceil(Math.log2(Math.max(2, colours))))

/** Write an animated GIF89a from images that share one palette. */
export function writeGif(animation: GifAnimation) {
  const { width, height, palette, plays, images } = animation
  const bits = paletteBits(palette.length)
  const out = new ByteWriter()
  out
    .ascii("GIF89a")
    .u16le(width)
    .u16le(height)
    .u8(0x80 | ((bits - 1) << 4) | (bits - 1))
    .u8(0)
    .u8(0)
  const table = new Uint8Array((1 << bits) * 3)
  palette.forEach((colour, index) => table.set(colour.slice(0, 3), index * 3))
  out.bytes(table)
  // No loop block means "play once"; the stored number counts repeats.
  if (plays !== 1)
    out
      .bytes([0x21, 0xff, 11])
      .ascii("NETSCAPE2.0")
      .bytes([3, 1])
      .u16le(plays === 0 ? 0 : plays - 1)
      .u8(0)
  const minCodeSize = Math.max(2, bits)
  for (const image of images) {
    out
      .bytes([0x21, 0xf9, 4])
      .u8(
        ((image.dispose === "background" ? 2 : 1) << 2) |
          (image.transparent === null ? 0 : 1)
      )
      .u16le(image.delay)
      .u8(image.transparent ?? 0)
      .u8(0)
    out
      .u8(0x2c)
      .u16le(image.x)
      .u16le(image.y)
      .u16le(image.width)
      .u16le(image.height)
      .u8(0)
      .u8(minCodeSize)
      .bytes(lzw(image.indices, minCodeSize))
  }
  return out.u8(0x3b).finish()
}

/**
 * Set how often a finished GIF plays and how long each frame shows, leaving
 * its pictures untouched. Used on files written by another encoder.
 * @param delays Hundredths of a second, one per frame; null keeps the file's own.
 */
export function retimeGif(
  bytes: Uint8Array,
  plays: number,
  delays: number[] | null
) {
  const out = new ByteWriter()
  let offset = 13
  if (bytes[10] & 0x80) offset += 3 * 2 ** ((bytes[10] & 0x07) + 1)
  out.bytes(bytes.subarray(0, offset))
  if (plays !== 1)
    out
      .bytes([0x21, 0xff, 11])
      .ascii("NETSCAPE2.0")
      .bytes([3, 1])
      .u16le(plays === 0 ? 0 : plays - 1)
      .u8(0)
  const blocks = (start: number) => {
    let end = start
    while (end < bytes.length && bytes[end] !== 0) end += bytes[end] + 1
    return end + 1
  }
  let frame = 0
  let timed = false
  while (offset < bytes.length) {
    const block = bytes[offset]
    if (block === 0x21) {
      const end = blocks(offset + 2)
      const label = bytes[offset + 1]
      if (label === 0xf9) {
        const control = bytes.slice(offset, end)
        if (delays) {
          const delay = delays[frame] ?? 0
          control[4] = delay & 0xff
          control[5] = delay >> 8
        }
        out.bytes(control)
        timed = true
      } else if (label !== 0xff) out.bytes(bytes.subarray(offset, end))
      // Application blocks are dropped: the loop block was written above.
      offset = end
    } else if (block === 0x2c) {
      // A frame without a control block gets one, so it can carry its delay.
      if (!timed && delays)
        out
          .bytes([0x21, 0xf9, 4, 4])
          .u16le(delays[frame] ?? 0)
          .bytes([0, 0])
      let data = offset + 10
      if (bytes[offset + 9] & 0x80)
        data += 3 * 2 ** ((bytes[offset + 9] & 0x07) + 1)
      const end = blocks(data + 1)
      out.bytes(bytes.subarray(offset, end))
      offset = end
      frame++
      timed = false
    } else break
  }
  return out.u8(0x3b).finish()
}
