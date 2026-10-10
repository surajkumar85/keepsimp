import type { Pixels } from "@/lib/image-compressor/ssim"

const SHORT = 3
const LONG = 4
const RATIONAL = 5

/**
 * Baseline TIFF: little-endian, uncompressed RGB or RGBA in a single strip.
 * Every TIFF reader supports this layout; the cost is a large file.
 */
export function encodeTiff(
  image: Pixels,
  options: { alpha: boolean; dpi?: number }
) {
  const { width, height, data } = image
  const samples = options.alpha ? 4 : 3
  const dpi = Math.round(options.dpi ?? 72)
  const entries: [number, number, number, number][] = []
  const count = options.alpha ? 13 : 12
  const ifdSize = 2 + count * 12 + 4
  const bitsOffset = 8 + ifdSize
  const resolutionOffset = bitsOffset + samples * 2
  const pixelOffset = resolutionOffset + 16
  const pixelBytes = width * height * samples
  entries.push(
    [256, LONG, 1, width],
    [257, LONG, 1, height],
    [258, SHORT, samples, bitsOffset],
    [259, SHORT, 1, 1],
    [262, SHORT, 1, 2],
    [273, LONG, 1, pixelOffset],
    [277, SHORT, 1, samples],
    [278, LONG, 1, height],
    [279, LONG, 1, pixelBytes],
    [282, RATIONAL, 1, resolutionOffset],
    [283, RATIONAL, 1, resolutionOffset + 8],
    [296, SHORT, 1, 2]
  )
  // ExtraSamples = 2: unassociated (straight) alpha.
  if (options.alpha) entries.push([338, SHORT, 1, 2])

  const out = new Uint8Array(pixelOffset + pixelBytes)
  const view = new DataView(out.buffer)
  out.set([0x49, 0x49, 42, 0], 0)
  view.setUint32(4, 8, true)
  view.setUint16(8, entries.length, true)
  entries.forEach(([tag, type, length, value], index) => {
    const at = 10 + index * 12
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, length, true)
    if (type === SHORT && length === 1) view.setUint16(at + 8, value, true)
    else view.setUint32(at + 8, value, true)
  })
  for (let i = 0; i < samples; i++) view.setUint16(bitsOffset + i * 2, 8, true)
  for (const at of [resolutionOffset, resolutionOffset + 8]) {
    view.setUint32(at, dpi, true)
    view.setUint32(at + 4, 1, true)
  }
  let target = pixelOffset
  for (let source = 0; source < data.length; source += 4) {
    out[target++] = data[source]
    out[target++] = data[source + 1]
    out[target++] = data[source + 2]
    if (options.alpha) out[target++] = data[source + 3]
  }
  return out
}
