/**
 * The picture codecs the compressor works with: the image tools' own
 * encoders, set up for pictures that live inside a PDF.
 */
import {
  deflate,
  encodeImage,
  encodeJpegWith,
  resizePixels,
} from "@/lib/image-compressor/codecs"
import { jpegOptions } from "@/lib/image-compressor/quality"
import type { Codecs } from "./mupdf-compress"

/** mozjpeg's name for a JPEG with one channel. */
const GREYSCALE = 1
/**
 * The standard's own tables. The image tools prefer a table that is a little
 * smaller on photographs, but it is coarser on slow changes of colour, and
 * skies and the soft backgrounds of slides turn into bands with it.
 */
const STANDARD_TABLES = 0

export const codecs: Codecs = {
  async jpeg(pixels, quality, grey) {
    const options = jpegOptions({
      quality,
      lossless: false,
      effort: "balanced",
      chroma444: false,
      // Every viewer reads progressive JPEGs, and they are smaller.
      progressive: true,
    })
    return new Uint8Array(
      await encodeJpegWith(pixels, {
        ...options,
        quant_table: STANDARD_TABLES,
        ...(grey ? { color_space: GREYSCALE } : null),
      })
    )
  },
  resize: (pixels, size, linear) =>
    resizePixels(pixels, size, "lanczos3", linear),
  async png(pixels) {
    return new Uint8Array(
      await encodeImage("png", pixels, {
        quality: 100,
        lossless: true,
        effort: "balanced",
        chroma444: true,
        progressive: false,
        colors: 256,
        dithering: false,
      })
    )
  },
  deflate,
}
