/**
 * What the page says about a compression: how far it is, what was done and
 * what the check found, in plain sentences.
 */
import { sizeLabel } from "@/lib/image-compressor/formats"
import type { CheckResult } from "./check"
import { removalChoices, type Removal } from "./options"
import type { Mode, ScanChoice } from "./settings"

export type Stage = "reading" | "pictures" | "writing" | "checking"

/** The share of the whole job each part of the work takes, as where it starts and ends. */
const SHARES: Record<Stage, readonly [number, number]> = {
  reading: [0, 0.1],
  pictures: [0.1, 0.8],
  writing: [0.8, 0.85],
  checking: [0.85, 1],
}

/**
 * How far a compression is, as a whole percent.
 * @param attempt When the file is written several times to reach a size: which time this is, from 1.
 * @param attempts The most times it may be written.
 */
export function stagePercent(
  stage: Stage,
  done: number,
  total: number,
  attempt = 1,
  attempts = 1
) {
  const [from, to] = SHARES[stage]
  const part = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  const within = from + (to - from) * part
  const tries = Math.max(attempts, attempt)
  return Math.round(((attempt - 1 + within) / tries) * 100)
}

const count = (value: number) => value.toLocaleString("en")
const plural = (value: number, word: string) =>
  `${count(value)} ${word}${value === 1 ? "" : "s"}`

export function stageText(
  stage: Stage,
  done: number,
  total: number,
  attempt?: number
) {
  // Work on the next one has begun when `done` are finished.
  const now = count(Math.min(done + 1, Math.max(total, 1)))
  const doing =
    stage === "reading"
      ? `Looking at page ${now} of ${count(total)}`
      : stage === "pictures"
        ? `Picture ${now} of ${count(total)}`
        : stage === "writing"
          ? "Writing the file"
          : `Checking page ${now} of ${count(total)}`
  // Checking comes once, after the last try.
  return attempt && stage !== "checking" ? `Try ${attempt}: ${doing}` : doing
}

/** What was done to a file, one plain sentence each. */
export function changeLines(report: {
  pictures: { found: number; changed: number; resized: number }
  fontsCut: boolean
  dropped: { thumbnails: number; private: number }
  scans?: { how: ScanChoice; pictures: number }
  taken?: readonly (keyof Removal)[]
  locked?: boolean
}) {
  const lines: string[] = []
  if (report.scans?.pictures) {
    const pages = plural(report.scans.pictures, "scanned page")
    lines.push(
      report.scans.how === "layers"
        ? `${pages} rebuilt as sharp letters over soft paper.`
        : report.scans.how === "mono"
          ? `${pages} turned black and white.`
          : `${pages} turned to greyscale.`
    )
  }
  const { found, changed, resized } = report.pictures
  if (changed)
    lines.push(
      `${count(changed)} of ${plural(found, "picture")} made smaller` +
        (resized
          ? `, ${count(resized)} of them brought down to the size ${resized === 1 ? "it is" : "they are"} shown at.`
          : ".")
    )
  if (report.fontsCut) lines.push("Fonts cut down to the letters in use.")
  if (report.dropped.thumbnails) lines.push("Page thumbnails taken out.")
  if (report.dropped.private)
    lines.push("Private data of the app that made the file taken out.")
  lines.push("The file was tidied and packed tighter.")
  if (report.taken?.length)
    lines.push(
      `Taken out because you asked: ${removalChoices
        .filter((choice) => report.taken!.includes(choice.key))
        .map((choice) => TAKEN[choice.key])
        .join(", ")}.`
    )
  if (report.locked) lines.push("Locked with your password.")
  return lines
}

/** What each thing that can be taken out is called in a list of them. */
const TAKEN: Record<keyof Removal, string> = {
  details: "document details",
  attachments: "attached files",
  bookmarks: "bookmarks",
  comments: "notes and highlights",
  scripts: "scripts",
  tags: "accessibility tags",
  flatten: "form fields (what was filled in stays)",
}

export interface CheckLine {
  text: string
  /** False when some page looks less alike than it should. */
  passed: boolean
}

/**
 * What the comparison of pages before and after came to; null when no page was compared.
 * @param remade Pages were rebuilt in a way that changes how they look on
 *   purpose (black and white, grey): they are compared, but not called the same.
 */
export function checkLine(
  check: CheckResult,
  remade = false
): CheckLine | null {
  if (!check.checked) return null
  if (check.low.length) {
    const pages = check.low.map((entry) => entry.page + 1)
    return {
      passed: false,
      text: `${plural(pages.length, "page")} changed more than expected: ${pages.length === 1 ? "page" : "pages"} ${pages.join(", ")}. Compare before you download.`,
    }
  }
  const sampled =
    check.changed > check.checked
      ? ` out of ${count(check.changed)} with changed pictures`
      : ""
  return {
    passed: true,
    text: remade
      ? `Checked: ${plural(check.checked, "page")}${sampled} compared with the original. ${check.checked === 1 ? "It differs" : "They differ"} only as you asked.`
      : `Checked: ${plural(check.checked, "page")}${sampled} ${check.checked === 1 ? "looks" : "look"} the same before and after.`,
  }
}

