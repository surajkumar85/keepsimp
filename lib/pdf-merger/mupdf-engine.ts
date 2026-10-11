/**
 * Everything that touches MuPDF. The engine module is handed in, so the same
 * code runs in the browser worker and in Node, where the real-engine tests
 * read its results back with other software.
 */
import type * as MuPDF from "mupdf"
import type { Rotation, Size } from "@/lib/image-compressor/geometry"
import type { Pixels } from "@/lib/image-compressor/ssim"
import type { FileFacts } from "./files"
import {
  contentsPageCount,
  CONTENTS_HEADING,
  drawContents,
  layoutContents,
  showGlyphs,
  winAnsiHex,
} from "./contents"
import {
  countBookmarks,
  mergeBookmarks,
  type Bookmark,
  type BookmarkPolicy,
  type MergedBookmark,
  type OutlineSource,
} from "./outline"
import { pictureLayout, type PictureMargin, type PicturePage } from "./picture"
import {
  applyMatrix,
  fitToSheet,
  FOOTER_SIZE,
  footerLayout,
  numberText,
  quarter,
  shownSize as shownSizeOf,
  targetSheet,
  visualMatrix,
  type Box,
  type FooterPlace,
  type Matrix,
  type NumberStyle,
  type SheetChoice,
} from "./print"
import { keepsEntry, namesIn, RESOURCE_KINDS } from "./resources"
import type { ContentsChoice, FormsChoice, LabelsChoice } from "./settings"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

export const UNREADABLE =
  "This file could not be read as a PDF. It may be damaged."
export const NO_PAGES = "This PDF has no pages."
export const PRODUCER = "KeepSimp"

/** A file needs a password that was not given, or the one given was wrong. */
export class PasswordNeeded extends Error {
  constructor(readonly wrong: boolean) {
    super(
      wrong
        ? "That password did not open this file."
        : "This file needs a password."
    )
  }
}

/** A file held open in the engine, ready to give pages. */
export interface OpenedPdf {
  doc: Doc
  /** Every page, made ready to be copied on its own (see `prepare`). */
  pages: Obj[]
  facts: FileFacts
  bookmarks: Bookmark[]
  /** Set for a picture added as a page: the picture itself, to be laid out when merging. */
  picture?: { image: Obj; width: number; height: number; turn: Rotation }
  /** The page number each page shows in a viewer, when the file sets its own. */
  labels?: string[]
}

const nameOf = (object: Obj) => (object.isName() ? object.asName() : "")

/** True when a field, or one beneath it, is a signature that has been signed. */
function isSigned(fields: Obj, depth = 0): boolean {
  if (!fields.isArray() || depth > 8) return false
  for (let index = 0; index < fields.length; index++) {
    const field = fields.get(index)
    if (nameOf(field.get("FT")) === "Sig" && !field.get("V").isNull())
      return true
    if (isSigned(field.get("Kids"), depth + 1)) return true
  }
  return false
}

type EngineBookmark = NonNullable<ReturnType<Doc["loadOutline"]>>[number]

const toBookmarks = (items: EngineBookmark[] | null | undefined): Bookmark[] =>
  (items ?? []).map((item) => ({
    title: item.title ?? "",
    uri: item.uri,
    // The engine gives -1 for a bookmark that leads outside the file.
    page: typeof item.page === "number" && item.page >= 0 ? item.page : null,
    open: Boolean(item.open),
    children: toBookmarks(item.down),
  }))

/** Page settings a page may leave to the tree above it. */
const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"]

/**
 * Make each page of a file able to stand alone, so that copying one page
 * never drags the rest of the file along:
 * - settings a page inherits from the page tree are written on the page;
 * - links by name are given the place the name stands for;
 * - the page forgets its parent, article threads and tag numbers.
 * The file is only ever read from memory, so nothing on disk changes.
 */
function prepare(doc: Doc, count: number) {
  const root = doc.getTrailer().get("Root")
  // The engine cannot load a name tree that is not there.
  const named = root.get("Names", "Dests").isNull()
    ? {}
    : doc.loadNameTree("Dests")
  const legacy = root.get("Dests")
  const lookUp = (dest: Obj): Obj | null => {
    if (!dest.isString() && !dest.isName()) return null
    const name = dest.isString() ? dest.asString() : dest.asName()
    let found: Obj | undefined = named[name]
    if (!found && legacy.isDictionary()) found = legacy.get(name)
    if (!found || found.isNull()) return null
    return found.isDictionary() ? found.get("D") : found
  }
  const pages: Obj[] = []
  for (let index = 0; index < count; index++) pages.push(doc.findPage(index))
  for (const page of pages) {
    for (const key of INHERITED)
      if (page.get(key).isNull()) {
        const value = page.getInheritable(key)
        if (!value.isNull()) page.put(key, value)
      }
    const annotations = page.get("Annots")
    if (!annotations.isArray()) continue
    for (let index = 0; index < annotations.length; index++) {
      const annotation = annotations.get(index)
      if (!annotation.isDictionary()) continue
      annotation.delete("StructParent")
      const direct = lookUp(annotation.get("Dest"))
      if (direct) annotation.put("Dest", direct)
      const action = annotation.get("A")
      if (action.isDictionary() && nameOf(action.get("S")) === "GoTo") {
        const target = lookUp(action.get("D"))
        if (target) action.put("D", target)
      }
    }
  }
  for (const page of pages) {
    page.delete("Parent")
    page.delete("B")
    page.delete("StructParents")
  }
  return pages
}

/**
 * Open a PDF from its bytes.
 * @throws PasswordNeeded when it is locked and the password is missing or wrong.
 * @throws Error with a message for the page when it cannot be read.
 */
