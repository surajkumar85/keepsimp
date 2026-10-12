/**
 * Places on a page. Everything is in the page's own points with the origin at
 * its top left corner and y running down, which is how the engine speaks of a
 * page as it is shown, whatever turn the file gives it.
 */
import type { Size } from "@/lib/image-compressor/geometry"

export interface Point {
  x: number
  y: number
}

/** An upright box: its top left corner and its size. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The eight places a box is pulled by: its corners and the middles of its sides. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export const HANDLES: readonly Handle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
]

/** Where a handle sits on a box, from -1 (left, top) to 1 (right, bottom). */
export const handleSide = (handle: Handle): Point => ({
  x: handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0,
  y: handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0,
})

const radians = (degrees: number) => (degrees * Math.PI) / 180

/** An angle brought into 0 up to, not including, 360. */
export const wholeTurn = (degrees: number) => ((degrees % 360) + 360) % 360

/** A vector turned clockwise, as the eye sees it on a page whose y runs down. */
export function turnVector(vector: Point, degrees: number): Point {
  const cos = Math.cos(radians(degrees))
  const sin = Math.sin(radians(degrees))
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  }
}

/** A point turned clockwise about another. */
export function turnAbout(point: Point, centre: Point, degrees: number): Point {
  const turned = turnVector(
    { x: point.x - centre.x, y: point.y - centre.y },
    degrees
  )
  return { x: centre.x + turned.x, y: centre.y + turned.y }
}

export const centreOf = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/** The corners of a box turned about its centre: top left, top right, bottom right, bottom left. */
export function cornersOf(box: Box, degrees: number): Point[] {
  const centre = centreOf(box)
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((corner) => turnAbout(corner, centre, degrees))
}

/** The upright box around some points; nothing at the origin when there are none. */
export function boundsOf(points: readonly Point[]): Box {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of points) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The upright box around a turned box. */
export const turnedBounds = (box: Box, degrees: number) =>
  boundsOf(cornersOf(box, degrees))

/** Where a handle of a turned box is on the page. */
export function handlePoint(box: Box, degrees: number, handle: Handle): Point {
  const side = handleSide(handle)
  const centre = centreOf(box)
  return turnAbout(
    {
      x: centre.x + (side.x * box.width) / 2,
      y: centre.y + (side.y * box.height) / 2,
    },
    centre,
    degrees
  )
}

/** Whether a point is inside a turned box, with some room around it. */
export function insideBox(
  point: Point,
  box: Box,
  degrees: number,
  room = 0
): boolean {
  const local = turnAbout(point, centreOf(box), -degrees)
  return (
    local.x >= box.x - room &&
    local.x <= box.x + box.width + room &&
    local.y >= box.y - room &&
    local.y <= box.y + box.height + room
  )
}

/** How far a point is from the stretch between two others. */
export function distanceToSegment(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = dx * dx + dy * dy
  const along =
    length === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / length
          )
        )
  return Math.hypot(
    point.x - (from.x + dx * along),
    point.y - (from.y + dy * along)
  )
}

/** How far a point is from a line drawn through several points. */
export function distanceToPath(point: Point, path: readonly Point[]) {
  if (!path.length) return Infinity
  let nearest = Math.hypot(point.x - path[0].x, point.y - path[0].y)
  for (let index = 1; index < path.length; index++)
    nearest = Math.min(
      nearest,
      distanceToSegment(point, path[index - 1], path[index])
    )
  return nearest
}

/** No box may be pulled smaller than this, in points. */
export const SMALLEST = 4

/**
 * A turned box after one of its handles has been pulled to a point. The side
 * or corner across from the handle stays where it is.
 * @param keepShape Keep the box's proportions (for a corner handle).
 */
export function pullHandle(
  box: Box,
  degrees: number,
  handle: Handle,
  to: Point,
  keepShape = false
): Box {
  const side = handleSide(handle)
  // What stays put: the point across from the handle.
  const anchor = handlePoint(box, degrees, opposite(handle))
  const pulled = turnVector(
    { x: to.x - anchor.x, y: to.y - anchor.y },
    -degrees
  )
  let width = side.x === 0 ? box.width : Math.max(SMALLEST, pulled.x * side.x)
  let height = side.y === 0 ? box.height : Math.max(SMALLEST, pulled.y * side.y)
  if (keepShape && side.x !== 0 && side.y !== 0) {
    const scale = Math.max(width / box.width, height / box.height)
    width = box.width * scale
    height = box.height * scale
  }
  const centre = turnVector(
    { x: (side.x * width) / 2, y: (side.y * height) / 2 },
    degrees
  )
  return {
    x: anchor.x + centre.x - width / 2,
    y: anchor.y + centre.y - height / 2,
    width,
    height,
  }
}

