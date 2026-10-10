import { parseHexColor } from "@/lib/image-compressor/pixels"
import {
  orientedSize,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"
import { unknownTokens } from "@/lib/image-resizer/naming"

export type Target = "gif" | "webp" | "apng"
export type QualityChoice =
  "balanced" | "high" | "small" | "lossless" | "custom"
export type ResizeChoice =
  "original" | "width" | "height" | "percent" | "longEdge"
export type LoopChoice = "forever" | "once" | "count"
export type BackgroundChoice = "keep" | "white" | "black" | "custom"

export const targets: Record<
  Target,
  {
    label: string
    extension: string
    mime: string
    /** Whether a lossless result is possible. */
    lossless: boolean
    hint: string
  }
> = {
  gif: {
    label: "GIF",
    extension: "gif",
    mime: "image/gif",
    lossless: false,
    hint: "Plays everywhere, including chat apps and email. 256 colours, so files are large.",
  },
  webp: {
    label: "WebP",
    extension: "webp",
    mime: "image/webp",
    lossless: true,
    hint: "Much smaller than GIF with full colour and transparency. Plays in every current browser.",
  },
  apng: {
    label: "APNG",
    extension: "png",
    // The plain PNG type: with "image/apng" some browsers rename the download to .apng.
    mime: "image/png",
    lossless: true,
    hint: "Animated PNG: full colour and smooth transparency. Larger than WebP; shows its first frame where animation is not supported.",
  },
}
export const targetOrder: Target[] = ["gif", "webp", "apng"]

export const MAX_FILES = 20
export const MAX_FILE_BYTES = 100 * 1024 * 1024
export const MAX_FRAMES = 3000
/** Longest side of a result, in pixels. */
export const MAX_EDGE = 1920
/** Most pixels held at once across the frames of one result (about 380 MB). */
export const FRAME_BUDGET = 96_000_000
/** gifski takes every frame in one block and copies it, so it gets a smaller share. */
export const BEST_BUDGET = 32_000_000
export const DEFAULT_PATTERN = "{name}"
export const DEFAULT_BACKGROUND = "#ffffff"
export const speedChoices = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const
export const fpsChoices = [10, 12, 15, 20, 24, 30] as const

export interface AnimationSettings {
  target: Target
  quality: QualityChoice
  /** 1–100, for WebP and for gifski when quality is Custom. */
  customQuality: number
  /** "best" uses gifski; "fast" uses KeepSimp's own GIF encoder. */
  gifEngine: "fast" | "best"
  /** 2–256, for GIF and APNG when quality is Custom. */
  colours: number
  dithering: boolean
  speed: number
  /** Most frames per second; null keeps every frame. */
  fps: number | null
  reverse: boolean
  boomerang: boolean
  loop: LoopChoice
  /** Times to play when loop is "count". */
  loopCount: number
  resize: ResizeChoice
  /** Pixels, or percent when resize is "percent". */
  resizeValue: number
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  background: BackgroundChoice
  backgroundColor: string
  pattern: string
}

/** The part of one animation to keep, in milliseconds of the original. */
export interface Trim {
  start: number
  end: number | null
}

export const defaultSettings: AnimationSettings = {
  target: "webp",
  quality: "balanced",
  customQuality: 75,
  gifEngine: "fast",
  colours: 128,
  dithering: true,
  speed: 1,
  fps: null,
  reverse: false,
  boomerang: false,
  loop: "forever",
  loopCount: 3,
  resize: "original",
  resizeValue: 480,
  rotation: 0,
  flipX: false,
  flipY: false,
  background: "keep",
  backgroundColor: DEFAULT_BACKGROUND,
  pattern: DEFAULT_PATTERN,
}

export const noTrim: Trim = { start: 0, end: null }

/** Times the result plays; 0 means forever. */
export function playsFor(settings: AnimationSettings) {
  return settings.loop === "forever"
    ? 0
    : settings.loop === "once"
      ? 1
      : settings.loopCount
}

/** The colour that replaces transparency, or null to keep it. */
export function matte(
  settings: AnimationSettings
): [number, number, number] | null {
  if (settings.background === "keep") return null
  if (settings.background === "black") return [0, 0, 0]
  if (settings.background === "white") return [255, 255, 255]
  return parseHexColor(settings.backgroundColor) ?? [255, 255, 255]
}

/** The size of the result for a source of a given size. */
export function outputSize(source: Size, settings: AnimationSettings): Size {
  const oriented = orientedSize(source, settings.rotation)
  const value = settings.resizeValue
  const scale =
    settings.resize === "width"
      ? value / oriented.width
      : settings.resize === "height"
        ? value / oriented.height
        : settings.resize === "percent"
          ? value / 100
          : settings.resize === "longEdge"
            ? value / Math.max(oriented.width, oriented.height)
            : 1
  // Whatever was asked for, the result fits the largest size the tool writes.
  const limit = Math.min(
    scale,
    MAX_EDGE / Math.max(oriented.width, oriented.height)
  )
  return {
    width: Math.max(1, Math.round(oriented.width * limit)),
    height: Math.max(1, Math.round(oriented.height * limit)),
  }
}

export type EncodePlan =
  | {
      kind: "gif"
      colours: number
      dithering: boolean
      tolerance: number
    }
  | { kind: "gifski"; quality: number }
  | {
      kind: "webp"
      quality: number
      lossless: boolean
      /** Try lossless too and keep whichever is smaller; flat artwork often is. */
      mixed: boolean
      tolerance: number
    }
  | { kind: "apng-exact" }
  | {
      kind: "apng-indexed"
      colours: number
      dithering: boolean
      tolerance: number
    }

/** Turn the quality choice into what each encoder needs. */
export function encodePlan(settings: AnimationSettings): EncodePlan {
  const { quality, target } = settings
  if (target === "webp") {
    if (quality === "lossless")
      return {
        kind: "webp",
        quality: 100,
        lossless: true,
        mixed: false,
        tolerance: 0,
      }
    return {
      kind: "webp",
      lossless: false,
      mixed: quality === "balanced" || quality === "high",
      quality:
        quality === "high"
          ? 90
          : quality === "small"
            ? 50
            : quality === "custom"
              ? settings.customQuality
              : 75,
      tolerance: 3,
    }
  }
  if (target === "apng") {
    if (quality === "lossless" || quality === "high")
      return { kind: "apng-exact" }
    return {
      kind: "apng-indexed",
      colours:
        quality === "small"
          ? 64
          : quality === "custom"
            ? settings.colours
            : 256,
      dithering: quality === "small" ? false : settings.dithering,
      tolerance: quality === "small" ? 8 : 3,
    }
  }
  // GIF has no lossless form; Lossless means its best.
  const level = quality === "lossless" ? "high" : quality
  if (settings.gifEngine === "best")
    return {
      kind: "gifski",
      quality:
        level === "high"
          ? 100
          : level === "small"
            ? 60
            : level === "custom"
              ? settings.customQuality
              : 85,
    }
  return {
    kind: "gif",
    colours:
      level === "high"
        ? 256
        : level === "small"
          ? 64
          : level === "custom"
            ? settings.colours
            : 128,
    dithering: level === "small" ? false : settings.dithering,
    tolerance: level === "high" ? 2 : level === "small" ? 10 : 4,
  }
}

/** Whether the Lossless choice means exactly that for the chosen format. */
export function losslessApplies(settings: AnimationSettings) {
  return targets[settings.target].lossless
}

/** The first thing wrong with the settings, in words for the page; null when they are fine. */
export function settingsProblem(settings: AnimationSettings): string | null {
  const whole = (value: number) => Number.isInteger(value)
  if (settings.loop === "count") {
    if (!whole(settings.loopCount) || settings.loopCount < 2)
      return "Enter how many times to play, 2 or more."
    if (settings.loopCount > 1000) return "Play at most 1,000 times."
  }
  if (settings.fps !== null && !(settings.fps >= 1 && settings.fps <= 60))
    return "Enter a frame rate from 1 to 60."
  if (!(settings.speed >= 0.1 && settings.speed <= 10))
    return "Enter a speed from 0.1× to 10×."
  if (settings.resize === "percent") {
    if (!(settings.resizeValue >= 1 && settings.resizeValue <= 400))
      return "Enter a size from 1% to 400%."
  } else if (settings.resize !== "original") {
    if (!whole(settings.resizeValue) || settings.resizeValue < 1)
      return "Enter a size in whole pixels."
    if (settings.resizeValue > MAX_EDGE)
      return `Enter a size up to ${MAX_EDGE.toLocaleString("en")} pixels.`
  }
  if (settings.quality === "custom") {
    const numeric = settings.target === "webp" || settings.gifEngine === "best"
    if (settings.target !== "apng" && numeric) {
      if (!(settings.customQuality >= 1 && settings.customQuality <= 100))
        return "Enter a quality from 1 to 100."
    } else if (
      !whole(settings.colours) ||
      settings.colours < 2 ||
      settings.colours > 256
    )
      return "Enter 2 to 256 colours."
  }
  if (
    settings.background === "custom" &&
    !parseHexColor(settings.backgroundColor)
  )
    return "Enter the background as a hex colour, such as #ffffff."
  const unknown = unknownTokens(settings.pattern)
  if (unknown.length)
    return `The file name has a part we do not know: {${unknown[0]}}.`
  return null
}

/** Whether the frames of a result fit in memory, in words for the page. */
export function budgetProblem(
  frames: number,
  size: Size,
  settings: AnimationSettings
): string | null {
  const pixels = frames * size.width * size.height
  if (pixels <= FRAME_BUDGET) return null
  return `${frames.toLocaleString("en")} frames at ${size.width} × ${size.height} is more than this tool can hold at once. ${
    settings.fps
      ? "Trim it or make it smaller."
      : "Trim it, lower the frame rate or make it smaller."
  }`
}

/** Whether gifski can take this many pixels; larger results use the fast encoder. */
export function bestFits(frames: number, size: Size) {
  return frames >= 2 && frames * size.width * size.height <= BEST_BUDGET
}

/** Everything that changes the bytes of a result. File names are applied afterwards. */
export function processingKey(settings: AnimationSettings, trim: Trim) {
  const { pattern, ...rest } = settings
  void pattern
  return JSON.stringify({ ...rest, trim })
}
