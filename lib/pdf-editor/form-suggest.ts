/**
 * Suggesting form fields from what a page already draws: a rule to write
 * on, an empty box, a small square to tick, a run of underscores. It is
 * judged by look and is wrong sometimes, so what comes out of here is only
 * ever shown to be taken or dismissed, never added unasked.
 *
 * This part needs no engine: it is handed the page's drawings as lists of
 * points and its letters line by line, all in the page's points as the
 * page is shown, from its top left corner.
 */
import { quadBox } from "@/lib/pdf-reader/text"
import type { LetterLine } from "./comments"
import { nameTaken, validName, type MakeKind } from "./form-fields"
import type { Box, Point } from "./geometry"

/** One piece of a drawing: points joined by straight lines, as the page shows them. */
export interface Drawn {
  points: Point[]
  closed: boolean
  /** Painted inside, rather than only along its line. */
  filled: boolean
  /** How light its paint is, from 0 (black) to 1 (white). */
  light: number
}

export type SuggestedKind = Extract<MakeKind, "text" | "multiline" | "check">

export interface Suggestion {
  kind: SuggestedKind
  box: Box
  /** A name taken from the words beside it or over it, or made up. */
  name: string
  /** What it was found from, for the page to say. */
  from: "line" | "box" | "square" | "underscores"
}

/** The shortest rule that is something to write on, in points. */
export const SHORTEST_RULE = 36
/** How high a field over a rule or underscores is made. */
export const FIELD_HEIGHT = 18
/** The most fields suggested for one page: past this a page is a drawing, not a form. */
export const MOST_SUGGESTED = 200

const WITHIN = 1.5

