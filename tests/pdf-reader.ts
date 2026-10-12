/**
 * Read a PDF back with pdf.js, which shares no code with the engine that
 * writes our results.
 */
import { PDFDocument, PDFName } from "@cantoo/pdf-lib"
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs"

export interface ReadBookmark {
  title: string
  /** Page number from 1, or the address it leads to, or null. */
  to: number | string | null
  items: ReadBookmark[]
}

export interface ReadPage {
  text: string
  width: number
  height: number
  /** Degrees the page is turned. */
  rotate: number
  /** Where each link leads: a page number from 1, or an address. */
  links: (number | string)[]
  /** Form fields on the page, as "name=value". */
  fields: string[]
  /** The text of sticky notes. */
  notes: string[]
  /** Every kind of annotation on the page, sorted. */
  kinds: string[]
  /** How many pictures the page draws. */
  pictures: number
}

/** pdf.js has given attachments as a plain object and, later, as a Map. */
async function attachmentNames(doc: { getAttachments(): Promise<unknown> }) {
  const found = await doc.getAttachments()
  if (!found) return []
  return (
    found instanceof Map ? [...found.keys()] : Object.keys(found)
  ).sort() as string[]
}

async function fieldNames(bytes: Uint8Array, password?: string) {
  const doc = await PDFDocument.load(bytes, { password })
  return doc
    .getForm()
    .getFields()
    .map((field) => field.getName())
    .sort()
}

export async function readPdf(bytes: Uint8Array, password?: string) {
  // pdf.js takes ownership of the bytes it is given.
  const doc = await getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    useSystemFonts: false,
  }).promise
  try {
    type Dest = string | unknown[] | null
    const pageOf = async (dest: Dest) => {
      const explicit =
        typeof dest === "string" ? await doc.getDestination(dest) : dest
      if (!explicit) return null
      return (await doc.getPageIndex(explicit[0] as never)) + 1
    }
    const layers = await doc.getOptionalContentConfig()
    const pages: ReadPage[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const content = await page.getTextContent()
      const annotations = await page.getAnnotations()
      const operators = await page.getOperatorList()
      const links: (number | string)[] = []
      for (const annotation of annotations)
        if (annotation.subtype === "Link")
          links.push(
            annotation.url ?? (await pageOf(annotation.dest)) ?? "nowhere"
          )
      pages.push({
        text: content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          // Text set far apart comes back with runs of spaces between.
          .replace(/\s+/g, " ")
          .trim(),
        width: page.view[2] - page.view[0],
        height: page.view[3] - page.view[1],
        rotate: page.rotate,
        links,
        fields: annotations
          .filter((annotation) => annotation.subtype === "Widget")
          .map(
            (annotation) => `${annotation.fieldName}=${annotation.fieldValue}`
          ),
        notes: annotations
          .filter((annotation) => annotation.subtype === "Text")
          .map((annotation) => annotation.contentsObj?.str ?? ""),
        kinds: annotations.map((annotation) => annotation.subtype).sort(),
        pictures: operators.fnArray.filter(
          (operator) =>
            operator === OPS.paintImageXObject ||
            operator === OPS.paintInlineImageXObject
        ).length,
      })
    }
    type Item = {
      title: string
      dest: Dest
      url?: string | null
      items: Item[]
    }
    const walk = async (items: Item[] | null): Promise<ReadBookmark[]> =>
      Promise.all(
        (items ?? []).map(async (item) => ({
          title: item.title,
          to: item.url ?? (await pageOf(item.dest)),
          items: await walk(item.items),
        }))
      )
    const meta = await doc.getMetadata()
    const info = meta.info as Record<string, unknown>
    return {
      pages,
      bookmarks: await walk((await doc.getOutline()) as Item[] | null),
      /** Names of the fillable fields the document's own form lists, read with pdf-lib. */
      fields: await fieldNames(bytes, password),
      layers: [...layers].map(([, group]) => ({
        name: group.name as string,
        visible: group.visible as boolean,
      })),
      info,
      /** The page number a viewer shows for each page; null when pages are simply counted. */
      labels: await doc.getPageLabels(),
      /** Names of the files attached to the document. */
      attachments: await attachmentNames(doc),
      /** What a reader may do, as the document's permission flags; null when nothing is limited. */
      permissions: await doc.getPermissions(),
      /** True when the document says it holds signatures. */
      signatures: Boolean(info.IsSignaturesPresent),
      encrypted: Boolean(info.EncryptFilterName),
    }
  } finally {
    await doc.loadingTask.destroy()
  }
}

/** The text of every page, in order. */
export const texts = async (bytes: Uint8Array, password?: string) =>
  (await readPdf(bytes, password)).pages.map((page) => page.text)

