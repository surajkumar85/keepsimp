import type { OutputFormat } from "./formats"
import { downscaleStep, type Size } from "./geometry"
import type { ContentKind, Similarity } from "./ssim"

export type CompressionPreset =
  "smart" | "smallest" | "high" | "lossless" | "custom" | "target"
export type Effort = "fast" | "balanced" | "max"

/**
 * Minimum similarity for each preset. Photos are scored by mean SSIM (8×8
 * windows); graphics by the mean of their worst 1% of windows, so ringing
 * around text counts. These are KeepSimp decisions calibrated with
 * `npm run image:benchmark` and visual review, not values from a standard.
 */
export const ssimTargets: Record<
  ContentKind,
  Record<"smallest" | "smart" | "high", number>
> = {
  photo: { smallest: 0.94, smart: 0.96, high: 0.975 },
  graphic: { smallest: 0.75, smart: 0.84, high: 0.92 },
}
/** WebP and AVIF reach a given mean SSIM partly by smoothing texture. */
const SMOOTHING_CODEC_OFFSET = 0.005

export function ssimTarget(
  preset: "smallest" | "smart" | "high",
  format: OutputFormat,
  kind: ContentKind = "photo"
) {
  const offset =
    kind === "photo" && (format === "webp" || format === "avif")
      ? SMOOTHING_CODEC_OFFSET
      : 0
  return ssimTargets[kind][preset] + offset
}

export function similarityScore(value: Similarity, kind: ContentKind) {
  return kind === "graphic" ? value.worst : value.mean
}

/** Encode budget for a quality search; most images converge in four to six. */
export function searchSteps(format: OutputFormat, effort: Effort) {
  const steps = effort === "fast" ? 4 : effort === "max" ? 9 : 6
  return format === "avif" ? steps - 1 : steps
}

/** Quality search ranges per lossy codec, on each codec's own 0–100 scale. */
export const qualityRange: Record<
  Exclude<OutputFormat, "png">,
  { min: number; max: number; start: number }
> = {
  jpeg: { min: 25, max: 95, start: 75 },
  webp: { min: 20, max: 95, start: 72 },
  avif: { min: 15, max: 90, start: 55 },
}

/** libimagequant quality (min, target) for palette PNG. */
export const pngQuality: Record<
  "smallest" | "smart" | "high",
  { min: number; target: number }
> = {
  smallest: { min: 35, target: 65 },
  smart: { min: 60, target: 85 },
  high: { min: 80, target: 98 },
}

export interface EncodeSettings {
  quality: number
  lossless: boolean
  effort: Effort
  chroma444: boolean
  progressive: boolean
  /** Lower AVIF speed during quality search, raised again for the final encode. */
  searching?: boolean
}

export interface PngSettings extends EncodeSettings {
  colors: number
  dithering: boolean
  /** Palette quality range; omitted for lossless output. */
  palette?: { min: number; target: number }
}

export function pngPaletteFor(
  preset: "smart" | "smallest" | "high" | "custom",
  quality: number
) {
  if (preset === "custom")
    return { min: Math.max(0, quality - 25), target: quality }
  return pngQuality[preset]
}

export function jpegOptions(settings: EncodeSettings) {
  return {
    quality: settings.quality,
    baseline: false,
    arithmetic: false,
    progressive: settings.progressive,
    optimize_coding: true,
    smoothing: 0,
    color_space: 3,
    quant_table: 3,
    trellis_multipass: settings.effort === "max",
    trellis_opt_zero: settings.effort === "max",
    trellis_opt_table: settings.effort === "max",
    trellis_loops: settings.effort === "fast" ? 1 : 2,
    auto_subsample: !settings.chroma444,
    chroma_subsample: settings.chroma444 ? 1 : 2,
    separate_chroma_quality: false,
    chroma_quality: settings.quality,
  }
}

export function webpOptions(settings: EncodeSettings) {
  return {
    quality: settings.lossless ? 100 : settings.quality,
    target_size: 0,
    target_PSNR: 0,
    method: settings.effort === "fast" ? 3 : settings.effort === "max" ? 6 : 4,
    sns_strength: 50,
    filter_strength: 60,
    filter_sharpness: 0,
    filter_type: 1,
    partitions: 0,
    segments: 4,
    pass: settings.effort === "max" ? 6 : 1,
    show_compressed: 0,
    preprocessing: 0,
    autofilter: settings.effort === "max" ? 1 : 0,
    partition_limit: 0,
    alpha_compression: 1,
    alpha_filtering: 1,
    alpha_quality: 100,
    lossless: settings.lossless ? 1 : 0,
    exact: 0,
    image_hint: 0,
    emulate_jpeg_size: 0,
    thread_level: 0,
    low_memory: 0,
    near_lossless: 100,
    use_delta_palette: 0,
    use_sharp_yuv: settings.lossless ? 0 : 1,
  }
}

export function avifOptions(settings: EncodeSettings) {
  const speed =
    settings.effort === "fast" ? 8 : settings.effort === "max" ? 4 : 6
  return {
    quality: settings.quality,
    qualityAlpha: -1,
    denoiseLevel: 0,
    tileColsLog2: 0,
    tileRowsLog2: 0,
    speed: settings.searching ? Math.max(speed, 8) : speed,
    subsample: settings.chroma444 ? 3 : 1,
    chromaDeltaQ: false,
    sharpness: 0,
    tune: 2,
    enableSharpYUV: !settings.chroma444,
    bitDepth: 8,
    lossless: false,
  }
}

