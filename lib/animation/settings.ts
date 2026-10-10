import { parseHexColor } from "@/lib/image-compressor/pixels"
import {
  orientedSize,
  type Rect,
  type Rotation,
  type Size,
} from "@/lib/image-compressor/geometry"
import { unknownTokens } from "@/lib/image-resizer/naming"
import type { CaptionSize, Corner, Filter } from "./effects"

export type Target =
  "gif" | "webp" | "apng" | "mp4" | "webm" | "frames" | "sprite"
/** Still-image formats for exported frames and sprite sheets. */
export type FrameFormat = "png" | "webp" | "jpeg"
export type QualityChoice =
  "balanced" | "high" | "small" | "lossless" | "custom"
export type ResizeChoice =
  "original" | "width" | "height" | "percent" | "longEdge" | "exact"
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
    /** An animated image, a video file, or a ZIP of still images. */
    kind: "animation" | "video" | "bundle"
    hint: string
  }
> = {
  gif: {
    label: "GIF",
    extension: "gif",
    mime: "image/gif",
    lossless: false,
    kind: "animation",
    hint: "Plays everywhere, including chat apps and email. 256 colours, so files are large.",
  },
  webp: {
    label: "WebP",
    extension: "webp",
    mime: "image/webp",
    lossless: true,
    kind: "animation",
    hint: "Much smaller than GIF with full colour and transparency. Plays in every current browser.",
  },
  apng: {
    label: "APNG",
    extension: "png",
    // The plain PNG type: with "image/apng" some browsers rename the download to .apng.
    mime: "image/png",
    lossless: true,
    kind: "animation",
    hint: "Animated PNG: full colour and smooth transparency. Larger than WebP; shows its first frame where animation is not supported.",
  },
  mp4: {
    label: "MP4",
    extension: "mp4",
    mime: "video/mp4",
    lossless: false,
    kind: "video",
    hint: "Video: far smaller than any animated image for photos and screen recordings. No transparency, and it needs a video player, not an image tag.",
  },
  webm: {
    label: "WebM",
    extension: "webm",
    mime: "video/webm",
    lossless: false,
    kind: "video",
    hint: "Open video format for the web. Small files, no transparency here; older Apple devices may not play it.",
  },
  frames: {
    label: "Frames",
    extension: "zip",
    mime: "application/zip",
    lossless: true,
    kind: "bundle",
    hint: "Every frame as its own image, in a ZIP. Lower the frame rate to export fewer.",
  },
  sprite: {
    label: "Sprite sheet",
    extension: "zip",
    mime: "application/zip",
    lossless: true,
    kind: "bundle",
    hint: "All frames on one image, with CSS and JSON to play it on a web page or in a game.",
  },
}
export const targetOrder: Target[] = [
  "gif",
  "webp",
  "apng",
  "mp4",
  "webm",
  "frames",
  "sprite",
]
export const frameFormats: Record<
  FrameFormat,
  { label: string; extension: string; lossless: boolean }
> = {
  png: { label: "PNG", extension: "png", lossless: true },
  webp: { label: "WebP", extension: "webp", lossless: true },
  jpeg: { label: "JPEG", extension: "jpg", lossless: false },
}

