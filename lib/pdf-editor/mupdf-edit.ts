/**
 * Editing with the engine. A working copy of the file is held open; every
 * change is one step in the engine's own journal, so it can be undone, and
 * the page is drawn again from the copy, so the screen shows what the file
 * holds.
 *
 * Things a person adds are annotations while the file is being edited, with
 * an appearance drawn here so that our fonts are the ones embedded. When the
 * file is downloaded each is drawn into its page and the annotation is taken
 * away, unless they are to stay movable.
 *
 * The engine is handed in, so the same code runs in the worker and in Node.
 */
import type * as MuPDF from "mupdf"
import type { Size } from "@/lib/image-compressor/geometry"
import { pagesToCheck } from "@/lib/pdf-compressor/check"
import { open, samePage } from "@/lib/pdf-compressor/mupdf-compress"
import type { Lock } from "@/lib/pdf-compressor/options"
import { drawPage, shareDuplicates } from "@/lib/pdf-merger/mupdf-engine"
import { fontName } from "./fonts"
import { centreOf, type Box, type Point } from "./geometry"
import type { History } from "./history"
import { curvesThrough } from "./ink"
import {
  labelPlace,
  measured,
  MEASURE_LIFT,
  MEASURE_TEXT,
  measureTicks,
} from "./measure"
import {
  arrowHead,
  arrowShaft,
  CALLOUT_WEIGHT,
  calloutFrame,
  calloutLine,
  fontKey,
  fontsFor,
  MEASURE_FONT,
  STAMP_FONT,
  stampLayout,
  stampWeight,
  LINE_HEIGHT,
  reach,
  readObject,
  type Colour,
  type EditorObject,
  type TextObject,
} from "./objects"
import { BASELINE, lineStart } from "./text-layout"
import type { Change, Op } from "./tools"

type Engine = typeof MuPDF
type Doc = MuPDF.PDFDocument
type Obj = MuPDF.PDFObject
type Matrix = MuPDF.Matrix

/** The key under which an annotation carries the thing it stands for. */
export const DATA_KEY = "KeepSimpObject"
/** An annotation that is printed with its page. */
const PRINTED = 4
/** How round an ellipse is drawn with four curves. */
const KAPPA = 0.5522847498
/** The most pages compared with the original, and to make sure cut fonts still write the same. */
const CHECK_PAGES = 12
const CHECK_EDGE = 700

/**
 * One change that was made to a file, as it was asked for. The list of
 * them is how the file came to be what it is, and every one can be made
 * again to a fresh copy of the file: that is how a change is undone, how
 * changes are written after a signed file, and how a draft is taken up.
 */
export interface Done {
  kind: "things" | "comments" | "fields"
  change: unknown
}

/** A change with what it is called and the pages it changed. */
export interface Step {
  done: Done
  label: string
  touched: number[]
}

export interface EditSession {
  engine: Engine
  doc: Doc
  /** The file as it came: what the working copy is made from, and what a result is checked against. */
  original: Uint8Array
  password?: string
  /** The font files in use, by their key (`fontKey`). */
  fonts: Map<string, MuPDF.Font>
  /** Pictures that were added, by the name they were given. */
  pictures: Map<string, { image: MuPDF.Image; size: Size }>
  /** How many steps were in force when the last download was made. */
  saved: number | null
  /** Every change that was made, oldest first. */
  steps: Step[]
  /** How many of them are in force. The rest have been undone and can be made again. */
  position: number
  /** Steps are being made again, and are not to be listed a second time. */
  again?: boolean
  /** Told when the working copy has become another document: after an undo it is made anew. */
  moved?: (doc: Doc) => void
}

/** A font file was asked for that the session has not been given. */
export class FontMissing extends Error {
  constructor(readonly key: string) {
    super(`The font "${key}" has not been loaded.`)
  }
}

/**
 * Open a file to be edited.
 * @throws PasswordNeeded when the file is locked and the password is missing or wrong.
 */
export function startEditing(
  mupdf: Engine,
  bytes: Uint8Array,
  password?: string
): EditSession {
  return editingOf(mupdf, open(mupdf, bytes, password), bytes, password)
}

/**
 * A session on a document that is already open. The document must be
 * untouched since it was read: it is the copy that is changed and written out.
 */
export function editingOf(
  mupdf: Engine,
  doc: Doc,
  bytes: Uint8Array,
  password?: string
): EditSession {
  // The journal makes each change whole: one that fails is taken back
  // entirely. It is not what undoes a change; see `stepBack`.
  doc.enableJournal()
  return {
    engine: mupdf,
    doc,
    original: bytes,
    password,
    fonts: new Map(),
    pictures: new Map(),
    saved: null,
    steps: [],
    position: 0,
  }
}

export function stopEditing(session: EditSession) {
  letGo(session)
  session.doc.destroy()
}

/** Let go of a session's fonts and pictures, for when the document is closed by whoever opened it. */
export function letGo(session: EditSession) {
  for (const { image } of session.pictures.values()) image.destroy()
  for (const font of session.fonts.values()) font.destroy()
  session.pictures.clear()
  session.fonts.clear()
}

/**
 * A page is only ever held for the length of one piece of work. The engine
 * hands back the page it already has open when asked again, with what it
 * knew of it then, so a page kept across a change or an undo would be stale.
 */
