import { outputFormats, type OutputFormat } from "./formats"
import type { Size } from "./geometry"
import { flattenAlpha } from "./pixels"
import type { CompressRequest } from "./protocol"
import {
  fitTargetSize,
  pngPaletteFor,
  qualityRange,
  searchQuality,
  searchSteps,
  searchTargetSize,
  similarityScore,
  ssimTarget,
  type PngSettings,
} from "./quality"
import {
  contentKind,
  similarity,
  type ContentKind,
  type Pixels,
  type Similarity,
} from "./ssim"

export interface Codecs {
  encode: (
    format: OutputFormat,
    pixels: Pixels,
    settings: PngSettings
  ) => Promise<ArrayBuffer>
  decode: (format: OutputFormat, bytes: ArrayBuffer) => Promise<Pixels>
}

export interface Candidate {
  format: OutputFormat
  bytes: ArrayBuffer
  quality: number | null
  similarity: number
  fits: boolean | null
}

export type PipelineJob = Omit<CompressRequest, "type" | "id" | "plan">

/**
 * Encode one image with every candidate format and keep the best result.
 * Codecs are injected so the same logic runs in the worker, in Node and in tests.
 */
export async function runPipeline(options: {
  job: PipelineJob
  output: Size
  transparent: boolean
  pixelsAt: (size: Size) => Promise<Pixels>
  codecs: Codecs
  checkpoint?: () => Promise<void>
  progress?: (label: string) => void
}): Promise<{ candidate: Candidate; size: Size }> {
  const { job, codecs } = options
  const checkpoint = options.checkpoint ?? (async () => {})
  const progress = options.progress ?? (() => {})

  const encodeOne = async (
    format: OutputFormat,
    pixels: Pixels,
    kind: ContentKind
  ): Promise<Candidate> => {
    const input =
      format === "jpeg" && options.transparent
        ? flattenAlpha(pixels, job.background)
        : pixels
    const label = outputFormats[format].label
    const base: PngSettings = {
      quality: job.quality,
      lossless: false,
      effort: job.effort,
      chroma444: job.chroma444,
      progressive: job.progressive,
      colors: job.pngColors,
      dithering: job.dithering,
    }
    const measured = new Map<ArrayBuffer, Similarity>()
    const measureFull = async (bytes: ArrayBuffer) => {
      let value = measured.get(bytes)
      if (!value) {
        value = similarity(input, await codecs.decode(format, bytes))
        measured.set(bytes, value)
      }
      return value
    }
    const measure = async (bytes: ArrayBuffer) =>
      (await measureFull(bytes)).mean
    const steps = searchSteps(format, job.effort)
    const onStep = async (step: number, total: number) => {
      await checkpoint()
      progress(`Finding the best ${label} quality · ${step} of ${total}`)
    }

    if (job.compression === "lossless") {
      progress(`Encoding lossless ${label}…`)
      const bytes = await codecs.encode(format, input, {
        ...base,
        lossless: true,
      })
      return { format, bytes, quality: null, similarity: 1, fits: null }
    }
    if (job.compression === "target") {
      const target = job.targetBytes as number
      const range =
        format === "png" ? { min: 0, max: 100 } : qualityRange[format]
      const outcome = await searchTargetSize({
        ...range,
        steps: format === "png" ? steps + 1 : steps,
        target,
        onStep,
        encode: async (quality) => ({
          bytes: await codecs.encode(format, input, {
            ...base,
            quality,
            searching: true,
            palette: { min: 0, target: quality },
          }),
        }),
      })
      let bytes = outcome.result.bytes
      if (format === "avif") {
        // The search runs AVIF at a faster speed; keep the slower, better encode if it fits.
        progress("Encoding the final AVIF…")
        const final = await codecs.encode(format, input, {
          ...base,
          quality: outcome.quality,
        })
        if (final.byteLength <= target || !outcome.fits) bytes = final
      }
      return {
        format,
        bytes,
        quality: outcome.quality,
        similarity: await measure(bytes),
        fits: bytes.byteLength <= target,
      }
    }
    if (job.compression === "custom" || format === "png") {
      progress(
        format === "png"
          ? "Building an optimised palette…"
          : `Encoding ${label}…`
      )
      const bytes = await codecs.encode(format, input, {
        ...base,
        palette: pngPaletteFor(
          job.compression as Exclude<
            PipelineJob["compression"],
            "lossless" | "target"
          >,
          job.quality
        ),
      })
      return {
        format,
        bytes,
        quality: job.compression === "custom" ? job.quality : null,
        similarity: await measure(bytes),
        fits: null,
      }
    }
    const outcome = await searchQuality({
      ...qualityRange[format],
      steps,
      threshold: ssimTarget(job.compression, format, kind),
      onStep,
      encode: async (quality) => ({
        bytes: await codecs.encode(format, input, {
          ...base,
          quality,
          searching: true,
        }),
      }),
      measure: async (result) =>
        similarityScore(await measureFull(result.bytes), kind),
    })
    let bytes = outcome.result.bytes
    let score = await measure(bytes)
    if (format === "avif") {
      progress("Encoding the final AVIF…")
      bytes = await codecs.encode(format, input, {
        ...base,
        quality: outcome.quality,
      })
      score = await measure(bytes)
    }
    return {
      format,
      bytes,
      quality: outcome.quality,
      similarity: score,
      fits: null,
    }
  }

  const encodeAll = async (size: Size) => {
    const pixels = await options.pixelsAt(size)
    const kind = contentKind(pixels)
    const results: Candidate[] = []
    for (const format of job.candidates) {
      await checkpoint()
      results.push(await encodeOne(format, pixels, kind))
    }
    const fitting = results.filter((item) => item.fits)
    if (fitting.length)
      return fitting.reduce((best, item) =>
        item.similarity > best.similarity ? item : best
      )
    return results.reduce((best, item) =>
      item.bytes.byteLength < best.bytes.byteLength ? item : best
    )
  }

  if (job.compression === "target") {
    if (!job.targetBytes)
      throw new Error("Enter a target size greater than zero.")
    const outcome = await fitTargetSize({
      output: options.output,
      target: job.targetBytes,
      allowDownscale: job.allowDownscale,
      attempt: async (size) => {
        const result = await encodeAll(size)
        return { result, fits: Boolean(result.fits) }
      },
    })
    return { candidate: outcome.result, size: outcome.size }
  }
  return { candidate: await encodeAll(options.output), size: options.output }
}
