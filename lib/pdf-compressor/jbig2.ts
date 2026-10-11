/**
 * A JBIG2 writer for black-and-white pictures. It only writes the lossless
 * kind: every pixel is coded as it is, guessed from the pixels around it
 * (a "generic region", ITU-T T.88 section 6.2). The other kind of JBIG2
 * stores one shape for letters that look alike, and can put the wrong letter
 * on a page; that kind is never written here.
 */

/** One row of the arithmetic coder's table: the chance of the less likely bit, and where to go next. */
const QE = [
  0x5601, 0x3401, 0x1801, 0x0ac1, 0x0521, 0x0221, 0x5601, 0x5401, 0x4801,
  0x3801, 0x3001, 0x2401, 0x1c01, 0x1601, 0x5601, 0x5401, 0x5101, 0x4801,
  0x3801, 0x3401, 0x3001, 0x2801, 0x2401, 0x2201, 0x1c01, 0x1801, 0x1601,
  0x1401, 0x1201, 0x1101, 0x0ac1, 0x09c1, 0x08a1, 0x0521, 0x0441, 0x02a1,
  0x0221, 0x0141, 0x0111, 0x0085, 0x0049, 0x0025, 0x0015, 0x0009, 0x0005,
  0x0001, 0x5601,
]
const NEXT_MPS = [
  1, 2, 3, 4, 5, 38, 7, 8, 9, 10, 11, 12, 13, 29, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 45, 46,
]
const NEXT_LPS = [
  1, 6, 9, 12, 29, 33, 6, 14, 14, 14, 17, 18, 20, 21, 14, 14, 15, 16, 17, 18,
  19, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 42, 43, 46,
]
/** Rows at which the more likely bit and the less likely one change places. */
const SWITCH = new Set([0, 6, 14])

/** The MQ arithmetic coder of JBIG2 and JPEG 2000 (T.88 Annex E), writing. */
class MqEncoder {
  private a = 0x8000
  private c = 0
  private count = 12
  /** The byte being finished; -1 before the first one. */
  private byte = -1
  private readonly out: number[] = []
  /** For each context: its row in the table, and the bit it expects. */
  private readonly index: Uint8Array
  private readonly likely: Uint8Array

  constructor(contexts: number) {
    this.index = new Uint8Array(contexts)
    this.likely = new Uint8Array(contexts)
  }

  encode(context: number, bit: number) {
    const row = this.index[context]
    const chance = QE[row]
    this.a -= chance
    if (bit === this.likely[context]) {
      if (this.a & 0x8000) {
        this.c += chance
        return
      }
      if (this.a < chance) this.a = chance
      else this.c += chance
      this.index[context] = NEXT_MPS[row]
    } else {
      if (this.a < chance) this.c += chance
      else this.a = chance
      if (SWITCH.has(row)) this.likely[context] ^= 1
      this.index[context] = NEXT_LPS[row]
    }
    do {
      this.a <<= 1
      this.c <<= 1
      if (--this.count === 0) this.byteOut()
    } while (!(this.a & 0x8000))
  }

  private emit() {
    if (this.byte >= 0) this.out.push(this.byte)
  }

  private byteOut() {
    if (this.byte === 0xff) {
      this.emit()
      this.byte = this.c >>> 20
      this.c &= 0xfffff
      this.count = 7
      return
    }
    if (this.c >= 0x8000000) {
      // A carry into the byte that was waiting.
      this.byte++
      if (this.byte === 0xff) {
        this.c &= 0x7ffffff
        this.emit()
        this.byte = this.c >>> 20
        this.c &= 0xfffff
        this.count = 7
        return
      }
    }
    this.emit()
    this.byte = this.c >>> 19
    this.c &= 0x7ffff
    this.count = 8
  }

  /** Write out what is still held, and the marker that ends the data. */
  finish() {
    const top = this.c + this.a
    this.c |= 0xffff
    if (this.c >= top) this.c -= 0x8000
    this.c <<= this.count
    this.byteOut()
    this.c <<= this.count
    this.byteOut()
    this.emit()
    if (this.byte !== 0xff) this.out.push(0xff)
    this.out.push(0xac)
    return Uint8Array.from(this.out)
  }
}

/**
 * The context of the row check: with it, a row that repeats the row above
 * costs one decision instead of one a pixel (T.88 6.2.5.7, template 0).
 */
