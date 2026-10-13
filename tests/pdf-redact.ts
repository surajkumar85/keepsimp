/**
 * A file with something of every kind that can lie under a mark for
 * taking out: words, a picture, drawings, a link, a note and a form field.
 * Written by pdf-lib.
 */
import {
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib"
import { noise } from "./pdf-fixtures"

/** The size of its pages, in points. */
export const REDACT_PAGE: [number, number] = [400, 600]

/** What its lines say, by a name for each. */
export const REDACT = {
  keep: "Keep this line",
  secret: "Card 4111 1111 1111 1111 of Ada",
  half: "Half in the mark and half out",
  mail: "Write to ada@example.org today",
  note: "a secret note",
  account: "12345-67890",
  second: "Page two names ada@example.org too",
} as const

/**
 * Places on the first page, as boxes on the page as it is shown (from its
 * top left corner): the line with the card number, the first half of the
 * line under it, an area with a red box wholly in it, a blue line that
 * crosses it and the lower left part of a picture, and the form's field.
 */
export const PLACES = {
  secret: { x: 30, y: 86, width: 320, height: 20 },
  half: { x: 30, y: 126, width: 80, height: 20 },
  area: { x: 50, y: 180, width: 210, height: 80 },
  field: { x: 30, y: 325, width: 200, height: 30 },
} as const

/** The side of the picture of noise, in pixels and in points; it lies 200 from the left and 200 from the top. */
export const PICTURE = 100

/**
 * Two pages. The first holds everything named above; the second draws the
 * same picture (the file holds it once) and names the e-mail address again.
 * @param foreign Also a mark for taking out that is not the editor's, over the first line.
 */
export async function makeRedactPdf(foreign = false) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const { context } = doc
  const first = doc.addPage(REDACT_PAGE)
  const second = doc.addPage(REDACT_PAGE)
  const write = (page: typeof first, text: string, y: number) =>
    page.drawText(text, { x: 40, y, size: 12, font })
  write(first, REDACT.keep, 560)
  write(first, REDACT.secret, 500)
  write(first, REDACT.half, 460)
  write(first, REDACT.mail, 540)
  write(second, REDACT.second, 560)
  first.drawRectangle({
    x: 60,
    y: 380,
    width: 40,
    height: 30,
    color: rgb(1, 0, 0),
  })
  first.drawLine({
    start: { x: 20, y: 395 },
    end: { x: 380, y: 395 },
    thickness: 3,
    color: rgb(0, 0, 1),
  })
  const image = context.register(
    context.stream(noise(PICTURE * PICTURE * 3, 3), {
      Type: "XObject",
      Subtype: "Image",
      Width: PICTURE,
      Height: PICTURE,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
    })
  )
  for (const page of [first, second]) {
    page.node
      .Resources()!
      .set(PDFName.of("XObject"), context.obj({ Pic: image }))
    page.node.addContentStream(
      context.register(
        context.stream(`q ${PICTURE} 0 0 ${PICTURE} 200 300 cm /Pic Do Q`)
      )
    )
  }
  const field = doc.getForm().createTextField("account")
  field.setText(REDACT.account)
  field.addToPage(first, { x: 40, y: 250, width: 180, height: 20, font })
  const notes = [
    {
      Subtype: "Link",
      Rect: [40, 495, 300, 515],
      A: { S: "URI", URI: PDFString.of("https://secret.example/") },
    },
    {
      Subtype: "Text",
      Rect: [100, 500, 120, 520],
      Contents: PDFString.of(REDACT.note),
    },
    {
      Subtype: "Link",
      Rect: [40, 555, 200, 575],
      A: { S: "URI", URI: PDFString.of("https://kept.example/") },
    },
    ...(foreign
      ? [
          {
            Subtype: "Redact",
            Rect: [38, 555, 140, 575],
            QuadPoints: [38, 575, 140, 575, 38, 555, 140, 555],
          },
        ]
      : []),
  ].map((note) =>
    context.register(context.obj({ Type: "Annot", P: first.ref, ...note }))
  )
  const list = first.node.Annots()
  for (const note of notes) list!.push(note)
  return doc.save()
}

/** Words that a page holds and does not show, each a different way; and a line that is seen. */
export const UNSEEN = {
  seen: "Seen words here",
  layer: "LAYERSECRET",
  ghost: "GHOSTSECRET",
  form: "FORMSECRET",
  clipped: "CLIPSECRET",
} as const

/** Where they are, as boxes on the page as it is shown. */
export const UNSEEN_PLACES = [
  { x: 30, y: 86, width: 300, height: 20 },
  { x: 30, y: 126, width: 300, height: 20 },
  { x: 30, y: 166, width: 300, height: 20 },
  { x: 30, y: 206, width: 300, height: 20 },
] as const

/**
 * One page with words nobody sees: on a layer that is switched off,
 * written without being drawn (as under a scan), inside a form, and
 * clipped away. A mark over where they are must take them out all the
 * same.
 */
export async function makeUnseenPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const { context } = doc
  const page = doc.addPage(REDACT_PAGE)
  page.drawText(UNSEEN.seen, { x: 40, y: 560, size: 12, font })
  const name = page.node.newFontDictionary("F1", font.ref).asString().slice(1)
  const layer = context.register(context.obj({ Type: "OCG", Name: "Hidden" }))
  doc.catalog.set(
    PDFName.of("OCProperties"),
    context.obj({ OCGs: [layer], D: { OFF: [layer], Order: [layer] } })
  )
  const resources = page.node.Resources()!
  resources.set(PDFName.of("Properties"), context.obj({ L1: layer }))
  const form = context.register(
    context.stream(`BT /F1 12 Tf 0 0 Td (${UNSEEN.form}) Tj ET`, {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, 200, 20],
      Resources: { Font: { F1: font.ref } },
    })
  )
  resources.set(PDFName.of("XObject"), context.obj({ Fm: form }))
  for (const content of [
    `/OC /L1 BDC BT /${name} 12 Tf 40 500 Td (${UNSEEN.layer}) Tj ET EMC`,
    `BT 3 Tr /${name} 12 Tf 40 460 Td (${UNSEEN.ghost}) Tj ET`,
    `q 1 0 0 1 40 420 cm /Fm Do Q`,
    `q 0 0 1 1 re W n BT /${name} 12 Tf 40 380 Td (${UNSEEN.clipped}) Tj ET Q`,
  ])
    page.node.addContentStream(context.register(context.stream(content)))
  return doc.save()
}
