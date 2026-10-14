/**
 * Signing a written file with a certificate. The signature is written
 * after the file, as an update, so that whatever the file carries stays as
 * it is, other signatures included: a signature field with a dictionary
 * that holds placeholders for what it covers and room for the signature,
 * and, when it shows, how it looks. The placeholders are filled in, the
 * bytes covered are signed (`certificate.ts`), and the signature is read
 * back (`signatures.ts`) before the file is handed over.
 */
import type * as MuPDF from "mupdf"
import { signatureFor, signatureRoom, type Identity } from "./certificate"
import {
  appearanceLines,
  boxOn,
  pdfDate,
  validityProblem,
  type CertifyOptions,
} from "./certify"
import type { Box } from "./geometry"
import { turnOf, withPage } from "./mupdf-edit"
import { fieldNames } from "./mupdf-form-fields"
import { inverse, type Matrix } from "./retext"
import { checkSignature, type Checked } from "./signatures"
import {
  coveredBy,
  findHolder,
  rangesOf,
  STARS,
  withRanges,
  withSignature,
} from "./sign-bytes"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** A field that is a place for a signature and holds none yet: its page, and its widget by number. */
interface Place {
  page: number
  widget: number
}

/** What signing made: the signed file, and the check of its signature. */
export interface Certified {
  bytes: Uint8Array
  /** The signature field's name. */
  field: string
  /** Where it shows: nowhere, or on which page (counted from 0). */
  page: number | null
  checked: Checked
}

const holderOf = (place: Obj) =>
  place.get("T").isString() ? place : place.get("Parent")

/** The fields of a file that are empty places for a signature, by name. */
export function emptyPlaces(doc: Doc): Map<string, Place> {
  const places = new Map<string, Place>()
  for (let page = 0; page < doc.countPages(); page++)
    withPage(doc, page, (loaded) => {
      for (const widget of loaded.getWidgets()) {
        if (widget.getFieldType() !== "signature") continue
        const field = holderOf(widget.getObject())
        if (!field.isDictionary() || !field.get("V").isNull()) continue
        const name = widget.getName()
        if (name && !places.has(name))
          places.set(name, { page, widget: widget.getObject().asIndirect() })
      }
    })
  return places
}

/**
 * Draw how a signature looks into its widget, found afresh on its page by
 * number: a page the engine already holds does not know what was put on
 * it since.
 */
function lookInto(
  mupdf: Engine,
  doc: Doc,
  index: number,
  number: number,
  lines: readonly string[]
) {
  withPage(doc, index, (page) => {
    const widget = page
      .getWidgets()
      .find((one) => one.getObject().asIndirect() === number)
    if (!widget) return
    const [x0, y0, x1, y1] = widget.getBounds()
    const width = x1 - x0
    const height = y1 - y0
    // Bounds are as the page is shown: the box as it is seen.
    if (width > 4 && height > 4)
      drawLook(mupdf, page, widget, { width, height }, lines)
  })
}

/** The box a shown place covers on its page, as the page is written. */
function rectOn(page: MuPDF.PDFPage, box: Box) {
  const m = inverse(page.getTransform() as Matrix)
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ]
}

/**
 * How a signature looks: a thin frame and its lines of words in Helvetica,
 * as large as the box lets them be, drawn upright as the page is shown.
 */
function drawLook(
  mupdf: Engine,
  page: MuPDF.PDFPage,
  widget: MuPDF.PDFWidget,
  size: { width: number; height: number },
  lines: readonly string[]
) {
  const { width, height } = size
  const list = new mupdf.DisplayList([0, 0, width, height])
  const device = new mupdf.DisplayListDevice(list)
  try {
    const frame = new mupdf.Path()
    frame.rect(0.5, 0.5, width - 0.5, height - 0.5)
    device.strokePath(
      frame,
      new mupdf.StrokeState({
        lineCap: "Butt",
        lineJoin: "Miter",
        lineWidth: 1,
        miterLimit: 10,
      }),
      mupdf.Matrix.identity,
      mupdf.ColorSpace.DeviceRGB,
      [0.2, 0.2, 0.2],
      1
    )
    const font = new mupdf.Font("Helvetica")
    const room = width - 12
    const lineSize = Math.min(10, (height - 8) / (lines.length * 1.25))
    const text = new mupdf.Text()
    lines.forEach((line, index) => {
      let size = index === 0 ? lineSize * 1.1 : lineSize
      const wide = Array.from(line).reduce(
        (sum, letter) =>
          sum + font.advanceGlyph(font.encodeCharacter(letter.codePointAt(0)!)),
        0
      )
      if (wide * size > room) size = room / wide
      let x = 6
      // The lines stand in the middle of the box, from top to bottom.
      const top = Math.max(4, (height - lines.length * lineSize * 1.25) / 2)
      const y = top + (index + 1) * lineSize * 1.25 - lineSize * 0.25
      for (const letter of line) {
        const code = letter.codePointAt(0)!
        const glyph = font.encodeCharacter(code)
        text.showGlyph(font, [size, 0, 0, -size, x, y], glyph, code)
        x += font.advanceGlyph(glyph) * size
      }
    })
    device.fillText(
      text,
      mupdf.Matrix.identity,
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 0],
      1
    )
    device.close()
    widget.setAppearanceFromDisplayList(
      "N",
      null,
      mupdf.Matrix.rotate(turnOf(page.getObject())),
      list
    )
  } finally {
    device.destroy()
    list.destroy()
  }
}

