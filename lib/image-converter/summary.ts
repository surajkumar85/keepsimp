/**
 * The image converter's settings in groups, and each group in a few words,
 * for the settings card: a folded group still says what will be done.
 */
import { differs, line, type Groups } from "@/lib/settings-groups"
import type { PdfMargin, PdfPageSize } from "./encoders/pdf"
import {
  activeTargets,
  flattenedTargets,
  qualityApplies,
  usesTarget,
  type ConverterSettings,
  type QualityChoice,
} from "./settings"
import { targets } from "./targets"

export type ConverterGroup =
  "format" | "ico" | "pdf" | "gif" | "quality" | "options" | "names"

export const CONVERTER_GROUPS: Groups<ConverterSettings, ConverterGroup> = {
  format: ["target", "multi", "targets"],
  ico: ["icoSizes"],
  pdf: ["pdfPage", "pdfDpi", "pdfMargin", "pdfCombine"],
  gif: ["gifColours", "dithering"],
  quality: ["quality", "customQuality"],
  options: [
    "background",
    "backgroundColor",
    "limit",
    "customLimit",
    "greyscale",
    "embedDpi",
    "dpi",
  ],
  names: ["pattern"],
}

/**
 * The settings as they act: a value no chosen format reads (icon sizes
 * without ICO, the background for formats that keep transparency) is taken
 * from `usual`, so it never counts as a change.
 */
function inUse(
  settings: ConverterSettings,
  usual: ConverterSettings
): ConverterSettings {
  const next = { ...settings }
  const keep = (...keys: (keyof ConverterSettings)[]) => {
    for (const key of keys) Object.assign(next, { [key]: usual[key] })
  }
  keep(settings.multi ? "target" : "targets")
  if (!usesTarget(settings, "ico")) keep(...CONVERTER_GROUPS.ico)
  if (!usesTarget(settings, "pdf")) keep(...CONVERTER_GROUPS.pdf)
  if (settings.pdfPage === "fit") keep("pdfMargin")
  else keep("pdfDpi")
  if (!usesTarget(settings, "gif")) keep(...CONVERTER_GROUPS.gif)
  if (!qualityApplies(settings)) keep(...CONVERTER_GROUPS.quality)
  if (settings.quality !== "custom") keep("customQuality")
  if (!flattenedTargets(settings).length) keep("background")
  if (next.background !== "custom") keep("backgroundColor")
  if (settings.limit !== "custom") keep("customLimit")
  if (!settings.embedDpi) keep("dpi")
  return next
}

/** Whether a group differs from the usual in a way that changes the files. */
export function converterChanged(
  group: ConverterGroup,
  settings: ConverterSettings,
  usual: ConverterSettings
) {
  return differs(inUse(settings, usual), usual, CONVERTER_GROUPS[group])
}

/** How many groups differ from the usual, for the card's head. */
export function converterChanges(
  settings: ConverterSettings,
  usual: ConverterSettings
) {
  return (Object.keys(CONVERTER_GROUPS) as ConverterGroup[]).filter((group) =>
    converterChanged(group, settings, usual)
  ).length
}

const QUALITIES: Record<Exclude<QualityChoice, "custom">, string> = {
  balanced: "Balanced",
  high: "High",
  small: "Small file",
  lossless: "Lossless",
}

const PAGES: Record<Exclude<PdfPageSize, "fit">, string> = {
  a4: "A4",
  letter: "US Letter",
}

const MARGINS: Record<PdfMargin, string> = {
  none: "no margins",
  small: "small margins",
  normal: "normal margins",
}

/** A list in words: "A", "A and B", "A, B and C". */
function listed(items: string[]) {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
    : (items[0] ?? "")
}

/** What a group of the converter's settings is, in a line. */
export function converterSummary(
  group: ConverterGroup,
  settings: ConverterSettings
): string {
  switch (group) {
    case "format":
      return (
        listed(
          activeTargets(settings).map((target) => targets[target].label)
        ) || "No format chosen"
      )
    case "ico":
      return settings.icoSizes.length
        ? `${listed(settings.icoSizes.map(String))} px`
        : "No sizes chosen"
    case "pdf":
      return line(
        settings.pdfPage === "fit"
          ? `Page the size of the image at ${settings.pdfDpi} DPI`
          : `${PAGES[settings.pdfPage]}, ${MARGINS[settings.pdfMargin]}`,
        settings.pdfCombine ? "one PDF for all" : "a PDF for each image"
      )
    case "gif":
      return line(
        `${settings.gifColours} colours`,
        settings.dithering ? "dithered" : "no dithering"
      )
    case "quality":
      return settings.quality === "custom"
        ? `Quality ${settings.customQuality}`
        : QUALITIES[settings.quality]
    case "options": {
      const flattened = flattenedTargets(settings).length > 0
      return line(
        settings.limit === "original"
          ? "Original size"
          : `Longest side ${settings.limit === "custom" ? settings.customLimit.trim() || "?" : settings.limit} px at most`,
        settings.greyscale && "greyscale",
        settings.embedDpi && `${settings.dpi} DPI saved`,
        flattened &&
          (settings.background === "custom"
            ? `${settings.backgroundColor} background`
            : `${settings.background} background`)
      )
    }
    case "names":
      return settings.pattern.trim() || "Original names"
  }
}