export const MAX_FILES = 20
export const MAX_FILE_BYTES = 100 * 1024 * 1024
/** Video is read a piece at a time, so larger files are fine. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
/** Longest side of a sprite sheet; larger images fail to decode in some browsers. */
export const MAX_SHEET_EDGE = 8192
export const MAX_FRAMES = 3000
/** A video's frame times are listed up front; ten minutes at 30 frames a second. */
export const MAX_VIDEO_FRAMES = 18_000
/** Longest side of a result, in pixels. */
export const MAX_EDGE = 1920
/** Most pixels held at once across the frames of one result (about 380 MB). */
export const FRAME_BUDGET = 96_000_000
/** gifski takes every frame in one block and copies it, so it gets a smaller share. */
export const BEST_BUDGET = 32_000_000
export const DEFAULT_PATTERN = "{name}"
/** The smallest and largest file sizes the tool will try to fit. */
export const MIN_SIZE_LIMIT = 10_000
export const MAX_SIZE_LIMIT = 100_000_000
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
  /** The image format of exported frames and sprite sheets. */
  frameFormat: FrameFormat
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
  /** Pixels (the width, for an exact size), or percent when resize is "percent". */
  resizeValue: number
  /** Height in pixels when resize is "exact". */
  resizeHeight: number
  /** Whether an animation smaller than the size asked for is scaled up to it. */
  enlarge: boolean
  /** Longest result in seconds, counted from the start of the trim; null for no limit. */
  maxSeconds: number | null
  /** Largest file in bytes; the tool lowers quality, frame rate and size to fit. Null for no limit. */
  sizeLimit: number | null
  /** Set by the tool while it fits a size limit: a further scale on top of the size chosen. */
  shrink: number
  rotation: Rotation
  flipX: boolean
  flipY: boolean
  background: BackgroundChoice
  backgroundColor: string
  /** A colour filter, and brightness, contrast and saturation from -100 to 100. */
  filter: Filter
  brightness: number
  contrast: number
  saturation: number
  /** Seconds of fade at the start and the end; 0 for none. */
  fadeIn: number
  fadeOut: number
  /** Text written across the top and the bottom of every frame; empty for none. */
  captionTop: string
  captionBottom: string
  captionSize: CaptionSize
  captionColour: "white" | "black" | "custom"
  captionCustomColour: string
  captionOutline: boolean
  captionUppercase: boolean
  /** Seconds into the result at which the captions appear and disappear; null for the start and the end. */
  captionFrom: number | null
  captionUntil: number | null
  /** Where an added logo or watermark sits, how wide it is (percent of the frame) and how solid (percent). */
  overlayCorner: Corner
  overlaySize: number
  overlayOpacity: number
  pattern: string
}

/** The part of one animation to keep: in time (milliseconds of the original) and in the picture. */
export interface Trim {
  start: number
  end: number | null
  /** A rectangle of the picture as it looks after turning and flipping; absent for all of it. */
  crop?: Rect | null
}

export const defaultSettings: AnimationSettings = {
  target: "webp",
  quality: "balanced",
  customQuality: 75,
  gifEngine: "fast",
  frameFormat: "png",
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
  resizeHeight: 480,
  enlarge: true,
  maxSeconds: null,
  sizeLimit: null,
  shrink: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  background: "keep",
  backgroundColor: DEFAULT_BACKGROUND,
  filter: "none",
  brightness: 0,
  contrast: 0,
  saturation: 0,
  fadeIn: 0,
  fadeOut: 0,
  captionTop: "",
  captionBottom: "",
  captionSize: "medium",
  captionColour: "white",
  captionCustomColour: DEFAULT_BACKGROUND,
  captionOutline: true,
  captionUppercase: false,
  captionFrom: null,
  captionUntil: null,
  overlayCorner: "bottom-right",
  overlaySize: 20,
  overlayOpacity: 80,
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
  // A format without transparency is filled with white unless a colour is chosen.
  if (settings.background === "keep")
    return keepsTransparency(settings) ? null : [255, 255, 255]
  if (settings.background === "black") return [0, 0, 0]
  if (settings.background === "white") return [255, 255, 255]
  return parseHexColor(settings.backgroundColor) ?? [255, 255, 255]
}

/** Where the picture sits in the result: the whole canvas, and the picture inside it. */
export interface Layout {
  canvas: Size
  /** The picture after scaling. It is smaller than the canvas only for an exact size. */
  picture: Size
  /** Top-left corner of the picture on the canvas. */
  x: number
  y: number
}

const even = (value: number) => Math.max(2, value - (value % 2))

/**
 * Work out the size of a result and where the picture sits in it.
 * @param crop The part of the turned picture that is kept, if it was cropped.
 */