/** A name for a new signature field that the form does not use yet. */
function freeName(doc: Doc) {
  const taken = new Set(fieldNames(doc))
  let name = "Signature"
  for (let n = 2; taken.has(name); n++) name = `Signature${n}`
  return name
}

/**
 * Sign a written file with a certificate, as an update after it.
 * @throws With words for what stands in the way: a certificate that may
 *   not sign now, a file that is locked or cannot be added to, or a place
 *   to sign that is not there.
 */
export async function certify(
  mupdf: Engine,
  bytes: Uint8Array,
  identity: Identity,
  options: CertifyOptions,
  now = new Date()
): Promise<Certified> {
  const problem = validityProblem(identity.signer, now)
  if (problem) throw new Error(problem)
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as Doc
  let field = ""
  let shown: number | null = null
  let written: Uint8Array
  try {
    if (doc.needsPassword())
      throw new Error(
        "A file locked with a password cannot be signed here. Download it without the lock to sign it."
      )
    if (!doc.canBeSavedIncrementally())
      throw new Error("This file cannot be added to, so it cannot be signed.")
    const value = doc.addObject({
      Type: doc.newName("Sig"),
      Filter: doc.newName("Adobe.PPKLite"),
      SubFilter: doc.newName("ETSI.CAdES.detached"),
    })
    const range = doc.newArray()
    range.push(0)
    for (let at = 0; at < 3; at++) range.push(doc.newName(STARS))
    value.put("ByteRange", range)
    value.put(
      "Contents",
      doc.newByteString(new Uint8Array(signatureRoom(identity)))
    )
    value.put("M", doc.newString(pdfDate(now)))
    value.put("Name", doc.newString(identity.signer.name))
    if (options.reason) value.put("Reason", doc.newString(options.reason))
    if (options.location) value.put("Location", doc.newString(options.location))
    const lines = appearanceLines(identity.signer, now, options)
    const root = doc.getTrailer().get("Root")
    let form = root.get("AcroForm")
    if (!form.isDictionary()) {
      form = doc.newDictionary()
      root.put("AcroForm", form)
    }
    form.put("SigFlags", 3)

    if (options.place.kind === "field") {
      const place = emptyPlaces(doc).get(options.place.name)
      if (!place)
        throw new Error(
          `There is no empty place for a signature called “${options.place.name}”.`
        )
      field = options.place.name
      shown = place.page
      holderOf(doc.newIndirect(place.widget)).put("V", value)
      lookInto(mupdf, doc, place.page, place.widget, lines)
    } else {
      const index = options.place.kind === "box" ? options.place.page : 0
      if (index >= doc.countPages())
        throw new Error("That page is not in the file.")
      field = freeName(doc)
      const boxed = options.place.kind === "box"
      const widget = doc.addObject({
        Type: doc.newName("Annot"),
        Subtype: doc.newName("Widget"),
        FT: doc.newName("Sig"),
        T: doc.newString(field),
        // Printed, and locked so that it is not moved by mistake.
        F: 132,
        V: value,
      })
      withPage(doc, index, (page) => {
        const pageObject = page.getObject()
        widget.put("P", pageObject)
        if (boxed) {
          const [, , width, height] = page.getBounds()
          widget.put("Rect", rectOn(page, boxOn({ width, height })))
          widget.put("MK", { R: turnOf(pageObject) })
        } else widget.put("Rect", [0, 0, 0, 0])
        if (!pageObject.get("Annots").isArray())
          pageObject.put("Annots", doc.newArray())
        pageObject.get("Annots").push(widget)
      })
      if (!form.get("Fields").isArray()) form.put("Fields", doc.newArray())
      form.get("Fields").push(widget)
      if (boxed) {
        shown = index
        lookInto(mupdf, doc, index, widget.asIndirect(), lines)
      }
    }
    written = doc.saveToBuffer("incremental").asUint8Array().slice()
  } finally {
    doc.destroy()
  }

  const holder = findHolder(written)
  if (!holder) throw new Error("The room for the signature was not written.")
  const ranged = withRanges(written, holder)
  const ranges = rangesOf(holder, ranged.length)
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", coveredBy(ranged, ranges))
  )
  const signed = withSignature(
    ranged,
    holder,
    await signatureFor(identity, digest)
  )
  // The proof: the signature is read back out of the file as written.
  const checked = await checkSignature(
    signed,
    ranges,
    hexBytes(signed.subarray(holder.from + 1, holder.to - 1))
  )
  if (!checked.intact)
    throw new Error("The signature could not be read back. Nothing was signed.")
  return { bytes: signed, field, page: shown, checked }
}

/** Bytes written in hex, as a signature's room holds them. */
function hexBytes(hex: Uint8Array) {
  const out = new Uint8Array(hex.length / 2)
  for (let at = 0; at < out.length; at++)
    out[at] = parseInt(String.fromCharCode(hex[2 * at], hex[2 * at + 1]), 16)
  return out
}