export function openPdf(
  mupdf: Engine,
  bytes: Uint8Array,
  password?: string
): OpenedPdf {
  let doc: Doc
  try {
    doc = new mupdf.PDFDocument(bytes)
  } catch {
    throw new Error(UNREADABLE)
  }
  try {
    const unlocked = doc.needsPassword()
    if (unlocked) {
      if (password === undefined) throw new PasswordNeeded(false)
      if (!doc.authenticatePassword(password)) throw new PasswordNeeded(true)
    }
    const count = doc.countPages()
    if (count < 1) throw new Error(NO_PAGES)
    const first = doc.loadPage(0)
    const [left, top, right, bottom] = first.getBounds()
    first.destroy()
    const trailer = doc.getTrailer()
    const root = trailer.get("Root")
    // A path is read in one call: asking a missing object for a key fails.
    const fields = root.get("AcroForm", "Fields")
    const marked = root.get("MarkInfo", "Marked")
    const flags = root.get("AcroForm", "SigFlags")
    const encrypted = !trailer.get("Encrypt").isNull()
    const bookmarks = toBookmarks(doc.loadOutline())
    const facts: FileFacts = {
      pages: count,
      width: right - left,
      height: bottom - top,
      title: doc.getMetaData("info:Title") ?? "",
      bookmarks: countBookmarks(bookmarks),
      repaired: doc.wasRepaired(),
      unlocked,
      restricted:
        encrypted &&
        !doc.hasPermission("assemble") &&
        !doc.hasPermission("edit"),
      signed:
        (flags.isNumber() && (flags.asNumber() & 1) === 1) || isSigned(fields),
      tagged: marked.isBoolean() && marked.asBoolean(),
      forms: fields.isArray() && fields.length > 0,
      attachments: Object.keys(doc.getEmbeddedFiles()).length,
      author: doc.getMetaData("info:Author") || undefined,
      subject: doc.getMetaData("info:Subject") || undefined,
      keywords: doc.getMetaData("info:Keywords") || undefined,
    }
    // Only a file that numbers its own pages is asked for every page's label.
    let labels: string[] | undefined
    if (!root.get("PageLabels").isNull()) {
      labels = []
      for (let index = 0; index < count; index++) {
        const page = doc.loadPage(index)
        labels.push(page.getLabel())
        page.destroy()
      }
    }
    return { doc, pages: prepare(doc, count), facts, bookmarks, labels }
  } catch (error) {
    doc.destroy()
    if (error instanceof PasswordNeeded) throw error
    throw new Error(
      error instanceof Error && error.message === NO_PAGES
        ? NO_PAGES
        : UNREADABLE
    )
  }
}

export function closePdf(opened: OpenedPdf) {
  opened.doc.destroy()
}

const drawPicture = (matrix: readonly number[]) =>
  `q ${matrix.join(" ")} cm /Im0 Do Q`

/** A page that shows one picture, which is already an object of `doc`. */
function picturePage(
  doc: Doc,
  image: Obj,
  layout: ReturnType<typeof pictureLayout>
) {
  const pictures = doc.newDictionary()
  pictures.put("Im0", image)
  const resources = doc.newDictionary()
  resources.put("XObject", pictures)
  return doc.addPage(
    [0, 0, layout.page.width, layout.page.height],
    0,
    resources,
    drawPicture(layout.matrix)
  )
}

/**
 * Open a picture as a one-page file. A JPEG is kept as it is, without being
 * compressed again; anything else arrives as pixels, and see-through parts
 * are filled with white, as paper is.
 * @param input A JPEG's bytes with the turn its EXIF data asks for, or decoded pixels.
 */
export function openPicture(
  mupdf: Engine,
  input: { jpeg: Uint8Array; turn: Rotation } | { pixels: Pixels }
): OpenedPdf {
  const doc = new mupdf.PDFDocument()
  try {
    let image: MuPDF.Image
    if ("jpeg" in input) image = new mupdf.Image(input.jpeg)
    else {
      const { data, width, height } = input.pixels
      const pixmap = new mupdf.Pixmap(
        mupdf.ColorSpace.DeviceRGB,
        [0, 0, width, height],
        false
      )
      const stride = pixmap.getStride()
      const target = pixmap.getPixels()
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const from = (y * width + x) * 4
          const to = y * stride + x * 3
          const alpha = data[from + 3] / 255
          target[to] = data[from] * alpha + 255 * (1 - alpha)
          target[to + 1] = data[from + 1] * alpha + 255 * (1 - alpha)
          target[to + 2] = data[from + 2] * alpha + 255 * (1 - alpha)
        }
      image = new mupdf.Image(pixmap)
      pixmap.destroy()
    }
    const size = { width: image.getWidth(), height: image.getHeight() }
    const turn = "jpeg" in input ? input.turn : 0
    const stored = doc.addImage(image)
    image.destroy()
    // The file's one page shows the picture at its own size, for thumbnails.
    const layout = pictureLayout(size, turn, "fit", "none", null)
    doc.insertPage(-1, picturePage(doc, stored, layout))
    return {
      doc,
      pages: prepare(doc, 1),
      facts: {
        pages: 1,
        ...layout.page,
        title: "",
        bookmarks: 0,
        repaired: false,
        unlocked: false,
        restricted: false,
        signed: false,
        tagged: false,
        forms: false,
        picture:
          turn === 90 || turn === 270
            ? { width: size.height, height: size.width }
            : size,
      },
      bookmarks: [],
      picture: { image: stored, ...size, turn },
    }
  } catch {
    doc.destroy()
    throw new Error("This picture could not be read. It may be damaged.")
  }
}

/** One page as a picture, at most `maxEdge` pixels on its longer side. */
export function renderPage(
  mupdf: Engine,
  opened: OpenedPdf,
  index: number,
  maxEdge: number
) {
  const page = opened.doc.loadPage(index)
  try {
    const [left, top, right, bottom] = page.getBounds()
    const scale = maxEdge / Math.max(right - left, bottom - top, 1)
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true
    )
    try {
      const width = pixmap.getWidth()
      const height = pixmap.getHeight()
      const stride = pixmap.getStride()
      const rgb = pixmap.getPixels()
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const from = y * stride + x * 3
          const to = (y * width + x) * 4
          data[to] = rgb[from]
          data[to + 1] = rgb[from + 1]
          data[to + 2] = rgb[from + 2]
          data[to + 3] = 255
        }
      return { data, width, height }
    } finally {
      pixmap.destroy()
    }
  } finally {
    page.destroy()
  }
}

/** A file that pages are taken from. */
export interface MergeSource {
  pdf: OpenedPdf
  /** What the file is called in the result's bookmarks. */
  name: string
}

