/**
 * A draft: unfinished work kept on the device, for when the tab is closed
 * before a download. It is the file as it came and the list of steps that
 * were made, which is all the editor needs to make the working copy again.
 *
 * A draft is only kept when a switch is turned on, and only in the
 * browser's own storage. What is read back from there is trusted no more
 * than a file is: every step goes through the same checks as a change that
 * arrives from the page.
 */
import { readCommentOp } from "./comments"
import { readFieldOp } from "./forms"
import type { Step } from "./mupdf-edit"
import { FONT_KEYS, fontsFor, readObject } from "./objects"
import { isOwn } from "./own-font"
import { readLinkOp } from "./links"
import { readPictureOp, type PictureOp } from "./page-pictures"
import { readLost, readPageOp, type PagesChange } from "./pages"
import { readTextChange, readWrote } from "./paragraphs"
import type { Op } from "./tools"

/** The largest file a draft is kept of. Larger ones are edited as before, without a draft. */
export const DRAFT_LIMIT = 50 * 1024 * 1024
/** The most steps a draft holds, and the most changes in one step. */
export const MOST_STEPS = 5000
export const MOST_OPS = 2000

/** What is kept of a draft besides the file and its pictures. */
export interface Draft {
  /** The file's name. */
  name: string
  /** Its size in bytes. */
  size: number
  /** When the draft was last kept, in milliseconds since 1970. */
  when: number
  steps: Step[]
  /** How many of the steps are in force. */
  position: number
}

export const canBeKept = (size: number) => size > 0 && size <= DRAFT_LIMIT

const isPage = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0

const ORDERS = ["front", "back", "forward", "backward"]

/** A change to the things on a page as it comes out of storage, or null when it is not one. */
export function readOp(value: unknown): Op | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (!isPage(op.page)) return null
  const { page } = op
  if (op.do === "add" || op.do === "change") {
    const object = readObject(op.object)
    return object ? { do: op.do, page, object } : null
  }
  if (typeof op.id !== "string" || !op.id || op.id.length > 64) return null
  if (op.do === "remove") return { do: "remove", page, id: op.id }
  if (op.do === "order" && ORDERS.includes(op.to as string))
    return { do: "order", page, id: op.id, to: op.to as never }
  return null
}

const readers = {
  things: readOp,
  comments: readCommentOp,
  fields: readFieldOp,
  text: readTextChange,
  pictures: readPictureOp,
  links: readLinkOp,
  pages: readPageOp,
} as const

/** A step as it comes out of storage, with every change in it checked, or null when it is not one. */
export function readStep(value: unknown): Step | null {
  if (typeof value !== "object" || value === null) return null
  const step = value as Record<string, unknown>
  const done = step.done as Record<string, unknown> | null
  if (typeof done !== "object" || done === null) return null
  const reader = readers[done.kind as keyof typeof readers]
  const change = done.change as Record<string, unknown> | null
  if (!reader || typeof change !== "object" || change === null) return null
  const { label } = step
  if (typeof label !== "string" || !label || label.length > 200) return null
  if (!Array.isArray(change.ops) || change.ops.length > MOST_OPS) return null
  const ops = change.ops.map((op) => reader(op))
  if (ops.some((op) => op === null)) return null
  if (!Array.isArray(step.touched) || !step.touched.every(isPage)) return null
  // The editor's fonts a change to the page's own text was written with.
  const fonts =
    done.kind === "text" && Array.isArray(change.fonts)
      ? change.fonts.filter(
          (key): key is string =>
            typeof key === "string" && (FONT_KEYS.includes(key) || isOwn(key))
        )
      : null
  // What changes to paragraphs wrote, which a download reads the result against.
  const wrote =
    done.kind === "text" ? readWrote(change.wrote, ops.length) : undefined
  // What went with pages that were taken out, which a download says.
  const lost =
    done.kind === "pages" ? readLost(change.lost, ops.length) : undefined
  return {
    done: {
      kind: done.kind as Step["done"]["kind"],
      change: {
        label,
        ops,
        ...(fonts ? { fonts } : null),
        ...(wrote ? { wrote } : null),
        ...(lost ? { lost } : null),
      },
    },
    label,
    touched: step.touched,
  }
}

/** A draft as it comes out of storage, or null when what is there is not one. */
export function readDraft(value: unknown): Draft | null {
  if (typeof value !== "object" || value === null) return null
  const draft = value as Record<string, unknown>
  if (
    typeof draft.name !== "string" ||
    !draft.name ||
    draft.name.length > 300 ||
    typeof draft.size !== "number" ||
    !canBeKept(draft.size) ||
    typeof draft.when !== "number" ||
    !Number.isFinite(draft.when) ||
    !Array.isArray(draft.steps) ||
    draft.steps.length > MOST_STEPS
  )
    return null
  const steps = draft.steps.map(readStep)
  if (steps.some((step) => step === null)) return null
  if (!isPage(draft.position) || draft.position > steps.length) return null
  return {
    name: draft.name,
    size: draft.size,
    when: draft.when,
    steps: steps as Step[],
    position: draft.position,
  }
}

/** The things steps add or change. */
function* thingsIn(steps: readonly Step[]) {
  for (const step of steps) {
    if (step.done.kind !== "things") continue
    const { ops } = step.done.change as { ops: Op[] }
    for (const op of ops)
      if (op.do === "add" || op.do === "change") yield op.object
  }
}

/** The fonts the steps of a draft are written in, by key, each once: those of things, and those that changed text was set in. */
export const fontsOf = (steps: readonly Step[]) => [
  ...new Set([
    ...[...thingsIn(steps)].flatMap(fontsFor),
    ...steps.flatMap((step) =>
      step.done.kind === "text"
        ? ((step.done.change as { fonts?: string[] }).fonts ?? [])
        : []
    ),
  ]),
]

/**
 * The files the steps of a draft need beside the one being edited, by
 * name, each once: pictures that were added, pictures put in the place of
 * a picture of the page, and other PDFs whose pages were added (made
 * ready, see `prepareInsert`; their names tell them apart, `isInsert`).
 */
export const picturesOf = (steps: readonly Step[]) => [
  ...new Set([
    ...steps.flatMap((step) =>
      step.done.kind === "pages"
        ? (step.done.change as PagesChange).ops.flatMap((op) =>
            op.do === "insert" ? [op.file] : []
          )
        : []
    ),
    ...[...thingsIn(steps)].flatMap((thing) =>
      thing.kind === "picture" ? [thing.picture] : []
    ),
    ...steps.flatMap((step) =>
      step.done.kind === "pictures"
        ? (step.done.change as { ops: PictureOp[] }).ops.flatMap((op) =>
            op.picture ? [op.picture] : []
          )
        : []
    ),
  ]),
]

/** What the page says about a draft: how much was done, and when it was kept. */
export function draftLine(draft: Draft, now: number) {
  const count = draft.position
  const changes =
    count === 0
      ? "no changes in force"
      : `${count.toLocaleString("en")} change${count === 1 ? "" : "s"}`
  const minutes = Math.max(0, Math.round((now - draft.when) / 60_000))
  const ago =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} minute${minutes === 1 ? "" : "s"} ago`
        : minutes < 60 * 24
          ? `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"} ago`
          : `${Math.round(minutes / 1440)} day${Math.round(minutes / 1440) === 1 ? "" : "s"} ago`
  return `${changes}, kept ${ago}`
}
