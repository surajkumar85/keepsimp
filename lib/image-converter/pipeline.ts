import { flattenAlpha, hasTransparency } from "@/lib/image-compressor/pixels"
import {
  searchQuality,
  similarityScore,
  ssimTarget,
  type CompressionPreset,
} from "@/lib/image-compressor/quality"
import {
  contentKind,
  similarity,
  type Pixels,
} from "@/lib/image-compressor/ssim"
import { CENTER } from "@/lib/image-resizer/focus"
import { applyDensity } from "@/lib/image-resizer/metadata"
import { render, type RenderDeps } from "@/lib/image-resizer/pipeline"
import { resolveLayout } from "@/lib/image-resizer/sizing"
import { encodeBmp } from "./encoders/bmp"
import { encodeGif, type PaletteColour } from "./encoders/gif"
import { encodeIco } from "./encoders/ico"
import { createPdf, rgbBytes, type PdfImage } from "./encoders/pdf"
import { encodeTiff } from "./encoders/tiff"
import {
  densityFor,
  matte,
  pdfOptions,
  qualityFor,
  type ConverterSettings,
} from "./settings"
import {
  isCompressorTarget,
  type CompressorTarget,
  type Target,
} from "./targets"

/** Codecs supplied by the worker in the browser, and by Node in tests. */
export interface ConvertDeps {
  /** SSIM-guided encode with the compressor's engine. */
  compress: (
    format: CompressorTarget,
    pixels: Pixels,
    preset: CompressionPreset,
    quality: number,
    background: [number, number, number]
  ) => Promise<{ bytes: ArrayBuffer; similarity: number }>
  encodeJxl: (
    pixels: Pixels,
    options: { quality: number; lossless: boolean; effort?: number }
  ) => Promise<ArrayBuffer>
  decodeJxl: (bytes: ArrayBuffer) => Promise<Pixels>
  quantize: (
    pixels: Pixels,
    colours: number,
    dithering: boolean
  ) => Promise<{ indices: Uint8Array; palette: PaletteColour[] }>
  resize: RenderDeps["resize"]
  /** zlib-compress bytes (for lossless PDF image streams). */
  deflate: (bytes: Uint8Array) => Promise<Uint8Array>
}

export interface Converted {
  target: Target
  bytes: Uint8Array
  width: number
  height: number
  /** Mean SSIM against the prepared image; 1 for exact formats, null when not measured. */
  similarity: number | null
  /** The page image, so several images can be combined into one PDF later. */
  page?: PdfImage
}

const JXL_RANGE = { min: 30, max: 97, start: 85 }
const SEARCH_EFFORT = 3

async function jxl(
  pixels: Pixels,
  preset: CompressionPreset,
  quality: number,
  deps: ConvertDeps,
  onStep?: (label: string) => void | Promise<void>
) {
  if (preset === "lossless")
    return {
      bytes: await deps.encodeJxl(pixels, { quality: 100, lossless: true }),
      similarity: 1,
    }
  const measure = async (bytes: ArrayBuffer) =>
    similarity(pixels, await deps.decodeJxl(bytes))
  if (preset === "custom" || preset === "target") {
    const bytes = await deps.encodeJxl(pixels, { quality, lossless: false })
    return { bytes, similarity: (await measure(bytes)).mean }
  }
  const kind = contentKind(pixels)
  const outcome = await searchQuality({
    ...JXL_RANGE,
    steps: 5,
    // JPEG XL smooths like WebP and AVIF, so it shares their slightly higher target.
    threshold: ssimTarget(preset, "webp", kind),
    onStep: (step, total) =>
      onStep?.(`Finding the best JPEG XL quality · ${step} of ${total}`),
    // Search at a fast effort; quality maps to the same visual target at any effort.
    encode: async (value) => ({
      bytes: await deps.encodeJxl(pixels, {
        quality: value,
        lossless: false,
        effort: SEARCH_EFFORT,
      }),
    }),
    measure: async (result) =>
      similarityScore(await measure(result.bytes), kind),
  })
  await onStep?.("Encoding the final JPEG XL…")
  const bytes = await deps.encodeJxl(pixels, {
    quality: outcome.quality,
    lossless: false,
  })
  return { bytes, similarity: (await measure(bytes)).mean }
}

