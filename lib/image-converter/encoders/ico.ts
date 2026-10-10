export interface IcoEntry {
  /** Width and height in pixels, 1–256. */
  size: number
  /** A complete PNG file for this size. */
  png: Uint8Array
}

export const icoSizes = [16, 24, 32, 48, 64, 128, 256]

/** An ICO container holding PNG images, as Windows Vista and every browser accept. */
export function encodeIco(entries: IcoEntry[]) {
  const ordered = [...entries].sort((a, b) => a.size - b.size)
  const directory = 6 + ordered.length * 16
  const out = new Uint8Array(
    directory + ordered.reduce((total, entry) => total + entry.png.length, 0)
  )
  const view = new DataView(out.buffer)
  view.setUint16(2, 1, true)
  view.setUint16(4, ordered.length, true)
  let offset = directory
  ordered.forEach((entry, index) => {
    const at = 6 + index * 16
    // A size byte of 0 means 256.
    out[at] = entry.size >= 256 ? 0 : entry.size
    out[at + 1] = entry.size >= 256 ? 0 : entry.size
    view.setUint16(at + 4, 1, true)
    view.setUint16(at + 6, 32, true)
    view.setUint32(at + 8, entry.png.length, true)
    view.setUint32(at + 12, offset, true)
    out.set(entry.png, offset)
    offset += entry.png.length
  })
  return out
}
