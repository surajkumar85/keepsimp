import { crc32 } from "@/lib/image-resizer/zip"
import { ByteWriter, ascii, u16be, u32be } from "../bytes"
import type { Patch } from "../types"

export interface ApngFrame extends Patch {
  /** A complete PNG file holding just this frame's patch. */
  png: Uint8Array
}

export interface ApngFile {
  width: number
  height: number
  /** Times the animation plays; 0 means forever. */
  plays: number
  frames: ApngFrame[]
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Append one PNG chunk, with its length and checksum. */
export function pngChunk(out: ByteWriter, type: string, data: Uint8Array) {
  const name = Uint8Array.from(type, (letter) => letter.charCodeAt(0))
  out
    .u32be(data.length)
    .bytes(name)
    .bytes(data)
    .u32be(crc32(data, crc32(name)))
}

export function pngSignature(out: ByteWriter) {
  return out.bytes(SIGNATURE)
}

/**
 * Split an animated PNG into frames. Each frame comes back as a small PNG of
 * its own, so any PNG decoder can read it.
 */
export function readApng(bytes: Uint8Array): ApngFile {
  if (SIGNATURE.some((value, index) => bytes[index] !== value))
    throw new Error("This is not a PNG file.")
  let header: Uint8Array | null = null
  let plays = 0
  let animated = false
  // Chunks such as the palette apply to every frame.
  const shared: { type: string; data: Uint8Array }[] = []
  const frames: ApngFrame[] = []
  let control: Patch | null = null
  let data: Uint8Array[] = []
  const finish = () => {
    if (control && data.length && header) {
      const out = pngSignature(new ByteWriter())
      const own = header.slice()
      new DataView(own.buffer).setUint32(0, control.width)
      new DataView(own.buffer).setUint32(4, control.height)
      pngChunk(out, "IHDR", own)
      for (const chunk of shared) pngChunk(out, chunk.type, chunk.data)
      for (const part of data) pngChunk(out, "IDAT", part)
      pngChunk(out, "IEND", new Uint8Array(0))
      frames.push({ ...control, png: out.finish() })
    }
    data = []
  }
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") header = body
    else if (type === "acTL") {
      animated = true
      plays = u32be(body, 4)
    } else if (type === "fcTL") {
      finish()
      const denominator = u16be(body, 22) || 100
      control = {
        width: u32be(body, 4),
        height: u32be(body, 8),
        x: u32be(body, 12),
        y: u32be(body, 16),
        // A delay of zero means "as fast as possible"; browsers use about 10 ms.
        duration: Math.max(10, (u16be(body, 20) * 1000) / denominator),
        dispose:
          body[24] === 1 ? "background" : body[24] === 2 ? "previous" : "none",
        blend: body[25] === 1 ? "over" : "source",
      }
    } else if (type === "IDAT") {
      // Image data before any frame control is a fallback picture, not a frame.
      if (control) data.push(body)
    } else if (type === "fdAT") {
      if (control) data.push(body.subarray(4))
    } else if (type === "IEND") break
    else if (!frames.length && !control) shared.push({ type, data: body })
    offset += 12 + length
  }
  finish()
  if (!header || !animated || !frames.length)
    throw new Error("This PNG is not animated.")
  return {
    width: u32be(header, 0),
    height: u32be(header, 4),
    plays,
    frames,
  }
}