export function withPage<T>(
  doc: Doc,
  index: number,
  work: (page: MuPDF.PDFPage) => T
) {
  const page = doc.loadPage(index)
  try {
    return work(page)
  } finally {
    page.destroy()
  }
}

/** Every page's size as it is shown, in points. */
export function pageSizes(session: EditSession): Size[] {
  const sizes: Size[] = []
  for (let index = 0; index < session.doc.countPages(); index++)
    sizes.push(
      withPage(session.doc, index, (page) => {
        const [left, top, right, bottom] = page.getBounds()
        return { width: right - left, height: bottom - top }
      })
    )
  return sizes
}

/** Give the session a font file. */
export function addFont(
  mupdf: Engine,
  session: EditSession,
  key: string,
  bytes: Uint8Array
) {
  if (!session.fonts.has(key))
    session.fonts.set(key, new mupdf.Font(fontName(key), bytes))
}

/**
 * Give the session a picture (PNG or JPEG) under a name.
 * @returns Its size in pixels.
 */
export function addPicture(
  mupdf: Engine,
  session: EditSession,
  name: string,
  bytes: Uint8Array
): Size {
  const known = session.pictures.get(name)
  if (known) return known.size
  const image = new mupdf.Image(bytes)
  const size = { width: image.getWidth(), height: image.getHeight() }
  session.pictures.set(name, { image, size })
  return size
}

const fontBy = (session: EditSession, key: string) => {
  const font = session.fonts.get(key)
  if (!font) throw new FontMissing(key)
  return font
}

const fontOf = (session: EditSession, text: TextObject) =>
  fontBy(session, fontKey(text))

/** The letters of some words as a font draws them: which shape each is, and how far it moves the pen at a size of one. */
const glyphsOf = (font: MuPDF.Font, words: string) =>
  Array.from(words).map((letter) => {
    const code = letter.codePointAt(0)!
    const glyph = font.encodeCharacter(code)
    return { code, glyph, advance: font.advanceGlyph(glyph) }
  })

/** How wide some text is in a font of the session, at a size. */
export function textWidth(
  session: EditSession,
  key: string,
  size: number,
  text: string
) {
  const font = session.fonts.get(key)
  if (!font) throw new FontMissing(key)
  let width = 0
  for (const letter of text)
    width += font.advanceGlyph(font.encodeCharacter(letter.codePointAt(0)!))
  return width * size
}

/** The letters of a text box that its font has no shape for, each once. */
export function lettersLacking(session: EditSession, text: TextObject) {
  const font = fontOf(session, text)
  const lacking = new Set<string>()
  for (const letter of text.lines.join(""))
    if (letter.trim() && font.encodeCharacter(letter.codePointAt(0)!) === 0)
      lacking.add(letter)
  return [...lacking]
}

/** The turn a file gives a page: 0, 90, 180 or 270. */
export function turnOf(page: Obj) {
  const turn = page.getInheritable("Rotate")
  const degrees = turn.isNumber() ? Math.round(turn.asNumber() / 90) * 90 : 0
  return ((degrees % 360) + 360) % 360
}

/** A circle or ellipse as four curves. */
function ellipse(mupdf: Engine, box: Box) {
  const path = new mupdf.Path()
  const rx = box.width / 2
  const ry = box.height / 2
  const cx = box.x + rx
  const cy = box.y + ry
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  path.moveTo(cx + rx, cy)
  path.curveTo(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry)
  path.curveTo(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy)
  path.curveTo(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry)
  path.curveTo(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy)
  path.closePath()
  return path
}

const through = (mupdf: Engine, points: readonly Point[], closed = false) => {
  const path = new mupdf.Path()
  path.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) path.lineTo(point.x, point.y)
  if (closed) path.closePath()
  return path
}

/**
 * What a thing looks like, drawn into a list that starts at the corner of
 * the upright box around it.
 */
