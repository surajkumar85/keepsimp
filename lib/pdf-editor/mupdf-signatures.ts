/**
 * Reading the signatures a file carries, with the engine: each signature
 * field's value (what it covers, the signature, its kind, when and by whom
 * it says it was made), and, for a signature the file was added to after,
 * what changed: the file as it was signed (the bytes the signature covers
 * end where that version ended) is opened beside the file as it is.
 * The checking itself is done in `signatures.ts`.
 */
import type * as MuPDF from "mupdf"
import { open } from "@/lib/pdf-compressor/mupdf-compress"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import { heldBy, isComment, withPage } from "./mupdf-edit"
import {
  readPdfDate,
  type Changes,
  type FoundSignature,
} from "./signature-report"
import { verdictOf } from "./signatures"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** A signature as it is in the file, before it is checked. */
export interface RawSignature {
  field: string
  page: number | null
  shown: boolean
  kind: string
  ranges: number[]
  /** The signature's bytes, with the zeros of its room after them. */
  contents: Uint8Array
  time: string | null
  name: string
  reason: string
  location: string
}

/** The most signatures read from one file. */
export const MOST_SIGNATURES = 50
/** How large a page is drawn to tell whether it looks otherwise now. */
const LOOK_EDGE = 400
/** The flag of an annotation that is not shown. */
const HIDDEN = 2

const textOf = (value: Obj) => (value.isString() ? value.asString() : "")
const nameOf = (value: Obj) => (value.isName() ? value.asName() : "")
const holderOf = (place: Obj) =>
  place.get("T").isString() ? place : place.get("Parent")

/** What one signature field holds, or null when it holds no signature. */
function rawOf(
  field: Obj,
  place: Obj,
  page: number | null
): RawSignature | null {
  const value = field.get("V")
  if (!value.isDictionary()) return null
  const range = value.get("ByteRange")
  const contents = value.get("Contents")
  if (!range.isArray() || !contents.isString()) return null
  const ranges: number[] = []
  for (let at = 0; at < range.length; at++) {
    const one = range.get(at)
    ranges.push(one.isNumber() ? one.asNumber() : -1)
  }
  const rect = place.get("Rect")
  const corner = (at: number) =>
    rect.isArray() && rect.get(at).isNumber() ? rect.get(at).asNumber() : 0
  const flags = place.get("F")
  return {
    field: textOf(field.get("T")),
    page,
    shown:
      page !== null &&
      Math.abs(corner(2) - corner(0)) > 1 &&
      Math.abs(corner(3) - corner(1)) > 1 &&
      !(flags.isNumber() && flags.asNumber() & HIDDEN),
    kind: nameOf(value.get("SubFilter")),
    ranges,
    contents: contents.asByteString(),
    time: readPdfDate(textOf(value.get("M"))),
    name: textOf(value.get("Name")),
    reason: textOf(value.get("Reason")),
    location: textOf(value.get("Location")),
  }
}

/** The signatures of an open file, in the order they were made (by where what they cover ends). */
function signaturesIn(doc: Doc): RawSignature[] {
  const found: RawSignature[] = []
  // A signature is a field of the file's form: without one, there is none.
  const fields = doc.getTrailer().get("Root", "AcroForm", "Fields")
  if (!fields.isArray()) return found
  const seen = new Set<number>()
  const take = (field: Obj, place: Obj, page: number | null) => {
    const value = field.get("V")
    const number = value.isIndirect() ? value.asIndirect() : -1
    if (number >= 0 && seen.has(number)) return
    const raw = rawOf(field, place, page)
    if (!raw || found.length >= MOST_SIGNATURES) return
    if (number >= 0) seen.add(number)
    found.push(raw)
  }
  for (let page = 0; page < doc.countPages(); page++)
    withPage(doc, page, (loaded) => {
      for (const widget of loaded.getWidgets())
        if (widget.getFieldType() === "signature") {
          const place = widget.getObject()
          take(holderOf(place), place, page)
        }
    })
  // A signature field that is on no page is a signature all the same.
  for (let at = 0; at < fields.length; at++) {
    const field = fields.get(at)
    if (nameOf(field.get("FT")) === "Sig") take(field, field, null)
  }
  const end = (one: RawSignature) => (one.ranges[2] ?? 0) + (one.ranges[3] ?? 0)
  return found.sort((a, b) => end(a) - end(b))
}

/** The signatures a file carries, as they are in it. */
export function rawSignatures(
  mupdf: Engine,
  bytes: Uint8Array,
  password?: string
): RawSignature[] {
  const doc = open(mupdf, bytes, password)
  try {
    return signaturesIn(doc)
  } finally {
    doc.destroy()
  }
}

