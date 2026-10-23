/**
 * A crop box of one's own: a rectangle drawn over the picture as the
 * player shows it (after the file's own turn), kept as shares of its width
 * and height so it does not depend on the size it is drawn at. The plan
 * turns it into the rectangle Mediabunny crops, which is measured after
 * the turn and mirror chosen here (`boxCrop`).
 */
import type { Turn } from "./settings"

/** Shares of the picture as shown: 0 to 1 from its left and top. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A box can be no smaller than this share of the picture's sides. */
export const SMALLEST_BOX = 0.05

export const WHOLE: Box = { x: 0, y: 0, width: 1, height: 1 }

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

/**
 * The largest box of a shape (width over height, in pixels) around the
 * middle of a picture `aspect` (its width over height); the whole picture
 * for none.
 */
export function centred(ratio: number | null, aspect: number): Box {
  if (ratio === null) return WHOLE
  // In shares: a box of `ratio` in pixels is `ratio / aspect` in shares.
  const share = ratio / aspect
  const [width, height] = share < 1 ? [share, 1] : [1, 1 / share]
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

/** The box moved by shares of the picture, kept inside it. */
export function moved(box: Box, dx: number, dy: number): Box {
  return {
    ...box,
    x: clamp(box.x + dx, 0, 1 - box.width),
    y: clamp(box.y + dy, 0, 1 - box.height),
  }
}

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

/**
 * The box with one corner dragged by shares of the picture, the opposite
 * corner held, kept inside the picture and no smaller than `SMALLEST_BOX`;
 * with a shape, the shape is kept (by the side dragged further).
 */
export function resized(
  box: Box,
  corner: Corner,
  dx: number,
  dy: number,
  ratio: number | null,
  aspect: number
): Box {
  const left = corner.endsWith("left")
  const top = corner.startsWith("top")
  // The corner held still, and the room the moving corner has towards each side.
  const anchorX = left ? box.x + box.width : box.x
  const anchorY = top ? box.y + box.height : box.y
  const roomX = left ? anchorX : 1 - anchorX
  const roomY = top ? anchorY : 1 - anchorY
  let width = clamp(box.width + (left ? -dx : dx), SMALLEST_BOX, roomX)
  let height = clamp(box.height + (top ? -dy : dy), SMALLEST_BOX, roomY)
  if (ratio !== null) {
    const share = ratio / aspect
    // Follow the side dragged further, then fit the shape inside the room.
    if (Math.abs(dx) >= Math.abs(dy)) height = width / share
    else width = height * share
    const fit = Math.min(1, roomX / width, roomY / height)
    width *= fit
    height *= fit
    const least = Math.max(SMALLEST_BOX / width, SMALLEST_BOX / height, 1)
    if (least > 1 && width * least <= roomX && height * least <= roomY) {
      width *= least
      height *= least
    }
  }
  return {
    x: left ? anchorX - width : anchorX,
    y: top ? anchorY - height : anchorY,
    width,
    height,
  }
}

/** The same box, given another shape: the largest of that shape inside it, about its middle. */
export function reshaped(box: Box, ratio: number | null, aspect: number): Box {
  if (ratio === null) return box
  const share = ratio / aspect
  const [width, height] =
    box.width / box.height > share
      ? [box.height * share, box.height]
      : [box.width, box.width / share]
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

/** Whether a box is the whole picture, to the nearest thousandth. */
export const isWholeBox = (box: Box) =>
  box.x < 0.001 && box.y < 0.001 && box.width > 0.999 && box.height > 0.999

const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

/**
 * The rectangle to crop, in pixels of the picture after the turn and
 * mirror chosen here (as Mediabunny crops), from a box over the picture as
 * shown (`width` × `height`), with even sides.
 */
export function boxCrop(
  box: Box,
  width: number,
  height: number,
  rotate: Turn,
  flip: boolean
) {
  // In pixels of the picture as shown.
  let x = box.x * width
  let y = box.y * height
  let w = box.width * width
  let h = box.height * height
  let shownWidth = width
  let shownHeight = height
  // Turned clockwise: where the rectangle lands.
  if (rotate === 90) {
    ;[x, y, w, h] = [height - (y + h), x, h, w]
    ;[shownWidth, shownHeight] = [height, width]
  } else if (rotate === 180) {
    ;[x, y] = [width - (x + w), height - (y + h)]
  } else if (rotate === 270) {
    ;[x, y, w, h] = [y, width - (x + w), h, w]
    ;[shownWidth, shownHeight] = [height, width]
  }
  if (flip) x = shownWidth - (x + w)
  const cropWidth = Math.min(even(w), even(shownWidth))
  const cropHeight = Math.min(even(h), even(shownHeight))
  return {
    left: clamp(Math.round(x), 0, shownWidth - cropWidth),
    top: clamp(Math.round(y), 0, shownHeight - cropHeight),
    width: cropWidth,
    height: cropHeight,
  }
}
