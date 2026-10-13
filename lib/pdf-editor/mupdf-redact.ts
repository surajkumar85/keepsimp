/**
 * Taking things out of a file for good, in the working copy. Marks are the
 * PDF's own kind of note for this (Redact), with a name of ours on each;
 * applying them has the engine take out the letters, the pixels of
 * pictures and the drawings under them. What the engine leaves is taken
 * out here: notes and form fields that lie under a mark. Then the page is
 * looked at, before any box is put on it, to see that nothing is drawn
 * where the marks were; and only then are the black boxes drawn.
 */
import type * as MuPDF from "mupdf"
import type { Quad } from "@/lib/pdf-reader/text"
import type { Box } from "./geometry"
import {
  canDo,
  DATA_KEY,
  inStep,
  REDACT_KEY,
  withPage,
  type EditSession,
} from "./mupdf-edit"
import { lettersOn } from "./mupdf-comments"
import { dropWidget } from "./mupdf-pages"
import {
  boxOf,
  foundIn,
  inBoxes,
  MOST_FOUND,
  overlaps,
  readRedactOp,
  residueIn,
  type Applied,
  type FoundPlace,
  type RedactChange,
  type RedactMark,
  type Sought,
} from "./redact"
import { inverse, type Matrix } from "./retext"

type Engine = typeof MuPDF
type Obj = MuPDF.PDFObject

/** What a mark that is not ours goes by while ours are applied. */
const WAITS = "KeepSimpWaits"
/** How many pixels to a point the page is looked at with after its marks were applied. */
const LOOK = 2

/** The qualities a picture is saved at again, from the best down. */
const QUALITIES = [90, 82, 75, 65, 55, 45] as const
/** The quality for a picture whose own kind (JPEG 2000) tells nothing of how large a JPEG of it should be. */
const PLAIN_QUALITY = 78
/** How much larger than it was a picture may come out, saved again. */
const ROOM = 1.15

const nameOf = (object: Obj) => (object.isName() ? object.asName() : "")
const numberOf = (object: Obj) => (object.isNumber() ? object.asNumber() : 0)

/** What a picture was saved as: a kind that loses a little, or none of those. */
function lossyKind(picture: Obj): "jpeg" | "jpx" | null {
  const filter = picture.get("Filter")
  const names: string[] = []
  if (filter.isArray()) filter.forEach((one) => void names.push(nameOf(one)))
  else names.push(nameOf(filter))
  return names.includes("DCTDecode")
    ? "jpeg"
    : names.includes("JPXDecode")
      ? "jpx"
      : null
}

/** A picture's size in pixels, as a key. */
const sizeKey = (picture: Obj) =>
  `${numberOf(picture.get("Width"))}x${numberOf(picture.get("Height"))}`

/**
 * The pictures a page draws that are kept in a way that loses a little (a
 * JPEG, or JPEG 2000), by their size in pixels, with how long each is in
 * the file. A picture inside something else the page draws counts too.
 */
function lossyPictures(page: Obj) {
  const found = new Map<string, { kind: "jpeg" | "jpx"; length: number }>()
  const seen = new Set<number>()
  const note = (picture: Obj) => {
    const kind = lossyKind(picture)
    if (kind)
      found.set(sizeKey(picture), {
        kind,
        length: numberOf(picture.get("Length")),
      })
  }
  const walk = (resources: Obj, depth: number) => {
    if (!resources.isDictionary() || depth > 6) return
    const things = resources.get("XObject")
    if (!things.isDictionary()) return
    things.forEach((thing) => {
      if (!thing.isDictionary() && !thing.isStream()) return
      if (thing.isIndirect()) {
        if (seen.has(thing.asIndirect())) return
        seen.add(thing.asIndirect())
      }
      const kind = nameOf(thing.get("Subtype"))
      if (kind === "Image") {
        note(thing)
        const soft = thing.get("SMask")
        if (soft.isDictionary() || soft.isStream()) note(soft)
      } else if (kind === "Form") walk(thing.get("Resources"), depth + 1)
    })
  }
  walk(page.getInheritable("Resources"), 0)
  return found
}

/**
 * Save again, as JPEGs, the pictures the engine wrote anew while it
 * applied marks. The engine writes a picture it blanked a part of pixel
 * for pixel, which makes a scanned page many times as large as it was. A
 * picture that was a JPEG before is a JPEG again, at the best quality that
 * leaves it about the size it was; one that was kept without loss stays
 * without loss. What was blanked was blanked before this, so nothing of it
 * can come back.
 * @param from The number of the first object the engine can have made.
 */
