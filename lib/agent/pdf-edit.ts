/**
 * The PDF editor's jobs as tools: each opens the file as the editor does,
 * makes its change as the editor's steps (the same changes its panels
 * make), and writes the file out with the editor's read-back checks.
 * Nothing here keeps a model of the document of its own.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import {
  blankSize,
  cutSize,
  labelOf,
  planOf,
  SHEETS,
  whyNot,
  type Edges,
  type PageOp,
  type Turn,
} from "@/lib/pdf-editor/pages"
import {
  defaultLine,
  defaultWatermark,
  lineProblem,
  markProblem,
  repeatedChange,
  SPOTS,
  type RepeatedLine,
  type Spot,
  type Watermark,
} from "@/lib/pdf-editor/repeated"
import {
  fontsFor,
  type BuiltIn,
  type Colour,
  type EditorObject,
  type TextObject,
} from "@/lib/pdf-editor/objects"
import {
  bookmarkTo,
  LONGEST_DETAIL,
  LONGEST_TITLE,
  type LabelStyle,
} from "@/lib/pdf-editor/document"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import {
  fillable,
  writeDate,
  type FieldOp,
  type FormField,
} from "@/lib/pdf-editor/forms"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import {
  changesSaid,
  signerSaid,
  verdictSaid,
} from "@/lib/pdf-editor/signature-report"
import type { Change } from "@/lib/pdf-editor/tools"
import {
  PATTERNS,
  shapeSearch,
  type Clean,
  type PatternName,
  type RedactOp,
  type Sought,
} from "@/lib/pdf-editor/redact"
import { LONGEST_FIND, opFor } from "@/lib/pdf-editor/find"
import { ocrSummary, type TesseractBlock } from "@/lib/pdf-editor/ocr"
import { ocrLabel, readPages } from "@/lib/pdf-editor/ocr-run"
import { MOST_LANGUAGES, OCR_LANGUAGES } from "@/lib/pdf-editor/ocr-files"
import {
  LARGEST_TEXT,
  SMALLEST_TEXT,
  textHeight,
} from "@/lib/pdf-editor/objects"
import type { FileStore } from "./files"
import {
  kindOf,
  lock,
  lockOf,
  pagesOf,
  password,
  plural,
  type LockInput,
} from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import {
  asTool,
  fileProperty,
  filesProperty,
  ToolError,
  type AgentTool,
  type JsonSchema,
  type ToolContext,
} from "./registry"

/** Tesseract, started for some languages (codes joined with "+"): what it reads on a page drawn in grey, and how to let it go. */
export type StartOcr = (
  languages: string,
  onShare: (share: number) => void
) => Promise<{ read(png: Uint8Array): Promise<TesseractBlock[]>; stop(): void }>

/** What text needs that only the browser has: the editor's fonts, and lines broken as the editor breaks them. */
export interface EditText {
  /** A font's file, made ready for measuring too. */
  font(key: string): Promise<ArrayBuffer>
  layOut(object: TextObject): TextObject
}

const FONTS: BuiltIn[] = [
  "sans",
  "serif",
  "mono",
  "greatvibes",
  "sacramento",
  "kalam",
  "aurore",
]

/** A colour written as #rrggbb, as the editor keeps it (0 to 1). */
export function colourOf(hex: string): Colour {
  const found = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!found)
    throw new ToolError(`"${hex}" is not a colour written as #rrggbb.`)
  return [1, 2, 3].map(
    (at) => parseInt(found[at], 16) / 255
  ) as unknown as Colour
}

const colour = {
  type: "string",
  pattern: "^#?[0-9a-fA-F]{6}$",
  description: "A colour as #rrggbb.",
}
const pagesProperty = (what: string) => ({
  type: "string",
  maxLength: 20000,
  description: `${what}, counted from 1, such as "1-3, 7"; every page by default.`,
})
const font = {
  type: "string",
  enum: FONTS,
  description:
    "sans (the default), serif, mono, or a hand: greatvibes, sacramento, kalam, aurore.",
}
const keepEditable = {
  type: "boolean",
  description:
    "Leave what is added as separate things a PDF editor can move or delete, instead of making it part of the pages.",
}

/** The words a written file's checks come to. */
export function checksSaid(report: ExportReport) {
  const said: string[] = []
  if (report.text.boxes)
    said.push(
      report.text.found === report.text.boxes
        ? `Checked: the words of ${plural(report.text.boxes, "added text")} read back from the file.`
        : `Only ${report.text.found} of ${plural(report.text.boxes, "added text")} read back from the file.`
    )
  if (report.ocr)
    said.push(
      report.ocr.found === report.ocr.checked
        ? `Checked: the ${plural(report.ocr.checked, "recognised word")} read back from the file.`
        : `Only ${report.ocr.found} of ${plural(report.ocr.checked, "recognised word")} read back from the file.`
    )
  if (report.untouched.checked)
    said.push(
      report.untouched.differ.length
        ? `${plural(report.untouched.differ.length, "untouched page")} look different: page ${report.untouched.differ.map((page) => page + 1).join(", ")}.`
        : `${plural(report.untouched.checked, "untouched page")} compared with the original: the same.`
    )
  return said
}

interface Session {
  id: string
  name: string
  pages: number
  sizes: Size[]
  state: Awaited<ReturnType<PdfEngine["openForEdit"]>>["state"]
  signed: boolean
}

interface Outcome {
  said: string[]
  data?: unknown
  /** Nothing to write: the answer is all there is. */
  answerOnly?: boolean
}

let made = 0
const newId = () => `a${Date.now().toString(36)}${(made++).toString(36)}`