function appearance(mupdf: Engine, session: EditSession, object: EditorObject) {
  const bounds = reach(object)
  const list = new mupdf.DisplayList([0, 0, bounds.width, bounds.height])
  const device = new mupdf.DisplayListDevice(list)
  const rgb = mupdf.ColorSpace.DeviceRGB
  const colour = (value: Colour) => [...value] as MuPDF.Color
  // From the page's points to the list's: first the thing's own turn about
  // its centre, then the move to the corner of its bounds.
  const centre = centreOf(object.box)
  const place: Matrix = mupdf.Matrix.concat(
    mupdf.Matrix.concat(
      mupdf.Matrix.translate(-centre.x, -centre.y),
      mupdf.Matrix.rotate(object.rotation)
    ),
    mupdf.Matrix.translate(centre.x - bounds.x, centre.y - bounds.y)
  )
  const pen = (weight: number) =>
    new mupdf.StrokeState({
      lineWidth: weight,
      lineCap: "Round",
      lineJoin: "Round",
      miterLimit: 10,
    })
  const alpha = object.opacity
  /** Words set from a point, in a size, by a matrix of their own on top of the thing's. */
  const write = (
    font: MuPDF.Font,
    words: string,
    x: number,
    y: number,
    size: number,
    ink: Colour,
    turn: Matrix = mupdf.Matrix.identity
  ) => {
    const text = new mupdf.Text()
    let at = x
    for (const glyph of glyphsOf(font, words)) {
      text.showGlyph(font, [size, 0, 0, -size, at, y], glyph.glyph, glyph.code)
      at += glyph.advance * size
    }
    device.fillText(
      text,
      mupdf.Matrix.concat(turn, place),
      rgb,
      colour(ink),
      alpha
    )
  }
  const widthOf = (font: MuPDF.Font, words: string) =>
    glyphsOf(font, words).reduce((sum, glyph) => sum + glyph.advance, 0)
  try {
    switch (object.kind) {
      case "stamp": {
        const weight = stampWeight(object.box)
        const { box } = object
        // A frame with rounded corners, a third of its height at most.
        const round = Math.min(box.height / 3, box.width / 6)
        const k = round * (1 - KAPPA)
        const right = box.x + box.width
        const bottom = box.y + box.height
        const path = new mupdf.Path()
        path.moveTo(box.x + round, box.y)
        path.lineTo(right - round, box.y)
        path.curveTo(right - k, box.y, right, box.y + k, right, box.y + round)
        path.lineTo(right, bottom - round)
        path.curveTo(
          right,
          bottom - k,
          right - k,
          bottom,
          right - round,
          bottom
        )
        path.lineTo(box.x + round, bottom)
        path.curveTo(
          box.x + k,
          bottom,
          box.x,
          bottom - k,
          box.x,
          bottom - round
        )
        path.lineTo(box.x, box.y + round)
        path.curveTo(box.x, box.y + k, box.x + k, box.y, box.x + round, box.y)
        path.closePath()
        device.strokePath(
          path,
          pen(weight),
          place,
          rgb,
          colour(object.colour),
          alpha
        )
        const font = fontBy(session, STAMP_FONT)
        const words = object.label.toUpperCase()
        const laid = stampLayout(box, widthOf(font, words))
        write(font, words, laid.x, laid.y, laid.size, object.colour)
        break
      }
      case "measure": {
        const stroke = (points: readonly Point[]) =>
          device.strokePath(
            through(mupdf, points),
            pen(object.weight),
            place,
            rgb,
            colour(object.stroke),
            alpha
          )
        stroke([object.from, object.to])
        for (const tick of measureTicks(object.from, object.to)) stroke(tick)
        // The label sits over the middle of the line, turned with it.
        const font = fontBy(session, MEASURE_FONT)
        const words = measured(
          object.from,
          object.to,
          object.unit,
          object.scale
        )
        const { middle, angle } = labelPlace(object.from, object.to)
        const width = widthOf(font, words) * MEASURE_TEXT
        write(
          font,
          words,
          -width / 2,
          -(MEASURE_LIFT + object.weight / 2),
          MEASURE_TEXT,
          object.stroke,
          mupdf.Matrix.concat(
            mupdf.Matrix.rotate(angle),
            mupdf.Matrix.translate(middle.x, middle.y)
          )
        )
        break
      }
      case "text": {
        if (object.tip) {
          // A call-out: a white frame round the words, and a line from it
          // to what it points at, in the colour of the words.
          const frame = through(
            mupdf,
            cornersUpright(calloutFrame(object.box)),
            true
          )
          const line = calloutLine(object)
          if (line) {
            device.strokePath(
              through(mupdf, [
                line.from,
                arrowShaft(line.from, line.to, CALLOUT_WEIGHT),
              ]),
              pen(CALLOUT_WEIGHT),
              place,
              rgb,
              colour(object.colour),
              alpha
            )
            device.fillPath(
              through(
                mupdf,
                arrowHead(line.from, line.to, CALLOUT_WEIGHT),
                true
              ),
              false,
              place,
              rgb,
              colour(object.colour),
              alpha
            )
          }
          device.fillPath(frame, false, place, rgb, [1, 1, 1], alpha)
          device.strokePath(
            frame,
            pen(CALLOUT_WEIGHT),
            place,
            rgb,
            colour(object.colour),
            alpha
          )
        }
        const font = fontOf(session, object)
        const text = new mupdf.Text()
        object.lines.forEach((line, index) => {
          const glyphs = Array.from(line).map((letter) => {
            const code = letter.codePointAt(0)!
            const glyph = font.encodeCharacter(code)
            return { code, glyph, advance: font.advanceGlyph(glyph) }
          })
          const width =
            glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) * object.size
          let x =
            object.box.x + lineStart(object.align, width, object.box.width)
          const y =
            object.box.y + (index * LINE_HEIGHT + BASELINE) * object.size
          for (const glyph of glyphs) {
            text.showGlyph(
              font,
              [object.size, 0, 0, -object.size, x, y],
              glyph.glyph,
              glyph.code
            )
            x += glyph.advance * object.size
          }
        })
        device.fillText(text, place, rgb, colour(object.colour), alpha)
        break
      }
      case "picture": {
        const picture = session.pictures.get(object.picture)
        if (!picture) break
        const { box } = object
        device.fillImage(
          picture.image,
          mupdf.Matrix.concat(
            [box.width, 0, 0, box.height, box.x, box.y],
            place
          ),
          alpha
        )
        break
      }
      case "box":
      case "ellipse":
      case "cover": {
        const path =
          object.kind === "ellipse"
            ? ellipse(mupdf, object.box)
            : through(mupdf, cornersUpright(object.box), true)
        if (object.fill)
          device.fillPath(path, false, place, rgb, colour(object.fill), alpha)
        if (object.kind !== "cover" && object.stroke)
          device.strokePath(
            path,
            pen(object.weight),
            place,
            rgb,
            colour(object.stroke),
            alpha
          )
        break
      }
      case "line":
      case "arrow": {
        const end =
          object.kind === "arrow"
            ? arrowShaft(object.from, object.to, object.weight)
            : object.to
        device.strokePath(
          through(mupdf, [object.from, end]),
          pen(object.weight),
          place,
          rgb,
          colour(object.stroke),
          alpha
        )
        if (object.kind === "arrow")
          device.fillPath(
            through(
              mupdf,
              arrowHead(object.from, object.to, object.weight),
              true
            ),
            false,
            place,
            rgb,
            colour(object.stroke),
            alpha
          )
        break
      }
      case "ink":
        for (const stroke of object.strokes) {
          if (stroke.length === 1) {
            // A dot. The engine draws nothing for a line of no length, so
            // it is a filled circle as wide as the pen.
            const half = object.weight / 2
            device.fillPath(
              ellipse(mupdf, {
                x: stroke[0].x - half,
                y: stroke[0].y - half,
                width: object.weight,
                height: object.weight,
              }),
              false,
              place,
              rgb,
              colour(object.stroke),
              alpha
            )
            continue
          }
          const path = new mupdf.Path()
          path.moveTo(stroke[0].x, stroke[0].y)
          for (const curve of curvesThrough(stroke))
            path.curveTo(
              curve.c1.x,
              curve.c1.y,
              curve.c2.x,
              curve.c2.y,
              curve.to.x,
              curve.to.y
            )
          device.strokePath(
            path,
            pen(object.weight),
            place,
            rgb,
            colour(object.stroke),
            alpha
          )
        }
        break
    }
  } finally {
    device.close()
  }
  return { list, bounds }
}

