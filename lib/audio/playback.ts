/**
 * Playing the edited sound from the file as it is: the player plays the
 * source, and is moved past what was cut and made as loud as the edits say
 * as it goes. What is heard is a preview; the file written is exact.
 */

import type { Edited } from "./edits"

/** Closer than this to a kept part's end, the player goes on to the next. */
const NEAR_END = 0.002

/**
 * Where the player should be once it has reached `source`: the same place
 * inside a kept part, the start of the next one, or nowhere (the end).
 */
export function playFrom(edited: Edited, source: number): number | null {
  for (const [from, to] of edited.segments)
    if (to - NEAR_END > source) return Math.max(from, source)
  return null
}
