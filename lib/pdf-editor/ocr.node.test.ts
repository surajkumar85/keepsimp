// @vitest-environment node
/**
 * Reading scanned pages with the real engine and the real Tesseract, as
 * the editor does; what is laid on the page is read back by pdf.js.
 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { createWorker, OEM, type Worker } from "tesseract.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { danglingRefs, textPlaces, texts } from "@/tests/pdf-reader"
import { SCAN_LINES, SCAN_SIZE, scannedPdf } from "@/tests/pdf-scan"
import { readDraft } from "./draft"
import { OCR_PARAMETERS } from "./ocr-files"
import {
  exportEdited,
  historyOf,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyOcr, ocrPicture } from "./mupdf-ocr"
import { readingOf, spaced, type OcrOp, type TesseractBlock } from "./ocr"

let tesseract: Worker

beforeAll(async () => {
  tesseract = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: join(
      process.cwd(),
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int"
    ),
    cacheMethod: "none",
  })
  await tesseract.setParameters(OCR_PARAMETERS as never)
}, 60_000)

afterAll(async () => {
  await tesseract?.terminate()
})

/** Read a page of a session as the editor does: drawn in the engine, read by Tesseract. */
async function readPage(session: EditSession, page: number) {
  const picture = ocrPicture(mupdf, session, page)
  const { data } = await tesseract.recognize(
    Buffer.from(picture.png),
    {},
    { blocks: true, text: false }
  )
  return {
    picture,
    reading: readingOf(
      data.blocks as unknown as TesseractBlock[],
      picture.scale
    ),
  }
}

const words = (text: string) => text.split(/\s+/).filter(Boolean)

describe("reading a scanned page", () => {
  it("lays the words read where they are seen, and leaves the page as it looks", async () => {
    const bytes = await scannedPdf()
    const session = startEditing(mupdf, bytes)
    const { picture, reading } = await readPage(session, 0)
    // A scan has no text of its own, and is drawn at 300 dots to the inch.
    expect(picture.letters).toBe(0)
    expect(picture.scale).toBeCloseTo(72 / 300)
    expect(reading.words).toBe(
      SCAN_LINES.reduce((sum, line) => sum + words(line.text).length, 0)
    )
    expect(reading.confidence).toBeGreaterThan(85)
    const touched = applyOcr(mupdf, session, {
      label: "Recognise text",
      ops: [{ page: 0, lines: reading.lines }],
    })
    expect(touched).toEqual([0])
    expect(historyOf(session).steps).toEqual(["Recognise text"])
    // The page now has text, and is not read again as a scan.
    expect(ocrPicture(mupdf, session, 0).letters).toBeGreaterThan(100)

    const { bytes: written, report } = await exportEdited(mupdf, session)
    expect(await danglingRefs(written)).toEqual([])
    expect(report.untouched.differ).toEqual([])
    // Every word laid was read back from the written file.
    expect(report.ocr).toEqual({
      pages: 1,
      words: reading.words,
      checked: reading.words,
      found: reading.words,
    })
    const [text] = await texts(written)
    for (const line of SCAN_LINES) expect(text).toContain(line.text)
    // pdf.js finds each line where it was set: the start of its first word,
    // on the line its letters stand on (the bottom of the line is lower by
    // the part of letters that reach down).
    const [places] = await textPlaces(written)
    for (const line of SCAN_LINES) {
      const first = places.find((run) =>
        run.text.startsWith(words(line.text)[0])
      )!
      expect(Math.abs(first.x - line.x)).toBeLessThan(2)
      expect(first.y - line.y).toBeGreaterThanOrEqual(-1)
      expect(first.y - line.y).toBeLessThan(line.size * 0.4)
      expect(first.angle).toBeCloseTo(0, 0)
    }
    // Nothing is drawn: the page looks as it did, pixel for pixel.
    const look = (data: Uint8Array) => {
      const doc = mupdf.Document.openDocument(data, "application/pdf")
      try {
        return doc
          .loadPage(0)
          .toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false)
          .getPixels()
          .join()
      } finally {
        doc.destroy()
      }
    }
    expect(look(written)).toBe(look(bytes))

    // Undone, the words are gone; made again, they are back.
    stepBack(session)
    expect(ocrPicture(mupdf, session, 0).letters).toBe(0)
    stepForward(session)
    const again = await exportEdited(mupdf, session)
    expect((await texts(again.bytes))[0]).toContain(SCAN_LINES[2].text)
    expect(await danglingRefs(again.bytes)).toEqual([])

    // Kept with a draft and taken up, the step lays the same words.
    const kept = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "scan.pdf",
          size: bytes.length,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect((kept.steps[0].done.change as { ops: OcrOp[] }).ops).toEqual([
      { page: 0, lines: reading.lines },
    ])
    const taken = startEditing(mupdf, bytes)
    takeUp(taken, kept.steps, kept.position)
    const fromDraft = await exportEdited(mupdf, taken)
    expect((await texts(fromDraft.bytes))[0]).toContain(SCAN_LINES[3].text)
    stopEditing(taken)
    stopEditing(session)
  }, 60_000)

  it("reads a turned page the right way up, and lays its words to be read the way they are seen", async () => {
    const bytes = await scannedPdf({ turned: true })
    const session = startEditing(mupdf, bytes)
    const { reading } = await readPage(session, 1)
    expect(reading.confidence).toBeGreaterThan(85)
    applyOcr(mupdf, session, {
      label: "Recognise text",
      ops: [{ page: 1, lines: reading.lines }],
    })
    const { bytes: written } = await exportEdited(mupdf, session)
    expect(await danglingRefs(written)).toEqual([])
    const [upright, turned] = await texts(written)
    expect(upright).toBe("")
    for (const line of SCAN_LINES) expect(turned).toContain(line.text)
    // As the page is shown, the words run across from the left, where they are seen.
    const places = (await textPlaces(written))[1]
    const first = places.find((run) => run.text.startsWith("KeepSimp"))!
    expect(first.angle).toBeCloseTo(0, 0)
    expect(Math.abs(first.x - SCAN_LINES[0].x)).toBeLessThan(2)
    expect(Math.abs(first.y - SCAN_LINES[0].y)).toBeLessThan(
      SCAN_LINES[0].size * 0.4
    )
    expect(SCAN_SIZE.width).toBeLessThan(SCAN_SIZE.height)
    stopEditing(session)
  }, 60_000)
})

