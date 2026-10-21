/**
 * The PDF merger's, splitter's and compressor's work as tools, through the
 * same worker and the same settings as their pages: pages are copied whole,
 * pictures are only swapped for checked smaller ones, and every result is
 * opened again before it is handed over.
 */
import {
  defaultSettings as mergeDefaults,
  desktopLimits,
  looksLikePdf,
  permissionBits,
  settingsProblem as mergeProblem,
  type ContentsChoice,
  type FormsChoice,
  type LabelsChoice,
} from "@/lib/pdf-merger/settings"
import { parseRanges } from "@/lib/pdf-merger/ranges"
import type { BookmarkPolicy } from "@/lib/pdf-merger/outline"
import type { PictureMargin, PicturePage } from "@/lib/pdf-merger/picture"
import type { NumberStyle } from "@/lib/pdf-merger/print"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import { sniffFormat } from "@/lib/image-compressor/formats"
import { planFor, pagesProblem } from "@/lib/pdf-splitter/settings"
import { cutsEqual, cutsEvery, type Part } from "@/lib/pdf-splitter/parts"
import { headingsOf } from "@/lib/pdf-splitter/bookmarks"
import type { BlankChoice, Sensitivity } from "@/lib/pdf-splitter/blank"
import {
  DEFAULT_PATTERN,
  partNames,
  patternProblem,
  zipName,
} from "@/lib/pdf-splitter/naming"
import { defaultOptions as splitDefaults } from "@/lib/pdf-splitter/options"
import { createZip } from "@/lib/image-resizer/zip"
import {
  alreadySmall,
  checkLine,
  pixelLimit,
  stagePercent,
} from "@/lib/pdf-compressor/report"
import {
  customDpis,
  customQuality,
  resultName,
  type Level,
  type ScanChoice,
} from "@/lib/pdf-compressor/settings"
import type { Removal } from "@/lib/pdf-compressor/options"
import type { FileStore } from "./files"
import {
  asTool,
  fileProperty,
  filesProperty,
  ToolError,
  type AgentTool,
  type FileRef,
  type JsonSchema,
} from "./registry"
import type { PdfEngine } from "./pdf-engine"

/** Parts beyond this many come back as one ZIP. */
export const MOST_PART_FILES = 20
/** Pages whose text `pdf_info` gives at most, and how much of it. */
export const MOST_TEXT_PAGES = 100
export const MOST_TEXT = 200_000

