import type { Pixels } from "@/lib/image-compressor/ssim"
import type { Rect } from "./types"

/** True when two pixels differ by more than `tolerance` in any channel. */
function differs(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  offset: number,
  tolerance: number
) {
  return (
    Math.abs(a[offset] - b[offset]) > tolerance ||
    Math.abs(a[offset + 1] - b[offset + 1]) > tolerance ||
    Math.abs(a[offset + 2] - b[offset + 2]) > tolerance ||
    Math.abs(a[offset + 3] - b[offset + 3]) > tolerance
  )
}

/**
 * The smallest rectangle holding every pixel that changed between two frames
 * of the same size, or null when nothing did.
 */
export function changedRect(
  before: Pixels,
  after: Pixels,
  tolerance = 0
): Rect | null {
  const { width, height } = after
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (differs(before.data, after.data, (y * width + x) * 4, tolerance)) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        bottom = y
      }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** Grow a rectangle so it starts on even coordinates, as animated WebP requires. */
export function evenRect(rect: Rect): Rect {
  const x = rect.x - (rect.x % 2)
  const y = rect.y - (rect.y % 2)
  return {
    x,
    y,
    width: rect.width + rect.x - x,
    height: rect.height + rect.y - y,
  }
}

/** Copy a rectangle out of a frame. */
export function cropPixels(pixels: Pixels, rect: Rect): Pixels {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * pixels.width + rect.x) * 4
    data.set(
      pixels.data.subarray(start, start + rect.width * 4),
      row * rect.width * 4
    )
  }
  return { data, width: rect.width, height: rect.height }
}

/**
 * Within `rect`, find the pixels of `after` that still match `reference`, and
 * bring the changed ones into `reference`. A pixel is compared with what it
 * was when last written, so slow fades cannot drift past the tolerance.
 * @returns One entry per pixel of the rectangle: 1 for unchanged.
 */
export function settle(
  reference: Pixels,
  after: Pixels,
  rect: Rect,
  tolerance: number
) {
  const unchanged = new Uint8Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++)
    for (let column = 0; column < rect.width; column++) {
      const offset = ((rect.y + row) * after.width + rect.x + column) * 4
      if (differs(reference.data, after.data, offset, tolerance))
        reference.data.set(after.data.subarray(offset, offset + 4), offset)
      else unchanged[row * rect.width + column] = 1
    }
  return unchanged
}
