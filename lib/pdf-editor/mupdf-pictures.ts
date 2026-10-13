/**
 * The pictures a page already has, in the engine: where they are, and
 * changing them.
 *
 * A picture is changed by writing again the one instruction of the page's
 * content that draws it (see `page-pictures.ts`). The page's content is
 * read as one text, that instruction is exchanged, and the whole is put
 * back as the page's content. Afterwards the page is read again: its other
 * pictures must be where they were, its text must say what it said, and
 * the picture must be where it was meant to go, or the change is not made.
 */
import type * as MuPDF from "mupdf"
import { canDo, inStep, withPage, type EditSession } from "./mupdf-edit"
import { marksOn } from "./mupdf-text"
import {
  boxOf,
  cutPart,
  drawing,
  fitInto,
  isUpright,
  leadFor,
  picturesIn,
  readPictureOp,
  sameMatrix,
  type Drawn,
  type PagePicture,
  type PictureChange,
  type PictureOp,
} from "./page-pictures"
import { concat, type Matrix } from "./retext"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject

/** Bytes as a text with a letter for each, and back: a page's content is not words in any language. */
function textOf(bytes: Uint8Array) {
  let text = ""
  for (let at = 0; at < bytes.length; at += 8192)
    text += String.fromCharCode(...bytes.subarray(at, at + 8192))
  return text
}
const bytesOf = (text: string) =>
  Uint8Array.from(text, (letter) => letter.charCodeAt(0) & 255)

/** A page's content as one text: its parts one after another, as a reader of the file takes them. */
function contentOf(page: Obj) {
  const contents = page.get("Contents")
  const parts: Obj[] = contents.isArray()
    ? Array.from({ length: contents.length }, (_, at) => contents.get(at))
    : [contents]
  return parts
    .map((part) =>
      part.isStream() ? textOf(part.readStream().asUint8Array()) : ""
    )
    .join("\n")
}

/** The things a page can draw by name, from the page itself or from what it inherits. */
const drawable = (page: Obj) => page.getInheritable("Resources").get("XObject")

/** A picture the page draws, with what is needed to write it again. */
interface Found extends Drawn {
  /** Where it is as the page is shown. */
  at: Matrix
  picture: PagePicture
}

/** The pictures of a page with where its content draws them, and that content. */
function read(page: MuPDF.PDFPage) {
  const object = page.getObject()
  const things = drawable(object)
  const sizes = new Map<string, { width: number; height: number }>()
  if (things.isDictionary())
    things.forEach((thing, name) => {
      if (thing.get("Subtype").asName() === "Image")
        sizes.set(String(name), {
          width: thing.get("Width").asNumber(),
          height: thing.get("Height").asNumber(),
        })
    })
  const content = contentOf(object)
  const shown = page.getTransform() as Matrix
  const found: Found[] = picturesIn(content, (name) => sizes.has(name)).map(
    (drawn, index) => {
      const at = concat(drawn.ctm, shown)
      return {
        ...drawn,
        at,
        picture: {
          index,
          at,
          box: boxOf(at, drawn.part),
          upright: isUpright(at),
          cut: drawn.part !== null,
          ...sizes.get(drawn.name)!,
        },
      }
    }
  )
  return { content, found }
}

/** The pictures of a page that can be changed, in the order the page draws them. */
export function picturesOn(session: EditSession, index: number): PagePicture[] {
  return withPage(session.doc, index, (page) =>
    read(page).found.map((one) => one.picture)
  )
}

/**
 * The list of things a page draws by name, as the page's own: a page often
 * shares that list with other pages, and what is changed here is this
 * page's alone.
 */
function ownDrawable(doc: Doc, page: Obj) {
  const resources = doc.newDictionary()
  const inherited = page.getInheritable("Resources")
  if (inherited.isDictionary())
    inherited.forEach((value, key) => void resources.put(key, value))
  const things = doc.newDictionary()
  const before = resources.get("XObject")
  if (before.isDictionary())
    before.forEach((value, key) => void things.put(key, value))
  resources.put("XObject", things)
  page.put("Resources", resources)
  return things
}

