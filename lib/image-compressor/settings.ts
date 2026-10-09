import {
  outputFormats,
  sameFormatOutput,
  type InputFormat,
  type OutputFormat,
} from "./formats"
import {
  aspectValue,
  clampCrop,
  flipCrop,
  initialCrop,
  orientedSize,
  planPipeline,
  rotate,
  rotateCrop,
  type AspectPreset,
  type Fit,
  type Rect,
  type ResizeMode,
  type Rotation,
  type Size,
  type SizeUnit,
} from "./geometry"
import type { CompressionPreset, Effort } from "./quality"
import { parseHexColor } from "./pixels"

export type FormatChoice = "original" | "auto" | OutputFormat
export type SizeChoice =
  "original" | "75" | "50" | "25" | "long-edge" | "custom"
export type Resample = "lanczos3" | "mitchell" | "catrom"
export type Background = "white" | "black" | "custom"

export interface CompressorSettings {
  format: FormatChoice
  compression: CompressionPreset
  quality: number
  targetSize: string
  targetUnit: "KB" | "MB"
  allowDownscale: boolean
  size: SizeChoice
  longEdge: number
  customWidth: string
  customHeight: string
  unit: SizeUnit
  lock: boolean
  fit: Fit
  aspect: AspectPreset
  crop: Rect | null
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  background: Background
  backgroundColor: string
  chroma444: boolean
  progressive: boolean
  pngColors: number
  dithering: boolean
  effort: Effort
  resample: Resample
}

export const DEFAULT_CUSTOM_BACKGROUND = "#ffffff"

export const defaultSettings: CompressorSettings = {
  format: "original",
  compression: "smart",
  quality: 75,
  targetSize: "200",
  targetUnit: "KB",
  allowDownscale: true,
  size: "original",
  longEdge: 1920,
  customWidth: "",
  customHeight: "",
  unit: "px",
  lock: true,
  fit: "contain",
  aspect: "free",
  crop: null,
  rotation: 0,
  flipX: false,
  flipY: false,
  background: "white",
  backgroundColor: DEFAULT_CUSTOM_BACKGROUND,
  chroma444: false,
  progressive: true,
  pngColors: 256,
  dithering: true,
  effort: "balanced",
  resample: "lanczos3",
}

export const longEdgePresets = [3840, 2560, 1920, 1280, 1080, 640]
export const pngColorChoices = [256, 128, 64, 32, 16]

/** Settings for a newly opened image: sizes start from it and crop resets. */
export function settingsForImage(
  previous: CompressorSettings,
  source: Size
): CompressorSettings {
  return {
    ...previous,
    crop: null,
    aspect: "free",
    rotation: 0,
    flipX: false,
    flipY: false,
    customWidth: String(source.width),
    customHeight: String(source.height),
  }
}

/** The format used for "same as original", for inputs that cannot be written back. */
export function originalOutput(
  input: InputFormat,
  transparent: boolean
): OutputFormat {
  return sameFormatOutput(input) ?? (transparent ? "png" : "jpeg")
}

/** Which formats to encode; "auto" tries several and keeps the smallest. */
export function candidateFormats(
  choice: FormatChoice,
  input: InputFormat,
  transparent: boolean,
  lossless: boolean
): OutputFormat[] {
  if (choice !== "auto")
    return [choice === "original" ? originalOutput(input, transparent) : choice]
  const base = originalOutput(input, transparent)
  const list: OutputFormat[] = lossless
    ? ["png", "webp"]
    : [base === "png" && !transparent ? "jpeg" : base, "webp", "avif"]
  return [...new Set(list)].filter(
    (format) => !lossless || outputFormats[format].lossless
  )
}

export function losslessAvailable(
  choice: FormatChoice,
  resolved: OutputFormat
) {
  return choice === "auto" || outputFormats[resolved].lossless
}

export function targetBytes(settings: CompressorSettings) {
  const value = Number(settings.targetSize)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * (settings.targetUnit === "MB" ? 1024 * 1024 : 1024))
}

export function backgroundRgb(
  settings: CompressorSettings
): [number, number, number] {
  if (settings.background === "black") return [0, 0, 0]
  if (settings.background === "custom")
    return parseHexColor(settings.backgroundColor) ?? [255, 255, 255]
  return [255, 255, 255]
}

