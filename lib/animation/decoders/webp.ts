import { ByteWriter, ascii, u16le, u24le, u32le } from "../bytes"
import type { Patch } from "../types"

export interface WebpChunk {
  type: string
  data: Uint8Array
}

export interface WebpFrame extends Patch {
  /** A complete still WebP file holding just this frame's patch. */
  webp: Uint8Array
}

export interface WebpFile {
  width: number
  height: number
  /** Times the animation plays; 0 means forever. */
  plays: number
  frames: WebpFrame[]
}

/** The chunks of a RIFF block; odd-sized chunks are followed by a padding byte. */
export function riffChunks(bytes: Uint8Array, offset: number, end: number) {
  const chunks: WebpChunk[] = []
  end = Math.min(end, bytes.length)
  while (offset + 8 <= end) {
    const size = u32le(bytes, offset + 4)
    chunks.push({
      type: ascii(bytes, offset, 4),
      data: bytes.subarray(offset + 8, Math.min(end, offset + 8 + size)),
    })
    offset += 8 + size + (size % 2)
  }
  return chunks
}

export function riffChunk(out: ByteWriter, type: string, data: Uint8Array) {
  out.ascii(type).u32le(data.length).bytes(data)
  if (data.length % 2) out.u8(0)
  return out
}

/** Wrap chunks as a WebP file. */
export function webpFile(body: Uint8Array) {
  return new ByteWriter()
    .ascii("RIFF")
    .u32le(body.length + 4)
    .ascii("WEBP")
    .bytes(body)
    .finish()
}

/** A still WebP from one frame's own chunks. */
function stillWebp(chunks: WebpChunk[], width: number, height: number) {
  const body = new ByteWriter()
  const alpha = chunks.find((chunk) => chunk.type === "ALPH")
  const image = chunks.find(
    (chunk) => chunk.type === "VP8 " || chunk.type === "VP8L"
  )
  if (!image) throw new Error("This WebP has a frame without a picture.")
  if (alpha) {
    // A separate alpha chunk is only read from the extended layout.
    riffChunk(
      body,
      "VP8X",
      new ByteWriter()
        .u8(0x10)
        .bytes([0, 0, 0])
        .u24le(width - 1)
        .u24le(height - 1)
        .finish()
    )
    riffChunk(body, "ALPH", alpha.data)
  }
  riffChunk(body, image.type, image.data)
  return webpFile(body.finish())
}

/**
 * Split an animated WebP into frames. Each frame comes back as a still WebP
 * of its own, so any WebP decoder can read it.
 */
export function readWebp(bytes: Uint8Array): WebpFile {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP")
    throw new Error("This is not a WebP file.")
  const chunks = riffChunks(bytes, 12, bytes.length)
  const header = chunks.find((chunk) => chunk.type === "VP8X")
  if (!header || !(header.data[0] & 0x02))
    throw new Error("This WebP is not animated.")
  const animation = chunks.find((chunk) => chunk.type === "ANIM")
  const frames: WebpFrame[] = []
  for (const chunk of chunks) {
    if (chunk.type !== "ANMF") continue
    const { data } = chunk
    const width = u24le(data, 6) + 1
    const height = u24le(data, 9) + 1
    frames.push({
      x: u24le(data, 0) * 2,
      y: u24le(data, 3) * 2,
      width,
      height,
      // Browsers show frames faster than 10 ms at 100 ms instead.
      duration: u24le(data, 12) <= 10 ? 100 : u24le(data, 12),
      dispose: data[15] & 0x01 ? "background" : "none",
      blend: data[15] & 0x02 ? "source" : "over",
      webp: stillWebp(riffChunks(data, 16, data.length), width, height),
    })
  }
  if (!frames.length) throw new Error("This WebP has no frames.")
  return {
    width: u24le(header.data, 4) + 1,
    height: u24le(header.data, 7) + 1,
    plays: animation ? u16le(animation.data, 4) : 0,
    frames,
  }
}
