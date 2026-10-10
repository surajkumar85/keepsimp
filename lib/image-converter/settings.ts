import type { InputFormat } from "@/lib/image-compressor/formats"
import type { Size } from "@/lib/image-compressor/geometry"
import { parseHexColor } from "@/lib/image-compressor/pixels"
import type { CompressionPreset } from "@/lib/image-compressor/quality"
import { CENTER } from "@/lib/image-resizer/focus"
import { resolveLayout } from "@/lib/image-resizer/sizing"
import type { PdfMargin, PdfOptions, PdfPageSize } from "./encoders/pdf"
import { sortTargets, targets, type Target } from "./targets"

export type QualityChoice =
  "balanced" | "high" | "small" | "lossless" | "custom"
export type Background = "white" | "black" | "custom"
export type Limit = "original" | "4096" | "2560" | "1920" | "1280" | "custom"

export const MAX_BATCH = 50
export const DEFAULT_BACKGROUND = "#ffffff"
export const DEFAULT_NAME = "{name}"
export const gifColourChoices = [256, 128, 64, 32, 16, 2]

export interface ConverterSettings {
  target: Target
  /** Export every image in several formats at once. */
  multi: boolean
  targets: Target[]
  quality: QualityChoice
  customQuality: number
  background: Background
  backgroundColor: string
  limit: Limit
  customLimit: string
  greyscale: boolean
  embedDpi: boolean
  dpi: number
  pattern: string
  icoSizes: number[]
  gifColours: number
  dithering: boolean
  pdfPage: PdfPageSize
  pdfDpi: number
  pdfMargin: PdfMargin
  /** Put every image into one PDF document instead of one file each. */
  pdfCombine: boolean
}

export const defaultSettings: ConverterSettings = {
  target: "webp",
  multi: false,
  targets: ["avif", "webp", "jpeg"],
  quality: "balanced",
  customQuality: 80,
  background: "white",
  backgroundColor: DEFAULT_BACKGROUND,
  limit: "original",
  customLimit: "2048",
  greyscale: false,
  embedDpi: false,
  dpi: 300,
  pattern: DEFAULT_NAME,
  icoSizes: [16, 32, 48],
  gifColours: 256,
  dithering: true,
  pdfPage: "fit",
  pdfDpi: 150,
  pdfMargin: "small",
  pdfCombine: false,
}

/** The formats this run produces, in catalogue order. */
export function activeTargets(settings: ConverterSettings): Target[] {
  return settings.multi ? sortTargets(settings.targets) : [settings.target]
}

export const usesTarget = (settings: ConverterSettings, target: Target) =>
  activeTargets(settings).includes(target)

/** The first thing to fix before converting, or null when the settings are usable. */
export function settingsProblem(settings: ConverterSettings) {
  const active = activeTargets(settings)
  if (!active.length) return "Choose at least one format."
  if (active.includes("ico") && !settings.icoSizes.length)
    return "Choose at least one icon size."
  if (settings.limit === "custom") {
    const value = Number(settings.customLimit)
    if (!settings.customLimit.trim() || !Number.isInteger(value) || value < 1)
      return "Enter the longest side as a whole number of pixels."
  }
  return null
}

/** Size after the optional long-edge limit. Images are never enlarged. */
export function limitedSize(settings: ConverterSettings, source: Size): Size {
  if (settings.limit === "original") return { ...source }
  const pixels = Number(
    settings.limit === "custom" ? settings.customLimit : settings.limit
  )
  return resolveLayout(
    source,
    { kind: "longest", pixels },
    { enlarge: false, multiple: 1, focus: CENTER }
  ).output
}

/** Whether a quality choice exists for a format; Lossless falls back to High where it cannot apply. */
export function qualityFor(
  settings: ConverterSettings,
  target: Target
): { preset: CompressionPreset; quality: number } {
  const info = targets[target]
  const preset: CompressionPreset =
    settings.quality === "balanced"
      ? "smart"
      : settings.quality === "small"
        ? "smallest"
        : settings.quality === "lossless" && !info.lossless
          ? "high"
          : settings.quality
  return { preset, quality: settings.customQuality }
}

/** True when at least one selected format can honour the Lossless choice. */
export function losslessAvailable(settings: ConverterSettings) {
  return activeTargets(settings).some((target) => targets[target].lossless)
}

/** True when a quality choice changes the output of any selected format. */
export function qualityApplies(settings: ConverterSettings) {
  return activeTargets(settings).some((target) => targets[target].lossy)
}

export function matte(settings: ConverterSettings): [number, number, number] {
  if (settings.background === "black") return [0, 0, 0]
  if (settings.background === "custom")
    return parseHexColor(settings.backgroundColor) ?? [255, 255, 255]
  return [255, 255, 255]
}

/** Formats in this run that will lose transparency and use the background colour. */
export function flattenedTargets(settings: ConverterSettings) {
  return activeTargets(settings).filter((target) => !targets[target].alpha)
}

export function pdfOptions(settings: ConverterSettings): PdfOptions {
  return {
    page: settings.pdfPage,
    dpi: settings.pdfDpi,
    margin: settings.pdfMargin,
  }
}

/** Print resolution to store, for formats that can carry one. */
export function densityFor(settings: ConverterSettings, target: Target) {
  return settings.embedDpi && targets[target].density ? settings.dpi : null
}

/** Everything that changes output bytes. Naming and PDF combining happen afterwards. */
export function processingKey(settings: ConverterSettings) {
  const rest: Partial<ConverterSettings> = { ...settings }
  delete rest.pattern
  delete rest.pdfCombine
  // Options of formats that are not selected cannot change the result.
  if (!usesTarget(settings, "ico")) delete rest.icoSizes
  if (!usesTarget(settings, "gif")) {
    delete rest.gifColours
    delete rest.dithering
  }
  if (!usesTarget(settings, "pdf")) {
    delete rest.pdfPage
    delete rest.pdfDpi
    delete rest.pdfMargin
  }
  if (settings.multi) delete rest.target
  else delete rest.targets
  return JSON.stringify(rest)
}

/** Whether "same format as the source" is selected, for an honest note in the UI. */
export function sameAsSource(target: Target, source: InputFormat | undefined) {
  return source !== undefined && (source as string) === target
}
