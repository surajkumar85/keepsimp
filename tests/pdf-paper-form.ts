/**
 * A form on paper, drawn by pdf-lib: labels with rules, boxes, a square and
 * underscores to write on, things that are not places to write (a heading's
 * underline, a dark bar, a rule across the page), one field already, and a
 * turned second page with one rule.
 */
import { degrees, PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib"

/** The names the first page's suggestions take, from the top down. */
export const PAPER_FIELDS = ["Name", "Address", "Agree", "Comments", "Phone"]

/** A form on paper: what a person would write on, drawn, and no fields but one. */
export async function paperForm() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const black = rgb(0, 0, 0)
  const page = doc.addPage([400, 600])
  const say = (text: string, x: number, y: number) =>
    page.drawText(text, { x, y, size: 11, font })
  say("Application", 40, 560)
  // A heading underlined: written in already.
  page.drawLine({
    start: { x: 40, y: 556 },
    end: { x: 110, y: 556 },
    thickness: 1,
  })
  say("Name:", 40, 520)
  page.drawLine({
    start: { x: 80, y: 518 },
    end: { x: 300, y: 518 },
    thickness: 1,
  })
  say("Address", 80, 488)
  page.drawRectangle({
    x: 80,
    y: 460,
    width: 200,
    height: 22,
    borderWidth: 1,
    borderColor: black,
  })
  say("Agree", 10, 432)
  page.drawRectangle({
    x: 60,
    y: 430,
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: black,
  })
  say("Comments", 40, 400)
  page.drawRectangle({
    x: 40,
    y: 310,
    width: 300,
    height: 80,
    borderWidth: 1,
    borderColor: black,
  })
  say("Phone ____________", 40, 280)
  // A dark bar and a rule across the page are no places to write.
  page.drawRectangle({ x: 40, y: 240, width: 300, height: 20, color: black })
  page.drawLine({
    start: { x: 10, y: 220 },
    end: { x: 390, y: 220 },
    thickness: 1,
  })
  // A box that is a field already.
  page.drawRectangle({
    x: 40,
    y: 150,
    width: 200,
    height: 22,
    borderWidth: 1,
    borderColor: black,
  })
  const field = doc.getForm().createTextField("Existing")
  field.addToPage(page, { x: 40, y: 150, width: 200, height: 22, font })
  // A turned page with one rule.
  const turned = doc.addPage([400, 600])
  turned.setRotation(degrees(90))
  turned.drawText("Signed", { x: 40, y: 520, size: 11, font })
  turned.drawLine({
    start: { x: 90, y: 518 },
    end: { x: 250, y: 518 },
    thickness: 1,
  })
  return doc.save()
}
