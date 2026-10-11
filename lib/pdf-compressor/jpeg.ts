/**
 * What a JPEG says about itself in its headers: its size, how many colour
 * channels it has, and the tables its quality can be estimated from. Nothing
 * is decoded.
 */

export interface JpegFacts {
  width: number
  height: number
  /** 1 for grey, 3 for colour, 4 for CMYK. */
  components: number
  progressive: boolean
  /** The quality setting, from 1 to 100, that would give its tables; null when it carries none. */
  quality: number | null
  /** It carries the compressor's own mark: it has been through here before. */
  ours: boolean
}

/**
 * The brightness table at quality 50 of the two families nearly every JPEG
 * comes from, in the order a file stores them: the standard's own (Annex K)
 * and the one mozjpeg prefers, which our own pictures are written with.
 */
const BASE_TABLES: readonly (readonly number[])[] = [
  [
    16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22,
    22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78,
    64, 68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62, 77, 113,
    121, 112, 100, 120, 92, 101, 103, 99,
  ],
  [
    16, 16, 16, 16, 17, 16, 18, 20, 20, 18, 25, 27, 24, 27, 25, 37, 34, 31, 31,
    34, 37, 56, 40, 43, 40, 43, 40, 56, 85, 53, 62, 53, 53, 62, 53, 85, 75, 91,
    74, 69, 74, 91, 75, 135, 106, 94, 94, 106, 135, 156, 131, 124, 131, 156,
    189, 169, 169, 189, 238, 226, 238, 311, 311, 418,
  ],
]

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0)

/** The quality setting whose table is `percent` of the base table (the usual libjpeg scale, turned round). */
const qualityFor = (percent: number) =>
  percent <= 100 ? (200 - percent) / 2 : 5000 / percent

/**
 * Estimate the quality a brightness table was made with. The table is
 * compared with each known family, and the one it follows most closely
 * gives the answer.
 */
export function estimateQuality(table: readonly number[]) {
  let best = { quality: 0, error: Infinity }
  for (const base of BASE_TABLES) {
    const percent = (100 * sum(table)) / sum(base)
    let error = 0
    for (let index = 0; index < 64; index++)
      error += Math.abs(
        table[index] - Math.max(1, Math.round((base[index] * percent) / 100))
      )
    if (error < best.error) best = { quality: qualityFor(percent), error }
  }
  return Math.min(100, Math.max(1, Math.round(best.quality)))
}

/** The note the compressor leaves in the JPEGs it writes. */
export const MARK = "KeepSimp"
const COM = 0xfe

/**
 * A JPEG with the compressor's mark in it, as a comment straight after its
 * first two bytes. A picture that carries the mark is not saved again at the
 * same size: every saving costs a little quality, and the second would be
 * measured against the first, not against the picture as it once was.
 */
export function tagJpeg(bytes: Uint8Array) {
  const out = new Uint8Array(bytes.length + MARK.length + 4)
  out.set(bytes.subarray(0, 2))
  out.set([0xff, COM, 0, MARK.length + 2], 2)
  for (let index = 0; index < MARK.length; index++)
    out[6 + index] = MARK.charCodeAt(index)
  out.set(bytes.subarray(2), 6 + MARK.length)
  return out
}

const SOI = 0xd8
const SOS = 0xda
const DQT = 0xdb
const EOI = 0xd9
/** Markers that open a frame, apart from the three in their range that do not. */
const isFrame = (marker: number) =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc

/** Read a JPEG's headers. Null when the bytes are not a JPEG that can be followed to its picture data. */
export function readJpeg(bytes: Uint8Array): JpegFacts | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null
  let frame: Omit<JpegFacts, "quality" | "ours"> | null = null
  let quality: number | null = null
  let ours = false
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null
    const marker = bytes[at + 1]
    // Fill bytes before a marker are allowed.
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === EOI) break
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    const end = at + 2 + length
    if (length < 2 || end > bytes.length) return null
    if (marker === DQT) {
      let entry = at + 4
      while (entry < end) {
        const wide = bytes[entry] >> 4 !== 0
        const id = bytes[entry] & 15
        const size = wide ? 128 : 64
        if (entry + 1 + size > end) return null
        // Table 0 is the brightness table in every common JPEG.
        if (id === 0) {
          const table: number[] = []
          for (let index = 0; index < 64; index++)
            table.push(
              wide
                ? (bytes[entry + 1 + index * 2] << 8) |
                    bytes[entry + 2 + index * 2]
                : bytes[entry + 1 + index]
            )
          quality = estimateQuality(table)
        }
        entry += 1 + size
      }
    } else if (marker === COM) {
      ours ||= String.fromCharCode(...bytes.subarray(at + 4, end)) === MARK
    } else if (isFrame(marker)) {
      if (length < 8) return null
      frame = {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
        components: bytes[at + 9],
        progressive: marker === 0xc2,
      }
    } else if (marker === SOS) break
    at = end
  }
  return frame ? { ...frame, quality, ours } : null
}
