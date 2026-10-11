// @vitest-environment node
/**
 * Compressing with the real engine. Files are written by pdf-lib with
 * pictures from mozjpeg and oxipng; results are read back by pdf.js and
 * pdf-lib, so the engine is never only checked against itself.
 */
import { readFileSync } from "node:fs"
import {
  PDFDocument,
  PDFHexString,
  PDFName,
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
  noiseBytes,
  pictureDict,
  pictureText,
  pngOf,
  readPictures,
  scene,
  type Placed,
} from "@/tests/pdf-pictures"
import { readPdf, texts } from "@/tests/pdf-reader"
import { codecs } from "./codecs"
import { auditPdf } from "./mupdf-audit"
import {
  compressPdf,
  compressToSize,
  type CompressOptions,
} from "./mupdf-compress"
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

  it("leaves pictures it is not sure of exactly as they are", async () => {
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
    expect(report.pictures).toEqual({ found: 3, changed: 0, resized: 0 })
    // The file itself is packed tighter; the pictures are untouched.
    expect(bytes).not.toBeNull()
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
    expect(roomy.bytes!.length).toBeGreaterThan(30_000)
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
