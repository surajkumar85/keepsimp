import { orientedSize, type Rect, type Rotation } from "./geometry"
import type { Pixels } from "./ssim"

/**
 * Read `rect` from the source as it appears after rotating (clockwise) and then
 * flipping. One pass, so a crop never needs a full-size rotated copy.
 */
export function extractOriented(
  source: Pixels,
  rotation: Rotation,
  flipX: boolean,
  flipY: boolean,
  rect: Rect
): Pixels {
  const oriented = orientedSize(source, rotation)
  const input = new Uint32Array(
    source.data.buffer,
    source.data.byteOffset,
    source.width * source.height
  )
  const data = new Uint8ClampedArray(rect.width * rect.height * 4)
  const output = new Uint32Array(data.buffer)
  const { width: W, height: H } = source
  for (let y = 0; y < rect.height; y++) {
    const dy = rect.y + y
    const ry = flipY ? oriented.height - 1 - dy : dy
    for (let x = 0; x < rect.width; x++) {
      const dx = rect.x + x
      const rx = flipX ? oriented.width - 1 - dx : dx
      let sx: number
      let sy: number
      if (rotation === 90) {
        sx = ry
        sy = H - 1 - rx
      } else if (rotation === 180) {
        sx = W - 1 - rx
        sy = H - 1 - ry
      } else if (rotation === 270) {
        sx = W - 1 - ry
        sy = rx
      } else {
        sx = rx
        sy = ry
      }
      output[y * rect.width + x] = input[sy * W + sx]
    }
  }
  return { data, width: rect.width, height: rect.height }
}

export function hasTransparency(image: Pixels) {
  for (let i = 3; i < image.data.length; i += 4)
    if (image.data[i] < 255) return true
  return false
}

/** Composite over a solid colour, for formats without an alpha channel. */
export function flattenAlpha(
  image: Pixels,
  background: [number, number, number]
): Pixels {
  const data = new Uint8ClampedArray(image.data.length)
  for (let i = 0; i < data.length; i += 4) {
    const alpha = image.data[i + 3] / 255
    data[i] = image.data[i] * alpha + background[0] * (1 - alpha)
    data[i + 1] = image.data[i + 1] * alpha + background[1] * (1 - alpha)
    data[i + 2] = image.data[i + 2] * alpha + background[2] * (1 - alpha)
    data[i + 3] = 255
  }
  return { data, width: image.width, height: image.height }
}

export function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