/** One page of the result. */
export type MergePage =
  | {
      /** Which source it comes from, by its key. */
      source: string
      /** Its page there, counted from 0. */
      index: number
      /** A turn added to the page's own. */
      rotation: Rotation
    }
  | { blank: Size }

/** What to take from one opened file, for callers that think in files. */
export interface MergeInput extends MergeSource {
  /** Pages counted from 0, in order; a page may repeat. */
  pages: readonly number[]
  rotation: Rotation
}

export interface MergeOptions {
  bookmarks: BookmarkPolicy
  /** How large a page a picture gets, and the space around it. */
  picturePage?: PicturePage
  pictureMargin?: PictureMargin
  /** A contents page at the front, and whether the first file is a cover that stays ahead of it. */
  contents?: ContentsChoice
  cover?: boolean
  forms?: FormsChoice
  labels?: LabelsChoice
  /** Carry attached files over; on unless turned off. */
  attachments?: boolean
  details?: { title: string; author: string; subject: string; keywords: string }
  /** Lock the result: the password to open it, a second one that lifts the limits, and the limits. */
  lock?: { password: string; ownerPassword: string; permissions: number }
  /** Getting the result ready for paper. */
  print?: {
    /** Keep contents pages to a whole sheet, so the first file starts on a front. */
    duplex: boolean
    sheet: SheetChoice
    /** Whether pages smaller than the sheet are made larger. */
    enlarge: boolean
    /** Write each page's file name at its foot. */
    footerName: boolean
    numbers: NumberStyle
    numbersAt: FooterPlace
    numbersFrom: number
  }
  /**
   * Draw text the built-in font has no letters for, as a picture `height`
   * points tall. Without it, such letters are written as "?".
   */
  textPicture?: (text: string, height: number) => Pixels | null
  /**
   * A last word on the pages before anything is built around them: called
   * once every page is in place, with the pages in order. Each page still has
   * its whole box here, also where two pages share one page's content.
   */
  adjust?: (out: MuPDF.PDFDocument, pages: readonly MuPDF.PDFObject[]) => void
  /** Called between pages; it may pause, or throw to stop the merge. */
  checkpoint?: () => Promise<void>
  progress?: (done: number, total: number) => void
  /** The time written into the result; now, unless a test fixes it. */
  now?: Date
}

export interface Merged {
  bytes: Uint8Array
  pages: number
  bookmarks: number
}

/**
 * A second copy of a page already in the result. It shares the first copy's
 * content; notes and links are copied so each belongs to its own page. Form
 * fields stay on the first copy only, since a field has one place.
 */
function duplicatePage(out: Doc, page: Obj) {
  const copy = out.addObject(out.newDictionary())
  const annotations = out.newArray()
  page.forEach((value, key) => {
    if (key === "Parent") return
    if (key !== "Annots") {
      copy.put(key as string, value)
      return
    }
    value.forEach((annotation) => {
      const kind = nameOf(annotation.get("Subtype"))
      if (kind === "Widget" || kind === "Popup") return
      const twin = out.addObject(out.newDictionary())
      annotation.forEach((entry, name) => {
        if (name !== "P" && name !== "Popup" && name !== "IRT")
          twin.put(name as string, entry)
      })
      twin.put("P", copy)
      annotations.push(twin)
    })
  })
  if (annotations.length) copy.put("Annots", annotations)
  return copy
}

/** Add the names in a stream's drawing commands to `names`. Throws when the stream cannot be read. */
function readNames(stream: Obj, names: Set<string>) {
  const buffer = stream.readStream()
  try {
    namesIn(buffer.asUint8Array(), names)
  } finally {
    buffer.destroy()
  }
}

/** True for something drawn with commands of its own that names no resources of its own, and so uses the page's. */
const leansOnPage = (kind: string, entry: Obj) => {
  if (!entry.isDictionary() || !entry.get("Resources").isNull()) return false
  if (kind === "XObject") return nameOf(entry.get("Subtype")) === "Form"
  if (kind === "Font") return nameOf(entry.get("Subtype")) === "Type3"
  // A tiling pattern is a stream; a shading pattern has no commands.
  return kind === "Pattern" && entry.isStream()
}

/**
 * Give pages taken out of a larger file only the fonts, pictures and other
 * resources their own content names. Many files hand every page one shared
 * list of everything in the file; without this, a single copied page would
 * bring every picture of the file with it.
 *
 * Nothing is dropped unless it is certain the page does without it: a page
 * whose content cannot be read, or that draws something which leans on the
 * page's resources in turn, is left as it is.
 */
function trimResources(out: Doc, pages: readonly Obj[]) {
  /** Trimmed lists already made, so pages that shared a list still share one. */
  const made = new Map<string, Obj>()
  pages.forEach((page, at) => {
    const resources = page.get("Resources")
    if (!resources.isDictionary()) return
    const names = new Set<string>()
    try {
      const contents = page.get("Contents")
      if (contents.isArray())
        for (let index = 0; index < contents.length; index++)
          readNames(contents.get(index), names)
      else if (contents.isStream()) readNames(contents, names)
      // A note or field drawn without resources of its own may fall back on the page's.
      const annotations = page.get("Annots")
      if (annotations.isArray())
        for (let index = 0; index < annotations.length; index++) {
          const looks = annotations.get(index).get("AP")
          if (!looks.isDictionary()) continue
          looks.forEach((look) => {
            const drawn: Obj[] = []
            if (look.isStream()) drawn.push(look)
            else if (look.isDictionary())
              look.forEach((state) => {
                if (state.isStream()) drawn.push(state)
              })
            for (const stream of drawn)
              if (stream.get("Resources").isNull()) readNames(stream, names)
          })
        }
    } catch {
      return
    }
    const kept = new Map<string, string[]>()
    let dropped = 0
    let leaning = false
    for (const kind of RESOURCE_KINDS) {
      const list = resources.get(kind)
      if (!list.isDictionary()) continue
      const keys: string[] = []
      list.forEach((entry, key) => {
        if (!keepsEntry(String(key), names)) {
          dropped++
          return
        }
        keys.push(String(key))
        if (leansOnPage(kind, entry)) leaning = true
      })
      kept.set(kind, keys)
    }
    if (!dropped || leaning) return
    const origin = resources.isIndirect()
      ? `object ${resources.asIndirect()}`
      : `page ${at}`
    const key = `${origin}|${JSON.stringify([...kept])}`
    let trimmed = made.get(key)
    if (!trimmed) {
      const next = out.newDictionary()
      resources.forEach((value, name) => {
        const keys = kept.get(String(name))
        if (!keys) {
          next.put(String(name), value)
          return
        }
        const list = out.newDictionary()
        for (const entry of keys) list.put(entry, value.get(entry))
        next.put(String(name), list)
      })
      trimmed = out.addObject(next)
      made.set(key, trimmed)
    }
    page.put("Resources", trimmed)
  })
}