const OPPOSITE: Record<Handle, Handle> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
}

export const opposite = (handle: Handle) => OPPOSITE[handle]

/** The angle, clockwise from straight up, at which a point lies from a centre. */
export const angleFrom = (centre: Point, point: Point) =>
  wholeTurn(
    (Math.atan2(point.x - centre.x, centre.y - point.y) * 180) / Math.PI
  )

/** Angles a turn settles on when it comes within a few degrees: every eighth of a circle. */
export function settleAngle(degrees: number, within = 4) {
  const whole = wholeTurn(degrees)
  const nearest = Math.round(whole / 45) * 45
  return Math.abs(whole - nearest) <= within ? wholeTurn(nearest) : whole
}

/** A box kept on its page: moved back so that at least `keep` points of it stay inside. */
export function keepOnPage(box: Box, page: Size, keep = 8): Box {
  return {
    ...box,
    x: Math.min(page.width - keep, Math.max(keep - box.width, box.x)),
    y: Math.min(page.height - keep, Math.max(keep - box.height, box.y)),
  }
}

/**
 * The middle of the part of a page that can be seen, in the page's points.
 * A page is often taller than the window it is read in, and a thing placed
 * in the middle of the whole page would land out of sight.
 * @param shown Where the page is on the screen.
 * @param view The part of the screen its pages are read through.
 * @param room How far from the page's edges the point is kept, in points.
 */
export function seenMiddle(shown: Box, view: Box, page: Size, room = 0): Point {
  const left = Math.max(shown.x, view.x)
  const right = Math.min(shown.x + shown.width, view.x + view.width)
  const top = Math.max(shown.y, view.y)
  const bottom = Math.min(shown.y + shown.height, view.y + view.height)
  // A page that is out of sight, or has no size yet, is given its own middle.
  if (!(right > left && bottom > top))
    return { x: page.width / 2, y: page.height / 2 }
  const within = (value: number, most: number) => {
    const edge = Math.min(room, most / 2)
    return Math.min(most - edge, Math.max(edge, value))
  }
  return {
    x: within(
      (((left + right) / 2 - shown.x) / shown.width) * page.width,
      page.width
    ),
    y: within(
      (((top + bottom) / 2 - shown.y) / shown.height) * page.height,
      page.height
    ),
  }
}

/** A line that a moved box has lined up with, to be shown while it does. */
export interface Guide {
  /** A line down the page ("x") or across it ("y"), and where. */
  axis: "x" | "y"
  at: number
}

const edges = (box: Box, axis: "x" | "y") =>
  axis === "x"
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height]

/**
 * How far to nudge a box that is being moved so that its edges or middle
 * line up with those of other boxes, when they are within reach.
 * @param others The page itself and the other things on it.
 * @param reach How close counts, in points.
 */
export function snap(
  moving: Box,
  others: readonly Box[],
  reach: number
): { dx: number; dy: number; guides: Guide[] } {
  const result = { dx: 0, dy: 0, guides: [] as Guide[] }
  for (const axis of ["x", "y"] as const) {
    let best: { gap: number; at: number } | null = null
    for (const mine of edges(moving, axis))
      for (const other of others)
        for (const theirs of edges(other, axis)) {
          const gap = theirs - mine
          if (
            Math.abs(gap) <= reach &&
            (!best || Math.abs(gap) < Math.abs(best.gap))
          )
            best = { gap, at: theirs }
        }
    if (!best) continue
    if (axis === "x") result.dx = best.gap
    else result.dy = best.gap
    result.guides.push({ axis, at: best.at })
  }
  return result
}

/** The box that two corners span, whichever way round they are. */
export const boxBetween = (a: Point, b: Point): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

/** Whether two upright boxes overlap at all. */
export const overlap = (a: Box, b: Box) =>
  a.x <= b.x + b.width &&
  b.x <= a.x + a.width &&
  a.y <= b.y + b.height &&
  b.y <= a.y + a.height
