import type { Pixels } from "@/lib/image-compressor/ssim"

/** Replace colour with Rec. 709 luma, keeping transparency. */
export function toGreyscale(image: Pixels): Pixels {
  const data = new Uint8ClampedArray(image.data.length)
  for (let i = 0; i < data.length; i += 4) {
    const value =
      0.2126 * image.data[i] +
      0.7152 * image.data[i + 1] +
      0.0722 * image.data[i + 2]
    data[i] = data[i + 1] = data[i + 2] = value
    data[i + 3] = image.data[i + 3]
  }
  return { data, width: image.width, height: image.height }
}
