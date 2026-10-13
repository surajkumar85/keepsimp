/**
 * Pictures for PDF tests, and a way to read them back out of a file with
 * pdf.js, which shares no code with the engine that compresses them.
 */
import {
  PDFDocument,
  PDFName,
  StandardFonts,
  type PDFPage,
  type PDFRef,
} from "@cantoo/pdf-lib"
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs"
import { encodeImage } from "@/lib/image-compressor/codecs"
import type { Pixels } from "@/lib/image-compressor/ssim"

/** A picture like a photograph: soft shapes with grain all over. */
export function scene(width: number, height: number, seed = 1): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  let state = seed * 2654435761
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      state = (Math.imul(state, 1103515245) + 12345) | 0
      const grain = ((state >>> 16) % 8) - 4
      const at = (y * width + x) * 4
      data[at] = 128 + 90 * Math.sin(x / 37 + seed) + grain
      data[at + 1] = 128 + 90 * Math.sin(y / 29 + x / 113) + grain
      data[at + 2] = 128 + 90 * Math.cos((x + y) / 53) + grain
      data[at + 3] = 255
    }
  return { data, width, height }
}

/** A picture like a chart: flat blocks of a few colours with hard edges. */
export function chart(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  const colours = [
    [255, 255, 255],
    [20, 110, 120],
    [230, 90, 40],
    [40, 40, 40],
  ]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const band = Math.floor((x * 8) / width)
      const tall = height * (0.2 + 0.1 * band)
      const colour = y > height - tall ? colours[1 + (band % 3)] : colours[0]
      data.set([...colour, 255], (y * width + x) * 4)
    }
  return { data, width, height }
}

/** A picture in shades of grey only. */
export function greyScene(width: number, height: number, seed = 1): Pixels {
  const pixels = scene(width, height, seed)
  for (let at = 0; at < pixels.data.length; at += 4)
    pixels.data[at + 1] = pixels.data[at + 2] = pixels.data[at]
  return pixels
}

const settings = (quality: number) => ({
  quality,
  lossless: true,
  effort: "fast" as const,
  chroma444: false,
  progressive: false,
  colors: 256,
  dithering: false,
})

export const jpegOf = async (pixels: Pixels, quality = 92) =>
  new Uint8Array(await encodeImage("jpeg", pixels, settings(quality)))

export const pngOf = async (pixels: Pixels) =>
  new Uint8Array(await encodeImage("png", pixels, settings(100)))

export interface Placed {
  bytes: Uint8Array
  type: "jpeg" | "png"
  /** How wide it is drawn, in points; its height follows its shape. */
  width: number
  /** Page number from 1; the first page when left out. */
  page?: number
  /** Draw it a second time, this wide. */
  again?: number
}

/** The text every page of a picture file carries. */
export const pictureText = (page: number) => `pictures-P${page}`

