/**
 * A form's fields in the engine: reading the places a page has to fill in,
 * and filling them in as steps of the same list of changes the editor's
 * other work goes into.
 *
 * A field is the file's own and stays one. The engine writes how a filled
 * field looks, the way the format says, so other programs show the same
 * and can fill it in again. A list is the one kind the engine draws
 * nothing for, so its look is written here.
 *
 * Nothing in a file is run. A field that a script would format or work
 * out holds what was typed.
 */
import type * as MuPDF from "mupdf"
import {
  accepts,
  dateFormat,
  labelOf,
  listRows,
  readFieldOp,
  type FieldChange,
  type FieldKind,
  type FieldOp,
  type FormFacts,
  type FormField,
} from "./forms"
import type { Box } from "./geometry"
import {
  canDo,
  heldBy,
  inStep,
  turnOf,
  withPage,
  type EditSession,
} from "./mupdf-edit"
import type { Colour } from "./objects"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject
type Widget = MuPDF.PDFWidget

const KINDS: Partial<Record<string, FieldKind>> = {
  text: "text",
  checkbox: "check",
  radiobutton: "radio",
  combobox: "choice",
  listbox: "list",
  signature: "signature",
  button: "button",
}
/** A field that must be filled in; a drop-down that takes other words; a list that takes several. */
const REQUIRED = 1 << 1
const CUSTOM = 1 << 18
const MULTIPLE = 1 << 21
/** A place that is not shown on the screen. */
const HIDDEN = (1 << 1) | (1 << 5)

const idOf = (widget: Widget) => `f${widget.getObject().asIndirect()}`

/** Ask the engine something a field may not have an answer to. */
function ask<T>(question: () => T, otherwise: T): T {
  try {
    return question()
  } catch {
    return otherwise
  }
}

/** Words the file holds as a string or, when they are long, as a stream. */
const wordsOf = (value: Obj) =>
  value.isString()
    ? value.asString()
    : value.isStream()
      ? value.readStream().asString()
      : ""

/** The field a place belongs to: itself, or the one above it that carries the name. */
function fieldOf(place: Obj) {
  const above = place.get("Parent")
  return place.get("T").isString() || !above.isDictionary() ? place : above
}

/** A colour as a field's look names it: nothing, grey, or red, green and blue. */
function colourOf(value: Obj): Colour | null {
  if (!value.isArray()) return null
  const parts: number[] = []
  for (let at = 0; at < value.length; at++) parts.push(value.get(at).asNumber())
  if (parts.length === 1) return [parts[0], parts[0], parts[0]]
  return parts.length === 3 ? [parts[0], parts[1], parts[2]] : null
}

const boxOf = ([left, top, right, bottom]: MuPDF.Rect): Box => ({
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
})

/** A place of a form as the page needs it; null when it is of no known kind or cannot be seen. */
function read(widget: Widget): FormField | null {
  const kind = KINDS[ask(() => widget.getFieldType(), "")]
  if (!kind || ask(() => widget.getFlags(), 0) & HIDDEN) return null
  const box = boxOf(widget.getBounds())
  if (!(box.width > 0 && box.height > 0)) return null
  const place = widget.getObject()
  const field = fieldOf(place)
  const bits = ask(() => widget.getFieldFlags(), 0)
  const name = ask(() => widget.getName(), "")
  const text = kind === "text"
  const offers = kind === "choice" || kind === "list"
  const state = place.get("AS")
  return {
    id: idOf(widget),
    kind,
    name,
    label: labelOf(
      name,
      ask(() => wordsOf(field.getInheritable("TU")), "")
    ),
    box,
    value:
      kind === "check" || kind === "radio" ? "" : ask(() => heldBy(widget), ""),
    on:
      (kind === "check" || kind === "radio") &&
      state.isName() &&
      state.asName() !== "Off",
    // What is kept in the file, and what a person is shown for it.
    options: offers ? ask(() => widget.getOptions(true), []) : [],
    shown: offers ? ask(() => widget.getOptions(false), []) : [],
    required: Boolean(bits & REQUIRED),
    readOnly: ask(() => widget.isReadOnly(), false),
    ...(kind === "signature" && !field.get("V").isNull()
      ? { signed: true }
      : null),
    multiline: text && ask(() => widget.isMultiline(), false),
    password: text && ask(() => widget.isPassword(), false),
    comb: text && ask(() => widget.isComb(), false),
    maxLength: text
      ? Math.max(
          0,
          ask(() => widget.getMaxLen(), 0)
        )
      : 0,
    multiple: kind === "list" && Boolean(bits & MULTIPLE),
    custom: kind === "choice" && Boolean(bits & CUSTOM),
    date: text
      ? dateFormat(ask(() => wordsOf(field.get("AA", "F", "JS")), ""))
      : null,
  }
}

