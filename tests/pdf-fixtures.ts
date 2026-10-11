/**
 * PDFs for tests, written by other software (pdf-lib) than the engine that
 * merges them. Every page carries its own text, "<tag>-P<number>", so a
 * result can be checked page by page.
 */
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  type PDFRef,
} from "@cantoo/pdf-lib"

export interface FixtureBookmark {
  title: string
  /** Page number from 1; left out for a heading that leads nowhere. */
  page?: number
  children?: FixtureBookmark[]
}

export interface FixtureOptions {
  pages?: number
  /** Width and height in points for a page number from 1; A6 by default. */
  size?: (page: number) => [number, number]
  /** Quarter turns stored on pages: page number from 1 to degrees. */
  rotate?: Record<number, number>
  /** Links: from a page to a page, by place, by name, or through an action. */
  links?: { from: number; to: number; how?: "place" | "name" | "action" }[]
  bookmarks?: FixtureBookmark[]
  fields?: { name: string; value: string; page: number }[]
  /** A sticky note on these pages, with this text. */
  notes?: { page: number; text: string }[]
  password?: { user: string; owner?: string }
  title?: string
  /** Leave page size, turn and fonts to the page tree instead of each page. */
  inherit?: boolean
  /** Two layers on page 1: "Shown" and "Hidden", the second off by default. */
  layers?: boolean
  /** A signed signature field on page 1. */
  signed?: boolean
  /** Marked as tagged for accessibility. */
  tagged?: boolean
  /** The same picture of noise on every page, several kilobytes even when compressed. */
  picture?: boolean
  /** Files attached to the document: name to text. */
  attachments?: Record<string, string>
  /** Page numbers of its own: the first pages in small Roman numerals, then from 1. */
  romanPages?: number
  author?: string
  subject?: string
  keywords?: string
  /** A check box with this name on page 1, ticked. */
  checkBox?: string
}

export const pageText = (tag: string, page: number) => `${tag}-P${page}`

