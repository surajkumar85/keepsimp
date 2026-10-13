// @vitest-environment node
/**
 * Compressing with the real engine. Files are written by pdf-lib with
 * pictures from mozjpeg and oxipng; results are read back by pdf.js and
 * pdf-lib, so the engine is never only checked against itself.
 */
import { readFileSync } from "node:fs"
import { deflateSync, inflateSync } from "node:zlib"
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  type PDFDict,
} from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { similarity, type Pixels } from "@/lib/image-compressor/ssim"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { makePdf, makePlainPdf } from "@/tests/pdf-fixtures"
import {
  chart,
  greyScene,
  jpegOf,
  makeDrawnPdf,
  makePicturePdf,
  makeScanPdf,
  noiseBytes,
  pictureDict,
  pictureText,
  pngOf,
  readPictures,
  samePixels,
  scannedPage,
  scanText,
  scene,
  type Placed,
} from "@/tests/pdf-pictures"
import { readPdf, texts } from "@/tests/pdf-reader"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { codecs } from "./codecs"
import { auditPdf } from "./mupdf-audit"
import {
  compressCustom,
  compressPdf,
  compressToSize,
  type Codecs,
  type CompressOptions,
} from "./mupdf-compress"
import { defaultExtras, lockOf, removalOf, type Removal } from "./options"
import { defaultCustom } from "./settings"
import { mostWrites, stepCount } from "./target"
import type { Level } from "./settings"

installNodeCodecShims()

const LEVELS: Level[] = ["lossless", "balanced", "strong"]

const compress = (
  bytes: Uint8Array,
  level: Level,
  options: Partial<CompressOptions> = {}
) => compressPdf(mupdf, bytes, { level, codecs, ...options })

const audit = (bytes: Uint8Array) => {
  const doc = new mupdf.PDFDocument(bytes)
  try {
    return auditPdf(doc, bytes.length)
  } finally {
    doc.destroy()
  }
}

/** The mean of each colour channel, which a mix-up of colours would move a long way. */
const tone = (pixels: Pixels) => {
  const sums = [0, 0, 0]
  for (let at = 0; at < pixels.data.length; at += 4)
    for (let channel = 0; channel < 3; channel++)
      sums[channel] += pixels.data[at + channel]
  return sums.map((sum) => sum / (pixels.width * pixels.height))
}

/** The description of every picture a file stores, read with pdf-lib. */
async function stored(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => (object as { dict?: PDFDict }).dict)
    .filter((dict) => String(dict?.get(PDFName.of("Subtype"))) === "/Image")
    .map((dict) => ({
      space: String(dict!.get(PDFName.of("ColorSpace"))),
      filter: String(dict!.get(PDFName.of("Filter"))),
      width: Number(String(dict!.get(PDFName.of("Width")))),
    }))
}

describe("photographs", () => {
  it("brings a photograph down to the size it is drawn at, and keeps the text", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
    ])
    const { bytes, report } = await compress(input, "balanced")
    expect(report.smaller).toBe(true)
    expect(report.after).toBe(bytes!.length)
    expect(bytes!.length).toBeLessThan(input.length / 3)
    expect(report.pictures).toEqual({ found: 1, changed: 1, resized: 1 })
    expect(report.check).toEqual({ checked: 1, changed: 1, low: [] })
    expect(await texts(bytes!)).toEqual([pictureText(1)])
    const [picture] = await readPictures(bytes!)
    // 400 points is 5.56 inches; at 150 dpi that is 833 pixels.
    expect(picture.width).toBe(833)
    expect(picture.height).toBe(625)
    expect(report.audit!.pictures[0]).toMatchObject({ width: 833, page: 1 })
  }, 60_000)

  it("goes further at the strong level", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
    ])
    const balanced = await compress(input, "balanced")
    const strong = await compress(input, "strong")
    expect(strong.bytes!.length).toBeLessThan(balanced.bytes!.length)
    // 96 dpi over 5.56 inches.
    expect((await readPictures(strong.bytes!))[0].width).toBe(533)
  }, 60_000)

  it("sizes a picture for the largest place it is drawn", async () => {
    const input = await makePicturePdf([
      {
        bytes: await jpegOf(scene(1600, 1200)),
        type: "jpeg",
        width: 100,
        again: 240,
      },
    ])
    const { bytes } = await compress(input, "balanced")
    const pictures = await readPictures(bytes!)
    // Drawn twice, stored once, with enough pixels for 240 points at 150 dpi.
    expect(pictures.map((picture) => picture.width)).toEqual([500, 500])
    expect(await stored(bytes!)).toHaveLength(1)
  }, 60_000)

  it("changes no photograph when nothing may be lost", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
    ])
    const { bytes, report } = await compress(input, "lossless")
    expect(report.pictures.changed).toBe(0)
    expect(bytes).toBeNull()
  }, 60_000)

  it("leaves a JPEG that is already at a low quality", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(800, 600), 60), type: "jpeg", width: 500 },
    ])
    const { bytes, report } = await compress(input, "balanced")
    expect(report.pictures.changed).toBe(0)
    expect(bytes).toBeNull()
  }, 60_000)

  it("finds nothing more to take from its own result", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
      { bytes: await pngOf(chart(900, 600)), type: "png", width: 300 },
    ])
    const first = await compress(input, "balanced")
    const second = await compress(first.bytes!, "balanced")
    expect(second.bytes).toBeNull()
    expect(second.report.pictures.changed).toBe(0)
  }, 60_000)

  it("keeps a grey photograph grey", async () => {
    const jpeg = await codecs.jpeg(greyScene(1200, 900), 92, true)
    const input = await makeDrawnPdf((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(jpeg, {
            ...pictureDict(1200, 900),
            ColorSpace: "DeviceGray",
            Filter: "DCTDecode",
          })
        ),
        width: 300,
        height: 225,
      },
    ])
    const { bytes } = await compress(input, "balanced")
    expect(bytes!.length).toBeLessThan(input.length / 2)
    expect(await stored(bytes!)).toEqual([
      { space: "/DeviceGray", filter: "/DCTDecode", width: 625 },
    ])
  }, 60_000)

  it("turns a photograph stored without loss into a JPEG of the same size", async () => {
    const source = scene(700, 500)
    const input = await makePicturePdf([
      { bytes: await pngOf(source), type: "png", width: 400 },
    ])
    const { bytes, report } = await compress(input, "balanced")
    expect(report.pictures).toEqual({ found: 1, changed: 1, resized: 0 })
    const [picture] = await readPictures(bytes!)
    expect(picture.width).toBe(700)
    expect(similarity(source, picture).mean).toBeGreaterThan(0.95)
  }, 60_000)
})

