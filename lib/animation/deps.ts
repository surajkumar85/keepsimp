/** The real codecs behind the animation pipeline (browser worker and Node tests). */
import {
  createPalette,
  decodeOutput,
  deflate,
  encodeGifski,
  encodeImage,
  encodeWebpStill,
  resizePixels,
} from "@/lib/image-compressor/codecs"
import { flattenAlpha } from "@/lib/image-compressor/pixels"
import type { ConvertDeps } from "./pipeline"
import type { SourceDeps } from "./source"

/**
 * @param encodeVideo The browser's video encoder; left out in Node, where there is none.
 * @param renderCaption The browser's text drawing; a stand-in is passed in Node.
 */
export function createDeps(
  checkpoint: () => Promise<void> = async () => {},
  progress: (label: string) => void = () => {},
  encodeVideo: ConvertDeps["encodeVideo"] = async () => {
    throw new Error("Video cannot be written here.")
  },
  renderCaption: ConvertDeps["renderCaption"] = async () => {
    throw new Error("Text cannot be drawn here.")
  }
): ConvertDeps & SourceDeps {
  return {
    encodeVideo,
    renderCaption,
    encodeStill: async (pixels, format, options) =>
      format === "webp"
        ? encodeWebpStill(pixels, options)
        : new Uint8Array(
            await encodeImage(
              format,
              // JPEG has no transparency; the pipeline has already filled it.
              format === "jpeg"
                ? flattenAlpha(pixels, [255, 255, 255])
                : pixels,
              {
                quality: options.quality,
                lossless: true,
                effort: "balanced",
                chroma444: false,
                progressive: true,
                colors: 256,
                dithering: false,
              }
            )
          ),
    decodeStill: (format, bytes) =>
      decodeOutput(
        format,
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer
      ),
    resize: (pixels, size, kernel) => resizePixels(pixels, size, kernel),
    palette: createPalette,
    encodeWebp: encodeWebpStill,
    deflate,
    gifski: (frames, quality) =>
      encodeGifski(frames, frames[0].width, frames[0].height, quality),
    checkpoint,
    progress,
  }
}