/** Call `visit` with every annotation on the pages, last to first, so one can be removed. */
function eachAnnotation(
  pages: readonly Obj[],
  visit: (annotation: Obj, remove: () => void) => void
) {
  for (const page of pages) {
    const annotations = page.get("Annots")
    if (!annotations.isArray()) continue
    for (let index = annotations.length - 1; index >= 0; index--)
      visit(annotations.get(index), () => annotations.delete(index))
  }
}

/** Remove links that lead to pages which are not in the result. */
function dropDeadLinks(pages: readonly Obj[]) {
  const live = new Set(pages.map((page) => page.asIndirect()))
  eachAnnotation(pages, (annotation, remove) => {
    if (nameOf(annotation.get("Subtype")) !== "Link") return
    let target = annotation.get("Dest")
    if (target.isNull()) {
      const action = annotation.get("A")
      if (action.isDictionary() && nameOf(action.get("S")) === "GoTo")
        target = action.get("D")
    }
    if (!target.isArray() || !target.length) return
    const page = target.get(0)
    if (page.isIndirect() && !live.has(page.asIndirect())) remove()
  })
}

/** Keys that make an annotation a signature field rather than a picture. */
const FIELD_KEYS = ["FT", "V", "Parent", "T", "TU", "TM", "Ff", "DA", "MK"]

/**
 * A signature cannot stay valid in a merged file. What it looks like is kept
 * as a stamp; the field behind it is removed so no viewer reports a broken
 * signature.
 */
function signaturesToStamps(out: Doc, pages: readonly Obj[]) {
  eachAnnotation(pages, (annotation, remove) => {
    if (nameOf(annotation.get("Subtype")) !== "Widget") return
    if (nameOf(annotation.getInheritable("FT")) !== "Sig") return
    if (annotation.get("AP", "N").isNull()) {
      remove()
      return
    }
    for (const key of [...FIELD_KEYS, "Lock", "SV", "AA", "A"])
      annotation.delete(key)
    annotation.put("Subtype", out.newName("Stamp"))
  })
}

/**
 * Carry fillable fields into the result. Each file's fields are copied whole,
 * then cut back to the ones that sit on a page of the result. A field whose
 * name is already taken by an earlier file gets the file's number added.
 */
function buildForm(
  out: Doc,
  grafts: { map: MuPDF.PDFGraftMap; input: MergeSource }[],
  pages: readonly Obj[],
  join: boolean
) {
  const live = new Set<number>()
  eachAnnotation(pages, (annotation) => {
    if (annotation.isIndirect()) live.add(annotation.asIndirect())
  })
  const keep = (field: Obj): boolean => {
    const kids = field.get("Kids")
    if (kids.isArray()) {
      for (let index = kids.length - 1; index >= 0; index--)
        if (!keep(kids.get(index))) kids.delete(index)
      return kids.length > 0
    }
    return (
      nameOf(field.get("Subtype")) === "Widget" &&
      field.isIndirect() &&
      live.has(field.asIndirect())
    )
  }
  const fields = out.newArray()
  const fonts = out.newDictionary()
  const resources = out.newDictionary()
  /** Field names in use, and where each field sits in the list. */
  const taken = new Map<string, number>()
  let appearance: Obj | null = null
  let redraw = false

  /** The places a field is drawn: its kids when they are all that, or itself. */
  const widgetsOf = (field: Obj): Obj[] | null => {
    const kids = field.get("Kids")
    if (!kids.isArray())
      return nameOf(field.get("Subtype")) === "Widget" ? [field] : null
    const widgets: Obj[] = []
    for (let index = 0; index < kids.length; index++) {
      const kid = kids.get(index)
      // A kid with a name of its own is a field, not a place one is drawn.
      if (!kid.get("T").isNull()) return null
      widgets.push(kid)
    }
    return widgets
  }
  /** Make a field that is also its own single widget into a field with one kid. */
  const split = (field: Obj) => {
    if (field.get("Kids").isArray()) return field
    const parent = out.addObject(out.newDictionary())
    for (const key of FIELD_KEYS.filter((name) => name !== "Parent")) {
      const value = field.get(key)
      if (value.isNull() || key === "MK") continue
      parent.put(key, value)
      field.delete(key)
    }
    const kids = out.newArray()
    kids.push(field)
    parent.put("Kids", kids)
    field.put("Parent", parent)
    return parent
  }
  grafts.forEach(({ map, input }, fileIndex) => {
    const root = input.pdf.doc.getTrailer().get("Root")
    const own = root.get("AcroForm", "Fields")
    if (!own.isArray()) return
    for (let index = 0; index < own.length; index++) {
      const field = map.graftObject(own.get(index))
      // A signature's field was removed above; only its picture remains.
      if (nameOf(field.get("FT")) === "Sig" || !keep(field)) continue
      const title = field.get("T")
      const name = title.isString() ? title.asString() : ""
      const earlier = taken.get(name)
      if (join && earlier !== undefined) {
        const first = fields.get(earlier)
        const places = widgetsOf(field)
        // Only fields of the same kind, each drawn in plain places, can become one.
        if (
          places &&
          widgetsOf(first) &&
          nameOf(first.get("FT")) === nameOf(field.get("FT"))
        ) {
          const parent = split(first)
          fields.put(earlier, parent)
          for (const place of places) {
            for (const key of FIELD_KEYS) if (key !== "MK") place.delete(key)
            place.put("Parent", parent)
            parent.get("Kids").push(place)
          }
          // The joined places still show their old entries until redrawn.
          redraw = true
          continue
        }
      }
      let unique = name
      for (let extra = fileIndex + 1; taken.has(unique); extra++)
        unique = `${name}_${extra}`
      if (unique !== name) field.put("T", out.newString(unique))
      taken.set(unique, fields.length)
      fields.push(field)
    }
    const shared = root.get("AcroForm", "DR")
    if (shared.isDictionary())
      map.graftObject(shared).forEach((value, key) => {
        if (key !== "Font") {
          if (resources.get(key as string).isNull())
            resources.put(key as string, value)
        } else
          value.forEach((font, fontName) => {
            if (fonts.get(fontName as string).isNull())
              fonts.put(fontName as string, font)
          })
      })
    const look = root.get("AcroForm", "DA")
    if (!appearance && look.isString()) appearance = map.graftObject(look)
    const again = root.get("AcroForm", "NeedAppearances")
    if (again.isBoolean() && again.asBoolean()) redraw = true
  })
  if (!fields.length) return false
  const form = out.newDictionary()
  form.put("Fields", fields)
  if (fonts.length) resources.put("Font", fonts)
  if (resources.length) form.put("DR", resources)
  if (appearance) form.put("DA", appearance)
  if (redraw) form.put("NeedAppearances", true)
  out.getTrailer().get("Root").put("AcroForm", out.addObject(form))
  return true
}