export function layoutFor(
  source: Size,
  settings: AnimationSettings,
  crop?: Size | null
): Layout {
  const kept = crop ?? orientedSize(source, settings.rotation)
  const video = targets[settings.target].kind === "video"
  if (settings.resize === "exact") {
    // An exact size is a canvas: the picture is fitted inside it and centred.
    const width = Math.min(MAX_EDGE, Math.max(1, settings.resizeValue))
    const height = Math.min(MAX_EDGE, Math.max(1, settings.resizeHeight))
    const canvas = video
      ? { width: even(width), height: even(height) }
      : { width, height }
    let scale = Math.min(canvas.width / kept.width, canvas.height / kept.height)
    if (!settings.enlarge) scale = Math.min(1, scale)
    const picture = {
      width: Math.max(
        1,
        Math.min(canvas.width, Math.round(kept.width * scale))
      ),
      height: Math.max(
        1,
        Math.min(canvas.height, Math.round(kept.height * scale))
      ),
    }
    return {
      canvas,
      picture,
      x: Math.floor((canvas.width - picture.width) / 2),
      y: Math.floor((canvas.height - picture.height) / 2),
    }
  }
  const value = settings.resizeValue
  let scale =
    settings.resize === "width"
      ? value / kept.width
      : settings.resize === "height"
        ? value / kept.height
        : settings.resize === "percent"
          ? value / 100
          : settings.resize === "longEdge"
            ? value / Math.max(kept.width, kept.height)
            : 1
  if (!settings.enlarge) scale = Math.min(1, scale)
  // Whatever was asked for, the result fits the largest size the tool writes.
  scale =
    Math.min(scale, MAX_EDGE / Math.max(kept.width, kept.height)) *
    settings.shrink
  const size = {
    width: Math.max(1, Math.round(kept.width * scale)),
    height: Math.max(1, Math.round(kept.height * scale)),
  }
  // Video encoders want even sides.
  const canvas = video
    ? { width: even(size.width), height: even(size.height) }
    : size
  return { canvas, picture: canvas, x: 0, y: 0 }
}

