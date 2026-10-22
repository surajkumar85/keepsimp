/**
 * What the PDF editor's toolbar draws, and the comments its annotator makes,
 * as tools: the things are made as the editor's tools make them
 * (`makeObject`, `makeCallout`, `checkMark`, with its default looks), and
 * comments are the PDF's own notes, made with the comment panel's steps.
 */
import {
  defaultCommentStyles,
  LONGEST_NAME,
  MARK_KINDS,
  MOST_QUADS,
  PEN_OPACITY,
  selectWords,
  wordsUnder,
  type Comment,
  type CommentOp,
  type MarkKind,
} from "@/lib/pdf-editor/comments"
import type { Point } from "@/lib/pdf-editor/geometry"
import { MEASURE_UNITS, type MeasureUnit } from "@/lib/pdf-editor/measure"
import {
  KIND_NAMES,
  LARGEST_TEXT,
  LONGEST_STAMP,
  moved,
  SMALLEST_TEXT,
  textHeight,
  THICKEST,
  THINNEST,
  type EditorObject,
  type TextObject,
} from "@/lib/pdf-editor/objects"
import {
  CHECK_SHAPES,
  checkMark,
  type CheckShape,
} from "@/lib/pdf-editor/signature"
import {
  defaultStyles,
  makeCallout,
  makeObject,
  makeText,
  STAMP_SIZE,
  type Op,
} from "@/lib/pdf-editor/tools"
import { PATTERNS, type PatternName } from "@/lib/pdf-editor/redact"
import type { Quad } from "@/lib/pdf-reader/text"
import { lock, plural, password, type LockInput } from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import {
  colour,
  colourOf,
  editKit,
  font,
  keepEditable,
  newId,
  onPage,
  type EditText,
} from "./pdf-kit"
import {
  asTool,
  fileProperty,
  ToolError,
  type AgentTool,
  type JsonSchema,
} from "./registry"

const point: JsonSchema = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" } },
  required: ["x", "y"],
  additionalProperties: false,
}
const DRAWN = [
  "box",
  "ellipse",
  "line",
  "arrow",
  "freehand",
  "cover",
  "stamp",
  "callout",
  "measure",
  "text",
  ...CHECK_SHAPES,
] as const
type Drawn = (typeof DRAWN)[number]

export interface Item {
  kind: Drawn
  page: number
  x: number
  y: number
  width?: number
  height?: number
  toX?: number
  toY?: number
  strokes?: Point[][]
  text?: string
  label?: string
  colour?: string
  fill?: string | "none"
  weight?: number
  opacity?: number
  rotation?: number
  size?: number
  font?: TextObject["font"]
  bold?: boolean
  italic?: boolean
  align?: TextObject["align"]
  boxes?: number
  unit?: MeasureUnit
  scale?: number
}