const mark = (picture: PagePicture) =>
  `${picture.width}x${picture.height}@${picture.at.map((value) => Math.round(value * 10) / 10).join(",")}/${picture.cut}`

/** Change one picture. */
function carryOut(
  mupdf: Engine,
  session: EditSession,
  index: number,
  op: PictureOp
) {
  const { doc } = session
  const words = marksOn(mupdf, session, index)
  withPage(doc, index, (page) => {
    const { content, found } = read(page)
    const target = found[op.index]
    if (!target || !sameMatrix(target.at, op.at))
      throw new Error(
        "That picture is not on the page as it was. Nothing was changed."
      )
    const object = page.getObject()
    let written: string
    /** Where the picture is to be afterwards, and whether only a part of it shows; null when it is gone. */
    let wanted: { at: Matrix; cut: boolean } | null
    if (op.remove) {
      written = ""
      wanted = null
    } else if (op.by) {
      written = drawing(target.name, [leadFor(target.at, op.by)], target.part)
      wanted = { at: concat(target.at, op.by), cut: target.picture.cut }
    } else if (op.picture) {
      const picture = session.pictures.get(op.picture)
      if (!picture)
        throw new Error("The picture that was chosen has not been handed over.")
      const [left, bottom, width, height] = target.part ?? [0, 0, 1, 1]
      // Where the old one showed, and in it the new one, whole and undistorted.
      const place: Matrix = [width, 0, 0, height, left, bottom]
      const fit = fitInto(boxOf(target.at, target.part), picture.size)
      const added = doc.addImage(picture.image)
      const name = `KSI${added.asIndirect()}`
      ownDrawable(doc, object).put(name, added)
      written = drawing(name, [place, fit])
      wanted = { at: concat(concat(fit, place), target.at), cut: false }
    } else {
      if (op.cut && !target.picture.upright)
        throw new Error(
          "A picture that is turned or mirrored on the page is not cut to a part here. Nothing was changed."
        )
      const part = op.cut ? cutPart(target.part, op.cut) : null
      written = drawing(target.name, [], part)
      wanted = { at: target.at, cut: part !== null }
    }
    const next =
      content.slice(0, target.from) + written + content.slice(target.to)
    object.put("Contents", doc.addStream(bytesOf(next), {}))
    // A picture the page no longer draws is no longer the page's.
    if (
      (op.remove || op.picture) &&
      !picturesIn(next, (name) => name === target.name).length
    )
      ownDrawable(doc, object).delete(target.name)

    // The proof: every other picture is where it was, and this one is where it was meant to go.
    const now = read(page).found.map((one) => one.picture)
    const others = (list: PagePicture[]) =>
      list.filter((_one, at) => at !== op.index).map(mark)
    const expected = found.map((one) => one.picture)
    const rest = wanted ? others(now) : now.map(mark)
    if (
      now.length !== expected.length - (wanted ? 0 : 1) ||
      rest.join("\n") !== others(expected).join("\n") ||
      (wanted &&
        (!sameMatrix(now[op.index].at, wanted.at) ||
          now[op.index].cut !== wanted.cut))
    )
      throw new Error(
        "The picture could not be changed without touching the rest of the page. Nothing was changed."
      )
  })
  if (marksOn(mupdf, session, index).join("\n") !== words.join("\n"))
    throw new Error(
      "The picture could not be changed without touching the page's text. Nothing was changed."
    )
}

/**
 * Change pictures of pages, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to a
 * picture, or a picture cannot be changed; the file is then as it was.
 */
export function applyPictures(
  mupdf: Engine,
  session: EditSession,
  change: PictureChange
): number[] {
  const ops = change.ops.map((op) => {
    const read = readPictureOp(op)
    if (!read) throw new Error("That is not a change to a picture.")
    return read
  })
  return inStep(
    session,
    change.label,
    (touch) => {
      for (const op of ops) {
        if (op.page >= session.doc.countPages()) continue
        carryOut(mupdf, session, op.page, op)
        touch(op.page)
      }
    },
    { kind: "pictures", change: { label: change.label, ops } }
  )
}
canDo("pictures", applyPictures)