describe("laying words", () => {
  it("refuses words that are not words, and pages that are not there, and changes nothing for none", async () => {
    const session = startEditing(mupdf, await scannedPdf())
    const line = {
      x: 10,
      y: 20,
      size: 10,
      slope: 0,
      words: [{ text: "a b", x: 10, width: 5 }],
    }
    expect(() =>
      applyOcr(mupdf, session, {
        label: "Recognise text",
        ops: [{ page: 0, lines: [line] }],
      })
    ).toThrow("cannot be laid")
    const fine = { ...line, words: [{ text: "ab", x: 10, width: 5 }] }
    expect(() =>
      applyOcr(mupdf, session, {
        label: "Recognise text",
        ops: [{ page: 3, lines: [fine] }],
      })
    ).toThrow("not in the file")
    expect(
      applyOcr(mupdf, session, {
        label: "Recognise text",
        ops: [{ page: 0, lines: [] }],
      })
    ).toEqual([])
    expect(historyOf(session).steps).toEqual([])
    stopEditing(session)
  })
})

describe("other languages and scripts", () => {
  /** A scan of words drawn in a script: a picture from `tests/fixtures/ocr/`, alone on a page. */
  async function scanOf(code: string) {
    const png = await readFile(join("tests/fixtures/ocr", `${code}.png`))
    const doc = await PDFDocument.create()
    const picture = await doc.embedPng(png)
    const width = picture.width * 0.36
    const height = picture.height * 0.36
    doc
      .addPage([width, height])
      .drawImage(picture, { x: 0, y: 0, width, height })
    return doc.save()
  }

  /** Words together as a script writes them: with spaces, or without for those written together. */
  const together = (words: string[]) =>
    words.reduce(
      (all, word, at) =>
        at && spaced(words[at - 1], word) ? `${all} ${word}` : all + word,
      ""
    )

  it.each([
    ["deu", "Grüße"],
    ["rus", "документ"],
    ["ara", "الكرامة"],
    ["heb", "החשבונית"],
    ["chi_sim", "今天"],
    ["jpn", "今日"],
    ["hin", "भुगतान"],
    ["tha", "เอกสาร"],
  ])(
    "lays words read in %s so that other software reads them as they were read",
    async (code, word) => {
      const reader = await createWorker(code, OEM.LSTM_ONLY, {
        langPath: join(
          process.cwd(),
          `node_modules/@tesseract.js-data/${code}/4.0.0_best_int`
        ),
        cacheMethod: "none",
      })
      await reader.setParameters(OCR_PARAMETERS as never)
      const session = startEditing(mupdf, await scanOf(code))
      try {
        const picture = ocrPicture(mupdf, session, 0)
        const { data } = await reader.recognize(
          Buffer.from(picture.png),
          {},
          { blocks: true, text: false }
        )
        const reading = readingOf(
          data.blocks as unknown as TesseractBlock[],
          picture.scale
        )
        expect(reading.confidence).toBeGreaterThan(75)
        applyOcr(mupdf, session, {
          label: "Recognise text",
          ops: [{ page: 0, lines: reading.lines }],
        })
        const { bytes } = await exportEdited(mupdf, session)
        expect(await danglingRefs(bytes)).toEqual([])
        const [text] = await texts(bytes)
        const bare = (value: string) => value.replace(/\s+/g, "")
        expect(bare(text)).toContain(word)
        // pdf.js reads each line's letters as Tesseract read them. Where it
        // sees room between words written together it puts a space, and it
        // keeps the order of a right-to-left line's words as they stand.
        for (const line of reading.lines) {
          // Kept as they stand from the left; a right-to-left line reads from its right end.
          const standing = line.words.map((one) => one.text)
          const words = code === "heb" ? standing.reverse() : standing
          if (code === "ara")
            for (const one of words) expect(text).toContain(one)
          else expect(bare(text)).toContain(bare(together(words)))
          if (["deu", "rus", "hin", "heb"].includes(code))
            expect(text).toContain(together(words))
        }
      } finally {
        stopEditing(session)
        await reader.terminate()
      }
    },
    60_000
  )
})