const itemSchema: JsonSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [...DRAWN],
      description:
        "box, ellipse, line, arrow, freehand (strokes of a pen), cover (a filled box that hides and does not remove), stamp (a word or two in capitals in a frame), callout (words in a frame with an arrow to a place), measure (a line that writes its length), text, or a mark for a paper form: tick, cross or dot.",
    },
    page: { type: "integer", minimum: 1, description: "Counted from 1." },
    x: {
      type: "number",
      description:
        "In points from the page's left edge as it is shown: a box's left, a line's start, a call-out's words, a tick's middle.",
    },
    y: { type: "number", description: "In points from the page's top edge." },
    width: { type: "number", exclusiveMinimum: 0 },
    height: { type: "number", exclusiveMinimum: 0 },
    toX: {
      type: "number",
      description:
        "Where a line, an arrow or a measuring line ends, or what a call-out points at.",
    },
    toY: { type: "number" },
    strokes: {
      type: "array",
      items: { type: "array", items: point, minItems: 1, maxItems: 20000 },
      minItems: 1,
      maxItems: 200,
      description: "For freehand: each stroke as the points it passes through.",
    },
    text: { type: "string", minLength: 1, maxLength: 5000 },
    label: {
      type: "string",
      minLength: 1,
      maxLength: LONGEST_STAMP,
      description:
        "What a stamp says: Approved (the default), Draft, Final, Confidential, Paid, Void, or words of your own.",
    },
    colour: {
      ...colour,
      description:
        "The colour of a line, an edge, words, a stamp or a mark; the editor's own by default.",
    },
    fill: {
      type: "string",
      pattern: "^(none|#?[0-9a-fA-F]{6})$",
      description:
        "Inside a box or an ellipse (none by default), or a cover's colour (white).",
    },
    weight: { type: "number", minimum: THINNEST, maximum: THICKEST },
    opacity: { type: "number", minimum: 0.05, maximum: 1 },
    rotation: { type: "number", minimum: -360, maximum: 360 },
    size: { type: "number", minimum: SMALLEST_TEXT, maximum: LARGEST_TEXT },
    font,
    bold: { type: "boolean" },
    italic: { type: "boolean" },
    align: { type: "string", enum: ["left", "centre", "right"] },
    boxes: {
      type: "integer",
      minimum: 2,
      maximum: 60,
      description:
        "For text on a paper form's row of boxes: its letters are spread one to a box over this many.",
    },
    unit: { type: "string", enum: [...MEASURE_UNITS] },
    scale: {
      type: "number",
      minimum: 0.001,
      maximum: 1_000_000,
      description: "A measuring line on a drawing made at 1 to this.",
    },
  },
  required: ["kind", "page", "x", "y"],
  additionalProperties: false,
}

const MARKS = [...MARK_KINDS]

