/**
 * What a file's bytes are spent on, read with MuPDF. Every stored stream is
 * named for what it holds; `audit.ts` adds them up.
 */
import type * as MuPDF from "mupdf"
import {
  breakdown,
  heaviest,
  type AuditItem,
  type Breakdown,
  type PictureRow,
} from "./audit"

type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

export interface Audit {
  breakdown: Breakdown
  /** The heaviest pictures, heaviest first. */
  pictures: PictureRow[]
  /** How many pictures the file holds. */
  pictureCount: number
  /** The file says it is an archive file (PDF/A). */
  archive: boolean
}

const nameOf = (object: Obj) => (object.isName() ? object.asName() : "")
const numberOf = (object: Obj) => (object.isNumber() ? object.asNumber() : 0)
/** The number of the object a reference points at; 0 when it is not a reference. */
const refOf = (object: Obj) => (object.isIndirect() ? object.asIndirect() : 0)

/** How deep drawings inside drawings are followed when looking for a picture's page. */
const MAX_NESTING = 4
/** How many objects of private data are followed from one entry. */
const MAX_PRIVATE = 20_000

/** Every object of a file that can be read, with its number. */
export function eachObject(
  doc: Doc,
  visit: (ref: Obj, number: number) => void
) {
  const count = doc.countObjects()
  for (let number = 1; number < count; number++) {
    const ref = doc.newIndirect(number)
    try {
      if (ref.isDictionary() || ref.isStream()) visit(ref, number)
    } catch {
      // An object that cannot be read is left out.
    }
  }
}

/** Mark everything reachable from `start` that belongs to nothing else we know by name. */
function followPrivate(start: Obj, marked: Set<number>) {
  const queue: Obj[] = [start]
  let seen = 0
  while (queue.length && seen < MAX_PRIVATE) {
    const object = queue.pop()!
    seen++
    const number = refOf(object)
    if (number) {
      if (marked.has(number)) continue
      // Private data may point back into the document; those parts are not private.
      if (object.isDictionary() && !object.get("Type").isNull()) continue
      marked.add(number)
    }
    if (object.isDictionary() || object.isArray())
      object.forEach((value) => {
        if (value.isIndirect() || value.isDictionary() || value.isArray())
          queue.push(value)
      })
  }
}

/** The first page that shows each picture, by the picture's number. */
function firstPages(doc: Doc) {
  const pages = new Map<number, number>()
  const walk = (resources: Obj, page: number, depth: number) => {
    const list = resources.get("XObject")
    if (!list.isDictionary()) return
    list.forEach((entry) => {
      const number = refOf(entry)
      if (!number || !entry.isStream()) return
      const kind = nameOf(entry.get("Subtype"))
      if (kind === "Image") {
        if (!pages.has(number)) pages.set(number, page)
        const mask = refOf(entry.get("SMask"))
        if (mask && !pages.has(mask)) pages.set(mask, page)
      } else if (kind === "Form" && depth < MAX_NESTING) {
        const inner = entry.get("Resources")
        if (inner.isDictionary()) walk(inner, page, depth + 1)
      }
    })
  }
  const count = doc.countPages()
  for (let index = 0; index < count; index++) {
    try {
      const resources = doc.findPage(index).getInheritable("Resources")
      if (resources.isDictionary()) walk(resources, index + 1, 0)
    } catch {
      // A page that cannot be read shows nothing we can name.
    }
  }
  return pages
}

/** True when the document's own details call it PDF/A. */
export function isArchive(doc: Doc) {
  try {
    const details = doc.getTrailer().get("Root", "Metadata")
    if (!details.isStream()) return false
    const buffer = details.readStream()
    try {
      return /pdfaid:part/.test(buffer.asString())
    } finally {
      buffer.destroy()
    }
  } catch {
    return false
  }
}

/**
 * Add up a file's streams.
 * @param total The size of the file in bytes.
 */
export function auditPdf(doc: Doc, total: number): Audit {
  const fonts = new Set<number>()
  const thumbnails = new Set<number>()
  const content = new Set<number>()
  const hidden = new Set<number>()
  eachObject(doc, (ref) => {
    const type = nameOf(ref.get("Type"))
    if (type === "FontDescriptor")
      for (const key of ["FontFile", "FontFile2", "FontFile3"])
        fonts.add(refOf(ref.get(key)))
    else if (type === "Font")
      for (const key of ["ToUnicode", "CIDToGIDMap", "Encoding"])
        fonts.add(refOf(ref.get(key)))
    else if (type === "Page") {
      thumbnails.add(refOf(ref.get("Thumb")))
      const contents = ref.get("Contents")
      if (contents.isArray())
        contents.forEach((part) => void content.add(refOf(part)))
      else content.add(refOf(contents))
    }
    const hides = ref.get("PieceInfo")
    if (!hides.isNull()) followPrivate(hides, hidden)
  })
  const pages = firstPages(doc)
  const items: AuditItem[] = []
  const pictures: PictureRow[] = []
  eachObject(doc, (ref, number) => {
    if (!ref.isStream()) return
    const bytes = numberOf(ref.get("Length"))
    const type = nameOf(ref.get("Type"))
    const subtype = nameOf(ref.get("Subtype"))
    if (thumbnails.has(number)) items.push({ kind: "thumbnails", bytes })
    else if (hidden.has(number)) items.push({ kind: "private", bytes })
    else if (subtype === "Image") {
      items.push({ kind: "pictures", bytes })
      pictures.push({
        object: number,
        width: numberOf(ref.get("Width")),
        height: numberOf(ref.get("Height")),
        bytes,
        page: pages.get(number) ?? null,
      })
    } else if (fonts.has(number) || type === "CMap")
      items.push({ kind: "fonts", bytes })
    else if (type === "EmbeddedFile") items.push({ kind: "attachments", bytes })
    else if (type === "Metadata") items.push({ kind: "details", bytes })
    else if (
      content.has(number) ||
      subtype === "Form" ||
      !ref.get("PatternType").isNull()
    )
      items.push({ kind: "content", bytes })
    // A colour profile is a stream that says how many channels it describes and nothing else about itself.
    else if (
      !type &&
      !subtype &&
      !ref.get("N").isNull() &&
      ref.get("FunctionType").isNull()
    )
      items.push({ kind: "profiles", bytes })
  })
  return {
    breakdown: breakdown(total, items),
    pictures: heaviest(pictures),
    pictureCount: pictures.length,
    archive: isArchive(doc),
  }
}
