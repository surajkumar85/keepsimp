/**
 * Ringtones: the part of a sound a phone will take, and the steps that make
 * it. An iPhone takes a ringtone of at most 40 seconds and an alert tone of
 * at most 30, as M4R; Android takes an MP3 of any length, and 30 seconds is
 * a ringtone's usual length there. A ringtone fades out at its end, and in
 * very briefly at its start so that it does not begin with a click.
 */

import type { Step } from "./edits"
import type { OutputFormat } from "./formats"

export type RingtoneKind = "iphone" | "alert" | "android"

export interface Ringtone {
  label: string
  format: OutputFormat
  /** The longest the phone takes, or a usual length where it takes any. */
  seconds: number
  /** Whether the phone refuses anything longer. */
  limit: boolean
}

export const RINGTONES: Record<RingtoneKind, Ringtone> = {
  iphone: { label: "iPhone ringtone", format: "m4r", seconds: 40, limit: true },
  alert: {
    label: "iPhone alert tone",
    format: "m4r",
    seconds: 30,
    limit: true,
  },
  android: {
    label: "Android ringtone",
    format: "mp3",
    seconds: 30,
    limit: false,
  },
}

/** How long a ringtone fades in and out over, at most. */
export const FADE_IN = 0.05
export const FADE_OUT = 2

/**
 * The part of the sound (`length` seconds, as it stands) to make the
 * ringtone of: the selection, cut to the longest the phone takes; with no
 * selection, that long from `at`, moved back if it would run past the end.
 */
export function ringtonePart(
  kind: RingtoneKind,
  at: number,
  selection: { from: number; to: number } | null,
  length: number
) {
  const most = RINGTONES[kind].seconds
  if (selection && selection.to > selection.from)
    return {
      from: selection.from,
      to: Math.min(selection.to, selection.from + most),
    }
  const span = Math.min(most, length)
  const from = Math.max(0, Math.min(at, length - span))
  return { from, to: from + span }
}

/** The steps that make a ringtone of `part` of a sound `length` long: keep it, and fade its ends. */
export function ringtoneSteps(
  part: { from: number; to: number },
  length: number
): Step[] {
  const steps: Step[] = []
  if (part.from > 0 || part.to < length)
    steps.push({ do: "keep", from: part.from, to: part.to })
  const span = part.to - part.from
  // A short part is faded over at most a quarter of its length at each end.
  const fadeIn = Math.min(FADE_IN, span / 4)
  const fadeOut = Math.min(FADE_OUT, span / 4)
  steps.push(
    { do: "fade", from: 0, to: fadeIn, direction: "in", curve: "linear" },
    {
      do: "fade",
      from: span - fadeOut,
      to: span,
      direction: "out",
      curve: "s-curve",
    }
  )
  return steps
}
