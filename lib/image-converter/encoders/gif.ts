export type PaletteColour = [number, number, number, number]

/** Variable-width LZW as GIF defines it, packed into 255-byte sub-blocks. */
export function lzw(indices: Uint8Array, minCodeSize: number) {
  const clear = 1 << minCodeSize
  const end = clear + 1
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  let codeSize = minCodeSize + 1
  let next = end + 1
  let table = new Map<number, number>()
  const write = (code: number) => {
    buffer |= code << bits
    bits += codeSize
    while (bits >= 8) {
      bytes.push(buffer & 0xff)
      buffer >>>= 8
      bits -= 8
    }
  }
  write(clear)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const value = indices[i]
    const key = (prefix << 8) | value
    const known = table.get(key)
    if (known !== undefined) {
      prefix = known
      continue
    }
    write(prefix)
    if (next < 4096) {
      table.set(key, next++)
      if (next > 1 << codeSize && codeSize < 12) codeSize++
    } else {
      write(clear)
      table = new Map()
      next = end + 1
      codeSize = minCodeSize + 1
    }
    prefix = value
  }
  if (indices.length) write(prefix)
  write(end)
  if (bits > 0) bytes.push(buffer & 0xff)
  const blocks: number[] = []
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255)
    blocks.push(chunk.length, ...chunk)
  }
  blocks.push(0)
  return blocks
}

/**
 * A still GIF89a from palette indices. Palette entries that are mostly
 * transparent collapse into GIF's single transparent colour.
 */
export function encodeGif(
  indices: Uint8Array,
  palette: PaletteColour[],
  width: number,
  height: number
) {
  const transparent = palette.findIndex((colour) => colour[3] < 128)
  const mapped =
    transparent < 0
      ? indices
      : indices.map((index) => (palette[index][3] < 128 ? transparent : index))
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))))
  const tableSize = 1 << bits
  const header = [
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // GIF89a
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0x80 | ((bits - 1) << 4) | (bits - 1),
    0,
    0,
  ]
  const colours = new Array<number>(tableSize * 3).fill(0)
  palette.forEach((colour, index) => {
    colours[index * 3] = colour[0]
    colours[index * 3 + 1] = colour[1]
    colours[index * 3 + 2] = colour[2]
  })
  const control =
    transparent < 0 ? [] : [0x21, 0xf9, 4, 1, 0, 0, transparent, 0]
  const descriptor = [
    0x2c,
    0,
    0,
    0,
    0,
    width & 0xff,
    width >> 8,
    height & 0xff,
    height >> 8,
    0,
  ]
  const minCodeSize = Math.max(2, bits)
  return Uint8Array.from([
    ...header,
    ...colours,
    ...control,
    ...descriptor,
    minCodeSize,
    ...lzw(mapped, minCodeSize),
    0x3b,
  ])
}
