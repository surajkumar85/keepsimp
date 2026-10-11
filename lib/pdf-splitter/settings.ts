import {
  oddEvenParts,
  partKeys,
  partsFromCuts,
  partsFromRanges,
  planProblem,
  selectionPart,
  type Part,
  type Planned,
  type SplitMode,
} from "./parts"
import { megabytes, refusal, type Limits } from "@/lib/pdf-merger/settings"
import { DEFAULT_PATTERN } from "./naming"

/** Why a file cannot be split; null when it can be tried. */
export function fileProblem(
  file: { name: string; size: number },
  /** Its first bytes look like a PDF's. */
  pdf: boolean,
  limits: Limits
) {
  if (file.size === 0) return `${file.name} is empty.`
  if (!pdf) return refusal(file.name).replace(" or a picture.", ".")
  if (file.size > limits.fileBytes)
    return `${file.name} is larger than ${megabytes(limits.fileBytes)}.`
  return null
}

/** Why a file has too many pages to split; null when it has not. */
export const pagesProblem = (pages: number, most: number) =>
  pages > most
    ? `This file has ${pages.toLocaleString("en")} pages. Up to ${most.toLocaleString("en")} can be split at once.`
    : null

/** Everything that decides which parts a file is split into. */
export interface SplitChoices {
  mode: SplitMode
  /** Cuts placed between pages, each the page it comes after, counted from 0. */
  cuts: readonly number[]
  /** Ranges as typed, one part each. */
  ranges: string
  /** Pages selected to take out or to remove, counted from 0. */
  selected: ReadonlySet<number>
}

/** The parts the choices come to for a file with `count` pages, or why there are none. */
export function planFor(choices: SplitChoices, count: number): Planned {
  let parts: Part[]
  if (choices.mode === "ranges") {
    const read = partsFromRanges(choices.ranges, count)
    if ("problem" in read) return read
    parts = read.parts
  } else if (choices.mode === "cuts") parts = partsFromCuts(count, choices.cuts)
  else if (choices.mode === "oddeven") parts = oddEvenParts(count)
  else parts = selectionPart(choices.selected, count, choices.mode)
  const problem = planProblem(choices.mode, parts, count)
  return problem ? { problem } : { parts }
}

/** True for the ways of splitting that always give one file. */
export const givesOneFile = (mode: SplitMode) =>
  mode === "extract" || mode === "remove"

/** The pattern a part is named by when none is typed. */
export const patternFor = (mode: SplitMode) =>
  mode === "extract"
    ? "{name}-pages-{pages}"
    : mode === "remove"
      ? "{name}-edited"
      : mode === "oddeven"
        ? "{name}-{label}"
        : DEFAULT_PATTERN

/** One part as it will be written, or left out. */
export interface PlannedPart extends Part {
  /** Stays with the part while the plan changes (see `partKeys`). */
  key: string
  /** Its number among all the parts, from 1, whether or not it is written. */
  number: number
  /** A name typed for it; empty for the pattern's. */
  typed: string
  /** Left out of the result. */
  skipped: boolean
}

/** The parts of a plan with what was typed for each and which are left out. */
export function withOverrides(
  mode: SplitMode,
  parts: readonly Part[],
  names: Readonly<Record<string, string>>,
  skipped: ReadonlySet<string>
): PlannedPart[] {
  const keys = partKeys(mode, parts)
  return parts.map((part, index) => ({
    ...part,
    key: keys[index],
    number: index + 1,
    typed: names[keys[index]] ?? "",
    skipped: skipped.has(keys[index]),
  }))
}

/** Why nothing can be written though the plan itself is sound; null when something can. */
export const nothingToWrite = (parts: readonly PlannedPart[]) =>
  parts.every((part) => part.skipped)
    ? "Every part is left out. Include at least one."
    : null

/**
 * Says what a result was made from. A result whose key differs from the
 * current one is out of date.
 */
export const splitKey = (
  file: string,
  parts: readonly PlannedPart[],
  names: readonly string[]
) =>
  JSON.stringify([
    file,
    parts
      .filter((part) => !part.skipped)
      .map((part) => [part.number, part.pages]),
    names,
  ])

/** A count typed into a field, as a whole number of at least 1; null when it is not one. */
export function typedCount(text: string, most: number) {
  if (!/^\s*\d+\s*$/.test(text)) return null
  const value = Number(text)
  return value >= 1 && value <= most ? value : null
}