export function pdfEditTools(
  engine: PdfEngine,
  text: EditText,
  ocr: StartOcr
): AgentTool[] {
  /** Opens the file for editing, makes the change, and writes it out with the editor's checks. */
  async function editing(
    files: FileStore,
    context: ToolContext,
    input: {
      file: string
      password?: string
      keepEditable?: boolean
      lock?: LockInput
    },
    how: {
      suffix: string
      fields?: "keep" | "flatten"
      /** Never written after a signature: what was taken out must not stay in the file beneath. */
      anew?: boolean
      clean?: Clean
    },
    work: (session: Session) => Promise<Outcome>
  ) {
    const { blob, ref } = files.get(input.file)
    await kindOf(blob, ref.name, false)
    const locked = lockOf(input.lock)
    const { id, facts, state } = await engine.openForEdit(
      blob,
      ref.name,
      input.password
    )
    try {
      const session: Session = {
        id,
        name: ref.name,
        pages: state.sizes.length,
        sizes: state.sizes,
        state,
        signed: facts.signed,
      }
      const outcome = await work(session)
      if (outcome.answerOnly)
        return { summary: outcome.said.join(" "), data: outcome.data }
      context.progress(0.8, "Writing the file")
      // A signed file is written after its signature where it can be, which keeps it valid.
      const after = facts.signed && state.after && !locked && !how.anew
      const { bytes, report } = await engine.exportEdit(
        id,
        {
          keepEditable: Boolean(input.keepEditable),
          comments: "keep",
          fields: how.fields ?? "keep",
          after,
          lock: locked,
          ...(how.clean ? { clean: how.clean } : {}),
        },
        context.signal
      )
      const stem = ref.name.replace(/\.pdf$/i, "")
      const file = files.add(
        new Blob([bytes], { type: "application/pdf" }),
        `${stem}${how.suffix}.pdf`,
        "made"
      )
      const said = [...outcome.said, ...checksSaid(report)]
      if (facts.signed)
        said.push(
          after
            ? "The changes were written after its signature, which still covers what was signed."
            : "It was signed; written anew, its signature no longer holds."
        )
      if (locked) said.push("Locked with the password given.")
      return {
        summary: said.join(" "),
        files: [file],
        data: {
          ...(outcome.data as object | undefined),
          checked: {
            addedTexts: report.text,
            untouchedPages: report.untouched,
            fontsCut: report.fontsCut,
          },
        },
      }
    } finally {
      engine.close(id)
    }
  }

  /** Every font a thing needs, in the worker and ready for measuring, before the change. */
  async function fontsReady(
    id: string,
    ready: Set<string>,
    object: EditorObject
  ) {
    for (const key of fontsFor(object)) {
      if (ready.has(key)) continue
      engine.editFont(id, key, await text.font(key))
      ready.add(key)
    }
  }

  /** Sends a change that adds things, with text laid out as the editor lays it out. */
  async function apply(session: Session, change: Change) {
    const ready = new Set<string>()
    const ops = []
    // What is put on many pages is only ever things added.
    for (const op of change.ops as Extract<
      Change["ops"][number],
      { do: "add" }
    >[]) {
      await fontsReady(session.id, ready, op.object)
      ops.push(
        op.object.kind === "text"
          ? { ...op, object: text.layOut(op.object) }
          : op
      )
    }
    return engine.editApply(session.id, { label: change.label, ops })
  }

  const targetOf = (session: Session, given: string | undefined) =>
    given
      ? [...new Set(pagesOf(given, session.pages, "pages"))]
      : Array.from({ length: session.pages }, (_, page) => page)

  const TURNS = [90, 180, 270]
  const organize: AgentTool<{
    file: string
    password?: string
    steps: {
      do: "turn" | "delete" | "move" | "copy" | "blank" | "size" | "insert"
      pages?: string
      by?: Turn
      to?: number
      at?: number
      size?: "A4" | "Letter"
      insert?: number
    }[]
    insertFiles?: string[]
    insertPasswords?: string[]
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "organize_pdf_pages",
    title: "Organise the pages of a PDF",
    description:
      "Turns, deletes, moves, copies or resizes pages, adds blank pages, and puts in every page of other PDFs, as steps in order. Pages are counted from 1 as the file stands at each step. A page that moves is the same page, with its links, notes and fields; what led to a deleted page is taken out with it.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              do: {
                type: "string",
                enum: [
                  "turn",
                  "delete",
                  "move",
                  "copy",
                  "blank",
                  "size",
                  "insert",
                ],
              },
              pages: {
                type: "string",
                maxLength: 20000,
                description:
                  'The pages it is done to, such as "2-4" (turn, delete, move, copy, size).',
              },
              by: {
                type: "integer",
                enum: TURNS,
                description: "For turn: degrees clockwise.",
              },
              to: {
                type: "integer",
                minimum: 1,
                description:
                  "For move: the pages go before the page now at this place; one more than the page count puts them at the end.",
              },
              at: {
                type: "integer",
                minimum: 1,
                description:
                  "For blank and insert: before the page now at this place; one more than the count is the end (the default).",
              },
              size: {
                type: "string",
                enum: ["A4", "Letter"],
                description:
                  "For size: the sheet each page is made to fit; for blank: its size (the page before's by default).",
              },
              insert: {
                type: "integer",
                minimum: 1,
                description:
                  "For insert: which of insertFiles, counted from 1.",
              },
            },
            required: ["do"],
            additionalProperties: false,
          },
        },
        insertFiles: filesProperty(
          "Other PDFs whose pages insert steps put in.",
          1,
          20
        ),
        insertPasswords: {
          type: "array",
          items: { type: "string", maxLength: 127 },
          description: 'For each of insertFiles, its password; "" for none.',
        },
        keepEditable,
        lock,
      },
      required: ["file", "steps"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-pages" },
        async (session) => {
          let count = session.pages
          let sizes = session.sizes
          const names = new Map<number, { name: string; pages: number }>()
          const said: string[] = []
          for (const [index, step] of input.steps.entries()) {
            const where = `Step ${index + 1} (${step.do})`
            const pagesFor = () => {
              if (!step.pages) throw new ToolError(`${where} needs "pages".`)
              return [...new Set(pagesOf(step.pages, count, where))].sort(
                (a, b) => a - b
              )
            }
            const place = (at: number | undefined) => {
              const value = (at ?? count + 1) - 1
              if (value > count)
                throw new ToolError(
                  `${where}: there are ${count} pages, so the place is at most ${count + 1}.`
                )
              return value
            }
            let op: PageOp
            if (step.do === "turn") {
              if (!step.by) throw new ToolError(`${where} needs "by".`)
              op = { do: "turn", pages: pagesFor(), by: step.by }
            } else if (step.do === "delete")
              op = { do: "delete", pages: pagesFor() }
            else if (step.do === "copy") op = { do: "copy", pages: pagesFor() }
            else if (step.do === "move") {
              if (!step.to) throw new ToolError(`${where} needs "to".`)
              op = { do: "move", pages: pagesFor(), to: place(step.to) }
            } else if (step.do === "size") {
              if (!step.size) throw new ToolError(`${where} needs "size".`)
              op = { do: "size", pages: pagesFor(), size: SHEETS[step.size] }
            } else if (step.do === "blank") {
              const at = place(step.at)
              op = {
                do: "blank",
                at,
                size: step.size ? SHEETS[step.size] : blankSize(sizes, at),
              }
            } else {
              const which = step.insert ?? 1
              const id = input.insertFiles?.[which - 1]
              if (!id)
                throw new ToolError(
                  `${where} names insertFiles ${which}, which was not given.`
                )
              let taken = names.get(which)
              if (!taken) {
                const { blob, ref } = context.files.get(id)
                await kindOf(blob, ref.name, false)
                const name = `pdf-${newId()}`
                const pages = await engine.editInsert(
                  session.id,
                  name,
                  blob,
                  ref.name,
                  input.insertPasswords?.[which - 1] || undefined
                )
                taken = { name, pages }
                names.set(which, taken)
              }
              op = {
                do: "insert",
                at: place(step.at),
                file: taken.name,
                count: taken.pages,
              }
            }
            const problem = whyNot(count, op)
            if (problem) throw new ToolError(`${where}: ${problem}`)
            const news = await engine.editPages(session.id, {
              label: labelOf(op),
              ops: [op],
            })
            count = planOf(count, op)!.length
            if (news.layout) sizes = news.layout.sizes
            said.push(labelOf(op))
            context.progress(((index + 1) / input.steps.length) * 0.7)
          }
          return {
            said: [
              `${said.join("; ")}. The file now has ${plural(count, "page")}.`,
            ],
            data: { pages: count },
          }
        }
      ),
  }

  const UNITS = { pt: 1, mm: 72 / 25.4, in: 72 }
  const crop: AgentTool<{
    file: string
    password?: string
    pages?: string
    left?: number
    top?: number
    right?: number
    bottom?: number
    unit?: keyof typeof UNITS
    whole?: boolean
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "crop_pdf",
    title: "Crop a PDF",
    description:
      "Cuts so much off each edge of what pages show, or with whole shows the whole sheet again. What is cut off is hidden, not removed: it stays in the file and a PDF editor can show it again. To take something out for good, use redaction.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        pages: pagesProperty("The pages to crop"),
        left: { type: "number", minimum: 0 },
        top: { type: "number", minimum: 0 },
        right: { type: "number", minimum: 0 },
        bottom: { type: "number", minimum: 0 },
        unit: {
          type: "string",
          enum: Object.keys(UNITS),
          description: "pt (the default; 72 to an inch), mm or in.",
        },
        whole: {
          type: "boolean",
          description: "Show each page's whole sheet again instead.",
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
        { suffix: "-cropped" },
        async (session) => {
          const pages = targetOf(session, input.pages)
          const scale = UNITS[input.unit ?? "pt"]
          const off: Edges = {
            left: (input.left ?? 0) * scale,
            top: (input.top ?? 0) * scale,
            right: (input.right ?? 0) * scale,
            bottom: (input.bottom ?? 0) * scale,
          }
          let op: PageOp
          if (input.whole) op = { do: "whole", pages }
          else {
            if (!(off.left + off.top + off.right + off.bottom))
              throw new ToolError(
                "Say how much to cut off an edge (left, top, right, bottom), or give whole."
              )
            const small = pages.find(
              (page) => !cutSize(session.sizes[page], off)
            )
            if (small !== undefined)
              throw new ToolError(
                `That leaves too little of page ${small + 1}: at least 18 points of its width and height must show.`
              )
            op = { do: "crop", pages, off }
          }
          await engine.editPages(session.id, { label: labelOf(op), ops: [op] })
          return {
            said: [
              input.whole
                ? `The whole sheet of ${plural(pages.length, "page")} shows again.`
                : `Cropped ${plural(pages.length, "page")}. What was cut off is hidden, not removed: it is still in the file.`,
            ],
          }
        }
      ),
  }

  const lineSchema = {
    position: {
      type: "string",
      enum: [...SPOTS],
      description:
        "top-left, top-centre, top-right, bottom-left, bottom-centre (the default) or bottom-right.",
    },
    pages: pagesProperty("The pages, in the order they are numbered in"),
    size: {
      type: "number",
      minimum: 4,
      maximum: 288,
      description: "Letter size in points (10).",
    },
    margin: {
      type: "number",
      minimum: 0,
      maximum: 200,
      description: "Distance from the edges in points (28).",
    },
    font,
    bold: { type: "boolean" },
    colour,
  }
  type LineInput = {
    file: string
    password?: string
    position?: Spot
    pages?: string
    size?: number
    margin?: number
    font?: BuiltIn
    bold?: boolean
    colour?: string
    keepEditable?: boolean
    lock?: LockInput
  }
  async function writeLine(
    session: Session,
    input: LineInput,
    text_: string,
    numbers: { from?: number; first?: number; figures?: number }
  ) {
    const line: RepeatedLine = {
      ...defaultLine,
      text: text_,
      spot: input.position ?? defaultLine.spot,
      size: input.size ?? defaultLine.size,
      margin: input.margin ?? defaultLine.margin,
      font: input.font ?? defaultLine.font,
      bold: input.bold ?? defaultLine.bold,
      colour: input.colour ? colourOf(input.colour) : defaultLine.colour,
      from: numbers.from ?? defaultLine.from,
      first: numbers.first ?? defaultLine.first,
      figures: numbers.figures ?? defaultLine.figures,
    }
    const problem = lineProblem(line)
    if (problem) throw new ToolError(problem)
    const pages = targetOf(session, input.pages)
    await apply(
      session,
      repeatedChange(
        { line },
        pages,
        session.sizes,
        {
          date: new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(
            new Date()
          ),
          name: session.name,
        },
        newId
      )
    )
    return pages.length
  }

  const FORMATS = {
    "1": "{page}",
    "Page 1": "Page {page}",
    "1 of 9": "{page} of {pages}",
    "Page 1 of 9": "Page {page} of {pages}",
  }
  const numbers: AgentTool<
    LineInput & {
      format?: keyof typeof FORMATS
      startAt?: number
      bates?: {
        prefix?: string
        suffix?: string
        first?: number
        figures?: number
      }
    }
  > = {
    name: "add_page_numbers",
    title: "Add page numbers to a PDF",
    description:
      'Writes page numbers ("1", "Page 1", "1 of 9" or "Page 1 of 9") on pages, or with bates, numbers that run on with a fixed count of figures and a prefix, such as ACME000123. Each is an ordinary line of text on its page.',
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        format: { type: "string", enum: Object.keys(FORMATS) },
        startAt: {
          type: "integer",
          minimum: 0,
          maximum: 99999,
          description: "The number the first page gets (1).",
        },
        bates: {
          type: "object",
          description: "Bates numbers instead of page numbers.",
          properties: {
            prefix: { type: "string", maxLength: 40 },
            suffix: { type: "string", maxLength: 40 },
            first: {
              type: "integer",
              minimum: 0,
              description: "The first number (1).",
            },
            figures: {
              type: "integer",
              minimum: 1,
              maximum: 12,
              description: "How many figures each is written with (6).",
            },
          },
          additionalProperties: false,
        },
        ...lineSchema,
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
        { suffix: "-numbered" },
        async (session) => {
          if (input.bates && input.format)
            throw new ToolError('Give "format" or "bates", not both.')
          const written = input.bates
            ? await writeLine(
                session,
                input,
                `${input.bates.prefix ?? ""}{number}${input.bates.suffix ?? ""}`,
                {
                  first: input.bates.first,
                  figures: input.bates.figures,
                }
              )
            : await writeLine(session, input, FORMATS[input.format ?? "1"], {
                from: input.startAt,
              })
          return {
            said: [
              `${input.bates ? "Bates numbers" : "Page numbers"} written on ${plural(written, "page")}.`,
            ],
          }
        }
      ),
  }

  const headerFooter: AgentTool<
    LineInput & { text: string; startAt?: number }
  > = {
    name: "add_header_footer",
    title: "Add a header or footer to a PDF",
    description:
      "Writes a line at the same place of many pages: a header, a footer or any other words. In the words, {page} is the page's number, {pages} how many pages there are, {date} today's date and {name} the file's name.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        text: { type: "string", minLength: 1, maxLength: 200 },
        startAt: {
          type: "integer",
          minimum: 0,
          maximum: 99999,
          description: "The number {page} is on the first page (1).",
        },
        ...lineSchema,
        keepEditable,
        lock,
      },
      required: ["file", "text"],
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
          const written = await writeLine(session, input, input.text, {
            from: input.startAt,
          })
          return { said: [`Written on ${plural(written, "page")}.`] }
        }
      ),
  }

  const watermark: AgentTool<{
    file: string
    password?: string
    text?: string
    image?: string
    slanted?: boolean
    opacity?: number
    share?: number
    font?: BuiltIn
    bold?: boolean
    colour?: string
    pages?: string
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "watermark_pdf",
    title: "Watermark a PDF",
    description:
      "Lays words (DRAFT by default) or a picture over the middle of pages, slanted or level, see-through. A watermark marks a file; it does not protect it: anyone with a PDF editor can take it off.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        text: { type: "string", maxLength: 60 },
        image: fileProperty(
          "A PNG, JPEG, WebP or AVIF picture instead of words."
        ),
        slanted: {
          type: "boolean",
          description:
            "From the lower left to the upper right (yes by default).",
        },
        opacity: {
          type: "number",
          minimum: 0.05,
          maximum: 1,
          description: "0.05 (hardly there) to 1 (solid); 0.2 by default.",
        },
        share: {
          type: "number",
          minimum: 0.2,
          maximum: 1,
          description: "How much of the page it spans, 0.2 to 1 (0.7).",
        },
        font,
        bold: { type: "boolean" },
        colour,
        pages: pagesProperty("The pages"),
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
        { suffix: "-watermarked" },
        async (session) => {
          if (input.text !== undefined && input.image)
            throw new ToolError('Give "text" or "image", not both.')
          let picture: Watermark["picture"]
          if (input.image) {
            const name = newId()
            const size = await engine.editPicture(
              session.id,
              name,
              context.files.get(input.image).blob
            )
            picture = { name, size }
          }
          const mark: Watermark = {
            ...defaultWatermark,
            text: input.text ?? defaultWatermark.text,
            picture,
            slanted: input.slanted ?? defaultWatermark.slanted,
            opacity: input.opacity ?? defaultWatermark.opacity,
            share: input.share ?? defaultWatermark.share,
            font: input.font ?? defaultWatermark.font,
            bold: input.bold ?? defaultWatermark.bold,
            colour: input.colour
              ? colourOf(input.colour)
              : defaultWatermark.colour,
          }
          const problem = markProblem(mark)
          if (problem) throw new ToolError(problem)
          const pages = targetOf(session, input.pages)
          await apply(
            session,
            repeatedChange(
              { mark },
              pages,
              session.sizes,
              { date: "", name: session.name },
              newId
            )
          )
          return {
            said: [
              `Watermarked ${plural(pages.length, "page")}. A watermark marks a file; it does not protect it.`,
            ],
          }
        }
      ),
  }

  interface BookmarkInput {
    title: string
    page: number
    children?: BookmarkInput[]
  }
  const bookmarkSchema: JsonSchema = {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: LONGEST_TITLE },
      page: { type: "integer", minimum: 1 },
      children: {
        type: "array",
        items: { $ref: "#/$defs/bookmark" },
        maxItems: 1000,
      },
    },
    required: ["title", "page"],
    additionalProperties: false,
  }
  const STYLES: Record<string, LabelStyle> = {
    "1": "D",
    i: "r",
    I: "R",
    a: "a",
    A: "A",
    none: "",
  }
  const details: AgentTool<{
    file: string
    password?: string
    title?: string
    author?: string
    subject?: string
    keywords?: string
    bookmarks?: BookmarkInput[]
    pageLabels?: {
      from: number
      style: keyof typeof STYLES
      prefix?: string
      start?: number
    }[]
    lock?: LockInput
  }> = {
    name: "edit_pdf_details",
    title: "Change a PDF's details, bookmarks or page labels",
    description:
      "Sets the title, author, subject and keywords a PDF gives itself; replaces its bookmarks with a new list (each leading to a page, with bookmarks beneath); or sets the page numbers readers show (labels), such as i, ii, iii for the front pages and 1, 2, 3 after.",
    inputSchema: {
      $defs: { bookmark: bookmarkSchema },
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        title: { type: "string", maxLength: LONGEST_DETAIL },
        author: { type: "string", maxLength: LONGEST_DETAIL },
        subject: { type: "string", maxLength: LONGEST_DETAIL },
        keywords: { type: "string", maxLength: LONGEST_DETAIL },
        bookmarks: {
          type: "array",
          items: { $ref: "#/$defs/bookmark" },
          maxItems: 10000,
          description:
            "The new bookmarks, replacing the file's own; [] takes them all out.",
        },
        pageLabels: {
          type: "array",
          maxItems: 200,
          description:
            "Runs of page labels; each starts at a page (from 1) and runs until the next.",
          items: {
            type: "object",
            properties: {
              from: { type: "integer", minimum: 1 },
              style: {
                type: "string",
                enum: Object.keys(STYLES),
                description: '"1", "i", "I", "a", "A" or "none".',
              },
              prefix: { type: "string", maxLength: 40 },
              start: {
                type: "integer",
                minimum: 1,
                description: "The number the run begins with (1).",
              },
            },
            required: ["from", "style"],
            additionalProperties: false,
          },
        },
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
          const ops = []
          const said: string[] = []
          const named = ["title", "author", "subject", "keywords"] as const
          if (named.some((key) => input[key] !== undefined)) {
            const had = session.state.document.details
            ops.push({
              do: "details" as const,
              details: {
                title: input.title ?? had.title,
                author: input.author ?? had.author,
                subject: input.subject ?? had.subject,
                keywords: input.keywords ?? had.keywords,
              },
            })
            said.push("Details set.")
          }
          if (input.bookmarks) {
            const made = (items: BookmarkInput[]): Bookmark[] =>
              items.map((item) => {
                if (item.page > session.pages)
                  throw new ToolError(
                    `The bookmark “${item.title}” leads to page ${item.page}, but there are ${session.pages}.`
                  )
                return {
                  ...bookmarkTo(item.title, item.page - 1),
                  children: made(item.children ?? []),
                }
              })
            ops.push({ do: "bookmarks" as const, items: made(input.bookmarks) })
            said.push(
              input.bookmarks.length
                ? "Bookmarks replaced."
                : "Bookmarks taken out."
            )
          }
          if (input.pageLabels) {
            const runs = [...input.pageLabels].sort((a, b) => a.from - b.from)
            if (runs.some((run) => run.from > session.pages))
              throw new ToolError(
                `A run of labels starts past the last page (${session.pages}).`
              )
            ops.push({
              do: "labels" as const,
              runs: runs.map((run) => ({
                start: run.from - 1,
                style: STYLES[run.style],
                prefix: run.prefix ?? "",
                first: run.start ?? 1,
              })),
            })
            said.push("Page labels set.")
          }
          if (!ops.length)
            throw new ToolError(
              "Give details, bookmarks or pageLabels to change."
            )
          await engine.editDocument(session.id, {
            label: "Change the file's details",
            ops,
          })
          return { said }
        }
      ),
  }

  /** Every field of the form once, by its name, with where its places are. */
  function fieldsOf(session: Session) {
    const byName = new Map<
      string,
      {
        field: FormField
        page: number
        places: { page: number; field: FormField }[]
      }
    >()
    session.state.fields.forEach((list, page) =>
      list.forEach((field) => {
        const known = byName.get(field.name)
        if (known) known.places.push({ page, field })
        else byName.set(field.name, { field, page, places: [{ page, field }] })
      })
    )
    return byName
  }
  const fieldValue = (entry: {
    field: FormField
    places: { field: FormField }[]
  }) =>
    entry.field.kind === "check"
      ? entry.field.on
      : entry.field.kind === "radio"
        ? entry.places.findIndex((place) => place.field.on) + 1 || null
        : entry.field.value

  const listFields: AgentTool<{ file: string; password?: string }> = {
    name: "list_pdf_form_fields",
    title: "List a PDF's form fields",
    description:
      "Lists the fields of a PDF form: each one's name (which fill_pdf_form takes), kind, label, what it holds, its choices, and whether it is required or read-only. A round-button group is filled by the number of its choice, counted from 1 in page order.",
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
          const fields = [...fieldsOf(session).values()].map((entry) => ({
            name: entry.field.name,
            kind: entry.field.kind,
            label: entry.field.label,
            value: fieldValue(entry),
            ...(entry.field.kind === "radio"
              ? { choices: entry.places.length }
              : {}),
            ...(entry.field.options.length
              ? {
                  options: entry.field.shown.length
                    ? entry.field.shown
                    : entry.field.options,
                }
              : {}),
            ...(entry.field.date ? { date: entry.field.date } : {}),
            required: entry.field.required,
            readOnly: entry.field.readOnly || !fillable(entry.field),
            page: entry.page + 1,
          }))
          const { form } = session.state
          return {
            answerOnly: true,
            said: [
              fields.length
                ? `${plural(fields.length, "field")}.`
                : "This PDF has no form fields.",
              form.xfa
                ? "The form is also of the XFA kind, which is not read here."
                : "",
              form.scripts
                ? "Some fields are worked out by scripts, which are never run here."
                : "",
            ].filter(Boolean),
            data: fields,
          }
        }
      ),
  }

  const fillForm: AgentTool<{
    file: string
    password?: string
    values: Record<string, string | boolean | number>
    flatten?: boolean
    lock?: LockInput
  }> = {
    name: "fill_pdf_form",
    title: "Fill in a PDF form",
    description:
      "Fills a PDF's form fields by name (from list_pdf_form_fields): words for a text field, true or false for a tick box, the number of the choice for round buttons, one of the options for a drop-down or list, and for a date field the day as 2026-10-22. With flatten, what is filled in becomes part of the page and the fields go. The file's scripts are never run.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        values: {
          type: "object",
          minProperties: 1,
          additionalProperties: { type: ["string", "boolean", "number"] },
          description: "Field names and what each is to hold.",
        },
        flatten: { type: "boolean" },
        lock,
      },
      required: ["file", "values"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) =>
      editing(
        context.files,
        context,
        input,
        { suffix: "-filled", fields: input.flatten ? "flatten" : "keep" },
        async (session) => {
          const fields = fieldsOf(session)
          const ops: FieldOp[] = []
          for (const [name, wanted] of Object.entries(input.values)) {
            const entry = fields.get(name)
            if (!entry)
              throw new ToolError(
                `There is no field called “${name}”. The fields are: ${[...fields.keys()].join(", ") || "none"}.`
              )
            const { field, page } = entry
            if (!fillable(field))
              throw new ToolError(
                `“${name}” cannot be filled in: it is ${field.kind === "signature" ? "a place for a signature" : field.kind === "button" ? "a button" : "read-only"}.`
              )
            if (field.kind === "check") {
              if (typeof wanted !== "boolean")
                throw new ToolError(
                  `“${name}” is a tick box: give true or false.`
                )
              ops.push({ do: "turn", page, id: field.id, on: wanted })
            } else if (field.kind === "radio") {
              if (
                typeof wanted !== "number" ||
                !Number.isInteger(wanted) ||
                wanted < 1 ||
                wanted > entry.places.length
              )
                throw new ToolError(
                  `“${name}” is a group of ${entry.places.length} round buttons: give the number of the choice, 1 to ${entry.places.length}.`
                )
              const place = entry.places[wanted - 1]
              ops.push({
                do: "turn",
                page: place.page,
                id: place.field.id,
                on: true,
              })
            } else {
              let value = String(wanted)
              if (field.kind === "choice" || field.kind === "list") {
                const chosen = value.split("\n").map((one) => {
                  const at = field.shown.indexOf(one)
                  const option =
                    at >= 0
                      ? field.options[at]
                      : field.options.includes(one)
                        ? one
                        : null
                  if (
                    option === null &&
                    !(field.kind === "choice" && field.custom)
                  )
                    throw new ToolError(
                      `“${name}” offers: ${(field.shown.length ? field.shown : field.options).join(", ")}.`
                    )
                  return option ?? one
                })
                if (chosen.length > 1 && !field.multiple)
                  throw new ToolError(`“${name}” takes one choice.`)
                value = chosen.join("\n")
              } else if (field.date && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                const written = writeDate(value, field.date)
                if (!written) throw new ToolError(`${value} is not a day.`)
                value = written
              }
              if (field.maxLength && value.length > field.maxLength)
                throw new ToolError(
                  `“${name}” takes at most ${field.maxLength} letters.`
                )
              ops.push({ do: "fill", page, id: field.id, value })
            }
          }
          await engine.editField(session.id, {
            label: `Fill in ${plural(ops.length, "field")}`,
            ops,
          })
          return {
            said: [
              `Filled in ${plural(ops.length, "field")}${input.flatten ? " and made them part of the pages" : ""}.`,
              session.state.form.scripts
                ? "Fields worked out by scripts were not worked out: scripts are never run here."
                : "",
            ].filter(Boolean),
          }
        }
      ),
  }

  const verify: AgentTool<{ file: string; password?: string }> = {
    name: "verify_pdf_signatures",
    title: "Check a PDF's signatures",
    description:
      "Checks the digital signatures a PDF carries: whether each still holds for what it covers, who its certificate names, when it says it was signed, and what was changed after it. Whether a certificate can be trusted is for the reader to judge; KeepSimp keeps no list of trusted issuers, and nothing is asked of the network. A signature that holds is not proof of who signed.",
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
          const found = await engine.signatures(session.id)
          const data = found.map((signature) => {
            const verdict = verdictSaid(signature)
            return {
              field: signature.field,
              page: signature.page === null ? null : signature.page + 1,
              verdict: verdict.text,
              holds: verdict.good,
              signer: signerSaid(signature),
              time: signature.time,
              reason: signature.reason,
              location: signature.location,
              coversWholeFile: signature.whole,
              changedAfter: signature.changes
                ? changesSaid(signature.changes)
                : null,
            }
          })
          return {
            answerOnly: true,
            said: [
              found.length
                ? `${plural(found.length, "signature")}: ${data.filter((one) => one.holds).length} still ${data.filter((one) => one.holds).length === 1 ? "holds" : "hold"}. Trust in a certificate is for the reader to judge.`
                : "This PDF carries no digital signature.",
            ],
            data,
          }
        }
      ),
  }

  const redact: AgentTool<{
    file: string
    password?: string
    words?: string[]
    patterns?: PatternName[]
    shapes?: string[]
    matchCase?: boolean
    wholeDrawings?: boolean
    removeDetails?: boolean
    removeAttachments?: boolean
    removeScripts?: boolean
    lock?: LockInput
  }> = {
    name: "redact_pdf",
    title: "Redact a PDF",
    description:
      "Takes words out of a PDF for good: every place that holds the words, e-mail addresses, phone numbers, card numbers or a shape such as ###-##-#### (# a figure, @ a letter, * a run) is marked, then the letters, pictures and drawings under each mark are removed and a black box drawn there. The file is checked: no letter may still be readable under a mark. Only text a PDF holds can be found; on a scanned page, recognise it first (ocr_pdf).",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        words: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200 },
          maxItems: 50,
        },
        patterns: {
          type: "array",
          items: { type: "string", enum: Object.keys(PATTERNS) },
          uniqueItems: true,
          description: "email, phone or card.",
        },
        shapes: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200 },
          maxItems: 20,
        },
        matchCase: {
          type: "boolean",
          description: "For words: capitals and small letters are told apart.",
        },
        wholeDrawings: {
          type: "boolean",
          description:
            "Take out drawings a mark only touches, whole (such as the rule of a table), instead of only what lies under the mark.",
        },
        removeDetails: {
          type: "boolean",
          description:
            "Also leave out the file's title, author and other details.",
        },
        removeAttachments: {
          type: "boolean",
          description: "Also leave out files attached to it.",
        },
        removeScripts: {
          type: "boolean",
          description: "Also leave out its scripts.",
        },
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    run: (input, context) => {
      const sought: { what: Sought; named: string }[] = [
        ...(input.words ?? []).map((words) => ({
          what: { words, matchCase: Boolean(input.matchCase) },
          named: `“${words}”`,
        })),
        ...(input.patterns ?? []).map((pattern) => ({
          what: { pattern },
          named: PATTERNS[pattern].name.toLowerCase(),
        })),
        ...(input.shapes ?? []).map((shape) => {
          if (!shapeSearch(shape))
            throw new ToolError(
              `The shape “${shape}” cannot be looked for: it needs a letter, a figure or a # or @ of its own, and may have two * at most.`
            )
          return { what: { shape }, named: `the shape “${shape}”` }
        }),
      ]
      if (!sought.length)
        throw new ToolError(
          'Say what to take out: "words", "patterns" or "shapes".'
        )
      const clean = {
        details: Boolean(input.removeDetails),
        attachments: Boolean(input.removeAttachments),
        scripts: Boolean(input.removeScripts),
      }
      return editing(
        context.files,
        context,
        input,
        { suffix: "-redacted", anew: true, clean },
        async (session) => {
          const marks: RedactOp[] = []
          const counted: string[] = []
          let more = false
          for (const [index, { what, named }] of sought.entries()) {
            context.progress(
              (index / sought.length) * 0.3,
              `Looking for ${named}`
            )
            const got = await engine.redactFind(session.id, what)
            more ||= got.more
            counted.push(`${named}: ${got.found.length}`)
            for (const place of got.found)
              marks.push({
                do: "mark",
                page: place.page,
                id: newId(),
                quads: [place.quad],
              })
          }
          if (!marks.length)
            return {
              answerOnly: true,
              said: [
                `Nothing was taken out: none of ${sought.map((one) => one.named).join(", ")} was found in the words of this file. A scanned page has no words until it is recognised (ocr_pdf).`,
              ],
            }
          await engine.editRedact(session.id, {
            label: `Mark ${plural(marks.length, "place")}`,
            ops: marks,
          })
          context.progress(0.5, "Taking out what is under the marks")
          const news = await engine.editRedact(session.id, {
            label: "Apply the marks",
            ops: [
              {
                do: "apply",
                ...(input.wholeDrawings ? { touched: true } : {}),
              },
            ],
          })
          // Applying always says what it did on each page.
          const applied = news.applied!
          const places = applied.reduce(
            (sum, page) => sum + page.boxes.length,
            0
          )
          const residue = applied.reduce((sum, page) => sum + page.residue, 0)
          return {
            said: [
              `${plural(places, "place")} on ${plural(applied.length, "page")} ${places === 1 ? "was" : "were"} emptied for good (${counted.join("; ")}): the letters, pictures and drawings under ${places === 1 ? "it are" : "them are"} gone and a black box is drawn there.`,
              more
                ? "There were more places than are looked through at once: run it again to be sure every one is gone."
                : "",
              residue
                ? `Under ${plural(residue, "mark")} something is still drawn: a drawing that reaches beyond its mark, such as the rule of a table. Run it again with wholeDrawings to take those whole.`
                : "",
            ].filter(Boolean),
            data: { places, pages: applied.length, residue, found: counted },
          }
        }
      )
    },
  }

  const replace: AgentTool<{
    file: string
    password?: string
    find: string
    replace: string
    matchCase?: boolean
    wholeWords?: boolean
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "find_replace_pdf_text",
    title: "Find and replace text in a PDF",
    description:
      "Changes words a PDF holds, in every place they are, as the editor changes a line or a paragraph by hand: in the very font the line was written with. A place whose font lacks a letter, or that would run into other text, is left as it was and said. Only text a PDF holds can be found: not words in pictures or scans.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        find: { type: "string", minLength: 1, maxLength: LONGEST_FIND },
        replace: { type: "string", maxLength: LONGEST_FIND },
        matchCase: { type: "boolean" },
        wholeWords: {
          type: "boolean",
          description: "Only whole words: art not in part.",
        },
        keepEditable,
        lock,
      },
      required: ["file", "find", "replace"],
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
          const query = {
            find: input.find,
            matchCase: Boolean(input.matchCase),
            wholeWords: Boolean(input.wholeWords),
          }
          const { found, more } = await engine.editFind(session.id, query)
          const places = found.reduce((sum, one) => sum + one.spans.length, 0)
          if (!places)
            return {
              answerOnly: true,
              said: [
                `“${input.find}” is not in the words of this file; nothing was changed.`,
              ],
            }
          const ready = new Set<string>()
          for (const key of found.flatMap((one) => one.fonts))
            if (!ready.has(key)) {
              engine.editFont(session.id, key, await text.font(key))
              ready.add(key)
            }
          const news = await engine.editReplace(session.id, {
            label: "Replace text",
            ops: found.map((one) => opFor(one, one.spans, input.replace)),
          })
          const refused = news.refused ?? []
          const left = (await engine.editFind(session.id, query)).found.reduce(
            (sum, one) => sum + one.spans.length,
            0
          )
          // Looking again tells how many were changed, unless the new words hold the old ones.
          const done = input.replace
            .toLowerCase()
            .includes(input.find.toLowerCase())
            ? null
            : places - left
          const kept =
            refused.length === 1
              ? "1 line or paragraph was"
              : `${refused.length} lines or paragraphs were`
          return {
            said: [
              refused.length
                ? `${done === null ? "Some" : done} of ${plural(places, "place")} changed. ${kept} left as ${refused.length === 1 ? "it was" : "they were"}: ${refused[0]}`
                : `${plural(places, "place")} changed, as one step.`,
              more
                ? "There were more places than are looked through at once: run it again for the rest."
                : "",
            ].filter(Boolean),
            data: { places, changed: done, refused },
          }
        }
      ),
  }

  const placeSchema = {
    page: {
      type: "integer",
      minimum: 1,
      description: "The page, counted from 1.",
    },
    x: {
      type: "number",
      minimum: 0,
      description:
        "From the page's left edge, in points (72 to an inch), as the page is shown.",
    },
    y: {
      type: "number",
      minimum: 0,
      description: "From the page's top edge, in points.",
    },
    rotation: {
      type: "number",
      minimum: -360,
      maximum: 360,
      description: "Degrees clockwise.",
    },
    opacity: { type: "number", minimum: 0.05, maximum: 1 },
  }
  const onPage = (session: Session, page: number) => {
    if (page > session.pages)
      throw new ToolError(
        `There are ${session.pages} pages; page ${page} is not one of them.`
      )
    return session.sizes[page - 1]
  }

  const addText: AgentTool<{
    file: string
    password?: string
    page: number
    x: number
    y: number
    width?: number
    text: string
    size?: number
    font?: BuiltIn
    bold?: boolean
    italic?: boolean
    colour?: string
    align?: "left" | "centre" | "right"
    rotation?: number
    opacity?: number
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "add_text_to_pdf",
    title: "Add text to a PDF",
    description:
      "Writes a box of text on a page, at a place given in points from the page's top-left corner as it is shown; the words break into lines for its width. In the editor's fonts, which hold most of the world's scripts.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        ...placeSchema,
        width: {
          type: "number",
          minimum: 6,
          description:
            "The box's width in points; to the page's right margin by default.",
        },
        text: { type: "string", minLength: 1, maxLength: 5000 },
        size: {
          type: "number",
          minimum: SMALLEST_TEXT,
          maximum: LARGEST_TEXT,
          description: "In points (12).",
        },
        font,
        bold: { type: "boolean" },
        italic: { type: "boolean" },
        colour,
        align: { type: "string", enum: ["left", "centre", "right"] },
        keepEditable,
        lock,
      },
      required: ["file", "page", "x", "y", "text"],
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
          const size = onPage(session, input.page)
          if (input.x >= size.width || input.y >= size.height)
            throw new ToolError(
              `That place is off page ${input.page}, which is ${Math.round(size.width)} by ${Math.round(size.height)} points.`
            )
          const textSize = input.size ?? 12
          const width = input.width ?? Math.max(6, size.width - input.x - 36)
          const object: TextObject = {
            id: newId(),
            kind: "text",
            box: {
              x: input.x,
              y: input.y,
              width,
              height: textHeight(1, textSize),
            },
            rotation: input.rotation ?? 0,
            opacity: input.opacity ?? 1,
            text: input.text,
            lines: [input.text],
            font: input.font ?? "sans",
            bold: Boolean(input.bold),
            italic: Boolean(input.italic),
            size: textSize,
            colour: input.colour ? colourOf(input.colour) : [0, 0, 0],
            align: input.align ?? "left",
          }
          const news = await apply(session, {
            label: "Add text",
            ops: [{ do: "add", page: input.page - 1, object }],
          })
          return {
            said: [
              `Text added to page ${input.page}.`,
              news.lacking.length
                ? `The font has no shape for ${news.lacking.join(" ")}; ${news.lacking.length === 1 ? "it is" : "they are"} left out.`
                : "",
            ].filter(Boolean),
          }
        }
      ),
  }

  const addImage: AgentTool<{
    file: string
    password?: string
    image: string
    page: number
    x: number
    y: number
    width?: number
    height?: number
    rotation?: number
    opacity?: number
    keepEditable?: boolean
    lock?: LockInput
  }> = {
    name: "add_image_to_pdf",
    title: "Add a picture to a PDF",
    description:
      "Places a PNG, JPEG, WebP or AVIF picture on a page, at a place in points from the page's top-left corner as it is shown, keeping its proportions when only a width or a height is given. Not for signing: a signature is yours to place.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        image: fileProperty("The picture."),
        ...placeSchema,
        width: { type: "number", minimum: 1 },
        height: { type: "number", minimum: 1 },
        keepEditable,
        lock,
      },
      required: ["file", "image", "page", "x", "y"],
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
          const size = onPage(session, input.page)
          const name = newId()
          const pixels = await engine.editPicture(
            session.id,
            name,
            context.files.get(input.image).blob
          )
          // Without a size it is placed at 150 pixels to the inch, no wider than half the page.
          const natural =
            Math.min(1, size.width / 2 / ((pixels.width * 72) / 150)) *
            ((pixels.width * 72) / 150)
          const width =
            input.width ??
            (input.height
              ? (input.height * pixels.width) / pixels.height
              : natural)
          const height = input.height ?? (width * pixels.height) / pixels.width
          await apply(session, {
            label: "Add a picture",
            ops: [
              {
                do: "add",
                page: input.page - 1,
                object: {
                  id: newId(),
                  kind: "picture",
                  picture: name,
                  box: { x: input.x, y: input.y, width, height },
                  rotation: input.rotation ?? 0,
                  opacity: input.opacity ?? 1,
                },
              },
            ],
          })
          return {
            said: [
              `Picture placed on page ${input.page}, ${Math.round(width)} by ${Math.round(height)} points.`,
            ],
          }
        }
      ),
  }

  const LANGUAGE_CODES = OCR_LANGUAGES.map((language) => language.code)
  const recognise: AgentTool<{
    file: string
    password?: string
    pages?: string
    languages?: string[]
    alsoText?: boolean
    lock?: LockInput
  }> = {
    name: "ocr_pdf",
    title: "Recognise the text of a scanned PDF",
    description: `Reads the words of scanned pages with Tesseract on this device and lays them, unseen, over the pages, so the file can be searched, copied from and redacted. Pages that have text already are left unless alsoText. The first time a language is read, its file (about 1 to 15 MB) is loaded from KeepSimp and kept. It can misread: the answer says how sure the reading was. Languages (at most ${MOST_LANGUAGES}): ${LANGUAGE_CODES.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        pages: pagesProperty("The pages to read"),
        languages: {
          type: "array",
          items: { type: "string", enum: LANGUAGE_CODES },
          minItems: 1,
          maxItems: MOST_LANGUAGES,
          uniqueItems: true,
          description:
            "Tesseract's codes, such as eng (the default), deu or fra.",
        },
        alsoText: {
          type: "boolean",
          description: "Read pages that have text already too.",
        },
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
        { suffix: "-ocr" },
        async (session) => {
          const pages = targetOf(session, input.pages)
          let share: (fraction: number) => void = () => {}
          context.progress(0, "Loading Tesseract")
          let reader
          try {
            reader = await ocr(
              (input.languages ?? ["eng"]).join("+"),
              (fraction) => share(fraction)
            )
          } catch {
            throw new ToolError(
              "What recognises words could not be loaded. Go online once and try again."
            )
          }
          const stopped = new Promise<null>((resolve) =>
            context.signal.addEventListener("abort", () => resolve(null))
          )
          try {
            const { ops, tally } = await readPages(
              pages,
              Boolean(input.alsoText),
              {
                picture: (page) => engine.ocrPicture(session.id, page),
                read: (png) => Promise.race([reader.read(png), stopped]),
                stopped: () => context.signal.aborted,
                onPage: (done, total, page) => {
                  share = (fraction) =>
                    context.progress(
                      ((done + fraction) / total) * 0.75,
                      `Reading page ${page + 1}`
                    )
                  share(0)
                },
              }
            )
            if (context.signal.aborted)
              throw new DOMException("Stopped.", "AbortError")
            const said = ocrSummary({ ...tally, stopped: false }).text
            if (!ops.length)
              return { answerOnly: true, said: [said], data: tally }
            await engine.editOcr(session.id, { label: ocrLabel(ops), ops })
            return { said: [said], data: tally }
          } finally {
            reader.stop()
          }
        }
      ),
  }

  return [
    organize,
    crop,
    numbers,
    headerFooter,
    watermark,
    details,
    listFields,
    fillForm,
    verify,
    redact,
    replace,
    addText,
    addImage,
    recognise,
  ].map((tool) => asTool(tool as AgentTool<never>))
}
