/**
 * Freehand strokes. A pointer reports far more points than a line needs, and
 * a little unsteadily; a stroke is thinned to the points that shape it and
 * then drawn as curves through them.
 */
import { distanceToSegment, type Point } from "./geometry"

/**
 * A stroke with the points that add nothing taken out (Ramer, Douglas and
 * Peucker): a point stays when it lies further than `tolerance` from the
 * straight line between its neighbours that stay.
 */
export function thin(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }))
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const spans: [number, number][] = [[0, points.length - 1]]
  while (spans.length) {
    const [from, to] = spans.pop()!
    let far = -1
    let most = tolerance
    for (let index = from + 1; index < to; index++) {
      const distance = distanceToSegment(
        points[index],
        points[from],
        points[to]
      )
      if (distance > most) {
        most = distance
        far = index
      }
    }
    if (far < 0) continue
    keep[far] = true
    spans.push([from, far], [far, to])
  }
  return points.filter((_, index) => keep[index]).map((point) => ({ ...point }))
}

/** One piece of a drawn stroke: a curve from where the last piece ended. */
export interface Curve {
  /** The two points that pull the curve, and where it ends. */
  c1: Point
  c2: Point
  to: Point
}

/**
 * Curves through every point of a stroke, each leaving a point in the
 * direction of its neighbours (Catmull and Rom), so that the line has no
 * corners where the hand made none.
 */
export function curvesThrough(points: readonly Point[]): Curve[] {
  const curves: Curve[] = []
  for (let index = 0; index + 1 < points.length; index++) {
    const before = points[Math.max(0, index - 1)]
    const from = points[index]
    const to = points[index + 1]
    const after = points[Math.min(points.length - 1, index + 2)]
    curves.push({
      c1: {
        x: from.x + (to.x - before.x) / 6,
        y: from.y + (to.y - before.y) / 6,
      },
      c2: {
        x: to.x - (after.x - from.x) / 6,
        y: to.y - (after.y - from.y) / 6,
      },
      to: { ...to },
    })
  }
  return curves
}

const number = (value: number) => String(Math.round(value * 100) / 100)

/** A stroke as an SVG path, for showing it while it is drawn. */
export function strokePath(points: readonly Point[]) {
  if (!points.length) return ""
  const start = `M${number(points[0].x)} ${number(points[0].y)}`
  // A dot: a line of no length, which a round pen still shows.
  if (points.length === 1)
    return `${start}L${number(points[0].x)} ${number(points[0].y)}`
  return (
    start +
    curvesThrough(points)
      .map(
        (curve) =>
          `C${number(curve.c1.x)} ${number(curve.c1.y)} ${number(curve.c2.x)} ${number(curve.c2.y)} ${number(curve.to.x)} ${number(curve.to.y)}`
      )
      .join("")
  )
}
