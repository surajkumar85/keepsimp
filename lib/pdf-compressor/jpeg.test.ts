import { describe, expect, it } from "vitest"
import { estimateQuality, MARK, readJpeg, tagJpeg } from "./jpeg"

/** The standard brightness table at quality 50, in file order. */
const STANDARD = [
  16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22,
  22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78,
  64, 68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62, 77, 113,
  121, 112, 100, 120, 92, 101, 103, 99,
]
/** mozjpeg's preferred table at quality 50, which needs two bytes a value. */
const MOZJPEG = [
  16, 16, 16, 16, 17, 16, 18, 20, 20, 18, 25, 27, 24, 27, 25, 37, 34, 31, 31,
  34, 37, 56, 40, 43, 40, 43, 40, 56, 85, 53, 62, 53, 53, 62, 53, 85, 75, 91,
  74, 69, 74, 91, 75, 135, 106, 94, 94, 106, 135, 156, 131, 124, 131, 156, 189,
  169, 169, 189, 238, 226, 238, 311, 311, 418,
]

/** A table as libjpeg scales it for a quality. */
const scaled = (base: number[], quality: number) => {
  const percent = quality < 50 ? 5000 / quality : 200 - quality * 2
  return base.map((value) => Math.max(1, Math.round((value * percent) / 100)))
}

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 255,
  ...payload,
]
const table = (id: number, values: number[]) => [id, ...values]
const wideTable = (id: number, values: number[]) => [
  0x10 | id,
  ...values.flatMap((value) => [value >> 8, value & 255]),
]
const frame = (marker: number, width: number, height: number, parts = 3) =>
  segment(marker, [
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    parts,
    ...Array(parts * 3).fill(0),
  ])
const jpeg = (...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat()])
const scan = segment(0xda, [0, 0, 0, 0])

describe("estimateQuality", () => {
  it("finds the quality of a standard table", () => {
    for (const quality of [20, 50, 75, 90])
      expect(estimateQuality(scaled(STANDARD, quality))).toBe(quality)
  })

  it("finds the quality of a mozjpeg table", () => {
    for (const quality of [30, 60, 85])
      expect(
        Math.abs(estimateQuality(scaled(MOZJPEG, quality)) - quality)
      ).toBeLessThanOrEqual(1)
  })

  it("stays on the scale at either end", () => {
    expect(estimateQuality(Array(64).fill(1))).toBe(99)
    expect(estimateQuality(Array(64).fill(65535))).toBe(1)
  })
})

describe("readJpeg", () => {
  it("reads size, channels and quality", () => {
    expect(
      readJpeg(
        jpeg(
          segment(0xe0, [74, 70, 73, 70, 0]),
          segment(0xdb, table(0, scaled(STANDARD, 80))),
          frame(0xc0, 640, 480),
          segment(0xc4, [0, 1, 2]),
          scan
        )
      )
    ).toEqual({
      width: 640,
      height: 480,
      components: 3,
      progressive: false,
      quality: 80,
      ours: false,
    })
  })

  it("reads a progressive grey JPEG with tables of two bytes a value", () => {
    expect(
      readJpeg(
        jpeg(
          segment(0xdb, [
            ...wideTable(0, MOZJPEG),
            ...table(1, scaled(STANDARD, 10)),
          ]),
          frame(0xc2, 300, 200, 1),
          scan
        )
      )
    ).toEqual({
      width: 300,
      height: 200,
      components: 1,
      progressive: true,
      quality: 50,
      ours: false,
    })
  })

  it("has no quality to give when the file carries no brightness table", () => {
    expect(
      readJpeg(
        jpeg(segment(0xdb, table(1, STANDARD)), frame(0xc0, 8, 8, 4), scan)
      )
    ).toMatchObject({ components: 4, quality: null })
  })

  it("steps over fill bytes and markers that are not frames", () => {
    const bytes = jpeg(
      [0xff],
      segment(0x01, []),
      segment(0xc8, [1]),
      segment(0xcc, [1]),
      frame(0xc1, 20, 10)
    )
    expect(readJpeg(bytes)).toMatchObject({ width: 20, height: 10 })
  })

  it("knows a JPEG the compressor wrote by its mark", () => {
    const plain = jpeg(
      segment(0xfe, [...new TextEncoder().encode("Someone else")]),
      frame(0xc0, 4, 4),
      scan
    )
    expect(readJpeg(plain)!.ours).toBe(false)
    const tagged = tagJpeg(plain)
    expect(tagged.length).toBe(plain.length + MARK.length + 4)
    expect([...tagged.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xfe])
    expect(readJpeg(tagged)).toMatchObject({ width: 4, height: 4, ours: true })
  })

  it("stops at the end of the picture", () => {
    expect(readJpeg(jpeg([0xff, 0xd9, 0, 0], frame(0xc0, 1, 1)))).toBeNull()
  })

  it("refuses what is not a JPEG", () => {
    expect(readJpeg(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(readJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBeNull()
    expect(readJpeg(new Uint8Array([0xff, 0xd7, 0xff, 0xd9]))).toBeNull()
    expect(readJpeg(jpeg([0x00, 0xc0, 0, 4, 0, 0]))).toBeNull()
  })

  it("refuses a JPEG whose headers are cut short or make no sense", () => {
    expect(readJpeg(jpeg([0xff, 0xe0, 0, 1, 0, 0]))).toBeNull()
    expect(readJpeg(jpeg([0xff, 0xe0, 0, 99, 0, 0]))).toBeNull()
    expect(readJpeg(jpeg(segment(0xdb, [0, 1, 2, 3]), scan))).toBeNull()
    expect(readJpeg(jpeg(segment(0xc0, [8, 0, 1, 0]), scan))).toBeNull()
    expect(readJpeg(jpeg(segment(0xe0, [1, 2]), scan))).toBeNull()
  })
})