export async function makePdf(tag: string, options: FixtureOptions = {}) {
  const count = options.pages ?? 1
  const doc = await PDFDocument.create()
  const context = doc.context
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = Array.from({ length: count }, (_, index) => {
    const size = options.size?.(index + 1) ?? [298, 420]
    const page = doc.addPage(size)
    if (options.inherit) {
      // Text drawn with a font that only the page tree names.
      page.node.set(
        PDFName.of("Contents"),
        context.register(
          context.stream(
            `BT /FI 24 Tf 40 300 Td (${pageText(tag, index + 1)}) Tj ET`
          )
        )
      )
      page.node.delete(PDFName.of("Resources"))
      page.node.delete(PDFName.of("MediaBox"))
    } else
      page.drawText(pageText(tag, index + 1), { x: 40, y: 300, size: 24, font })
    const turn = options.rotate?.[index + 1]
    if (turn !== undefined)
      page.node.set(PDFName.of("Rotate"), context.obj(turn))
    return page
  })
  if (options.picture) {
    // Noise compresses badly, so the picture's size shows in the file's.
    const side = 100
    const noise = new Uint8Array(side * side * 3)
    let seed = 7
    for (let index = 0; index < noise.length; index++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      noise[index] = seed >>> 24
    }
    const image = context.register(
      context.stream(noise, {
        Type: "XObject",
        Subtype: "Image",
        Width: side,
        Height: side,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
      })
    )
    for (const page of pages) {
      page.node
        .Resources()!
        .set(PDFName.of("XObject"), context.obj({ Pic: image }))
      page.node.addContentStream(
        context.register(context.stream("q 60 0 0 60 200 20 cm /Pic Do Q"))
      )
    }
  }

  const ref = (page: number): PDFRef => pages[page - 1].ref
  const addAnnotation = (page: number, annotation: Record<string, unknown>) => {
    const node = pages[page - 1].node
    const made = context.register(
      context.obj({ Type: "Annot", P: ref(page), ...annotation } as never)
    )
    const existing = node.Annots()
    if (existing) existing.push(made)
    else node.set(PDFName.of("Annots"), context.obj([made]))
    return made
  }

  if (options.inherit) {
    const tree = doc.catalog.Pages()
    tree.set(PDFName.of("MediaBox"), context.obj([0, 0, 298, 420]))
    tree.set(PDFName.of("Rotate"), context.obj(90))
    tree.set(PDFName.of("Resources"), context.obj({ Font: { FI: font.ref } }))
  }

  const names: (PDFString | ReturnType<typeof context.obj>)[] = []
  for (const [index, link] of (options.links ?? []).entries()) {
    const place = context.obj([ref(link.to), PDFName.of("XYZ"), 0, 420, 0])
    const name = `dest-${index}`
    if (link.how === "name") names.push(PDFString.of(name), place)
    addAnnotation(link.from, {
      Subtype: "Link",
      Rect: [40, 200 - index * 30, 200, 224 - index * 30],
      Border: [0, 0, 0],
      ...(link.how === "action"
        ? { A: { S: "GoTo", D: place } }
        : { Dest: link.how === "name" ? PDFString.of(name) : place }),
    })
  }
  if (names.length)
    doc.catalog.set(
      PDFName.of("Names"),
      context.obj({ Dests: { Names: names } })
    )

  for (const note of options.notes ?? [])
    addAnnotation(note.page, {
      Subtype: "Text",
      Rect: [250, 380, 270, 400],
      Contents: PDFString.of(note.text),
    })

  if (options.bookmarks?.length) {
    const outline = context.nextRef()
    const build = (items: FixtureBookmark[], parent: PDFRef) => {
      const refs = items.map(() => context.nextRef())
      items.forEach((item, index) => {
        const entry: Record<string, unknown> = {
          Title: PDFHexString.fromText(item.title),
          Parent: parent,
        }
        if (item.page) entry.Dest = [ref(item.page), PDFName.of("Fit")]
        if (index > 0) entry.Prev = refs[index - 1]
        if (index < items.length - 1) entry.Next = refs[index + 1]
        if (item.children?.length) {
          const kids = build(item.children, refs[index])
          entry.First = kids[0]
          entry.Last = kids[kids.length - 1]
          entry.Count = kids.length
        }
        context.assign(refs[index], context.obj(entry as never))
      })
      return refs
    }
    const top = build(options.bookmarks, outline)
    context.assign(
      outline,
      context.obj({
        Type: "Outlines",
        First: top[0],
        Last: top[top.length - 1],
        Count: top.length,
      })
    )
    doc.catalog.set(PDFName.of("Outlines"), outline)
  }

  if (options.fields?.length) {
    const form = doc.getForm()
    for (const [index, field] of options.fields.entries()) {
      const text = form.createTextField(field.name)
      text.setText(field.value)
      text.addToPage(pages[field.page - 1], {
        x: 40,
        y: 100 - index * 30,
        width: 150,
        height: 24,
      })
    }
  }

  if (options.layers) {
    const layer = (name: string) =>
      context.register(context.obj({ Type: "OCG", Name: PDFString.of(name) }))
    const shown = layer(`${tag} shown`)
    const hidden = layer(`${tag} hidden`)
    doc.catalog.set(
      PDFName.of("OCProperties"),
      context.obj({
        OCGs: [shown, hidden],
        D: { Order: [shown, hidden], OFF: [hidden] },
      })
    )
    const page = pages[0]
    const resources = page.node.Resources()!
    resources.set(
      PDFName.of("Properties"),
      context.obj({ LS: shown, LH: hidden })
    )
    const fontKey = [
      ...(
        resources.lookup(PDFName.of("Font")) as never as {
          keys(): PDFName[]
        }
      ).keys(),
    ][0]
    const draw = (layerKey: string, y: number, text: string) =>
      `/OC /${layerKey} BDC BT ${fontKey} 14 Tf 40 ${y} Td (${text}) Tj ET EMC\n`
    page.node.addContentStream(
      context.register(
        context.stream(
          draw("LS", 260, `${tag}-SHOWN`) + draw("LH", 240, `${tag}-HIDDEN`)
        )
      )
    )
  }

  if (options.signed) {
    const look = context.register(
      context.stream("0.8 0.9 1 rg 0 0 120 30 re f", {
        Type: "XObject",
        Subtype: "Form",
        BBox: [0, 0, 120, 30],
      })
    )
    const widget = addAnnotation(1, {
      Subtype: "Widget",
      FT: "Sig",
      T: PDFString.of("Signature1"),
      Rect: [40, 40, 160, 70],
      F: 4,
      AP: { N: look },
      V: {
        Type: "Sig",
        Filter: "Adobe.PPKLite",
        SubFilter: "adbe.pkcs7.detached",
        Contents: PDFHexString.of("00".repeat(16)),
        ByteRange: [0, 0, 0, 0],
      },
    })
    const form = doc.catalog.getOrCreateAcroForm()
    form.addField(widget)
    form.dict.set(PDFName.of("SigFlags"), context.obj(3))
  }

  if (options.tagged) {
    doc.catalog.set(PDFName.of("MarkInfo"), context.obj({ Marked: true }))
    doc.catalog.set(
      PDFName.of("StructTreeRoot"),
      context.register(context.obj({ Type: "StructTreeRoot" }))
    )
    pages[0].node.set(PDFName.of("StructParents"), context.obj(0))
  }

  for (const [name, text] of Object.entries(options.attachments ?? {}))
    await doc.attach(new TextEncoder().encode(text), name, {
      mimeType: "text/plain",
    })
  if (options.romanPages)
    doc.catalog.set(
      PDFName.of("PageLabels"),
      context.obj({
        Nums: [0, { S: "r" }, options.romanPages, { S: "D" }],
      })
    )
  if (options.checkBox) {
    const box = doc.getForm().createCheckBox(options.checkBox)
    box.addToPage(pages[0], { x: 220, y: 100, width: 16, height: 16 })
    box.check()
  }
  if (options.author) doc.setAuthor(options.author)
  if (options.subject) doc.setSubject(options.subject)
  if (options.keywords) doc.setKeywords([options.keywords])
  if (options.title) doc.setTitle(options.title)
  if (options.password)
    doc.encrypt({
      userPassword: options.password.user,
      ownerPassword: options.password.owner ?? `${options.password.user}-owner`,
    })
  return doc.save({ useObjectStreams: false })
}

