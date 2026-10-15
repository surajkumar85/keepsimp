/**
 * Edits to a sound as a list of steps, never applied to the file itself:
 * keep a part, cut a part out, silence it, fade it in or out, or change its
 * volume. Each step is given in the times of the sound as it stood when the
 * step was made, as the person saw it. Since these steps only take sound
 * away or change how loud it is, never move it, what they do is kept
 * against the source's own times: the parts of the source that are kept,
 * in order, and the changes of loudness laid over them. A later cut cannot
 * disturb an earlier fade, and undoing is making the list again without
 * the last step.
 */

import { clockLabel } from "./labels"

export type Curve = "linear" | "power" | "s-curve"

export type Step =
  | { do: "keep"; from: number; to: number }
  | { do: "cut"; from: number; to: number }
  | { do: "silence"; from: number; to: number }
  | {
      do: "fade"
      from: number
      to: number
      direction: "in" | "out"
      curve: Curve
    }
  | { do: "gain"; from: number; to: number; db: number }

/** A part of the source an effect covers, and how far through the effect it runs (0 to 1). */
export interface Piece {
  from: number
  to: number
  /** Progress through the effect at `from` and at `to`. */
  p0: number
  p1: number
}

export type Effect =
  | { kind: "gain"; db: number; pieces: Piece[] }
  | { kind: "silence"; pieces: Piece[] }
  | {
      kind: "fade"
      direction: "in" | "out"
      curve: Curve
      pieces: Piece[]
    }

export interface Edited {
  /** The source's length, in seconds. */
  duration: number
  /** The parts of the source kept, in order, as [from, to] in seconds. */
  segments: [number, number][]
  effects: Effect[]
}

/** Every join between kept parts fades over this long, so that a cut never clicks. */
export const JOIN_FADE = 0.004
/** The shortest part a step may act on, in seconds. */
export const SHORTEST = 0.001
/** How much louder or quieter a part may be made, in dB. */
export const MOST_GAIN = 24

/** How loud a curve is at `x`, from 0 (silent) to 1 (as it was), as it rises. */
export function curveValue(curve: Curve, x: number) {
  const at = Math.min(1, Math.max(0, x))
  if (curve === "linear") return at
  if (curve === "power") return Math.sin((at * Math.PI) / 2)
  return (1 - Math.cos(at * Math.PI)) / 2
}

/** The sound with no edits. */
export const untouched = (duration: number): Edited => ({
  duration,
  segments: duration > 0 ? [[0, duration]] : [],
  effects: [],
})

/** How long the edited sound is, in seconds. */
export const lengthOf = (edited: Edited) =>
  edited.segments.reduce((sum, [from, to]) => sum + (to - from), 0)

/** The source time of a moment of the edited sound (the end, past it). */
export function sourceAt(edited: Edited, time: number) {
  let left = Math.max(0, time)
  for (const [from, to] of edited.segments) {
    if (left < to - from) return from + left
    left -= to - from
  }
  const last = edited.segments[edited.segments.length - 1]
  return last ? last[1] : 0
}

/** The moment of the edited sound a source time plays at; null when it was cut. */
export function outputAt(edited: Edited, source: number) {
  let before = 0
  for (const [from, to] of edited.segments) {
    if (source >= from && source <= to) return before + (source - from)
    before += to - from
  }
  return null
}

/** The parts of the source a stretch of the edited sound plays, with the progress through it. */
export function piecesOf(edited: Edited, from: number, to: number): Piece[] {
  const span = to - from
  const pieces: Piece[] = []
  let before = 0
  for (const [start, end] of edited.segments) {
    const length = end - start
    const a = Math.max(from, before)
    const b = Math.min(to, before + length)
    if (b > a)
      pieces.push({
        from: start + (a - before),
        to: start + (b - before),
        p0: (a - from) / span,
        p1: (b - from) / span,
      })
    before += length
  }
  return pieces
}

