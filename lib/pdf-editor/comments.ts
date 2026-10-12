/**
 * Comments: marks on words (highlight, underline, strike out, squiggle),
 * sticky notes with their replies, and strokes of a highlighter pen. Unlike
 * the things the editor adds to a page, a comment is one of the PDF's own
 * kinds of note, so every other program shows it as a comment too, and the
 * ones a file comes with are read the same way.
 *
 * Everything here is in the page's own points, measured from the top left
 * corner of the page as it is shown.
 */
import type { Quad } from "@/lib/pdf-reader/text"
import type { Box, Point } from "./geometry"
import { MOST_LETTERS, MOST_POINTS, type Colour } from "./objects"

export type MarkKind = "highlight" | "underline" | "strike" | "squiggle"
/** "other" is a kind of note the editor shows and answers but does not reshape: a call-out, a stamp, a shape. */
export type CommentKind = MarkKind | "note" | "pen" | "other"

export const MARK_KINDS: readonly MarkKind[] = [
  "highlight",
  "underline",
  "strike",
  "squiggle",
]

export interface Reply {
  id: string
  author: string
  text: string
  /** When it was last changed, in milliseconds; null when the file does not say. */
  when: number | null
}

export interface Comment {
  /** The file's own number for it, which stays the same while the file is open. */
  id: string
  kind: CommentKind
  /** What the file calls it: "Highlight", "Text", "FreeText", "Stamp" and so on. */
  type: string
  /** Where it is drawn. */
  box: Box
  /** The words a mark lies on, a box for each run of them. */
  quads: Quad[]
  /** The strokes of a pen. */
  strokes: Point[][]
  colour: Colour | null
  opacity: number
  /** How thick a pen's stroke is. */
  weight: number
  text: string
  author: string
  when: number | null
  replies: Reply[]
}

/** One change to the comments of a page. */
export type CommentOp =
  | {
      do: "mark"
      page: number
      kind: MarkKind
      quads: Quad[]
      colour: Colour
      opacity: number
      author: string
      when: number
    }
  | {
      do: "note"
      page: number
      /** The middle of its icon. */
      at: Point
      colour: Colour
      text: string
      author: string
      when: number
    }
  | {
      do: "pen"
      page: number
      strokes: Point[][]
      colour: Colour
      weight: number
      opacity: number
      author: string
      when: number
    }
  | {
      do: "reply"
      page: number
      /** The comment that is answered. */
      to: string
      text: string
      author: string
      when: number
    }
  | {
      do: "edit"
      page: number
      id: string
      when: number
      text?: string
      colour?: Colour
      opacity?: number
      /** How far to move it. */
      move?: Point
    }
  | { do: "drop"; page: number; id: string }

/** Changes to comments made together, which are undone together. */
export interface CommentChange {
  label: string
  ops: CommentOp[]
}

/** The most boxes a mark may have, and the longest name of an author. */
export const MOST_QUADS = 2_000
export const LONGEST_NAME = 200
/** The side of a note's icon. */
export const NOTE_SIZE = 20

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)
const clamp = (value: number, least: number, most: number) =>
  Math.min(most, Math.max(least, value))
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const colourOf = (value: unknown): Colour | null =>
  Array.isArray(value) && value.length === 3 && value.every(isNumber)
    ? [clamp(value[0], 0, 1), clamp(value[1], 0, 1), clamp(value[2], 0, 1)]
    : null
const pointOf = (value: unknown): Point | null =>
  isRecord(value) && isNumber(value.x) && isNumber(value.y)
    ? { x: value.x, y: value.y }
    : null
const textOf = (value: unknown, most = MOST_LETTERS) =>
  typeof value === "string" ? value.slice(0, most) : ""

/**
 * A change to comments as the engine may carry it out; null for anything
 * else. What the page sends is checked here before it reaches the file:
 * numbers are kept within bounds and words within a length.
 */