/** The size of the result for a source of a given size. */
export function outputSize(
  source: Size,
  settings: AnimationSettings,
  crop?: Size | null
): Size {
  return layoutFor(source, settings, crop).canvas
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
  | {
      kind: "video"
      container: "mp4" | "webm"
      /** A named level, or bits per pixel per frame for Custom. */
      level: "small" | "balanced" | "high" | number
    }
  | ({ kind: "frames" } & StillPlan)
  | ({ kind: "sprite" } & StillPlan)

interface StillPlan {
  format: FrameFormat
  quality: number
  lossless: boolean
}

/** Turn the quality choice into what each encoder needs. */
export function encodePlan(settings: AnimationSettings): EncodePlan {
  const { quality, target } = settings
  if (target === "mp4" || target === "webm")
    return {
      kind: "video",
      container: target,
      level:
        quality === "custom"
          ? // 1–100 becomes 0.01–0.4 bits per pixel, a wide but sane range.
            0.01 + ((settings.customQuality - 1) / 99) * 0.39
          : quality === "lossless"
            ? "high"
            : quality,
    }
  if (target === "frames" || target === "sprite") {
    const format = settings.frameFormat
    const exact =
      frameFormats[format].lossless &&
      (format === "png" || quality === "lossless" || quality === "high")
    return {
      kind: target,
      format,
      lossless: exact,
      quality: exact
        ? 100
        : quality === "small"
          ? 60
          : quality === "custom"
            ? settings.customQuality
            : quality === "balanced"
              ? 80
              : 92,
    }
  }
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
  const target = targets[settings.target]
  return target.kind === "bundle"
    ? frameFormats[settings.frameFormat].lossless
    : target.lossless
}

/** Whether the result has an alpha channel; otherwise see-through areas are filled. */
export function keepsTransparency(settings: AnimationSettings) {
  const target = targets[settings.target]
  if (target.kind === "video") return false
  if (target.kind === "bundle") return settings.frameFormat !== "jpeg"
  return true
}

/** Whether a quality number, rather than a colour count, is what Custom sets. */
export function customIsNumeric(settings: AnimationSettings) {
  const { target } = settings
  if (target === "apng") return false
  if (target === "gif") return settings.gifEngine === "best"
  return true
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
    const sides =
      settings.resize === "exact"
        ? [settings.resizeValue, settings.resizeHeight]
        : [settings.resizeValue]
    if (sides.some((side) => !whole(side) || side < 1))
      return "Enter a size in whole pixels."
    if (sides.some((side) => side > MAX_EDGE))
      return `Enter a size up to ${MAX_EDGE.toLocaleString("en")} pixels.`
  }
  if (
    settings.maxSeconds !== null &&
    !(settings.maxSeconds >= 0.1 && settings.maxSeconds <= 600)
  )
    return "Enter a length limit from 0.1 to 600 seconds."
  if (
    settings.sizeLimit !== null &&
    !(
      settings.sizeLimit >= MIN_SIZE_LIMIT &&
      settings.sizeLimit <= MAX_SIZE_LIMIT
    )
  )
    return "Enter a file size from 10 KB to 100 MB."
  if (settings.quality === "custom") {
    if (customIsNumeric(settings)) {
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
  if (
    [settings.brightness, settings.contrast, settings.saturation].some(
      (value) => !(value >= -100 && value <= 100)
    )
  )
    return "Set brightness, contrast and saturation from -100 to 100."
  if (
    [settings.fadeIn, settings.fadeOut].some(
      (value) => !(value >= 0 && value <= 10)
    )
  )
    return "Enter a fade from 0 to 10 seconds."
  if (settings.captionTop.length > 200 || settings.captionBottom.length > 200)
    return "Keep each caption under 200 characters."
  if (
    hasCaption(settings) &&
    settings.captionColour === "custom" &&
    !parseHexColor(settings.captionCustomColour)
  )
    return "Enter the caption colour as a hex colour, such as #ffffff."
  const { captionFrom: from, captionUntil: until } = settings
  if (
    (from !== null && !(from >= 0)) ||
    (until !== null && !(until > 0)) ||
    (from !== null && until !== null && from >= until)
  )
    return "Enter caption times in seconds, with the start before the end."
  if (!(settings.overlaySize >= 5 && settings.overlaySize <= 100))
    return "Set the overlay's width from 5% to 100%."
  if (!(settings.overlayOpacity >= 10 && settings.overlayOpacity <= 100))
    return "Set the overlay's opacity from 10% to 100%."
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
/**
 * @param overlay Something that names the added logo or watermark; empty when there is none.
 */
export function processingKey(
  settings: AnimationSettings,
  trim: Trim,
  overlay = ""
) {
  // The file name is applied afterwards, and "shrink" is the tool's own, set while it works.
  const { pattern, shrink, ...rest } = settings
  void pattern
  void shrink
  // Options for text or an overlay that is not there change nothing.
  const written = hasCaption(settings)
  const unwritten = {
    captionSize: null,
    captionColour: null,
    captionOutline: null,
    captionUppercase: null,
    captionFrom: null,
    captionUntil: null,
  }
  return JSON.stringify({
    ...rest,
    ...(written ? null : unwritten),
    captionCustomColour:
      written && settings.captionColour === "custom"
        ? settings.captionCustomColour
        : null,
    ...(overlay
      ? null
      : { overlayCorner: null, overlaySize: null, overlayOpacity: null }),
    trim,
    overlay,
  })
}

/** True when there is caption text to write. */
export function hasCaption(settings: AnimationSettings) {
  return Boolean(settings.captionTop.trim() || settings.captionBottom.trim())
}

/** The colour fades go to and come from: the chosen background, or black. */
export function fadeColour(
  settings: AnimationSettings
): [number, number, number] {
  return settings.background === "keep" ? [0, 0, 0] : matte(settings)!
}

/** The colour captions are written in. */
export function captionColour(
  settings: AnimationSettings
): [number, number, number] {
  if (settings.captionColour === "black") return [0, 0, 0]
  if (settings.captionColour === "white") return [255, 255, 255]
  return parseHexColor(settings.captionCustomColour) ?? [255, 255, 255]
}
