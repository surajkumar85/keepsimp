import { describe, expect, it } from "vitest"
import { filterUp, greyPalette, readPng, samplesOf } from "./png"

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const word = (value: number) => [
  (value >> 24) & 255,
  (value >> 16) & 255,
  (value >> 8) & 255,
  value & 255,
]
const chunk = (type: string, data: number[]) => [
  ...word(data.length),
  ...[...type].map((letter) => letter.charCodeAt(0)),
  ...data,
  0,
  0,
  0,
  0,
]
const head = (
  width: number,
  height: number,
  bits: number,
  colour: number,
  interlace = 0
) =>
  chunk("IHDR", [
    ...word(width),
    ...word(height),
    bits,
    colour,
    0,
    0,
    interlace,
  ])
const png = (...chunks: number[][]) =>
  new Uint8Array([...SIGNATURE, ...chunks.flat()])
const end = chunk("IEND", [])

describe("readPng", () => {
  it("joins the data of a grey picture", () => {
    expect(
      readPng(
        png(
          head(3, 2, 8, 0),
          chunk("IDAT", [1, 2]),
          chunk("tEXt", [9]),
          chunk("IDAT", [3]),
          end,
          chunk("IDAT", [4])
        )
      )
    ).toEqual({
      width: 3,
      height: 2,
      bits: 8,
      colour: "grey",
      palette: null,
      data: new Uint8Array([1, 2, 3]),
    })
  })

  it("reads a colour picture that ends without saying so", () => {
    expect(
      readPng(png(head(70000, 1, 8, 2), chunk("IDAT", [5]), [0, 0, 0]))
    ).toMatchObject({ width: 70000, colour: "rgb", palette: null })
  })

  it("keeps the colours of a palette picture", () => {
    const read = readPng(
      png(
        head(2, 2, 2, 3),
        chunk("PLTE", [1, 2, 3, 4, 5, 6]),
        chunk("IDAT", [7])
      )
    )
    expect(read).toMatchObject({ bits: 2, colour: "palette" })
    expect([...read!.palette!]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("ignores a palette a colour picture merely suggests", () => {
    expect(
      readPng(
        png(head(1, 1, 8, 2), chunk("PLTE", [1, 2, 3]), chunk("IDAT", [7]))
      )?.palette
    ).toBeNull()
  })

  it("refuses what a PDF cannot hold as it is", () => {
    const data = chunk("IDAT", [1])
    expect(readPng(png(head(1, 1, 8, 6), data))).toBeNull()
    expect(readPng(png(head(1, 1, 8, 4), data))).toBeNull()
    expect(readPng(png(head(1, 1, 16, 0), data))).toBeNull()
    expect(readPng(png(head(1, 1, 8, 0, 1), data))).toBeNull()
    expect(
      readPng(png(head(1, 1, 8, 0), chunk("tRNS", [0, 0]), data))
    ).toBeNull()
    expect(readPng(png(head(1, 1, 8, 3), data))).toBeNull()
  })

  it("refuses what is not a whole PNG", () => {
    expect(readPng(new Uint8Array([1, 2, 3]))).toBeNull()
    expect(readPng(new Uint8Array(20))).toBeNull()
    expect(
      readPng(png(chunk("IHDR", [0, 0, 0, 1]), chunk("IDAT", [1])))
    ).toBeNull()
    expect(readPng(png(chunk("IDAT", [1])))).toBeNull()
    expect(readPng(png(head(1, 1, 8, 0), end))).toBeNull()
    expect(
      readPng(png(head(1, 1, 8, 0), [...word(500), 73, 68, 65, 84, 1, 2, 3, 4]))
    ).toBeNull()
  })
})

describe("samplesOf", () => {
  it("counts three samples for colour and one otherwise", () => {
    expect(samplesOf("rgb")).toBe(3)
    expect(samplesOf("grey")).toBe(1)
    expect(samplesOf("palette")).toBe(1)
  })
})

describe("greyPalette", () => {
  it("gives one byte a colour for shades of grey", () => {
    expect([...greyPalette(new Uint8Array([0, 0, 0, 90, 90, 90]))!]).toEqual([
      0, 90,
    ])
  })

  it("refuses a palette with any colour in it", () => {
    expect(greyPalette(new Uint8Array([10, 11, 10]))).toBeNull()
    expect(greyPalette(new Uint8Array([10, 10, 12]))).toBeNull()
  })
})

describe("filterUp", () => {
  it("stores each row as its difference from the row above", () => {
    expect([...filterUp(new Uint8Array([10, 20, 30, 12, 20, 5]), 3)]).toEqual([
      2, 10, 20, 30, 2, 2, 0, 231,
    ])
  })
})
