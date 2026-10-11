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

export interface CompressSettings {
  level: Level
}

export const defaultSettings: CompressSettings = { level: "balanced" }

/** Two settings with the same key give the same result. */
export const settingsKey = (settings: CompressSettings) => settings.level

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
