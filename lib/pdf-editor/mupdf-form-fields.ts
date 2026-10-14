/** AcroForm fields, written into the document itself as replayable steps. */
import type * as MuPDF from "mupdf"
import {
  DATE_ACTION,
  fitField,
  nameTaken,
  readMakeFieldOp,
  type FieldSpec,
  type MakeFieldChange,
} from "./form-fields"
import type { Box } from "./geometry"
import { canDo, inStep, turnOf, withPage, type EditSession } from "./mupdf-edit"
import { drawList } from "./mupdf-forms"
import { dropWidget } from "./mupdf-pages"
import { inverse, type Matrix } from "./retext"
type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** All named nodes, including hidden fields, read-only fields and ancestors. */
export function fieldNames(doc: Doc): string[] {
  const names: string[] = [],
    seen = new Set<number>()
  const walk = (list: Obj, prefix: string, depth: number) => {
    if (!list.isArray() || depth > 32 || names.length > 10_000) return
    list.forEach((node) => {
      if (!node.isDictionary()) return
      const number = node.isIndirect() ? node.asIndirect() : 0
      if (number && seen.has(number)) return
      if (number) seen.add(number)
      const text = node.get("T"),
        part = text.isString() ? text.asString() : ""
      const name = part ? `${prefix}${part}` : prefix.replace(/\.$/, "")
      if (part) names.push(name)
      walk(node.get("Kids"), name ? `${name}.` : "", depth + 1)
    })
  }
  walk(doc.getTrailer().get("Root", "AcroForm", "Fields"), "", 0)
  return names
}
function formOf(mupdf: Engine, doc: Doc) {
  const root = doc.getTrailer().get("Root")
  let form = root.get("AcroForm")
  if (!form.isDictionary()) {
    form = doc.addObject({ Fields: [] })
    root.put("AcroForm", form)
  }
  if (!form.get("XFA").isNull())
    throw new Error(
      "XFA forms cannot be changed here. Use a PDF with ordinary AcroForm fields."
    )
  if (!form.get("Fields").isArray()) form.put("Fields", doc.newArray())
  let resources = form.get("DR")
  if (!resources.isDictionary()) {
    resources = doc.newDictionary()
    form.put("DR", resources)
  }
  let fonts = resources.get("Font")
  if (!fonts.isDictionary()) {
    fonts = doc.newDictionary()
    resources.put("Font", fonts)
  }
  // A name of ours never replaces a font the file already uses.
  if (fonts.get("KSFormHelvetica").isNull()) {
    const font = new mupdf.Font("Helvetica")
    try {
      fonts.put("KSFormHelvetica", doc.addSimpleFont(font, "Latin"))
    } finally {
      font.destroy()
    }
  }
  return form
}
/** A shown rectangle written in the PDF's unturned coordinates. */
function putBox(doc: Doc, page: MuPDF.PDFPage, place: Obj, box: Box) {
  const m = inverse(page.getTransform() as Matrix)
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  place.put("Rect", [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ])
}
const holderOf = (place: Obj) =>
  place.get("T").isString() ? place : place.get("Parent")
