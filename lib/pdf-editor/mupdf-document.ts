/**
 * The file as a whole, changed in the working copy: its bookmarks, what
 * it says of itself, and the numbers it gives its own pages. What is to
 * be written is worked out without the engine (`document.ts`).
 */
import type * as MuPDF from "mupdf"
import { bookmarksOf, writeBookmarks } from "@/lib/pdf-merger/mupdf-engine"
import {
  retarget,
  type Bookmark,
  type MergedBookmark,
} from "@/lib/pdf-merger/outline"
import {
  LABEL_STYLES,
  readDocumentOp,
  type Details,
  type DocumentChange,
  type DocumentOp,
  type LabelRun,
  type LabelStyle,
} from "./document"
import { canDo, inStep, type EditSession } from "./mupdf-edit"
import { runsOf } from "./mupdf-pages"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument

const KEYS: Record<keyof Details, string> = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
}

/** What a file says of itself, as its own list of details has it. */
export function detailsOf(doc: Doc): Details {
  const read = (key: string) => doc.getMetaData(`info:${key}`) ?? ""
  return {
    title: read("Title"),
    author: read("Author"),
    subject: read("Subject"),
    keywords: read("Keywords"),
  }
}

/** The runs of the numbers a file gives its own pages; none when it simply counts them. */
export function labelRunsOf(doc: Doc): LabelRun[] {
  return (runsOf(doc) ?? []).map((run) => ({
    start: run.start,
    // A way of writing numbers this editor does not know is counted plainly.
    style: (LABEL_STYLES as readonly string[]).includes(run.style)
      ? (run.style as LabelStyle)
      : "D",
    prefix: run.prefix ?? "",
    first: run.first ?? 1,
  }))
}

/** The file as a whole, as it stands: for the page to show and to change. */
export const documentOf = (session: EditSession) => ({
  details: detailsOf(session.doc),
  bookmarks: bookmarksOf(session.doc),
  runs: labelRunsOf(session.doc),
})

export type DocumentFacts = ReturnType<typeof documentOf>

/** A bookmark as the engine writes it: one that leads to a page of the file leads there in the view it had. */
const written = (items: readonly Bookmark[], pages: number): MergedBookmark[] =>
  items.map((item) => ({
    title: item.title,
    uri:
      item.page === null
        ? item.uri
        : item.page < pages
          ? retarget(item.uri, item.page)
          : undefined,
    open: item.open,
    children: written(item.children, pages),
  }))

function carryOut(session: EditSession, op: DocumentOp) {
  const { doc } = session
  const root = doc.getTrailer().get("Root")
  if (op.do === "bookmarks") {
    // The list is written anew, whole: what it was is no longer named by anything.
    if (!root.get("Outlines").isNull()) root.delete("Outlines")
    if (op.items.length)
      writeBookmarks(doc, written(op.items, doc.countPages()))
    return
  }
  if (op.do === "labels") {
    if (!op.runs.length) {
      if (!root.get("PageLabels").isNull()) root.delete("PageLabels")
      return
    }
    const numbers = doc.newArray()
    for (const run of op.runs) {
      const how = doc.newDictionary()
      if (run.style) how.put("S", doc.newName(run.style))
      if (run.prefix) how.put("P", doc.newString(run.prefix))
      if (run.first !== 1) how.put("St", doc.newInteger(run.first))
      numbers.push(doc.newInteger(run.start))
      numbers.push(how)
    }
    const tree = doc.newDictionary()
    tree.put("Nums", numbers)
    root.put("PageLabels", tree)
    return
  }
  const info = doc.getTrailer().get("Info")
  for (const key of Object.keys(KEYS) as (keyof Details)[]) {
    const value = op.details[key]
    if (value) doc.setMetaData(`info:${KEYS[key]}`, value)
    // A detail that is emptied is taken out, not kept as nothing.
    else if (info.isDictionary() && !info.get(KEYS[key]).isNull())
      info.delete(KEYS[key])
  }
  // A file may say the same things a second time, in a packet of its own
  // (XMP), and programs differ in which they believe. It is taken out, so
  // that the two cannot disagree and what was changed is not kept there.
  if (!root.get("Metadata").isNull()) root.delete("Metadata")
}

/**
 * Change the file as a whole, as one step that can be undone.
 * @returns No pages: none is drawn otherwise.
 */
export function applyDocument(
  _mupdf: Engine,
  session: EditSession,
  asked: DocumentChange
): number[] {
  const ops = asked.ops.map((op) => {
    const read = readDocumentOp(op)
    if (!read) throw new Error("That is not a change to the file.")
    return read
  })
  const pages = inStep(
    session,
    asked.label,
    () => {
      for (const op of ops) carryOut(session, op)
    },
    { kind: "document", change: { label: asked.label, ops } }
  )
  // A step that is made again is counted by whoever makes it again.
  if (!session.again) session.described = (session.described ?? 0) + 1
  return pages
}
canDo("document", applyDocument)