export function oxipngLevel(effort: Effort) {
  return effort === "fast" ? 1 : effort === "max" ? 4 : 2
}

export interface Encoded {
  bytes: ArrayBuffer
}

interface Probe<T> {
  quality: number
  result: T
  score: number
}

/**
 * Find the lowest quality whose measured similarity still meets `threshold`.
 * Similarity rises smoothly with quality, so after two probes the search
 * interpolates inside the bracket (falling back to halving when it is narrow).
 * It stops once the passing and failing qualities are adjacent or `steps` runs out.
 */
export async function searchQuality<T extends Encoded>(options: {
  min: number
  max: number
  start: number
  steps: number
  threshold: number
  encode: (quality: number) => Promise<T>
  measure: (result: T) => Promise<number>
  onStep?: (step: number, total: number) => void | Promise<void>
}) {
  const { min, max, threshold } = options
  let pass: Probe<T> | null = null
  let fail: Probe<T> | null = null
  const probe = async (quality: number, step: number) => {
    await options.onStep?.(step, options.steps)
    const result = await options.encode(quality)
    const score = await options.measure(result)
    const point = { quality, result, score }
    if (score >= threshold) pass = point
    else fail = point
  }
  const next = (): number | null => {
    const p = pass as Probe<T> | null
    const f = fail as Probe<T> | null
    if (p && p.quality === min) return null
    if (f && f.quality === max) return null
    if (p && f) {
      if (p.quality - f.quality <= 1) return null
      const low = f.quality + 1
      const high = p.quality - 1
      if (high - low < 3) return Math.floor((low + high) / 2)
      const estimate = Math.ceil(
        f.quality +
          ((threshold - f.score) / (p.score - f.score)) *
            (p.quality - f.quality)
      )
      return Math.min(high, Math.max(low, estimate))
    }
    if (p) return Math.max(min, p.quality - 12)
    if (f) return Math.min(max, f.quality + 12)
    return Math.min(max, Math.max(min, options.start))
  }
  for (let step = 1; step <= options.steps; step++) {
    const quality = next()
    if (quality === null) break
    await probe(quality, step)
  }
  const found = pass as Probe<T> | null
  if (found) return { ...found, met: true }
  const failed = fail as Probe<T> | null
  if (failed && failed.quality === max) return { ...failed, met: false }
  const result = await options.encode(max)
  return {
    quality: max,
    result,
    score: await options.measure(result),
    met: false,
  }
}

/** Find the highest quality whose output fits within `target` bytes. */
export async function searchTargetSize<T extends Encoded>(options: {
  min: number
  max: number
  steps: number
  target: number
  encode: (quality: number) => Promise<T>
  onStep?: (step: number, total: number) => void | Promise<void>
}) {
  let low = options.min
  let high = options.max
  let best: { quality: number; result: T } | null = null
  let smallest: { quality: number; result: T } | null = null
  for (let step = 0; step < options.steps && low <= high; step++) {
    await options.onStep?.(step + 1, options.steps)
    const quality = Math.round((low + high) / 2)
    const result = await options.encode(quality)
    if (!smallest || result.bytes.byteLength < smallest.result.bytes.byteLength)
      smallest = { quality, result }
    if (result.bytes.byteLength <= options.target) {
      best = { quality, result }
      low = quality + 1
    } else high = quality - 1
  }
  if (best) return { ...best, fits: true }
  if (smallest && smallest.quality === options.min)
    return { ...smallest, fits: false }
  const result = await options.encode(options.min)
  return {
    quality: options.min,
    result,
    fits: result.bytes.byteLength <= options.target,
  }
}

/**
 * Reach a byte target by lowering quality first, then (if allowed) dimensions.
 * `attempt` runs a quality search at one output size.
 */
export async function fitTargetSize<T extends Encoded>(options: {
  output: Size
  target: number
  allowDownscale: boolean
  attempt: (size: Size) => Promise<{ result: T; fits: boolean }>
}) {
  let size: Size | null = options.output
  let last: { result: T; fits: boolean; size: Size } | null = null
  while (size) {
    const outcome = await options.attempt(size)
    last = { ...outcome, size }
    if (outcome.fits || !options.allowDownscale) break
    size = downscaleStep(size)
  }
  return last!
}

export function pickSmallest<T extends { bytes: ArrayBuffer }>(results: T[]) {
  if (!results.length) throw new Error("Nothing was encoded.")
  return results.reduce((best, item) =>
    item.bytes.byteLength < best.bytes.byteLength ? item : best
  )
}

/** Offer the untouched original when re-encoding with the same format and size saves nothing. */
export function originalIsBetter(options: {
  originalBytes: number
  resultBytes: number
  sameFormat: boolean
  sameDimensions: boolean
  edited: boolean
}) {
  return (
    options.sameFormat &&
    options.sameDimensions &&
    !options.edited &&
    options.resultBytes >= options.originalBytes
  )
}

export function savingsPercent(original: number, result: number) {
  if (original <= 0) return 0
  return Math.round((1 - result / original) * 100)
}
