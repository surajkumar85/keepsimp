/**
 * The image resizer's settings in groups, and each group in a few words,
 * for the settings card: a folded group still says what will be done.
 */
import { outputFormats } from "@/lib/image-compressor/formats"
import { sentence, turnSaid } from "@/lib/image-compressor/summary"
import { differs, line, type Groups } from "@/lib/settings-groups"
import { anchorOf, anchors } from "./focus"
import { findPreset } from "./presets"
import {
  usesBox,
  type Background,
  type FormatChoice,
  type KernelChoice,
  type QualityChoice,
  type ResizerSettings,
} from "./settings"
import type { Sharpen } from "./sharpen"
import type { FitMode } from "./sizing"
import { widthSet } from "./srcset"
import { isPhysical, unitLabels } from "./units"

export type ResizerGroup =
  "size" | "fit" | "turn" | "output" | "names" | "sizes" | "advanced"

export const RESIZER_GROUPS: Groups<ResizerSettings, ResizerGroup> = {
  size: [
    "mode",
    "width",
    "height",
    "unit",
    "dpi",
    "lock",
    "side",
    "percent",
    "megapixels",
    "presetGroup",
    "presetId",
    "enlarge",
  ],
  fit: ["fit", "focusMode", "focus", "background", "backgroundColor"],
  turn: ["rotation", "flipX", "flipY"],
  output: ["format", "quality", "customQuality"],
  // The print resolution is written into files only when it is not part of the size.
  names: ["pattern", "embedDpi", "dpi"],
  sizes: ["multi", "widths", "customWidths"],
  advanced: ["kernel", "sharpen", "multiple"],
}

/** Sizes typed with a unit: dimensions, a width or a height. */
const typed = (settings: ResizerSettings) =>
  settings.mode === "dimensions" ||
  settings.mode === "width" ||
  settings.mode === "height"

/** The size is given in inches or centimetres, so the print resolution is part of it. */
export const printSized = (settings: ResizerSettings) =>
  typed(settings) && isPhysical(settings.unit)

/**
 * A group's settings as they act: a value the chosen options never read
 * (the height when resizing by width, the padding when cropping) is taken
 * from `usual`, so it never counts as a change.
 */
function inUse(
  group: ResizerGroup,
  settings: ResizerSettings,
  usual: ResizerSettings
): ResizerSettings {
  const next = { ...settings }
  const keep = (...keys: (keyof ResizerSettings)[]) => {
    for (const key of keys) Object.assign(next, { [key]: usual[key] })
  }
  const { mode } = settings
  if (group === "size") {
    if (!typed(settings)) keep("unit", "width", "height")
    if (mode === "width") keep("height")
    if (mode === "height") keep("width")
    if (mode !== "dimensions") keep("lock")
    if (!printSized(settings)) keep("dpi")
    if (mode !== "longest" && mode !== "shortest") keep("side")
    if (mode !== "percent") keep("percent")
    if (mode !== "megapixels") keep("megapixels")
    if (mode !== "preset") keep("presetGroup", "presetId")
  }
  if (group === "fit") {
    if (!usesBox(settings)) keep(...RESIZER_GROUPS.fit)
    if (settings.fit !== "cover") keep("focusMode")
    if (
      settings.fit !== "contain" &&
      !(settings.fit === "cover" && settings.focusMode === "manual")
    )
      keep("focus")
    if (settings.fit !== "contain") keep("background")
    if (settings.fit !== "contain" || settings.background !== "custom")
      keep("backgroundColor")
  }
  if (group === "output" && settings.quality !== "custom") keep("customQuality")
  if (group === "names") {
    if (printSized(settings)) keep("embedDpi")
    if (printSized(settings) || !settings.embedDpi) keep("dpi")
  }
  if (group === "sizes" && !settings.multi) keep("widths", "customWidths")
  return next
}

/** Whether a group differs from the usual in a way that changes the files. */
export function resizerChanged(
  group: ResizerGroup,
  settings: ResizerSettings,
  usual: ResizerSettings
) {
  return differs(inUse(group, settings, usual), usual, RESIZER_GROUPS[group])
}

/** How many groups differ from the usual, for the card's head. */
export function resizerChanges(
  settings: ResizerSettings,
  usual: ResizerSettings
) {
  return (Object.keys(RESIZER_GROUPS) as ResizerGroup[]).filter((group) =>
    resizerChanged(group, settings, usual)
  ).length
}