const cornersUpright = (box: Box): Point[] => [
  { x: box.x, y: box.y },
  { x: box.x + box.width, y: box.y },
  { x: box.x + box.width, y: box.y + box.height },
  { x: box.x, y: box.y + box.height },
]

/** The thing an annotation stands for; null when it is not one of ours. */
function thingOf(annot: MuPDF.PDFAnnotation): EditorObject | null {
  const data = annot.getObject().get(DATA_KEY)
  if (!data.isString()) return null
  try {
    return readObject(JSON.parse(data.asString()))
  } catch {
    return null
  }
}

/** Make an annotation stand for a thing: its place, what it carries, and last of all how it looks. */
function write(
  mupdf: Engine,
  session: EditSession,
  page: MuPDF.PDFPage,
  annot: MuPDF.PDFAnnotation,
  object: EditorObject
) {
  const { list, bounds } = appearance(mupdf, session, object)
  try {
    annot.setRect([
      bounds.x,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    ])
    annot.setFlags(PRINTED)
    annot.setContents(
      object.kind === "text"
        ? object.text
        : object.kind === "stamp"
          ? object.label
          : ""
    )
    annot
      .getObject()
      .put(DATA_KEY, session.doc.newString(JSON.stringify(object)))
    // The appearance goes in last, and the engine is not asked to refresh the
    // annotation in between: it would draw a stamp of its own and reshape
    // the rectangle to suit it. On a page the file shows turned, what we
    // draw is turned with it, so that it stands upright on the screen.
    annot.setAppearanceFromDisplayList(
      null,
      null,
      mupdf.Matrix.rotate(turnOf(page.getObject())),
      list
    )
  } finally {
    list.destroy()
  }
}

/** The things added to a page, bottom first. */
export function objectsOn(session: EditSession, index: number): EditorObject[] {
  return withPage(session.doc, index, (page) =>
    page
      .getAnnotations()
      .map(thingOf)
      .filter((thing): thing is EditorObject => thing !== null)
  )
}

/** Move one annotation among the others in a page's list. */
function reorder(
  doc: Doc,
  page: Obj,
  id: string,
  to: Extract<Op, { do: "order" }>["to"]
) {
  const annots = page.get("Annots")
  if (!annots.isArray()) return
  const refs: Obj[] = []
  annots.forEach((ref) => void refs.push(ref))
  // Only our own things change places, and only among themselves: whatever
  // else the file has in the list keeps its place.
  const ours = refs
    .map((ref, at) => ({ ref, at, data: ref.get(DATA_KEY) }))
    .filter(({ data }) => data.isString())
  const from = ours.findIndex(({ data }) => {
    try {
      return (JSON.parse(data.asString()) as { id?: unknown }).id === id
    } catch {
      return false
    }
  })
  if (from < 0) return
  const target =
    to === "front"
      ? ours.length - 1
      : to === "back"
        ? 0
        : Math.min(
            ours.length - 1,
            Math.max(0, from + (to === "forward" ? 1 : -1))
          )
  if (target === from) return
  const order = ours.map(({ ref }) => ref)
  const [moving] = order.splice(from, 1)
  order.splice(target, 0, moving)
  const next = doc.newArray()
  let taken = 0
  refs.forEach((ref, at) => {
    next.push(ours.some((one) => one.at === at) ? order[taken++] : ref)
  })
  page.put("Annots", next)
}

