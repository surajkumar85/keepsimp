/** The real codecs behind the animation pipeline (browser worker and Node tests). */
import {
  createPalette,
  decodeOutput,
  deflate,
  encodeGifski,
  encodeWebpStill,
  resizePixels,
} from "@/lib/image-compressor/codecs"
import type { ConvertDeps } from "./pipeline"
import type { SourceDeps } from "./source"

export function createDeps(
  checkpoint: () => Promise<void> = async () => {},
  progress: (label: string) => void = () => {}
): ConvertDeps & SourceDeps {
  return {
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