export function readCommentOp(value: unknown): CommentOp | null {
  if (!isRecord(value)) return null
  const { page } = value
  if (!isNumber(page) || page < 0 || !Number.isInteger(page)) return null
  const when = isNumber(value.when) ? value.when : 0
  const author = textOf(value.author, LONGEST_NAME)
  const id = typeof value.id === "string" ? value.id : ""
  if (value.do === "drop") return id ? { do: "drop", page, id } : null
  if (value.do === "reply") {
    const text = textOf(value.text)
    return typeof value.to === "string" && value.to && text.trim()
      ? { do: "reply", page, to: value.to, text, author, when }
      : null
  }
  if (value.do === "edit") {
    if (!id) return null
    const op: Extract<CommentOp, { do: "edit" }> = {
      do: "edit",
      page,
      id,
      when,
    }
    if (typeof value.text === "string") op.text = textOf(value.text)
    const colour = colourOf(value.colour)
    if (colour) op.colour = colour
    if (isNumber(value.opacity)) op.opacity = clamp(value.opacity, 0.05, 1)
    const move = pointOf(value.move)
    if (move) op.move = move
    return op
  }
  const colour = colourOf(value.colour)
  if (!colour) return null
  const opacity = isNumber(value.opacity) ? clamp(value.opacity, 0.05, 1) : 1
  if (value.do === "note") {
    const at = pointOf(value.at)
    return at
      ? { do: "note", page, at, colour, text: textOf(value.text), author, when }
      : null
  }
  if (value.do === "mark") {
    if (!MARK_KINDS.includes(value.kind as MarkKind)) return null
    const quads = (Array.isArray(value.quads) ? value.quads : [])
      .filter(
        (quad): quad is number[] =>
          Array.isArray(quad) && quad.length === 8 && quad.every(isNumber)
      )
      .slice(0, MOST_QUADS)
      .map((quad) => [...quad] as unknown as Quad)
    return quads.length
      ? {
          do: "mark",
          page,
          kind: value.kind as MarkKind,
          quads,
          colour,
          opacity,
          author,
          when,
        }
      : null
  }
  if (value.do === "pen") {
    let left = MOST_POINTS
    const strokes: Point[][] = []
    for (const stroke of Array.isArray(value.strokes) ? value.strokes : []) {
      const points = (Array.isArray(stroke) ? stroke : [])
        .map(pointOf)
        .filter((point): point is Point => point !== null)
        .slice(0, left)
      left -= points.length
      if (points.length) strokes.push(points)
    }
    return strokes.length
      ? {
          do: "pen",
          page,
          strokes,
          colour,
          weight: isNumber(value.weight) ? clamp(value.weight, 1, 40) : 12,
          opacity,
          author,
          when,
        }
      : null
  }
  return null
}

/** The letters of one line of a page, each with the box it is drawn in. */
export interface LetterLine {
  letters: string[]
  quads: Quad[]
}

const blank = (letter: string | undefined) => !letter || !letter.trim()

/** A line's own way of measuring: where it starts, which way it runs and which way is down. */
function ruler(line: LetterLine) {
  let first = 0
  let last = line.quads.length - 1
  while (first < last && blank(line.letters[first])) first++
  while (last > first && blank(line.letters[last])) last--
  const from = line.quads[first]
  const to = line.quads[last]
  const run = Math.hypot(to[2] - from[0], to[3] - from[1]) || 1
  const tall = Math.hypot(from[4] - from[0], from[5] - from[1]) || 1
  const along = { x: (to[2] - from[0]) / run, y: (to[3] - from[1]) / run }
  const down = { x: (from[4] - from[0]) / tall, y: (from[5] - from[1]) / tall }
  return {
    run,
    tall,
    /** How far along the line and how far down from its top a point is. */
    place: (x: number, y: number) => ({
      along: (x - from[0]) * along.x + (y - from[1]) * along.y,
      down: (x - from[0]) * down.x + (y - from[1]) * down.y,
    }),
  }
}

/** A letter of a page: which line, and which letter of the line. */
export interface Spot {
  line: number
  at: number
  /** The point was on the line itself, not merely nearest to it. */
  on: boolean
}

