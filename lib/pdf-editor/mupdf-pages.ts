/**
 * The pages of a file moved, taken out, copied, turned and added to, in
 * the working copy itself. The plan of a change is worked out without the
 * engine (`pages.ts`); this makes the file fit the plan.
 *
 * The engine's own way of putting pages in a new order (`rearrangePages`)
 * is not used: it also throws away the file's tags, attached files, page
 * numbers and the list of its form's fields. Here a page that moves is the
 * same object in another place, and only what led to a page that is taken
 * out goes with it.
 */
import type * as MuPDF from "mupdf"
import { onTurnedPage } from "./objects"
import {
  canDo,
  inStep,
  pageSize,
  rewriteThings,
  turnOf,
  type EditSession,
} from "./mupdf-edit"
import {
  changedBy,
  planOf,
  readPageOp,
  runsAfter,
  whyNot,
  type Lost,
  type PageOp,
  type PagesChange,
  type Plan,
} from "./pages"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

const nameOf = (object: Obj) => (object.isName() ? object.asName() : "")
/** The number an object goes by in the file; 0 for one that is written where it is used. */
const numberOf = (object: Obj) =>
  object.isIndirect() ? object.asIndirect() : 0

/** What a page may leave to the tree of pages above it. */
const INHERITED = ["Resources", "MediaBox", "CropBox", "Rotate"]
/** The most steps taken up or along a chain a damaged file could have tied into a ring. */
const DEEPEST = 64
const MOST_BOOKMARKS = 200_000

/** Write on a page what it leaves to the tree above it, so that it is the same page wherever it is put. */
function standAlone(page: Obj) {
  for (const key of INHERITED)
    if (page.get(key).isNull()) {
      const value = page.getInheritable(key)
      if (!value.isNull()) page.put(key, value)
    }
}

/** A second stream that holds what a stream holds, byte for byte. */
function copyStream(doc: Doc, stream: Obj) {
  const dict = doc.newDictionary()
  stream.forEach((value, key) => {
    if (key !== "Length") dict.put(key as string, value)
  })
  const raw = stream.readRawStream()
  try {
    return doc.addRawStream(raw, dict)
  } finally {
    raw.destroy()
  }
}

/** A stream copied, a list of them copied each; anything else as it is. */
function copyDrawn(doc: Doc, drawn: Obj): Obj {
  if (drawn.isStream()) return copyStream(doc, drawn)
  if (drawn.isArray()) {
    const parts = doc.newArray()
    for (let at = 0; at < drawn.length; at++)
      parts.push(copyDrawn(doc, drawn.get(at)))
    return parts
  }
  if (drawn.isDictionary()) {
    // The looks of a tick box, by its state.
    const states = doc.newDictionary()
    drawn.forEach((value, key) =>
      states.put(key as string, copyDrawn(doc, value))
    )
    return states
  }
  return drawn
}

/**
 * A copy of a page for another place in the same file. It has content of
 * its own, so that words changed on one are not changed on the other, and
 * its own lists of fonts and pictures, which are themselves shared. Notes,
 * links and what the editor added are copied; a form's fields are not,
 * since a field has one place; nor is the page's place in the file's tags.
 */
function copyOfPage(doc: Doc, page: Obj) {
  standAlone(page)
  const copy = doc.addObject(doc.newDictionary())
  page.forEach((value, name) => {
    const key = name as string
    if (["Parent", "Annots", "StructParents", "B"].includes(key)) return
    if (key === "Contents") copy.put(key, copyDrawn(doc, value))
    else if (key === "Resources" && value.isDictionary()) {
      const own = doc.newDictionary()
      value.forEach((list, kind) => {
        if (!list.isDictionary() || list.isStream()) {
          own.put(kind as string, list)
          return
        }
        const names = doc.newDictionary()
        list.forEach((entry, entryName) =>
          names.put(entryName as string, entry)
        )
        own.put(kind as string, names)
      })
      copy.put(key, own)
    } else copy.put(key, value)
  })
  const annotations = page.get("Annots")
  if (!annotations.isArray()) return copy
  const twins = doc.newArray()
  /** The copy of each note, by the number of the note it is a copy of. */
  const twinOf = new Map<number, Obj>()
  const answers: { twin: Obj; to: number }[] = []
  for (let at = 0; at < annotations.length; at++) {
    const annotation = annotations.get(at)
    if (!annotation.isDictionary()) continue
    const kind = nameOf(annotation.get("Subtype"))
    if (kind === "Widget" || kind === "Popup") continue
    const twin = doc.addObject(doc.newDictionary())
    annotation.forEach((entry, name) => {
      const key = name as string
      if (["P", "Popup", "IRT", "StructParent", "Parent"].includes(key)) return
      twin.put(key, key === "AP" ? copyDrawn(doc, entry) : entry)
    })
    twin.put("P", copy)
    twins.push(twin)
    if (numberOf(annotation)) twinOf.set(numberOf(annotation), twin)
    const answered = numberOf(annotation.get("IRT"))
    if (answered) answers.push({ twin, to: answered })
  }
  // An answer to a note answers the note's copy.
  for (const { twin, to } of answers) {
    const note = twinOf.get(to)
    if (note) twin.put("IRT", note)
  }
  if (twins.length) copy.put("Annots", twins)
  return copy
}