const flagsOf = (field: Obj) => {
  const value = field.getInheritable("Ff")
  return value.isNumber() ? value.asNumber() : 0
}
/** Own Off/on drawings, including real text for each radio option. */
function buttonLooks(
  mupdf: Engine,
  page: MuPDF.PDFPage,
  widget: MuPDF.PDFWidget,
  radio: boolean
) {
  const place = widget.getObject(),
    state = place.get("KSFormOn"),
    option = place.get("KSFormOption")
  if (!state.isString()) return // An existing field's appearance states are preserved.
  const onName = state.asString(),
    label = option.isString() ? option.asString() : ""
  const box = widget.getBounds(),
    width = box[2] - box[0],
    height = box[3] - box[1]
  for (const on of [false, true]) {
    const list = new mupdf.DisplayList([0, 0, width, height]),
      device = new mupdf.DisplayListDevice(list),
      path = new mupdf.Path(),
      font = new mupdf.Font("Helvetica"),
      text = new mupdf.Text()
    const matrix = mupdf.Matrix.identity,
      rgb = mupdf.ColorSpace.DeviceRGB
    try {
      const side = Math.min(20, width, height),
        r = Math.max(2, (side - 2) / 2),
        c = side / 2,
        k = r * 0.5522847498
      if (radio) {
        path.moveTo(c + r, c)
        path.curveTo(c + r, c + k, c + k, c + r, c, c + r)
        path.curveTo(c - k, c + r, c - r, c + k, c - r, c)
        path.curveTo(c - r, c - k, c - k, c - r, c, c - r)
        path.curveTo(c + k, c - r, c + r, c - k, c + r, c)
        path.closePath()
      } else path.rect(1, 1, side - 1, side - 1)
      device.fillPath(path, false, matrix, rgb, [1, 1, 1], 1)
      const stroke = new mupdf.StrokeState({
        lineWidth: 1,
        lineCap: "Round",
        lineJoin: "Round",
        miterLimit: 10,
      })
      try {
        device.strokePath(path, stroke, matrix, rgb, [0, 0, 0], 1)
      } finally {
        stroke.destroy()
      }
      if (on) {
        const mark = new mupdf.Path()
        if (radio) {
          const d = r * 0.48,
            t = d * 0.5522847498
          mark.moveTo(c + d, c)
          mark.curveTo(c + d, c + t, c + t, c + d, c, c + d)
          mark.curveTo(c - t, c + d, c - d, c + t, c - d, c)
          mark.curveTo(c - d, c - t, c - t, c - d, c, c - d)
          mark.curveTo(c + t, c - d, c + d, c - t, c + d, c)
          mark.closePath()
          device.fillPath(mark, false, matrix, rgb, [0, 0, 0], 1)
        } else {
          mark.moveTo(side * 0.2, side * 0.5)
          mark.lineTo(side * 0.42, side * 0.75)
          mark.lineTo(side * 0.8, side * 0.22)
          const tick = new mupdf.StrokeState({
            lineWidth: Math.max(1, side * 0.1),
            lineCap: "Round",
            lineJoin: "Round",
            miterLimit: 10,
          })
          try {
            device.strokePath(mark, tick, matrix, rgb, [0, 0, 0], 1)
          } finally {
            tick.destroy()
          }
        }
        mark.destroy()
      }
      let x = side + 4
      for (const letter of label) {
        const code = letter.codePointAt(0)!,
          glyph = font.encodeCharacter(code)
        if (!glyph) continue
        const labelSize = Math.min(11, height * 0.65)
        const advance = font.advanceGlyph(glyph) * labelSize
        if (x + advance > width - 1) break
        text.showGlyph(
          font,
          [labelSize, 0, 0, -labelSize, x, Math.min(height - 2, side * 0.75)],
          glyph,
          code
        )
        x += advance
      }
      device.fillText(text, matrix, rgb, [0, 0, 0], 1)
      device.close()
      widget.setAppearanceFromDisplayList(
        "N",
        on ? onName : "Off",
        mupdf.Matrix.rotate(turnOf(page.getObject())),
        list
      )
    } finally {
      text.destroy()
      font.destroy()
      path.destroy()
      device.destroy()
      list.destroy()
    }
  }
}
/**
 * The look of a field that holds nothing yet: its background and its frame,
 * as its MK says. The engine writes no look for an empty text field or
 * drop-down, and a viewer that does not build looks itself (Preview, the
 * Files app, printing) then shows no field at all.
 */
