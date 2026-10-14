/**
 * Reading what a page draws, for fields to be suggested from it: its own
 * content only, without its fields, notes or anything laid over it. The
 * judging is done in `form-suggest.ts`; this file only reads.
 */
import type * as MuPDF from "mupdf"
import type { Quad } from "@/lib/pdf-reader/text"
import type { LetterLine } from "./comments"
import { suggestFields, type Drawn, type Suggestion } from "./form-suggest"
import type { Box, Point } from "./geometry"
import { withPage, type EditSession } from "./mupdf-edit"
import { fieldNames } from "./mupdf-form-fields"
import { fieldsOn } from "./mupdf-forms"
import { inverse, type Matrix } from "./retext"

type Engine = typeof MuPDF

/** The most drawings read from one page: a map or a chart is no form. */
const MOST_PIECES = 20_000

/** How light a paint is, from 0 (black) to 1 (white). */
const lightOf = (color: readonly number[]) =>
  color.length >= 3
    ? 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2]
    : (color[0] ?? 0)

/**
 * A drawing as the engine's reading of a page gives it: the box round one
 * path, whether it was only drawn along its line, and whether it is a
 * rectangle. A thin one is a line, a rectangle a box; any other shape is no
 * part of a form and is left out.
 */
function drawnOf(
  box: readonly number[],
  stroked: boolean,
  rectangle: boolean,
  color: readonly number[]
): Drawn | null {
  const [x0, y0, x1, y1] = box
  const light = lightOf(color)
  const filled = !stroked
  if (y1 - y0 <= 2.5 || x1 - x0 <= 2.5) {
    const middle = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
    const points =
      x1 - x0 >= y1 - y0
        ? [
            { x: x0, y: middle.y },
            { x: x1, y: middle.y },
          ]
        : [
            { x: middle.x, y: y0 },
            { x: middle.x, y: y1 },
          ]
    return { points, closed: false, filled, light }
  }
  if (!rectangle) return null
  return {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    closed: true,
    filled,
    light,
  }
}

/** The box round some points. */
function boundsOf(points: readonly Point[]): Box {
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const cornersOf = (box: Box): Point[] => [
  { x: box.x, y: box.y },
  { x: box.x + box.width, y: box.y },
  { x: box.x, y: box.y + box.height },
  { x: box.x + box.width, y: box.y + box.height },
]

/**
 * Between the page as it is shown and the page as it was written, the right
 * way up and not turned: a form is judged as it was written, where a rule
 * runs level and words read across, and what is found is shown turned with
 * the page.
 */
function uprightOf(page: MuPDF.PDFPage) {
  const shown = page.getTransform() as Matrix
  const back = inverse(shown)
  const apply = (m: Matrix, { x, y }: Point): Point => ({
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  })
  const [x0, y0, x1, y1] = page.getBounds()
  const written = boundsOf(
    cornersOf({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).map((point) =>
      apply(back, point)
    )
  )
  const top = written.y + written.height
  return {
    size: { width: written.width, height: written.height },
    up: (point: Point): Point => {
      const at = apply(back, point)
      return { x: at.x - written.x, y: top - at.y }
    },
    down: (box: Box): Box =>
      boundsOf(
        cornersOf(box).map(({ x, y }) =>
          apply(shown, { x: x + written.x, y: top - y })
        )
      ),
  }
}

/**
 * The fields a page of the file as it stands seems to ask for. Nothing is
 * changed: what is suggested is only shown, to be taken or dismissed.
 */
export function suggestOn(
  mupdf: Engine,
  session: EditSession,
  index: number
): Suggestion[] {
  const taken = fieldsOn(session, index).map((field) => field.box)
  const names = fieldNames(session.doc)
  return withPage(session.doc, index, (page) => {
    const list = new mupdf.DisplayList(page.getBounds())
    const writer = new mupdf.DisplayListDevice(list)
    const drawn: Drawn[] = []
    const lines: LetterLine[] = []
    try {
      // Running a page can mend a faulty tagged file, and nothing may be
      // changed outside an operation: the page is run inside one (see
      // `read` in `mupdf-text.ts`).
      const own = !session.working
      if (own) session.doc.beginOperation("Read the page")
      try {
        page.runPageContents(writer, mupdf.Matrix.identity)
        writer.close()
      } catch (error) {
        if (own) session.doc.abandonOperation()
        throw error
      }
      if (own) session.doc.endOperation()
      const text = list.toStructuredText("preserve-whitespace,vectors")
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
          onVector(
            box,
            flags: { isStroked: boolean; isRectangle: boolean },
            color
          ) {
            if (drawn.length >= MOST_PIECES) return
            const one = drawnOf(
              box,
              flags.isStroked,
              flags.isRectangle,
              color as number[]
            )
            if (one) drawn.push(one)
          },
        })
      } finally {
        text.destroy()
      }
    } finally {
      writer.destroy()
      list.destroy()
    }
    const { size, up, down } = uprightOf(page)
    const quadUp = (quad: Quad): Quad =>
      [0, 2, 4, 6]
        .map((at) => up({ x: quad[at], y: quad[at + 1] }))
        .flatMap(({ x, y }) => [x, y]) as unknown as Quad
    return suggestFields(
      drawn.map((piece) => ({ ...piece, points: piece.points.map(up) })),
      lines.map((line) => ({ ...line, quads: line.quads.map(quadUp) })),
      size,
      taken.map((box) => boundsOf(cornersOf(box).map(up))),
      names
    ).map((one) => ({ ...one, box: down(one.box) }))
  })
}
