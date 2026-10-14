/**
 * Reading a scanned page's words (OCR) in the engine: a page drawn for
 * Tesseract to read, and what it read laid on the page unseen, as one step.
 * The judging of what Tesseract gives is done in `ocr.ts`.
 */
import type * as MuPDF from "mupdf"
import { canDo, inStep, withPage, type EditSession } from "./mupdf-edit"
import { layerOf, ocrZoom, readOcrOp, wordsIn, type OcrChange } from "./ocr"
import { inverse, type Matrix } from "./retext"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/**
 * A TrueType font of one empty letter, which every letter of the words is
 * written with: it draws nothing, and holds no shapes of any script, so it
 * serves every language. From Tesseract (`src/api/pdf_ttf.h`, Apache
 * License 2.0), which writes the words of its own PDFs with it.
 */
const GLYPHLESS =
  "AAEAAAAKAIAAAwAgT1MvMlbeyJQAAAEoAAAAYGNtYXAACgA0AAABkAAAAB5nbHlmFSJBJAAAAbgAAAAYaGVhZAt48WUAAACsAAAANmhoZWEMAgQCAAAA5AAAACRobXR4BAAAAAAAAYgAAAAIbG9jYQAMAAAAAAGwAAAABm1heHAABAAFAAABCAAAACBuYW1l8usW2gAAAdAAAABLcG9zdAABAAEAAAIcAAAAIAABAAAAAQAAsJRxEF8PPPUEBwgAAAAAAM+a/G4AAAAA1MOn8gAAAAAEAAgAAAAAEAACAAAAAAAAAAEAAAgA//8AAAQAAAAAAAQAAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAwAAAZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAR09PRwBAAAAAAAAB//8AAAABAAGAAAAAAAAAAAAAAAAAAAABAAAAAAAABAAAAAAAAAIAAQAAAAAAFAADAAAAAAAUAAYACgAAAAAAAAAAAAAAAAAMAAAAAQAAAAAEAAgAAAMAADEhESEEAPwACAAAAAADACoAAAADAAAABQAWAAAAAQAAAAAABQALABYAAwABBAkABQAWAAAAVgBlAHIAcwBpAG8AbgAgADEALgAwVmVyc2lvbiAxLjAAAAEAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA="

/**
 * Every one of the 65,536 numbers to shape 1, the empty one, two bytes for
 * each, already squeezed: 128 kB that is the same for every file, and
 * would otherwise be written in full after a signed file.
 */
const EVERY_TO_ONE =
  "eNrtwgEJAAAAAqD6fzpoh2gaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgBsA/wAQ"

/** The name the font is known by in a file. */
export const OCR_FONT = "GlyphLessFont"

