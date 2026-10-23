/**
 * The compressor's settings in groups, and each group in a few words, for
 * the settings card: a folded group still says what will be done.
 */
import {
  capital,
  listed,
  lockSummary,
  LOCK_KEYS,
} from "@/lib/pdf-merger/summary"
import { line, type Groups } from "@/lib/settings-groups"
import type { Extras, Removal } from "./options"
import {
  defaultSettings,
  settingsKey,
  type CompressSettings,
  type ScanChoice,
} from "./settings"

export type ExtrasGroup = "takeOut" | "password"

export const EXTRAS_GROUPS: Groups<Extras, ExtrasGroup> = {
  takeOut: [
    "details",
    "attachments",
    "bookmarks",
    "comments",
    "scripts",
    "tags",
    "flatten",
  ],
  password: LOCK_KEYS,
}

const LEVELS = {
  lossless: "Lossless",
  balanced: "Balanced",
  strong: "Strong",
} as const

const SCANS: Record<Exclude<ScanChoice, "keep">, string> = {
  layers: "scans as text and paper",
  grey: "scans in greyscale",
  mono: "scans in black and white",
}

/** A size as the chips name it: "200 KB", "1 MB", "1.5 MB". */
function sizeName(bytes: number) {
  return bytes < 1024 * 1024
    ? `${+(bytes / 1024).toFixed(1)} KB`
    : `${+(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** How much is compressed, in a line. */
export function levelSummary(settings: CompressSettings) {
  const { mode, custom } = settings
  const how =
    mode === "size"
      ? settings.target === null
        ? "A size is still to be typed"
        : line(
            `Under ${sizeName(settings.target)}`,
            settings.further && "going further if it takes it"
          )
      : mode === "custom"
        ? line(
            `${custom.dpi} dpi`,
            `quality ${custom.quality}`,
            custom.grey && "greyscale",
            !custom.fonts && "whole fonts"
          )
        : LEVELS[mode]
  return line(
    how,
    mode !== "lossless" && settings.scans !== "keep" && SCANS[settings.scans]
  )
}

/** Whether the level differs from the usual in what it would write. */
export const levelChanged = (settings: CompressSettings) =>
  settingsKey(settings) !== settingsKey(defaultSettings)

const TAKEN: Record<Exclude<keyof Removal, "flatten">, string> = {
  details: "details",
  attachments: "attached files",
  bookmarks: "bookmarks",
  comments: "notes",
  scripts: "scripts",
  tags: "tags",
}

/** What a group of the compressor's extras is, in a line. */
export function extrasSummary(group: ExtrasGroup, extras: Extras) {
  if (group === "password") return lockSummary(extras)
  const taken = (Object.keys(TAKEN) as (keyof typeof TAKEN)[])
    .filter((key) => extras[key])
    .map((key) => TAKEN[key])
  return (
    capital(
      line(
        taken.length > 0 && `${listed(taken)} taken out`,
        extras.flatten && "fields flattened"
      )
    ) || "Everything kept"
  )
}