const FITS: Record<FitMode, string> = {
  cover: "Crop to fill",
  contain: "Fit with padding",
  inside: "Fit inside",
  outside: "Cover at least",
  stretch: "Stretch",
}

const PADDING: Record<Exclude<Background, "custom">, string> = {
  white: "white padding",
  black: "black padding",
  transparent: "transparent padding",
  blur: "blurred padding",
}

const FORMATS: Record<FormatChoice, string> = {
  original: "Same as original",
  webp: outputFormats.webp.label,
  avif: outputFormats.avif.label,
  jpeg: outputFormats.jpeg.label,
  png: outputFormats.png.label,
}

const QUALITIES: Record<Exclude<QualityChoice, "custom">, string> = {
  balanced: "balanced quality",
  high: "high quality",
  small: "small file",
  lossless: "lossless",
}

const KERNELS: Record<KernelChoice, string> = {
  auto: "Auto resampling",
  lanczos3: "Lanczos",
  magicKernelSharp2021: "Magic Kernel Sharp",
  mitchell: "Mitchell",
  catrom: "Catmull-Rom",
  triangle: "Bilinear",
  nearest: "Nearest (pixel art)",
}

const SHARPENING: Record<Sharpen, string> = {
  off: "no sharpening",
  light: "light sharpening",
  medium: "medium sharpening",
  strong: "strong sharpening",
}

const MULTIPLES = { 1: "exact sizes", 2: "even sizes", 8: "multiples of 8" }

function sizeSaid(settings: ResizerSettings) {
  const unit = unitLabels[settings.unit]
  const width = settings.width.trim()
  const height = settings.height.trim()
  switch (settings.mode) {
    case "dimensions":
      return width && height
        ? `${width} × ${height} ${unit}`
        : width
          ? `${width} ${unit} wide`
          : height
            ? `${height} ${unit} high`
            : "No size yet"
    case "width":
      return `${width || "?"} ${unit} wide`
    case "height":
      return `${height || "?"} ${unit} high`
    case "longest":
      return `Longest side ${settings.side.trim() || "?"} px`
    case "shortest":
      return `Shortest side ${settings.side.trim() || "?"} px`
    case "percent":
      return `${settings.percent.trim() || "?"}% of each image`
    case "megapixels":
      return `${settings.megapixels.trim() || "?"} megapixels`
    case "preset": {
      const preset = findPreset(settings.presetId)
      return preset
        ? `${preset.label}, ${preset.width} × ${preset.height} px`
        : "No preset chosen"
    }
  }
}

/** What a group of the resizer's settings is, in a line. */
export function resizerSummary(
  group: ResizerGroup,
  settings: ResizerSettings
): string {
  switch (group) {
    case "size":
      return line(
        sizeSaid(settings),
        printSized(settings) && `${settings.dpi} DPI`,
        !settings.enlarge && "never enlarged"
      )
    case "fit": {
      const anchor = anchorOf(settings.focus)
      const place = anchor
        ? anchors.find((item) => item.id === anchor)!.label.toLowerCase()
        : "a chosen spot"
      return line(
        FITS[settings.fit],
        settings.fit === "cover" &&
          (settings.focusMode === "smart" ? "smart focus" : `keeps ${place}`),
        settings.fit === "contain" &&
          (settings.background === "custom"
            ? `${settings.backgroundColor} padding`
            : PADDING[settings.background])
      )
    }
    case "turn":
      return (
        sentence(turnSaid(settings.rotation, settings.flipX, settings.flipY)) ||
        "As it is"
      )
    case "output":
      return line(
        FORMATS[settings.format],
        settings.quality === "custom"
          ? `quality ${settings.customQuality}`
          : QUALITIES[settings.quality]
      )
    case "names":
      return line(
        settings.pattern.trim() || "Original names",
        !printSized(settings) &&
          settings.embedDpi &&
          `${settings.dpi} DPI saved`
      )
    case "sizes": {
      if (!settings.multi) return "One size"
      const widths = widthSet(settings.widths, settings.customWidths)
      return widths.length
        ? `${widths.length} ${widths.length === 1 ? "width" : "widths"}: ${widths.join(", ")} px`
        : "No widths chosen"
    }
    case "advanced":
      return line(
        KERNELS[settings.kernel],
        SHARPENING[settings.sharpen],
        MULTIPLES[settings.multiple]
      )
  }
}