/** Convert one prepared image (already limited in size and, if asked, greyscale) to one format. */
export async function convert(
  prepared: Pixels,
  target: Target,
  settings: ConverterSettings,
  deps: ConvertDeps,
  onStep?: (label: string) => void | Promise<void>
): Promise<Converted> {
  const { preset, quality } = qualityFor(settings, target)
  const background = matte(settings)
  const transparent = hasTransparency(prepared)
  const size = { width: prepared.width, height: prepared.height }
  const density = densityFor(settings, target)

  if (isCompressorTarget(target)) {
    const result = await deps.compress(
      target,
      prepared,
      preset,
      quality,
      background
    )
    const bytes = new Uint8Array(result.bytes)
    return {
      target,
      bytes: density ? applyDensity(target, bytes, density) : bytes,
      ...size,
      similarity: result.similarity,
    }
  }

  if (target === "jxl") {
    const result = await jxl(prepared, preset, quality, deps, onStep)
    return {
      target,
      bytes: new Uint8Array(result.bytes),
      ...size,
      similarity: result.similarity,
    }
  }

  if (target === "gif") {
    await onStep?.("Building the GIF palette…")
    const { indices, palette } = await deps.quantize(
      prepared,
      settings.gifColours,
      settings.dithering
    )
    return {
      target,
      bytes: encodeGif(indices, palette, prepared.width, prepared.height),
      ...size,
      similarity: null,
    }
  }

  if (target === "bmp" || target === "tiff") {
    const options = { alpha: transparent, dpi: density ?? undefined }
    return {
      target,
      bytes:
        target === "bmp"
          ? encodeBmp(prepared, options)
          : encodeTiff(prepared, options),
      ...size,
      similarity: 1,
    }
  }

  if (target === "ico") {
    const sizes = [...new Set(settings.icoSizes)].sort((a, b) => a - b)
    const entries = []
    for (const edge of sizes) {
      await onStep?.(`Drawing the ${edge} px icon…`)
      // Fit the whole picture inside a square, padding with transparency.
      const layout = resolveLayout(
        size,
        { kind: "box", width: edge, height: edge, fit: "contain" },
        { enlarge: true, multiple: 1, focus: CENTER }
      )
      const icon = await render(
        prepared,
        { rotation: 0, flipX: false, flipY: false },
        {
          layout,
          kernel: layout.enlarged ? "mitchell" : "lanczos3",
          sharpen: 0,
        },
        { kind: "transparent" },
        { resize: deps.resize }
      )
      const png = await deps.compress("png", icon, "lossless", 100, background)
      entries.push({ size: edge, png: new Uint8Array(png.bytes) })
    }
    const largest = sizes[sizes.length - 1]
    return {
      target,
      bytes: encodeIco(entries),
      width: largest,
      height: largest,
      similarity: 1,
    }
  }

  // PDF: pages are opaque RGB, so transparency takes the background colour.
  const flat = transparent ? flattenAlpha(prepared, background) : prepared
  let page: PdfImage
  let measured: number
  if (preset === "lossless") {
    await onStep?.("Packing the PDF page…")
    page = {
      kind: "flate",
      data: await deps.deflate(rgbBytes(flat.data)),
      ...size,
    }
    measured = 1
  } else {
    const jpeg = await deps.compress("jpeg", flat, preset, quality, background)
    page = { kind: "dct", data: new Uint8Array(jpeg.bytes), ...size }
    measured = jpeg.similarity
  }
  return {
    target,
    bytes: createPdf([page], pdfOptions(settings)),
    ...size,
    similarity: measured,
    page,
  }
}