/**
 * What to say when a file came out no smaller.
 * @param target For a file that was to come out under a size: that size, and whether it is under it.
 */
export function alreadySmall(
  mode: Mode,
  target?: { wanted: number; met: boolean }
) {
  if (mode === "size" && target)
    return target.met
      ? `This file is already under ${sizeLabel(target.wanted)}, and nothing can be taken out without changing how it looks.`
      : `This file is over ${sizeLabel(target.wanted)}, and nothing in it can be made smaller. Splitting it into parts with the PDF splitter makes each part smaller.`
  const start = "This file is already as small as this level can make it."
  if (mode === "lossless")
    return `${start} Balanced also makes its pictures smaller.`
  if (mode === "balanced") return `${start} Strong goes further.`
  if (mode === "custom")
    return "These settings do not make this file smaller. Try a lower resolution or quality."
  return `${start} Nothing more can come out without making it hard to read.`
}

export interface TargetLine {
  text: string
  met: boolean
  /** What would help when the size was missed. */
  advice: string[]
}

/**
 * What came of compressing a file to a size.
 * @param after The size of the result in bytes.
 * @param rest What everything but its pictures weighs in the result.
 */
export function targetLine(
  target: { wanted: number; met: boolean },
  after: number,
  rest: number,
  further: boolean
): TargetLine {
  if (target.met)
    return {
      met: true,
      text: `Fits: ${sizeLabel(after)} is under ${sizeLabel(target.wanted)}.`,
      advice: [],
    }
  const advice: string[] = []
  if (rest > target.wanted)
    advice.push(
      `Its text, fonts and structure alone take ${sizeLabel(rest)}, so no picture setting can reach this size.`
    )
  else if (!further)
    advice.push(
      "Turn on “Go further” to let pictures get blurry, if the size matters more than how they look."
    )
  advice.push(
    "Splitting the file into parts with the PDF splitter makes each part smaller."
  )
  return {
    met: false,
    text: `Could not get under ${sizeLabel(target.wanted)}. ${further ? "This is the smallest it can be made" : "This is the smallest that is still easy to read"}: ${sizeLabel(after)}, ${sizeLabel(after - target.wanted)} over.`,
    advice,
  }
}

/** Several files compressed: what they came to together. */
export function batchLine(
  results: readonly { before: number; after: number }[]
) {
  const before = results.reduce((sum, result) => sum + result.before, 0)
  const after = results.reduce((sum, result) => sum + result.after, 0)
  // Files that grew a little, for a password's sake, are not a negative saving.
  const percent =
    before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0
  return {
    before,
    after,
    percent,
    text: `${plural(results.length, "file")} · ${sizeLabel(before)} → ${sizeLabel(after)}`,
  }
}

/** A row's few words about a file that has been compressed. */
export function rowSummary(report: {
  before: number
  after: number
  smaller: boolean
  target?: { wanted: number; met: boolean }
}) {
  if (!report.smaller)
    return report.target && !report.target.met
      ? `Could not get under ${sizeLabel(report.target.wanted)}`
      : "Already small: left as it is"
  const sizes = `${sizeLabel(report.before)} → ${sizeLabel(report.after)}`
  // A file that was only locked, or had things taken out, may be no smaller.
  if (report.after >= report.before) return sizes
  const percent = Math.round((1 - report.after / report.before) * 100)
  const missed =
    report.target && !report.target.met
      ? ` · over ${sizeLabel(report.target.wanted)}`
      : ""
  return `${sizes} · ${percent}% smaller${missed}`
}

/** What the page says about a file before it is compressed. */
export function fileNotes(
  facts: {
    repaired: boolean
    unlocked: boolean
    signed: boolean
  },
  archive: boolean
) {
  const notes: string[] = []
  if (facts.repaired) notes.push("This file was damaged and has been repaired.")
  if (facts.unlocked) notes.push("The result keeps its password.")
  if (facts.signed)
    notes.push(
      "This file is signed. Its signature will no longer be valid in the result."
    )
  if (archive)
    notes.push(
      "This is an archive file (PDF/A). The result may no longer pass an archive check."
    )
  return notes
}

/** Pictures with more pixels than this are left as they are; fewer on a phone. */
export const pixelLimit = (phone: boolean) => (phone ? 16_000_000 : 40_000_000)