/**
 * Carry layers into the result, with each one shown or hidden as its own file
 * had it. Without this, every hidden layer would become visible.
 */
function buildLayers(
  out: Doc,
  grafts: { map: MuPDF.PDFGraftMap; input: MergeSource }[]
) {
  const layers = out.newArray()
  const hidden = out.newArray()
  const order = out.newArray()
  const locked = out.newArray()
  const groups = out.newArray()
  const automatic = out.newArray()
  const withLayers = grafts.filter(({ input }) =>
    input.pdf.doc.getTrailer().get("Root", "OCProperties", "OCGs").isArray()
  )
  for (const { map, input } of withLayers) {
    const properties = input.pdf.doc.getTrailer().get("Root", "OCProperties")
    const all = properties.get("OCGs")
    const numbers = (list: Obj) => {
      const found = new Set<number>()
      if (list.isArray())
        list.forEach((item) => {
          if (item.isIndirect()) found.add(item.asIndirect())
        })
      return found
    }
    const allOff = nameOf(properties.get("D", "BaseState")) === "OFF"
    const on = numbers(properties.get("D", "ON"))
    const off = numbers(properties.get("D", "OFF"))
    for (let index = 0; index < all.length; index++) {
      const layer = all.get(index)
      if (!layer.isIndirect()) continue
      const copy = map.graftObject(layer)
      layers.push(copy)
      const number = layer.asIndirect()
      if (allOff ? !on.has(number) : off.has(number)) hidden.push(copy)
    }
    const append = (key: string, to: Obj) => {
      const list = properties.get("D", key)
      if (list.isArray())
        map.graftObject(list).forEach((item) => void to.push(item))
    }
    const listed = properties.get("D", "Order")
    if (listed.isArray()) {
      // With several files, each file's layers sit under its name.
      if (withLayers.length > 1) {
        const group = out.newArray()
        group.push(out.newString(input.name))
        map.graftObject(listed).forEach((item) => void group.push(item))
        order.push(group)
      } else append("Order", order)
    }
    append("Locked", locked)
    append("RBGroups", groups)
    append("AS", automatic)
  }
  if (!layers.length) return
  const settings = out.newDictionary()
  if (hidden.length) settings.put("OFF", hidden)
  if (order.length) settings.put("Order", order)
  if (locked.length) settings.put("Locked", locked)
  if (groups.length) settings.put("RBGroups", groups)
  if (automatic.length) settings.put("AS", automatic)
  const properties = out.newDictionary()
  properties.put("OCGs", layers)
  properties.put("D", settings)
  out.getTrailer().get("Root").put("OCProperties", out.addObject(properties))
}

/** Carry files attached to the PDFs into the result; a name already taken gets a number. */
function carryAttachments(
  out: Doc,
  grafts: { map: MuPDF.PDFGraftMap; input: MergeSource }[]
) {
  const taken = new Set<string>()
  for (const { map, input } of grafts) {
    if (input.pdf.picture) continue
    for (const [name, file] of Object.entries(
      input.pdf.doc.getEmbeddedFiles()
    )) {
      let unique = name
      const dot = name.lastIndexOf(".")
      for (let extra = 2; taken.has(unique); extra++)
        unique =
          dot > 0
            ? `${name.slice(0, dot)} (${extra})${name.slice(dot)}`
            : `${name} (${extra})`
      taken.add(unique)
      out.insertEmbeddedFile(unique, map.graftObject(file))
    }
  }
}

interface TakenFile {
  source: MergeSource
  first: number
}

/** A drawn line stands a little taller than the letters, to hold their tails. */
const TALL = 1.4

/**
 * Writes text onto pages of the result, for contents pages and footers.
 * Western text uses the Helvetica every reader has, named and not carried.
 * Greek and Cyrillic use the engine's own, which travels with the file and
 * is only added when needed. Anything else is drawn as a picture where a way
 * to draw one was given, and written as "?" where not.
 */