function packPictures(
  doc: MuPDF.PDFDocument,
  from: number,
  lossy: ReturnType<typeof lossyPictures>
) {
  if (!lossy.size) return
  const count = doc.countObjects()
  for (let number = from; number < count; number++) {
    const ref = doc.newIndirect(number)
    if (!ref.isStream() || nameOf(ref.get("Subtype")) !== "Image") continue
    if (!ref.get("Filter").isNull()) continue
    if (numberOf(ref.get("BitsPerComponent")) !== 8) continue
    const was = lossy.get(sizeKey(ref))
    if (!was) continue
    const image = doc.loadImage(ref)
    let pixmap: MuPDF.Pixmap | null = null
    try {
      pixmap = image.toPixmap()
      const parts = pixmap.getNumberOfComponents()
      // Grey, or red, green and blue; anything else stays as the engine wrote it.
      if (pixmap.getAlpha() || (parts !== 1 && parts !== 3)) continue
      const plain = pixmap.getWidth() * pixmap.getHeight() * parts
      let bytes: Uint8Array | null = null
      if (was.kind === "jpx")
        bytes = pixmap.asJPEG(PLAIN_QUALITY, false).slice()
      else
        for (const quality of QUALITIES) {
          bytes = pixmap.asJPEG(quality, false).slice()
          if (bytes.length <= was.length * ROOM) break
        }
      if (!bytes || bytes.length >= plain) continue
      ref.writeRawStream(bytes)
      ref.put("Filter", doc.newName("DCTDecode"))
      ref.delete("DecodeParms")
    } catch (error) {
      // Out of memory ends the change; a picture that cannot be saved again stays as it is.
      if (error instanceof RangeError) throw error
    } finally {
      pixmap?.destroy()
      image.destroy()
    }
  }
}

const isMark = (annot: MuPDF.PDFAnnotation) =>
  annot.getType() === "Redact" && annot.getObject().get(REDACT_KEY).isString()

/** Whether a page has a mark of ours, asked of the file itself without opening the page. */
function marked(doc: MuPDF.PDFDocument, index: number) {
  const notes = doc.findPage(index).get("Annots")
  if (!notes.isArray()) return false
  for (let at = 0; at < notes.length; at++)
    if (
      nameOf(notes.get(at, "Subtype")) === "Redact" &&
      notes.get(at, REDACT_KEY).isString()
    )
      return true
  return false
}

/** The marks of ours on a page that are waiting to be applied. */
export function redactMarksOn(
  session: EditSession,
  index: number
): RedactMark[] {
  return withPage(session.doc, index, (page) =>
    page
      .getAnnotations()
      .filter(isMark)
      .map((annot) => ({
        id: annot.getObject().get(REDACT_KEY).asString(),
        quads: annot.getQuadPoints() as unknown as Quad[],
      }))
  )
}

/**
 * Where some words, or things of a kind, are on the pages of the file, to
 * be marked. At most `MOST_FOUND` places are given.
 */
export function redactFind(
  session: EditSession,
  sought: Sought
): { found: (FoundPlace & { page: number })[]; more: boolean } {
  const found: (FoundPlace & { page: number })[] = []
  for (let page = 0; page < session.doc.countPages(); page++) {
    for (const place of foundIn(lettersOn(session, page), sought)) {
      if (found.length >= MOST_FOUND) return { found, more: true }
      found.push({ ...place, page })
    }
  }
  return { found, more: false }
}

const boxOfRect = ([left, top, right, bottom]: MuPDF.Rect): Box => ({
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
})

/**
 * Apply the marks of ours on one page.
 * @returns What was done; null when the page has none.
 */
