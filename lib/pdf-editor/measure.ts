/**
 * Measuring lines: how long a line on a page is in the units people use,
 * and where its end marks and its label go. A PDF's points are a
 * seventy-second of an inch, so a line on a page drawn at full size has a
 * real length; a drawing made to a scale is measured by that scale.
 */
import type { Point } from "./geometry"

export const MEASURE_UNITS = ["mm", "cm", "m", "in", "ft", "pt"] as const
export type MeasureUnit = (typeof MEASURE_UNITS)[number]

/** How many points one of each unit is. */
const POINTS: Record<MeasureUnit, number> = {
  pt: 1,
  in: 72,
  ft: 864,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  m: 7200 / 2.54,
}

/** The smallest and largest scale a drawing can be measured by: one on the page to this many in the world. */
export const SMALLEST_SCALE = 0.001
export const LARGEST_SCALE = 100_000

/** The size of a label's letters, half the length of an end mark, and how far the label sits off its line. */
export const MEASURE_TEXT = 9
export const MEASURE_TICK = 5
export const MEASURE_LIFT = 3
/** Room around a measuring line for its end marks and its label. */
export const MEASURE_ROOM = MEASURE_TEXT + MEASURE_LIFT + 2

export const lengthOf = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y)

/**
 * What a measuring line says: its length in a unit, by a scale, with as
 * many decimals as the size of the number is worth.
 * @param scale One on the page is this many in the world.
 */
export function measured(
  from: Point,
  to: Point,
  unit: MeasureUnit,
  scale: number
) {
  const value = (lengthOf(from, to) / POINTS[unit]) * scale
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toLocaleString("en", { maximumFractionDigits: digits })} ${unit}`
}

/** The marks across each end of a measuring line. A line of no length has none. */
export function measureTicks(from: Point, to: Point): [Point, Point][] {
  const length = lengthOf(from, to)
  if (length === 0) return []
  const across = {
    x: (-(to.y - from.y) / length) * MEASURE_TICK,
    y: ((to.x - from.x) / length) * MEASURE_TICK,
  }
  return [from, to].map((end): [Point, Point] => [
    { x: end.x - across.x, y: end.y - across.y },
    { x: end.x + across.x, y: end.y + across.y },
  ])
}

/**
 * Where a measuring line's label goes: about the middle of the line, turned
 * the way the line runs, and never upside down.
 * @returns The middle of the line, and the turn of the label in degrees, clockwise.
 */
export function labelPlace(from: Point, to: Point) {
  let angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  // A line that runs leftwards is read from its other end, and one that
  // stands upright from below, as dimensions on a drawing are.
  if (angle >= 90) angle -= 180
  else if (angle < -90) angle += 180
  return {
    middle: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    angle: Math.abs(angle) < 1e-9 ? 0 : angle,
  }
}