function emptyLooks(
  mupdf: Engine,
  page: MuPDF.PDFPage,
  widget: MuPDF.PDFWidget
) {
  // Measured as the signature place's look is: the engine turns it with the page.
  const [x0, y0, x1, y1] = widget.getBounds()
  const width = x1 - x0
  const height = y1 - y0
  const list = new mupdf.DisplayList([0, 0, width, height])
  const device = new mupdf.DisplayListDevice(list)
  const ground = new mupdf.Path()
  const frame = new mupdf.Path()
  const stroke = new mupdf.StrokeState({
    lineWidth: 1,
    lineCap: "Butt",
    lineJoin: "Miter",
    miterLimit: 10,
  })
  try {
    ground.rect(0, 0, width, height)
    device.fillPath(
      ground,
      false,
      mupdf.Matrix.identity,
      mupdf.ColorSpace.DeviceRGB,
      [1, 1, 1],
      1
    )
    frame.rect(0.5, 0.5, width - 0.5, height - 0.5)
    device.strokePath(
      frame,
      stroke,
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
    stroke.destroy()
    frame.destroy()
    ground.destroy()
    device.destroy()
    list.destroy()
  }
}

function signatureLooks(
  mupdf: Engine,
  page: MuPDF.PDFPage,
  widget: MuPDF.PDFWidget
) {
  const [x0, y0, x1, y1] = widget.getBounds(),
    width = x1 - x0,
    height = y1 - y0
  const list = new mupdf.DisplayList([0, 0, width, height]),
    device = new mupdf.DisplayListDevice(list),
    path = new mupdf.Path(),
    font = new mupdf.Font("Helvetica"),
    text = new mupdf.Text()
  const stroke = new mupdf.StrokeState({
    lineWidth: 1,
    lineCap: "Butt",
    lineJoin: "Miter",
    miterLimit: 10,
  })
  try {
    path.rect(1, 1, width - 1, height - 1)
    device.strokePath(
      path,
      stroke,
      mupdf.Matrix.identity,
      mupdf.ColorSpace.DeviceRGB,
      [0, 0, 0],
      1
    )
    let x = 4
    for (const letter of "Signature") {
      const code = letter.codePointAt(0)!,
        glyph = font.encodeCharacter(code)
      text.showGlyph(
        font,
        [10, 0, 0, -10, x, Math.min(height - 2, 14)],
        glyph,
        code
      )
      x += font.advanceGlyph(glyph) * 10
    }
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
    stroke.destroy()
    text.destroy()
    font.destroy()
    path.destroy()
    device.destroy()
    list.destroy()
  }
}

function refresh(
  mupdf: Engine,
  session: EditSession,
  pageIndex: number,
  numbers: Set<number>
) {
  withPage(session.doc, pageIndex, (page) => {
    for (const widget of page.getWidgets()) {
      if (!numbers.has(widget.getObject().asIndirect())) continue
      const kind = widget.getFieldType()
      if (kind === "text" || kind === "combobox")
        widget.getObject().delete("AP")
    }
  })
  withPage(session.doc, pageIndex, (page) => {
    for (const widget of page.getWidgets()) {
      if (!numbers.has(widget.getObject().asIndirect())) continue
      const kind = widget.getFieldType()
      if (kind === "listbox") drawList(mupdf, page, widget)
      else if (kind === "checkbox" || kind === "radiobutton")
        buttonLooks(mupdf, page, widget, kind === "radiobutton")
      else if (kind === "signature") signatureLooks(mupdf, page, widget)
      else {
        widget.update()
        if (!widget.getObject().get("AP").isDictionary())
          emptyLooks(mupdf, page, widget)
      }
    }
  })
}
/** Every page that shows one of a field's widgets, without keeping a page open. */
function placesOf(doc: Doc, field: Obj) {
  const children = field.get("Kids"),
    numbers = new Set<number>()
  if (children.isArray())
    children.forEach((one) => {
      if (one.isIndirect()) numbers.add(one.asIndirect())
    })
  else numbers.add(field.asIndirect())
  const found: { page: number; numbers: Set<number> }[] = []
  for (let page = 0; page < doc.countPages(); page++) {
    const notes = doc.findPage(page).get("Annots"),
      here = new Set<number>()
    if (notes.isArray())
      notes.forEach((one) => {
        if (one.isIndirect() && numbers.has(one.asIndirect()))
          here.add(one.asIndirect())
      })
    if (here.size) found.push({ page, numbers: here })
  }
  return found
}
function add(
  mupdf: Engine,
  session: EditSession,
  pageIndex: number,
  box: Box,
  spec: FieldSpec
) {
  const { doc } = session,
    form = formOf(mupdf, doc)
  if (nameTaken(fieldNames(doc), spec.name))
    throw new Error("That field name is already used. Give it a unique name.")
  const tx = ["text", "multiline", "date"].includes(spec.kind),
    radio = spec.kind === "radio"
  const field = doc.addObject({
    FT: doc.newName(
      tx
        ? "Tx"
        : spec.kind === "check" || radio
          ? "Btn"
          : spec.kind === "signature"
            ? "Sig"
            : "Ch"
    ),
    T: doc.newString(spec.name),
    TU: doc.newString(spec.tooltip),
    Ff:
      (spec.required ? 2 : 0) |
      (spec.kind === "multiline" ? 1 << 12 : 0) |
      (radio ? (1 << 15) | (1 << 14) : 0) |
      (spec.kind === "choice" ? 1 << 17 : 0) |
      (spec.kind === "list" && spec.multiple ? 1 << 21 : 0),
    DA: doc.newString("/KSFormHelvetica 11 Tf 0 g"),
  })
  if (tx && spec.maxLength) field.put("MaxLen", spec.maxLength)
  if (spec.kind === "date")
    field.put("AA", {
      F: { S: doc.newName("JavaScript"), JS: doc.newString(DATE_ACTION) },
    })
  if (spec.kind === "choice" || spec.kind === "list")
    field.put(
      "Opt",
      spec.options.map((option) => doc.newString(option))
    )
  if (radio) {
    field.put("Kids", doc.newArray())
    field.put(
      "Opt",
      spec.options.map((option) => doc.newString(option))
    )
  }
  const numbers = new Set<number>()
  withPage(doc, pageIndex, (page) => {
    const pageObject = page.getObject(),
      size = page.getBounds(),
      fitted = fitField(box, {
        width: size[2] - size[0],
        height: size[3] - size[1],
      })
    if (radio && fitted.height / spec.options.length < 8)
      throw new Error("Make the radio group taller so every choice has room.")
    if (!pageObject.get("Annots").isArray())
      pageObject.put("Annots", doc.newArray())
    const count = radio ? spec.options.length : 1
    for (let at = 0; at < count; at++) {
      const place = radio ? doc.addObject({ Parent: field }) : field
      place.put("Type", doc.newName("Annot"))
      place.put("Subtype", doc.newName("Widget"))
      place.put("F", 4)
      place.put("P", pageObject)
      place.put("MK", { BC: [0, 0, 0], BG: [1, 1, 1], R: turnOf(pageObject) })
      place.put("BS", { W: 1, S: doc.newName("S") })
      const rect = radio
        ? {
            ...fitted,
            y: fitted.y + (at * fitted.height) / count,
            height: fitted.height / count,
          }
        : fitted
      putBox(doc, page, place, rect)
      if (radio || spec.kind === "check") {
        place.put("KSFormOn", doc.newString(radio ? `Choice${at + 1}` : "Yes"))
        place.put("AS", doc.newName("Off"))
        place.put("MK", { CA: doc.newString(radio ? "l" : "4") })
        if (radio) place.put("KSFormOption", doc.newString(spec.options[at]))
        field.put("V", doc.newName("Off"))
      }
      if (radio) field.get("Kids").push(place)
      pageObject.get("Annots").push(place)
      numbers.add(place.asIndirect())
    }
  })
  form.get("Fields").push(field)
  refresh(mupdf, session, pageIndex, numbers)
}
export function applyMakeFields(
  mupdf: Engine,
  session: EditSession,
  asked: MakeFieldChange
): number[] {
  const ops = asked.ops.map((op) => {
    const read = readMakeFieldOp(op)
    if (!read) throw new Error("That is not a change to form fields.")
    return read
  })
  if (!session.doc.getTrailer().get("Root", "AcroForm", "XFA").isNull())
    throw new Error(
      "XFA forms cannot be changed here. Use a PDF with ordinary AcroForm fields."
    )
  return inStep(
    session,
    asked.label,
    (touch) => {
      for (const op of ops) {
        const { doc } = session
        if (op.page >= doc.countPages())
          throw new Error("That page is not in this file.")
        if (op.do === "add") {
          add(mupdf, session, op.page, op.box, op.field)
          touch(op.page)
          continue
        }
        const found = withPage(doc, op.page, (page) => {
          const widget = page
            .getWidgets()
            .find((w) => `f${w.getObject().asIndirect()}` === op.id)
          return widget
            ? {
                place: widget.getObject(),
                name: widget.getName(),
                kind: widget.getFieldType(),
              }
            : null
        })
        if (!found) throw new Error("That field is no longer on this page.")
        const field = holderOf(found.place)
        if (!field.isDictionary() || found.kind === "button")
          throw new Error("That kind of field cannot be changed here.")
        if (found.kind === "signature" && !field.get("V").isNull())
          throw new Error(
            "A certificate signature field cannot be changed here."
          )
        const places = placesOf(doc, field)
        if (op.do === "delete") {
          for (const here of places) {
            const notes = doc.findPage(here.page).get("Annots")
            for (let at = notes.length - 1; at >= 0; at--)
              if (
                notes.get(at).isIndirect() &&
                here.numbers.has(notes.get(at).asIndirect())
              )
                notes.delete(at)
            touch(here.page)
          }
          // Remove the whole logical field, including all radio/repeated widgets.
          if (field.get("Kids").isArray()) {
            const children: Obj[] = []
            field.get("Kids").forEach((child) => void children.push(child))
            for (const child of children) dropWidget(doc, child)
          } else dropWidget(doc, field)
          continue
        }
        if (op.do === "properties") {
          const prefix = found.name.slice(0, found.name.lastIndexOf(".") + 1),
            next = `${prefix}${op.name}`
          if (
            fieldNames(doc).some(
              (name) =>
                name !== found.name &&
                (name === next || name.startsWith(`${next}.`))
            )
          )
            throw new Error(
              "That field name is already used. Give it a unique name."
            )
          const bits = flagsOf(field),
            required = op.required ? bits | 2 : bits & ~2
          const max = field.get("MaxLen"),
            maxLength = max.isNumber() ? max.asNumber() : 0
          const hint = field.get("TU"),
            tooltip = hint.isString() ? hint.asString() : ""
          if (
            next === found.name &&
            tooltip === op.tooltip &&
            required === bits &&
            (found.kind !== "text" || maxLength === op.maxLength)
          )
            continue
          field.put("T", doc.newString(op.name))
          field.put("TU", doc.newString(op.tooltip))
          field.put("Ff", required)
          if (found.kind === "text") {
            if (op.maxLength) field.put("MaxLen", op.maxLength)
            else field.delete("MaxLen")
          }
          for (const here of places) {
            refresh(mupdf, session, here.page, here.numbers)
            touch(here.page)
          }
        } else {
          // Only this widget moves: the other choices of a radio group stay put.
          withPage(doc, op.page, (page) => {
            const bounds = page.getBounds(),
              box = fitField(op.box, {
                width: bounds[2] - bounds[0],
                height: bounds[3] - bounds[1],
              })
            putBox(doc, page, found.place, box)
          })
          refresh(mupdf, session, op.page, new Set([found.place.asIndirect()]))
          touch(op.page)
        }
      }
    },
    { kind: "make-fields", change: { label: asked.label, ops } }
  )
}
canDo("make-fields", applyMakeFields)
