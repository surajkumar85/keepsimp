export interface Focus {
  /** 0 is the left edge, 1 the right edge. */
  x: number
  /** 0 is the top edge, 1 the bottom edge. */
  y: number
}

export type Anchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"

export const CENTER: Focus = { x: 0.5, y: 0.5 }

export const anchors: { id: Anchor; label: string; focus: Focus }[] = [
  { id: "top-left", label: "Top left", focus: { x: 0, y: 0 } },
  { id: "top", label: "Top", focus: { x: 0.5, y: 0 } },
  { id: "top-right", label: "Top right", focus: { x: 1, y: 0 } },
  { id: "left", label: "Left", focus: { x: 0, y: 0.5 } },
  { id: "center", label: "Centre", focus: { x: 0.5, y: 0.5 } },
  { id: "right", label: "Right", focus: { x: 1, y: 0.5 } },
  { id: "bottom-left", label: "Bottom left", focus: { x: 0, y: 1 } },
  { id: "bottom", label: "Bottom", focus: { x: 0.5, y: 1 } },
  { id: "bottom-right", label: "Bottom right", focus: { x: 1, y: 1 } },
]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function clampFocus(focus: Focus): Focus {
  return { x: clamp01(focus.x), y: clamp01(focus.y) }
}

/** The anchor a focus sits on, if it is exactly one of the nine positions. */
export function anchorOf(focus: Focus): Anchor | null {
  return (
    anchors.find(
      (anchor) =>
        Math.abs(anchor.focus.x - focus.x) < 0.001 &&
        Math.abs(anchor.focus.y - focus.y) < 0.001
    )?.id ?? null
  )
}

export function nudgeFocus(focus: Focus, dx: number, dy: number): Focus {
  return clampFocus({ x: focus.x + dx, y: focus.y + dy })
}

/**
 * Where a window of `size` sits inside `total` for a focus value: 0 hugs the
 * start, 1 hugs the end, and values between slide it linearly.
 */
export function placeWindow(total: number, size: number, focus: number) {
  return Math.round(Math.max(0, total - size) * clamp01(focus))
}

/** The focus value that puts a window of `size` at `offset` within `total`. */
export function focusForOffset(total: number, size: number, offset: number) {
  const room = total - size
  return room <= 0 ? 0.5 : clamp01(offset / room)
}

/** The focus value that centres a window of `size` on a point (0–1) of `total`. */
export function focusForPoint(total: number, size: number, point: number) {
  return focusForOffset(total, size, clamp01(point) * total - size / 2)
}

/**
 * Carry a focus found on the stored image over to the image as displayed after
 * rotating clockwise and then flipping.
 */
export function orientFocus(
  focus: Focus,
  rotation: 0 | 90 | 180 | 270,
  flipX: boolean,
  flipY: boolean
): Focus {
  let { x, y } = focus
  if (rotation === 90) [x, y] = [1 - y, x]
  else if (rotation === 180) [x, y] = [1 - x, 1 - y]
  else if (rotation === 270) [x, y] = [y, 1 - x]
  return { x: flipX ? 1 - x : x, y: flipY ? 1 - y : y }
}