function createWriter(
  mupdf: Engine,
  out: Doc,
  textPicture: MergeOptions["textPicture"]
) {
  // Measuring uses the engine's Helvetica, which has the standard one's widths.
  const font = new mupdf.Font("Helvetica")
  const standard = out.addObject(out.newDictionary())
  standard.put("Type", out.newName("Font"))
  standard.put("Subtype", out.newName("Type1"))
  standard.put("BaseFont", out.newName("Helvetica"))
  standard.put("Encoding", out.newName("WinAnsiEncoding"))
  let carried: Obj | null = null
  const glyphs = (text: string) =>
    [...text].map((letter) => font.encodeCharacter(letter.codePointAt(0)!))
  const writable = (text: string) => glyphs(text).every((glyph) => glyph > 0)
  /** Pictures of lines the font cannot write, by their text. */
  const drawn = new Map<string, { name: string; object: Obj; ratio: number }>()
  const pictureOf = (text: string) => {
    if (writable(text) || !textPicture) return null
    let picture = drawn.get(text)
    if (!picture) {
      const pixels = textPicture(text, 64)
      if (!pixels) return null
      const pixmap = new mupdf.Pixmap(
        mupdf.ColorSpace.DeviceRGB,
        [0, 0, pixels.width, pixels.height],
        false
      )
      const stride = pixmap.getStride()
      const target = pixmap.getPixels()
      for (let y = 0; y < pixels.height; y++)
        for (let x = 0; x < pixels.width; x++) {
          const from = (y * pixels.width + x) * 4
          const alpha = pixels.data[from + 3] / 255
          for (let channel = 0; channel < 3; channel++)
            target[y * stride + x * 3 + channel] =
              pixels.data[from + channel] * alpha + 255 * (1 - alpha)
        }
      const image = new mupdf.Image(pixmap)
      pixmap.destroy()
      picture = {
        name: `KsT${drawn.size}`,
        object: out.addImage(image),
        ratio: pixels.width / pixels.height,
      }
      image.destroy()
      drawn.set(text, picture)
    }
    return picture
  }
  const question = font.encodeCharacter(63)
  return {
    /** The width of some text at a size, in points. */
    measure(text: string, textSize: number) {
      const picture = pictureOf(text)
      if (picture) return picture.ratio * textSize * TALL
      return (
        glyphs(text).reduce((sum, glyph) => sum + font.advanceGlyph(glyph), 0) *
        textSize
      )
    },
    /** The command that draws some text with its foot at a point. */
    show(text: string, textSize: number, x: number, y: number) {
      const picture = pictureOf(text)
      if (picture) {
        const height = textSize * TALL
        return `q ${picture.ratio * height} 0 0 ${height} ${x} ${y - textSize * 0.3} cm /${picture.name} Do Q`
      }
      const western = winAnsiHex(text)
      if (western !== null) return showGlyphs("KsF0", western, textSize, x, y)
      carried ??= out.addFont(font)
      return showGlyphs(
        "KsF1",
        glyphs(text)
          .map((glyph) => (glyph || question).toString(16).padStart(4, "0"))
          .join(""),
        textSize,
        x,
        y
      )
    },
    /** Give a page what the commands written so far need: the fonts and any pictures. */
    attach(page: Obj) {
      const ensure = (holder: Obj, key: string) => {
        if (!holder.get(key).isDictionary())
          holder.put(key, out.newDictionary())
        return holder.get(key)
      }
      const resources = ensure(page, "Resources")
      const fonts = ensure(resources, "Font")
      fonts.put("KsF0", standard)
      if (carried) fonts.put("KsF1", carried)
      if (drawn.size) {
        const pictures = ensure(resources, "XObject")
        for (const picture of drawn.values())
          pictures.put(picture.name, picture.object)
      }
    },
    destroy: () => font.destroy(),
  }
}

type Writer = ReturnType<typeof createWriter>

/**
 * Add contents pages: one line per file, with the page it starts on, each a
 * link to that page. They go at the front, or after the first file when it is
 * a cover, which then has no line of its own. For double-sided printing an
 * odd number of contents pages is followed by a blank one.
 * @returns Where the added pages start, how many there are, and how many of them are contents.
 */
function addContents(
  out: Doc,
  writer: Writer,
  pages: readonly Obj[],
  files: readonly TakenFile[],
  options: MergeOptions
) {
  const choice = options.contents ?? "none"
  const listed = options.cover ? files.slice(1) : files
  if (choice === "none" || !listed.length) return { at: 0, count: 0, own: 0 }
  // A cover is the first file's pages for as long as they come first.
  const at = options.cover && files.length ? listed[0].first : 0
  const size = shownSize(pages[0])
  const own = contentsPageCount(listed.length, size)
  const count = own + (options.print?.duplex && own % 2 ? 1 : 0)
  const entries = listed.map((file) => ({
    title:
      (choice === "titles" && file.source.pdf.facts.title.trim()) ||
      file.source.name,
    page: file.first + (file.first >= at ? count : 0) + 1,
  }))
  const layouts = layoutContents(entries, size, writer.measure)
  const sheet = (content: string) =>
    out.addPage(
      [0, 0, size.width, size.height],
      0,
      out.newDictionary(),
      content
    )
  layouts.forEach((layout, index) => {
    const page = sheet(drawContents(layout, writer.show))
    writer.attach(page)
    out.insertPage(at + index, page)
  })
  if (count > own) out.insertPage(at + own, sheet(""))
  // Links are made once every contents page is in, so page numbers are final.
  layouts.forEach((layout, index) => {
    const page = out.loadPage(at + index)
    for (const line of layout.lines) {
      const [left, bottom, right, top] = line.area
      // Links are placed from the top of the page, text from the bottom.
      page.createLink(
        [left, size.height - top, right, size.height - bottom],
        `#page=${line.target + 1}`
      )
    }
    page.destroy()
  })
  return { at, count, own }
}

/** A page's box as the file stores it: the part that is shown, or the whole sheet. */
export function boxOf(page: Obj): Box {
  let box = page.get("CropBox")
  if (!box.isArray()) box = page.get("MediaBox")
  return [0, 1, 2, 3].map((at) =>
    box.isArray() && box.get(at).isNumber() ? box.get(at).asNumber() : 0
  ) as Box
}

export const turnOf = (page: Obj) => {
  const turn = page.get("Rotate")
  return turn.isNumber() ? turn.asNumber() : 0
}

/**
 * Put commands around a page's own content: `before` first, then the page
 * inside a saved state, then `after`. The page's content is not changed, so
 * pages that share it are not affected.
 */
function wrapContent(out: Doc, page: Obj, before: string, after: string) {
  const stream = (text: string) => out.addStream(text, out.newDictionary())
  const wrapped = out.newArray()
  wrapped.push(stream(`${before}\nq\n`))
  const own = page.get("Contents")
  if (own.isArray()) own.forEach((part) => void wrapped.push(part))
  else if (!own.isNull()) wrapped.push(own)
  wrapped.push(stream(`\nQ\n${after}\n`))
  page.put("Contents", wrapped)
}

/** Keys of an annotation that hold points on the page, as flat lists of x and y. */
const POINT_LISTS = ["QuadPoints", "Vertices", "L", "CL"]