/** The box round some points. */
const around = (points: readonly Point[]): Box => {
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Whether points make a box that stands upright: four corners, each side level or plumb. */
function upright(points: readonly Point[]) {
  // A closing point that repeats the first one is not a corner of its own.
  const corners =
    points.length === 5 &&
    Math.abs(points[0].x - points[4].x) <= WITHIN &&
    Math.abs(points[0].y - points[4].y) <= WITHIN
      ? points.slice(0, 4)
      : points
  if (corners.length !== 4) return false
  return corners.every((point, at) => {
    const next = corners[(at + 1) % 4]
    return (
      Math.abs(point.x - next.x) <= WITHIN ||
      Math.abs(point.y - next.y) <= WITHIN
    )
  })
}

/** What a piece of drawing is to a form: a rule, a box, or nothing. */
export function shapeOf(
  drawn: Drawn
): { rule: Box } | { post: Box } | { box: Box } | null {
  const { points } = drawn
  if (points.length < 2) return null
  const box = around(points)
  const shade = drawn.filled && drawn.light > 0.5
  // A level line, drawn as a line or as a thin bar.
  if (box.height <= 2.5 && box.width >= SHORTEST_RULE)
    return shade ? null : { rule: box }
  // An upright one, which parts a rule into the cells of a table.
  if (box.width <= 2.5 && box.height >= 8) return shade ? null : { post: box }
  if (!upright(points) || (!drawn.closed && points.length < 5)) return null
  // A box painted dark inside is a bar or a block, not a place to write.
  if (drawn.filled && drawn.light < 0.8) return null
  return { box }
}

/** The boxes of a page's letters, but not of spaces. */
const letterBoxes = (lines: readonly LetterLine[]) =>
  lines.flatMap((line) =>
    line.quads
      .filter((_, at) => line.letters[at].trim() && line.letters[at] !== "_")
      .map((quad) => {
        const { left, top, width, height } = quadBox(quad)
        return { x: left, y: top, width, height }
      })
  )

/** How much of `inner` lies in `outer`, from 0 to 1. */
function share(inner: Box, outer: Box) {
  const width =
    Math.min(inner.x + inner.width, outer.x + outer.width) -
    Math.max(inner.x, outer.x)
  const height =
    Math.min(inner.y + inner.height, outer.y + outer.height) -
    Math.max(inner.y, outer.y)
  if (width <= 0 || height <= 0) return 0
  return (width * height) / Math.max(inner.width * inner.height, 0.01)
}

/** Whether something is already written in a place: a letter half in it or more. */
const written = (box: Box, letters: readonly Box[]) =>
  letters.some((letter) => share(letter, box) >= 0.5)

/** Whether two places are one: most of the smaller lies in the larger. */
const same = (a: Box, b: Box) => share(a, b) >= 0.5 || share(b, a) >= 0.5

/** A field's name from the words that label it, or "" when they make none. */
export function nameFrom(words: string) {
  const name = words
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("_")
    .slice(0, 60)
  return name && validName(name) ? name : ""
}

/**
 * The words that label a place: those just left of it on its row, or else
 * those just over it.
 */
function labelOf(box: Box, lines: readonly LetterLine[]) {
  const middle = box.y + box.height / 2
  let best = { words: "", distance: Infinity }
  for (const line of lines) {
    const boxes = line.quads.map((quad) => {
      const { left, top, width, height } = quadBox(quad)
      return { x: left, y: top, width, height }
    })
    // Left of it, on its row.
    const left = boxes
      .map((one, at) => ({ one, at }))
      .filter(
        ({ one, at }) =>
          line.letters[at] !== "_" &&
          one.x + one.width <= box.x + 2 &&
          one.y <= middle &&
          one.y + one.height >= middle
      )
    if (left.length) {
      const last = left[left.length - 1]
      const distance = box.x - (last.one.x + last.one.width)
      if (distance <= 120 && distance < best.distance) {
        // The words of the row back to a wide gap.
        let first = left.length - 1
        while (
          first > 0 &&
          left[first].one.x -
            (left[first - 1].one.x + left[first - 1].one.width) <
            12
        )
          first--
        best = {
          words: left
            .slice(first)
            .map(({ at }) => line.letters[at])
            .join(""),
          distance,
        }
      }
    }
    // Over it, within a line's height, across its width.
    const over = boxes
      .map((one, at) => ({ one, at }))
      .filter(
        ({ one, at }) =>
          line.letters[at] !== "_" &&
          one.y + one.height <= box.y + 2 &&
          box.y - (one.y + one.height) <= 14 &&
          one.x + one.width >= box.x &&
          one.x <= box.x + box.width
      )
    if (over.length) {
      const distance =
        60 + box.y - Math.max(...over.map(({ one }) => one.y + one.height))
      if (distance < best.distance)
        best = {
          words: over.map(({ at }) => line.letters[at]).join(""),
          distance,
        }
    }
  }
  return best.words
}

/** The runs of three or more underscores in a page's lines, as boxes of the height a field is made. */
function underscoreRuns(lines: readonly LetterLine[]): Box[] {
  const runs: Box[] = []
  for (const line of lines) {
    let start = -1
    for (let at = 0; at <= line.letters.length; at++) {
      if (line.letters[at] === "_") {
        if (start < 0) start = at
        continue
      }
      if (start >= 0 && at - start >= 3) {
        const first = quadBox(line.quads[start])
        const last = quadBox(line.quads[at - 1])
        const bottom = first.top + first.height
        runs.push({
          x: first.left,
          y: bottom - FIELD_HEIGHT,
          width: last.left + last.width - first.left,
          height: FIELD_HEIGHT,
        })
      }
      start = -1
    }
  }
  return runs
}

/**
 * The fields a page seems to ask for, from the top of the page down.
 * @param taken The places of fields the page has already.
 * @param names The names the form uses already; suggestions take others.
 */
export function suggestFields(
  drawn: readonly Drawn[],
  lines: readonly LetterLine[],
  page: { width: number; height: number },
  taken: readonly Box[],
  names: readonly string[]
): Suggestion[] {
  const letters = letterBoxes(lines)
  const found: Omit<Suggestion, "name">[] = []
  const shapes = drawn.map(shapeOf)
  const rules = shapes.flatMap((one) =>
    one && "rule" in one ? [one.rule] : []
  )
  const posts = shapes.flatMap((one) =>
    one && "post" in one ? [one.post] : []
  )
  for (const rule of rules) {
    // The upright lines that come down onto the rule part it into cells.
    const cuts = posts
      .filter(
        (post) =>
          post.x > rule.x + 4 &&
          post.x < rule.x + rule.width - 4 &&
          post.y < rule.y - 4 &&
          post.y + post.height >= rule.y - 2
      )
      .map((post) => post.x)
      .sort((a, b) => a - b)
    // Uncut and across nearly the whole page, a rule parts the page and is no place to write.
    if (!cuts.length && rule.width > page.width * 0.85) continue
    const edges = [rule.x, ...cuts, rule.x + rule.width]
    for (let at = 1; at < edges.length; at++) {
      const left = edges[at - 1] + (at > 1 ? 2 : 0)
      const right = edges[at] - (at < edges.length - 1 ? 2 : 0)
      if (right - left < 30) continue
      // Up to the words of the cell's label, or to the rule over it, and a line's height at most.
      const over = [
        ...letters.filter(
          (letter) =>
            letter.x + letter.width > left &&
            letter.x < right &&
            letter.y + letter.height <= rule.y + 1 &&
            letter.y + letter.height > rule.y - 40
        ),
        ...rules.filter(
          (other) =>
            other !== rule &&
            other.x < right &&
            other.x + other.width > left &&
            other.y < rule.y - 2 &&
            other.y > rule.y - 40
        ),
      ].map((one) => one.y + one.height)
      const top = Math.max(rule.y - FIELD_HEIGHT, 0, ...over.map((y) => y + 1))
      if (rule.y - top < 9) continue
      found.push({
        kind: "text",
        from: "line",
        box: { x: left, y: top, width: right - left, height: rule.y - top },
      })
    }
  }
  for (const shape of shapes) {
    if (!shape || !("box" in shape)) continue
    const { box } = shape
    const square =
      box.width >= 6 && box.width <= 24 && Math.abs(box.width - box.height) <= 2
    if (square) found.push({ kind: "check", from: "square", box })
    else if (box.width >= 30 && box.height >= 10 && box.height <= 40)
      found.push({ kind: "text", from: "box", box })
    else if (
      box.width >= 60 &&
      box.height > 40 &&
      box.height <= 200 &&
      box.width * box.height <= page.width * page.height * 0.25
    )
      found.push({ kind: "multiline", from: "box", box })
  }
  for (const box of underscoreRuns(lines))
    found.push({ kind: "text", from: "underscores", box })
  // A place already written in, or already a field, is no suggestion; nor is
  // a second suggestion for one place (a box drawn twice, a rule under a box).
  const kept: Omit<Suggestion, "name">[] = []
  const rank = { square: 0, box: 1, underscores: 2, line: 3 }
  for (const one of [...found].sort((a, b) => rank[a.from] - rank[b.from])) {
    if (written(one.box, letters)) continue
    if (taken.some((box) => same(one.box, box))) continue
    if (kept.some((other) => same(one.box, other.box))) continue
    kept.push(one)
  }
  const used = [...names]
  return kept
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .slice(0, MOST_SUGGESTED)
    .map((one) => {
      const stem =
        nameFrom(labelOf(one.box, lines)) ||
        (one.kind === "check" ? "Checkbox" : "Text_field")
      let name = stem
      for (let n = 2; nameTaken(used, name); n++) name = `${stem}_${n}`
      used.push(name)
      return { ...one, name }
    })
}
