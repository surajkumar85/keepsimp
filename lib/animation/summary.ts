/**
 * The animation converter's settings in groups, and each group in a few
 * words, for the settings card: a folded group still says what will be
 * done to every animation.
 */
import {
  differs,
  changedGroups,
  line,
  type Groups,
} from "@/lib/settings-groups"
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { SizeRow } from "./compare"
import { matchingDestination } from "./presets"
import {
  customIsNumeric,
  defaultSettings,
  frameFormats,
  keepsTransparency,
  settingsProblem,
  targets,
  type AnimationSettings,
  type Target,
  type Trim,
} from "./settings"

export type AnimationGroup =
  | "limit"
  | "format"
  | "quality"
  | "timing"
  | "length"
  | "direction"
  | "size"
  | "turn"
  | "background"
  | "names"
  | "text"
  | "colour"
  | "fade"
  | "logo"

/** Which settings each group holds. "shrink" is the tool's own, set while it works, so no group holds it. */
export const ANIMATION_GROUPS: Groups<AnimationSettings, AnimationGroup> = {
  limit: ["sizeLimit"],
  format: ["target", "gifEngine", "frameFormat"],
  quality: ["quality", "customQuality", "colours", "dithering"],
  timing: ["speed", "fps"],
  length: ["maxSeconds"],
  direction: ["reverse", "boomerang", "loop", "loopCount"],
  size: ["resize", "resizeValue", "resizeHeight", "enlarge"],
  turn: ["rotation", "flipX", "flipY"],
  background: ["background", "backgroundColor"],
  names: ["pattern"],
  text: [
    "captionTop",
    "captionBottom",
    "captionSize",
    "captionColour",
    "captionCustomColour",
    "captionOutline",
    "captionUppercase",
    "captionFrom",
    "captionUntil",
  ],
  colour: ["filter", "brightness", "contrast", "saturation"],
  fade: ["fadeIn", "fadeOut"],
  logo: ["overlayCorner", "overlaySize", "overlayOpacity"],
}

/** The groups in the order `settingsProblem` checks them, for finding where a problem is. */
const CHECKED: AnimationGroup[] = [
  "direction",
  "timing",
  "size",
  "length",
  "limit",
  "quality",
  "background",
  "colour",
  "fade",
  "text",
  "logo",
  "names",
]

const QUALITIES: Record<AnimationSettings["quality"], string> = {
  balanced: "Balanced",
  high: "High",
  small: "Small file",
  lossless: "Lossless",
  custom: "Custom",
}

const TURNS: Record<AnimationSettings["rotation"], string> = {
  0: "",
  90: "Turned right",
  180: "Turned upside down",
  270: "Turned left",
}

const FILTERS: Record<AnimationSettings["filter"], string> = {
  none: "",
  greyscale: "Greyscale",
  sepia: "Sepia",
  invert: "Inverted",
}

const CORNERS: Record<AnimationSettings["overlayCorner"], string> = {
  "top-left": "top left",
  "top-right": "top right",
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
  centre: "centre",
}

/** A line that starts with a capital, whichever part comes first. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** A file size limit as the chips show it. */
export function limitLabel(bytes: number) {
  return bytes >= 1_000_000
    ? `${+(bytes / 1_000_000).toFixed(2)} MB`
    : `${+(bytes / 1000).toFixed(1)} KB`
}

/** A change of colour, with its sign. */
const signed = (value: number) => (value > 0 ? `+${value}` : String(value))

/** Whether the result is reduced to a palette, so that dithering means something. */
export function usesPalette(settings: AnimationSettings) {
  const gif = settings.target === "gif"
  return (
    settings.quality !== "lossless" &&
    ((gif && settings.gifEngine !== "best") ||
      (settings.target === "apng" && settings.quality !== "high"))
  )
}