/** A thing as the editor's tools make it, from what an agent asked. */
export function objectOf(
  item: Item,
  page: { width: number; height: number },
  id: string
): EditorObject {
  const at = { x: item.x, y: item.y }
  const off = (spot: Point) =>
    spot.x < 0 || spot.y < 0 || spot.x > page.width || spot.y > page.height
  if (off(at))
    throw new ToolError(
      `${item.x}, ${item.y} is off page ${item.page}, which is ${Math.round(page.width)} by ${Math.round(page.height)} points.`
    )
  const styles = {
    ...defaultStyles,
    ...(item.colour
      ? {
          stroke: colourOf(item.colour),
          inkColour: colourOf(item.colour),
          textColour: colourOf(item.colour),
          stampColour: colourOf(item.colour),
          checkColour: colourOf(item.colour),
        }
      : {}),
    ...(item.weight !== undefined
      ? { weight: item.weight, inkWeight: item.weight }
      : {}),
    ...(item.fill === "none" || item.fill === undefined
      ? {}
      : { fill: colourOf(item.fill), coverFill: colourOf(item.fill) }),
    ...(item.size ? { size: item.size } : {}),
    ...(item.font ? { font: item.font } : {}),
    bold: Boolean(item.bold),
    italic: Boolean(item.italic),
    ...(item.align ? { align: item.align } : {}),
    ...(item.label ? { stampLabel: item.label.toUpperCase() } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
    ...(item.scale ? { scale: item.scale } : {}),
  }
  const looks = { opacity: item.opacity ?? 1, rotation: item.rotation ?? 0 }
  const needs = (what: string, has: boolean) => {
    if (!has) throw new ToolError(`A ${item.kind} needs ${what}.`)
  }
  const kind = item.kind
  if (kind === "tick" || kind === "cross" || kind === "dot")
    return {
      ...checkMark(kind as CheckShape, at, styles.checkColour, id),
      opacity: looks.opacity,
    }
  if (kind === "freehand") {
    needs("strokes", Boolean(item.strokes))
    if (item.strokes!.flat().some(off))
      throw new ToolError(`A stroke goes off page ${item.page}.`)
    // Its box follows its points, as the pen's does.
    return moved(
      {
        id,
        kind: "ink",
        box: { ...at, width: 0, height: 0 },
        strokes: item.strokes!,
        stroke: styles.inkColour,
        weight: styles.inkWeight,
        ...looks,
      },
      0,
      0
    )
  }
  if (kind === "text" || kind === "callout") {
    needs("text", Boolean(item.text))
    const words = item.text!
    const base =
      kind === "callout"
        ? (needs(
            "toX and toY: what it points at",
            item.toX !== undefined && item.toY !== undefined
          ),
          makeCallout({ x: item.toX!, y: item.toY! }, at, styles, id, page, 0))
        : makeText(at, { ...styles, comb: item.boxes ?? 0 }, id, page)
    // A text box's first line starts at the point, as it would be typed there.
    const box =
      kind === "text"
        ? {
            ...base.box,
            y: item.y,
            height: textHeight(1, styles.size),
          }
        : base.box
    return {
      ...base,
      box: { ...box, ...(item.width ? { width: item.width } : {}) },
      text: words,
      lines: [words],
      ...(kind === "text" ? looks : { opacity: looks.opacity }),
    }
  }
  const line = kind === "line" || kind === "arrow" || kind === "measure"
  let to: Point
  if (line) {
    needs(
      "toX and toY: where it ends",
      item.toX !== undefined && item.toY !== undefined
    )
    to = { x: item.toX!, y: item.toY! }
  } else {
    const usual = kind === "stamp" ? STAMP_SIZE : null
    const width = item.width ?? usual?.width
    const height = item.height ?? usual?.height
    needs("a width and a height", width !== undefined && height !== undefined)
    to = { x: item.x + width!, y: item.y + height! }
  }
  if (off(to)) throw new ToolError(`It reaches off page ${item.page}.`)
  const made = makeObject(kind, at, to, styles, id)
  return { ...made, ...(line ? { opacity: looks.opacity } : looks) }
}

export function pdfDrawTools(engine: PdfEngine, text: EditText): AgentTool[] {
  const { editing, apply } = editKit(engine, text)

  /** Where an added thing or a comment is, by its id. */
  function pageOf(
    pages: readonly (readonly { id: string }[])[],
    id: string,
    what: string
  ) {
    const page = pages.findIndex((list) => list.some((one) => one.id === id))
    if (page < 0)
      throw new ToolError(
        `There is no ${what} "${id}" in this file. list_pdf_comments gives their ids.`
      )
    return page
  }

  const draw: AgentTool<{
    file: string
    password?: string
    items?: Item[]
    remove?: string[]
    move?: { id: string; dx: number; dy: number }[]
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "draw_on_pdf",
    title: "Draw on a PDF",
    description:
      "Adds what the PDF editor's toolbar adds, in one step: boxes, ellipses, lines, arrows, freehand strokes, covers (a filled box that hides what is under it and does not remove it: redact_pdf removes), stamps (Approved, Draft, Final, Confidential, Paid, Void or your own words), call-outs, measuring lines in mm, cm, m, in, ft or pt at a scale, text (also spread over a paper form's row of boxes), and ticks, crosses and dots for paper forms. Places are in points from the page's top-left corner as it is shown. Things added earlier and kept editable can be moved or removed by their ids (from list_pdf_comments).",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        items: { type: "array", items: itemSchema, minItems: 1, maxItems: 500 },
        remove: {
          type: "array",
          items: { type: "string", maxLength: 100 },
          maxItems: 500,
          description: "Ids of things added earlier and kept editable.",
        },
        move: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", maxLength: 100 },
              dx: { type: "number" },
              dy: { type: "number" },
            },
            required: ["id", "dx", "dy"],
            additionalProperties: false,
          },
          maxItems: 500,
          description:
            "Ids of things kept editable, and how far to move each, in points.",
        },
        keepEditable,
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-edited" },
        async (session) => {
          const ops: Op[] = []
          for (const item of input.items ?? [])
            ops.push({
              do: "add",
              page: item.page - 1,
              object: objectOf(item, onPage(session, item.page), newId()),
            })
          const things = session.state.objects
          for (const shift of input.move ?? []) {
            const page = pageOf(things, shift.id, "thing")
            const object = things[page].find((one) => one.id === shift.id)!
            ops.push({
              do: "change",
              page,
              object: moved(object, shift.dx, shift.dy),
            })
          }
          for (const id of input.remove ?? [])
            ops.push({ do: "remove", page: pageOf(things, id, "thing"), id })
          if (!ops.length)
            throw new ToolError(
              'Give "items" to add, or things to "move" or "remove".'
            )
          const news = await apply(session, { label: "Draw", ops })
          const added = (input.items ?? []).length
          return {
            said: [
              [
                added ? `${plural(added, "thing")} added` : "",
                input.move?.length
                  ? `${plural(input.move.length, "thing")} moved`
                  : "",
                input.remove?.length
                  ? `${plural(input.remove.length, "thing")} removed`
                  : "",
              ]
                .filter(Boolean)
                .join(", ") + ".",
              (input.items ?? []).some((item) => item.kind === "cover")
                ? "A cover only hides: the words under it are still in the file. redact_pdf takes them out."
                : "",
              news.lacking.length
                ? `The font has no shape for ${news.lacking.join(" ")}; ${news.lacking.length === 1 ? "it is" : "they are"} left out.`
                : "",
            ].filter(Boolean),
          }
        }
      ),
  }

  /** A comment as an agent reads it, with the words a mark lies on. */
  const described = (comment: Comment, page: number, words: string) => ({
    id: comment.id,
    page: page + 1,
    kind: comment.kind,
    type: comment.type,
    text: comment.text,
    ...(words ? { marks: words } : {}),
    author: comment.author,
    when: comment.when ? new Date(comment.when).toISOString() : null,
    box: comment.box,
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      text: reply.text,
      author: reply.author,
      when: reply.when ? new Date(reply.when).toISOString() : null,
    })),
  })

  const list: AgentTool<{ file: string; password?: string }> = {
    name: "list_pdf_comments",
    title: "List a PDF's comments",
    description:
      "Lists a PDF's comments (highlights, underlines, strike-outs, squiggles, notes, pen strokes, stamps and others from any program) with their ids, pages, words, the words a mark lies on, authors, dates and replies; and the things added by the editor and kept editable, with their ids.",
    inputSchema: {
      type: "object",
      properties: { file: fileProperty("The PDF."), password },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "" },
        async (session) => {
          const comments = []
          for (const [page, onIt] of session.state.comments.entries()) {
            const marked = onIt.some((comment) => comment.quads.length)
            const letters = marked
              ? await engine.lettersOf(session.id, page)
              : []
            for (const comment of onIt)
              comments.push(
                described(
                  comment,
                  page,
                  comment.quads.length ? wordsUnder(letters, comment.quads) : ""
                )
              )
          }
          const things = session.state.objects.flatMap((onIt, page) =>
            onIt.map((object) => ({
              id: object.id,
              page: page + 1,
              kind: KIND_NAMES[object.kind],
              box: object.box,
              ...(object.kind === "text" ? { text: object.text } : {}),
            }))
          )
          return {
            answerOnly: true,
            said: [
              `${plural(comments.length, "comment")}${things.length ? ` and ${plural(things.length, "thing")} kept editable` : ""} in ${session.name}.`,
            ],
            data: { comments, things },
          }
        }
      ),
  }

  const area: JsonSchema = {
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1 },
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", exclusiveMinimum: 0 },
      height: { type: "number", exclusiveMinimum: 0 },
    },
    required: ["page", "x", "y", "width", "height"],
    additionalProperties: false,
  }
  type Area = {
    page: number
    x: number
    y: number
    width: number
    height: number
  }
  type Asked =
    | {
        do: MarkKind
        words?: string
        matchCase?: boolean
        pattern?: PatternName
        area?: Area
        colour?: string
      }
    | {
        do: "note"
        page: number
        x: number
        y: number
        text: string
        colour?: string
      }
    | {
        do: "pen"
        page: number
        strokes: Point[][]
        colour?: string
        weight?: number
      }
    | { do: "reply"; id: string; text: string }
    | {
        do: "edit"
        id: string
        text?: string
        colour?: string
        dx?: number
        dy?: number
      }
    | { do: "delete"; id: string }

  const comment: AgentTool<{
    file: string
    password?: string
    author?: string
    changes?: Asked[]
    existing?: "keep" | "flatten" | "remove"
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "comment_on_pdf",
    title: "Comment on a PDF",
    description:
      "Marks up a PDF with its own kinds of comment, as the annotator does, in one step: highlight, underline, strike out or squiggle words (every place some words are written, every e-mail address, phone number or card number, or the words in an area), notes, highlighter-pen strokes, replies, and changes to or deletion of comments by their ids (from list_pdf_comments). Comments can also be drawn into the pages for good, or left out of the file, the ones it came with too.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        author: {
          type: "string",
          maxLength: LONGEST_NAME,
          description:
            "The name the new comments are signed with; none by default.",
        },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              do: {
                type: "string",
                enum: [...MARKS, "note", "pen", "reply", "edit", "delete"],
              },
              words: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                description: "For a mark: every place these words are written.",
              },
              matchCase: { type: "boolean" },
              pattern: {
                type: "string",
                enum: Object.keys(PATTERNS),
                description:
                  "For a mark: every e-mail address, phone number or card number.",
              },
              area: {
                ...area,
                description:
                  "For a mark: the words in this part of a page, in points.",
              },
              page: { type: "integer", minimum: 1 },
              x: { type: "number" },
              y: { type: "number" },
              strokes: {
                type: "array",
                items: {
                  type: "array",
                  items: point,
                  minItems: 1,
                  maxItems: 20000,
                },
                minItems: 1,
                maxItems: 200,
              },
              text: { type: "string", maxLength: 10000 },
              id: { type: "string", maxLength: 100 },
              colour,
              weight: { type: "number", minimum: 2, maximum: 40 },
              dx: { type: "number" },
              dy: { type: "number" },
            },
            required: ["do"],
            additionalProperties: false,
          },
        },
        existing: {
          type: "string",
          enum: ["keep", "flatten", "remove"],
          description:
            "What becomes of every comment in the result: kept as comments (the default), drawn into the pages for good (flatten), or left out (remove).",
        },
        keepEditable,
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-commented", comments: input.existing ?? "keep" },
        async (session) => {
          if (!input.changes?.length && !input.existing)
            throw new ToolError(
              'Give "changes", or what becomes of the "existing" comments.'
            )
          const when = Date.now()
          const signed = { author: input.author ?? "", when }
          const ops: CommentOp[] = []
          const said: string[] = []
          const comments = session.state.comments
          const colourFor = (
            kind: keyof typeof defaultCommentStyles.colours,
            given?: string
          ) => (given ? colourOf(given) : defaultCommentStyles.colours[kind])
          for (const asked of input.changes ?? []) {
            if (asked.do === "note") {
              onPage(session, asked.page)
              ops.push({
                ...signed,
                do: "note",
                page: asked.page - 1,
                at: { x: asked.x, y: asked.y },
                colour: colourFor("note", asked.colour),
                text: asked.text,
              })
            } else if (asked.do === "pen") {
              onPage(session, asked.page)
              ops.push({
                ...signed,
                do: "pen",
                page: asked.page - 1,
                strokes: asked.strokes,
                colour: colourFor("pen", asked.colour),
                weight: asked.weight ?? defaultCommentStyles.weight,
                opacity: PEN_OPACITY,
              })
            } else if (asked.do === "reply") {
              ops.push({
                ...signed,
                do: "reply",
                page: pageOf(comments, asked.id, "comment"),
                to: asked.id,
                text: asked.text,
              })
            } else if (asked.do === "edit") {
              ops.push({
                do: "edit",
                page: pageOf(comments, asked.id, "comment"),
                id: asked.id,
                when,
                ...(asked.text !== undefined ? { text: asked.text } : {}),
                ...(asked.colour ? { colour: colourOf(asked.colour) } : {}),
                ...(asked.dx !== undefined || asked.dy !== undefined
                  ? { move: { x: asked.dx ?? 0, y: asked.dy ?? 0 } }
                  : {}),
              })
            } else if (asked.do === "delete") {
              ops.push({
                do: "drop",
                page: pageOf(comments, asked.id, "comment"),
                id: asked.id,
              })
            } else {
              const ways = [asked.words, asked.pattern, asked.area].filter(
                (way) => way !== undefined
              ).length
              if (ways !== 1)
                throw new ToolError(
                  `A ${asked.do} needs one of "words", "pattern" or "area".`
                )
              const byPage = new Map<number, Quad[]>()
              if (asked.area) {
                const { page, x, y, width, height } = asked.area
                onPage(session, page)
                const quads = selectWords(
                  await engine.lettersOf(session.id, page - 1),
                  { x, y },
                  { x: x + width, y: y + height }
                )
                if (quads.length) byPage.set(page - 1, quads)
              } else {
                const found = await engine.redactFind(
                  session.id,
                  asked.words !== undefined
                    ? { words: asked.words, matchCase: asked.matchCase }
                    : { pattern: asked.pattern! }
                )
                for (const place of found.found)
                  byPage.set(place.page, [
                    ...(byPage.get(place.page) ?? []),
                    place.quad,
                  ])
              }
              const what = asked.words
                ? `"${asked.words}"`
                : (asked.pattern ?? "that area")
              if (!byPage.size) {
                said.push(`No words found for ${what}: nothing marked.`)
                continue
              }
              for (const [page, quads] of byPage)
                for (let at = 0; at < quads.length; at += MOST_QUADS)
                  ops.push({
                    ...signed,
                    do: "mark",
                    page,
                    kind: asked.do,
                    quads: quads.slice(at, at + MOST_QUADS),
                    colour: colourFor(asked.do, asked.colour),
                    opacity: 1,
                  })
              const places = [...byPage.values()].reduce(
                (sum, quads) => sum + quads.length,
                0
              )
              said.push(
                `${asked.do[0].toUpperCase()}${asked.do.slice(1)}: ${plural(places, "place")} of ${what} on ${plural(byPage.size, "page")}.`
              )
            }
          }
          if (ops.length)
            await engine.editComment(session.id, { label: "Comment", ops })
          else if (input.changes?.length && !input.existing)
            throw new ToolError(`${said.join(" ")} The file is left as it was.`)
          const counts = new Map<string, number>()
          for (const op of ops) counts.set(op.do, (counts.get(op.do) ?? 0) + 1)
          const named: Record<string, string> = {
            note: "note",
            pen: "pen stroke",
            reply: "reply",
            edit: "change",
            drop: "deleted comment",
          }
          const others = [...counts]
            .filter(([kind]) => kind !== "mark")
            .map(([kind, count]) => plural(count, named[kind]))
          if (others.length) said.push(`${others.join(", ")}.`)
          if (input.existing === "flatten")
            said.push("Every comment is drawn into its page for good.")
          if (input.existing === "remove")
            said.push(
              "Every comment is left out of the file, the ones it came with too."
            )
          return { said }
        }
      ),
  }

  return [draw, list, comment].map((tool) => asTool(tool as AgentTool<never>))
}
