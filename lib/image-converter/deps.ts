/** The real codecs behind the conversion pipeline (browser worker and Node tests). */
import {
  decodeJxl,
  decodeOutput,
  deflate,
  encodeImage,
  encodeJxl,
  quantizeImage,
  resizePixels,
} from "@/lib/image-compressor/codecs"
import { hasTransparency } from "@/lib/image-compressor/pixels"
import { runPipeline } from "@/lib/image-compressor/pipeline"
import type { ConvertDeps } from "./pipeline"

export function createDeps(
  checkpoint: () => Promise<void> = async () => {},
  progress: (label: string) => void = () => {}
): ConvertDeps {
  return {
    compress: async (format, pixels, preset, quality, background) => {
      const { candidate } = await runPipeline({
        job: {
          candidates: [format],
          compression: preset,
          quality,
          targetBytes: null,
          allowDownscale: false,
          effort: "balanced",
          chroma444: false,
          progressive: true,
          pngColors: 256,
          dithering: true,
          resample: "lanczos3",
          background,
        },
        output: { width: pixels.width, height: pixels.height },
        transparent: format === "jpeg" && hasTransparency(pixels),
        pixelsAt: async () => pixels,
        codecs: { encode: encodeImage, decode: decodeOutput },
        checkpoint,
        progress,
      })
      return { bytes: candidate.bytes, similarity: candidate.similarity }
    },
    encodeJxl,
    decodeJxl,
    quantize: quantizeImage,
    resize: (pixels, size, kernel) => resizePixels(pixels, size, kernel),
    deflate,
  }
}