describe("drawings", () => {
  it("stores a drawing again without changing a pixel", async () => {
    const input = await makePicturePdf([
      { bytes: await pngOf(chart(800, 600)), type: "png", width: 500 },
    ])
    const [before] = await readPictures(input)
    for (const level of LEVELS) {
      const { bytes } = await compress(input, level)
      const [after] = await readPictures(bytes ?? input)
      expect(after.width).toBe(800)
      expect(similarity(before, after).mean).toBe(1)
    }
  }, 60_000)

  it("gives a drawing a palette where nothing may change only if it is drawn near its own size", async () => {
    // A viewer built on MuPDF draws a palette picture differently once it
    // is shown at half its size or less, so a picture with far more pixels
    // than it is shown with keeps its colours as they are.
    const flat = await pngOf(chart(1200, 900))
    const fine = await makePicturePdf([
      { bytes: flat, type: "png", width: 150 },
    ])
    expect((await stored(fine))[0].space).toBe("/DeviceRGB")
    const kept = await compress(fine, "lossless")
    expect((await stored(kept.bytes ?? fine))[0].space).toBe("/DeviceRGB")
    expect(kept.report.check.low).toEqual([])
    // The other levels take the palette: the page is held to their mark.
    const smaller = await compress(fine, "balanced")
    expect(smaller.report.check.low).toEqual([])
    expect(smaller.bytes!.length).toBeLessThan((kept.bytes ?? fine).length)

    // 1,200 pixels over 8 inches is 150 to the inch.
    const coarse = await makePicturePdf([
      { bytes: flat, type: "png", width: 576 },
    ])
    const [before] = await readPictures(coarse)
    const packed = await compress(coarse, "lossless")
    expect(packed.bytes).not.toBeNull()
    expect((await stored(packed.bytes!))[0].space).toContain("/Indexed")
    expect(packed.report.check.low).toEqual([])
    const [after] = await readPictures(packed.bytes!)
    expect(samePixels(after, before)).toBe(true)
  }, 60_000)

  it("keeps a flat drawing whole when every pixel packs tightest", async () => {
    const input = await makePicturePdf([
      { bytes: await pngOf(chart(2400, 1800)), type: "png", width: 300 },
    ])
    const [before] = await readPictures(input)
    const { bytes, report } = await compress(input, "balanced")
    // Made smaller it would have soft edges, which pack worse than flat colour.
    expect(report.pictures).toEqual({ found: 1, changed: 1, resized: 0 })
    expect(bytes!.length).toBeLessThan(input.length / 2)
    const [picture] = await readPictures(bytes!)
    expect(picture.width).toBe(2400)
    expect(similarity(before, picture).mean).toBe(1)
    expect((await stored(bytes!))[0].filter).toBe("/FlateDecode")
  }, 60_000)
})

describe("see-through pictures", () => {
  it("keeps the soft mask of a picture exactly", async () => {
    const source = scene(600, 400)
    for (let at = 3; at < source.data.length; at += 4)
      source.data[at] = (at / 4) % 600 < 300 ? 255 : 110
    const input = await makePicturePdf([
      { bytes: await pngOf(source), type: "png", width: 400 },
    ])
    const [before] = await readPictures(input)
    const { bytes, report } = await compress(input, "balanced")
    expect(report.pictures.found).toBe(2)
    const [after] = await readPictures(bytes!)
    expect(after.width).toBe(600)
    for (let at = 3; at < after.data.length; at += 4 * 1001)
      expect(after.data[at]).toBe(before.data[at])
    expect(similarity(before, after).mean).toBeGreaterThan(0.95)
  }, 60_000)
})

describe("unusual pictures", () => {
  const WIDTH = 400
  const HEIGHT = 300
  const drawn = { width: 400, height: 300 }

  /** Compress a file of hand-made pictures and read them before and after. */
  async function roundTrip(
    build: Parameters<typeof makeDrawnPdf>[0],
    level: Level = "balanced"
  ) {
    const input = await makeDrawnPdf(build)
    const result = await compress(input, level)
    return {
      ...result,
      input,
      before: await readPictures(input),
      after: await readPictures(result.bytes ?? input),
    }
  }

  it("keeps a palette picture exactly, and stores it smaller", async () => {
    const indices = new Uint8Array(WIDTH * HEIGHT)
    for (let at = 0; at < indices.length; at++)
      indices[at] = (((at % WIDTH) >> 5) + Math.floor(at / WIDTH / 40)) & 3
    const { bytes, before, after, report } = await roundTrip((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(indices, {
            ...pictureDict(WIDTH, HEIGHT),
            ColorSpace: [
              "Indexed",
              "DeviceRGB",
              3,
              PDFHexString.of("ff000000ff000000ffffff00"),
            ],
          })
        ),
        ...drawn,
      },
    ])
    expect(report.pictures.changed).toBe(1)
    expect(bytes).not.toBeNull()
    expect(similarity(before[0], after[0]).mean).toBe(1)
  }, 60_000)

  it("keeps a picture that is stored upside down in brightness", async () => {
    const grey = new Uint8Array(WIDTH * HEIGHT)
    for (let at = 0; at < grey.length; at++) grey[at] = (at % WIDTH) & 255
    const { before, after, report } = await roundTrip(
      (doc) => [
        {
          ref: doc.context.register(
            doc.context.stream(grey, {
              ...pictureDict(WIDTH, HEIGHT),
              ColorSpace: "DeviceGray",
              Decode: [1, 0],
            })
          ),
          ...drawn,
        },
      ],
      "lossless"
    )
    expect(report.pictures.changed).toBe(1)
    // The first pixel is stored as 0 and shown as white.
    expect(before[0].data[0]).toBe(255)
    expect([...after[0].data]).toEqual([...before[0].data])
  }, 60_000)

  it("leaves the pixels of pictures it is not sure of exactly as they are", async () => {
    const bits = new Uint8Array((WIDTH / 8) * HEIGHT).map((_, at) =>
      at % 3 ? 0xf0 : 0x3c
    )
    const deep = noiseBytes(WIDTH * HEIGHT * 2)
    const keyed = new Uint8Array(WIDTH * HEIGHT * 3).map((_, at) => at % 200)
    const { bytes, before, after, report } = await roundTrip((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(bits, {
            ...pictureDict(WIDTH, HEIGHT, 1),
            ColorSpace: "DeviceGray",
          })
        ),
        ...drawn,
      },
      {
        ref: doc.context.register(
          doc.context.stream(deep, {
            ...pictureDict(WIDTH, HEIGHT, 16),
            ColorSpace: "DeviceGray",
          })
        ),
        width: 40,
        height: 30,
      },
      {
        ref: doc.context.register(
          doc.context.stream(keyed, {
            ...pictureDict(WIDTH, HEIGHT),
            ColorSpace: "DeviceRGB",
            Mask: [0, 10, 0, 10, 0, 10],
          })
        ),
        width: 40,
        height: 30,
      },
    ])
    // The one-bit picture is packed again without loss; the other two are untouched.
    expect(report.pictures).toEqual({ found: 3, changed: 1, resized: 0 })
    expect(bytes).not.toBeNull()
    expect((await stored(bytes!)).map((picture) => picture.filter)).toEqual([
      "/JBIG2Decode",
      "/FlateDecode",
      "/FlateDecode",
    ])
    expect(after.map((picture) => [...picture.data])).toEqual(
      before.map((picture) => [...picture.data])
    )
  }, 60_000)

  it("keeps a CMYK photograph in CMYK, with its colours where they were", async () => {
    const size = { width: 1200, height: 900 }
    const cmyk = new mupdf.Pixmap(
      mupdf.ColorSpace.DeviceCMYK,
      [0, 0, size.width, size.height],
      false
    )
    const pixels = cmyk.getPixels()
    for (let y = 0; y < size.height; y++)
      for (let x = 0; x < size.width; x++) {
        const at = (y * size.width + x) * 4
        pixels[at] = 128 + 100 * Math.sin(x / 60)
        pixels[at + 1] = 128 + 100 * Math.sin(y / 45)
        pixels[at + 2] = 60 + 50 * Math.cos((x + y) / 80)
        pixels[at + 3] = 20
      }
    const jpeg = cmyk.asJPEG(92, false).slice()
    cmyk.destroy()
    const { bytes, before, after, report } = await roundTrip((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(jpeg, {
            ...pictureDict(size.width, size.height),
            ColorSpace: "DeviceCMYK",
            Filter: "DCTDecode",
          })
        ),
        width: 300,
        height: 225,
      },
    ])
    expect(report.pictures).toEqual({ found: 1, changed: 1, resized: 1 })
    expect(report.check.low).toEqual([])
    expect(await stored(bytes!)).toEqual([
      { space: "/DeviceCMYK", filter: "/DCTDecode", width: 625 },
    ])
    const was = tone(before[0])
    const is = tone(after[0])
    for (let channel = 0; channel < 3; channel++)
      expect(Math.abs(was[channel] - is[channel])).toBeLessThan(4)
  }, 60_000)
})