/** What a group of the converter's settings is, in a line. */
export function animationSummary(
  group: AnimationGroup,
  settings: AnimationSettings,
  /** The logo's file name, when one has been added: its settings say nothing without one. */
  logo: string | null = null
): string {
  const target = targets[settings.target]
  switch (group) {
    case "limit":
      return settings.sizeLimit === null
        ? "No limit"
        : `Under ${limitLabel(settings.sizeLimit)}`
    case "format":
      return line(
        target.label,
        target.kind === "bundle" &&
          `${frameFormats[settings.frameFormat].label} ${
            settings.target === "sprite" ? "sheet" : "images"
          }`,
        settings.target === "gif" &&
          (settings.gifEngine === "best" ? "gifski" : "fast encoder")
      )
    case "quality":
      return line(
        settings.quality !== "custom"
          ? QUALITIES[settings.quality]
          : customIsNumeric(settings)
            ? `Quality ${settings.customQuality}`
            : `${settings.colours} colours`,
        usesPalette(settings) &&
          settings.quality !== "small" &&
          !settings.dithering &&
          "no dithering"
      )
    case "timing":
      return line(
        settings.speed === 1 ? "Normal speed" : `${settings.speed}× speed`,
        settings.fps === null
          ? "original frame rate"
          : `${settings.fps} fps at most`
      )
    case "length":
      return settings.maxSeconds === null
        ? "No limit"
        : `${settings.maxSeconds} s at most`
    case "direction":
      return line(
        settings.boomerang
          ? settings.reverse
            ? "Boomerang, reversed"
            : "Boomerang"
          : settings.reverse
            ? "Reversed"
            : "Forwards",
        // Only animated images and sprite sheets carry a loop count.
        (target.kind === "animation" || settings.target === "sprite") &&
          (settings.loop === "forever"
            ? "loops forever"
            : settings.loop === "once"
              ? "plays once"
              : `plays ${settings.loopCount} times`)
      )
    case "size": {
      const { resizeValue: value } = settings
      if (settings.resize === "original") return "Original size"
      return line(
        settings.resize === "width"
          ? `${value} px wide`
          : settings.resize === "height"
            ? `${value} px high`
            : settings.resize === "longEdge"
              ? `${value} px on the longest side`
              : settings.resize === "percent"
                ? `${value}% of the size`
                : `Exactly ${value} × ${settings.resizeHeight} px`,
        !settings.enlarge && "never enlarged"
      )
    }
    case "turn":
      return sentence(
        line(
          TURNS[settings.rotation],
          settings.flipX && "flipped horizontally",
          settings.flipY && "flipped vertically"
        ) || "As it is"
      )
    case "background":
      return settings.background === "keep"
        ? keepsTransparency(settings)
          ? "Transparency kept"
          : "Filled with white"
        : `Filled with ${
            settings.background === "custom"
              ? settings.backgroundColor
              : settings.background
          }`
    case "names":
      return `${settings.pattern}.${target.extension}`
    case "text": {
      const top = settings.captionTop.trim()
      const bottom = settings.captionBottom.trim()
      return sentence(
        line(
          top && `“${top}” at the top`,
          bottom && `“${bottom}” at the bottom`
        ) || "No text"
      )
    }
    case "colour":
      return sentence(
        line(
          FILTERS[settings.filter],
          settings.brightness !== 0 &&
            `brightness ${signed(settings.brightness)}`,
          settings.contrast !== 0 && `contrast ${signed(settings.contrast)}`,
          settings.saturation !== 0 &&
            `saturation ${signed(settings.saturation)}`
        ) || "As it is"
      )
    case "fade":
      return sentence(
        line(
          settings.fadeIn > 0 && `fades in ${settings.fadeIn} s`,
          settings.fadeOut > 0 && `fades out ${settings.fadeOut} s`
        ) || "No fades"
      )
    case "logo":
      return logo
        ? line(
            logo,
            CORNERS[settings.overlayCorner],
            `${settings.overlaySize}% wide`,
            `${settings.overlayOpacity}% opacity`
          )
        : "No logo"
  }
}

/** Where the animation is going, in a word or two. */
export function destinationSummary(settings: AnimationSettings) {
  return matchingDestination(settings)?.label ?? "Anywhere"
}

/** How many groups differ from the usual: a logo added counts as a change to its group. */
export function changedCount(settings: AnimationSettings, logo: boolean) {
  return (
    changedGroups(settings, defaultSettings, ANIMATION_GROUPS).length +
    (logo && !differs(settings, defaultSettings, ANIMATION_GROUPS.logo) ? 1 : 0)
  )
}

/**
 * The group whose settings make the problem the page shows, so it is said
 * next to them: the first group, in the order they are checked, that no
 * longer has it once put back to the usual.
 */
export function problemGroup(
  settings: AnimationSettings
): AnimationGroup | null {
  const problem = settingsProblem(settings)
  if (!problem) return null
  // Every check belongs to one of the groups, so when none before it is the cause, the last is.
  const last = CHECKED.length - 1
  for (const group of CHECKED.slice(0, last)) {
    const reset = { ...settings }
    for (const key of ANIMATION_GROUPS[group])
      Object.assign(reset, { [key]: defaultSettings[key] })
    if (settingsProblem(reset) !== problem) return group
  }
  return CHECKED[last]
}

const seconds = (milliseconds: number) =>
  `${(milliseconds / 1000).toFixed(2)} s`

/** What is kept of an animation, as its trim says. */
export function trimSummary(trim: Trim, duration: number) {
  const start = Math.min(trim.start, duration)
  const end = Math.min(trim.end ?? duration, duration)
  if (start <= 0 && end >= duration) return "The whole animation"
  return `${seconds(start)} to ${seconds(end)} · ${seconds(end - start)} kept`
}

/** Where a comparison of formats stands. */
export type ComparisonState =
  | { status: "idle" }
  | {
      status: "running"
      label: string
      /** Formats finished so far, of `total`. */
      done: number
      total: number
    }
  | { status: "done"; rows: SizeRow[] }
  | { status: "error"; message: string }

/** How many of the formats are done, from the worker's "Trying GIF…" line. */
export function comparedSoFar(
  label: string,
  order: readonly Target[],
  before: number
) {
  const at = order.findIndex(
    (target) => label === `Trying ${targets[target].label}…`
  )
  return at === -1 ? before : at
}

/** A comparison in a line, for its folded group. */
export function comparisonSummary(state: ComparisonState) {
  switch (state.status) {
    case "idle":
      return "Not compared yet"
    case "running":
      return `Comparing: ${state.done} of ${state.total} done`
    case "error":
      return "The comparison did not finish"
    case "done":
      return state.rows.length
        ? `${targets[state.rows[0].target].label} is smallest · ${sizeLabel(state.rows[0].bytes)}`
        : "No format could be written"
  }
}
