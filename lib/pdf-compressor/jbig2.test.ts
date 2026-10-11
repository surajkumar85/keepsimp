import { describe, expect, it } from "vitest"
import { bitsFromSamples, encodeGenericRegion, encodeJbig2 } from "./jbig2"

/**
 * A reader for what the writer writes, kept here so every test can go there
 * and back. It follows the standard's decoding procedures (T.88 Annex E and
 * 6.2.5.7), not the writer. The real-engine tests hold the writer to three
 * decoders written by others.
 */
const QE = [
  0x5601, 0x3401, 0x1801, 0x0ac1, 0x0521, 0x0221, 0x5601, 0x5401, 0x4801,
  0x3801, 0x3001, 0x2401, 0x1c01, 0x1601, 0x5601, 0x5401, 0x5101, 0x4801,
  0x3801, 0x3401, 0x3001, 0x2801, 0x2401, 0x2201, 0x1c01, 0x1801, 0x1601,
  0x1401, 0x1201, 0x1101, 0x0ac1, 0x09c1, 0x08a1, 0x0521, 0x0441, 0x02a1,
  0x0221, 0x0141, 0x0111, 0x0085, 0x0049, 0x0025, 0x0015, 0x0009, 0x0005,
  0x0001, 0x5601,
]
const NMPS = [
  1, 2, 3, 4, 5, 38, 7, 8, 9, 10, 11, 12, 13, 29, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 45, 46,
]
const NLPS = [
  1, 6, 9, 12, 29, 33, 6, 14, 14, 14, 17, 18, 20, 21, 14, 14, 15, 16, 17, 18,
  19, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 42, 43, 46,
]
const SWITCH = new Set([0, 6, 14])

function decodeGenericRegion(data: Uint8Array, width: number, height: number) {
  const index = new Uint8Array(1 << 16)
  const likely = new Uint8Array(1 << 16)
  let at = 0
  let c = (data[0] ?? 0xff) << 16
  let count = 0
  let a = 0x8000
  const byteIn = () => {
    if ((data[at] ?? 0xff) === 0xff) {
      if ((data[at + 1] ?? 0xff) > 0x8f) {
        c += 0xff00
        count = 8
      } else {
        at++
        c += (data[at] ?? 0xff) << 9
        count = 7
      }
    } else {
      at++
      c += (data[at] ?? 0xff) << 8
      count = 8
    }
  }
  byteIn()
  c <<= 7
  count -= 7
  const renorm = () => {
    do {
      if (count === 0) byteIn()
      a <<= 1
      c <<= 1
      count--
    } while (!(a & 0x8000))
  }
  const decode = (context: number) => {
    const row = index[context]
    const chance = QE[row]
    let bit: number
    a -= chance
    if (c >>> 16 < chance) {
      // The less likely half, unless the halves have changed places.
      if (a < chance) {
        bit = likely[context]
        index[context] = NMPS[row]
      } else {
        bit = 1 - likely[context]
        if (SWITCH.has(row)) likely[context] ^= 1
        index[context] = NLPS[row]
      }
      a = chance
      renorm()
    } else {
      c -= chance << 16
      if (a & 0x8000) return likely[context]
      if (a < chance) {
        bit = 1 - likely[context]
        if (SWITCH.has(row)) likely[context] ^= 1
        index[context] = NLPS[row]
      } else {
        bit = likely[context]
        index[context] = NMPS[row]
      }
      renorm()
    }
    return bit
  }
  const bits = new Uint8Array(width * height)
  const get = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width ? 0 : bits[y * width + x]
  let repeated = 0
  for (let y = 0; y < height; y++) {
    repeated ^= decode(0x9b25)
    for (let x = 0; x < width; x++) {
      if (repeated) {
        bits[y * width + x] = get(x, y - 1)
        continue
      }
      const context =
        get(x - 1, y) |
        (get(x - 2, y) << 1) |
        (get(x - 3, y) << 2) |
        (get(x - 4, y) << 3) |
        (get(x + 3, y - 1) << 4) |
        (get(x + 2, y - 1) << 5) |
        (get(x + 1, y - 1) << 6) |
        (get(x, y - 1) << 7) |
        (get(x - 1, y - 1) << 8) |
        (get(x - 2, y - 1) << 9) |
        (get(x - 3, y - 1) << 10) |
        (get(x + 2, y - 2) << 11) |
        (get(x + 1, y - 2) << 12) |
        (get(x, y - 2) << 13) |
        (get(x - 1, y - 2) << 14) |
        (get(x - 2, y - 2) << 15)
      bits[y * width + x] = decode(context)
    }
  }
  return bits
}