/** Which page a place in the file is on, by the page's number; 0 when it is none of this file's. */
function pageLedTo(doc: Doc, dest: Obj, names: () => Names): number {
  let place = dest
  for (let depth = 0; depth < 4; depth++) {
    if (place.isArray()) return place.length ? numberOf(place.get(0)) : 0
    if (place.isDictionary()) place = place.get("D")
    else if (place.isString() || place.isName()) {
      const name = place.isString() ? place.asString() : place.asName()
      const found = names()(name)
      if (!found) return 0
      place = found
    } else return 0
  }
  return 0
}

type Names = (name: string) => Obj | null

/** The places of a file that go by a name, looked up when one is first asked for. */
function namesOf(doc: Doc): () => Names {
  let look: Names | null = null
  return () => {
    if (look) return look
    const root = doc.getTrailer().get("Root")
    // The engine cannot load a tree of names that is not there.
    const tree: Record<string, Obj> = root.get("Names", "Dests").isNull()
      ? {}
      : doc.loadNameTree("Dests")
    const old = root.get("Dests")
    look = (name) => {
      const found = tree[name] ?? (old.isDictionary() ? old.get(name) : null)
      return found && !found.isNull() ? found : null
    }
    return look
  }
}

/** Which page a link, a bookmark or an action leads to; 0 when to none of this file's. */
function leadsTo(doc: Doc, holder: Obj, names: () => Names) {
  const dest = holder.get("Dest")
  if (!dest.isNull()) return pageLedTo(doc, dest, names)
  const action = holder.get("A")
  return action.isDictionary() && nameOf(action.get("S")) === "GoTo"
    ? pageLedTo(doc, action.get("D"), names)
    : 0
}

/** Take a field's place off the form; a field that is left without any place goes too. */
function dropWidget(doc: Doc, widget: Obj) {
  let fields = 0
  let node = widget
  const form = doc.getTrailer().get("Root", "AcroForm")
  for (let depth = 0; depth < DEEPEST; depth++) {
    const parent = node.get("Parent")
    const list = parent.isDictionary()
      ? parent.get("Kids")
      : form.isDictionary()
        ? form.get("Fields")
        : null
    if (!list?.isArray()) break
    const number = numberOf(node)
    for (let at = list.length - 1; at >= 0; at--)
      if (number && numberOf(list.get(at)) === number) list.delete(at)
    if (!node.get("T").isNull()) fields++
    if (!parent.isDictionary() || list.length > 0) break
    node = parent
  }
  // What is worked out in an order names fields: not this one any more.
  const order = form.isDictionary() ? form.get("CO") : null
  const gone = numberOf(widget)
  if (order?.isArray() && gone)
    for (let at = order.length - 1; at >= 0; at--)
      if (numberOf(order.get(at)) === gone) order.delete(at)
  return fields
}

/**
 * Take bookmarks that lead to pages that are gone out of the list of
 * bookmarks. One that has others beneath it stays as a heading that leads
 * nowhere.
 * @returns How many were taken out.
 */
