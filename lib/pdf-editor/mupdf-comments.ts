/**
 * Comments in the engine: reading the ones a page holds, the file's own
 * among them, and making, changing and removing them as steps of the same
 * list of changes the editor's other work goes into.
 *
 * A comment is one of the PDF's own kinds of note, and the engine draws it
 * the way the format says, so other programs show the same thing.
 */
import type * as MuPDF from "mupdf"
import type { Quad } from "@/lib/pdf-reader/text"
import {
  NOTE_SIZE,
  noteBox,
  readCommentOp,
  type Comment,
  type CommentChange,
  type CommentKind,
  type CommentOp,
  type LetterLine,
  type MarkKind,
  type Reply,
} from "./comments"
import type { Box } from "./geometry"
import { inStep, isComment, withPage, type EditSession } from "./mupdf-edit"
import type { Colour } from "./objects"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Annot = MuPDF.PDFAnnotation

const MARK_TYPES: Record<MarkKind, MuPDF.PDFAnnotationType> = {
  highlight: "Highlight",
  underline: "Underline",
  strike: "StrikeOut",
  squiggle: "Squiggly",
}
const KINDS: Partial<Record<string, CommentKind>> = {
  Highlight: "highlight",
  Underline: "underline",
  StrikeOut: "strike",
  Squiggly: "squiggle",
  Text: "note",
  Ink: "pen",
}
/** An annotation that is printed with its page, and one that stays upright and the same size. */
const PRINTED = 4
const NOTE_FLAGS = PRINTED | 8 | 16

/** The number the file knows an annotation by. */
const numberOf = (annot: Annot) => annot.getObject().asIndirect()
const idOf = (annot: Annot) => `c${numberOf(annot)}`

/** The number of the comment an annotation answers; 0 when it answers none. */
function answers(annot: Annot) {
  const to = annot.getObject().get("IRT")
  return to.isIndirect() ? to.asIndirect() : 0
}

/** A colour as the file writes it (none, grey, RGB or CMYK) as red, green and blue. */
function rgbOf(colour: readonly number[]): Colour | null {
  if (colour.length === 1) return [colour[0], colour[0], colour[0]]
  if (colour.length === 3) return [colour[0], colour[1], colour[2]]
  if (colour.length === 4) {
    const [c, m, y, k] = colour
    return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
  }
  return null
}

/** Ask the engine something an annotation may not have an answer to. */
function ask<T>(question: () => T, otherwise: T): T {
  try {
    return question()
  } catch {
    return otherwise
  }
}

function whenOf(annot: Annot) {
  const time = ask(() => annot.getModificationDate().getTime(), NaN)
  // The engine gives a moment before 1970 for a date that is not there.
  return Number.isFinite(time) && time > 0 ? time : null
}

const boxOf = ([left, top, right, bottom]: readonly number[]): Box => ({
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
})

function read(annot: Annot): Comment {
  const type = annot.getType()
  return {
    id: idOf(annot),
    kind: KINDS[type] ?? "other",
    type,
    box: boxOf(annot.getBounds()),
    quads: annot.hasQuadPoints()
      ? ask(() => annot.getQuadPoints() as unknown as Quad[], [])
      : [],
    strokes: annot.hasInkList()
      ? ask(
          () =>
            annot
              .getInkList()
              .map((stroke) => stroke.map(([x, y]) => ({ x, y }))),
          []
        )
      : [],
    colour: ask(() => rgbOf(annot.getColor()), null),
    opacity: ask(() => annot.getOpacity(), 1),
    weight: annot.hasBorder() ? ask(() => annot.getBorderWidth(), 1) : 1,
    text: ask(() => annot.getContents(), ""),
    author: annot.hasAuthor() ? ask(() => annot.getAuthor(), "") : "",
    when: whenOf(annot),
    replies: [],
  }
}

/**
 * The comments on a page, in the order the file has them, each with the
 * replies it was given. A reply to a reply is listed under the comment the
 * talk began with.
 */
export function commentsOn(session: EditSession, index: number): Comment[] {
  return withPage(session.doc, index, (page) => {
    const annots = page.getAnnotations().filter(isComment)
    const parents = new Map(
      annots.map((annot) => [numberOf(annot), answers(annot)])
    )
    /** The comment a talk began with. A reply to something that is gone stands by itself. */
    const rootOf = (number: number) => {
      let at = number
      for (let step = 0; step < parents.size; step++) {
        const to = parents.get(at)
        if (!to || !parents.has(to)) break
        at = to
      }
      return at
    }
    const comments = new Map<number, Comment>()
    for (const annot of annots)
      if (rootOf(numberOf(annot)) === numberOf(annot))
        comments.set(numberOf(annot), read(annot))
    for (const annot of annots) {
      const root = rootOf(numberOf(annot))
      if (root === numberOf(annot)) continue
      const { id, author, text, when }: Reply = read(annot)
      comments.get(root)!.replies.push({ id, author, text, when })
    }
    for (const comment of comments.values())
      comment.replies.sort((a, b) => (a.when ?? 0) - (b.when ?? 0))
    return [...comments.values()]
  })
}

/** The letters of a page line by line, each with its box, for marks to be laid on words. */
export function lettersOn(session: EditSession, index: number): LetterLine[] {
  return withPage(session.doc, index, (page) => {
    const lines: LetterLine[] = []
    const text = page.toStructuredText("preserve-whitespace")
    try {
      let line: LetterLine = { letters: [], quads: [] }
      text.walk({
        beginLine() {
          line = { letters: [], quads: [] }
        },
        onChar(letter, _origin, _font, _size, quad) {
          line.letters.push(letter)
          line.quads.push([...quad] as unknown as Quad)
        },
        endLine() {
          if (line.letters.some((letter) => letter.trim())) lines.push(line)
        },
      })
    } finally {
      text.destroy()
    }
    return lines
  })
}