/** A4 pages that each say `pictureText`, with the pictures drawn where asked. */
export async function makePicturePdf(
  pictures: readonly Placed[],
  pages = 1,
  password?: string
) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const sheets = Array.from({ length: pages }, (_, index) => {
    const page = doc.addPage([595, 842])
    page.drawText(pictureText(index + 1), { x: 40, y: 800, size: 14, font })
    return { page, top: 780 }
  })
  for (const picture of pictures) {
    const image =
      picture.type === "jpeg"
        ? await doc.embedJpg(picture.bytes)
        : await doc.embedPng(picture.bytes)
    const sheet = sheets[(picture.page ?? 1) - 1]
    const height = (picture.width * image.height) / image.width
    sheet.top -= height + 10
    sheet.page.drawImage(image, {
      x: 40,
      y: sheet.top,
      width: picture.width,
      height,
    })
    if (picture.again)
      sheet.page.drawImage(image, {
        x: 300,
        y: 20,
        width: picture.again,
        height: (picture.again * image.height) / image.width,
      })
  }
  if (password)
    doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner` })
  return doc.save({ useObjectStreams: false })
}

/** A picture stored in a file by hand, and how large it is drawn in points. */
export interface Drawn {
  ref: PDFRef
  width: number
  height: number
}

/**
 * One A4 page that says `pictureText(1)` and draws pictures built straight
 * from PDF objects, for the kinds of picture pdf-lib does not make itself.
 * @param after A last word on the document and its page.
 */
export async function makeDrawnPdf(
  build: (doc: PDFDocument) => Drawn[],
  after?: (doc: PDFDocument, page: PDFPage) => void
) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText(pictureText(1), { x: 40, y: 800, size: 14, font })
  const names: Record<string, PDFRef> = {}
  let content = ""
  let top = 780
  for (const [index, picture] of build(doc).entries()) {
    top -= picture.height + 10
    names[`P${index}`] = picture.ref
    content += `q ${picture.width} 0 0 ${picture.height} 40 ${top} cm /P${index} Do Q\n`
  }
  page.node.Resources()!.set(PDFName.of("XObject"), doc.context.obj(names))
  page.node.addContentStream(doc.context.register(doc.context.stream(content)))
  after?.(doc, page)
  return doc.save({ useObjectStreams: false })
}

/** What every picture's description starts with. */
export const pictureDict = (width: number, height: number, bits = 8) => ({
  Type: "XObject",
  Subtype: "Image",
  Width: width,
  Height: height,
  BitsPerComponent: bits,
})

/**
 * A colour picture stored in a document without loss, as a design app or a
 * scanner's software would leave it. No picture codec is needed to make it.
 */
export function storeRgb(doc: PDFDocument, pixels: Pixels) {
  const rgb = new Uint8Array(pixels.width * pixels.height * 3)
  for (let index = 0; index < pixels.width * pixels.height; index++)
    rgb.set(pixels.data.subarray(index * 4, index * 4 + 3), index * 3)
  return doc.context.register(
    doc.context.flateStream(rgb, {
      ...pictureDict(pixels.width, pixels.height),
      ColorSpace: "DeviceRGB",
    })
  )
}

/** Bytes that do not compress, the same for the same seed. */
export function noiseBytes(length: number, seed = 7) {
  const out = new Uint8Array(length)
  let state = seed
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    out[index] = state >>> 24
  }
  return out
}

/**
 * A page as a scanner hands it over: cream paper that gets darker towards
 * one side, grain all over, lines of dark print with soft rims, and a red
 * stamp. The same for the same seed.
 */
export function scannedPage(width: number, height: number, seed = 1): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  let state = seed * 7919
  const paper = [244, 238, 222]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      state = (Math.imul(state, 1103515245) + 12345) | 0
      const grain = ((state >>> 16) % 13) - 6
      const shade = 1 - 0.1 * (x / width)
      // Print keeps clear of the margins, in lines with gaps between words.
      const inside =
        x > width * 0.1 &&
        x < width * 0.9 &&
        y > height * 0.08 &&
        y < height * 0.92
      const column = (x + seed * 5) % 13
      const line = y % 36
      const word = Math.floor(x / 91) % 5 !== 4
      const mark = inside && word && line < 18 && column < 4
      const rim = inside && word && line < 19 && column < 5 && !mark ? 0.55 : 1
      const ring = Math.hypot(x - width * 0.72, y - height * 0.24)
      const stamp = ring > width * 0.07 && ring < width * 0.08
      const at = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        const ink = stamp ? [196, 36, 48][channel] : 36
        const value = mark || stamp ? ink : paper[channel] * shade * rim
        data[at + channel] = value + grain
      }
      data[at + 3] = 255
    }
  return { data, width, height }
}

/** The words hidden over each scanned page, as a text recogniser would leave them. */
export const scanText = (page: number) => `scan-P${page}`

/**
 * A4 pages that are each one picture from edge to edge, with words over
 * them that cannot be seen.
 */
export async function makeScanPdf(pictures: readonly Uint8Array[]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const [index, bytes] of pictures.entries()) {
    const page = doc.addPage([595, 842])
    const image = await doc.embedJpg(bytes)
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
    page.drawText(scanText(index + 1), {
      x: 60,
      y: 760,
      size: 14,
      font,
      opacity: 0,
    })
  }
  return doc.save({ useObjectStreams: false })
}

/**
 * True when two pictures have the very same pixels. A test should use this
 * and not `toEqual`, which takes gigabytes to compare two large pictures.
 */
export const samePixels = (a: Pixels, b: Pixels) =>
  a.width === b.width &&
  a.height === b.height &&
  Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength).equals(
    Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)
  )

export interface ReadPicture extends Pixels {
  /** Page number from 1. */
  page: number
}

type PdfImage = {
  width: number
  height: number
  kind: number
  data: Uint8Array | Uint8ClampedArray
}

/** pdf.js's three ways of handing pixels over, as RGBA. */
function toRgba(image: PdfImage) {
  const { width, height, data, kind } = image
  const out = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index++) {
    const to = index * 4
    if (kind === 3) out.set(data.subarray(to, to + 4), to)
    else if (kind === 2) {
      out.set(data.subarray(index * 3, index * 3 + 3), to)
      out[to + 3] = 255
    } else {
      // One bit a pixel, rows padded to whole bytes.
      const row = Math.floor(index / width)
      const column = index % width
      const byte = data[row * Math.ceil(width / 8) + (column >> 3)]
      const value = (byte >> (7 - (column & 7))) & 1 ? 255 : 0
      out[to] = out[to + 1] = out[to + 2] = value
      out[to + 3] = 255
    }
  }
  return out
}

/** Every picture the pages of a file paint, in order, as pdf.js decodes them. */
export async function readPictures(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    // Black-and-white packings are decoded by a module pdf.js loads from here.
    wasmUrl: "node_modules/pdfjs-dist/wasm/",
  }).promise
  try {
    const pictures: ReadPicture[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const operators = await page.getOperatorList()
      for (const [index, operator] of operators.fnArray.entries()) {
        if (operator !== OPS.paintImageXObject) continue
        const name = operators.argsArray[index][0] as string
        const store = name.startsWith("g_") ? page.commonObjs : page.objs
        const image = await new Promise<PdfImage>((resolve) =>
          store.get(name, resolve)
        )
        pictures.push({
          page: number,
          width: image.width,
          height: image.height,
          data: toRgba(image),
        })
      }
    }
    return pictures
  } finally {
    await doc.loadingTask.destroy()
  }
}

/** A picture as a page paints it, read with pdf.js. */
export interface Painted {
  /** Where it is, in points from the page's top left corner as the page is shown. */
  x: number
  y: number
  width: number
  height: number
  /** How many dots it has. */
  dots: { width: number; height: number }
  /** A clip was set for it alone, so that only a part of it shows. */
  clipped: boolean
}

type Six = [number, number, number, number, number, number]
/** One measure after another: a point goes through the first, then the second. */
const after = (one: Six, two: Six): Six => [
  one[0] * two[0] + one[1] * two[2],
  one[0] * two[1] + one[1] * two[3],
  one[2] * two[0] + one[3] * two[2],
  one[2] * two[1] + one[3] * two[3],
  one[4] * two[0] + one[5] * two[2] + two[4],
  one[4] * two[1] + one[5] * two[3] + two[5],
]

/**
 * Where every page of a file paints its pictures, in the order it paints
 * them, as pdf.js follows the page's content.
 */
export async function paintedPictures(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    wasmUrl: "node_modules/pdfjs-dist/wasm/",
  }).promise
  try {
    const pages: Painted[][] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const shown = page.getViewport({ scale: 1 }).transform as Six
      const operators = await page.getOperatorList()
      const painted: Painted[] = []
      let state = { ctm: [1, 0, 0, 1, 0, 0] as Six, clipped: false }
      const saved: (typeof state)[] = []
      for (const [index, operator] of operators.fnArray.entries()) {
        const args = operators.argsArray[index] as unknown[]
        if (operator === OPS.save) saved.push({ ...state })
        else if (operator === OPS.restore) state = saved.pop() ?? state
        else if (operator === OPS.transform)
          state = { ...state, ctm: after(args as unknown as Six, state.ctm) }
        else if (operator === OPS.clip || operator === OPS.eoClip)
          state = { ...state, clipped: true }
        else if (operator === OPS.paintImageXObject) {
          const through = after(state.ctm, shown)
          const corners = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([x, y]) => [
            through[0] * x + through[2] * y + through[4],
            through[1] * x + through[3] * y + through[5],
          ])
          const xs = corners.map((corner) => corner[0])
          const ys = corners.map((corner) => corner[1])
          painted.push({
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            dots: { width: args[1] as number, height: args[2] as number },
            clipped: state.clipped,
          })
        }
      }
      pages.push(painted)
    }
    return pages
  } finally {
    await doc.loadingTask.destroy()
  }
}