export const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`

export const password = {
  type: "string",
  maxLength: 127,
  description: "The password that opens the file, when it has one.",
}

export interface LockInput {
  password: string
  ownerPassword?: string
  allowPrint?: boolean
  allowCopy?: boolean
  allowChanges?: boolean
}

export const lock: JsonSchema = {
  type: "object",
  description:
    "Lock the result with a password. Limits on printing, copying and changes need a second password to lift them; without one they cannot be lifted.",
  properties: {
    password: { type: "string", minLength: 1, maxLength: 127 },
    ownerPassword: { type: "string", maxLength: 127 },
    allowPrint: { type: "boolean" },
    allowCopy: { type: "boolean" },
    allowChanges: { type: "boolean" },
  },
  required: ["password"],
  additionalProperties: false,
}

/** The lock asked for, checked by the merger's rules; null for none. */
export function lockOf(input: LockInput | undefined) {
  if (!input) return null
  const choice = {
    allowPrint: input.allowPrint ?? true,
    allowCopy: input.allowCopy ?? true,
    allowChanges: input.allowChanges ?? true,
  }
  const problem = mergeProblem({
    ...mergeDefaults,
    protect: true,
    password: input.password,
    ownerPassword: input.ownerPassword ?? "",
  })
  if (problem)
    throw new ToolError(problem.replace("the merged PDF", "the result"))
  const limited = !(
    choice.allowPrint &&
    choice.allowCopy &&
    choice.allowChanges
  )
  return {
    password: input.password,
    // Limits without a second password get one nobody keeps.
    ownerPassword:
      input.ownerPassword || (limited ? crypto.randomUUID() : input.password),
    permissions: permissionBits(choice),
  }
}

/** A file to open: a PDF, or (where pictures are taken) a picture to become a page. */
export async function kindOf(blob: Blob, name: string, pictures: boolean) {
  const head = new Uint8Array(await blob.slice(0, 2048).arrayBuffer())
  if (!blob.size) throw new ToolError(`${name} is empty.`)
  if (blob.size > desktopLimits.fileBytes)
    throw new ToolError(`${name} is larger than 300 MB.`)
  if (looksLikePdf(head)) return "pdf" as const
  const format = sniffFormat(head)
  if (pictures && format && format !== "svg") return "picture" as const
  throw new ToolError(
    pictures
      ? `${name} is not a PDF or a picture KeepSimp can add as a page.`
      : `${name} is not a PDF.`
  )
}

/** Pages counted from 1 as typed ("1-3, 7", "all"), as pages counted from 0. */
export function pagesOf(text: string, count: number, what: string) {
  if (text.trim().toLowerCase() === "all")
    return Array.from({ length: count }, (_, page) => page)
  const read = parseRanges(text, count)
  if ("problem" in read) throw new ToolError(`${what}: ${read.problem}`)
  return read.pages
}

function headingList(bookmarks: readonly Bookmark[]) {
  return headingsOf(bookmarks).map((heading) => ({
    title: heading.title,
    page: heading.page + 1,
    level: heading.level,
  }))
}

const named = (name: string, fallback: string) => {
  const trimmed = name.trim().replace(/\.pdf$/i, "")
  return `${trimmed || fallback}.pdf`
}

export function pdfTools(engine: PdfEngine): AgentTool[] {
  /** Opens a held file, runs `work` and closes every file it opened. */
  async function withOpen<T>(
    files: FileStore,
    ids: { id: string; password?: string; pictures?: boolean }[],
    work: (
      opened: Awaited<ReturnType<PdfEngine["open"]>>[],
      blobs: Blob[]
    ) => Promise<T>
  ) {
    const opened: Awaited<ReturnType<PdfEngine["open"]>>[] = []
    const blobs: Blob[] = []
    try {
      for (const { id, password: given, pictures = false } of ids) {
        const { blob, ref } = files.get(id)
        const kind = await kindOf(blob, ref.name, pictures)
        opened.push(
          await engine.open(blob, ref.name, {
            password: given,
            picture: kind === "picture",
          })
        )
        blobs.push(blob)
      }
      return await work(opened, blobs)
    } finally {
      for (const { id } of opened) engine.close(id)
    }
  }

  /** Opens a result again, as a reader would, and says how many pages it has. */
  async function reopened(bytes: ArrayBuffer, name: string, open?: string) {
    const { id, facts } = await engine.open(new Blob([bytes]), name, {
      password: open,
    })
    engine.close(id)
    return facts.pages
  }

  const pdfInfo: AgentTool<{ file: string; password?: string; text?: string }> =
    {
      name: "pdf_info",
      title: "Read a PDF",
      description:
        'Tells what a PDF holds: its pages and their sizes, title and author, bookmarks, forms, signatures, attachments and whether it is locked or tagged. With text (pages such as "1-3" or "all", at most 100), also gives the text of those pages. Scanned pages have no text until they are recognised.',
      inputSchema: {
        type: "object",
        properties: {
          file: fileProperty("The PDF."),
          password,
          text: {
            type: "string",
            maxLength: 500,
            description:
              'Pages whose text to give, counted from 1, such as "1-3, 7" or "all".',
          },
        },
        required: ["file"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async run(input, { files, progress }) {
        return withOpen(
          files,
          [{ id: input.file, password: input.password }],
          async ([{ id, facts }]) => {
            const layout = await engine.layout(id)
            const sizes = layout.sizes.map((size) => ({
              width: Math.round(size.width * 10) / 10,
              height: Math.round(size.height * 10) / 10,
            }))
            const text: { page: number; text: string }[] = []
            let cut = false
            if (input.text) {
              const pages = pagesOf(input.text, facts.pages, "text")
              if (pages.length > MOST_TEXT_PAGES)
                throw new ToolError(
                  `Ask for the text of at most ${MOST_TEXT_PAGES} pages at a time.`
                )
              let length = 0
              for (const [index, page] of pages.entries()) {
                progress(index / pages.length, `Reading page ${page + 1}`)
                let words = await engine.text(id, page)
                if (length + words.length > MOST_TEXT) {
                  words = words.slice(0, Math.max(0, MOST_TEXT - length))
                  cut = true
                }
                length += words.length
                text.push({ page: page + 1, text: words })
                if (cut) break
              }
            }
            const empty = text.filter((page) => !page.text.trim()).length
            return {
              summary: [
                `${plural(facts.pages, "page")}${facts.title ? `, “${facts.title}”` : ""}.`,
                facts.signed ? "It is signed." : "",
                facts.unlocked ? "It was locked; the password opened it." : "",
                text.length
                  ? `Text of ${plural(text.length, "page")}${empty ? `; ${plural(empty, "page")} without text (perhaps scanned)` : ""}${cut ? "; cut off at 200,000 characters" : ""}.`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
              data: {
                pages: facts.pages,
                title: facts.title,
                author: facts.author ?? "",
                subject: facts.subject ?? "",
                keywords: facts.keywords ?? "",
                sizes,
                bookmarks: headingList(layout.bookmarks),
                forms: facts.forms,
                signed: facts.signed,
                tagged: facts.tagged,
                locked: facts.unlocked,
                restricted: facts.restricted,
                repaired: facts.repaired,
                attachments: facts.attachments ?? 0,
                ...(text.length ? { text } : {}),
              },
            }
          }
        )
      },
    }

  const mergePdfs: AgentTool<{
    files: string[]
    pages?: string[]
    rotate?: (0 | 90 | 180 | 270)[]
    passwords?: string[]
    name?: string
    bookmarks?: BookmarkPolicy
    contents?: ContentsChoice
    cover?: boolean
    forms?: FormsChoice
    labels?: LabelsChoice
    attachments?: boolean
    title?: string
    author?: string
    subject?: string
    keywords?: string
    pageNumbers?: NumberStyle
    picturePage?: PicturePage
    pictureMargin?: PictureMargin
    lock?: LockInput
  }> = {
    name: "merge_pdfs",
    title: "Merge PDFs",
    description:
      "Joins PDFs (and pictures, each as a page) into one PDF, in the order given, keeping links, form fields, notes and bookmarks. Can take some pages of each file, turn them, add a contents page or page numbers, set the details and lock the result.",
    inputSchema: {
      type: "object",
      properties: {
        files: filesProperty(
          "The PDFs and pictures, in order.",
          1,
          desktopLimits.files
        ),
        pages: {
          type: "array",
          items: { type: "string", maxLength: 500 },
          description:
            'For each file, its pages to take, counted from 1, such as "1-3, 7"; "" or "all" for every page.',
        },
        rotate: {
          type: "array",
          items: { type: "integer", enum: [0, 90, 180, 270] },
          description: "For each file, how far to turn its pages, clockwise.",
        },
        passwords: {
          type: "array",
          items: { type: "string", maxLength: 127 },
          description:
            'For each file, the password that opens it; "" for none.',
        },
        name: {
          type: "string",
          maxLength: 120,
          description: "The result's name (merged.pdf).",
        },
        bookmarks: {
          type: "string",
          enum: ["nested", "keep", "files", "none"],
          description:
            "nested (each file a bookmark, its own under it; the default), keep (only the files' own), files (one per file) or none.",
        },
        contents: {
          type: "string",
          enum: ["none", "files", "titles"],
          description: "A contents page listing the files, or their titles.",
        },
        cover: { type: "boolean", description: "A cover page with the title." },
        forms: {
          type: "string",
          enum: ["keep", "join", "flatten", "remove"],
          description:
            "What happens to form fields: kept apart (the default), joined where they have the same name, flattened onto the page, or removed.",
        },
        labels: {
          type: "string",
          enum: ["continuous", "keep"],
          description:
            "Page numbering in readers: counted through, or each file's own.",
        },
        attachments: {
          type: "boolean",
          description: "Keep files attached inside the PDFs (yes by default).",
        },
        title: { type: "string", maxLength: 500 },
        author: { type: "string", maxLength: 500 },
        subject: { type: "string", maxLength: 500 },
        keywords: { type: "string", maxLength: 500 },
        pageNumbers: {
          type: "string",
          enum: ["none", "number", "of"],
          description: 'Print page numbers at the foot: "3" or "3 of 12".',
        },
        picturePage: {
          type: "string",
          enum: ["previous", "fit", "a4", "letter"],
          description:
            "The page size for pictures: the size of the page before, the picture's own, A4 or Letter.",
        },
        pictureMargin: { type: "string", enum: ["none", "small", "normal"] },
        lock,
      },
      required: ["files"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      const count = input.files.length
      for (const [label, list] of [
        ["pages", input.pages],
        ["rotate", input.rotate],
        ["passwords", input.passwords],
      ] as const)
        if (list && list.length !== count)
          throw new ToolError(
            `Give "${label}" one entry for each of the ${count} files.`
          )
      const details = {
        title: input.title ?? "",
        author: input.author ?? "",
        subject: input.subject ?? "",
        keywords: input.keywords ?? "",
      }
      const locked = lockOf(input.lock)
      return withOpen(
        files,
        input.files.map((id, index) => ({
          id,
          password: input.passwords?.[index] || undefined,
          pictures: true,
        })),
        async (opened) => {
          const pages = opened.flatMap(({ id, facts }, index) => {
            const wanted = input.pages?.[index]?.trim()
            const chosen = wanted
              ? pagesOf(
                  wanted,
                  facts.pages,
                  files.get(input.files[index]).ref.name
                )
              : Array.from({ length: facts.pages }, (_, page) => page)
            return chosen.map((page) => ({
              file: id,
              page,
              rotation: input.rotate?.[index] ?? 0,
            }))
          })
          if (pages.length > desktopLimits.pages)
            throw new ToolError(
              `That is ${pages.length.toLocaleString("en")} pages; a merge takes at most ${desktopLimits.pages.toLocaleString("en")}.`
            )
          const names = Object.fromEntries(
            opened.map(({ id }, index) => [
              id,
              files.get(input.files[index]).ref.name.replace(/\.[^.]+$/, ""),
            ])
          )
          const merged = await engine.merge(
            {
              pages,
              names,
              bookmarks: input.bookmarks ?? mergeDefaults.bookmarks,
              picturePage: input.picturePage ?? "previous",
              pictureMargin: input.pictureMargin ?? "small",
              contents: input.contents ?? mergeDefaults.contents,
              cover: input.cover ?? mergeDefaults.cover,
              forms: input.forms ?? mergeDefaults.forms,
              labels: input.labels ?? mergeDefaults.labels,
              attachments: input.attachments ?? mergeDefaults.attachments,
              details,
              print: {
                duplex: false,
                sheet: "keep",
                enlarge: true,
                footerName: false,
                numbers: input.pageNumbers ?? "none",
                numbersAt: "centre",
                numbersFrom: 1,
              },
              lock: locked,
            },
            signal,
            (done, total) =>
              progress(
                total ? (done / total) * 0.9 : 0.9,
                total ? `Page ${done} of ${total}` : "Writing the file"
              )
          )
          const outName = named(input.name ?? "", "merged")
          const pagesAfter = await reopened(
            merged.bytes,
            outName,
            locked?.password
          )
          if (pagesAfter !== merged.pages)
            throw new ToolError(
              `The merged file opened with ${pagesAfter} pages instead of ${merged.pages}, so it is not handed over.`
            )
          const file = files.add(
            new Blob([merged.bytes], { type: "application/pdf" }),
            outName,
            "made"
          )
          return {
            summary: `Merged ${plural(count, "file")} into ${plural(merged.pages, "page")}${merged.bookmarks ? ` with ${plural(merged.bookmarks, "bookmark")}` : ""}${locked ? ", locked with the password given" : ""}. Checked: it opens with every page.`,
            files: [file],
            data: {
              pages: merged.pages,
              bookmarks: merged.bookmarks,
              bytes: merged.bytes.byteLength,
            },
          }
        }
      )
    },
  }

  const MODES = [
    "every",
    "parts",
    "single",
    "ranges",
    "oddeven",
    "extract",
    "remove",
    "bookmarks",
    "blank",
    "text",
    "size",
  ] as const
  const splitPdf: AgentTool<{
    file: string
    password?: string
    mode: (typeof MODES)[number]
    every?: number
    parts?: number
    ranges?: string
    pages?: string
    level?: number
    filter?: string
    front?: "own" | "join"
    sensitivity?: Sensitivity
    blankPages?: BlankChoice
    words?: string
    maxMegabytes?: number
    pattern?: string
    keepBookmarks?: boolean
    keepLabels?: boolean
    keepDetails?: boolean
    attachments?: "first" | "all" | "none"
    zip?: boolean
    lock?: LockInput
  }> = {
    name: "split_pdf",
    title: "Split a PDF",
    description:
      'Splits a PDF into parts: every N pages, into N equal parts, one page each, by ranges ("1-3, 4-10"), odd and even pages, at bookmarks, at blank pages (as a stack of scans is parted), at pages holding some words, or into parts under a size. Or takes some pages out as one file (extract), or leaves them out (remove). Each part keeps its links, notes and form fields. More than 20 parts come back as one ZIP.',
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        mode: { type: "string", enum: [...MODES] },
        every: {
          type: "integer",
          minimum: 1,
          description: "For every: pages in each part.",
        },
        parts: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description: "For parts: how many equal parts.",
        },
        ranges: {
          type: "string",
          maxLength: 20000,
          description:
            'For ranges: one part per range, counted from 1, such as "1-3, 4-10, 11-"; "1-3 + 7" joins.',
        },
        pages: {
          type: "string",
          maxLength: 20000,
          description:
            'For extract and remove: the pages, counted from 1, such as "2, 5-7".',
        },
        level: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "For bookmarks: the level to split at (1 is the top).",
        },
        filter: {
          type: "string",
          maxLength: 200,
          description:
            "For bookmarks: only those whose title holds these words.",
        },
        front: {
          type: "string",
          enum: ["own", "join"],
          description:
            "For bookmarks and text: pages before the first part are a part of their own, or join the first.",
        },
        sensitivity: {
          type: "string",
          enum: ["strict", "normal", "loose"],
          description: "For blank: how empty a page must be.",
        },
        blankPages: {
          type: "string",
          enum: ["drop", "keep", "remove"],
          description:
            "For blank: cut at blank pages and leave them out (drop), keep them at the end of their part, or only remove them.",
        },
        words: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description:
            "For text: a new part starts at each page holding these words.",
        },
        maxMegabytes: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 2000,
          description: "For size: the most each part may weigh.",
        },
        pattern: {
          type: "string",
          maxLength: 200,
          description:
            "How parts are named: {name}, {part}, {from}, {to}, {pages}, {label}. By default {name}-{part}.",
        },
        keepBookmarks: { type: "boolean" },
        keepLabels: {
          type: "boolean",
          description: "Keep the file's own page numbers.",
        },
        keepDetails: {
          type: "boolean",
          description: "Keep the title, author, subject and keywords.",
        },
        attachments: {
          type: "string",
          enum: ["first", "all", "none"],
          description: "Which parts carry the attached files.",
        },
        zip: {
          type: "boolean",
          description: "Hand the parts back as one ZIP.",
        },
        lock,
      },
      required: ["file", "mode"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      const pattern = input.pattern ?? DEFAULT_PATTERN
      const wrong = patternProblem(pattern)
      if (wrong) throw new ToolError(wrong)
      const locked = lockOf(input.lock)
      const keep = {
        bookmarks: input.keepBookmarks ?? splitDefaults.bookmarks,
        labels: input.keepLabels ?? splitDefaults.labels,
        details: input.keepDetails ?? splitDefaults.details,
        attachments: input.attachments ?? splitDefaults.attachments,
        lock: locked,
      }
      const source = files.get(input.file).ref.name
      const needs: Partial<Record<(typeof MODES)[number], keyof typeof input>> =
        {
          every: "every",
          parts: "parts",
          ranges: "ranges",
          extract: "pages",
          remove: "pages",
          text: "words",
          size: "maxMegabytes",
        }
      const needed = needs[input.mode]
      if (needed && input[needed] === undefined)
        throw new ToolError(`Splitting by ${input.mode} needs "${needed}".`)
      return withOpen(
        files,
        [{ id: input.file, password: input.password }],
        async ([{ id, facts }]) => {
          const count = facts.pages
          const tooMany = pagesProblem(count, desktopLimits.pages)
          if (tooMany) throw new ToolError(tooMany)
          let written
          let planned: Part[]
          const onProgress = (done: number, total: number) =>
            progress(
              total ? (done / total) * 0.95 : 0,
              `Page ${done} of ${total}`
            )
          if (input.mode === "size") {
            written = await engine.split(
              id,
              { limit: Math.round(input.maxMegabytes! * 1024 * 1024) },
              keep,
              signal,
              onProgress
            )
            planned = written.map((part) => ({
              pages: Array.from(
                { length: part.pages },
                (_, at) => part.start! + at
              ),
            }))
          } else {
            const mode =
              input.mode === "every" ||
              input.mode === "parts" ||
              input.mode === "single"
                ? "cuts"
                : input.mode
            const choices: Parameters<typeof planFor>[0] = {
              mode,
              cuts:
                input.mode === "every"
                  ? cutsEvery(count, input.every!)
                  : input.mode === "parts"
                    ? cutsEqual(count, input.parts!)
                    : input.mode === "single"
                      ? cutsEvery(count, 1)
                      : [],
              ranges: input.ranges ?? "",
              selected: new Set(
                input.mode === "extract" || input.mode === "remove"
                  ? pagesOf(input.pages!, count, "pages")
                  : []
              ),
              front: input.front,
            }
            if (mode === "bookmarks") {
              choices.headings = headingsOf((await engine.layout(id)).bookmarks)
              choices.level = input.level ?? 1
              choices.filter = input.filter
            } else if (mode === "blank") {
              progress(0, "Looking for blank pages")
              choices.ink = await engine.ink(id, count, signal)
              choices.sensitivity = input.sensitivity ?? "normal"
              choices.blankHow = input.blankPages ?? "drop"
            } else if (mode === "text") {
              progress(0, "Looking for those words")
              choices.textKind = "contains"
              choices.starts = await engine.search(
                id,
                count,
                input.words!,
                signal
              )
            }
            const plan = planFor(choices, count)
            if ("problem" in plan) throw new ToolError(plan.problem)
            planned = plan.parts
            written = await engine.split(
              id,
              { parts: planned.map((part) => part.pages) },
              keep,
              signal,
              onProgress
            )
          }
          // Every part was written with the pages it was asked for.
          written.forEach((part, index) => {
            if (part.pages !== planned[index].pages.length)
              throw new ToolError(
                `Part ${index + 1} came out with ${part.pages} pages instead of ${planned[index].pages.length}, so nothing is handed over.`
              )
          })
          const names = partNames(planned, pattern, source, count)
          let made: FileRef[]
          const zipped = Boolean(input.zip) || written.length > MOST_PART_FILES
          if (zipped) {
            const zip = createZip(
              written.map((part, index) => ({
                name: names[index],
                data: new Uint8Array(part.bytes),
              }))
            )
            made = [
              files.add(
                new Blob([zip as BlobPart], { type: "application/zip" }),
                zipName([source]),
                "made"
              ),
            ]
          } else
            made = written.map((part, index) =>
              files.add(
                new Blob([part.bytes], { type: "application/pdf" }),
                names[index],
                "made"
              )
            )
          const over = written.filter((part) => part.over).length
          return {
            summary: `Split ${source} into ${plural(written.length, "part")}${zipped ? ", in one ZIP" : ""}.${over ? ` ${plural(over, "part")} ${over === 1 ? "is" : "are"} one page over the size: a single page that weighs more.` : ""} Checked: each part has the pages it was meant to.`,
            files: made,
            data: {
              parts: written.map((part, index) => ({
                name: names[index],
                pages: planned[index].pages.length,
                from: planned[index].pages[0] + 1,
                to: planned[index].pages[planned[index].pages.length - 1] + 1,
                bytes: part.bytes.byteLength,
              })),
            },
          }
        }
      )
    },
  }

  const compressPdf: AgentTool<{
    file: string
    password?: string
    level?: Level
    targetMegabytes?: number
    further?: boolean
    custom?: { dpi: number; quality: number; grey?: boolean; fonts?: boolean }
    scans?: ScanChoice
    remove?: Partial<Removal>
    lock?: LockInput
  }> = {
    name: "compress_pdf",
    title: "Compress a PDF",
    description:
      "Makes a PDF smaller without turning pages into pictures: lossless (nothing changes), balanced (the default: pictures made smaller where it cannot be seen) or strong; or to a size; or with a resolution and quality of your own. Can rebuild scanned pages, take out details, attachments, bookmarks, notes, scripts or tags, and lock the result. Every page is compared with the original before the file is handed over.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The PDF."),
        password,
        level: { type: "string", enum: ["lossless", "balanced", "strong"] },
        targetMegabytes: {
          type: "number",
          minimum: 0.01,
          maximum: 2000,
          description:
            "Instead of a level: the size to come out under. Pictures give way first; text stays sharp.",
        },
        further: {
          type: "boolean",
          description:
            "With targetMegabytes: go past what is easy to read if the size needs it.",
        },
        custom: {
          type: "object",
          description:
            "Instead of a level: your own resolution (pixels per inch) and JPEG quality.",
          properties: {
            dpi: { type: "integer", enum: [...customDpis] },
            quality: {
              type: "integer",
              minimum: customQuality.min,
              maximum: customQuality.max,
            },
            grey: { type: "boolean" },
            fonts: {
              type: "boolean",
              description:
                "Cut fonts down to the letters in use (yes by default).",
            },
          },
          required: ["dpi", "quality"],
          additionalProperties: false,
        },
        scans: {
          type: "string",
          enum: ["keep", "layers", "grey", "mono"],
          description:
            "Scanned pages: keep them, rebuild them as text over paper (layers), or in grey or black and white.",
        },
        remove: {
          type: "object",
          description: "Things to take out of the result.",
          properties: Object.fromEntries(
            [
              "details",
              "attachments",
              "bookmarks",
              "comments",
              "scripts",
              "tags",
              "flatten",
            ].map((key) => [key, { type: "boolean" }])
          ),
          additionalProperties: false,
        },
        lock,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      const ways = [input.level, input.targetMegabytes, input.custom].filter(
        (way) => way !== undefined
      )
      if (ways.length > 1)
        throw new ToolError(
          'Give one of "level", "targetMegabytes" or "custom".'
        )
      const target =
        input.targetMegabytes !== undefined
          ? Math.round(input.targetMegabytes * 1024 * 1024)
          : null
      const level = input.level ?? "balanced"
      const how = target
        ? { target, further: Boolean(input.further) }
        : input.custom
          ? { custom: { grey: false, fonts: true, ...input.custom } }
          : level
      const mode = target ? "size" : input.custom ? "custom" : level
      const removal: Removal = {
        details: false,
        attachments: false,
        bookmarks: false,
        comments: false,
        scripts: false,
        tags: false,
        flatten: false,
        ...input.remove,
      }
      const scans: ScanChoice =
        mode === "lossless" ? "keep" : (input.scans ?? "keep")
      const locked = lockOf(input.lock)
      const { ref } = files.get(input.file)
      return withOpen(
        files,
        [{ id: input.file, password: input.password }],
        async ([{ id }], [blob]) => {
          const out = await engine.compress(
            id,
            blob,
            {
              how,
              scans,
              remove: Object.values(removal).some(Boolean) ? removal : null,
              lock: locked,
              password: input.password,
              maxPixels: pixelLimit(false),
            },
            signal,
            (stage, done, total, attempt = 1) =>
              progress(
                stagePercent(stage, done, total, attempt, attempt) / 100,
                stage
              )
          )
          const { report } = out
          const check = checkLine(
            report.check,
            scans === "grey" || scans === "mono"
          )
          const target_ = report.target
            ? { wanted: report.target.wanted, met: report.target.met }
            : undefined
          const data = {
            before: report.before,
            after: report.after,
            pictures: report.pictures,
            fontsCut: report.fontsCut,
            checked: report.check.checked,
            looksTheSame: check?.passed ?? null,
            ...(report.target ? { target: report.target } : {}),
            ...(report.taken ? { taken: report.taken } : {}),
          }
          if (!out.bytes) return { summary: alreadySmall(mode, target_), data }
          const file = files.add(
            new Blob([out.bytes], { type: "application/pdf" }),
            resultName(ref.name),
            "made"
          )
          const percent = Math.round((1 - report.after / report.before) * 100)
          return {
            summary: [
              `${(report.before / 1024 / 1024).toFixed(2)} MB became ${(report.after / 1024 / 1024).toFixed(2)} MB (${percent}% smaller).`,
              report.target && !report.target.met
                ? "It could not get under the size asked for."
                : "",
              check?.text ?? "",
              locked ? "Locked with the password given." : "",
            ]
              .filter(Boolean)
              .join(" "),
            files: [file],
            data,
          }
        }
      )
    },
  }

  return [pdfInfo, mergePdfs, splitPdf, compressPdf].map((tool) =>
    asTool(tool as AgentTool<never>)
  )
}