/** Pixels from a rule that is given each pixel's place. */
const picture = (
  width: number,
  height: number,
  rule: (x: number, y: number) => boolean
) => {
  const bits = new Uint8Array(width * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bits[y * width + x] = rule(x, y) ? 1 : 0
  return bits
}
/** A rule that is true for a given share of pixels, the same every run. */
const noise = (share: number, seed: number) => {
  let state = seed
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    return (state >>> 8) % 1000 < share * 1000
  }
}

describe("encodeGenericRegion", () => {
  const pictures: [
    string,
    number,
    number,
    (x: number, y: number) => boolean,
  ][] = [
    ["all white", 40, 30, () => false],
    ["all black", 40, 30, () => true],
    ["one pixel", 1, 1, () => true],
    ["one row", 300, 1, (x) => x % 7 < 3],
    ["one column", 1, 300, (_, y) => y % 5 < 2],
    ["stripes", 64, 64, (x) => x % 4 < 2],
    ["a checkerboard", 33, 21, (x, y) => (x + y) % 2 === 0],
    ["lines of marks", 400, 200, (x, y) => y % 20 < 9 && (x * 7 + y) % 11 < 4],
    ["sparse specks", 257, 129, noise(0.02, 3)],
    ["half noise", 301, 203, noise(0.5, 7)],
    ["mostly black noise", 200, 150, noise(0.9, 11)],
  ]

  for (const [name, width, height, rule] of pictures)
    it(`writes ${name} so that it reads back the same`, () => {
      const bits = picture(width, height, rule)
      const coded = encodeGenericRegion(bits, width, height)
      expect([...coded.subarray(-2)]).toEqual([0xff, 0xac])
      expect(decodeGenericRegion(coded, width, height)).toEqual(bits)
    })

  it("packs a page of repeated rows into a handful of bytes", () => {
    const bits = picture(1000, 1000, (x) => x % 100 < 10)
    expect(encodeGenericRegion(bits, 1000, 1000).length).toBeLessThan(200)
  })

  it("packs noise no better than it deserves, and marks far better than raw", () => {
    const random = encodeGenericRegion(
      picture(400, 400, noise(0.5, 5)),
      400,
      400
    )
    expect(random.length).toBeGreaterThan((400 * 400) / 8)
    const marks = picture(
      800,
      400,
      (x, y) => y % 20 < 9 && (x * 7 + y) % 11 < 4
    )
    expect(encodeGenericRegion(marks, 800, 400).length).toBeLessThan(
      (800 * 400) / 8 / 20
    )
  })

  it("never writes a marker inside its data", () => {
    // After a byte of 255 the next byte must stay below 144.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const coded = encodeGenericRegion(
        picture(240, 240, noise(0.3 + seed * 0.07, seed)),
        240,
        240
      )
      for (let at = 0; at < coded.length - 2; at++)
        if (coded[at] === 0xff) expect(coded[at + 1]).toBeLessThan(0x90)
    }
  })
})

describe("encodeJbig2", () => {
  it("wraps the pixels in a page and one region that covers it", () => {
    const bits = picture(300, 200, (x, y) => (x ^ y) % 9 === 0)
    const data = encodeJbig2(bits, 300, 200)
    const word = (at: number) =>
      ((data[at] << 24) |
        (data[at + 1] << 16) |
        (data[at + 2] << 8) |
        data[at + 3]) >>>
      0
    // The page: segment 0, kind 48, page 1, nineteen bytes that say its size.
    expect(word(0)).toBe(0)
    expect([data[4], data[5], data[6]]).toEqual([48, 0, 1])
    expect(word(7)).toBe(19)
    expect([word(11), word(15)]).toEqual([300, 200])
    // The region: segment 1, kind 38, and a length that runs to the end.
    const region = 11 + 19
    expect(word(region)).toBe(1)
    expect([data[region + 4], data[region + 5], data[region + 6]]).toEqual([
      38, 0, 1,
    ])
    expect(region + 11 + word(region + 7)).toBe(data.length)
    expect([word(region + 11), word(region + 15)]).toEqual([300, 200])
    // Template 0 with the row check, and its four pixels in the standard places.
    expect([...data.subarray(region + 28, region + 37)]).toEqual([
      8, 3, 255, 253, 255, 2, 254, 254, 254,
    ])
    expect(decodeGenericRegion(data.subarray(region + 37), 300, 200)).toEqual(
      bits
    )
  })
})

describe("bitsFromSamples", () => {
  it("turns packed samples into pixels, with 0 for black", () => {
    // Ten pixels a row, so six bits of padding end each row.
    const packed = new Uint8Array([
      0b01111111, 0b10111111, 0b11111110, 0b01000000,
    ])
    expect([...bitsFromSamples(packed, 10, 2)]).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
    ])
  })
})
