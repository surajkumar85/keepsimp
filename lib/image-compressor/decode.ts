/** Browser-only image decoding shared by the compressor and resizer workers. */
import { decodeAvif, decodeHeic, decodeJxl, decodeTiff } from "./codecs"
import type { InputFormat } from "./formats"
import { MAX_PIXELS } from "./geometry"
import type { Pixels } from "./ssim"

export const TOO_MANY_PIXELS = "Use an image with at most 50 megapixels."
export const UNREADABLE =
  "We could not read that image. It may be damaged, or this browser cannot decode it."

export const tooLarge = (width: number, height: number) =>
  width * height > MAX_PIXELS

async function nativeDecode(blob: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "default",
  })
  try {
    if (tooLarge(bitmap.width, bitmap.height)) throw new Error(TOO_MANY_PIXELS)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Your browser cannot read image pixels here.")
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    canvas.width = canvas.height = 0
    return { data: image.data, width: image.width, height: image.height }
  } finally {
    bitmap.close()
  }
}

/** Decode with the browser first (EXIF orientation, colour profiles), then WASM fallbacks. */
export async function decodeImageFile(
  file: Blob,
  format: InputFormat
): Promise<Pixels> {
  const bytes = () => file.arrayBuffer()
  let pixels: Pixels
  if (format === "jxl") pixels = await decodeJxl(await bytes())
  else
    try {
      pixels = await nativeDecode(file)
    } catch (error) {
      if ((error as Error).message === TOO_MANY_PIXELS) throw error
      if (format === "avif") pixels = await decodeAvif(await bytes())
      else if (format === "heic") pixels = await decodeHeic(await bytes())
      else if (format === "tiff") pixels = await decodeTiff(await bytes())
      else throw error
    }
  if (tooLarge(pixels.width, pixels.height)) throw new Error(TOO_MANY_PIXELS)
  return pixels
}

/** A friendly message for anything that went wrong while opening an image. */
export function decodeErrorMessage(error: unknown) {
  const message = (error as Error)?.message ?? ""
  return message === TOO_MANY_PIXELS ? message : UNREADABLE
}

/** A small bitmap of the decoded pixels for on-screen previews. */
export function previewBitmap(pixels: Pixels, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(pixels.width, pixels.height))
  return createImageBitmap(
    new ImageData(pixels.data, pixels.width, pixels.height),
    {
      resizeWidth: Math.max(1, Math.round(pixels.width * scale)),
      resizeHeight: Math.max(1, Math.round(pixels.height * scale)),
      resizeQuality: "high",
      premultiplyAlpha: "none",
    }
  )
}