function pruneBookmarks(doc: Doc, gone: Set<number>, names: () => Names) {
  const root = doc.getTrailer().get("Root", "Outlines")
  if (!root.isDictionary()) return 0
  let taken = 0
  let seen = 0
  const prune = (parent: Obj, depth: number) => {
    let item = parent.get("First")
    while (item.isDictionary() && seen++ < MOST_BOOKMARKS) {
      const next = item.get("Next")
      if (depth < DEEPEST) prune(item, depth + 1)
      if (gone.has(leadsTo(doc, item, names))) {
        if (item.get("First").isDictionary()) {
          item.delete("Dest")
          item.delete("A")
        } else {
          const before = item.get("Prev")
          if (before.isDictionary())
            if (next.isDictionary()) before.put("Next", next)
            else before.delete("Next")
          else if (next.isDictionary()) parent.put("First", next)
          else parent.delete("First")
          if (next.isDictionary())
            if (before.isDictionary()) next.put("Prev", before)
            else next.delete("Prev")
          else if (before.isDictionary()) parent.put("Last", before)
          else parent.delete("Last")
          taken++
        }
      }
      item = next
    }
  }
  prune(root, 0)
  if (!taken) return 0
  // How many each shows beneath it is counted afresh; one that was shut stays shut.
  seen = 0
  const count = (parent: Obj, depth: number): number => {
    let shown = 0
    let item = parent.get("First")
    while (item.isDictionary() && seen++ < MOST_BOOKMARKS) {
      const was = item.get("Count")
      const open = was.isNumber() && was.asNumber() > 0
      const beneath = depth < DEEPEST ? count(item, depth + 1) : 0
      if (beneath) item.put("Count", open ? beneath : -beneath)
      else item.delete("Count")
      shown += 1 + (open ? beneath : 0)
      item = item.get("Next")
    }
    return shown
  }
  const all = count(root, 0)
  if (all) root.put("Count", all)
  else doc.getTrailer().get("Root").delete("Outlines")
  return taken
}

/** Take the entry for a number out of a tree of numbers, and say what it held. */
function takeNumber(node: Obj, key: number, depth = 0): Obj | null {
  if (!node.isDictionary()) return null
  const numbers = node.get("Nums")
  if (numbers.isArray())
    for (let at = 0; at + 1 < numbers.length; at += 2) {
      const number = numbers.get(at)
      if (!number.isNumber() || number.asNumber() !== key) continue
      const held = numbers.get(at + 1)
      numbers.delete(at + 1)
      numbers.delete(at)
      return held
    }
  const kids = node.get("Kids")
  if (kids.isArray() && depth < DEEPEST)
    for (let at = 0; at < kids.length; at++) {
      const found = takeNumber(kids.get(at), key, depth + 1)
      if (found) return found
    }
  return null
}

/**
 * Take the pieces of a page out of one part of a tagged file. A part that
 * holds nothing any more is taken out of the part it belongs to, and so on
 * upwards, so that what it said its pieces show goes with them.
 * @param gone The page's number in the file.
 */
function dropPieces(root: Obj, part: Obj, gone: number) {
  const own = numberOf(part.get("Pg"))
  const onPage = (kid: Obj) => {
    if (kid.isNumber()) return own === gone
    if (!kid.isDictionary()) return false
    const type = nameOf(kid.get("Type"))
    if (type === "MCR") return (numberOf(kid.get("Pg")) || own) === gone
    if (type !== "OBJR") return false
    // A link, a note or a field that is itself a piece: it is on the page it names.
    const piece = kid.get("Obj")
    const page =
      numberOf(kid.get("Pg")) ||
      (piece.isDictionary() ? numberOf(piece.get("P")) : 0)
    return (page || own) === gone
  }
  /** Take the kids that are to go out of a part's list, and say how many are left. */
  const prune = (holder: Obj, goes: (kid: Obj) => boolean) => {
    const kids = holder.get("K")
    if (!kids.isArray()) {
      if (!kids.isNull() && goes(kids)) holder.delete("K")
      return holder.get("K").isNull() ? 0 : 1
    }
    for (let at = kids.length - 1; at >= 0; at--)
      if (goes(kids.get(at))) kids.delete(at)
    return kids.length
  }
  let left = prune(part, onPage)
  if (own === gone) part.delete("Pg")
  let node = part
  for (let depth = 0; left === 0 && depth < DEEPEST; depth++) {
    const parent = node.get("P")
    const number = numberOf(node)
    if (!parent.isDictionary() || !number) break
    left = prune(parent, (kid) => numberOf(kid) === number)
    // The root of them all stays, with nothing beneath it if need be.
    if (numberOf(parent) === numberOf(root)) break
    node = parent
  }
}