/** A thing as it is asked for, gone through the same check as one read from a file. */
function checked(object: EditorObject) {
  const read = readObject(object)
  if (!read) throw new Error("That is not something that can be added.")
  return read
}

/** How each kind of change is made, so that a step can be made again whichever module made it first. */
type Doer = (mupdf: Engine, session: EditSession, change: never) => number[]
const doers: Partial<Record<Done["kind"], Doer>> = {}

/** Say how a kind of change is made. The modules that make changes each say so for their own. */
export function canDo(kind: Done["kind"], doer: Doer) {
  doers[kind] = doer
}

function again(session: EditSession, step: Step) {
  const doer = doers[step.done.kind]
  if (!doer) throw new Error("This change cannot be made again.")
  doer(session.engine, session, step.done.change as never)
}

/**
 * A second session on a fresh copy of the file as it came, with every step
 * that is in force made again, in order. It shares the fonts and pictures
 * of the session it is made from, so only its document is to be let go of.
 */
export function madeAgain(session: EditSession): EditSession {
  const copy: EditSession = {
    ...session,
    doc: open(session.engine, session.original, session.password),
    steps: session.steps.slice(0, session.position),
    again: true,
    moved: undefined,
  }
  copy.doc.enableJournal()
  try {
    for (const step of copy.steps) again(copy, step)
  } catch (error) {
    copy.doc.destroy()
    throw error
  }
  copy.again = false
  return copy
}

/**
 * Make the working copy anew: the file as it came, with the steps in force
 * made again.
 *
 * This is how a change is undone, and not the engine's own undo. The engine
 * remembers where in a file it has put each font and picture, and its undo
 * takes them out without its forgetting: the next text in that font would
 * point at where the font no longer is, and other programs would show it
 * without one. A fresh copy remembers nothing.
 */
function remake(session: EditSession) {
  const { doc } = madeAgain(session)
  const old = session.doc
  session.doc = doc
  old.destroy()
  session.moved?.(doc)
}

/**
 * Do some work on the file as one step that can be undone. The work says
 * which pages it touches as it goes.
 * @param done What was asked for, so that the step can be made again.
 * @returns The pages that changed, counted from 0.
 */
export function inStep(
  session: EditSession,
  label: string,
  work: (touch: (page: number) => void) => void,
  done: Done
): number[] {
  const { doc } = session
  const touched = new Set<number>()
  const before = doc.getJournal().position
  doc.beginOperation(label)
  try {
    work((page) => void touched.add(page))
    doc.endOperation()
  } catch (error) {
    doc.abandonOperation()
    // What the step had put into the file is out again, and the engine
    // has not forgotten it: see `remake`.
    if (!session.again) remake(session)
    throw error
  }
  const pages = [...touched]
  // A change that changed nothing is not a step. One that did replaces
  // whatever had been undone before it.
  if (doc.getJournal().position > before && !session.again) {
    session.steps.length = session.position
    session.steps.push({ done, label, touched: pages })
    session.position++
  }
  return pages
}

/**
 * Make a change to the things on pages, as one step that can be undone.
 * @returns The pages that changed, counted from 0.
 */
export function applyChange(
  mupdf: Engine,
  session: EditSession,
  change: Change
): number[] {
  const { doc } = session
  const work = (touch: (page: number) => void) => {
    for (const op of change.ops) {
      touch(op.page)
      withPage(doc, op.page, (page) => {
        const find = (id: string) =>
          page.getAnnotations().find((annot) => thingOf(annot)?.id === id)
        if (op.do === "add")
          write(
            mupdf,
            session,
            page,
            page.createAnnotation("Stamp"),
            checked(op.object)
          )
        else if (op.do === "change") {
          const annot = find(op.object.id)
          if (annot) write(mupdf, session, page, annot, checked(op.object))
        } else if (op.do === "remove") {
          const annot = find(op.id)
          if (annot) page.deleteAnnotation(annot)
        } else reorder(doc, page.getObject(), op.id, op.to)
      })
    }
  }
  return inStep(session, change.label, work, { kind: "things", change })
}
canDo("things", applyChange)

export function historyOf(session: EditSession): History {
  return {
    steps: session.steps.map((step) => step.label),
    position: session.position,
    saved: session.saved,
  }
}

/**
 * Undo the last step: the working copy is made anew without it.
 * @returns The pages to draw again; null when there is nothing to undo.
 */
export function stepBack(session: EditSession): number[] | null {
  const step = session.steps[session.position - 1]
  if (!step) return null
  session.position--
  try {
    remake(session)
  } catch (error) {
    session.position++
    throw error
  }
  return step.touched
}

/**
 * Make the step that was undone last again, on the working copy as it is.
 * @returns The pages to draw again; null when there is nothing to make again.
 */
export function stepForward(session: EditSession): number[] | null {
  const step = session.steps[session.position]
  if (!step) return null
  session.again = true
  try {
    again(session, step)
  } catch (error) {
    session.again = false
    remake(session)
    throw error
  } finally {
    session.again = false
  }
  session.position++
  return step.touched
}

/** The six numbers of a matrix in a file; the identity when there is none. */
function matrixOf(value: Obj): number[] {
  if (!value.isArray() || value.length !== 6) return [1, 0, 0, 1, 0, 0]
  return [0, 1, 2, 3, 4, 5].map((at) => value.get(at).asNumber())
}