function applyOn(
  mupdf: Engine,
  session: EditSession,
  index: number,
  touched: boolean
): Applied | null {
  const { doc } = session
  return withPage(doc, index, (page) => {
    const marks = page.getAnnotations().filter(isMark)
    if (!marks.length) return null
    const boxes = marks.flatMap((annot) =>
      (annot.getQuadPoints() as unknown as Quad[]).map(boxOf)
    )
    // Marks the file came with are not ours to apply. While ours are, they
    // go by another kind's name, so that the engine does not take them for
    // marks: taking them off the page's list is not enough, since the
    // engine applies the marks of the page as it has it open.
    const waiting: Obj[] = []
    for (const annot of page.getAnnotations())
      if (annot.getType() === "Redact" && !isMark(annot))
        waiting.push(annot.getObject())
    for (const note of waiting) note.put("Subtype", doc.newName(WAITS))
    // Notes and fields that lie under a mark go with what they lie on. The
    // engine takes links itself; what the editor added is the person's own.
    let gone = 0
    let fields = 0
    for (const annot of page.getAnnotations()) {
      const kind = annot.getType()
      if (kind === "Redact" || kind === "Link") continue
      if (annot.getObject().get(DATA_KEY).isString()) continue
      const place = boxOfRect(annot.getBounds())
      if (!boxes.some((box) => overlaps(box, place))) continue
      page.deleteAnnotation(annot)
      gone++
    }
    for (const widget of page.getWidgets()) {
      const place = boxOfRect(widget.getBounds())
      if (!boxes.some((box) => overlaps(box, place))) continue
      const field = widget.getObject()
      fields += dropWidget(doc, field)
      const list = page.getObject().get("Annots")
      if (list.isArray())
        for (let at = list.length - 1; at >= 0; at--)
          if (list.get(at).asIndirect() === field.asIndirect()) list.delete(at)
    }
    const back = inverse(page.getTransform() as Matrix)
    const lossy = lossyPictures(page.getObject())
    const made = doc.countObjects()
    page.applyRedactions(
      false,
      mupdf.PDFPage.REDACT_IMAGE_PIXELS,
      touched
        ? mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED
        : mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
      mupdf.PDFPage.REDACT_TEXT_REMOVE
    )
    // The look afterwards: the page's own content alone, with nothing over it.
    const picture = page.toPixmap(
      [LOOK, 0, 0, LOOK, 0, 0],
      mupdf.ColorSpace.DeviceRGB,
      true,
      false
    )
    let residue = 0
    try {
      residue = residueIn(
        picture.getPixels(),
        picture.getWidth(),
        picture.getHeight(),
        LOOK,
        boxes
      )
    } finally {
      picture.destroy()
    }
    // And letters: none may still be read where a mark was.
    let read = false
    const text = page.toStructuredText("preserve-whitespace")
    try {
      text.walk({
        onChar(letter, _origin, _font, _size, quad) {
          if (!letter.trim()) return
          const place = boxOf(quad as unknown as Quad)
          if (
            inBoxes(
              boxes,
              place.x + place.width / 2,
              place.y + place.height / 2,
              1
            )
          )
            read = true
        },
      })
    } finally {
      text.destroy()
    }
    if (read)
      throw new Error(
        `Words under a mark on page ${index + 1} could not be taken out. Nothing was changed.`
      )
    // After the look, so that it saw the pixels as they were blanked.
    packPictures(doc, made, lossy)
    // The boxes, drawn after everything the page has, in the file's own points.
    const through = (x: number, y: number) =>
      `${(back[0] * x + back[2] * y + back[4]).toFixed(3)} ${(back[1] * x + back[3] * y + back[5]).toFixed(3)}`
    const drawn = boxes
      .map(
        (box) =>
          `${through(box.x, box.y)} m ${through(box.x + box.width, box.y)} l ${through(box.x + box.width, box.y + box.height)} l ${through(box.x, box.y + box.height)} l h f`
      )
      .join("\n")
    const now = page.getObject()
    const own = now.get("Contents")
    const all = doc.newArray()
    all.push(doc.addStream("q\n", {}))
    if (own.isArray()) own.forEach((part) => void all.push(part))
    else if (!own.isNull()) all.push(own)
    all.push(doc.addStream(`\nQ\nq 0 g\n${drawn}\nQ\n`, {}))
    now.put("Contents", all)
    // The marks that waited are marks again.
    for (const note of waiting) note.put("Subtype", doc.newName("Redact"))
    return { page: index, boxes, residue, notes: gone, fields }
  })
}

/**
 * Mark places to be taken out, take marks away, or apply them all, as one
 * step that can be undone.
 * @returns The pages to draw again.
 * @throws When there is nothing to apply, or words under a mark cannot be taken out.
 */
export function applyRedact(
  mupdf: Engine,
  session: EditSession,
  asked: RedactChange
): number[] {
  const ops = asked.ops.map((op) => {
    const read = readRedactOp(op)
    if (!read) throw new Error("That is not a change to the marks.")
    return read
  })
  const made: RedactChange = { label: asked.label, ops }
  const done: Applied[][] = []
  const { doc } = session
  const pages = inStep(
    session,
    asked.label,
    (touch) => {
      for (let at = 0; at < ops.length; at++) {
        const op = ops[at]
        if (op.do === "apply") {
          const emptied: Applied[] = []
          for (let index = 0; index < doc.countPages(); index++) {
            // A page without marks is not opened: a long file has few with any.
            if (!marked(doc, index)) continue
            const did = applyOn(mupdf, session, index, Boolean(op.touched))
            if (!did) continue
            emptied.push(did)
            touch(index)
          }
          if (!emptied.length) throw new Error("There are no marks to apply.")
          done.push(emptied)
          continue
        }
        // The changes to one page that follow one another are made with
        // the page opened once: a search marks hundreds of places at a time.
        const run = [op]
        for (let next = ops[at + 1]; next; next = ops[at + 1]) {
          if (next.do === "apply" || next.page !== op.page) break
          run.push(next)
          at++
        }
        for (let each = 0; each < run.length; each++) done.push([])
        if (op.page >= doc.countPages()) continue
        touch(op.page)
        withPage(doc, op.page, (page) => {
          const byName = new Map<string, MuPDF.PDFAnnotation>()
          for (const annot of page.getAnnotations())
            if (isMark(annot))
              byName.set(annot.getObject().get(REDACT_KEY).asString(), annot)
          for (const one of run) {
            const was = byName.get(one.id)
            if (one.do === "unmark") {
              if (was) page.deleteAnnotation(was)
              byName.delete(one.id)
              continue
            }
            if (was) continue
            const mark = page.createAnnotation("Redact")
            mark.setQuadPoints(one.quads as unknown as MuPDF.Quad[])
            mark.getObject().put(REDACT_KEY, doc.newString(one.id))
            byName.set(one.id, mark)
          }
        })
      }
    },
    { kind: "redact", change: made }
  )
  // What applying did is the same whenever the step is made again.
  if (!session.again) made.done = done
  return pages
}
canDo("redact", applyRedact)
