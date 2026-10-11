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

/**
 * What to do with scanned pages: pages that are one large picture.
 * - keep: treat them like any other picture
 * - layers: sharp black-and-white letters over soft paper
 * - grey: take the colour out
 * - mono: black and white, as a photocopy
 */
export type ScanChoice = "keep" | "layers" | "grey" | "mono"

export const scanChoices: readonly {
  value: ScanChoice
  label: string
  note: string
}[] = [
  {
    value: "keep",
    label: "As they are",
    note: "A scanned page is treated like any other picture.",
  },
  {
    value: "layers",
    label: "Text and paper",
    note: "Letters are kept sharp in black and white, over soft paper in colour. Much smaller than a picture of the whole page, and easier to read.",
  },
  {
    value: "grey",
    label: "Greyscale",
    note: "Colour is taken out of scanned pages.",
  },
  {
    value: "mono",
    label: "Black and white",
    note: "Like a photocopy: ink is black, paper is white. Smallest, and right for plain text. Photographs and shading are lost.",
  },
]

/** How a rebuilt scan may differ from the picture it was, drawn small (mean SSIM). Black and white differs by design. */
export const scanMarks: Record<Exclude<ScanChoice, "keep">, number | null> = {
  layers: 0.85,
  grey: null,
  mono: 0.35,
}

/** A picture that covers this share of a page is a scan of that page. */
export const SCAN_COVERS = 0.75

/**
 * How many pixels of a scan, each way, one pixel of a soft layer stands for,
 * so that the layer has at most `wanted` pixels per inch. A scan a hair
 * under a whole step counts as on it: 149.98 dpi is 150.
 */
export const layerStep = (dpi: number, wanted: number) =>
  Math.max(1, Math.ceil(dpi / wanted - 0.05))

/** The resolutions and qualities of a scan's layers, at a level. */
export function scanSettings(plan: LevelPlan) {
  return {
    /** Letters keep up to this many pixels per inch. */
    maskDpi: Math.min(300, plan.dpi * 2),
    paperDpi: Math.round((plan.dpi * 2) / 3),
    paperQuality: Math.max(30, (plan.fixed ?? plan.floor) - 15),
  }
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

/** A level, a size the file has to come out under, or settings of one's own. */
export type Mode = Level | "size" | "custom"

/** Settings of one's own, for those who know what they want. */
export interface CustomChoice {
  /** Pictures are brought down to this many pixels per inch. */
  dpi: number
  /** The JPEG quality photographs are saved at, as it is. */
  quality: number
  /** Take the colour out of every picture. */
  grey: boolean
  /** Cut fonts stored whole down to the letters in use. */
  fonts: boolean
}

export const defaultCustom: CustomChoice = {
  dpi: 150,
  quality: 75,
  grey: false,
  fonts: true,
}

export const customDpis: readonly number[] = [72, 96, 120, 150, 200, 300]
export const customQuality = { min: 20, max: 92 } as const

export const CUSTOM_NOTE =
  "You choose the resolution and the quality. Nothing is measured: pictures are saved exactly as set."

/** What custom settings do to pictures. */
export function customPlan(custom: CustomChoice): LevelPlan {
  const quality = Math.min(
    customQuality.max,
    Math.max(customQuality.min, Math.round(custom.quality))
  )
  return {
    dpi: custom.dpi,
    slack: 1.25,
    look: "smallest",
    keepBelow: quality,
    floor: quality,
    fixed: quality,
  }
}

/** The mark for the page check with settings of one's own: loss is chosen, so the check is lenient. */
export const CUSTOM_MARK = 0.85

export const SIZE_NOTE =
  "The file is written a few times to find the best quality that fits. Pictures give way first; text stays sharp."

export const modeChoices: readonly { value: Mode; label: string }[] = [
  ...levelChoices.map(({ value, label }) => ({ value, label })),
  { value: "size", label: "To a size" },
  { value: "custom", label: "Custom" },
]

/** What a mode does, in a sentence or two. */
export const modeNote = (mode: Mode) =>
  levelChoices.find((choice) => choice.value === mode)?.note ??
  (mode === "size" ? SIZE_NOTE : CUSTOM_NOTE)

export interface CompressSettings {
  mode: Mode
  /** What to do with scanned pages; nothing at the level that loses nothing. */
  scans: ScanChoice
  /** For "To a size": the size to stay within, in bytes; null while what is typed is not a size. */
  target: number | null
  /** For "To a size": go on past what is easy to read, if the size takes it. */
  further: boolean
  /** For "Custom". */
  custom: CustomChoice
}

export const defaultSettings: CompressSettings = {
  mode: "balanced",
  scans: "keep",
  target: 1024 * 1024,
  further: false,
  custom: defaultCustom,
}

/** Two settings with the same key give the same result. */
export function settingsKey(settings: CompressSettings) {
  if (settings.mode === "lossless") return settings.mode
  const { custom } = settings
  const how =
    settings.mode === "size"
      ? `size:${settings.target}:${settings.further}`
      : settings.mode === "custom"
        ? `custom:${custom.dpi}:${custom.quality}:${custom.grey}:${custom.fonts}`
        : settings.mode
  return settings.scans === "keep" ? how : `${how}:${settings.scans}`
}

/** What is done with scanned pages at these settings. */
export const scansFor = (settings: CompressSettings): ScanChoice =>
  settings.mode === "lossless" ? "keep" : settings.scans

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
