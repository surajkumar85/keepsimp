import {
  outputFormats,
  type InputFormat,
  type OutputFormat,
} from "@/lib/image-compressor/formats"
import {
  orientedSize,
  rotate,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"
import { parseHexColor } from "@/lib/image-compressor/pixels"
import type { CompressionPreset } from "@/lib/image-compressor/quality"
import { originalOutput } from "@/lib/image-compressor/settings"
import { CENTER, orientFocus, type Focus } from "./focus"
import { DEFAULT_PATTERN } from "./naming"
import { findPreset, type Preset, type PresetGroup } from "./presets"
import { sharpenAmounts, type Sharpen } from "./sharpen"
import {
  resolveLayout,
  scaleTarget,
  type FitMode,
  type Layout,
  type SizeMode,
  type SizeTarget,
} from "./sizing"
import { widthSet } from "./srcset"
import {
  formatValue,
  fromPixels,
  isPhysical,
  toPixels,
  type Multiple,
  type Unit,
} from "./units"

export type Kernel =
  | "lanczos3"
  | "magicKernelSharp2021"
  | "mitchell"
  | "catrom"
  | "triangle"
  | "nearest"
export type KernelChoice = "auto" | Kernel
export type Background = "transparent" | "white" | "black" | "custom" | "blur"
export type QualityChoice =
  "balanced" | "high" | "small" | "lossless" | "custom"
export type FormatChoice = "original" | OutputFormat

export const MAX_BATCH = 50

export interface ResizerSettings {
  mode: SizeMode
  width: string
  height: string
  unit: Unit
  dpi: number
  lock: boolean
  side: string
  percent: string
  megapixels: string
  presetGroup: PresetGroup
  presetId: string
  fit: FitMode
  enlarge: boolean
  focusMode: "manual" | "smart"
  focus: Focus
  background: Background
  backgroundColor: string
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  format: FormatChoice
  quality: QualityChoice
  customQuality: number
  pattern: string
  embedDpi: boolean
  multi: boolean
  widths: number[]
  customWidths: string
  kernel: KernelChoice
  sharpen: Sharpen
  multiple: Multiple
}

export const DEFAULT_BACKGROUND = "#ffffff"

export const defaultSettings: ResizerSettings = {
  mode: "dimensions",
  width: "1200",
  height: "",
  unit: "px",
  dpi: 300,
  lock: true,
  side: "1920",
  percent: "50",
  megapixels: "2",
  presetGroup: "social",
  presetId: "instagram-square",
  fit: "cover",
  enlarge: true,
  focusMode: "manual",
  focus: CENTER,
  background: "white",
  backgroundColor: DEFAULT_BACKGROUND,
  rotation: 0,
  flipX: false,
  flipY: false,
  format: "original",
  quality: "balanced",
  customQuality: 80,
  pattern: DEFAULT_PATTERN,
  embedDpi: false,
  multi: false,
  widths: [640, 1280, 1920],
  customWidths: "",
  kernel: "auto",
  sharpen: "off",
  multiple: 1,
}

function parse(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isFinite(number) ? number : NaN
}

/** True when the mode defines both sides, so fit, focus and padding apply. */
export function usesBox(settings: ResizerSettings) {
  if (settings.mode === "preset") return true
  return (
    settings.mode === "dimensions" &&
    settings.width.trim() !== "" &&
    settings.height.trim() !== ""
  )
}

/** Translate what the visitor typed into a size target for one image. */
export function sizeTarget(
  settings: ResizerSettings,
  source: Size
): SizeTarget {
  const pixels = (value: string, base: number, label: string) => {
    const number = parse(value)
    if (number === null) return null
    if (Number.isNaN(number) || number <= 0)
      throw new Error(`Enter a ${label} above zero.`)
    return toPixels(number, settings.unit, settings.dpi, base)
  }
  const plain = (value: string, label: string) => {
    const number = parse(value)
    if (number === null || Number.isNaN(number) || number <= 0)
      throw new Error(`Enter ${label} above zero.`)
    return number
  }
  switch (settings.mode) {
    case "preset": {
      const preset = findPreset(settings.presetId)
      if (!preset) throw new Error("Choose a preset.")
      return {
        kind: "box",
        width: preset.width,
        height: preset.height,
        fit: settings.fit,
      }
    }
    case "dimensions": {
      const width = pixels(settings.width, source.width, "width")
      const height = pixels(settings.height, source.height, "height")
      if (width === null && height === null)
        throw new Error("Enter a width or a height.")
      if (width !== null && height !== null)
        return { kind: "box", width, height, fit: settings.fit }
      return width !== null
        ? { kind: "width", pixels: width }
        : { kind: "height", pixels: height! }
    }
    case "width":
      return {
        kind: "width",
        pixels: pixels(settings.width, source.width, "width") ?? NaN,
      }
    case "height":
      return {
        kind: "height",
        pixels: pixels(settings.height, source.height, "height") ?? NaN,
      }
    case "longest":
    case "shortest":
      return { kind: settings.mode, pixels: plain(settings.side, "a size") }
    case "percent":
      return {
        kind: "percent",
        percent: plain(settings.percent, "a percentage"),
      }
    case "megapixels":
      return {
        kind: "megapixels",
        megapixels: plain(settings.megapixels, "megapixels"),
      }
  }
}

export function resolveKernel(choice: KernelChoice, layout: Layout): Kernel {
  if (choice !== "auto") return choice
  return layout.enlarged ? "mitchell" : "lanczos3"
}

export interface OutputPlan {
  layout: Layout
  kernel: Kernel
  /** Unsharp amount; zero unless the image is being reduced. */
  sharpen: number
}

/**
 * Every output for one image: a single size, or one per width in a responsive
 * set. Identical sizes (for example when enlarging is off) are produced once.
 */
export function planOutputs(
  settings: ResizerSettings,
  image: { size: Size; focus: Focus }
): { plans: OutputPlan[]; error: string | null } {
  try {
    const source = orientedSize(image.size, settings.rotation)
    const base = sizeTarget(settings, source)
    const targets = settings.multi
      ? widthSet(settings.widths, settings.customWidths).map((width) =>
          scaleTarget(base, width)
        )
      : [base]
    if (!targets.length)
      throw new Error("Choose at least one width for the set.")
    const seen = new Set<string>()
    const plans: OutputPlan[] = []
    for (const target of targets) {
      const layout = resolveLayout(source, target, {
        enlarge: settings.enlarge,
        multiple: settings.multiple,
        focus: image.focus,
      })
      const key = `${layout.output.width}x${layout.output.height}`
      if (seen.has(key)) continue
      seen.add(key)
      plans.push({
        layout,
        kernel: resolveKernel(settings.kernel, layout),
        sharpen: layout.scale < 1 ? sharpenAmounts[settings.sharpen] : 0,
      })
    }
    return { plans, error: null }
  } catch (error) {
    return { plans: [], error: (error as Error).message }
  }
}

/** Shape (width ÷ height) of the crop a "crop to fill" box takes from an image. */
export function cropAspect(settings: ResizerSettings, source: Size) {
  if (!usesBox(settings) || settings.fit !== "cover") return null
  try {
    // `usesBox` guarantees both sides are set, so the target is always a box.
    const target = sizeTarget(
      settings,
      orientedSize(source, settings.rotation)
    ) as Extract<SizeTarget, { kind: "box" }>
    return target.width / target.height
  } catch {
    return null
  }
}

export type Backdrop =
  | { kind: "transparent" }
  | { kind: "blur" }
  | { kind: "colour"; rgb: [number, number, number] }

export function backdrop(settings: ResizerSettings): Backdrop {
  if (settings.background === "transparent") return { kind: "transparent" }
  if (settings.background === "blur") return { kind: "blur" }
  return { kind: "colour", rgb: matte(settings) }
}

/** Solid colour behind transparent pixels when the format has no alpha channel. */
export function matte(settings: ResizerSettings): [number, number, number] {
  if (settings.background === "black") return [0, 0, 0]
  if (settings.background === "custom")
    return parseHexColor(settings.backgroundColor) ?? [255, 255, 255]
  return [255, 255, 255]
}

export function resolveFormat(
  settings: ResizerSettings,
  input: InputFormat,
  transparent: boolean
): OutputFormat {
  return settings.format === "original"
    ? originalOutput(input, transparent)
    : settings.format
}

export function losslessAllowed(format: OutputFormat) {
  return outputFormats[format].lossless
}

/** Map the resizer's quality chips onto the compressor's presets. */
export function compression(
  settings: ResizerSettings,
  format: OutputFormat
): { preset: CompressionPreset; quality: number } {
  const preset: CompressionPreset =
    settings.quality === "balanced"
      ? "smart"
      : settings.quality === "small"
        ? "smallest"
        : settings.quality === "lossless" && !losslessAllowed(format)
          ? "high"
          : settings.quality
  return { preset, quality: settings.customQuality }
}

/** Density to embed: on request, and always for sizes given in physical units or print presets. */
export function embeddedDpi(settings: ResizerSettings) {
  const printPreset =
    settings.mode === "preset" && findPreset(settings.presetId)?.dpi
  if (printPreset) return printPreset
  const physical =
    (settings.mode === "dimensions" ||
      settings.mode === "width" ||
      settings.mode === "height") &&
    isPhysical(settings.unit)
  return settings.embedDpi || physical ? settings.dpi : null
}

/** Keep width and height in proportion to a reference image while the lock is on. */
export function linkDimension(
  settings: ResizerSettings,
  reference: Size,
  edited: "width" | "height",
  value: string
): ResizerSettings {
  const next = { ...settings, [edited]: value }
  const number = parse(value)
  if (!settings.lock || number === null || Number.isNaN(number) || number <= 0)
    return next
  if (settings.unit === "percent")
    return { ...next, width: value, height: value }
  const base = edited === "width" ? reference.width : reference.height
  const other = edited === "width" ? reference.height : reference.width
  const pixels =
    (toPixels(number, settings.unit, settings.dpi, base) * other) / base
  const linked = formatValue(
    fromPixels(pixels, settings.unit, settings.dpi, other),
    settings.unit
  )
  return edited === "width"
    ? { ...next, height: linked }
    : { ...next, width: linked }
}

/** Convert the typed width and height when the unit changes, keeping the pixel size. */
export function changeUnit(
  settings: ResizerSettings,
  reference: Size,
  unit: Unit
): ResizerSettings {
  const convert = (value: string, base: number) => {
    const number = parse(value)
    if (number === null || Number.isNaN(number)) return value
    return formatValue(
      fromPixels(
        toPixels(number, settings.unit, settings.dpi, base),
        unit,
        settings.dpi,
        base
      ),
      unit
    )
  }
  return {
    ...settings,
    unit,
    width: convert(settings.width, reference.width),
    height: convert(settings.height, reference.height),
  }
}

export function swapSides(settings: ResizerSettings): ResizerSettings {
  return { ...settings, width: settings.height, height: settings.width }
}

export function applyPreset(
  settings: ResizerSettings,
  preset: Preset
): ResizerSettings {
  return {
    ...settings,
    mode: "preset",
    presetGroup: preset.group,
    presetId: preset.id,
    dpi: preset.dpi ?? settings.dpi,
  }
}

/** Everything that changes output pixels or bytes; file naming is applied afterwards. */
export function processingKey(settings: ResizerSettings, focus: Focus | null) {
  const rest: Partial<ResizerSettings> = { ...settings }
  delete rest.pattern
  delete rest.presetGroup
  delete rest.lock
  // `override` is one image's own focus; the shared focus is already in `rest`.
  return JSON.stringify({ ...rest, override: focus })
}

/**
 * Turn the visible image. Rotation is applied before flips, so with a single
 * flip active the stored rotation has to go the other way.
 */
export function rotateView(
  settings: ResizerSettings,
  direction: "left" | "right"
): ResizerSettings {
  const mirrored = settings.flipX !== settings.flipY
  const internal = mirrored
    ? direction === "left"
      ? "right"
      : "left"
    : direction
  return {
    ...settings,
    rotation: rotate(settings.rotation, internal),
    focus: orientFocus(
      settings.focus,
      direction === "right" ? 90 : 270,
      false,
      false
    ),
  }
}

export function flipView(
  settings: ResizerSettings,
  axis: "x" | "y"
): ResizerSettings {
  return {
    ...settings,
    flipX: axis === "x" ? !settings.flipX : settings.flipX,
    flipY: axis === "y" ? !settings.flipY : settings.flipY,
    focus: orientFocus(settings.focus, 0, axis === "x", axis === "y"),
  }
}
