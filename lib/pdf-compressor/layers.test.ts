import { describe, expect, it } from "vitest"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  brightness,
  grow,
  inkMask,
  inkShare,
  meanLayer,
  rebuild,
  splitLayers,
} from "./layers"

/** A picture from a rule that gives each pixel's colour. */
const picture = (
  width: number,
  height: number,
  colour: (x: number, y: number) => [number, number, number]
): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set([...colour(x, y), 255], (y * width + x) * 4)
  return { data, width, height }
}
const grey = (value: number): [number, number, number] => [value, value, value]
/** Lines of print: dark marks 3 pixels wide, every 9 pixels, on every other band of 12 rows. */
const print = (x: number, y: number) => y % 24 < 12 && x % 9 < 3
const PAPER = 236
const INK = 30
const at = (mask: Uint8Array, width: number, x: number, y: number) =>
  mask[y * width + x]

describe("brightness", () => {
  it("weighs green most and blue least", () => {
    const light = brightness(
      picture(4, 1, (x) =>
        x === 0
          ? [255, 255, 255]
          : x === 1
            ? [255, 0, 0]
            : x === 2
              ? [0, 255, 0]
              : [0, 0, 255]
      )
    )
    expect([...light]).toEqual([255, 77, 149, 29])
  })
})

describe("inkMask", () => {
  it("finds print on paper, and nothing on a blank page", () => {
    const page = picture(320, 240, (x, y) => grey(print(x, y) ? INK : PAPER))
    const mask = inkMask(page)
    let wrong = 0
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 320; x++)
        if (at(mask, 320, x, y) !== (print(x, y) ? 1 : 0)) wrong++
    expect(wrong).toBe(0)
    expect(inkShare(inkMask(picture(320, 240, () => grey(PAPER))))).toBe(0)
  })

  it("follows paper that gets darker across the page", () => {
    // Bright on the left, dim on the right: the dim paper is darker than a
    // single line for the whole page would allow.
    const shade = (x: number) => 240 - Math.round((x / 640) * 110)
    const page = picture(640, 240, (x, y) => grey(print(x, y) ? 20 : shade(x)))
    const mask = inkMask(page)
    let wrong = 0
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 640; x++)
        if (at(mask, 640, x, y) !== (print(x, y) ? 1 : 0)) wrong++
    expect(wrong / (640 * 240)).toBeLessThan(0.002)
  })

  it("leaves a photograph to the paper layer", () => {
    let state = 7
    const page = picture(320, 320, (x, y) => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      // The top half is print; the bottom half is every brightness at once.
      return grey(y < 160 ? (print(x, y) ? INK : PAPER) : (state >>> 8) % 256)
    })
    const mask = inkMask(page)
    let below = 0
    for (let y = 200; y < 320; y++)
      for (let x = 0; x < 320; x++) below += at(mask, 320, x, y)
    expect(below).toBe(0)
    expect(at(mask, 320, 1, 5)).toBe(1)
  })

  it("leaves a filled shape to the paper layer", () => {
    // Seven pixels in ten are dark: a block of colour, not print.
    const page = picture(320, 320, (x) => grey(x % 10 < 7 ? INK : PAPER))
    expect(inkShare(inkMask(page))).toBe(0)
  })

  it("decides for every pixel when the page is to be black and white", () => {
    let state = 3
    const page = picture(320, 320, (x, y) => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      if (y < 100) return grey(20)
      if (y < 200) return grey(PAPER)
      return grey((state >>> 8) % 256)
    })
    const mask = inkMask(page, true)
    // A flat dark patch is ink, flat paper is not, and a photograph is some of each.
    expect(at(mask, 320, 160, 30)).toBe(1)
    expect(at(mask, 320, 160, 150)).toBe(0)
    let noisy = 0
    for (let y = 260; y < 320; y++)
      for (let x = 0; x < 320; x++) noisy += at(mask, 320, x, y)
    expect(noisy / (60 * 320)).toBeGreaterThan(0.2)
    expect(noisy / (60 * 320)).toBeLessThan(0.8)
  })

  it("works on a picture smaller than one neighbourhood", () => {
    const tiny = picture(5, 4, (x) => grey(x === 2 ? 0 : 255))
    expect([...inkMask(tiny)].filter(Boolean)).toHaveLength(4)
  })
})

describe("inkShare", () => {
  it("is the share of ink, and nothing for no pixels at all", () => {
    expect(inkShare(new Uint8Array([1, 0, 0, 1]))).toBe(0.5)
    expect(inkShare(new Uint8Array(0))).toBe(0)
  })
})

describe("grow", () => {
  it("spreads ink by a number of pixels each way, stopping at the edges", () => {
    const mask = new Uint8Array(6 * 5)
    mask[2 * 6 + 3] = 1
    mask[0] = 1
    const grown = grow(mask, 6, 5, 1)
    const rows = Array.from({ length: 5 }, (_, y) =>
      [...grown.subarray(y * 6, y * 6 + 6)].join("")
    )
    expect(rows).toEqual(["110000", "111110", "001110", "001110", "000000"])
  })
})

