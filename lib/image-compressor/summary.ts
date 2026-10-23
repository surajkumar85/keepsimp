/**
 * The image compressor's settings in groups, and each group in a few words,
 * for the settings card: a folded group still says what will be done.
 */
import { differs, line, type Groups } from "@/lib/settings-groups"
import { outputFormats } from "./formats"
import type { Rotation } from "./geometry"
import type { CompressionPreset, Effort } from "./quality"
import type { CompressorSettings, FormatChoice, Resample } from "./settings"

export type CompressorGroup =
  "format" | "compression" | "size" | "crop" | "advanced"

export const COMPRESSOR_GROUPS: Groups<CompressorSettings, CompressorGroup> = {
  format: ["format"],
  compression: [
    "compression",
    "quality",
    "targetSize",
    "targetUnit",
    "allowDownscale",
  ],
  size: [
    "size",
    "longEdge",
    "customWidth",
    "customHeight",
    "unit",
    "lock",
    "fit",
  ],
  crop: ["aspect", "crop", "rotation", "flipX", "flipY"],
  advanced: [
    "effort",
    "resample",
    "background",
    "backgroundColor",
    "chroma444",
    "progressive",
    "pngColors",
    "dithering",
  ],
}

/** Capitals the first letter, for a line that starts with a lower-case part. */
export const sentence = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

const TURNS: Record<Rotation, string> = {
  0: "",
  90: "turned 90° right",
  180: "turned 180°",
  270: "turned 90° left",
}

/** A turn and its flips in words, or an empty string when there are none. */
export function turnSaid(rotation: Rotation, flipX: boolean, flipY: boolean) {
  return line(
    TURNS[rotation],
    flipX && flipY
      ? "flipped both ways"
      : flipX
        ? "flipped horizontally"
        : flipY && "flipped vertically"
  )
}

const FORMATS: Record<FormatChoice, string> = {
  original: "Same as original",
  auto: "Auto (smallest)",
  webp: outputFormats.webp.label,
  avif: outputFormats.avif.label,
  jpeg: outputFormats.jpeg.label,
  png: outputFormats.png.label,
}

const PRESETS: Record<
  Exclude<CompressionPreset, "custom" | "target">,
  string
> = {
  smart: "Smart",
  smallest: "Smallest",
  high: "High quality",
  lossless: "Lossless",
}

const EFFORTS: Record<Effort, string> = {
  fast: "Fast",
  balanced: "Balanced",
  max: "Maximum",
}

const RESAMPLING: Record<Resample, string> = {
  lanczos3: "Lanczos",
  mitchell: "Mitchell",
  catrom: "Catmull-Rom",
}

const FITS: Record<CompressorSettings["fit"], string> = {
  contain: "fit inside",
  cover: "filled and cropped",
  stretch: "stretched",
}

/**
 * The settings as they act: a value the chosen options never read (the
 * quality slider when Smart is on, the long edge at the original size) is
 * taken from `usual`, so it never counts as a change.
 */
function inUse(
  settings: CompressorSettings,
  usual: CompressorSettings
): CompressorSettings {
  const next = { ...settings }
  if (settings.compression !== "custom") next.quality = usual.quality
  if (settings.compression !== "target") {
    next.targetSize = usual.targetSize
    next.targetUnit = usual.targetUnit
    next.allowDownscale = usual.allowDownscale
  }
  if (settings.size !== "long-edge") next.longEdge = usual.longEdge
  if (settings.size !== "custom") {
    next.customWidth = usual.customWidth
    next.customHeight = usual.customHeight
    next.unit = usual.unit
    next.lock = usual.lock
  }
  if (settings.size !== "custom" || settings.lock) next.fit = usual.fit
  if (settings.background !== "custom")
    next.backgroundColor = usual.backgroundColor
  return next
}

/** Whether a group differs from the usual in a way that changes the file. */
export function compressorChanged(
  group: CompressorGroup,
  settings: CompressorSettings,
  usual: CompressorSettings
) {
  return differs(inUse(settings, usual), usual, COMPRESSOR_GROUPS[group])
}

/** How many groups differ from the usual, for the card's head. */
export function compressorChanges(
  settings: CompressorSettings,
  usual: CompressorSettings
) {
  return (Object.keys(COMPRESSOR_GROUPS) as CompressorGroup[]).filter((group) =>
    compressorChanged(group, settings, usual)
  ).length
}

/** What a group of the compressor's settings is, in a line. */
export function compressorSummary(
  group: CompressorGroup,
  settings: CompressorSettings
): string {
  switch (group) {
    case "format":
      return FORMATS[settings.format]
    case "compression": {
      if (settings.compression === "custom")
        return `Quality ${settings.quality}`
      if (settings.compression !== "target")
        return PRESETS[settings.compression]
      const target = settings.targetSize.trim()
      return target
        ? line(
            `At most ${target} ${settings.targetUnit}`,
            settings.allowDownscale && "may shrink to fit"
          )
        : "No target size yet"
    }
    case "size": {
      if (settings.size === "original") return "Original size"
      if (settings.size === "long-edge")
        return `Long edge ${settings.longEdge} px`
      if (settings.size !== "custom") return `${settings.size}% of the original`
      const width = settings.customWidth.trim() || "auto"
      const height = settings.customHeight.trim() || "auto"
      return line(
        settings.unit === "px"
          ? `${width} × ${height} px`
          : settings.lock
            ? `${width}% of the original`
            : `${width}% × ${height}%`,
        !settings.lock && FITS[settings.fit]
      )
    }
    case "crop":
      return (
        sentence(
          line(
            settings.crop &&
              `cropped to ${settings.crop.width} × ${settings.crop.height} px`,
            turnSaid(settings.rotation, settings.flipX, settings.flipY)
          )
        ) || "No crop or turn"
      )
    case "advanced":
      return line(
        `${EFFORTS[settings.effort]} effort`,
        RESAMPLING[settings.resample],
        settings.chroma444 && "full colour detail",
        !settings.progressive && "baseline JPEG",
        settings.pngColors !== 256 && `${settings.pngColors} PNG colours`,
        !settings.dithering && "no dithering",
        settings.background === "black"
          ? "black behind transparency"
          : settings.background === "custom" &&
              `${settings.backgroundColor} behind transparency`
      )
  }
}
