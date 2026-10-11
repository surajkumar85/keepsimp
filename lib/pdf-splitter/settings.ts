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
import {
  headingsAt,
  partsFromHeadings,
  type FrontChoice,
  type Heading,
} from "./bookmarks"
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

/**
 * Which of the files being added can be taken, given what is already there.
 * @returns For each new file, null when it is taken or the reason it is not.
 */
export function admitFiles(
  current: readonly { size: number }[],
  incoming: readonly { name: string; size: number; pdf: boolean }[],
  limits: Limits
): (string | null)[] {
  let count = current.length
  let total = current.reduce((sum, file) => sum + file.size, 0)
  return incoming.map((file) => {
    const problem = fileProblem(file, file.pdf, limits)
    if (problem) return problem
    if (count >= limits.files)
      return `${file.name} was left out: up to ${limits.files} files can be split at once.`
    if (total + file.size > limits.totalBytes)
      return `${file.name} was left out: together the files would be larger than ${megabytes(limits.totalBytes)}.`
    count++
    total += file.size
    return null
  })
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
  /** For bookmarks: those of the file that lead to pages, the level to split at and words their titles must hold. */
  headings?: readonly Heading[]
  level?: number
  filter?: string
  /** Bookmarks not to split at, by the page they open. */
  unticked?: ReadonlySet<number>
  front?: FrontChoice
  /** For sizes: the parts the last split by size came to. */
  sized?: readonly Part[]
}

/** Why a file cannot be split at its bookmarks; null when it can. */
export function bookmarksProblem(
  all: readonly Heading[],
  atLevel: readonly Heading[],
  chosen: readonly Heading[]
) {
  if (!all.length) return "This file has no bookmarks that lead to pages."
  if (!atLevel.length) return "No bookmark at this level matches."
  if (!chosen.length) return "Tick at least one bookmark."
  return null
}

/** The parts the choices come to for a file with `count` pages, or why there are none. */
export function planFor(choices: SplitChoices, count: number): Planned {
  let parts: Part[]
  if (choices.mode === "ranges") {
    const read = partsFromRanges(choices.ranges, count)
    if ("problem" in read) return read
    parts = read.parts
  } else if (choices.mode === "bookmarks") {
    const all = choices.headings ?? []
    const atLevel = headingsAt(all, choices.level ?? 1, choices.filter)
    const chosen = atLevel.filter(
      (heading) => !choices.unticked?.has(heading.page)
    )
    const problem = bookmarksProblem(all, atLevel, chosen)
    if (problem) return { problem }
    parts = partsFromHeadings(chosen, count, choices.front ?? "own")
  } else if (choices.mode === "size")
    // The parts are only known once the file has been split.
    return { parts: [...(choices.sized ?? [])] }
  else if (choices.mode === "cuts") parts = partsFromCuts(count, choices.cuts)
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
        : mode === "bookmarks"
          ? "{name}-{part}-{label}"
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
 * Says what a file's result was made from: the file and the pages of each
 * part that is written. A result whose key differs from the current one is
 * out of date. Names are not part of it: a part can be renamed after it is
 * made.
 */
export const splitKey = (file: string, parts: readonly PlannedPart[]) =>
  JSON.stringify([
    file,
    parts
      .filter((part) => !part.skipped)
      .map((part) => [part.number, part.pages]),
  ])

/** The same for a split by size, whose parts are only known once it has run. */
export const sizeKey = (file: string, limit: number) =>
  JSON.stringify([file, "size", limit])

/** A count typed into a field, as a whole number of at least 1; null when it is not one. */
export function typedCount(text: string, most: number) {
  if (!/^\s*\d+\s*$/.test(text)) return null
  const value = Number(text)
  return value >= 1 && value <= most ? value : null
}
