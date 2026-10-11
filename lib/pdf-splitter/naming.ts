import { safeSegment, uniqueNames } from "@/lib/image-resizer/naming"
import { formatRanges } from "@/lib/pdf-merger/ranges"
import type { Part } from "./parts"

/** What a pattern may hold between braces. */
export const nameTokens = [
  "name",
  "part",
  "from",
  "to",
  "pages",
  "label",
] as const

/** A part's file name: the original's name and the part's number. */
export const DEFAULT_PATTERN = "{name}-{part}"

/** Longer than this, a name is cut: some systems refuse long file names. */
const MAX_STEM = 120

const baseName = (name: string) => name.replace(/\.pdf$/i, "")
const digits = (count: number) => String(Math.max(count, 1)).length

/** Placeholders in a pattern that mean nothing here. */
export function unknownTokens(pattern: string) {
  return [...pattern.matchAll(/\{([^{}]*)\}/g)]
    .map((match) => match[1])
    .filter((token) => !(nameTokens as readonly string[]).includes(token))
}

/** Why a pattern cannot be used; null when it can. An empty pattern means the usual one. */
export function patternProblem(pattern: string) {
  const unknown = unknownTokens(pattern)
  return unknown.length
    ? `{${unknown[0]}} is not a placeholder. Use ${nameTokens.map((token) => `{${token}}`).join(", ")}.`
    : null
}

export interface NameValues {
  /** The name of the file being split. */
  source: string
  /** The part's number from 1, and how many parts there are. */
  number: number
  total: number
  /** How many pages the file being split has. */
  pageCount: number
}

/**
 * A part's file name from a pattern, without the ".pdf".
 * - {name}: the file being split, without its ending
 * - {part}: the part's number, with zeros in front so that names sort in order
 * - {from}, {to}: its first and last page, likewise
 * - {pages}: its pages as they would be typed, such as "5-9"
 * - {label}: words that belong to the part, such as a bookmark's title
 */
export function partStem(pattern: string, part: Part, values: NameValues) {
  const page = (index: number | undefined) =>
    String((index ?? 0) + 1).padStart(digits(values.pageCount), "0")
  const filled = (pattern.trim() || DEFAULT_PATTERN).replace(
    /\{([^{}]*)\}/g,
    (whole, token: string) => {
      switch (token) {
        case "name":
          return baseName(values.source)
        case "part":
          return String(values.number).padStart(digits(values.total), "0")
        case "from":
          return page(part.pages[0])
        case "to":
          return page(part.pages[part.pages.length - 1])
        case "pages":
          // Commas would become dashes and read as ranges.
          return formatRanges(part.pages).replaceAll(", ", "_")
        case "label":
          return part.label ?? ""
        default:
          return whole
      }
    }
  )
  return safeSegment(filled).slice(0, MAX_STEM) || `part-${values.number}`
}

/** A name someone typed, made safe for a file, without the ".pdf" they may have added. */
export const typedStem = (typed: string) =>
  safeSegment(baseName(typed.trim())).slice(0, MAX_STEM)

/**
 * The file name of every part: the one typed for it where there is one, the
 * pattern's otherwise. No two are the same.
 */
export function partNames(
  parts: readonly Part[],
  pattern: string,
  source: string,
  pageCount: number,
  typed: readonly (string | undefined)[] = []
) {
  return uniqueNames(
    parts.map((part, index) => {
      const own = typedStem(typed[index] ?? "")
      const stem =
        own ||
        partStem(pattern, part, {
          source,
          number: index + 1,
          total: parts.length,
          pageCount,
        })
      return `${stem}.pdf`
    })
  )
}

/** The name of the ZIP that holds every part. */
export const zipName = (source: string) =>
  `${safeSegment(baseName(source)).slice(0, MAX_STEM) || "pages"}-split.zip`