/** The places a page has to fill in, in the order the file has them. */
export function fieldsOn(session: EditSession, index: number): FormField[] {
  return withPage(session.doc, index, (page) =>
    page
      .getWidgets()
      .map(read)
      .filter((field): field is FormField => field !== null)
  )
}

/** What a file's form is as a whole, from the places its pages have. */
export function formFacts(
  doc: Doc,
  pages: readonly (readonly FormField[])[]
): FormFacts {
  // Asked for by the whole way there: a file without a form has nothing
  // at the end of it, and nothing cannot be asked for its parts.
  const part = (name: string) => doc.getTrailer().get("Root", "AcroForm", name)
  const worked = part("CO")
  return {
    fields: pages.flat().length,
    xfa: !part("XFA").isNull(),
    scripts: worked.isArray() && worked.length > 0,
  }
}

/** Which page each page object is, by the number the file knows it by. */
const pageNumbers = new WeakMap<Doc, Map<number, number>>()

/**
 * The pages a field has places on. A field shown once is on its own page;
 * one shown in several places says where each is, and when one of them does
 * not, every page is looked at.
 */
function pagesOf(doc: Doc, widget: Widget, here: number): number[] {
  const kids = fieldOf(widget.getObject()).get("Kids")
  if (!kids.isArray() || kids.length < 2) return [here]
  const count = doc.countPages()
  let numbers = pageNumbers.get(doc)
  if (!numbers) {
    numbers = new Map()
    for (let index = 0; index < count; index++)
      numbers.set(doc.findPage(index).asIndirect(), index)
    pageNumbers.set(doc, numbers)
  }
  const pages = new Set([here])
  for (let at = 0; at < kids.length; at++) {
    const on = kids.get(at, "P")
    const index = on.isIndirect() ? numbers.get(on.asIndirect()) : undefined
    if (index === undefined) return Array.from({ length: count }, (_, i) => i)
    pages.add(index)
  }
  return [...pages]
}

/**
 * Write how a list looks: its options one to a line, the chosen ones on a
 * tinted bar. The engine writes nothing for a list, and would leave it
 * blank.
 */
export function drawList(mupdf: Engine, page: MuPDF.PDFPage, widget: Widget) {
  const field = read(widget)
  if (!field) return
  const { width, height } = field.box
  const place = widget.getObject()
  const paper = colourOf(place.get("MK", "BG"))
  const edge = colourOf(place.get("MK", "BC"))
  const { size, line, rows } = listRows(
    { options: field.shown, value: chosenShown(field).join("\n") },
    height
  )
  const rgb = mupdf.ColorSpace.DeviceRGB
  const flat = mupdf.Matrix.identity
  const list = new mupdf.DisplayList([0, 0, width, height])
  const device = new mupdf.DisplayListDevice(list)
  const font = new mupdf.Font("Helvetica")
  const frame = new mupdf.Path()
  frame.rect(0, 0, width, height)
  try {
    if (paper) device.fillPath(frame, false, flat, rgb, [...paper], 1)
    device.clipPath(frame, false, flat)
    for (const row of rows) {
      if (row.chosen) {
        const bar = new mupdf.Path()
        bar.rect(1, row.top, width - 1, row.top + line)
        device.fillPath(bar, false, flat, rgb, [0.76, 0.86, 1], 1)
        bar.destroy()
      }
      const words = new mupdf.Text()
      let x = 3
      for (const letter of row.text) {
        const code = letter.codePointAt(0)!
        const glyph = font.encodeCharacter(code)
        // A letter the font has no shape for is left out, as in a text box.
        if (!glyph) continue
        words.showGlyph(
          font,
          [size, 0, 0, -size, x, row.top + line * 0.78],
          glyph,
          code
        )
        x += font.advanceGlyph(glyph) * size
      }
      device.fillText(words, flat, rgb, [0, 0, 0], 1)
      words.destroy()
    }
    device.popClip()
    if (edge)
      device.strokePath(
        frame,
        new mupdf.StrokeState({
          lineWidth: 1,
          lineCap: "Butt",
          lineJoin: "Miter",
          miterLimit: 10,
        }),
        flat,
        rgb,
        [...edge],
        1
      )
    device.close()
    // Set last, with nothing asked of the engine after it: see `write` in
    // mupdf-edit. On a page the file shows turned, it is turned with it.
    widget.setAppearanceFromDisplayList(
      null,
      null,
      mupdf.Matrix.rotate(turnOf(page.getObject())),
      list
    )
  } finally {
    frame.destroy()
    font.destroy()
    device.destroy()
    list.destroy()
  }
}