function sign(annot: Annot, author: string, when: number) {
  if (author) annot.setAuthor(author)
  const date = new Date(when)
  annot.setCreationDate(date)
  annot.setModificationDate(date)
}

function carryOut(mupdf: Engine, doc: Doc, page: MuPDF.PDFPage, op: CommentOp) {
  const find = (id: string) =>
    page
      .getAnnotations()
      .find((annot) => isComment(annot) && idOf(annot) === id)
  if (op.do === "mark") {
    const annot = page.createAnnotation(MARK_TYPES[op.kind])
    annot.setQuadPoints(op.quads as unknown as MuPDF.Quad[])
    annot.setColor([...op.colour])
    annot.setOpacity(op.opacity)
    annot.setFlags(PRINTED)
    sign(annot, op.author, op.when)
    annot.update()
  } else if (op.do === "note") {
    const [left, top, right, bottom] = page.getBounds()
    const box = noteBox(op.at, { width: right - left, height: bottom - top })
    const annot = page.createAnnotation("Text")
    annot.setRect([box.x, box.y, box.x + NOTE_SIZE, box.y + NOTE_SIZE])
    annot.setIcon("Comment")
    annot.setColor([...op.colour])
    annot.setContents(op.text)
    annot.setFlags(NOTE_FLAGS)
    sign(annot, op.author, op.when)
    annot.update()
  } else if (op.do === "pen") {
    const annot = page.createAnnotation("Ink")
    annot.setInkList(
      op.strokes.map((stroke) =>
        stroke.map((point): MuPDF.Point => [point.x, point.y])
      )
    )
    annot.setColor([...op.colour])
    annot.setBorderWidth(op.weight)
    annot.setOpacity(op.opacity)
    annot.setFlags(PRINTED)
    sign(annot, op.author, op.when)
    annot.update()
  } else if (op.do === "reply") {
    const to = find(op.to)
    if (!to) return
    const annot = page.createAnnotation("Text")
    const [left, top] = to.getBounds()
    annot.setRect([left, top, left + NOTE_SIZE, top + NOTE_SIZE])
    annot.setContents(op.text)
    annot.setFlags(NOTE_FLAGS)
    sign(annot, op.author, op.when)
    annot.getObject().put("IRT", to.getObject())
    annot.getObject().put("RT", doc.newName("R"))
    // A reply is read in the talk it belongs to and draws nothing of its
    // own on the page: it is given an empty look, last of all.
    const nothing = new mupdf.DisplayList([0, 0, 0, 0])
    try {
      annot.setAppearanceFromDisplayList(
        null,
        null,
        mupdf.Matrix.identity,
        nothing
      )
    } finally {
      nothing.destroy()
    }
  } else if (op.do === "edit") {
    const annot = find(op.id)
    if (!annot) return
    const kind = KINDS[annot.getType()]
    if (op.text !== undefined) annot.setContents(op.text)
    // Only the kinds the editor makes are given a new look. Another
    // program's stamp or call-out keeps the look it came with.
    let redraw = false
    if (kind && !answers(annot)) {
      if (op.colour) {
        annot.setColor([...op.colour])
        redraw = true
      }
      if (op.opacity !== undefined) {
        annot.setOpacity(op.opacity)
        redraw = true
      }
      if (op.move && kind === "note") {
        const [left, top, right, bottom] = annot.getRect()
        annot.setRect([
          left + op.move.x,
          top + op.move.y,
          right + op.move.x,
          bottom + op.move.y,
        ])
        redraw = true
      }
      if (op.move && kind === "pen") {
        const { x, y } = op.move
        annot.setInkList(
          annot
            .getInkList()
            .map((stroke) =>
              stroke.map(([px, py]): MuPDF.Point => [px + x, py + y])
            )
        )
        redraw = true
      }
    }
    annot.setModificationDate(new Date(op.when))
    if (redraw) annot.update()
  } else {
    const annot = find(op.id)
    if (!annot) return
    // Its replies go with it, and the windows each of them opened in.
    const gone = new Set([numberOf(annot)])
    for (let grew = true; grew;) {
      grew = false
      for (const other of page.getAnnotations())
        if (gone.has(answers(other)) && !gone.has(numberOf(other))) {
          gone.add(numberOf(other))
          grew = true
        }
    }
    // One at a time, looking afresh each time: taking one away changes the
    // list the others were found in.
    for (;;) {
      const next = page
        .getAnnotations()
        .find((other) => gone.has(numberOf(other)))
      if (!next) break
      gone.delete(numberOf(next))
      page.deleteAnnotation(next)
    }
  }
}

/**
 * Make a change to comments, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 * @throws When the change holds something that is not a change to comments.
 */
export function applyComments(
  mupdf: Engine,
  session: EditSession,
  change: CommentChange
): number[] {
  const ops = change.ops.map((op) => {
    const read = readCommentOp(op)
    if (!read) throw new Error("That is not a change to comments.")
    return read
  })
  return inStep(session, change.label, (touch) => {
    for (const op of ops) {
      if (op.page >= session.doc.countPages()) continue
      touch(op.page)
      withPage(session.doc, op.page, (page) =>
        carryOut(mupdf, session.doc, page, op)
      )
    }
  })
}