const SAME_ROW = 0x9b25

/**
 * The pixels of a black-and-white picture, coded. `bits` holds one byte a
 * pixel, 1 for black. The pixels a guess is made from are the standard
 * sixteen of template 0, numbered as the standard numbers them.
 */
export function encodeGenericRegion(
  bits: Uint8Array,
  width: number,
  height: number
) {
  const coder = new MqEncoder(1 << 16)
  // Three rows with room on both sides, so no pixel has to ask where it is.
  const PAD = 4
  const span = width + PAD * 2
  let above2 = new Uint8Array(span)
  let above1 = new Uint8Array(span)
  let row = new Uint8Array(span)
  let repeated = 0
  for (let y = 0; y < height; y++) {
    const from = y * width
    let same = 1
    for (let x = 0; x < width; x++) {
      const bit = bits[from + x]
      row[PAD + x] = bit
      if (bit !== above1[PAD + x]) same = 0
    }
    coder.encode(SAME_ROW, same ^ repeated)
    repeated = same
    if (!same)
      for (let x = 0; x < width; x++) {
        const at = PAD + x
        const context =
          row[at - 1] |
          (row[at - 2] << 1) |
          (row[at - 3] << 2) |
          (row[at - 4] << 3) |
          (above1[at + 3] << 4) |
          (above1[at + 2] << 5) |
          (above1[at + 1] << 6) |
          (above1[at] << 7) |
          (above1[at - 1] << 8) |
          (above1[at - 2] << 9) |
          (above1[at - 3] << 10) |
          (above2[at + 2] << 11) |
          (above2[at + 1] << 12) |
          (above2[at] << 13) |
          (above2[at - 1] << 14) |
          (above2[at - 2] << 15)
        coder.encode(context, row[at])
      }
    // The rows move up; the oldest is used again for the next one.
    const spare = above2
    above2 = above1
    above1 = row
    row = spare
  }
  return coder.finish()
}

const word = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
]

/** A segment: its number, its kind, the page it belongs to, and its data. */
const segment = (number: number, kind: number, data: readonly number[]) => [
  ...word(number),
  kind,
  // It refers to no other segment.
  0,
  // Page 1.
  1,
  ...word(data.length),
  ...data,
]

const PAGE_INFORMATION = 48
const IMMEDIATE_GENERIC_REGION = 38
/** Template 0 with the row check on, and no MMR. */
const REGION_FLAGS = 0b1000
/** Where template 0 looks for its four movable pixels: the standard places. */
const ADAPTIVE_PIXELS = [3, -1, -3, -1, 2, -2, -2, -2].map(
  (value) => value & 255
)

/**
 * A black-and-white picture as the JBIG2 data a PDF holds: a page and one
 * region that covers it, with no file header and no end marker.
 * @param bits One byte a pixel, 1 for black, row after row.
 */
export function encodeJbig2(bits: Uint8Array, width: number, height: number) {
  const coded = encodeGenericRegion(bits, width, height)
  const page = segment(0, PAGE_INFORMATION, [
    ...word(width),
    ...word(height),
    // No resolution given.
    ...word(0),
    ...word(0),
    // Pixels start white, and regions are laid over them.
    0,
    // Not in stripes.
    0,
    0,
  ])
  const header = segment(1, IMMEDIATE_GENERIC_REGION, [
    ...word(width),
    ...word(height),
    ...word(0),
    ...word(0),
    0,
    REGION_FLAGS,
    ...ADAPTIVE_PIXELS,
  ])
  // The region's length counts the coded pixels too.
  const length = header.length - 11 + coded.length
  header.splice(7, 4, ...word(length))
  const out = new Uint8Array(page.length + header.length + coded.length)
  out.set(page)
  out.set(header, page.length)
  out.set(coded, page.length + header.length)
  return out
}

/**
 * Rows of samples packed eight to a byte, as a PDF stores a one-bit picture,
 * as one byte a pixel for the coder. A sample of 0 is black in JBIG2 terms:
 * the PDF filter hands black back as 0.
 */
export function bitsFromSamples(
  packed: Uint8Array,
  width: number,
  height: number
) {
  const stride = Math.ceil(width / 8)
  const bits = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      bits[y * width + x] =
        (packed[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 1
  return bits
}