describe("black-and-white pictures", () => {
  const WIDTH = 1240
  const HEIGHT = 900

  /** A page of marks like print, one bit a pixel with 1 for white, rows padded to whole bytes. */
  function marks(seed = 5) {
    const stride = Math.ceil(WIDTH / 8)
    const packed = new Uint8Array(stride * HEIGHT).fill(0xff)
    let state = seed
    const random = (below: number) => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      return (state >>> 8) % below
    }
    for (let line = 20; line < HEIGHT - 20; line += 28)
      for (let x = 20; x < WIDTH - 20; x += 3 + random(9)) {
        const tall = 4 + random(14)
        const wide = 1 + random(4)
        for (let dy = 0; dy < tall; dy++)
          for (let dx = 0; dx < wide; dx++)
            packed[(line + dy) * stride + ((x + dx) >> 3)] &= ~(
              0x80 >>
              ((x + dx) & 7)
            )
      }
    return packed
  }
  const drawn = { width: 500, height: 363 }

  it("packs a one-bit picture with JBIG2 at every level, pixel for pixel", async () => {
    const input = await makeDrawnPdf((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(marks(), {
            ...pictureDict(WIDTH, HEIGHT, 1),
            ColorSpace: "DeviceGray",
          })
        ),
        ...drawn,
      },
    ])
    const [before] = await readPictures(input)
    for (const level of LEVELS) {
      const { bytes, report } = await compress(input, level)
      expect(report.pictures).toEqual({ found: 1, changed: 1, resized: 0 })
      expect(await stored(bytes!)).toEqual([
        { space: "/DeviceGray", filter: "/JBIG2Decode", width: WIDTH },
      ])
      // A tenth of what the bits take raw.
      expect(bytes!.length).toBeLessThan(input.length / 10)
      const [after] = await readPictures(bytes!)
      expect(similarity(before, after).mean).toBe(1)
    }
  }, 60_000)

  it("beats fax packing, and keeps a palette of two colours", async () => {
    const raw = await makeDrawnPdf((doc) => [
      {
        ref: doc.context.register(
          doc.context.stream(marks(9), {
            ...pictureDict(WIDTH, HEIGHT, 1),
            ColorSpace: [
              "Indexed",
              "DeviceRGB",
              1,
              PDFHexString.of("0044aaffffee"),
            ],
          })
        ),
        ...drawn,
      },
      {
        ref: doc.context.register(
          doc.context.stream(marks(3), {
            ...pictureDict(WIDTH, HEIGHT, 1),
            ColorSpace: "DeviceGray",
          })
        ),
        ...drawn,
      },
    ])
    // The engine's own writer packs raw one-bit pictures as fax.
    const fax = new mupdf.PDFDocument(raw)
    const input = fax.saveToBuffer({ compress: "yes" }).asUint8Array().slice()
    fax.destroy()
    expect((await stored(input)).map((picture) => picture.filter)).toContain(
      "/CCITTFaxDecode"
    )
    const before = await readPictures(input)
    const { bytes, report } = await compress(input, "lossless")
    expect(report.pictures.changed).toBe(2)
    expect((await stored(bytes!)).map((picture) => picture.filter)).toEqual([
      "/JBIG2Decode",
      "/JBIG2Decode",
    ])
    expect(bytes!.length).toBeLessThan(input.length * 0.9)
    const after = await readPictures(bytes!)
    // The first is blue on cream, not black on white.
    expect([...after[0].data.subarray(0, 3)]).toEqual([255, 255, 238])
    for (const [index, picture] of after.entries())
      expect(similarity(before[index], picture).mean).toBe(1)
  }, 60_000)

  it("keeps a stencil painting where it painted, either way up", async () => {
    const input = await makeDrawnPdf(
      () => [],
      (doc, page) => {
        const stencil = (decode?: number[]) =>
          doc.context.register(
            doc.context.stream(marks(4), {
              Type: "XObject",
              Subtype: "Image",
              Width: WIDTH,
              Height: HEIGHT,
              ImageMask: true,
              ...(decode ? { Decode: decode } : null),
            })
          )
        page.node
          .Resources()!
          .set(
            PDFName.of("XObject"),
            doc.context.obj({ Up: stencil(), Down: stencil([1, 0]) })
          )
        page.node.addContentStream(
          doc.context.register(
            doc.context.stream(
              "q 0 0.4 0.6 rg 500 0 0 363 40 400 cm /Up Do Q q 0.7 0 0 rg 500 0 0 363 40 20 cm /Down Do Q"
            )
          )
        )
      }
    )
    const { bytes, report } = await compress(input, "lossless")
    expect(report.pictures).toEqual({ found: 2, changed: 2, resized: 0 })
    expect(report.check.low).toEqual([])
    // Drawn by the engine before and after, the page is the same to the pixel.
    const was = new mupdf.PDFDocument(input)
    const is = new mupdf.PDFDocument(bytes!)
    const picture = (doc: mupdf.PDFDocument) =>
      doc
        .loadPage(0)
        .toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false)
        .getPixels()
        .slice()
    const first = picture(was)
    expect([...picture(is)]).toEqual([...first])
    // Both colours are on the page: the stencils paint, one the other way up.
    expect(first.some((value, at) => at % 3 === 0 && value > 170)).toBe(true)
    was.destroy()
    is.destroy()
  }, 60_000)
})

