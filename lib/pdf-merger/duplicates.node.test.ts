// @vitest-environment node
/**
 * Storing identical parts once, with the real engine. Files are written by
 * pdf-lib and results read back by pdf.js and pdf-lib.
 */
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { installNodeCodecShims } from "@/tests/node-codecs"
import {
  jpegOf,
  makePicturePdf,
  pictureText,
  pngOf,
  readPictures,
  samePixels,
  scene,
  type Placed,
} from "@/tests/pdf-pictures"
import { readPdf, storedPictures, texts } from "@/tests/pdf-reader"
import { shareDuplicates } from "./mupdf-engine"

installNodeCodecShims()

/** Share what is the same, and write the file the way the tools do. */
function share(bytes: Uint8Array) {
  const doc = new mupdf.PDFDocument(bytes)
  try {
    const copies = shareDuplicates(doc)
    const buffer = doc.saveToBuffer({
      garbage: 2,
      compress: "yes",
      objstms: "yes",
    })
    return { copies, out: buffer.asUint8Array().slice() }
  } finally {
    doc.destroy()
  }
}

/** A picture that is partly see-through, so it is stored with a mask it points at. */
async function seeThrough(seed = 1) {
  const pixels = scene(300, 200, seed)
  for (let at = 3; at < pixels.data.length; at += 4)
    pixels.data[at] = (at / 4) % 300 < 150 ? 255 : 90
  return pngOf(pixels)
}

describe("shareDuplicates", () => {
  it("stores a picture that is in the file three times once, mask and all, with every pixel", async () => {
    const bytes = await seeThrough()
    const pictures: Placed[] = [1, 2, 3].map((page) => ({
      bytes,
      type: "png",
      width: 200,
      page,
    }))
    const input = await makePicturePdf(pictures, 3)
    // Three pictures, each with its mask.
    expect(await storedPictures(input)).toBe(6)
    const { copies, out } = share(input)
    // The masks are found first; the pictures are only the same once they
    // point at the same mask.
    expect(copies.size).toBe(4)
    expect(await storedPictures(out)).toBe(2)
    expect(out.length).toBeLessThan(input.length * 0.5)
    const before = await readPictures(input)
    const after = await readPictures(out)
    expect(after).toHaveLength(3)
    for (const [index, picture] of after.entries()) {
      expect(picture.page).toBe(index + 1)
      expect(picture.width).toBe(300)
      // The see-through half is still see-through: the mask kept its data.
      expect(samePixels(picture, before[index])).toBe(true)
    }
    expect(await texts(out)).toEqual([1, 2, 3].map(pictureText))
  }, 60_000)

  it("keeps every picture's data, and shares a mask two different pictures have in common", async () => {
    // A stream that points at another object once lost its data here: the
    // engine held on to it after being asked for the whole object.
    const input = await makePicturePdf(
      [
        { bytes: await seeThrough(1), type: "png", width: 200 },
        { bytes: await seeThrough(2), type: "png", width: 200, page: 2 },
        {
          bytes: await jpegOf(scene(300, 200, 3)),
          type: "jpeg",
          width: 200,
          page: 2,
        },
      ],
      2
    )
    const { copies, out } = share(input)
    // The two pictures differ; their masks are the same.
    expect(copies.size).toBe(1)
    expect(await storedPictures(input)).toBe(5)
    expect(await storedPictures(out)).toBe(4)
    const before = await readPictures(input)
    const after = await readPictures(out)
    expect(after).toHaveLength(3)
    for (const [index, picture] of after.entries())
      expect(samePixels(picture, before[index])).toBe(true)
  }, 60_000)

  it("tells pictures apart that are the same size and differ in one byte", async () => {
    const pixels = scene(200, 100)
    const first = await pngOf(pixels)
    pixels.data[0] ^= 1
    const second = await pngOf(pixels)
    const input = await makePicturePdf([
      { bytes: first, type: "png", width: 150 },
      { bytes: second, type: "png", width: 150 },
    ])
    const { copies, out } = share(input)
    expect(copies.size).toBe(0)
    const [one, two] = await readPictures(out)
    expect(one.data[0]).not.toBe(two.data[0])
  }, 60_000)

  it("leaves pages and notes apart, however alike they read", async () => {
    const doc = await PDFDocument.create()
    for (let index = 0; index < 3; index++) {
      const page = doc.addPage([300, 300])
      page.drawText("The same on every page", { x: 20, y: 250, size: 12 })
      // Two notes on each page that read exactly the same.
      const notes = [0, 1].map(() =>
        doc.context.register(
          doc.context.obj({
            Type: "Annot",
            Subtype: "Text",
            Rect: [20, 20, 40, 40],
            Contents: PDFString.of("A note"),
          })
        )
      )
      page.node.set(PDFName.of("Annots"), doc.context.obj(notes))
    }
    const input = await doc.save({ useObjectStreams: false })
    const { copies, out } = share(input)
    const read = await readPdf(out)
    expect(read.pages).toHaveLength(3)
    expect(read.pages.map((page) => page.text)).toEqual(
      Array(3).fill("The same on every page")
    )
    const after = await PDFDocument.load(out)
    const notes = after.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          "get" in object &&
          String(
            (object as { get(key: unknown): unknown }).get(PDFName.of("Type"))
          ) === "/Annot"
      )
    expect(notes).toHaveLength(6)
    // What the pages draw is the same three times, and that is shared.
    expect(copies.size).toBeGreaterThanOrEqual(2)
    expect(out.length).toBeLessThan(input.length)
  }, 60_000)
})
