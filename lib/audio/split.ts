/**
 * Splitting a sound (as edited) into parts: at markers, every so many
 * minutes, into a number of equal parts, or at its pauses (with the pause
 * left out, if asked). A part is the file written with one more step, a
 * keep of its stretch, so it is cut to the sample and checked as any
 * result is. Parts are named from the file's name and their number.
 */

import type { Step } from "./edits"
import { KEPT_EDGE, type Run } from "./silence"

export type SplitRule =
  | { by: "marks" }
  | { by: "every"; minutes: number }
  | { by: "count"; parts: number }
  | { by: "silence"; pause: number; drop: boolean }

export const defaultSplit: SplitRule = { by: "every", minutes: 5 }

/** No part is shorter than this, in seconds. */
export const SHORTEST_PART = 0.1
/** The most parts a file is split into. */
export const MOST_PARTS = 500

export interface PartTimes {
  from: number
  to: number
}

/** Why a rule cannot be used; null when it can. */
export function splitProblem(rule: SplitRule): string | null {
  if (rule.by === "every" && !(rule.minutes >= 0.1 && rule.minutes <= 600))
    return "Choose from 0.1 to 600 minutes."
  if (
    rule.by === "count" &&
    !(
      Number.isInteger(rule.parts) &&
      rule.parts >= 2 &&
      rule.parts <= MOST_PARTS
    )
  )
    return `Choose from 2 to ${MOST_PARTS} parts.`
  return null
}

/** Keep only cut times inside the sound, in order, a part's length apart. */
function tidy(points: number[], length: number) {
  const kept: number[] = []
  for (const point of [...points].sort((a, b) => a - b)) {
    const last = kept[kept.length - 1] ?? 0
    if (point - last >= SHORTEST_PART && length - point >= SHORTEST_PART)
      kept.push(point)
  }
  return kept
}

/**
 * The parts a rule makes of a sound `length` seconds long. `marks` are in
 * the times of the sound as edited; `pauses` are its silent stretches.
 */
export function partsOf(
  rule: SplitRule,
  length: number,
  marks: readonly number[],
  pauses: readonly Run[]
): PartTimes[] {
  if (length <= 0 || splitProblem(rule)) return []
  let points: number[] = []
  if (rule.by === "marks") points = [...marks]
  else if (rule.by === "every") {
    const step = rule.minutes * 60
    for (let at = step; at < length; at += step) points.push(at)
  } else if (rule.by === "count")
    points = Array.from(
      { length: rule.parts - 1 },
      (_, index) => ((index + 1) * length) / rule.parts
    )
  else {
    // At the middle of every pause inside the sound long enough; or, when
    // pauses are dropped, a part runs from just before its sound to just after.
    const inside = pauses.filter(
      (run) =>
        run.from > 0 && run.to < length && run.to - run.from >= rule.pause
    )
    if (rule.drop) {
      const parts: PartTimes[] = []
      let from =
        pauses[0] && pauses[0].from <= 0
          ? Math.max(0, pauses[0].to - KEPT_EDGE)
          : 0
      for (const run of inside) {
        parts.push({ from, to: run.from + KEPT_EDGE })
        from = run.to - KEPT_EDGE
      }
      const last = pauses[pauses.length - 1]
      const end =
        last && last.to >= length
          ? Math.min(length, last.from + KEPT_EDGE)
          : length
      parts.push({ from, to: end })
      return parts
        .filter((part) => part.to - part.from >= SHORTEST_PART)
        .slice(0, MOST_PARTS)
    }
    points = inside.map((run) => (run.from + run.to) / 2)
  }
  const cuts = tidy(points, length).slice(0, MOST_PARTS - 1)
  const edges = [0, ...cuts, length]
  return edges
    .slice(0, -1)
    .map((from, index) => ({ from, to: edges[index + 1] }))
}

/** The step that makes a part of the sound as edited. */
export const partStep = (part: PartTimes): Step => ({
  do: "keep",
  from: part.from,
  to: part.to,
})

/**
 * The parts' names: the file's own, a dash and a number padded to the same
 * width. No spaces: some browsers change them in the name of a download.
 */
export function partNames(base: string, count: number) {
  const width = Math.max(2, String(count).length)
  return Array.from(
    { length: count },
    (_, index) => `${base}-${String(index + 1).padStart(width, "0")}`
  )
}

/** Names what changes the parts. */
export const splitKey = (parts: readonly PartTimes[]) =>
  JSON.stringify(parts.map((part) => [part.from, part.to]))