/** Move a flat list of x, y pairs through a matrix, in place. */
function movePoints(out: Doc, list: Obj, matrix: Matrix) {
  for (let at = 0; at + 1 < list.length; at += 2) {
    const [x, y] = applyMatrix(
      matrix,
      list.get(at).asNumber(),
      list.get(at + 1).asNumber()
    )
    list.put(at, out.newReal(x))
    list.put(at + 1, out.newReal(y))
  }
}

/** Make a page the size of the sheet: its content, links, notes and fields move and scale with it. */
function fitPage(out: Doc, page: Obj, sheet: Size, enlarge: boolean) {
  const fit = fitToSheet(boxOf(page), turnOf(page), sheet, enlarge)
  if (!fit) return
  wrapContent(out, page, `q ${fit.matrix.join(" ")} cm`, "Q")
  const box = out.newArray()
  for (const value of fit.box) box.push(out.newReal(value))
  page.put("MediaBox", box)
  for (const key of ["CropBox", "BleedBox", "TrimBox", "ArtBox"])
    page.delete(key)
  eachAnnotation([page], (annotation) => {
    const rect = annotation.get("Rect")
    if (rect.isArray() && rect.length === 4) {
      const [x0, y0] = applyMatrix(
        fit.matrix,
        rect.get(0).asNumber(),
        rect.get(1).asNumber()
      )
      const [x1, y1] = applyMatrix(
        fit.matrix,
        rect.get(2).asNumber(),
        rect.get(3).asNumber()
      )
      const moved = out.newArray()
      for (const value of [x0, y0, x1, y1]) moved.push(out.newReal(value))
      annotation.put("Rect", moved)
    }
    for (const key of POINT_LISTS) {
      const list = annotation.get(key)
      if (list.isArray()) movePoints(out, list, fit.matrix)
    }
    const strokes = annotation.get("InkList")
    if (strokes.isArray())
      strokes.forEach((stroke) => {
        if (stroke.isArray()) movePoints(out, stroke, fit.matrix)
      })
  })
}

/** Write a file name, a page number, or both at the foot of a page, the right way up for its reader. */
function addFooter(
  out: Doc,
  writer: Writer,
  page: Obj,
  name: string,
  number: string,
  place: FooterPlace
) {
  const box = boxOf(page)
  const turn = turnOf(page)
  const texts = footerLayout(
    shownSizeOf(box, turn),
    name,
    number,
    place,
    (text) => writer.measure(text, FOOTER_SIZE)
  )
  if (!texts.length) return
  const commands = texts.map((text) =>
    writer.show(text.text, FOOTER_SIZE, text.x, text.y)
  )
  wrapContent(
    out,
    page,
    "",
    `q ${visualMatrix(box, turn).join(" ")} cm 0.3 g\n${commands.join("\n")}\nQ`
  )
  writer.attach(page)
}

function writeBookmarks(out: Doc, bookmarks: readonly MergedBookmark[]) {
  const iterator = out.outlineIterator()
  const write = (items: readonly MergedBookmark[]) => {
    for (const item of items) {
      // Inserting leaves the position after the new entry.
      iterator.insert({ title: item.title, uri: item.uri, open: item.open })
      if (!item.children.length) continue
      iterator.prev()
      iterator.down()
      write(item.children)
      iterator.up()
      iterator.next()
    }
  }
  write(bookmarks)
}

const pdfDate = (date: Date) =>
  `D:${date.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`

/** The size a page of the result is shown at, in points. */
function shownSize(page: Obj): Size {
  let box = page.get("CropBox")
  if (!box.isArray()) box = page.get("MediaBox")
  const [left, bottom, right, top] = [0, 1, 2, 3].map((at) =>
    box.isArray() && box.get(at).isNumber() ? box.get(at).asNumber() : 0
  )
  const size = { width: Math.abs(right - left), height: Math.abs(top - bottom) }
  const turn = page.get("Rotate")
  const sideways = turn.isNumber() && quarter(turn.asNumber()) % 180 === 90
  return sideways ? { width: size.height, height: size.width } : size
}

/**
 * Build one new PDF from pages of opened files, in the order given. The
 * files are left as they were. Pages of one file share what the file shares,
 * wherever they end up, and its links find them there.
 */
