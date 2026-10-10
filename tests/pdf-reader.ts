/**
 * Read a PDF back with pdf.js, which shares no code with the engine that
 * writes our results.
 */
import { PDFDocument } from "@cantoo/pdf-lib"
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
          .filter(Boolean)
          .join(" "),
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
