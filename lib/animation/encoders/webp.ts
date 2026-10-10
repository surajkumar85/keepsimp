import { ByteWriter, ascii } from "../bytes"
import { riffChunk, riffChunks, webpFile } from "../decoders/webp"
import type { Rect } from "../types"

export interface WebpImage extends Rect {
  /** A still WebP of the patch, as the encoder wrote it. */
  webp: Uint8Array
  /** Milliseconds on screen. */
  duration: number
  /** "over" paints the patch on what is there; "source" replaces it. */
  blend: "source" | "over"
}

export interface WebpAnimation {
  width: number
  height: number
  /** Whether any frame has see-through pixels. */
  alpha: boolean
  /** Times to play; 0 means forever. */
  plays: number
  images: WebpImage[]
}

/** The picture chunks of a still WebP: optional alpha, then the image. */
export function pictureChunks(webp: Uint8Array) {
  if (ascii(webp, 0, 4) !== "RIFF" || ascii(webp, 8, 4) !== "WEBP")
    throw new Error("The WebP encoder returned something else.")
  const chunks = riffChunks(webp, 12, webp.length).filter((chunk) =>
    ["ALPH", "VP8 ", "VP8L"].includes(chunk.type)
  )
  if (!chunks.some((chunk) => chunk.type !== "ALPH"))
    throw new Error("The WebP encoder returned no picture.")
  return chunks
}

/** Write an animated WebP from still WebP patches. Patch offsets must be even. */
export function writeWebp(animation: WebpAnimation) {
  const { width, height, alpha, plays, images } = animation
  const body = new ByteWriter()
  riffChunk(
    body,
    "VP8X",
    new ByteWriter()
      .u8(0x02 | (alpha ? 0x10 : 0))
      .bytes([0, 0, 0])
      .u24le(width - 1)
      .u24le(height - 1)
      .finish()
  )
  // Background colour (unused by browsers) and the number of plays.
  riffChunk(
    body,
    "ANIM",
    new ByteWriter().u32le(0).u16le(Math.min(65535, plays)).finish()
  )
  for (const image of images) {
    if (image.x % 2 || image.y % 2)
      throw new Error("Animated WebP patches must start on even pixels.")
    const frame = new ByteWriter()
      .u24le(image.x / 2)
      .u24le(image.y / 2)
      .u24le(image.width - 1)
      .u24le(image.height - 1)
      .u24le(Math.max(1, Math.min(0xffffff, Math.round(image.duration))))
      .u8(image.blend === "source" ? 0x02 : 0)
    for (const chunk of pictureChunks(image.webp))
      riffChunk(frame, chunk.type, chunk.data)
    riffChunk(body, "ANMF", frame.finish())
  }
  return webpFile(body.finish())
}
