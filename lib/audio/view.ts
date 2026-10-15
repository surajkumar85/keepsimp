/**
 * What the editor draws: the edited sound's waveform for the part of it in
 * view, worked out from the source's peaks (cut parts closed up, silence
 * flat, fades and volume changes at the loudness they give), and the marks
 * of the time ruler over it.
 */
import { gainAt, piecesOf, type Edited } from "./edits"
import type { Peaks } from "./peaks"

/** Peaks per second kept for a file: enough to zoom to 5 ms. */
export const PEAKS_PER_SECOND = 200
/** The fewest and most peaks a file has. */
export const FEWEST_PEAKS = 2000
export const MOST_PEAKS = 1_000_000

/** How many peaks a file of `seconds` is read into. */
export const peakCount = (seconds: number) =>
  Math.min(
    MOST_PEAKS,
    Math.max(FEWEST_PEAKS, Math.round(seconds * PEAKS_PER_SECOND))
  )

/**
 * The lowest and highest sample of each of `columns` columns showing
 * `from`–`to` seconds of the edited sound.
 */
export function columnsOf(
  peaks: Peaks,
  duration: number,
  edited: Edited,
  from: number,
  to: number,
  columns: number
): Peaks {
  const min = new Float32Array(columns)
  const max = new Float32Array(columns)
  const count = peaks.min.length
  const width = (to - from) / columns
  for (let column = 0; column < columns; column++) {
    const start = from + column * width
    let low = 0
    let high = 0
    for (const piece of piecesOf(edited, start, start + width)) {
      const gain = gainAt(edited, (piece.from + piece.to) / 2)
      const first = Math.floor((piece.from / duration) * count)
      const last = Math.min(
        count,
        Math.max(first + 1, Math.ceil((piece.to / duration) * count))
      )
      for (let index = first; index < last; index++) {
        low = Math.min(low, peaks.min[index] * gain)
        high = Math.max(high, peaks.max[index] * gain)
      }
    }
    min[column] = low + 0
    max[column] = high + 0
  }
  return { min, max }
}

/** The steps a time ruler may mark, in seconds. */
const STEPS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900,
  1800, 3600,
]

/** The ruler's marks for `from`–`to` seconds over `pixels`: at least `spacing` pixels apart. */
export function ticksOf(
  from: number,
  to: number,
  pixels: number,
  spacing = 80
) {
  const span = Math.max(to - from, 1e-9)
  const step =
    STEPS.find((one) => (one / span) * pixels >= spacing) ??
    STEPS[STEPS.length - 1]
  const ticks: number[] = []
  for (
    let at = Math.ceil(from / step - 1e-9) * step;
    at <= to + 1e-9;
    at += step
  )
    ticks.push(Math.round(at * 1000) / 1000 + 0)
  return { step, ticks }
}

/** A window of `span` seconds around `centre`, kept inside the sound. */
export function windowAround(centre: number, span: number, length: number) {
  const width = Math.min(Math.max(span, 0.01), length)
  const from = Math.min(Math.max(0, centre - width / 2), length - width)
  return { from: Math.max(0, from), to: Math.max(0, from) + width }
}
