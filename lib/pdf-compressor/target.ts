/**
 * Compressing to a size. The only way to know what a file weighs at some
 * setting is to write it, so the settings are laid out as steps from gentle
 * to harsh, and the gentlest step that fits is found by writing a few of
 * them.
 */
import type { LevelPlan } from "./settings"

/** One step: pictures at most this many pixels per inch, JPEGs at this quality. */
export interface Rung {
  dpi: number
  quality: number
}

/** From gentle to harsh. The numbers are KeepSimp's own. */
export const RUNGS: readonly Rung[] = [
  { dpi: 220, quality: 88 },
  { dpi: 180, quality: 84 },
  { dpi: 150, quality: 80 },
  { dpi: 150, quality: 72 },
  { dpi: 120, quality: 68 },
  { dpi: 110, quality: 62 },
  { dpi: 96, quality: 58 },
  { dpi: 96, quality: 50 },
  { dpi: 84, quality: 46 },
  { dpi: 72, quality: 42 },
  { dpi: 60, quality: 38 },
  { dpi: 50, quality: 34 },
  { dpi: 42, quality: 30 },
  { dpi: 36, quality: 26 },
]

/** How many of the rungs still leave pictures easy to read. The rest are only used when asked for. */
export const READABLE_RUNGS = 10

/**
 * How many steps there are to try. Step 0 changes nothing that can be seen;
 * step N is rung N - 1.
 * @param further Also use the rungs that may leave pictures blurry.
 */
export const stepCount = (further: boolean) =>
  1 + (further ? RUNGS.length : READABLE_RUNGS)

/** What a step does to pictures; null for the step that loses nothing. */
export function stepPlan(step: number): LevelPlan | null {
  const rung = RUNGS[step - 1]
  if (!rung) return null
  return {
    dpi: rung.dpi,
    // Every step down in size must count, so a picture is resized as soon as it is over.
    slack: 1.1,
    look: "smallest",
    keepBelow: rung.quality,
    floor: rung.quality,
    fixed: rung.quality,
    again: true,
  }
}

export interface Fit<T> {
  /** The step the result was written at. */
  step: number
  result: T
  /** False when even the last step came out over the size; the result is then that last step's. */
  met: boolean
}

/**
 * Find the gentlest step whose result fits.
 * @param steps How many steps there are, from 0.
 * @param target The size to stay within, in bytes.
 * @param write Writes the file at a step and says what it weighs.
 */
export async function fitTarget<T extends { bytes: number }>(
  steps: number,
  target: number,
  write: (step: number) => Promise<T>
): Promise<Fit<T>> {
  const first = await write(0)
  if (first.bytes <= target || steps <= 1)
    return { step: 0, result: first, met: first.bytes <= target }
  const last = await write(steps - 1)
  if (last.bytes > target) return { step: steps - 1, result: last, met: false }
  // `low` is known not to fit and `high` to fit; sizes fall as steps rise.
  let low = 0
  let high = steps - 1
  let best = last
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    const result = await write(middle)
    if (result.bytes <= target) {
      high = middle
      best = result
    } else low = middle
  }
  return { step: high, result: best, met: true }
}

/** The most times a file is written to find its step: both ends, then halving. */
export const mostWrites = (steps: number) =>
  steps <= 1 ? 1 : 2 + Math.ceil(Math.log2(steps - 1))

const KB = 1024
const MB = 1024 * KB

/** Sizes people are most often asked to stay under, in bytes. */
export const targetSizes: readonly { bytes: number; label: string }[] = [
  { bytes: 100 * KB, label: "100 KB" },
  { bytes: 200 * KB, label: "200 KB" },
  { bytes: 500 * KB, label: "500 KB" },
  { bytes: MB, label: "1 MB" },
  { bytes: 2 * MB, label: "2 MB" },
  { bytes: 5 * MB, label: "5 MB" },
  { bytes: 10 * MB, label: "10 MB" },
  { bytes: 25 * MB, label: "25 MB" },
]