/** The letter nearest to a point; null on a page without letters. */
export function letterAt(
  lines: readonly LetterLine[],
  point: Point
): Spot | null {
  let best: (Spot & { away: number }) | null = null
  for (const [index, line] of lines.entries()) {
    if (!line.quads.length) continue
    const measure = ruler(line)
    const { along, down } = measure.place(point.x, point.y)
    const above =
      down < 0 ? -down : down > measure.tall ? down - measure.tall : 0
    const beside =
      along < 0 ? -along : along > measure.run ? along - measure.run : 0
    // Being level with a line always counts for more than being close to
    // its end: a point below the text belongs to the last line.
    const away = above * 1000 + beside
    if (best && best.away <= away) continue
    let at = 0
    let nearest = Infinity
    for (const [letter, quad] of line.quads.entries()) {
      const start = measure.place(quad[0], quad[1]).along
      const end = measure.place(quad[2], quad[3]).along
      const off = along < start ? start - along : along > end ? along - end : 0
      if (off < nearest) {
        nearest = off
        at = letter
      }
    }
    best = { line: index, at, on: away === 0, away }
  }
  return best && { line: best.line, at: best.at, on: best.on }
}

const boxOver = (first: Quad, last: Quad): Quad => [
  first[0],
  first[1],
  last[2],
  last[3],
  first[4],
  first[5],
  last[6],
  last[7],
]

/**
 * The words between two points of a page, as text is selected: from the
 * word under the first to the word under the second, through every line
 * between them in the order the page is read. A box comes back for each
 * line's run of words. A press and release on one spot gives the word
 * there, and nothing when it was not on a line; a drag that neither touches
 * a line nor passes over a letter gives nothing either.
 */
export function selectWords(
  lines: readonly LetterLine[],
  from: Point,
  to: Point
): Quad[] {
  const one = letterAt(lines, from)
  const other = letterAt(lines, to)
  if (!one || !other) return []
  const still = Math.hypot(to.x - from.x, to.y - from.y) < 2
  if (still && !one.on) return []
  // A drag over empty paper marks nothing: it has to begin or end on a
  // line, or pass over a letter on its way.
  if (!one.on && !other.on) {
    const left = Math.min(from.x, to.x)
    const right = Math.max(from.x, to.x)
    const top = Math.min(from.y, to.y)
    const bottom = Math.max(from.y, to.y)
    const over = lines.some((line) =>
      line.quads.some((quad) => {
        const x = (quad[0] + quad[6]) / 2
        const y = (quad[1] + quad[7]) / 2
        return x >= left && x <= right && y >= top && y <= bottom
      })
    )
    if (!over) return []
  }
  const [start, end] =
    one.line < other.line || (one.line === other.line && one.at <= other.at)
      ? [one, other]
      : [other, one]
  const quads: Quad[] = []
  for (let index = start.line; index <= end.line; index++) {
    const { letters, quads: boxes } = lines[index]
    let first = index === start.line ? start.at : 0
    let last = index === end.line ? end.at : boxes.length - 1
    // Out to the ends of the words that were touched.
    if (index === start.line && !blank(letters[first]))
      while (first > 0 && !blank(letters[first - 1])) first--
    if (index === end.line && !blank(letters[last]))
      while (last < boxes.length - 1 && !blank(letters[last + 1])) last++
    // And in from any space at either end.
    while (first <= last && blank(letters[first])) first++
    while (last >= first && blank(letters[last])) last--
    if (first <= last) quads.push(boxOver(boxes[first], boxes[last]))
  }
  return quads
}

/** Whether a point lies inside a box that may be turned. */
export function insideQuad(point: Point, quad: Quad) {
  // The corners in order around the box.
  const corners = [
    [quad[0], quad[1]],
    [quad[2], quad[3]],
    [quad[6], quad[7]],
    [quad[4], quad[5]],
  ]
  let side = 0
  for (let at = 0; at < 4; at++) {
    const [ax, ay] = corners[at]
    const [bx, by] = corners[(at + 1) % 4]
    const cross = (bx - ax) * (point.y - ay) - (by - ay) * (point.x - ax)
    if (cross === 0) continue
    if (side && Math.sign(cross) !== side) return false
    side = Math.sign(cross)
  }
  return true
}