/** What one page of a plain test file holds. Nothing at all makes a blank page. */
export interface PlainPage {
  /** A line of small print at the top left, as a header or a number would be. */
  top?: string
  /** A line of large print in the middle. */
  body?: string
  /** A tiny mark, as dust on a scanner's glass leaves. */
  speck?: boolean
}

/**
 * Pages of 298 by 420 points with the lines given: `top` is 12 point print
 * 30 points from the top, `body` 24 point print 120 points down.
 */
export async function makePlainPdf(pages: readonly PlainPage[]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const content of pages) {
    const page = doc.addPage([298, 420])
    if (content.top)
      page.drawText(content.top, { x: 30, y: 390, size: 12, font })
    if (content.body)
      page.drawText(content.body, { x: 40, y: 300, size: 24, font })
    if (content.speck)
      page.drawRectangle({ x: 150, y: 200, width: 1.5, height: 1.5 })
  }
  return doc.save()
}

/**
 * Sheets of 600 by 400 points that each hold two pages, as a book laid open
 * on a scanner does: "L<n>" on the left half and "R<n>" on the right.
 */
export async function makeDoublePdf(count: number) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let sheet = 1; sheet <= count; sheet++) {
    const page = doc.addPage([600, 400])
    page.drawText(`L${sheet}`, { x: 60, y: 300, size: 30, font })
    page.drawText(`R${sheet}`, { x: 360, y: 300, size: 30, font })
  }
  return doc.save()
}

/** How the pages of a shared-list file use what the list holds. */
export type SharedHow =
  /** Each page draws its own picture directly. */
  | "direct"
  /** Each page draws a form that names no resources of its own, and the form draws the picture. */
  | "form"
  /** Each page's picture is drawn by a stamp whose appearance names no resources of its own. */
  | "stamp"
  /** The pictures have names with a space in them, written as "#20" in the content. */
  | "escaped"

