import type { Pixels } from "@/lib/image-compressor/ssim"
import { boxBlur } from "./canvas"

export type Sharpen = "off" | "light" | "medium" | "strong"

export const sharpenAmounts: Record<Sharpen, number> = {
  off: 0,
  light: 0.35,
  medium: 0.7,
  strong: 1.1,
}

/**
 * Unsharp mask: add back the difference between the image and a slightly
 * blurred copy. Restores edge contrast that downscaling softens. Alpha is kept.
 */
export function unsharp(image: Pixels, amount: number): Pixels {
  if (amount <= 0) return image
  const blurred = boxBlur(image, 1, 1).data
  const data = new Uint8ClampedArray(image.data.length)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = image.data[i] + (image.data[i] - blurred[i]) * amount
    data[i + 1] =
      image.data[i + 1] + (image.data[i + 1] - blurred[i + 1]) * amount
    data[i + 2] =
      image.data[i + 2] + (image.data[i + 2] - blurred[i + 2]) * amount
    data[i + 3] = image.data[i + 3]
  }
  return { data, width: image.width, height: image.height }
}