/** Take what a page held out of the parts a tagged file says it is built of. */
function forgetTags(doc: Doc, page: Obj) {
  // Nothing can be asked of what is not there: the engine fails on it.
  const root = doc.getTrailer().get("Root", "StructTreeRoot")
  if (!root.isDictionary()) return
  const tree = root.get("ParentTree")
  if (!tree.isDictionary()) return
  const gone = numberOf(page)
  const drop = (key: Obj) => {
    if (!key.isNumber()) return
    const held = takeNumber(tree, key.asNumber())
    if (!held) return
    const parts = held.isArray()
      ? Array.from({ length: held.length }, (_, at) => held.get(at))
      : [held]
    const done = new Set<number>()
    for (const part of parts) {
      const number = numberOf(part)
      if (!part.isDictionary() || done.has(number)) continue
      if (number) done.add(number)
      dropPieces(root, part, gone)
    }
  }
  drop(page.get("StructParents"))
  const annotations = page.get("Annots")
  if (annotations.isArray())
    for (let at = 0; at < annotations.length; at++) {
      const annotation = annotations.get(at)
      if (annotation.isDictionary()) drop(annotation.get("StructParent"))
    }
}

/**
 * Pages that were taken out of the list of pages are taken out of the
 * rest of the file: links and bookmarks that led to them, the fields that
 * were on them, their pieces in the parts a tagged file is built of, and
 * at last everything the pages held, so that nothing that still names one
 * of them can bring its content along.
 */
function forget(doc: Doc, pages: readonly Obj[]): Lost {
  const lost: Lost = { links: 0, bookmarks: 0, fields: 0 }
  const gone = new Set(pages.map(numberOf))
  const names = namesOf(doc)
  for (let index = 0; index < doc.countPages(); index++) {
    const annotations = doc.findPage(index).get("Annots")
    if (!annotations.isArray()) continue
    for (let at = annotations.length - 1; at >= 0; at--) {
      const annotation = annotations.get(at)
      if (
        annotation.isDictionary() &&
        nameOf(annotation.get("Subtype")) === "Link" &&
        gone.has(leadsTo(doc, annotation, names))
      ) {
        annotations.delete(at)
        lost.links++
      }
    }
  }
  lost.bookmarks = pruneBookmarks(doc, gone, names)
  const root = doc.getTrailer().get("Root")
  const opening = root.get("OpenAction")
  const opensAt = opening.isArray()
    ? pageLedTo(doc, opening, names)
    : opening.isDictionary() && nameOf(opening.get("S")) === "GoTo"
      ? pageLedTo(doc, opening.get("D"), names)
      : 0
  if (gone.has(opensAt)) root.delete("OpenAction")
  for (const page of pages) {
    const annotations = page.get("Annots")
    if (annotations.isArray())
      for (let at = 0; at < annotations.length; at++) {
        const annotation = annotations.get(at)
        if (
          annotation.isDictionary() &&
          nameOf(annotation.get("Subtype")) === "Widget"
        )
          lost.fields += dropWidget(doc, annotation)
      }
    forgetTags(doc, page)
    const keys: string[] = []
    page.forEach((_value, key) => keys.push(key as string))
    for (const key of keys) page.delete(key)
  }
  return lost
}

/** A run of the page numbers a file gives its own pages: where it begins, and how it counts. */
interface Run {
  start: number
  /** How the numbers are written: "D" for 1, 2, 3; "r" for i, ii, iii; and so on. None for no number. */
  style: string
  /** What is written ahead of each number. */
  prefix: string | null
  /** The number the run begins with, when that is not 1. */
  first: number | null
}

/** The runs of a file's own page numbers, in order; null when it simply counts its pages. */
function runsOf(doc: Doc): Run[] | null {
  const tree = doc.getTrailer().get("Root").get("PageLabels")
  if (!tree.isDictionary()) return null
  const runs: Run[] = []
  const read = (node: Obj, depth: number) => {
    if (!node.isDictionary()) return
    const numbers = node.get("Nums")
    if (numbers.isArray())
      for (let at = 0; at + 1 < numbers.length; at += 2) {
        const start = numbers.get(at)
        const how = numbers.get(at + 1)
        if (!start.isNumber() || !how.isDictionary()) continue
        const prefix = how.get("P")
        const first = how.get("St")
        runs.push({
          start: start.asNumber(),
          style: nameOf(how.get("S")),
          prefix: prefix.isString() ? prefix.asString() : null,
          first: first.isNumber() ? first.asNumber() : null,
        })
      }
    const kids = node.get("Kids")
    if (kids.isArray() && depth < DEEPEST)
      for (let at = 0; at < kids.length; at++) read(kids.get(at), depth + 1)
  }
  read(tree, 0)
  runs.sort((a, b) => a.start - b.start)
  // Pages ahead of the first run are simply counted.
  if (runs[0]?.start !== 0)
    runs.unshift({ start: 0, style: "D", prefix: null, first: null })
  return runs
}