/** The words that lie under a mark, a line of the page to a line. */
export function wordsUnder(
  lines: readonly LetterLine[],
  quads: readonly Quad[]
) {
  const found: string[] = []
  for (const line of lines) {
    let words = ""
    for (const [at, quad] of line.quads.entries()) {
      const middle = {
        x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
        y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
      }
      if (quads.some((mark) => insideQuad(middle, mark)))
        words += line.letters[at]
    }
    if (words.trim()) found.push(words.trim())
  }
  return found.join(" ").replace(/\s+/g, " ")
}

/** The smallest upright box around some boxes. */
export function boundsOfQuads(quads: readonly Quad[]): Box {
  const xs = quads.flatMap((quad) => [quad[0], quad[2], quad[4], quad[6]])
  const ys = quads.flatMap((quad) => [quad[1], quad[3], quad[5], quad[7]])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

/** Where a note's icon goes for a press at a point: around it, and on the page. */
export function noteBox(at: Point, page: { width: number; height: number }) {
  return {
    x: clamp(at.x - NOTE_SIZE / 2, 0, Math.max(0, page.width - NOTE_SIZE)),
    y: clamp(at.y - NOTE_SIZE / 2, 0, Math.max(0, page.height - NOTE_SIZE)),
    width: NOTE_SIZE,
    height: NOTE_SIZE,
  }
}

/** What each kind is called. */
export const COMMENT_NAMES: Record<CommentKind, string> = {
  highlight: "Highlight",
  underline: "Underline",
  strike: "Strike-out",
  squiggle: "Squiggle",
  note: "Note",
  pen: "Highlighter",
  other: "Comment",
}

/** What a comment is called: its kind, or for one the editor only shows, what the file calls it. */
export const commentName = (comment: Pick<Comment, "kind" | "type">) =>
  comment.kind === "other"
    ? comment.type.replace(/([a-z])([A-Z])/g, "$1 $2")
    : COMMENT_NAMES[comment.kind]

/** Whether a comment, the words it marks or one of its replies holds some words. Capitals make no difference. */
export function commentHolds(comment: Comment, quote: string, needle: string) {
  const wanted = needle.trim().toLowerCase()
  if (!wanted) return true
  return [
    comment.text,
    comment.author,
    quote,
    commentName(comment),
    ...comment.replies.flatMap((reply) => [reply.text, reply.author]),
  ].some((words) => words.toLowerCase().includes(wanted))
}

/** How many comments there are, counting each reply. */
export const countComments = (pages: readonly (readonly Comment[])[]) =>
  pages.reduce(
    (sum, page) =>
      sum +
      page.reduce((count, comment) => count + 1 + comment.replies.length, 0),
    0
  )

/** The colours offered for marks and notes, in the order they are shown. */
export const MARK_COLOURS: readonly { name: string; colour: Colour }[] = [
  { name: "Yellow", colour: [1, 0.86, 0.2] },
  { name: "Green", colour: [0.45, 0.85, 0.45] },
  { name: "Blue", colour: [0.45, 0.75, 1] },
  { name: "Pink", colour: [1, 0.55, 0.75] },
  { name: "Orange", colour: [1, 0.65, 0.2] },
  { name: "Red", colour: [0.86, 0.15, 0.15] },
]

/** The tools that make comments. */
export type CommentTool = MarkKind | "note" | "pen"
export const COMMENT_TOOLS: readonly CommentTool[] = [
  ...MARK_KINDS,
  "note",
  "pen",
]

/** The look of what each tool makes next. */
export interface CommentStyles {
  colours: Record<CommentTool, Colour>
  /** How thick the highlighter pen is. */
  weight: number
}

const YELLOW = MARK_COLOURS[0].colour
const RED = MARK_COLOURS[5].colour

export const defaultCommentStyles: CommentStyles = {
  colours: {
    highlight: YELLOW,
    underline: RED,
    strike: RED,
    squiggle: RED,
    note: YELLOW,
    pen: YELLOW,
  },
  weight: 12,
}

/** The thicknesses offered for the highlighter pen. */
export const PEN_WEIGHTS = [8, 12, 20] as const
/** How solid a highlighter's stroke is; marks on words are solid, and drawn so that the words show through. */
export const PEN_OPACITY = 0.4