/** Bytes that do not compress, so a picture's size shows in the size of a file. */
export function noise(length: number, seed: number) {
  const bytes = new Uint8Array(length)
  let state = seed
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    bytes[index] = state >>> 24
  }
  return bytes
}

/** The size of one picture in a shared-list file, in bytes. */
export const SHARED_PICTURE = 100 * 100 * 3

/**
 * A file in which every page points at one shared list of all the fonts and
 * pictures in the file, as many programs write them, though each page draws
 * only its own picture. Page N says "<tag>-P<N>" and shows picture N.
 */
export async function makeSharedPdf(
  tag: string,
  count: number,
  how: SharedHow = "direct"
) {
  const doc = await PDFDocument.create()
  const context = doc.context
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const unused = await doc.embedFont(StandardFonts.Courier)
  const key = (page: number) => (how === "escaped" ? `Im ${page}` : `Im${page}`)
  const written = (page: number) =>
    how === "escaped" ? `Im#20${page}` : `Im${page}`
  const pictures: Record<string, PDFRef> = {}
  for (let page = 1; page <= count; page++)
    pictures[key(page)] = context.register(
      context.stream(noise(SHARED_PICTURE, page), {
        Type: "XObject",
        Subtype: "Image",
        Width: 100,
        Height: 100,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
      })
    )
  const show = (page: number) => `q 100 0 0 100 40 40 cm /${written(page)} Do Q`
  const forms: Record<string, PDFRef> = {}
  if (how === "form")
    for (let page = 1; page <= count; page++)
      forms[`Fm${page}`] = context.register(
        context.stream(show(page), {
          Type: "XObject",
          Subtype: "Form",
          BBox: [0, 0, 300, 400],
        })
      )
  const xobjects = context.obj({})
  for (const [name, ref] of Object.entries({ ...pictures, ...forms }))
    xobjects.set(PDFName.of(name), ref)
  const shared = context.register(
    context.obj({
      Font: { F1: font.ref, F2: unused.ref },
      XObject: xobjects,
    } as never)
  )
  for (let number = 1; number <= count; number++) {
    const page = doc.addPage([300, 400])
    page.node.set(PDFName.of("Resources"), shared)
    const text = `BT /F1 20 Tf 40 300 Td (${pageText(tag, number)}) Tj ET`
    const drawn =
      how === "form" ? `/Fm${number} Do` : how === "stamp" ? "" : show(number)
    page.node.set(
      PDFName.of("Contents"),
      context.register(context.stream(`${text} ${drawn}`))
    )
    if (how === "stamp")
      page.node.set(
        PDFName.of("Annots"),
        context.obj([
          context.register(
            context.obj({
              Type: "Annot",
              Subtype: "Stamp",
              Rect: [0, 0, 300, 400],
              F: 4,
              P: page.ref,
              AP: {
                N: context.register(
                  context.stream(show(number), {
                    Type: "XObject",
                    Subtype: "Form",
                    BBox: [0, 0, 300, 400],
                  })
                ),
              },
            } as never)
          ),
        ])
      )
  }
  return doc.save()
}

/**
 * Damage a PDF the way real files get damaged.
 * - "table": the table that says where each object is points nowhere
 * - "cut": the end of the file is missing, as after a broken download
 * - "junk": bytes were added after the end
 */
export function damage(bytes: Uint8Array, how: "table" | "cut" | "junk") {
  // Latin-1 keeps every byte as it is, which "TextDecoder" does not.
  const text = Buffer.from(bytes).toString("latin1")
  const changed =
    how === "table"
      ? text.replace(/startxref\s+\d+/, "startxref\n7")
      : how === "cut"
        ? text.slice(0, text.lastIndexOf("xref"))
        : `${text}\n<html>not part of the file</html>\n`
  return new Uint8Array(Buffer.from(changed, "latin1"))
}
