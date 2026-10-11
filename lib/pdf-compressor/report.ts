/**
 * What the page says about a compression: how far it is, what was done and
 * what the check found, in plain sentences.
 */
import type { CheckResult } from "./check"
import type { Level } from "./settings"

export type Stage = "reading" | "pictures" | "writing" | "checking"

/** The share of the whole job each part of the work takes, as where it starts and ends. */
const SHARES: Record<Stage, readonly [number, number]> = {
  reading: [0, 0.1],
  pictures: [0.1, 0.8],
  writing: [0.8, 0.85],
  checking: [0.85, 1],
}

/** How far a compression is, as a whole percent. */
export function stagePercent(stage: Stage, done: number, total: number) {
  const [from, to] = SHARES[stage]
  const part = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  return Math.round((from + (to - from) * part) * 100)
}

const count = (value: number) => value.toLocaleString("en")
const plural = (value: number, word: string) =>
  `${count(value)} ${word}${value === 1 ? "" : "s"}`

export function stageText(stage: Stage, done: number, total: number) {
  // Work on the next one has begun when `done` are finished.
  const now = count(Math.min(done + 1, Math.max(total, 1)))
  if (stage === "reading") return `Looking at page ${now} of ${count(total)}`
  if (stage === "pictures") return `Picture ${now} of ${count(total)}`
  if (stage === "writing") return "Writing the file"
  return `Checking page ${now} of ${count(total)}`
}

/** What was done to a file, one plain sentence each. */
export function changeLines(report: {
  pictures: { found: number; changed: number; resized: number }
  fontsCut: boolean
  dropped: { thumbnails: number; private: number }
}) {
  const lines: string[] = []
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
  return lines
}

export interface CheckLine {
  text: string
  /** False when some page looks less alike than it should. */
  passed: boolean
}

/** What the comparison of pages before and after came to; null when no page was compared. */
export function checkLine(check: CheckResult): CheckLine | null {
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
    text: `Checked: ${plural(check.checked, "page")}${sampled} ${check.checked === 1 ? "looks" : "look"} the same before and after.`,
  }
}

/** What to say when a file came out no smaller. */
export function alreadySmall(level: Level) {
  const start = "This file is already as small as this level can make it."
  if (level === "lossless")
    return `${start} Balanced also makes its pictures smaller.`
  if (level === "balanced") return `${start} Strong goes further.`
  return `${start} Nothing more can come out without making it hard to read.`
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
