import type { Pixels } from "@/lib/image-compressor/ssim"

const metres = (dpi: number) => Math.round(dpi / 0.0254)

/**
 * Windows bitmap, uncompressed and bottom-up. Opaque images use 24 bits per
 * pixel; images with transparency use 32 bits with explicit channel masks in
 * a BITMAPV5HEADER, which is what readers need to honour the alpha channel.
 * (The sRGB colour-space flag is only valid from V5; macOS rejects it in V4.)
 */
export function encodeBmp(
  image: Pixels,
  options: { alpha: boolean; dpi?: number }
) {
  const { width, height, data } = image
  const bytesPerPixel = options.alpha ? 4 : 3
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4
  const headerSize = options.alpha ? 124 : 40
  const offset = 14 + headerSize
  const out = new Uint8Array(offset + rowSize * height)
  const view = new DataView(out.buffer)
  out[0] = 0x42
  out[1] = 0x4d
  view.setUint32(2, out.length, true)
  view.setUint32(10, offset, true)
  view.setUint32(14, headerSize, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, bytesPerPixel * 8, true)
  view.setUint32(30, options.alpha ? 3 : 0, true) // BI_BITFIELDS or BI_RGB
  view.setUint32(34, rowSize * height, true)
  const resolution = metres(options.dpi ?? 72)
  view.setInt32(38, resolution, true)
  view.setInt32(42, resolution, true)
  if (options.alpha) {
    view.setUint32(54, 0x00ff0000, true)
    view.setUint32(58, 0x0000ff00, true)
    view.setUint32(62, 0x000000ff, true)
    view.setUint32(66, 0xff000000, true)
    view.setUint32(70, 0x73524742, true) // "sRGB"
    view.setUint32(122, 4, true) // rendering intent: images
  }
  for (let y = 0; y < height; y++) {
    let target = offset + (height - 1 - y) * rowSize
    let source = y * width * 4
    for (let x = 0; x < width; x++, source += 4) {
      out[target++] = data[source + 2]
      out[target++] = data[source + 1]
      out[target++] = data[source]
      if (options.alpha) out[target++] = data[source + 3]
    }
  }
  return out
}