/**
 * Write the runs of a file's own page numbers as they are after a change.
 * The engine keeps them itself when a page is put in or taken out, and
 * gets it wrong at the front of a file: a page put there is numbered 1 and
 * the count begins anew after it, also in a file that numbered nothing.
 * So what the file had is read before the change and written after it.
 */
function writeRuns(
  doc: Doc,
  runs: Run[] | null,
  after: { run: number; at: number }[]
) {
  const root = doc.getTrailer().get("Root")
  if (!runs) {
    if (!root.get("PageLabels").isNull()) root.delete("PageLabels")
    return
  }
  const numbers = doc.newArray()
  for (const { run, at } of after) {
    const { style, prefix, first } = runs[run]
    const how = doc.newDictionary()
    if (style) how.put("S", doc.newName(style))
    if (prefix !== null) how.put("P", doc.newString(prefix))
    if (first !== null) how.put("St", doc.newInteger(first))
    numbers.push(doc.newInteger(at))
    numbers.push(how)
  }
  const tree = doc.newDictionary()
  tree.put("Nums", numbers)
  root.put("PageLabels", tree)
}

/** Make one change to the list of pages. */
function change(
  mupdf: Engine,
  session: EditSession,
  op: PageOp,
  plan: Plan
): Lost {
  const { doc } = session
  const none: Lost = { links: 0, bookmarks: 0, fields: 0 }
  if (op.do === "turn") {
    for (const index of op.pages) {
      const shown = pageSize(session, index)
      const page = doc.findPage(index)
      page.put("Rotate", (turnOf(page) + op.by) % 360)
      // What the editor added stays where it is on what the page shows.
      rewriteThings(mupdf, session, index, (thing) =>
        onTurnedPage(thing, shown, op.by)
      )
    }
    return none
  }
  if (op.do === "blank") {
    const { width, height } = op.size
    doc.insertPage(
      op.at === doc.countPages() ? -1 : op.at,
      doc.addPage([0, 0, width, height], 0, doc.newDictionary(), "")
    )
    return none
  }
  if (op.do === "copy") {
    const copies = op.pages.map((index) => copyOfPage(doc, doc.findPage(index)))
    const after = op.pages[op.pages.length - 1] + 1
    copies.forEach((copy, at) =>
      doc.insertPage(after + at === doc.countPages() ? -1 : after + at, copy)
    )
    return none
  }
  const pages = op.pages.map((index) => doc.findPage(index))
  if (op.do === "move") for (const page of pages) standAlone(page)
  for (const index of [...op.pages].reverse()) doc.deletePage(index)
  if (op.do === "delete") return forget(doc, pages)
  // Where the first of them is in the plan is where they go, one after another.
  const first = plan.findIndex(
    (page) => "was" in page && page.was === op.pages[0]
  )
  pages.forEach((page, at) =>
    doc.insertPage(first + at === doc.countPages() ? -1 : first + at, page)
  )
  return none
}

/**
 * Change the list of pages, as one step that can be undone.
 * @returns The pages to draw again, counted from 0 as they are afterwards;
 *   also places past the end, when the file has fewer pages than before.
 * @throws When a change does not fit the file, with why.
 */
export function applyPages(
  mupdf: Engine,
  session: EditSession,
  asked: PagesChange
): number[] {
  const ops = asked.ops.map((op) => {
    const read = readPageOp(op)
    if (!read) throw new Error("That is not a change to pages.")
    return read
  })
  const made: PagesChange = { label: asked.label, ops }
  const lost: Lost[] = []
  const pages = inStep(
    session,
    asked.label,
    (touch) => {
      for (const op of ops) {
        const count = session.doc.countPages()
        const plan = planOf(count, op)
        if (!plan)
          throw new Error(whyNot(count, op) || "The pages are already so.")
        const runs = op.do === "turn" ? null : runsOf(session.doc)
        lost.push(change(mupdf, session, op, plan))
        if (op.do !== "turn")
          writeRuns(
            session.doc,
            runs,
            runsAfter(
              (runs ?? []).map((run) => run.start),
              plan,
              op.do === "move" ? op.pages : []
            )
          )
        for (const page of changedBy(count, plan)) touch(page)
      }
    },
    // What went with the pages is the same whenever the step is made again.
    { kind: "pages", change: made }
  )
  // A step that is made again is counted by whoever makes it again.
  if (!session.again) {
    made.lost = lost
    session.laidOut = (session.laidOut ?? 0) + 1
  }
  return pages
}
canDo("pages", applyPages)
