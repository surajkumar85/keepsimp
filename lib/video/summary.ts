/**
 * The video editor's settings in groups, and each group in a few words, for
 * the settings card: a folded group still says what will be done.
 */
import { line, type Groups } from "@/lib/settings-groups"
import { MB, videoCodecLabels, type VideoSettings } from "./settings"

export type VideoGroup =
  "format" | "quality" | "limit" | "shape" | "timing" | "sound" | "overlay"

export const VIDEO_GROUPS: Groups<VideoSettings, VideoGroup> = {
  format: ["format", "codec"],
  quality: ["quality", "bitrate", "size", "frameRate"],
  limit: ["limit"],
  shape: ["rotate", "flip", "shape"],
  timing: ["speed", "fadeIn", "fadeOut"],
  sound: ["sound", "loudness", "keepTags"],
  overlay: [
    "captionTop",
    "captionBottom",
    "captionSize",
    "captionColour",
    "captionOutline",
    "captionFrom",
    "captionUntil",
    "logoCorner",
    "logoSize",
    "logoOpacity",
    "subtitleSize",
  ],
}

const FORMATS: Record<VideoSettings["format"], string> = {
  same: "Same as the file",
  mp4: "MP4",
  webm: "WebM",
  mov: "MOV",
  mkv: "MKV",
}

const QUALITIES: Record<VideoSettings["quality"], string> = {
  original: "Original quality",
  high: "High quality",
  balanced: "Balanced quality",
  small: "Small",
  custom: "Custom",
}

const TURNS: Record<number, string> = {
  0: "",
  90: "Turned 90° right",
  180: "Turned 180°",
  270: "Turned 90° left",
}

/** What a group of the video's settings is, in a line. */
export function videoSummary(
  group: VideoGroup,
  settings: VideoSettings,
  /** Whether a logo has been added: its settings say nothing without one. */
  logo = false
): string {
  switch (group) {
    case "format":
      return line(
        FORMATS[settings.format],
        settings.codec === "auto"
          ? "codec chosen for you"
          : videoCodecLabels[settings.codec]
      )
    case "quality":
      return line(
        settings.quality === "custom"
          ? `${settings.bitrate} kbit/s`
          : QUALITIES[settings.quality],
        settings.size === "same"
          ? "same size"
          : settings.size === 2160
            ? "4K at most"
            : `${settings.size}p at most`,
        settings.frameRate === "same"
          ? "same frame rate"
          : `${settings.frameRate} fps at most`
      )
    case "limit": {
      const limit = settings.limit
      if (!limit) return "No limit"
      if ("share" in limit)
        return limit.share === 0.5
          ? "Half of each file's size"
          : limit.share === 0.25
            ? "A quarter of each file's size"
            : `${Math.round(limit.share * 100)}% of each file's size`
      return `Under ${+(limit.bytes / MB).toFixed(2)} MB`
    }
    case "shape":
      return (
        line(
          TURNS[settings.rotate],
          settings.flip && "mirrored",
          settings.shape !== "same" && `cut to ${settings.shape}`
        ) || "As it is"
      )
    case "timing":
      return line(
        settings.speed === 1 ? "Normal speed" : `${settings.speed}× speed`,
        settings.fadeIn || settings.fadeOut
          ? line(
              settings.fadeIn > 0 && `fades in ${settings.fadeIn} s`,
              settings.fadeOut > 0 && `out ${settings.fadeOut} s`
            )
          : "no fades"
      )
    case "sound":
      return line(
        settings.sound === "keep"
          ? "Sound kept"
          : settings.sound === "convert"
            ? "Sound converted"
            : "No sound",
        settings.sound !== "none" &&
          settings.loudness !== null &&
          `${settings.loudness} LUFS`.replace("-", "−"),
        !settings.keepTags && "details left out"
      )
    case "overlay": {
      const top = settings.captionTop.trim()
      const bottom = settings.captionBottom.trim()
      return (
        line(
          top && `“${top}” at the top`,
          bottom && `“${bottom}” at the bottom`,
          logo && "a logo"
        ) || "No text or logo"
      )
    }
  }
}