/** What a list shows for the options it holds as chosen. */
function chosenShown(field: FormField) {
  const chosen = new Set(field.value.split("\n").filter(Boolean))
  return field.shown.filter((_, at) => chosen.has(field.options[at]))
}

/** Carry a change out on one place; the field's name when something was changed. */
function carryOut(doc: Doc, widget: Widget, op: FieldOp): string | null {
  const field = read(widget)
  if (!field) return null
  if (op.do === "turn") {
    if (field.readOnly || (field.kind !== "check" && field.kind !== "radio"))
      return null
    // A round button is turned off by turning another of its field on.
    if (field.on === op.on || (field.kind === "radio" && !op.on)) return null
    widget.toggle()
    return field.name
  }
  const value = accepts(field, op.value)
  if (value === null || value === field.value) return null
  if (field.kind === "text") widget.setTextValue(value)
  else if (field.kind === "choice") {
    widget.setChoiceValue(value)
    // Nothing chosen is nothing held, not an empty word that is chosen.
    if (!value) fieldOf(widget.getObject()).delete("V")
  } else {
    // A list: what is chosen is written as the format has it, one string
    // or several, and the numbers some files keep beside it are dropped
    // rather than left to disagree.
    const chosen = value.split("\n").filter(Boolean)
    const holder = fieldOf(widget.getObject())
    if (!chosen.length) holder.delete("V")
    else if (chosen.length === 1) holder.put("V", doc.newString(chosen[0]))
    else {
      const all = doc.newArray()
      for (const option of chosen) all.push(doc.newString(option))
      holder.put("V", all)
    }
    holder.delete("I")
  }
  return field.name
}

/**
 * Fill fields in, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to fields.
 */
export function applyFields(
  mupdf: Engine,
  session: EditSession,
  change: FieldChange
): number[] {
  const { doc } = session
  const ops = change.ops.map((op) => {
    const read = readFieldOp(op)
    if (!read) throw new Error("That is not a change to a form.")
    return read
  })
  const work = (touch: (page: number) => void) => {
    for (const op of ops) {
      if (op.page >= doc.countPages()) continue
      const changed = withPage(doc, op.page, (page) => {
        const widget = page.getWidgets().find((place) => idOf(place) === op.id)
        if (!widget) return null
        const name = carryOut(doc, widget, op)
        return name === null
          ? null
          : { name, pages: pagesOf(doc, widget, op.page) }
      })
      if (!changed) continue
      // Every place the field is shown in is given its new look, on
      // whichever page it is: a round button that went off, a name that is
      // repeated at the foot of each page.
      for (const index of changed.pages)
        withPage(doc, index, (page) => {
          for (const place of page.getWidgets()) {
            if (ask(() => place.getName(), "") !== changed.name) continue
            touch(index)
            if (KINDS[place.getFieldType()] === "list")
              drawList(mupdf, page, place)
            else place.update()
          }
        })
    }
  }
  return inStep(session, change.label, work, {
    kind: "fields",
    change: { label: change.label, ops },
  })
}
canDo("fields", applyFields)
