/**
 * The compressor's levels and what each one allows. The numbers are
 * KeepSimp's own, set from measurements on real files (see
 * `docs/pdf-compressor.md`), not taken from a standard.
 */
import { savingsPercent } from "@/lib/image-compressor/quality"

export type Level = "lossless" | "balanced" | "strong"

/** What a level that may change pictures does to them. */
export interface LevelPlan {
  /** Pixels per inch a picture is brought down to, where it is drawn largest. */
  dpi: number
  /** A picture is only made smaller when it has this many times `dpi`: a small step down costs sharpness and saves little. */
  slack: number
  /** How alike a re-encoded picture must stay, as one of the image compressor's marks. */
  look: "high" | "smart" | "smallest"
  /** A JPEG at or below this estimated quality is left as it is, so quality is not lost twice. */
  keepBelow: number
  /**
   * The lowest JPEG quality written. Measured likeness alone lets smooth
   * areas such as skies go too far: they turn into bands before the measure
   * notices.
   */
  floor: number
  /**
   * Write JPEGs at exactly this quality, with no measuring. Used when the
   * file has to come out under a size: the size decides, not the likeness.
   */
  fixed?: number
  /** Also save JPEGs again that this compressor wrote on an earlier run. */
  again?: boolean
}

/** Null for the level that changes nothing you can see. */
export const levelPlans: Record<Level, LevelPlan | null> = {
  lossless: null,
  balanced: { dpi: 150, slack: 1.25, look: "smart", keepBelow: 80, floor: 80 },
  strong: { dpi: 96, slack: 1.25, look: "smallest", keepBelow: 65, floor: 65 },
}

/**
 * How alike a page must look before and after, drawn small, for the check to
 * pass it (mean SSIM, 1 for identical). Lossless leaves room only for
 * rounding.
 */
export const pageMarks: Record<Level, number> = {
  lossless: 0.9999,
  balanced: 0.97,
  strong: 0.93,
}
/** The mark for a file squeezed under a size, where some loss is the point. */
export const TARGET_MARK = 0.88

export const levelChoices: readonly {
  value: Level
  label: string
  note: string
}[] = [
  {
    value: "lossless",
    label: "Lossless",
    note: "Nothing you can see changes. The file is tidied and packed tighter.",
  },
  {
    value: "balanced",
    label: "Balanced",
    note: "Pictures are brought down to 150 dpi and saved again so they look the same. Right for most files.",
  },
  {
    value: "strong",
    label: "Strong",
    note: "Pictures are brought down to 96 dpi at a lower quality. Fine on screens and for email; not for print.",
  },
]

/** A level, or a size the file has to come out under. */
export type Mode = Level | "size"

export const SIZE_NOTE =
  "The file is written a few times to find the best quality that fits. Pictures give way first; text stays sharp."

export const modeChoices: readonly { value: Mode; label: string }[] = [
  ...levelChoices.map(({ value, label }) => ({ value, label })),
  { value: "size", label: "To a size" },
]

/** What a mode does, in a sentence or two. */
export const modeNote = (mode: Mode) =>
  levelChoices.find((choice) => choice.value === mode)?.note ?? SIZE_NOTE

export interface CompressSettings {
  mode: Mode
  /** For "To a size": the size to stay within, in bytes; null while what is typed is not a size. */
  target: number | null
  /** For "To a size": go on past what is easy to read, if the size takes it. */
  further: boolean
}

export const defaultSettings: CompressSettings = {
  mode: "balanced",
  target: 1024 * 1024,
  further: false,
}

/** Two settings with the same key give the same result. */
export const settingsKey = (settings: CompressSettings) =>
  settings.mode === "size"
    ? `size:${settings.target}:${settings.further}`
    : settings.mode

/** Why nothing can be compressed with these settings; null when it can. */
export const settingsProblem = (settings: CompressSettings) =>
  settings.mode === "size" && settings.target === null
    ? "Type a size of 10 KB or more, such as 300."
    : null

/** The name the result is saved under: the file's own, marked as compressed. */
export function resultName(name: string) {
  const stem = name.replace(/\.pdf$/i, "").trim() || "document"
  return `${stem}-compressed.pdf`
}

/** A result has to be this much smaller, as a share, to be worth handing over. */
export const MIN_SAVING = 0.01

export interface Outcome {
  /** Bytes saved; never below zero. */
  saved: number
  /** Whole percent saved. */
  percent: number
  /** False when the result is not worth swapping for the original. */
  smaller: boolean
}

export function outcome(before: number, after: number): Outcome {
  const smaller = before > 0 && after <= before * (1 - MIN_SAVING)
  return {
    saved: smaller ? before - after : 0,
    percent: smaller ? savingsPercent(before, after) : 0,
    smaller,
  }
}