/** A file's form, without its signature fields: each field's name and what it holds. */
function valuesOf(doc: Doc) {
  const values = new Map<string, string>()
  for (let page = 0; page < doc.countPages(); page++)
    withPage(doc, page, (loaded) => {
      for (const widget of loaded.getWidgets()) {
        if (widget.getFieldType() === "signature") continue
        const name = widget.getName()
        if (!values.has(name)) values.set(name, heldBy(widget))
      }
    })
  return values
}

/** How many comments each page has. */
const commentsOf = (doc: Doc) =>
  Array.from({ length: doc.countPages() }, (_, page) =>
    withPage(
      doc,
      page,
      (loaded) => loaded.getAnnotations().filter(isComment).length
    )
  )

/** How many times a run of bytes holds the end of a version of a file. */
function endsIn(bytes: Uint8Array) {
  let count = 0
  for (let at = 0; at + 5 <= bytes.length; at++)
    if (
      bytes[at] === 0x25 &&
      bytes[at + 1] === 0x25 &&
      bytes[at + 2] === 0x45 &&
      bytes[at + 3] === 0x4f &&
      bytes[at + 4] === 0x46
    )
      count++
  return count
}

/**
 * What was added to a file after a signature: the file as it was signed
 * (its bytes up to `end`) beside the file as it is.
 */
export function changesSince(
  mupdf: Engine,
  bytes: Uint8Array,
  end: number,
  password?: string
): Omit<Changes, "detailsChanged"> {
  const was = open(mupdf, bytes.slice(0, end), password)
  const now = open(mupdf, bytes, password)
  try {
    const pagesWere = was.countPages()
    const pagesAre = now.countPages()
    const pagesChanged: number[] = []
    for (let page = 0; page < Math.min(pagesWere, pagesAre); page++) {
      const before = drawPage(mupdf, was, page, LOOK_EDGE)
      const after = drawPage(mupdf, now, page, LOOK_EDGE)
      if (
        before.width !== after.width ||
        before.height !== after.height ||
        before.data.some((value, at) => value !== after.data[at])
      )
        pagesChanged.push(page)
    }
    const commentsWere = commentsOf(was)
    const commentsAre = commentsOf(now)
    let commentsAdded = 0
    let commentsRemoved = 0
    for (let page = 0; page < Math.max(pagesWere, pagesAre); page++) {
      const difference = (commentsAre[page] ?? 0) - (commentsWere[page] ?? 0)
      if (difference > 0) commentsAdded += difference
      else commentsRemoved -= difference
    }
    const valuesWere = valuesOf(was)
    const valuesAre = valuesOf(now)
    const fieldsChanged = [...valuesAre.keys()].filter(
      (name) => valuesWere.get(name) !== valuesAre.get(name)
    )
    const signedBefore = new Set(signaturesIn(was).map((one) => one.field))
    const signaturesAdded = signaturesIn(now)
      .map((one) => one.field)
      .filter((field) => !signedBefore.has(field))
    return {
      updates: endsIn(bytes.subarray(end)),
      pagesAdded: Math.max(0, pagesAre - pagesWere),
      pagesRemoved: Math.max(0, pagesWere - pagesAre),
      pagesChanged,
      commentsAdded,
      commentsRemoved,
      fieldsChanged,
      signaturesAdded,
    }
  } finally {
    was.destroy()
    now.destroy()
  }
}

/** What a signature says of itself, which an update after it could write anew. */
const DETAILS = ["time", "name", "reason", "location"] as const

/** The signatures a file carries, each checked, with what changed after it. */
export async function signaturesOf(
  mupdf: Engine,
  bytes: Uint8Array,
  password?: string
): Promise<FoundSignature[]> {
  const found: FoundSignature[] = []
  for (const raw of rawSignatures(mupdf, bytes, password)) {
    const verdict = await verdictOf(bytes, raw.kind, raw.ranges, raw.contents)
    const end = (raw.ranges[2] ?? 0) + (raw.ranges[3] ?? 0)
    const whole = end === bytes.length
    let changes: Changes | null = null
    let shown = raw
    if (!whole && end > 0 && end < bytes.length)
      try {
        // What it said when it was signed: the same signature in the file as it was then.
        const signed = rawSignatures(mupdf, bytes.slice(0, end), password).find(
          (one) => one.ranges.join() === raw.ranges.join()
        )
        if (signed) shown = { ...raw, ...pick(signed) }
        changes = {
          ...changesSince(mupdf, bytes, end, password),
          detailsChanged:
            !signed || DETAILS.some((key) => signed[key] !== raw[key]),
        }
      } catch {
        changes = null
      }
    found.push({
      field: shown.field,
      page: shown.page,
      shown: shown.shown,
      kind: shown.kind,
      time: shown.time,
      name: shown.name,
      reason: shown.reason,
      location: shown.location,
      whole,
      verdict,
      changes,
    })
  }
  return found
}

const pick = (raw: RawSignature) =>
  Object.fromEntries(DETAILS.map((key) => [key, raw[key]])) as Pick<
    RawSignature,
    (typeof DETAILS)[number]
  >
