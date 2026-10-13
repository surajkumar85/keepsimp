/**
 * The links of a page, in the engine: where they lie and lead, and
 * changing them.
 *
 * A link is a note on the page of the kind "Link", with a box and
 * somewhere to lead. The box and where it leads are written into that note
 * ourselves, in the page's own measure: the engine's own way of placing a
 * link writes the place as the page is shown, which is upside down in the
 * file. Where a link that is already there leads is asked of the engine,
 * which knows every way a file can say it.
 */
import type * as MuPDF from "mupdf"
import type { Box } from "./geometry"
import {
  readLinkOp,
  sameBox,
  sameTarget,
  type LinkChange,
  type LinkOp,
  type LinkTarget,
  type PageLink,
} from "./links"
import { canDo, inStep, withPage, type EditSession } from "./mupdf-edit"
import { inverse, type Matrix } from "./retext"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

const through = (matrix: Matrix, x: number, y: number) => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
})

/** The notes of a page that are links, in the order the file has them. */
function notesOf(page: MuPDF.PDFPage) {
  const notes = page.getObject().get("Annots")
  const links: Obj[] = []
  if (notes.isArray())
    notes.forEach((note) => {
      const rect = note.get("Rect")
      if (
        note.isDictionary() &&
        note.get("Subtype").asName() === "Link" &&
        rect.isArray() &&
        rect.length === 4
      )
        links.push(note)
    })
  return links
}

/** Where a link's note lies, as the page is shown. */
function boxOf(page: MuPDF.PDFPage, note: Obj): Box {
  const shown = page.getTransform() as Matrix
  const rect = note.get("Rect")
  const one = through(shown, rect.get(0).asNumber(), rect.get(1).asNumber())
  const two = through(shown, rect.get(2).asNumber(), rect.get(3).asNumber())
  const x = Math.min(one.x, two.x)
  const y = Math.min(one.y, two.y)
  return {
    x,
    y,
    width: Math.max(one.x, two.x) - x,
    height: Math.max(one.y, two.y) - y,
  }
}

/** The links of a page with where they lie and lead. */
function read(doc: Doc, page: MuPDF.PDFPage) {
  // Where each link leads, as the engine reads it, by where it lies.
  const known = page.getLinks().map((link) => {
    const [left, top, right, bottom] = link.getBounds()
    let to: LinkTarget | null = null
    try {
      if (link.isExternal()) to = { url: link.getURI() }
      else {
        const target = doc.resolveLink(link)
        if (target >= 0 && target < doc.countPages()) to = { page: target }
      }
    } catch {
      // A link that leads nowhere the engine can find leads to nothing known.
    }
    return {
      box: { x: left, y: top, width: right - left, height: bottom - top },
      to,
      taken: false,
    }
  })
  return notesOf(page).map((note, index) => {
    const box = boxOf(page, note)
    const match = known.find((one) => !one.taken && sameBox(one.box, box))
    if (match) match.taken = true
    return { note, link: { index, box, to: match?.to ?? null } as PageLink }
  })
}

/** The links of a page, in the order the file has them. */
export function linksOn(session: EditSession, index: number): PageLink[] {
  return withPage(session.doc, index, (page) =>
    read(session.doc, page).map((one) => one.link)
  )
}

/** Write where a link lies, in the page's own measure. */
function place(doc: Doc, page: MuPDF.PDFPage, note: Obj, box: Box) {
  const back = inverse(page.getTransform() as Matrix)
  const one = through(back, box.x, box.y)
  const two = through(back, box.x + box.width, box.y + box.height)
  const rect = doc.newArray()
  for (const value of [
    Math.min(one.x, two.x),
    Math.min(one.y, two.y),
    Math.max(one.x, two.x),
    Math.max(one.y, two.y),
  ])
    rect.push(doc.newReal(Math.round(value * 100) / 100))
  note.put("Rect", rect)
  // Corners that were said for where it lay before say nothing now.
  note.delete("QuadPoints")
}

/** Write where a link leads: an address, or a page that is shown whole. */
function lead(doc: Doc, note: Obj, to: LinkTarget) {
  note.delete("Dest")
  note.delete("A")
  note.delete("PA")
  if ("url" in to) {
    const action = doc.newDictionary()
    action.put("S", doc.newName("URI"))
    action.put("URI", doc.newString(to.url))
    note.put("A", action)
    return
  }
  if (to.page >= doc.countPages())
    throw new Error("The file has no such page. Nothing was changed.")
  const dest = doc.newArray()
  dest.push(doc.findPage(to.page))
  dest.push(doc.newName("Fit"))
  note.put("Dest", dest)
}

/** Change one link, or add one. */
function carryOut(session: EditSession, index: number, op: LinkOp) {
  const { doc } = session
  const count = withPage(doc, index, (page) => {
    const before = read(doc, page)
    const object = page.getObject()
    if (op.index === undefined) {
      const note = doc.addObject(doc.newDictionary())
      note.put("Type", doc.newName("Annot"))
      note.put("Subtype", doc.newName("Link"))
      // No frame is drawn around it: it lies over what is on the page.
      const border = doc.newArray()
      for (let side = 0; side < 3; side++) border.push(doc.newInteger(0))
      note.put("Border", border)
      // It is printed with the page, and stays with it.
      note.put("F", doc.newInteger(4))
      place(doc, page, note, op.box!)
      lead(doc, note, op.to!)
      let notes = object.get("Annots")
      if (!notes.isArray()) {
        notes = doc.newArray()
        object.put("Annots", notes)
      }
      notes.push(note)
      return before.length + 1
    }
    const target = before[op.index]
    if (!target || !sameBox(target.link.box, op.at!))
      throw new Error(
        "That link is not on the page as it was. Nothing was changed."
      )
    if (op.remove) {
      const notes = object.get("Annots")
      for (let at = notes.length - 1; at >= 0; at--)
        if (notes.get(at).asIndirect() === target.note.asIndirect()) {
          notes.delete(at)
          break
        }
      return before.length - 1
    }
    if (op.box) place(doc, page, target.note, op.box)
    if (op.to) lead(doc, target.note, op.to)
    return before.length
  })

  // The proof: the page's links are read again, and must be what was meant.
  withPage(doc, index, (page) => {
    const now = read(doc, page).map((one) => one.link)
    const link = now[op.index ?? now.length - 1]
    if (
      now.length !== count ||
      (!op.remove &&
        (!link ||
          (op.box && !sameBox(link.box, op.box)) ||
          (op.to && !sameTarget(link.to, op.to))))
    )
      throw new Error(
        "The link could not be read back from the page. Nothing was changed."
      )
  })
}

/**
 * Change links of pages, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to a link,
 * or a link cannot be changed; the file is then as it was.
 */
export function applyLinks(
  _mupdf: Engine,
  session: EditSession,
  change: LinkChange
): number[] {
  const ops = change.ops.map((op) => {
    const read = readLinkOp(op)
    if (!read) throw new Error("That is not a change to a link.")
    return read
  })
  return inStep(
    session,
    change.label,
    (touch) => {
      for (const op of ops) {
        if (op.page >= session.doc.countPages()) continue
        carryOut(session, op.page, op)
        touch(op.page)
      }
    },
    { kind: "links", change: { label: change.label, ops } }
  )
}
canDo("links", applyLinks)