const numbers = (values: readonly number[]) =>
  values.map((value) => String(Math.round(value * 1e5) / 1e5)).join(" ")

/** Kinds of annotation that are not comments: links, form fields, and the windows notes open in. */
const NOT_COMMENTS = new Set(["Link", "Widget", "Popup"])
/** Not shown at all, or not shown on the screen. */
const UNSEEN = 1 | 2 | 32

/** One of the things the editor adds, as opposed to anything the file came with. */
const isThing = (annot: MuPDF.PDFAnnotation) =>
  annot.getObject().get(DATA_KEY).isString()

/** A comment, as opposed to a link, a field, or one of the things the editor adds. */
export const isComment = (annot: MuPDF.PDFAnnotation) =>
  !NOT_COMMENTS.has(annot.getType()) && !isThing(annot)

/** The pages of a document that hold comments, and how many comments there are, each reply counted. */
export function commentPages(doc: Doc) {
  const pages: number[] = []
  let count = 0
  for (let index = 0; index < doc.countPages(); index++) {
    const here = withPage(
      doc,
      index,
      (page) => page.getAnnotations().filter(isComment).length
    )
    if (here) pages.push(index)
    count += here
  }
  return { pages, count }
}

/**
 * Take annotations off a page, one at a time and looking afresh each time:
 * taking one away (a note, with the window it opens in) can change the list
 * the others were found in.
 */
function takeAway(
  page: MuPDF.PDFPage,
  which: (annot: MuPDF.PDFAnnotation) => boolean
) {
  for (;;) {
    const next = page.getAnnotations().find(which)
    if (!next) return
    page.deleteAnnotation(next)
  }
}

/** Take every comment out of a document. Links, form fields and what the editor added stay. */
export function removeComments(doc: Doc) {
  for (let index = 0; index < doc.countPages(); index++)
    withPage(doc, index, (page) => takeAway(page, isComment))
}

/**
 * Draw the things that were added, or the comments, into their pages and
 * take the annotations away. An annotation's appearance is already a small
 * drawing of its own; the page is given a line that paints it where the
 * annotation was (the way the standard says a viewer must place it), after
 * everything the page had. The engine's own way of doing this takes every
 * annotation of a file at once, the editor's things and the comments alike.
 * @returns How many were made part of their pages.
 */