describe("scanned pages", () => {
  /** Two pages scanned at 150 dpi: 1,240 by 1,754 pixels each. */
  const scan = async () =>
    makeScanPdf([
      await jpegOf(scannedPage(1240, 1754, 1), 88),
      await jpegOf(scannedPage(1240, 1754, 2), 88),
    ])
  const words = [scanText(1), scanText(2)]
  /** How alike the engine draws a page of two files (mean SSIM). */
  const alike = (a: Uint8Array, b: Uint8Array, page = 0) => {
    const first = new mupdf.PDFDocument(a)
    const second = new mupdf.PDFDocument(b)
    try {
      return similarity(
        drawPage(mupdf, first, page, 1000),
        drawPage(mupdf, second, page, 1000)
      ).mean
    } finally {
      first.destroy()
      second.destroy()
    }
  }

  it("rebuilds a scan as sharp letters over soft paper, far smaller than a picture of it", async () => {
    const input = await scan()
    const usual = await compress(input, "balanced")
    const { bytes, report } = await compress(input, "balanced", {
      scans: "layers",
    })
    expect(report.scans).toEqual({ how: "layers", pictures: 2 })
    expect(report.check.low).toEqual([])
    // At 150 dpi already, the usual way finds little to take.
    expect(bytes!.length).toBeLessThan((usual.bytes ?? input).length / 4)
    expect(bytes!.length).toBeLessThan(input.length / 6)
    console.info(
      `scan of ${input.length} bytes: usual ${(usual.bytes ?? input).length}, layers ${bytes!.length}`
    )
    // The hidden words are where they were.
    expect(await texts(bytes!)).toEqual(words)
    // Each page is now a mask, soft paper as a JPEG, and the ink's colours without loss.
    const filters = (await stored(bytes!)).map((picture) => picture.filter)
    for (const filter of ["/JBIG2Decode", "/DCTDecode", "/FlateDecode"])
      expect(filters.filter((found) => found === filter)).toHaveLength(2)
    expect(alike(input, bytes!)).toBeGreaterThan(0.9)
    // The stamp is still red: pdf.js reads the ink's colours through the mask.
    const pictures = await readPictures(bytes!)
    expect(pictures.filter((picture) => picture.page === 1)).toHaveLength(2)
  }, 120_000)

  it("turns a scan black and white, like a photocopy", async () => {
    const input = await scan()
    const { bytes, report } = await compress(input, "balanced", {
      scans: "mono",
    })
    expect(report.scans).toEqual({ how: "mono", pictures: 2 })
    expect(report.check.low).toEqual([])
    expect(bytes!.length).toBeLessThan(input.length / 15)
    expect(await texts(bytes!)).toEqual(words)
    expect(await stored(bytes!)).toEqual([
      { space: "/DeviceGray", filter: "/JBIG2Decode", width: 1240 },
      { space: "/DeviceGray", filter: "/JBIG2Decode", width: 1240 },
    ])
    const [page] = await readPictures(bytes!)
    // Only black and white, with far more paper than ink, and ink where the print is.
    let black = 0
    for (let at = 0; at < page.data.length; at += 4) {
      expect(page.data[at] === 0 || page.data[at] === 255).toBe(true)
      if (page.data[at] === 0) black++
    }
    const share = black / (page.width * page.height)
    expect(share).toBeGreaterThan(0.05)
    expect(share).toBeLessThan(0.3)
  }, 120_000)

  it("takes the colour out of a scan", async () => {
    const input = await scan()
    const usual = await compress(input, "balanced")
    const { bytes, report } = await compress(input, "balanced", {
      scans: "grey",
    })
    expect(report.scans).toEqual({ how: "grey", pictures: 2 })
    expect(report.check.low).toEqual([])
    expect(bytes!.length).toBeLessThan((usual.bytes ?? input).length)
    expect((await stored(bytes!)).map((picture) => picture.space)).toEqual([
      "/DeviceGray",
      "/DeviceGray",
    ])
    const [page] = await readPictures(bytes!)
    expect(page.data[0]).toBe(page.data[1])
    expect(await texts(bytes!)).toEqual(words)
  }, 120_000)

  it("leaves a scan with no print in it to the usual way, and scans alone where nothing may be lost", async () => {
    // A photograph from edge to edge has no letters to keep sharp.
    const photo = await makeScanPdf([await jpegOf(scene(1240, 1754), 90)])
    const rebuilt = await compress(photo, "balanced", { scans: "layers" })
    expect(rebuilt.report.scans).toBeUndefined()
    expect(rebuilt.report.pictures.changed).toBe(1)
    expect((await stored(rebuilt.bytes!))[0].filter).toBe("/DCTDecode")
    const input = await scan()
    const lossless = await compress(input, "lossless", { scans: "mono" })
    expect(lossless.report.scans).toBeUndefined()
    expect(lossless.report.pictures.changed).toBe(0)
  }, 120_000)

  it("does not take a small picture on a page for a scan", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scannedPage(800, 600)), type: "jpeg", width: 200 },
    ])
    const { bytes, report } = await compress(input, "balanced", {
      scans: "mono",
    })
    expect(report.scans).toBeUndefined()
    expect((await stored(bytes!))[0].filter).toBe("/DCTDecode")
  }, 120_000)

  it("brings a scan under a size with its letters still sharp", async () => {
    const input = await scan()
    const { bytes, report } = await compressToSize(mupdf, input, {
      codecs,
      target: 60_000,
      further: false,
      scans: "layers",
    })
    expect(report.target!.met).toBe(true)
    expect(bytes!.length).toBeLessThanOrEqual(60_000)
    expect(report.scans).toEqual({ how: "layers", pictures: 2 })
    expect(await texts(bytes!)).toEqual(words)
  }, 120_000)
})

describe("what is kept", () => {
  it("keeps links, bookmarks, fields, notes, tags, page numbers and attachments", async () => {
    const input = await makePdf("keep", {
      pages: 4,
      links: [
        { from: 1, to: 3 },
        { from: 2, to: 4, how: "name" },
      ],
      bookmarks: [
        { title: "Start", page: 1, children: [{ title: "End", page: 4 }] },
      ],
      fields: [{ name: "who", value: "Ada", page: 2 }],
      notes: [{ page: 3, text: "Check this" }],
      tagged: true,
      romanPages: 2,
      attachments: { "data.txt": "attached" },
      title: "Kept",
      picture: true,
    })
    const { bytes, report } = await compress(input, "strong")
    expect(report.smaller).toBe(true)
    const before = await readPdf(input)
    const after = await readPdf(bytes!)
    expect(after.pages).toEqual(before.pages)
    expect(after.bookmarks).toEqual(before.bookmarks)
    expect(after.fields).toEqual(before.fields)
    expect(after.labels).toEqual(before.labels)
    expect(after.attachments).toEqual(before.attachments)
    expect(after.info.Title).toBe("Kept")
    const doc = await PDFDocument.load(bytes!)
    expect(String(doc.catalog.get(PDFName.of("MarkInfo")))).toContain("true")
  }, 60_000)

  it("keeps a locked file locked with the same password", async () => {
    const input = await makePicturePdf(
      [{ bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 300 }],
      1,
      "open sesame"
    )
    await expect(compress(input, "balanced")).rejects.toThrow(/password/i)
    await expect(
      compress(input, "balanced", { password: "wrong" })
    ).rejects.toThrow(/did not open/i)
    const { bytes } = await compress(input, "balanced", {
      password: "open sesame",
    })
    expect(bytes!.length).toBeLessThan(input.length / 2)
    await expect(texts(bytes!)).rejects.toThrow()
    expect(await texts(bytes!, "open sesame")).toEqual([pictureText(1)])
    expect((await readPdf(bytes!, "open sesame")).encrypted).toBe(true)
  }, 60_000)
})