/** The kept parts of the source once `pieces` are taken away. */
function without(segments: [number, number][], pieces: Piece[]) {
  let kept = segments
  for (const piece of pieces) {
    const next: [number, number][] = []
    for (const [from, to] of kept) {
      if (piece.to <= from || piece.from >= to) next.push([from, to])
      else {
        if (piece.from > from) next.push([from, piece.from])
        if (piece.to < to) next.push([piece.to, to])
      }
    }
    kept = next
  }
  return kept
}

/** Why a step cannot be made on a sound of this length; null when it can. */
export function stepProblem(step: Step, length: number): string | null {
  if (!(step.from >= 0) || !(step.to <= length + 1e-9))
    return "Choose a part inside the sound."
  if (!(step.to - step.from >= SHORTEST))
    return "Choose a part of the sound first."
  if (step.do === "cut" && step.to - step.from >= length - 1e-9)
    return "Cutting all of it would leave nothing. Choose a part to cut."
  if (step.do === "gain" && !(Math.abs(step.db) <= MOST_GAIN))
    return `Choose a change of at most ${MOST_GAIN} dB either way.`
  return null
}

/** The edited sound after one more step; the same when the step cannot be made. */
export function apply(edited: Edited, step: Step): Edited {
  if (stepProblem(step, lengthOf(edited))) return edited
  const pieces = piecesOf(edited, step.from, step.to)
  switch (step.do) {
    case "keep":
      return {
        ...edited,
        segments: pieces.map((piece): [number, number] => [
          piece.from,
          piece.to,
        ]),
      }
    case "cut":
      return { ...edited, segments: without(edited.segments, pieces) }
    case "silence":
      return {
        ...edited,
        effects: [...edited.effects, { kind: "silence", pieces }],
      }
    case "fade":
      return {
        ...edited,
        effects: [
          ...edited.effects,
          {
            kind: "fade",
            direction: step.direction,
            curve: step.curve,
            pieces,
          },
        ],
      }
    case "gain":
      return {
        ...edited,
        effects: [...edited.effects, { kind: "gain", db: step.db, pieces }],
      }
  }
}

/** The edited sound after every step in turn. */
export const editedBy = (duration: number, steps: readonly Step[]) =>
  steps.reduce(apply, untouched(duration))

/** How loud one effect makes the source at `source`; 1 where it does not reach. */
function effectGain(effect: Effect, source: number) {
  for (const piece of effect.pieces) {
    if (source < piece.from || source >= piece.to) continue
    if (effect.kind === "silence") return 0
    if (effect.kind === "gain") return 10 ** (effect.db / 20)
    const progress =
      piece.p0 +
      ((source - piece.from) / (piece.to - piece.from)) * (piece.p1 - piece.p0)
    return curveValue(
      effect.curve,
      effect.direction === "in" ? progress : 1 - progress
    )
  }
  return 1
}

/**
 * How loud the source plays at `source`: every effect over it, and the
 * short fades at the ends of kept parts where the source was cut.
 */
export function gainAt(edited: Edited, source: number) {
  let gain = 1
  for (const effect of edited.effects) gain *= effectGain(effect, source)
  for (const [from, to] of edited.segments) {
    if (source < from || source > to) continue
    if (from > 0) gain *= Math.min(1, (source - from) / JOIN_FADE)
    if (to < edited.duration) gain *= Math.min(1, (to - source) / JOIN_FADE)
    break
  }
  return gain
}

/** Names the steps, so a result made with others is out of date. */
export const editsKey = (steps: readonly Step[]) => JSON.stringify(steps)

const CURVES: Record<Curve, string> = {
  linear: "even",
  power: "smooth",
  "s-curve": "S-curve",
}

/** A step in words, for the list of edits. */
export function stepSaid(step: Step) {
  const part = `${clockLabel(step.from)}–${clockLabel(step.to)}`
  switch (step.do) {
    case "keep":
      return `Kept ${part}`
    case "cut":
      return `Cut out ${part}`
    case "silence":
      return `Silenced ${part}`
    case "fade":
      return `Faded ${step.direction} ${part} (${CURVES[step.curve]})`
    case "gain":
      return `${step.db >= 0 ? "Louder" : "Quieter"} by ${Math.abs(step.db)} dB, ${part}`
  }
}