function parseDimension(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : NaN
}

export function resizeMode(settings: CompressorSettings): ResizeMode {
  switch (settings.size) {
    case "original":
      return { kind: "original" }
    case "long-edge":
      return { kind: "long-edge", pixels: settings.longEdge }
    case "custom": {
      const width = parseDimension(settings.customWidth)
      const height = parseDimension(settings.customHeight)
      if (Number.isNaN(width) || Number.isNaN(height))
        throw new Error("Enter dimensions as numbers.")
      if (
        settings.unit === "px" &&
        [width, height].some((v) => v !== null && !Number.isInteger(v))
      )
        throw new Error("Enter whole pixels for width and height.")
      return {
        kind: "custom",
        width,
        height,
        unit: settings.unit,
        lock: settings.lock,
        fit: settings.fit,
      }
    }
    default:
      return { kind: "scale", percent: Number(settings.size) }
  }
}

/** Resolve everything the worker needs, or a friendly message explaining what to fix. */
export function buildPlan(settings: CompressorSettings, source: Size) {
  try {
    return {
      plan: planPipeline({
        source,
        rotation: settings.rotation,
        flipX: settings.flipX,
        flipY: settings.flipY,
        crop: settings.crop,
        resize: resizeMode(settings),
      }),
      error: null,
    }
  } catch (error) {
    return { plan: null, error: (error as Error).message }
  }
}

/** When the width (or height) changes with the lock on, keep the other value in proportion. */
export function linkedDimension(
  settings: CompressorSettings,
  base: Size,
  edited: "width" | "height",
  value: string
) {
  const next = {
    ...settings,
    [edited === "width" ? "customWidth" : "customHeight"]: value,
  }
  const number = Number(value)
  if (
    !settings.lock ||
    !value.trim() ||
    !Number.isFinite(number) ||
    number <= 0
  )
    return next
  if (settings.unit === "percent")
    return { ...next, customWidth: value, customHeight: value }
  const ratio = base.width / base.height
  return edited === "width"
    ? { ...next, customHeight: String(Math.max(1, Math.round(number / ratio))) }
    : { ...next, customWidth: String(Math.max(1, Math.round(number * ratio))) }
}

/** The image the crop is drawn on: the source after rotation and flips. */
export function cropBounds(settings: CompressorSettings, source: Size) {
  return orientedSize(source, settings.rotation)
}

export function chooseAspect(
  settings: CompressorSettings,
  source: Size,
  aspect: AspectPreset
): CompressorSettings {
  const bounds = cropBounds(settings, source)
  return {
    ...settings,
    aspect,
    crop:
      aspect === "free" && !settings.crop
        ? null
        : initialCrop(bounds, aspectValue(aspect, bounds)),
  }
}

/**
 * Rotate what the visitor sees. Settings apply rotation before flips, so a
 * single flip reverses the direction needed to turn the visible image.
 */
export function rotateView(
  settings: CompressorSettings,
  source: Size,
  direction: "left" | "right"
): CompressorSettings {
  const bounds = cropBounds(settings, source)
  const mirrored = settings.flipX !== settings.flipY
  const internal = mirrored
    ? direction === "left"
      ? "right"
      : "left"
    : direction
  return {
    ...settings,
    rotation: rotate(settings.rotation, internal),
    crop: settings.crop
      ? clampCrop(
          rotateCrop(settings.crop, bounds, direction),
          orientedSize(bounds, 90)
        )
      : null,
  }
}

export function flipView(
  settings: CompressorSettings,
  source: Size,
  axis: "x" | "y"
): CompressorSettings {
  const bounds = cropBounds(settings, source)
  return {
    ...settings,
    flipX: axis === "x" ? !settings.flipX : settings.flipX,
    flipY: axis === "y" ? !settings.flipY : settings.flipY,
    crop: settings.crop ? flipCrop(settings.crop, bounds, axis) : null,
  }
}

/** True when pixels change beyond re-encoding, so a larger file can still be the right result. */
export function isEdited(settings: CompressorSettings) {
  return (
    settings.crop !== null ||
    settings.rotation !== 0 ||
    settings.flipX ||
    settings.flipY
  )
}
