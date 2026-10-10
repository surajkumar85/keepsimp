import type { Size } from "@/lib/image-compressor/geometry"
import type { Pixels } from "@/lib/image-compressor/ssim"

export type Rgba = [number, number, number, number]

/** A canvas filled with one colour (use alpha 0 for transparent padding). */
export function createCanvas(size: Size, colour: Rgba): Pixels {
  const data = new Uint8ClampedArray(size.width * size.height * 4)
  if (colour.some((channel) => channel !== 0))
    for (let i = 0; i < data.length; i += 4) data.set(colour, i)
  return { data, width: size.width, height: size.height }
}

/** Draw `image` onto `canvas` at (x, y) with normal alpha blending; clips at the edges. */
export function composite(canvas: Pixels, image: Pixels, x: number, y: number) {
  const out = canvas.data
  const src = image.data
  for (let row = 0; row < image.height; row++) {
    const cy = y + row
    if (cy < 0 || cy >= canvas.height) continue
    for (let column = 0; column < image.width; column++) {
      const cx = x + column
      if (cx < 0 || cx >= canvas.width) continue
      const s = (row * image.width + column) * 4
      const d = (cy * canvas.width + cx) * 4
      const alpha = src[s + 3] / 255
      if (alpha === 1) {
        out[d] = src[s]
        out[d + 1] = src[s + 1]
        out[d + 2] = src[s + 2]
        out[d + 3] = 255
      } else if (alpha > 0) {
        const below = (out[d + 3] / 255) * (1 - alpha)
        const total = alpha + below
        out[d] = (src[s] * alpha + out[d] * below) / total
        out[d + 1] = (src[s + 1] * alpha + out[d + 1] * below) / total
        out[d + 2] = (src[s + 2] * alpha + out[d + 2] * below) / total
        out[d + 3] = total * 255
      }
    }
  }
  return canvas
}

function blurPass(
  input: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
) {
  const lines = horizontal ? height : width
  const length = horizontal ? width : height
  const step = horizontal ? 4 : width * 4
  const window = radius * 2 + 1
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width * 4 : line * 4
    for (let channel = 0; channel < 4; channel++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++)
        sum +=
          input[start + Math.min(length - 1, Math.max(0, k)) * step + channel]
      for (let i = 0; i < length; i++) {
        output[start + i * step + channel] = sum / window
        const leaving = Math.max(0, i - radius)
        const entering = Math.min(length - 1, i + radius + 1)
        sum +=
          input[start + entering * step + channel] -
          input[start + leaving * step + channel]
      }
    }
  }
}

/** Box blur; three passes approximate a Gaussian. Edges repeat the border pixel. */
export function boxBlur(image: Pixels, radius: number, passes = 3): Pixels {
  if (radius < 1) return image
  const data = new Uint8ClampedArray(image.data)
  const scratch = new Uint8ClampedArray(image.data.length)
  for (let pass = 0; pass < passes; pass++) {
    blurPass(data, scratch, image.width, image.height, radius, true)
    blurPass(scratch, data, image.width, image.height, radius, false)
  }
  return { data, width: image.width, height: image.height }
}

/** Nearest-neighbour scaling, for pixel art and crisp enlargements. */
export function nearest(image: Pixels, size: Size): Pixels {
  const source = new Uint32Array(
    image.data.buffer,
    image.data.byteOffset,
    image.width * image.height
  )
  const data = new Uint8ClampedArray(size.width * size.height * 4)
  const target = new Uint32Array(data.buffer)
  for (let y = 0; y < size.height; y++) {
    const sy = Math.min(
      image.height - 1,
      Math.floor(((y + 0.5) * image.height) / size.height)
    )
    for (let x = 0; x < size.width; x++) {
      const sx = Math.min(
        image.width - 1,
        Math.floor(((x + 0.5) * image.width) / size.width)
      )
      target[y * size.width + x] = source[sy * image.width + sx]
    }
  }
  return { data, width: size.width, height: size.height }
}