export function flatten(
  session: EditSession,
  doc: Doc,
  what: "things" | "comments" = "things"
) {
  let made = 0
  for (let index = 0; index < doc.countPages(); index++)
    withPage(doc, index, (page) => {
      const comments = what === "comments"
      const ours = page.getAnnotations().filter(comments ? isComment : isThing)
      if (!ours.length) return
      if (comments)
        for (const annot of ours)
          // A comment that came without a drawing of itself is given one.
          try {
            annot.update()
          } catch {
            // It is taken away without having been drawn.
          }
      const pageObject = page.getObject()
      // What the page inherits is written onto it before it is changed.
      let resources = pageObject.getInheritable("Resources")
      if (!resources.isDictionary()) resources = doc.newDictionary()
      pageObject.put("Resources", resources)
      let forms = resources.get("XObject")
      if (!forms.isDictionary()) {
        forms = doc.newDictionary()
        resources.put("XObject", forms)
      }
      const taken = new Set<string>()
      forms.forEach((_, name) => void taken.add(String(name)))
      let lines = ""
      for (const annot of ours) {
        const object = annot.getObject()
        const form = object.get("AP", "N")
        const flags = object.get("F")
        const seen = !(flags.isNumber() && flags.asNumber() & UNSEEN)
        if (form.isStream() && seen) {
          const rect = [0, 1, 2, 3].map((at) =>
            object.get("Rect", at).asNumber()
          )
          const box = [0, 1, 2, 3].map((at) => form.get("BBox", at).asNumber())
          const [a, b, c, d, e, f] = matrixOf(form.get("Matrix"))
          // The form's box as its own matrix leaves it, and the upright box around that.
          const corners = [
            [box[0], box[1]],
            [box[2], box[1]],
            [box[2], box[3]],
            [box[0], box[3]],
          ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
          const left = Math.min(...corners.map(([x]) => x))
          const right = Math.max(...corners.map(([x]) => x))
          const bottom = Math.min(...corners.map(([, y]) => y))
          const top = Math.max(...corners.map(([, y]) => y))
          const sx = right > left ? (rect[2] - rect[0]) / (right - left) : 1
          const sy = top > bottom ? (rect[3] - rect[1]) / (top - bottom) : 1
          let name = ""
          for (let count = made; !name || taken.has(name); count++)
            name = `${comments ? "KsNote" : "KsAdded"}${count}`
          taken.add(name)
          forms.put(name, form)
          lines += `q ${numbers([sx, 0, 0, sy, rect[0] - left * sx, rect[1] - bottom * sy])} cm /${name} Do Q\n`
          made++
        }
      }
      takeAway(page, comments ? isComment : isThing)
      if (!lines) return
      // Whatever state the page's own content leaves behind must not reach
      // what is added, so the old content is wrapped.
      const contents = pageObject.get("Contents")
      const parts = doc.newArray()
      parts.push(doc.addStream("q\n", doc.newDictionary()))
      if (contents.isArray()) contents.forEach((part) => void parts.push(part))
      else if (!contents.isNull()) parts.push(contents)
      parts.push(doc.addStream(`\nQ\n${lines}`, doc.newDictionary()))
      pageObject.put("Contents", parts)
    })
  return made
}

export interface ExportOptions {
  /** Leave what was added as annotations, so it can be moved again later. */
  keepEditable?: boolean
  /**
   * What becomes of comments, the file's own and new ones alike: kept as
   * comments (when nothing is said), drawn into their pages, or left out.
   */
  comments?: "keep" | "flatten" | "remove"
  /**
   * What becomes of a form's fields: kept as fields that can be filled in
   * again (when nothing is said), or drawn into their pages as they stand.
   */
  fields?: "keep" | "flatten"
  /** A password for the result, in place of any the file has. */
  lock?: Lock
  /** Called between pages; it may pause, or throw to stop. */
  checkpoint?: () => Promise<void>
}

export interface ExportReport {
  /** How many things were added, over all pages. */
  added: number
  /** They were left as separate things that can be moved again, not made part of their pages. */
  editable: boolean
  /** Of the things with words among them (text boxes, call-outs, stamps, measuring lines), how many were read back word for word from the result. */
  text: { boxes: number; found: number }
  /** Pages nothing was added to, compared with the original: how many were looked at, and which differ. */
  untouched: { checked: number; differ: number[] }
  /** The added fonts were cut down to the letters in use. */
  fontsCut: boolean
  locked: boolean
  /** How many comments the file held, each reply counted, what became of them, and how many the result holds. */
  comments: { had: number; how: "keep" | "flatten" | "remove"; has: number }
  /**
   * Only for a signed file whose changes were written after it: whether
   * the file as it came is still there, byte for byte, at the start of the
   * result, which is what its signature covers.
   */
  signature?: { intact: boolean }
  /**
   * How many fields the form had, what became of them, and what the written
   * file says when it is read again: how many hold what they held (kept),
   * and how many are still fields (drawn in, none should be).
   */
  fields: { had: number; how: "keep" | "flatten"; same: number; left: number }
}

/** What a place of a form holds, as the file has it. A list that takes several holds one to a line. */
export function heldBy(widget: MuPDF.PDFWidget) {
  const held = widget.getObject().getInheritable("V")
  if (!held.isArray()) return widget.getValue()
  const lines: string[] = []
  for (let at = 0; at < held.length; at++) lines.push(held.get(at).asString())
  return lines.join("\n")
}

/** A form's fields by name with what each holds, and the pages they are on. */
export function formOf(doc: Doc) {
  const values = new Map<string, string>()
  const pages = new Set<number>()
  const fields = doc.getTrailer().get("Root", "AcroForm", "Fields")
  if (!(fields.isArray() && fields.length > 0)) return { values, pages }
  for (let index = 0; index < doc.countPages(); index++)
    withPage(doc, index, (page) => {
      for (const widget of page.getWidgets()) {
        pages.add(index)
        const name = widget.getName()
        if (!values.has(name)) values.set(name, heldBy(widget))
      }
    })
  return { values, pages }
}

const squeezed = (text: string) => text.replace(/\s+/g, " ").trim()

/** The words a thing writes on its page, as they are written. */
const lettersIn = (object: EditorObject) =>
  object.kind === "text"
    ? object.lines.join(" ")
    : object.kind === "stamp"
      ? object.label.toUpperCase()
      : object.kind === "measure"
        ? measured(object.from, object.to, object.unit, object.scale)
        : ""

const wordsOf = (text: string) => squeezed(text).split(" ").filter(Boolean)

const textOf = (doc: Doc, index: number) =>
  withPage(doc, index, (page) => {
    const words = page.toStructuredText("preserve-whitespace")
    try {
      return squeezed(words.asText())
    } finally {
      words.destroy()
    }
  })

/**
 * The file as it stands, ready to be downloaded. The working copy is not
 * touched: it is written out as it is and read in again, and everything is
 * done to that second copy. Tidying the working copy itself would renumber
 * its objects, and the journal could no longer undo.
 */
export async function exportEdited(
  mupdf: Engine,
  session: EditSession,
  options: ExportOptions = {}
): Promise<{ bytes: Uint8Array; report: ExportReport }> {
  const snapshot = bufferBytes(session.doc.saveToBuffer({}))
  // What is written is the file as it stands now, whatever is changed while it is written.
  const { position } = session
  let doc = open(mupdf, snapshot, session.password)
  try {
    const pages = doc.countPages()
    const things: { page: number; object: EditorObject }[] = []
    for (let index = 0; index < pages; index++)
      for (const object of objectsOn({ ...session, doc }, index))
        things.push({ page: index, object })
    const touched = new Set(things.map((thing) => thing.page))
    // A page is also touched when a step that is in force changed it, which
    // is how a page that only got a comment is known.
    for (const step of session.steps.slice(0, position))
      for (const page of step.touched) touched.add(page)
    if (!options.keepEditable) flatten(session, doc)
    const commented = commentPages(doc)
    const how = commented.count ? (options.comments ?? "keep") : "keep"
    if (how !== "keep") {
      for (const page of commented.pages) touched.add(page)
      if (how === "flatten") flatten(session, doc, "comments")
      else removeComments(doc)
    }
    // A form's fields, drawn into their pages as they stand. The engine does
    // this for all of them at once, which is what is asked for here.
    const form = formOf(doc)
    const fieldsHow = form.values.size ? (options.fields ?? "keep") : "keep"
    if (fieldsHow === "flatten") {
      for (const page of form.pages) touched.add(page)
      doc.bake(false, true)
    }
    await options.checkpoint?.()

    // Our fonts went in whole. Cut them down to the letters used, and keep
    // that only if every page with added text, and a spread of the others,
    // still reads and draws the same.
    let fontsCut = false
    const fields = doc.getTrailer().get("Root", "AcroForm", "Fields")
    const textPages = [
      ...new Set(
        things
          .filter((thing) => fontsFor(thing.object).length > 0)
          .map((thing) => thing.page)
      ),
    ]
    if (textPages.length && !(fields.isArray() && fields.length > 0)) {
      // Both sides of the comparison are read from the same written file, so
      // that nothing but the cut can tell them apart: a picture just placed
      // is drawn from what it was made of, and a hair differently once it
      // has been written.
      const whole = bufferBytes(doc.saveToBuffer({}))
      const plain = open(mupdf, whole, session.password)
      const cut = open(mupdf, whole, session.password)
      let same = false
      let stopped: { error: unknown } | null = null
      try {
        cut.subsetFonts()
        const all = Array.from({ length: pages }, (_, page) => page)
        const toCheck = new Set([
          ...pagesToCheck(textPages, pages, CHECK_PAGES),
          ...pagesToCheck(all, pages, CHECK_PAGES),
        ])
        same = true
        for (const page of toCheck) {
          // A stop asked for here must not be taken for a fault of the fonts.
          await options.checkpoint?.().catch((error: unknown) => {
            stopped = { error }
          })
          if (stopped) break
          if (!samePage(mupdf, plain, cut, page)) {
            same = false
            break
          }
        }
      } catch {
        same = false
      } finally {
        plain.destroy()
      }
      if (stopped) {
        cut.destroy()
        throw (stopped as { error: unknown }).error
      }
      if (same) {
        doc.destroy()
        doc = cut
        fontsCut = true
      } else cut.destroy()
    }

    // The check: text boxes are read back, and pages nothing was added to
    // must be what they were.
    // Word by word, with the spaces between words left out of it: two boxes
    // that overlap are read mixed together, and words that touch are read
    // as one.
    let found = 0
    // Everything with letters is read back: text boxes and call-outs, the
    // words of stamps, and what measuring lines say.
    const boxes = things.filter((thing) => fontsFor(thing.object).length > 0)
    const pageLetters = new Map<number, string>()
    for (const { page, object } of boxes) {
      if (!pageLetters.has(page))
        pageLetters.set(page, textOf(doc, page).replace(/\s+/g, ""))
      const letters = pageLetters.get(page)!
      if (wordsOf(lettersIn(object)).every((word) => letters.includes(word)))
        found++
    }
    const untouched = { checked: 0, differ: [] as number[] }
    const others = Array.from({ length: pages }, (_, page) => page).filter(
      (page) => !touched.has(page)
    )
    if (others.length) {
      const original = open(mupdf, session.original, session.password)
      try {
        if (original.countPages() === pages)
          for (const page of pagesToCheck(others, pages, CHECK_PAGES).filter(
            (page) => !touched.has(page)
          )) {
            await options.checkpoint?.()
            untouched.checked++
            const was = drawPage(mupdf, original, page, CHECK_EDGE)
            const is = drawPage(mupdf, doc, page, CHECK_EDGE)
            if (
              was.width !== is.width ||
              was.height !== is.height ||
              was.data.some((value, at) => value !== is.data[at])
            )
              untouched.differ.push(page)
          }
      } finally {
        original.destroy()
      }
    }

    shareDuplicates(doc)
    const { lock } = options
    const bytes = bufferBytes(
      doc.saveToBuffer({
        garbage: 2,
        compress: "yes",
        objstms: "yes",
        ...(lock
          ? {
              encrypt: "aes-256",
              "user-password": lock.password,
              "owner-password": lock.ownerPassword,
              permissions: lock.permissions,
            }
          : null),
      })
    )
    // What the fields hold is read from the written file, not from the one
    // it was written from.
    const fieldsRead = { same: 0, left: 0 }
    if (form.values.size) {
      const written = open(
        mupdf,
        bytes,
        lock ? lock.password : session.password
      )
      try {
        const now = formOf(written).values
        fieldsRead.left = now.size
        for (const [name, value] of form.values)
          if (now.get(name) === value) fieldsRead.same++
      } finally {
        written.destroy()
      }
    }
    session.saved = position
    return {
      bytes,
      report: {
        added: things.length,
        editable: Boolean(options.keepEditable),
        text: { boxes: boxes.length, found },
        untouched,
        fontsCut,
        locked: Boolean(lock),
        comments: { had: commented.count, how, has: commentPages(doc).count },
        fields: { had: form.values.size, how: fieldsHow, ...fieldsRead },
      },
    }
  } finally {
    doc.destroy()
  }
}

export function bufferBytes(buffer: MuPDF.Buffer) {
  try {
    return buffer.asUint8Array().slice()
  } finally {
    buffer.destroy()
  }
}