export async function mergePages(
  mupdf: Engine,
  sources: ReadonlyMap<string, MergeSource>,
  wanted: readonly MergePage[],
  options: MergeOptions
): Promise<Merged> {
  const total = wanted.length
  if (!total) throw new Error("Choose at least one page to merge.")
  const out = new mupdf.PDFDocument()
  try {
    const pages: Obj[] = []
    /** What has been taken from each file so far, in order of first use. */
    const taken = new Map<
      string,
      {
        source: MergeSource
        map: MuPDF.PDFGraftMap
        /** The first copy of each page, and the turn the page itself had. */
        copies: Map<number, { page: Obj; own: number }>
        placed: Map<number, number>
        first: number
        picture: Obj | null
        /** Its pages in the result, when only some of the file's pages were taken. */
        partial?: Obj[]
      }
    >()
    /** The size of the last page that is not a picture, for pictures to take. */
    let previous: Size | null = null
    for (const want of wanted) {
      await options.checkpoint?.()
      let page: Obj
      if ("blank" in want)
        page = out.addPage(
          [0, 0, want.blank.width, want.blank.height],
          0,
          out.newDictionary(),
          ""
        )
      else {
        const source = sources.get(want.source)
        if (!source) throw new Error("A file to merge is no longer open.")
        let file = taken.get(want.source)
        if (!file) {
          file = {
            source,
            map: out.newGraftMap(),
            copies: new Map(),
            placed: new Map(),
            first: pages.length,
            picture: null,
          }
          taken.set(want.source, file)
        }
        const { picture } = source.pdf
        if (picture) {
          // The picture is stored once, however many pages show it.
          file.picture ??= file.map.graftObject(picture.image)
          page = picturePage(
            out,
            file.picture,
            pictureLayout(
              picture,
              picture.turn,
              options.picturePage ?? "previous",
              options.pictureMargin ?? "small",
              previous
            )
          )
          if (want.rotation) page.put("Rotate", want.rotation)
        } else {
          const earlier = file.copies.get(want.index)
          let own: number
          if (earlier) {
            page = duplicatePage(out, earlier.page)
            own = earlier.own
          } else {
            page = file.map.graftObject(source.pdf.pages[want.index])
            const turn = page.get("Rotate")
            own = turn.isNumber() ? turn.asNumber() : 0
            file.copies.set(want.index, { page, own })
          }
          page.put("Rotate", quarter(own + want.rotation))
        }
        if (!file.placed.has(want.index))
          file.placed.set(want.index, pages.length)
      }
      out.insertPage(-1, page)
      if (!("blank" in want) && !sources.get(want.source)?.pdf.picture)
        previous = shownSize(page)
      pages.push(page)
      options.progress?.(pages.length, total)
    }
    const files = [...taken.values()]
    // A file that went in whole keeps its lists as they are; pages taken out of one are trimmed.
    wanted.forEach((want, index) => {
      if ("blank" in want) return
      const file = taken.get(want.source)!
      if (
        !file.source.pdf.picture &&
        file.copies.size < file.source.pdf.pages.length
      )
        (file.partial ??= []).push(pages[index])
    })
    for (const file of files) if (file.partial) trimResources(out, file.partial)
    options.adjust?.(out, pages)
    const grafts = files.map((file) => ({
      map: file.map,
      input: file.source,
    }))
    dropDeadLinks(pages)
    signaturesToStamps(out, pages)
    const forms = options.forms ?? "keep"
    if (forms === "remove")
      eachAnnotation(pages, (annotation, remove) => {
        if (nameOf(annotation.get("Subtype")) === "Widget") remove()
      })
    else if (
      buildForm(out, grafts, pages, forms === "join") &&
      forms === "flatten"
    ) {
      // What is filled in becomes part of the page; the fields themselves go.
      out.bake(false, true)
      out.getTrailer().get("Root").delete("AcroForm")
    }
    buildLayers(out, grafts)
    if (options.attachments !== false) carryAttachments(out, grafts)

    // A contents page shifts every page behind it; from here on, places are final.
    const writer = createWriter(mupdf, out, options.textPicture)
    const contents = addContents(out, writer, pages, files, options)
    const shifted = (index: number) =>
      index >= contents.at ? index + contents.count : index
    const bookmarks = mergeBookmarks(
      files.map((file): OutlineSource => ({
        name: file.source.name,
        bookmarks: file.source.pdf.bookmarks,
        placed: new Map(
          [...file.placed].map(([page, index]) => [page, shifted(index)])
        ),
        first: shifted(file.first),
      })),
      options.bookmarks
    )
    if (contents.count && options.bookmarks !== "none")
      bookmarks.unshift({
        title: CONTENTS_HEADING,
        uri: `#page=${contents.at + 1}`,
        open: false,
        children: [],
      })
    writeBookmarks(out, bookmarks)

    if (options.labels === "keep") {
      // Each page shows the number it had in its own file.
      const own = new Map<number, string>()
      wanted.forEach((want, index) => {
        if ("blank" in want) return
        const pdf = sources.get(want.source)!.pdf
        if (!pdf.picture)
          own.set(
            shifted(index),
            pdf.labels?.[want.index] ?? String(want.index + 1)
          )
      })
      const total = pages.length + contents.count
      for (let index = 0; index < total; index++) {
        const inContents =
          index >= contents.at && index < contents.at + contents.own
        if (inContents)
          // Contents pages count in small Roman numerals, as front matter does.
          out.setPageLabels(index, "r", "", index - contents.at + 1)
        else out.setPageLabels(index, "\0", own.get(index) ?? "", 1)
      }
    }

    const print = options.print
    if (print) {
      const total = pages.length + contents.count
      const final = Array.from({ length: total }, (_, index) =>
        out.findPage(index)
      )
      const sheet = targetSheet(
        print.sheet,
        final.map((page) => shownSizeOf(boxOf(page), turnOf(page)))
      )
      if (sheet)
        for (const page of final) fitPage(out, page, sheet, print.enlarge)
      if (print.footerName || print.numbers !== "none") {
        /** The file each page of the result came from; none for added pages. */
        const names = new Map<number, string>()
        wanted.forEach((want, index) => {
          if (!("blank" in want))
            names.set(shifted(index), sources.get(want.source)!.name)
        })
        final.forEach((page, index) =>
          addFooter(
            out,
            writer,
            page,
            print.footerName ? (names.get(index) ?? "") : "",
            numberText(print.numbers, index, total, print.numbersFrom),
            print.numbersAt
          )
        )
      }
    }
    writer.destroy()

    const stamp = pdfDate(options.now ?? new Date())
    out.setMetaData("info:Producer", PRODUCER)
    out.setMetaData("info:CreationDate", stamp)
    out.setMetaData("info:ModDate", stamp)
    for (const [key, value] of Object.entries(options.details ?? {}))
      if (value.trim())
        out.setMetaData(
          `info:${key[0].toUpperCase()}${key.slice(1)}`,
          value.trim()
        )
    await options.checkpoint?.()
    // Objects no longer referenced are dropped; identical ones, streams
    // included (level 4), are stored once. Options go as an object, so a
    // password may hold any character.
    const buffer = out.saveToBuffer({
      garbage: 4,
      compress: "yes",
      objstms: "yes",
      ...(options.lock
        ? {
            encrypt: "aes-256",
            "user-password": options.lock.password,
            "owner-password": options.lock.ownerPassword,
            permissions: options.lock.permissions,
          }
        : null),
    })
    try {
      // The buffer is a view of the engine's memory; the copy outlives it.
      return {
        bytes: buffer.asUint8Array().slice(),
        pages: pages.length + contents.count,
        bookmarks: countBookmarks(bookmarks),
      }
    } finally {
      buffer.destroy()
    }
  } finally {
    out.destroy()
  }
}

/** Join whole runs of pages from opened files, file after file. */
export function mergePdfs(
  mupdf: Engine,
  inputs: readonly MergeInput[],
  options: MergeOptions
): Promise<Merged> {
  const sources = new Map<string, MergeSource>()
  const wanted: MergePage[] = []
  inputs.forEach((input, at) => {
    if (!input.pages.length) return
    sources.set(String(at), input)
    for (const index of input.pages)
      wanted.push({ source: String(at), index, rotation: input.rotation })
  })
  return mergePages(mupdf, sources, wanted, options)
}