describe("what is not a picture", () => {
  const xml = (words: string, archive = false) =>
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">${
      archive ? "<pdfaid:part>2</pdfaid:part>" : ""
    }${`<rdf:li>${words}</rdf:li>`.repeat(1500)}</x:xmpmeta><?xpacket end="w"?>`

  /** A page whose text was packed in a hurry, with details on the page and on the document. */
  async function hurried(archive = false, count = 1200) {
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 400])
    const font = doc.embedStandardFont(StandardFonts.Helvetica)
    const lines = Array.from(
      { length: count },
      (_, index) =>
        `BT /F1 6 Tf ${20 + (index % 5) * 70} ${390 - Math.floor(index / 5)} Td (w${index}) Tj ET`
    ).join("\n")
    const weak = new Uint8Array(deflateSync(Buffer.from(lines), { level: 1 }))
    page.node.set(
      PDFName.of("Contents"),
      doc.context.register(doc.context.stream(weak, { Filter: "FlateDecode" }))
    )
    page.node.set(
      PDFName.of("Resources"),
      doc.context.obj({ Font: { F1: font.ref } })
    )
    const details = (text: string) =>
      doc.context.register(
        doc.context.stream(text, { Type: "Metadata", Subtype: "XML" })
      )
    doc.catalog.set(PDFName.of("Metadata"), details(xml("document", archive)))
    page.node.set(PDFName.of("Metadata"), details(xml("page")))
    return {
      input: await doc.save({ useObjectStreams: false }),
      weak: weak.length,
    }
  }

  /** The details stream under `key` of the catalog or of the first page, as stored. */
  async function detailsOf(bytes: Uint8Array, where: "document" | "page") {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const holder = where === "document" ? doc.catalog : doc.getPage(0).node
    const stream = holder.lookup(PDFName.of("Metadata")) as unknown as {
      dict: PDFDict
      contents: Uint8Array
    }
    return {
      filter: String(stream.dict.get(PDFName.of("Filter"))),
      bytes: stream.contents,
    }
  }

  it("packs page content again, and the details of single objects, never the document's own", async () => {
    const { input, weak } = await hurried()
    const { bytes, report } = await compress(input, "lossless")
    expect(bytes).not.toBeNull()
    expect(report.check.low).toEqual([])
    // What is left is mostly the document's own details, as they were.
    expect(bytes!.length).toBeLessThan(input.length * 0.65)
    expect((await texts(bytes!))[0]).toContain("w1199")
    expect(await texts(bytes!)).toEqual(await texts(input))
    // The document's own details can still be found by software that only looks for them.
    const own = await detailsOf(bytes!, "document")
    expect(own.filter).toBe("undefined")
    expect(Buffer.from(own.bytes).toString()).toBe(xml("document"))
    // Those of the page are packed, and unpack to what they were.
    const part = await detailsOf(bytes!, "page")
    expect(part.filter).toBe("/FlateDecode")
    expect(inflateSync(part.bytes).toString()).toBe(xml("page"))
    // The page's text takes less room than it did.
    const page = (await PDFDocument.load(bytes!)).getPage(0).node
    const content = page.lookup(PDFName.of("Contents")) as unknown as {
      contents: Uint8Array
    }
    expect(content.contents.length).toBeLessThan(weak * 0.95)
  }, 60_000)

  it("leaves every set of details unpacked in an archive file", async () => {
    // Enough text for the file to come out smaller without its details.
    const { input } = await hurried(true, 9000)
    const { bytes } = await compress(input, "lossless")
    expect(bytes).not.toBeNull()
    const part = await detailsOf(bytes!, "page")
    expect(part.filter).toBe("undefined")
    expect(Buffer.from(part.bytes).toString()).toBe(xml("page"))
  }, 60_000)

  it("puts back a stream that does not read back as it was", async () => {
    const { input } = await hurried()
    const faulty: Codecs["deflate"][] = [
      // Packed well, but not what it was given.
      async (bytes) =>
        new Uint8Array(deflateSync(Buffer.from(bytes).reverse(), { level: 9 })),
      // Not packed data at all.
      async () => new Uint8Array(16),
    ]
    for (const deflate of faulty) {
      const { bytes } = await compress(input, "lossless", {
        codecs: { ...codecs, deflate },
      })
      const output = bytes ?? input
      expect(await texts(output)).toEqual(await texts(input))
      const part = await detailsOf(output, "page")
      expect(part.filter).toBe("undefined")
      expect(Buffer.from(part.bytes).toString()).toBe(xml("page"))
    }
  }, 60_000)

  it("finds nothing more to pack in its own result", async () => {
    const { input } = await hurried()
    const first = await compress(input, "lossless")
    const second = await compress(first.bytes!, "lossless")
    expect(second.bytes).toBeNull()
  }, 60_000)
})

describe("what is taken out", () => {
  it("drops page thumbnails and private app data, and says so", async () => {
    const input = await makeDrawnPdf(
      () => [],
      (doc, page) => {
        const { context } = doc
        page.node.set(
          PDFName.of("Thumb"),
          context.register(
            context.stream(noiseBytes(30_000), {
              Width: 100,
              Height: 100,
              ColorSpace: "DeviceRGB",
              BitsPerComponent: 8,
            })
          )
        )
        page.node.set(
          PDFName.of("PieceInfo"),
          context.obj({
            Illustrator: {
              Private: context.register(context.stream(noiseBytes(60_000))),
            },
          })
        )
      }
    )
    const found = audit(input).breakdown.parts
    expect(found.find((part) => part.kind === "private")!.bytes).toBe(60_000)
    expect(found.find((part) => part.kind === "thumbnails")!.bytes).toBe(30_000)
    const { bytes, report } = await compress(input, "lossless")
    expect(report.dropped).toEqual({ thumbnails: 1, private: 1 })
    expect(bytes!.length).toBeLessThan(input.length - 85_000)
    expect(await texts(bytes!)).toEqual([pictureText(1)])
    const kinds = report.audit!.breakdown.parts.map((part) => part.kind)
    expect(kinds).not.toContain("private")
    expect(kinds).not.toContain("thumbnails")
  }, 60_000)

  /** A page written with a font the file stores whole. */
  function wholeFontPdf(field = false) {
    const doc = new mupdf.PDFDocument()
    const font = doc.addSimpleFont(
      new mupdf.Font(
        "LiberationSans",
        readFileSync(
          "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"
        )
      )
    )
    const page = doc.addPage(
      [0, 0, 300, 400],
      0,
      doc.addObject({ Font: { F1: font } }),
      "BT /F1 24 Tf 40 300 Td (Whole font) Tj ET"
    )
    doc.insertPage(-1, page)
    if (field) {
      const form = doc.newDictionary()
      const fields = doc.newArray()
      fields.push(doc.addObject({ FT: doc.newName("Tx"), T: "(name)" }))
      form.put("Fields", fields)
      doc.getTrailer().get("Root").put("AcroForm", form)
    }
    const bytes = doc.saveToBuffer({ compress: "yes" }).asUint8Array().slice()
    doc.destroy()
    return bytes
  }

  it("cuts a font stored whole down to the letters in use", async () => {
    const input = wholeFontPdf()
    expect(audit(input).breakdown.parts[0].kind).toBe("fonts")
    const { bytes, report } = await compress(input, "lossless")
    expect(report.fontsCut).toBe(true)
    expect(bytes!.length).toBeLessThan(input.length / 5)
    expect(await texts(bytes!)).toEqual(["Whole font"])
    expect(report.check.low).toEqual([])
  }, 60_000)

  it("leaves fonts whole in a file with fields to type into", async () => {
    const input = wholeFontPdf(true)
    const { report } = await compress(input, "lossless")
    expect(report.fontsCut).toBe(false)
  }, 60_000)
})

describe("the job itself", () => {
  it("hands nothing back for a file that is already small", async () => {
    const input = await makePlainPdf([{ body: "Only words" }])
    const { bytes, report } = await compress(input, "strong")
    expect(bytes).toBeNull()
    expect(report).toMatchObject({
      smaller: false,
      before: input.length,
      after: input.length,
      audit: null,
    })
  })

  it("stops when it is told to, and reports how far it is", async () => {
    const input = await makePicturePdf(
      [
        { bytes: await jpegOf(scene(900, 700)), type: "jpeg", width: 200 },
        {
          bytes: await jpegOf(scene(900, 700, 2)),
          type: "jpeg",
          width: 200,
          page: 2,
        },
      ],
      2
    )
    const stages: string[] = []
    await compress(input, "balanced", {
      progress: (stage, done, total) =>
        stages.push(`${stage} ${done}/${total}`),
    })
    expect(stages).toEqual([
      "reading 0/2",
      "reading 1/2",
      "pictures 0/2",
      "pictures 1/2",
      "writing 0/1",
      "checking 0/2",
      "checking 1/2",
    ])
    let calls = 0
    await expect(
      compress(input, "balanced", {
        checkpoint: async () => {
          if (++calls === 4) throw new Error("Stopped.")
        },
      })
    ).rejects.toThrow("Stopped.")
  }, 60_000)

  it("leaves a picture too large for the device, and checks no more pages than it may", async () => {
    const pictures: Placed[] = []
    for (let page = 1; page <= 4; page++)
      pictures.push({
        bytes: await jpegOf(scene(900, 700, page)),
        type: "jpeg",
        width: 200,
        page,
      })
    const input = await makePicturePdf(pictures, 4)
    const few = await compress(input, "balanced", { checkBudget: 2 })
    expect(few.report.check).toMatchObject({ checked: 2, changed: 4 })
    const none = await compress(input, "balanced", { maxPixels: 1000 })
    expect(none.report.pictures.changed).toBe(0)
  }, 60_000)

  it("gives the same pictures when several are worked on at once", async () => {
    const pictures: Placed[] = [
      { bytes: await jpegOf(scene(1400, 1000)), type: "jpeg", width: 300 },
      { bytes: await pngOf(chart(900, 600)), type: "png", width: 250 },
      {
        bytes: await pngOf(scene(800, 600, 3)),
        type: "png",
        width: 200,
        page: 2,
      },
      {
        bytes: await jpegOf(greyScene(1200, 900, 1)),
        type: "jpeg",
        width: 220,
        page: 2,
      },
      {
        bytes: await jpegOf(scene(1000, 800, 5)),
        type: "jpeg",
        width: 240,
        page: 3,
      },
    ]
    const input = await makePicturePdf(pictures, 3)
    const one = await compress(input, "balanced")
    let inWork = 0
    let most = 0
    const counted =
      <A extends unknown[], R>(codec: (...args: A) => Promise<R>) =>
      async (...args: A) => {
        most = Math.max(most, ++inWork)
        try {
          return await codec(...args)
        } finally {
          inWork--
        }
      }
    const several = await compress(input, "balanced", {
      lanes: () => 3,
      codecs: {
        jpeg: counted(codecs.jpeg),
        resize: counted(codecs.resize),
        png: counted(codecs.png),
        deflate: counted(codecs.deflate),
      },
    })
    expect(most).toBeGreaterThan(1)
    expect(several.report.pictures).toEqual(one.report.pictures)
    expect(several.report.check).toEqual(one.report.check)
    // The objects may be written in another order; the pictures are the same.
    expect(Math.abs(several.bytes!.length - one.bytes!.length)).toBeLessThan(
      200
    )
    const alone = await readPictures(one.bytes!)
    const together = await readPictures(several.bytes!)
    expect(together).toHaveLength(alone.length)
    for (const [index, picture] of together.entries()) {
      expect(picture.width).toBe(alone[index].width)
      expect(samePixels(picture, alone[index])).toBe(true)
    }
    expect(await texts(several.bytes!)).toEqual(await texts(one.bytes!))
    // Stopping while several are in work stops them all, with the reason given.
    let calls = 0
    await expect(
      compress(input, "balanced", {
        lanes: () => 3,
        checkpoint: async () => {
          if (++calls === 6) throw new Error("Stopped.")
        },
      })
    ).rejects.toThrow("Stopped.")
  }, 120_000)

  it("writes once more, leaving the pictures of a page that came out looking different where nothing may change", async () => {
    const pictures: Placed[] = [1, 2].map((page) => ({
      bytes: new Uint8Array(),
      type: "png",
      width: 400,
      page,
    }))
    pictures[0].bytes = await pngOf(scene(600, 450, 1))
    pictures[1].bytes = await pngOf(scene(600, 450, 2))
    const input = await makePicturePdf(pictures, 2)
    // Stored again, both pictures are smaller, and the pages look the same.
    const plain = await compress(input, "lossless")
    expect(plain.report.pictures.changed).toBe(2)
    expect(plain.bytes).not.toBeNull()

    // Now the first page is made to look different from what it is compared
    // with: the "before" handed in has another picture there.
    const other = await makePicturePdf(
      [{ ...pictures[0], bytes: await pngOf(scene(600, 450, 9)) }, pictures[1]],
      2
    )
    const pristine = new mupdf.PDFDocument(other)
    const tries: (number | undefined)[] = []
    const { bytes, report } = await compress(input, "lossless", {
      pristine,
      progress: (stage, _done, _total, attempt) => {
        if (stage === "writing") tries.push(attempt)
      },
    })
    pristine.destroy()
    // The second go left the first page's picture as it was and stored
    // only the other again. The page still differs, so nothing is handed over.
    expect(tries).toEqual([undefined, 2])
    expect(report.pictures).toEqual({ found: 2, changed: 1, resized: 0 })
    expect(report.check.low.map((entry) => entry.page)).toEqual([0])
    expect(bytes).toBeNull()

    // With only a sample of the changed pages looked at, any of them may
    // differ, so every picture is left on the second go.
    const sample = new mupdf.PDFDocument(other)
    const sampled = await compress(input, "lossless", {
      pristine: sample,
      checkBudget: 1,
    })
    sample.destroy()
    expect(sampled.report.pictures.changed).toBe(0)
  }, 120_000)

  it("reads the before pictures from a file that is already open", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
    ])
    const pristine = new mupdf.PDFDocument(input)
    const { report } = await compress(input, "balanced", { pristine })
    expect(report.check.checked).toBe(1)
    // The caller's document is still theirs to use.
    expect(pristine.countPages()).toBe(1)
    pristine.destroy()
  }, 60_000)
})

describe("reaching a size", () => {
  const toSize = (bytes: Uint8Array, target: number, further = false) =>
    compressToSize(mupdf, bytes, { codecs, target, further })
  const album = async () =>
    makePicturePdf(
      [
        { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
        {
          bytes: await jpegOf(scene(1600, 1200, 2)),
          type: "jpeg",
          width: 400,
          page: 2,
        },
      ],
      2
    )

  it("comes out under the size, losing no more than that takes", async () => {
    const input = await album()
    const roomy = await toSize(input, 60_000)
    expect(roomy.report.target).toMatchObject({ wanted: 60_000, met: true })
    expect(roomy.bytes!.length).toBeLessThanOrEqual(60_000)
    expect(roomy.report.target!.writes).toBeLessThanOrEqual(
      mostWrites(stepCount(false))
    )
    expect(await texts(roomy.bytes!)).toEqual([pictureText(1), pictureText(2)])
    const tight = await toSize(input, 25_000)
    expect(tight.report.target!.met).toBe(true)
    expect(tight.bytes!.length).toBeLessThanOrEqual(25_000)
    // The roomier size keeps more of the pictures.
    const [large] = await readPictures(roomy.bytes!)
    const [small] = await readPictures(tight.bytes!)
    expect(large.width).toBeGreaterThan(small.width)
    // And uses most of the room it was given.
    expect(roomy.bytes!.length).toBeGreaterThan(45_000)
  }, 120_000)

  it("of a step and a level that both fit, keeps the one that looks more like the original", async () => {
    // A screenshot: flat shapes with hard edges on a background that
    // shades off, so it has too many colours for a palette. A step writes
    // it as a JPEG of one quality; a level holds a drawing to its strictest
    // mark and keeps it exact.
    const shot = chart(1600, 1200)
    for (let at = 0; at < shot.data.length; at += 4) {
      const x = (at / 4) % 1600
      const y = Math.floor(at / 4 / 1600)
      if (shot.data[at] + shot.data[at + 1] + shot.data[at + 2] > 720) {
        shot.data[at] = (255 - (x * 40) / 1600) | 0
        shot.data[at + 1] = (255 - (y * 40) / 1200) | 0
        shot.data[at + 2] = (255 - ((x + y) * 20) / 1400) | 0
      }
    }
    const input = await makePicturePdf([
      { bytes: await pngOf(shot), type: "png", width: 500 },
    ])
    const level = await compress(input, "balanced")
    // Room for the level's result, and too little for the file with nothing lost.
    const target = Math.round(level.report.after * 1.3)
    const sized = await toSize(input, target)
    expect(sized.report.target).toMatchObject({ wanted: target, met: true })
    expect(sized.report.target!.writes).toBeLessThanOrEqual(
      mostWrites(stepCount(false))
    )
    expect(sized.report.check.low).toEqual([])
    // Whichever of the two was kept, its page is no less like the original
    // than the level's, looked at closely.
    const drawn = (bytes: Uint8Array) => {
      const doc = new mupdf.PDFDocument(bytes)
      try {
        return drawPage(mupdf, doc, 0, 1800)
      } finally {
        doc.destroy()
      }
    }
    const original = drawn(input)
    expect(
      similarity(original, drawn(sized.bytes!)).mean
    ).toBeGreaterThanOrEqual(similarity(original, drawn(level.bytes!)).mean)
  }, 120_000)

  it("stops at what is easy to read, and says the size was missed", async () => {
    const input = await album()
    const readable = await toSize(input, 4000)
    expect(readable.report.target).toMatchObject({ met: false, writes: 2 })
    expect(readable.bytes!.length).toBeGreaterThan(4000)
    // 72 dpi over 5.56 inches.
    expect((await readPictures(readable.bytes!))[0].width).toBe(400)
    const further = await toSize(input, 4000, true)
    expect(further.bytes!.length).toBeLessThan(readable.bytes!.length)
    expect((await readPictures(further.bytes!))[0].width).toBe(200)
    expect(await texts(further.bytes!)).toEqual([
      pictureText(1),
      pictureText(2),
    ])
  }, 120_000)

  it("writes once when the file already fits", async () => {
    const input = await makePlainPdf([{ body: "Only words" }])
    const { bytes, report } = await toSize(input, 1_000_000)
    expect(bytes).toBeNull()
    expect(report.target).toEqual({ wanted: 1_000_000, met: true, writes: 1 })
  })

  it("squeezes its own earlier result further, and counts its attempts", async () => {
    const first = await compress(await album(), "balanced")
    const attempts = new Set<number>()
    const { bytes, report } = await compressToSize(mupdf, first.bytes!, {
      codecs,
      target: 20_000,
      further: false,
      progress: (_stage, _done, _total, attempt) => attempts.add(attempt!),
    })
    expect(report.target!.met).toBe(true)
    expect(bytes!.length).toBeLessThanOrEqual(20_000)
    expect([...attempts]).toEqual(
      Array.from({ length: report.target!.writes }, (_, index) => index + 1)
    )
  }, 120_000)
})

describe("settings of one's own", () => {
  const custom = (bytes: Uint8Array, change: Partial<typeof defaultCustom>) =>
    compressCustom(mupdf, bytes, {
      codecs,
      custom: { ...defaultCustom, ...change },
    })
  const album = async () =>
    makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
    ])

  it("saves pictures at the resolution and quality that are set", async () => {
    const input = await album()
    const fine = await custom(input, { dpi: 200, quality: 85 })
    const coarse = await custom(input, { dpi: 96, quality: 40 })
    // 400 points at 200 dpi, and at 96.
    expect((await readPictures(fine.bytes!))[0].width).toBe(1111)
    expect((await readPictures(coarse.bytes!))[0].width).toBe(533)
    expect(coarse.bytes!.length).toBeLessThan(fine.bytes!.length / 3)
    expect(await texts(coarse.bytes!)).toEqual([pictureText(1)])
  }, 60_000)

  it("takes the colour out of every picture when asked", async () => {
    const input = await makePicturePdf([
      { bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 400 },
      { bytes: await pngOf(chart(800, 600)), type: "png", width: 300 },
    ])
    const { bytes, report } = await custom(input, { grey: true })
    expect(report.pictures.changed).toBe(2)
    expect((await stored(bytes!)).map((picture) => picture.space)).toEqual([
      "/DeviceGray",
      "/DeviceGray",
    ])
    for (const picture of await readPictures(bytes!))
      expect(picture.data[0]).toBe(picture.data[2])
  }, 60_000)
})

describe("what is taken out on request", () => {
  const everything = async () =>
    makePdf("extras", {
      pages: 3,
      bookmarks: [{ title: "Start", page: 1 }],
      fields: [{ name: "who", value: "Ada", page: 2 }],
      notes: [{ page: 3, text: "Check this" }],
      links: [{ from: 1, to: 3 }],
      tagged: true,
      attachments: { "data.txt": "attached" },
      title: "Private title",
      author: "Someone",
    })
  const taking = (bytes: Uint8Array, removal: Partial<Removal>) =>
    compress(bytes, "lossless", {
      remove: { ...removalOf(defaultExtras), ...removal },
    })

  it("takes out one thing at a time and leaves the rest", async () => {
    const input = await everything()
    const before = await readPdf(input)
    expect(before.attachments).toEqual(["data.txt"])

    const bookmarks = await taking(input, { bookmarks: true })
    expect(bookmarks.report.taken).toEqual(["bookmarks"])
    let after = await readPdf(bookmarks.bytes!)
    expect(after.bookmarks).toEqual([])
    expect(after.attachments).toEqual(["data.txt"])
    expect(after.pages).toEqual(before.pages)
    expect(after.info.Title).toBe("Private title")

    after = await readPdf((await taking(input, { attachments: true })).bytes!)
    expect(after.attachments).toEqual([])
    expect(after.bookmarks).toEqual(before.bookmarks)

    after = await readPdf((await taking(input, { details: true })).bytes!)
    expect(after.info.Title).toBeUndefined()
    expect(after.info.Author).toBeUndefined()
    expect(after.bookmarks).toEqual(before.bookmarks)

    after = await readPdf((await taking(input, { comments: true })).bytes!)
    // The note is gone; the link and the field stay.
    expect(after.pages.map((page) => page.kinds)).toEqual([
      ["Link"],
      ["Widget"],
      [],
    ])
    expect(after.pages[0].links).toEqual(before.pages[0].links)

    const tags = (await taking(input, { tags: true })).bytes!
    const untagged = await PDFDocument.load(tags)
    expect(untagged.catalog.get(PDFName.of("MarkInfo"))).toBeUndefined()
    expect(await texts(tags)).toEqual(await texts(input))
  }, 60_000)

  it("flattens form fields: what was filled in stays, the fields go", async () => {
    const input = await everything()
    const { bytes, report } = await taking(input, { flatten: true })
    expect(report.taken).toEqual(["flatten"])
    const after = await readPdf(bytes!)
    expect(after.fields).toEqual([])
    expect(after.pages[1].kinds).toEqual([])
    expect(after.pages[1].text).toContain("Ada")
    // A lossless result with nothing else changed still looks the same.
    expect(report.check.low).toEqual([])
  }, 60_000)

  it("takes out scripts that run by themselves", async () => {
    const doc = await PDFDocument.load(await everything())
    const script = doc.context.obj({
      Type: "Action",
      S: "JavaScript",
      JS: PDFHexString.fromText("app.alert('hello')"),
    })
    doc.catalog.set(PDFName.of("OpenAction"), script)
    doc.catalog.set(PDFName.of("AA"), doc.context.obj({ WC: script }))
    const input = await doc.save({ useObjectStreams: false })
    const kept = await PDFDocument.load(
      (await compress(input, "lossless")).bytes ?? input
    )
    expect(kept.catalog.get(PDFName.of("OpenAction"))).toBeDefined()
    const { bytes } = await taking(input, { scripts: true })
    const after = await PDFDocument.load(bytes!)
    expect(after.catalog.get(PDFName.of("OpenAction"))).toBeUndefined()
    expect(after.catalog.get(PDFName.of("AA"))).toBeUndefined()
    expect(await texts(bytes!)).toEqual(await texts(input))
  }, 60_000)

  it("is asked to take out scripts from a file that has none, and writes it all the same", async () => {
    // Nothing happens when this file is opened: it names no action at all.
    const input = await everything()
    const { bytes } = await taking(input, { scripts: true })
    expect(await texts(bytes ?? input)).toEqual(await texts(input))
  }, 60_000)

  it("takes out the details also when attached files go with them", async () => {
    const input = await everything()
    expect((await readPdf(input)).info.Title).toBeDefined()
    const { bytes } = await taking(input, { attachments: true, details: true })
    const after = await readPdf(bytes!)
    expect(after.attachments).toEqual([])
    expect(after.info.Title).toBeUndefined()
    expect(after.info.Author).toBeUndefined()
  }, 60_000)
})

describe("a password on the result", () => {
  const lock = (change: Partial<typeof defaultExtras> = {}) =>
    lockOf(
      { ...defaultExtras, protect: true, password: "new one", ...change },
      () => "nobody keeps this"
    )!

  it("locks a file, even one that cannot be made smaller", async () => {
    const input = await makePlainPdf([{ body: "Only words" }])
    const { bytes, report } = await compress(input, "lossless", {
      lock: lock(),
    })
    expect(report.locked).toBe(true)
    expect(bytes).not.toBeNull()
    await expect(texts(bytes!)).rejects.toThrow()
    expect(await texts(bytes!, "new one")).toEqual(["Only words"])
  }, 60_000)

  it("limits what a reader may do", async () => {
    const input = await makePlainPdf([{ body: "Only words" }])
    const { bytes } = await compress(input, "lossless", {
      lock: lock({ allowPrint: false, allowCopy: false }),
    })
    const read = await readPdf(bytes!, "new one")
    expect(read.encrypted).toBe(true)
    // pdf.js names the things a reader may do; printing and copying are not among them.
    expect(read.permissions).not.toContain(4)
    expect(read.permissions).not.toContain(16)
  }, 60_000)

  it("replaces the password a file already has", async () => {
    const input = await makePicturePdf(
      [{ bytes: await jpegOf(scene(1600, 1200)), type: "jpeg", width: 300 }],
      1,
      "old one"
    )
    const { bytes } = await compress(input, "balanced", {
      password: "old one",
      lock: lock(),
    })
    await expect(texts(bytes!, "old one")).rejects.toThrow()
    expect(await texts(bytes!, "new one")).toEqual([pictureText(1)])
    expect(bytes!.length).toBeLessThan(input.length / 2)
  }, 60_000)
})

describe("many files of many kinds", () => {
  it("never grows a file, loses a page, a word or a picture", async () => {
    let state = 20261011
    const random = (below: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % below
    }
    for (let round = 0; round < 6; round++) {
      const pages = 1 + random(3)
      const pictures: Placed[] = []
      for (let index = 0; index < 1 + random(3); index++) {
        const width = 300 + random(900)
        const height = 200 + random(600)
        const kind = random(3)
        const pixels =
          kind === 0
            ? scene(width, height, round + index)
            : kind === 1
              ? chart(width, height)
              : greyScene(width, height, index)
        const jpeg = random(2) === 0
        pictures.push({
          bytes: jpeg
            ? await jpegOf(pixels, 70 + random(28))
            : await pngOf(pixels),
          type: jpeg ? "jpeg" : "png",
          width: 80 + random(300),
          page: 1 + random(pages),
        })
      }
      const input = await makePicturePdf(pictures, pages)
      const level = LEVELS[random(3)]
      const { bytes, report } = await compress(input, level)
      const output = bytes ?? input
      expect(output.length).toBeLessThanOrEqual(input.length)
      expect(report.pictures.found).toBe(pictures.length)
      expect(report.check.low).toEqual([])
      expect(await texts(output)).toEqual(
        Array.from({ length: pages }, (_, page) => pictureText(page + 1))
      )
      const before = await readPictures(input)
      const after = await readPictures(output)
      expect(after).toHaveLength(before.length)
      for (const [index, picture] of after.entries()) {
        expect(picture.page).toBe(before[index].page)
        expect(picture.width).toBeLessThanOrEqual(before[index].width)
        // Same shape, to within a pixel of rounding.
        expect(
          Math.abs(
            picture.width * before[index].height -
              picture.height * before[index].width
          )
        ).toBeLessThanOrEqual(
          Math.max(before[index].width, before[index].height)
        )
        if (picture.width === before[index].width)
          expect(similarity(before[index], picture).mean).toBeGreaterThan(0.9)
      }
    }
  }, 240_000)
})
