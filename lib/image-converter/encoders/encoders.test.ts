// @vitest-environment node
import { describe, expect, it } from "vitest"
import sharp from "sharp"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { encodeBmp } from "./bmp"
import { encodeGif, lzw, type PaletteColour } from "./gif"
import { encodeIco, icoSizes } from "./ico"
import { createPdf, pageLayout, rgbBytes, type PdfImage } from "./pdf"
import { encodeTiff } from "./tiff"

/** 5×3 image: each pixel has a distinct colour, and the top-left one is transparent. */
function sample(): Pixels {
  const data = new Uint8ClampedArray(5 * 3 * 4)
  for (let i = 0; i < 15; i++)
    data.set([i * 16, 255 - i * 16, i * 7, 255], i * 4)
  data[3] = 0
  return { data, width: 5, height: 3 }
}
const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

describe("BMP", () => {
  it("writes 24-bit rows bottom-up with padding and the resolution", () => {
    const image = sample()
    const bmp = encodeBmp(image, { alpha: false, dpi: 300 })
    const header = view(bmp)
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM")
    expect(header.getUint32(2, true)).toBe(bmp.length)
    expect(header.getUint32(10, true)).toBe(54)
    expect([header.getInt32(18, true), header.getInt32(22, true)]).toEqual([
      5, 3,
    ])
    expect(header.getUint16(28, true)).toBe(24)
    expect(header.getUint32(30, true)).toBe(0)
    expect(header.getInt32(38, true)).toBe(11811)
    // 5 pixels × 3 bytes = 15, padded to 16 per row.
    expect(bmp.length).toBe(54 + 16 * 3)
    // The first stored row is the image's last row, as blue, green, red.
    const last = image.data.subarray(10 * 4, 10 * 4 + 3)
    expect([...bmp.subarray(54, 57)]).toEqual([last[2], last[1], last[0]])
    expect(bmp[54 + 15]).toBe(0)
  })

  it("writes 32-bit pixels with channel masks when there is transparency", () => {
    const bmp = encodeBmp(sample(), { alpha: true })
    const header = view(bmp)
    expect(header.getUint32(14, true)).toBe(124)
    expect(header.getUint16(28, true)).toBe(32)
    expect(header.getUint32(30, true)).toBe(3)
    expect(header.getUint32(66, true)).toBe(0xff000000)
    expect(header.getInt32(38, true)).toBe(2835)
    expect(bmp.length).toBe(138 + 5 * 4 * 3)
    expect(header.getUint32(70, true)).toBe(0x73524742)
    expect(header.getUint32(122, true)).toBe(4)
    // Top-left pixel is stored in the last row and keeps alpha 0.
    expect(bmp[138 + 2 * 20 + 3]).toBe(0)
    expect(bmp[138 + 2 * 20 + 7]).toBe(255)
  })
})

describe("TIFF", () => {
  it.each([false, true])(
    "is readable by another decoder (alpha %s)",
    async (alpha) => {
      const image = sample()
      const tiff = encodeTiff(image, { alpha, dpi: 300 })
      const decoded = sharp(tiff)
      const metadata = await decoded.metadata()
      expect(metadata).toMatchObject({
        format: "tiff",
        width: 5,
        height: 3,
        channels: alpha ? 4 : 3,
        density: 300,
      })
      const raw = await decoded.raw().toBuffer()
      expect([...raw.subarray(0, alpha ? 4 : 3)]).toEqual([
        ...image.data.subarray(0, alpha ? 4 : 3),
      ])
      const lastPixel = raw.subarray(raw.length - (alpha ? 4 : 3))
      expect([...lastPixel.subarray(0, 3)]).toEqual([
        ...image.data.subarray(56, 59),
      ])
    }
  )

  it("defaults to 72 DPI", async () => {
    expect(
      (await sharp(encodeTiff(sample(), { alpha: false })).metadata()).density
    ).toBe(72)
  })
})

