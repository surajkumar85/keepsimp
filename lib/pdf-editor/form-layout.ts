/**
 * Laying out the fields of a form: lining several up along an edge or a
 * middle, spacing them evenly, giving them one size, and the order a
 * person moves through them with the Tab key. This part needs no engine:
 * it works on boxes in the page's points as the page is shown, and the
 * changes it gives are moves of single fields.
 */
import type { Box } from "./geometry"

/** A field's place on its page, by the name the page knows it by. */
export interface Placed {
  id: string
  box: Box
}

export const EDGES = [
  "left",
  "centre",
  "right",
  "top",
  "middle",
  "bottom",
] as const
export type Edge = (typeof EDGES)[number]
export const EDGE_NAMES: Record<Edge, string> = {
  left: "Align left edges",
  centre: "Align centres",
  right: "Align right edges",
  top: "Align top edges",
  middle: "Align middles",
  bottom: "Align bottom edges",
}

export type Axis = "across" | "down"
export type Dimension = "width" | "height" | "both"

/** The fewest fields that can be spaced evenly: two would only stay where they are. */
export const FEWEST_TO_SPREAD = 3

/** Only the fields whose box is another than it was. */
const changed = (before: readonly Placed[], after: readonly Placed[]) =>
  after.filter((one, at) => {
    const was = before[at].box
    return (
      one.box.x !== was.x ||
      one.box.y !== was.y ||
      one.box.width !== was.width ||
      one.box.height !== was.height
    )
  })

/**
 * Line fields up along an edge or a middle of the space they take together:
 * the left edge of the leftmost, the right edge of the rightmost, the middle
 * of all of them. Sizes are kept.
 * @returns The fields that move, with their new boxes.
 */
export function aligned(items: readonly Placed[], edge: Edge): Placed[] {
  if (items.length < 2) return []
  const left = Math.min(...items.map(({ box }) => box.x))
  const top = Math.min(...items.map(({ box }) => box.y))
  const right = Math.max(...items.map(({ box }) => box.x + box.width))
  const bottom = Math.max(...items.map(({ box }) => box.y + box.height))
  const moved = items.map(({ id, box }) => {
    const next = { ...box }
    if (edge === "left") next.x = left
    else if (edge === "right") next.x = right - box.width
    else if (edge === "centre") next.x = (left + right) / 2 - box.width / 2
    else if (edge === "top") next.y = top
    else if (edge === "bottom") next.y = bottom - box.height
    else next.y = (top + bottom) / 2 - box.height / 2
    return { id, box: next }
  })
  return changed(items, moved)
}

/**
 * Space fields evenly across or down: the first and the last stay where
 * they are, and the room between every two that follow one another is the
 * same.
 * @returns The fields that move; none when there are fewer than three.
 */
export function spread(items: readonly Placed[], axis: Axis): Placed[] {
  if (items.length < FEWEST_TO_SPREAD) return []
  const start = (box: Box) => (axis === "across" ? box.x : box.y)
  const length = (box: Box) => (axis === "across" ? box.width : box.height)
  const order = [...items].sort(
    (a, b) => start(a.box) - start(b.box) || a.id.localeCompare(b.id)
  )
  const first = order[0].box
  const last = order[order.length - 1].box
  const taken = order.reduce((sum, { box }) => sum + length(box), 0)
  const room =
    (start(last) + length(last) - start(first) - taken) / (order.length - 1)
  let at = start(first)
  const moved = order.map(({ id, box }) => {
    const next = axis === "across" ? { ...box, x: at } : { ...box, y: at }
    at += length(box) + room
    return { id, box: next }
  })
  return changed(order, moved)
}

/**
 * Give fields the width, the height or both of one of them, keeping each
 * one's top left corner.
 * @param model The field whose size the others take.
 */
export function sized(
  items: readonly Placed[],
  model: string,
  dimension: Dimension
): Placed[] {
  const pattern = items.find(({ id }) => id === model)
  if (!pattern) return []
  const moved = items.map(({ id, box }) => ({
    id,
    box: {
      ...box,
      width: dimension === "height" ? box.width : pattern.box.width,
      height: dimension === "width" ? box.height : pattern.box.height,
    },
  }))
  return changed(items, moved)
}

/**
 * The order a page is read in: rows from the top down, and in each row from
 * the left. Fields belong to one row when the middle of one lies within the
 * height of the first field of the row.
 */
export function readingOrder(items: readonly Placed[]): string[] {
  const order = [...items].sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x
  )
  const rows: Placed[][] = []
  for (const item of order) {
    const row = rows[rows.length - 1]
    const middle = item.box.y + item.box.height / 2
    if (row && middle <= row[0].box.y + row[0].box.height) row.push(item)
    else rows.push([item])
  }
  return rows.flatMap((row) =>
    [...row].sort((a, b) => a.box.x - b.box.x).map(({ id }) => id)
  )
}

/** A list with one of its entries a place earlier or later; as it was at an end. */
export function nudged(ids: readonly string[], id: string, by: -1 | 1) {
  const at = ids.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= ids.length) return [...ids]
  const next = [...ids]
  next.splice(at, 1)
  next.splice(to, 0, id)
  return next
}
