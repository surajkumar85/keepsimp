/**
 * A GIF (or animated WebP or APNG) made from a video, by the animation
 * converter's own engine: the video editor hands its result, with every
 * edit in it, to the animation worker with these settings. Pure, so the
 * page and its tests share it.
 */
import {
  defaultSettings,
  processingKey,
  type AnimationSettings,
  type Trim,
} from "@/lib/animation/settings"
import type { ConvertedOutput, ProcessRequest } from "@/lib/animation/protocol"
import { clock } from "./trim"

export type GifTarget = "gif" | "webp" | "apng"

/** What is asked of the animation: its kind, its longest side and its frames a second. */
export interface GifChoice {
  target: GifTarget
  /** Pixels on the longest side, never made larger; null keeps the video's size. */
  side: number | null
  fps: number
}

export const GIF_TARGETS: { value: GifTarget; label: string }[] = [
  { value: "gif", label: "GIF" },
  { value: "webp", label: "WebP" },
  { value: "apng", label: "APNG" },
]
export const GIF_SIDES = [320, 480, 640] as const
export const GIF_RATES = [10, 15, 20, 25] as const

/** The animation converter's own choice for a video: 15 frames a second, 640 on the longest side; a GIF to share is smaller. */
export const defaultGif: GifChoice = { target: "gif", side: 480, fps: 15 }

/** Past this, an animation is large and slow to make: the page suggests trimming first. */
export const LONG_GIF = 30

const LABELS: Record<GifTarget, string> = {
  gif: "GIF",
  webp: "WebP",
  apng: "APNG",
}

/** The animation converter's settings for a choice. */
export function gifSettings(choice: GifChoice): AnimationSettings {
  return {
    ...defaultSettings,
    target: choice.target,
    fps: choice.fps,
    ...(choice.side === null
      ? { resize: "original" as const }
      : {
          resize: "longEdge" as const,
          resizeValue: choice.side,
          enlarge: false,
        }),
  }
}

/** The whole video. */
const WHOLE: Trim = { start: 0, end: null }

/** The animation worker's job for a video's result. */
export function gifJob(
  id: string,
  file: Blob,
  choice: GifChoice
): Omit<ProcessRequest, "type" | "generation"> {
  const settings = gifSettings(choice)
  return {
    id,
    input: { kind: "file", file },
    settings,
    trim: WHOLE,
    key: processingKey(settings, WHOLE),
    inputKey: id,
    describe: false,
    overlay: null,
  }
}

/** The name an animation made from a video is saved under. */
export function gifName(videoName: string, target: GifTarget) {
  const dot = videoName.lastIndexOf(".")
  const base = dot > 0 ? videoName.slice(0, dot) : videoName
  return `${base}.${target === "apng" ? "png" : target}`
}

/** What was made, in a line. */
export function gifSaid(output: ConvertedOutput, bytes: number) {
  const size =
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
  const rate =
    output.duration > 0 ? output.frames / (output.duration / 1000) : 0
  return `${LABELS[output.target as GifTarget] ?? output.target} · ${output.width} × ${output.height} · ${Math.round(rate)} frames a second · ${clock(output.duration / 1000)} · ${size}`
}
