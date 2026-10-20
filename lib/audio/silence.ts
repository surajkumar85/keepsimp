/**
 * Silence in a sound as edited, found from its peaks: the stretches where
 * every channel stays under a level for long enough. Trimming the ends and
 * shortening long pauses are ordinary steps (a keep, and cuts), so they are
 * undone like any other and the file itself is never changed.
 */

import { gainAt, lengthOf, sourceAt, type Edited, type Step } from "./edits"
import type { Peaks } from "./peaks"

/** A stretch of the edited sound, in seconds. */
export interface Run {
  from: number
  to: number
}

/** How finely silence is looked for, in seconds: one peak of the waveform. */
export const SILENCE_STEP = 0.005

/** The levels offered as "silent under", in dBFS, and the pause lengths. */
export const SILENCE_LEVELS = [-60, -50, -40] as const
export const PAUSES = [0.5, 1, 2] as const
/** What a long pause is shortened to, and what is left at the ends, in seconds. */
export const KEPT_PAUSE = 0.4
export const KEPT_EDGE = 0.1

/**
 * The silent stretches of the edited sound at least `shortest` seconds
 * long, under `level` dBFS in every channel. A part silenced by an edit is
 * silent; a fade or a volume change counts at the loudness it gives.
 */
export function silentRuns(
  peaks: Peaks,
  duration: number,
  edited: Edited,
  level: number,
  shortest: number
): Run[] {
  const length = lengthOf(edited)
  const limit = 10 ** (level / 20)
  const count = peaks.min.length
  const runs: Run[] = []
  let start: number | null = null
  const steps = Math.ceil(length / SILENCE_STEP)
  for (let step = 0; step <= steps; step++) {
    const time = Math.min(length, step * SILENCE_STEP)
    let quiet = false
    if (step < steps) {
      const source = sourceAt(edited, time + SILENCE_STEP / 2)
      const index = Math.min(count - 1, Math.floor((source / duration) * count))
      const loudest = Math.max(-peaks.min[index], peaks.max[index])
      quiet = loudest * gainAt(edited, source) < limit
    }
    if (quiet && start === null) start = time
    if (!quiet && start !== null) {
      if (time - start >= shortest) runs.push({ from: start, to: time })
      start = null
    }
  }
  return runs
}

/** The step that trims silence at both ends, leaving `KEPT_EDGE`; null when there is none. */
export function trimEnds(runs: Run[], length: number): Step | null {
  const first = runs[0]
  const last = runs[runs.length - 1]
  // Silent all through: there is nothing to keep.
  if (first && first.from <= 0 && first.to >= length) return null
  const from = first && first.from <= 0 ? Math.max(0, first.to - KEPT_EDGE) : 0
  const to =
    last && last.to >= length && last.from > from
      ? Math.min(length, last.from + KEPT_EDGE)
      : length
  if (from <= 0 && to >= length) return null
  return { do: "keep", from, to }
}

/**
 * The cuts that shorten every pause longer than `longest` (not at the
 * ends) to `KEPT_PAUSE`, from the last to the first so that each is given
 * in the times as they stand when it is made; the seconds taken out.
 */
export function shortenPauses(
  runs: Run[],
  length: number,
  longest: number
): { steps: Step[]; removed: number } {
  const steps: Step[] = []
  let removed = 0
  const inside = runs.filter(
    (run) => run.from > 0 && run.to < length && run.to - run.from > longest
  )
  for (const run of inside.reverse()) {
    const keep = Math.min(KEPT_PAUSE, longest)
    const from = run.from + keep / 2
    const to = run.to - keep / 2
    if (to - from < SILENCE_STEP) continue
    steps.push({ do: "cut", from, to })
    removed += to - from
  }
  return { steps, removed }
}