describe("GIF", () => {
  const palette: PaletteColour[] = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ]

  it("round-trips palette indices through another decoder", async () => {
    const indices = Uint8Array.from([0, 1, 2, 2, 1, 0, 0, 0, 1, 1, 2, 2])
    const gif = encodeGif(indices, palette, 4, 3)
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe("GIF89a")
    expect(gif[gif.length - 1]).toBe(0x3b)
    const { data, info } = await sharp(gif)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([4, 3])
    const colours = [...indices].map((index) => palette[index].slice(0, 3))
    for (let i = 0; i < indices.length; i++)
      expect([
        ...data.subarray(i * info.channels, i * info.channels + 3),
      ]).toEqual(colours[i])
  })

  it("survives the code table filling up and resetting", async () => {
    const full: PaletteColour[] = Array.from({ length: 256 }, (_, i) => [
      i,
      255 - i,
      (i * 7) % 256,
      255,
    ])
    const width = 240
    const height = 200
    const indices = new Uint8Array(width * height)
    let seed = 7
    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      indices[i] = seed >>> 24
    }
    const gif = encodeGif(indices, full, width, height)
    const { data, info } = await sharp(gif)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([width, height])
    for (const i of [0, 1, 4097, 20000, indices.length - 1])
      expect([
        ...data.subarray(i * info.channels, i * info.channels + 3),
      ]).toEqual(full[indices[i]].slice(0, 3))
  })

  it("maps mostly transparent palette entries to one transparent colour", async () => {
    const withAlpha: PaletteColour[] = [[9, 9, 9, 0], ...palette, [1, 1, 1, 40]]
    const gif = encodeGif(Uint8Array.from([0, 1, 4, 3]), withAlpha, 2, 2)
    const { data, info } = await sharp(gif)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    expect([data[3], data[7], data[11], data[15]]).toEqual([0, 255, 0, 255])
  })

  it("pads tiny palettes and handles a single pixel", async () => {
    const gif = encodeGif(Uint8Array.from([0]), [[10, 20, 30, 255]], 1, 1)
    const { data } = await sharp(gif)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect([...data.subarray(0, 3)]).toEqual([10, 20, 30])
    // An empty stream still carries clear and end codes plus a block terminator.
    expect(lzw(new Uint8Array(), 2).at(-1)).toBe(0)
  })
})

describe("ICO", () => {
  it("lists entries smallest first with offsets, and writes 256 as 0", async () => {
    const png = async (size: number) =>
      new Uint8Array(
        await sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: "#00786f",
          },
        })
          .png()
          .toBuffer()
      )
    const ico = encodeIco([
      { size: 256, png: await png(256) },
      { size: 16, png: await png(16) },
      { size: 48, png: await png(48) },
    ])
    const header = view(ico)
    expect([
      header.getUint16(0, true),
      header.getUint16(2, true),
      header.getUint16(4, true),
    ]).toEqual([0, 1, 3])
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 48, 0])
    expect(header.getUint16(6 + 6, true)).toBe(32)
    for (let index = 0; index < 3; index++) {
      const at = 6 + index * 16
      const length = header.getUint32(at + 8, true)
      const offset = header.getUint32(at + 12, true)
      const metadata = await sharp(
        ico.subarray(offset, offset + length)
      ).metadata()
      expect(metadata.format).toBe("png")
      expect(metadata.width).toBe([16, 48, 256][index])
    }
    expect(icoSizes).toContain(32)
  })
})

describe("PDF", () => {
  const image = { width: 600, height: 300 }

  it("fits the page to the image at the chosen resolution", () => {
    expect(
      pageLayout(image, { page: "fit", dpi: 150, margin: "normal" })
    ).toEqual({
      page: { width: 288, height: 144 },
      draw: { x: 0, y: 0, width: 288, height: 144 },
    })
  })

  it("centres the image on paper, turning the sheet for landscape pictures", () => {
    const landscape = pageLayout(image, {
      page: "a4",
      dpi: 150,
      margin: "normal",
    })
    expect(landscape.page).toEqual({ width: 841.89, height: 595.28 })
    expect(landscape.draw.width).toBeCloseTo(769.89)
    expect(landscape.draw.x).toBe(36)
    expect(landscape.draw.y).toBeCloseTo((595.28 - 384.95) / 2, 1)
    const portrait = pageLayout(
      { width: 300, height: 600 },
      { page: "letter", dpi: 150, margin: "none" }
    )
    expect(portrait.page).toEqual({ width: 612, height: 792 })
    expect(portrait.draw).toEqual({ x: 108, y: 0, width: 396, height: 792 })
    expect(
      pageLayout(
        { width: 100, height: 100 },
        { page: "a4", dpi: 72, margin: "small" }
      ).draw.x
    ).toBe(18)
  })

  it("writes documents another PDF reader opens, one page per image", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const jpeg = new Uint8Array(
      await sharp({
        create: { width: 60, height: 30, channels: 3, background: "#00786f" },
      })
        .jpeg()
        .toBuffer()
    )
    const pages: PdfImage[] = [
      { kind: "dct", data: jpeg, width: 60, height: 30 },
      {
        kind: "flate",
        data: new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]),
        width: 1,
        height: 1,
      },
    ]
    const pdf = createPdf(pages, { page: "fit", dpi: 72, margin: "none" })
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe("%PDF-1.4")
    const document = await getDocument({ data: pdf.slice() }).promise
    expect(document.numPages).toBe(2)
    const first = await document.getPage(1)
    expect(first.view).toEqual([0, 0, 60, 30])
    const operators = await first.getOperatorList()
    expect(operators.fnArray.length).toBeGreaterThan(0)
    const second = await document.getPage(2)
    expect(second.view).toEqual([0, 0, 1, 1])
    const text = new TextDecoder("latin1").decode(pdf)
    expect(text).toContain("/DCTDecode")
    expect(text).toContain("/FlateDecode")
    const xref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe("xref")
  })

  it("drops alpha when packing RGB", () => {
    expect([
      ...rgbBytes(new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8])),
    ]).toEqual([1, 2, 3, 5, 6, 7])
  })
})
