/**
 * What the PDF editor's tools share: opening a file for editing, making
 * changes as the editor's steps, writing it out with the editor's checks,
 * and the words their schemas are made of.
 */
import type { Size } from "@/lib/image-compressor/geometry"
import {
  fontsFor,
  type BuiltIn,
  type Colour,
  type EditorObject,
  type TextObject,
} from "@/lib/pdf-editor/objects"
import type { ExportReport } from "@/lib/pdf-editor/mupdf-edit"
import {
  isOwn,
  LARGEST_FONT,
  ownKey,
  readFont,
} from "@/lib/pdf-editor/own-font"
import type { Change } from "@/lib/pdf-editor/tools"
import type { Clean } from "@/lib/pdf-editor/redact"
import type { TesseractBlock } from "@/lib/pdf-editor/ocr"
import type { FileStore } from "./files"
import { kindOf, lockOf, pagesOf, plural, type LockInput } from "./pdf"
import type { PdfEngine } from "./pdf-engine"
import { ToolError, type ToolContext } from "./registry"

/** Tesseract, started for some languages (codes joined with "+"): what it reads on a page drawn in grey, and how to let it go. */
export type StartOcr = (
  languages: string,
  onShare: (share: number) => void
) => Promise<{ read(png: Uint8Array): Promise<TesseractBlock[]>; stop(): void }>

/** What text needs that only the browser has: the editor's fonts, and lines broken as the editor breaks them. */
export interface EditText {
  /** A font's file, made ready for measuring too. */
  font(key: string): Promise<ArrayBuffer>
  /** A font of one's own made ready for measuring, under its key. */
  own(key: string, bytes: ArrayBuffer): Promise<void>
  layOut(object: TextObject): TextObject
}

export const FONTS: BuiltIn[] = [
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

export const colour = {
  type: "string",
  pattern: "^#?[0-9a-fA-F]{6}$",
  description: "A colour as #rrggbb.",
}
export const pagesProperty = (what: string) => ({
  type: "string",
  maxLength: 20000,
  description: `${what}, counted from 1, such as "1-3, 7"; every page by default.`,
})
export const font = {
  type: "string",
  enum: FONTS,
  description:
    "sans (the default), serif, mono, or a hand: greatvibes, sacramento, kalam, aurore.",
}
export const keepEditable = {
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

export interface Session {
  id: string
  name: string
  pages: number
  sizes: Size[]
  state: Awaited<ReturnType<PdfEngine["openForEdit"]>>["state"]
  signed: boolean
}

export interface Outcome {
  said: string[]
  data?: unknown
  /** Nothing to write: the answer is all there is. */
  answerOnly?: boolean
}

let made = 0
export const newId = () => `a${Date.now().toString(36)}${(made++).toString(36)}`

/** Opening, changing and writing a file as the editor does, for the tools of one engine. */
export function editKit(engine: PdfEngine, text: EditText) {
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
      /** What becomes of comments: kept (the usual), drawn into the pages, or left out. */
      comments?: "keep" | "flatten" | "remove"
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
          comments: how.comments ?? "keep",
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
      // A font of one's own was handed over when it was read (`ownFont`).
      if (ready.has(key) || isOwn(key)) continue
      engine.editFont(id, key, await text.font(key))
      ready.add(key)
    }
  }

  /** Sends a change that adds things, with text laid out as the editor lays it out. */
  async function apply(session: Session, change: Change) {
    const ready = new Set<string>()
    const ops: Change["ops"] = []
    for (const op of change.ops) {
      if (op.do !== "add" && op.do !== "change") {
        ops.push(op)
        continue
      }
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

  /** An editor's font in the worker, by its key, once for each file. */
  async function fontReady(session: Session, key: string) {
    if (isOwn(key)) return
    engine.editFont(session.id, key, await text.font(key))
  }

  /**
   * A font of one's own, as the editor takes one: read for its name and
   * whether its maker allows it in documents, made ready for measuring, and
   * handed to the worker. Of a collection, the first font is taken.
   * @returns The key it goes by.
   */
  async function ownFont(session: Session, file: Blob, shown: string) {
    const read =
      file.size > LARGEST_FONT
        ? null
        : readFont(new Uint8Array(await file.arrayBuffer()))
    if (!read)
      throw new ToolError(
        `${shown} is not a font the editor can use: give a TrueType or OpenType font (.ttf or .otf).`
      )
    if (!read.allowed)
      throw new ToolError(
        `The maker of "${read.name}" does not allow it to be put into documents.`
      )
    const key = ownKey(read.file)
    await text.own(key, read.file.slice().buffer)
    engine.editFont(session.id, key, read.file.slice().buffer, read.written)
    return { key, name: read.name }
  }

  return { editing, fontsReady, fontReady, ownFont, apply, targetOf }
}

export const placeSchema = {
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
export const onPage = (session: Session, page: number) => {
  if (page > session.pages)
    throw new ToolError(
      `There are ${session.pages} pages; page ${page} is not one of them.`
    )
  return session.sizes[page - 1]
}