/** How many pictures a file holds, wherever they are used, counted with pdf-lib. */
export async function storedPictures(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) =>
        "dict" in object &&
        String(
          (object.dict as { get(key: unknown): unknown }).get(
            PDFName.of("Subtype")
          )
        ) === "/Image"
    ).length
}

/** The names each page's resources list under a kind such as "Font" or "XObject", read with pdf-lib. */
export async function resourceNames(bytes: Uint8Array, kind: string) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => {
    const list = page.node.Resources()?.lookup(PDFName.of(kind))
    return list && "keys" in list
      ? (list as { keys(): { decodeText(): string }[] })
          .keys()
          .map((key) => key.decodeText())
          .sort()
      : []
  })
}

/** A run of text as pdf.js finds it on a page, placed as the page is shown: points from its top left corner. */
export interface PlacedText {
  text: string
  /** Where its baseline starts. */
  x: number
  y: number
  /** The height of its letters, in points. */
  size: number
  /** The way it runs, clockwise in degrees: 0 for left to right. */
  angle: number
  font: string
}

/** Every run of text on every page, with where pdf.js says it is. */
export async function textPlaces(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    useSystemFonts: false,
  }).promise
  try {
    const pages: PlacedText[][] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const [a, b, c, d, e, f] = page.getViewport({ scale: 1 }).transform
      const content = await page.getTextContent()
      const runs: PlacedText[] = []
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue
        const [ia, ib, , , ie, iF] = item.transform as number[]
        // The run's own matrix, carried into the page as it is shown.
        const dx = a * ia + c * ib
        const dy = b * ia + d * ib
        runs.push({
          text: item.str,
          x: a * ie + c * iF + e,
          y: b * ie + d * iF + f,
          size: Math.hypot(dx, dy),
          angle: ((((Math.atan2(dy, dx) * 180) / Math.PI) % 360) + 360) % 360,
          font: item.fontName,
        })
      }
      pages.push(runs)
    }
    return pages
  } finally {
    await doc.loadingTask.destroy()
  }
}

/** The fonts a file embeds: the name each gives itself and the size of its font file, read with pdf-lib. */
export async function embeddedFonts(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const fonts: { name: string; bytes: number }[] = []
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!("get" in object) || "contents" in object) continue
    const dict = object as unknown as { get(key: unknown): unknown }
    if (String(dict.get(PDFName.of("Type"))) !== "/FontDescriptor") continue
    let size = 0
    for (const key of ["FontFile", "FontFile2", "FontFile3"]) {
      const ref = dict.get(PDFName.of(key))
      if (!ref) continue
      const file = doc.context.lookup(ref as never) as unknown as {
        contents?: Uint8Array
      }
      size = file?.contents?.length ?? 0
    }
    fonts.push({ name: String(dict.get(PDFName.of("FontName"))), bytes: size })
  }
  return fonts
}

/** A comment as pdf.js reads it. */
export interface ReadComment {
  /** What the file calls it: "Highlight", "Text", "Ink" and so on. */
  kind: string
  text: string
  author: string
  /** Red, green and blue from 0 to 1; null when it has no colour. */
  colour: number[] | null
  /** How many boxes of words it lies on. */
  quads: number
  /** Left, bottom, right, top, in the file's own points. */
  rect: number[]
  /** It answers another comment. */
  reply: boolean
  /** When it was last changed, as the file writes it. */
  modified: string
}

/** Every comment on every page, read with pdf.js: links, form fields and the windows of notes are left out. */
export async function readComments(bytes: Uint8Array, password?: string) {
  const doc = await getDocument({
    data: bytes.slice(),
    password,
    verbosity: 0,
    useSystemFonts: false,
  }).promise
  try {
    const pages: ReadComment[][] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const found: ReadComment[] = []
      for (const annotation of await page.getAnnotations()) {
        if (["Link", "Widget", "Popup"].includes(annotation.subtype)) continue
        const quads = annotation.quadPoints as
          ArrayLike<number> | ArrayLike<unknown>[] | undefined
        found.push({
          kind: annotation.subtype,
          text: annotation.contentsObj?.str ?? "",
          author: annotation.titleObj?.str ?? "",
          colour: annotation.color
            ? Array.from(
                annotation.color as ArrayLike<number>,
                (part) => Math.round((part / 255) * 100) / 100
              )
            : null,
          // pdf.js has given these as a list of boxes and, later, as one list of numbers.
          quads: !quads
            ? 0
            : typeof quads[0] === "number"
              ? quads.length / 8
              : quads.length,
          rect: Array.from(annotation.rect as ArrayLike<number>),
          reply: Boolean(annotation.inReplyTo),
          modified: annotation.modificationDate ?? "",
        })
      }
      pages.push(found)
    }
    return pages
  } finally {
    await doc.loadingTask.destroy()
  }
}