/** Every UTF-16 number read as itself, so that a reader takes each letter for what it is. */
const TO_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`

const bytesOf = (base64: string) =>
  Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0))

/**
 * The font that draws nothing, added to a file: a composite font whose
 * every number is a letter of UTF-16 and is drawn with the one empty shape.
 */
function addGlyphless(doc: Doc): Obj {
  const program = bytesOf(GLYPHLESS)
  const file = doc.addStream(program, { Length1: program.length })
  const describe = doc.addObject({
    Type: doc.newName("FontDescriptor"),
    FontName: doc.newName(OCR_FONT),
    Flags: 5,
    FontBBox: [0, 0, 500, 1000],
    ItalicAngle: 0,
    Ascent: 1000,
    Descent: -1,
    CapHeight: 1000,
    StemV: 80,
    FontFile2: file,
  })
  const shapes = doc.addRawStream(bytesOf(EVERY_TO_ONE), {
    Filter: doc.newName("FlateDecode"),
  })
  const letters = doc.addObject({
    Type: doc.newName("Font"),
    Subtype: doc.newName("CIDFontType2"),
    BaseFont: doc.newName(OCR_FONT),
    CIDSystemInfo: {
      Registry: doc.newString("Adobe"),
      Ordering: doc.newString("Identity"),
      Supplement: 0,
    },
    FontDescriptor: describe,
    DW: 500,
    CIDToGIDMap: shapes,
  })
  return doc.addObject({
    Type: doc.newName("Font"),
    Subtype: doc.newName("Type0"),
    BaseFont: doc.newName(OCR_FONT),
    Encoding: doc.newName("Identity-H"),
    DescendantFonts: [letters],
    ToUnicode: doc.addStream(TO_UNICODE, {}),
  })
}

/** A page drawn to be read, with how many letters the page already has as text. */
export interface OcrPicture {
  /** The page as it is shown, in grey, as a PNG. */
  png: Uint8Array
  /** The page's points to one pixel of the picture. */
  scale: number
  /** Letters the page holds as text already: a page that has some has been read before, or was never a scan. */
  letters: number
}

/**
 * A page of the file as it stands, drawn in grey to be read: its own
 * content only, without what is laid over it (what was added, comments,
 * fields), so that what is read is what the page is.
 */
export function ocrPicture(
  mupdf: Engine,
  session: EditSession,
  index: number
): OcrPicture {
  return withPage(session.doc, index, (page) => {
    const bounds = page.getBounds()
    const zoom = ocrZoom(bounds[2] - bounds[0], bounds[3] - bounds[1])
    const list = new mupdf.DisplayList(bounds)
    const writer = new mupdf.DisplayListDevice(list)
    try {
      // Running a page can mend a faulty tagged file, and nothing may be
      // changed outside an operation (see `read` in `mupdf-text.ts`).
      const own = !session.working
      if (own) session.doc.beginOperation("Read the page")
      try {
        page.runPageContents(writer, mupdf.Matrix.identity)
        writer.close()
      } catch (error) {
        if (own) session.doc.abandonOperation()
        throw error
      }
      if (own) session.doc.endOperation()
      let letters = 0
      const text = list.toStructuredText("preserve-whitespace")
      try {
        text.walk({
          onChar(letter) {
            if (letter.trim()) letters++
          },
        })
      } finally {
        text.destroy()
      }
      const pixels = list.toPixmap(
        mupdf.Matrix.scale(zoom, zoom),
        mupdf.ColorSpace.DeviceGray,
        false
      )
      try {
        return { png: pixels.asPNG(), scale: 1 / zoom, letters }
      } finally {
        pixels.destroy()
      }
    } finally {
      writer.destroy()
      list.destroy()
    }
  })
}

/** The dictionary a page's fonts are named in, made where the page has none. */
function fontNames(doc: Doc, page: Obj) {
  let resources = page.getInheritable("Resources")
  if (!resources.isDictionary()) {
    resources = doc.newDictionary()
    page.put("Resources", resources)
  }
  let fonts = resources.get("Font")
  if (!fonts.isDictionary()) {
    fonts = doc.newDictionary()
    resources.put("Font", fonts)
  }
  return fonts
}

/**
 * Lay the words read on pages, as one step that can be undone. A page's
 * own content is closed off first, so that the words start from nothing
 * whatever it leaves behind, and they are written after it.
 * @returns The pages that changed, counted from 0.
 */
export function applyOcr(
  mupdf: Engine,
  session: EditSession,
  asked: OcrChange
): number[] {
  const ops = asked.ops.map(readOcrOp)
  if (ops.some((op) => op === null))
    throw new Error("Those words cannot be laid on the page.")
  const read = ops as NonNullable<(typeof ops)[number]>[]
  const count = session.doc.countPages()
  if (read.some((op) => op.page >= count))
    throw new Error("That page is not in the file.")
  if (!wordsIn(read)) return []
  return inStep(
    session,
    asked.label,
    (touch) => {
      const { doc } = session
      let font: Obj | null = null
      for (const op of read) {
        if (!op.lines.length) continue
        withPage(doc, op.page, (page) => {
          const object = page.getObject()
          const names = fontNames(doc, object)
          let name = "KsOcr"
          for (let n = 2; !names.get(name).isNull(); n++) name = `KsOcr${n}`
          font ??= addGlyphless(doc)
          names.put(name, font)
          const words = layerOf(
            op.lines,
            name,
            inverse(page.getTransform() as Matrix)
          )
          const all = doc.newArray()
          all.push(doc.addStream("q\n", {}))
          const content = object.get("Contents")
          if (content.isArray()) content.forEach((part) => void all.push(part))
          else if (!content.isNull()) all.push(content)
          all.push(doc.addStream("Q\n", {}))
          all.push(doc.addStream(words, {}))
          object.put("Contents", all)
        })
        touch(op.page)
      }
    },
    { kind: "ocr", change: { label: asked.label, ops: read } }
  )
}
canDo("ocr", applyOcr)