describe("meanLayer", () => {
  const page = picture(4, 4, (x, y) => [x * 10, y * 10, 100])
  const all = new Uint8Array(16).fill(1)

  it("gives each square the mean colour of its pixels", () => {
    const small = meanLayer(page, all, 2)
    expect(small.width).toBe(2)
    expect([...small.data]).toEqual([
      5, 5, 100, 255, 25, 5, 100, 255, 5, 25, 100, 255, 25, 25, 100, 255,
    ])
  })

  it("rounds the last squares up when the page does not divide evenly", () => {
    const small = meanLayer(page, all, 3)
    expect([small.width, small.height]).toEqual([2, 2])
    expect([...small.data.subarray(4, 7)]).toEqual([30, 10, 100])
  })

  it("goes by the pixels that count, and takes a neighbour's colour where none do", () => {
    // Only the top left pixel counts.
    const one = new Uint8Array(16)
    one[0] = 1
    const small = meanLayer(page, one, 2)
    for (let index = 0; index < 4; index++)
      expect([...small.data.subarray(index * 4, index * 4 + 4)]).toEqual([
        0, 0, 100, 255,
      ])
    // Only the bottom right pixel counts: colours spread the other way.
    const last = new Uint8Array(16)
    last[15] = 1
    const back = meanLayer(page, last, 2)
    for (let index = 0; index < 4; index++)
      expect([...back.data.subarray(index * 4, index * 4 + 3)]).toEqual([
        30, 30, 100,
      ])
  })

  it("stays black where nothing counts anywhere", () => {
    const small = meanLayer(page, new Uint8Array(16), 2)
    expect([...small.data]).toEqual([
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ])
  })

  it("can go by the darker half of a square alone", () => {
    const mixed = picture(2, 2, (x, y) => grey(x + y === 0 ? 10 : 200))
    const every = new Uint8Array(4).fill(1)
    expect(meanLayer(mixed, every, 2).data[0]).toBe(152)
    // Ink colours are rounded to the middle of steps of 16.
    expect(meanLayer(mixed, every, 2, true).data[0]).toBe(8)
    // A square with nothing to go by is not helped by asking for its darker half.
    expect(meanLayer(mixed, new Uint8Array(4), 2, true).data[0]).toBe(8)
  })

  it("gives a square that caught only a letter's rim the colour of the letter beside it", () => {
    // One pixel a square: a dark letter, its grey rim, red ink, and its pink rim.
    const colours: [number, number, number][] = [
      [30, 30, 30],
      [150, 150, 150],
      [200, 30, 40],
      [230, 150, 160],
      [60, 60, 60],
    ]
    const row = picture(5, 1, (x) => colours[x])
    const ink = meanLayer(row, new Uint8Array(5).fill(1), 1, true)
    const colourAt = (x: number) => [...ink.data.subarray(x * 4, x * 4 + 3)]
    expect(colourAt(0)).toEqual([24, 24, 24])
    // The grey rim follows the darkest grey next to it; red is not grey, and is passed over.
    expect(colourAt(1)).toEqual([24, 24, 24])
    // Coloured ink and its rim keep their colour beside black print.
    expect(colourAt(2)).toEqual([200, 24, 40])
    expect(colourAt(3)).toEqual([232, 152, 168])
    expect(colourAt(4)).toEqual([56, 56, 56])
  })

  it("leaves a grey that is nearly as dark as its neighbour, and looks past squares with no ink", () => {
    const row = picture(3, 2, (x, y) =>
      y === 1 ? grey(0) : x === 0 ? grey(90) : x === 1 ? grey(70) : grey(200)
    )
    // The bottom row has no ink at all, so its black is not a colour to follow.
    const counts = new Uint8Array([1, 1, 1, 0, 0, 0])
    const ink = meanLayer(row, counts, 1, true)
    expect(ink.data[0]).toBe(88)
    expect(ink.data[4]).toBe(72)
    // Paler by far than the square beside it: it follows.
    expect(ink.data[8]).toBe(72)
  })

  it("falls back on other pixels of the same square before a neighbour's", () => {
    const none = new Uint8Array(16)
    const some = new Uint8Array(16)
    some[5] = 1
    const small = meanLayer(page, none, 2, false, some)
    expect([...small.data.subarray(0, 3)]).toEqual([10, 10, 100])
  })
})

describe("splitLayers and rebuild", () => {
  /** Red print on cream paper. */
  const page = picture(240, 240, (x, y) =>
    print(x, y) ? [170, 20, 30] : [240, 232, 210]
  )

  it("puts ink and paper in layers of their own, and back together", () => {
    const layers = splitLayers(page, 4, 12)
    expect([layers.width, layers.height]).toEqual([240, 240])
    expect([layers.paper.width, layers.ink.width]).toEqual([60, 20])
    expect(inkShare(layers.mask)).toBeCloseTo(1 / 6, 2)
    // The paper has no print left in it, and the ink has no paper.
    for (
      let index = 0;
      index < layers.paper.width * layers.paper.height;
      index++
    )
      expect(layers.paper.data[index * 4]).toBe(240)
    for (let index = 0; index < layers.ink.width * layers.ink.height; index++)
      expect(layers.ink.data[index * 4]).toBe(168)
    // Put back together it is the page again, to within the rounding of the ink's colour.
    const back = rebuild(layers).data
    for (let at = 0; at < back.length; at += 97)
      expect(Math.abs(back[at] - page.data[at])).toBeLessThanOrEqual(8)
  })

  it("keeps a wide rim around letters on a large page", () => {
    // 2,400 pixels wide: two pixels round every mark are kept out of the paper.
    const wide = picture(2400, 48, (x, y) =>
      x === 1200 && y === 24
        ? grey(0)
        : x >= 1198 && x <= 1202
          ? grey(120)
          : grey(240)
    )
    const layers = splitLayers(wide, 1, 1)
    expect(layers.mask[24 * 2400 + 1200]).toBe(1)
  })
})
