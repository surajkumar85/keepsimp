import { rotate, type Rotation } from "@/lib/image-compressor/geometry"
import { chosenPages, type PdfFile } from "./files"

/** One page of the result, as arranged in the Pages view. */
export type PageEntry =
  | {
      /** Stays with the page as it is moved, so it can be found again. */
      key: string
      kind: "page"
      /** The id of the file it comes from. */
      file: string
      /** Its page number in that file, counted from 0. */
      page: number
      /** A turn added to the page's own. */
      rotation: Rotation
    }
  | {
      key: string
      kind: "blank"
      /** Size in points (1/72 inch). */
      width: number
      height: number
    }

/** A4, for a blank page with no neighbour to take its size from. */
export const DEFAULT_PAGE = { width: 595.28, height: 841.89 }

/**
 * The pages the file list stands for: every ready file's chosen pages, in
 * order, with the file's turn. Keys say where a page came from, so the same
 * list always gives the same keys.
 * @param duplex For double-sided printing: a blank page after every file but the last that gives an odd number of pages, so each file starts on a new sheet.
 */
export function derivePages(
  files: readonly PdfFile[],
  duplex = false
): PageEntry[] {
  const groups: PageEntry[][] = []
  for (const file of files) {
    const chosen = chosenPages(file)
    if (!chosen || "problem" in chosen) continue
    const group: PageEntry[] = chosen.pages.map((page, position) => ({
      key: `${file.id}/${position}`,
      kind: "page",
      file: file.id,
      page,
      rotation: file.rotation,
    }))
    if (duplex && group.length % 2)
      group.push({
        key: `${file.id}/blank`,
        kind: "blank",
        // The file's first page, turned as the file is turned.
        ...(file.rotation % 180
          ? { width: file.facts!.height, height: file.facts!.width }
          : { width: file.facts!.width, height: file.facts!.height }),
      })
    groups.push(group)
  }
  // Nothing follows the last file, so it needs no blank page.
  const last = groups[groups.length - 1]
  if (duplex && last?.[last.length - 1].kind === "blank") last.pop()
  return groups.flat()
}

const selected = (
  list: readonly PageEntry[],
  keys: ReadonlySet<string>
): PageEntry[] => list.filter((entry) => keys.has(entry.key))

/**
 * Move the chosen pages, keeping their own order, so that they sit before
 * the page that is now at `to` (the end, when `to` is the list's length).
 */
export function movePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>,
  to: number
): PageEntry[] {
  const moving = selected(list, keys)
  if (!moving.length) return [...list]
  const target = Math.max(0, Math.min(list.length, to))
  // Where the gap is once the moving pages have been lifted out.
  const before = list
    .slice(0, target)
    .filter((entry) => !keys.has(entry.key)).length
  const rest = list.filter((entry) => !keys.has(entry.key))
  return [...rest.slice(0, before), ...moving, ...rest.slice(before)]
}

/**
 * Nudge the chosen pages one place earlier or later, as a block: the first
 * of them steps over its neighbour, and the others follow it.
 */
export function nudgePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>,
  direction: "earlier" | "later"
): PageEntry[] {
  const positions = list.flatMap((entry, index) =>
    keys.has(entry.key) ? [index] : []
  )
  if (!positions.length) return [...list]
  return direction === "earlier"
    ? movePages(list, keys, positions[0] - 1)
    : // Past the page after the last chosen one.
      movePages(list, keys, positions[positions.length - 1] + 2)
}

export function rotatePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>,
  direction: "left" | "right"
): PageEntry[] {
  return list.map((entry) =>
    keys.has(entry.key) && entry.kind === "page"
      ? { ...entry, rotation: rotate(entry.rotation, direction) }
      : entry
  )
}

export function removePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>
): PageEntry[] {
  return list.filter((entry) => !keys.has(entry.key))
}

/** Put a copy of each chosen page straight after it. */
export function duplicatePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>,
  newKey: () => string
): PageEntry[] {
  return list.flatMap((entry) =>
    keys.has(entry.key) ? [entry, { ...entry, key: newKey() }] : [entry]
  )
}

/** Turn the order of the chosen pages around, each taking another's place. */
export function reversePages(
  list: readonly PageEntry[],
  keys: ReadonlySet<string>
): PageEntry[] {
  const turned = selected(list, keys).reverse()
  let next = 0
  return list.map((entry) => (keys.has(entry.key) ? turned[next++] : entry))
}

/**
 * Add a blank page after the page with the given key, or at the start for
 * null. It takes the size its neighbour is shown at.
 */
export function insertBlank(
  list: readonly PageEntry[],
  after: string | null,
  size: { width: number; height: number },
  key: string
): PageEntry[] {
  const at =
    after === null ? -1 : list.findIndex((entry) => entry.key === after)
  const blank: PageEntry = { key, kind: "blank", ...size }
  return [...list.slice(0, at + 1), blank, ...list.slice(at + 1)]
}

/** Every page of a file that has just been added, at the end. */
export function appendFile(
  list: readonly PageEntry[],
  file: { id: string; pages: number }
): PageEntry[] {
  return [
    ...list,
    ...Array.from({ length: file.pages }, (_, page) => ({
      key: `${file.id}/${page}`,
      kind: "page" as const,
      file: file.id,
      page,
      rotation: 0 as const,
    })),
  ]
}

/** Without the pages of a file that has been removed. */
export function dropFile(
  list: readonly PageEntry[],
  file: string
): PageEntry[] {
  return list.filter((entry) => entry.kind !== "page" || entry.file !== file)
}

/**
 * Deal the files' pages out in turn: the first page of each, then the second
 * of each, and so on. A file that runs out is skipped. With `reverseLast`,
 * the last file is read from its end, as a stack of pages scanned back to
 * front comes out.
 */
export function alternatePages(
  groups: readonly (readonly PageEntry[])[],
  reverseLast: boolean
): PageEntry[] {
  const lists = groups.map((group, index) =>
    reverseLast && index === groups.length - 1 && groups.length > 1
      ? [...group].reverse()
      : [...group]
  )
  const longest = Math.max(0, ...lists.map((group) => group.length))
  const result: PageEntry[] = []
  for (let turn = 0; turn < longest; turn++)
    for (const group of lists) if (turn < group.length) result.push(group[turn])
  return result
}

/** What has been done to the pages, so that it can be undone and done again. */
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

const MAX_STEPS = 100

export const startHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
})

/** Record a change. Doing something new forgets what had been undone. */
export function record<T>(history: History<T>, present: T): History<T> {
  return {
    past: [...history.past, history.present].slice(-MAX_STEPS),
    present,
    future: [],
  }
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  }
}

/**
 * Apply one change to every step that is remembered, for a change that is
 * not the person's own doing, such as a file being added or removed.
 */
export function rewrite<T>(
  history: History<T>,
  change: (value: T) => T
): History<T> {
  return {
    past: history.past.map(change),
    present: change(history.present),
    future: history.future.map(change),
  }
}

/**
 * The keys between two pages, both included, for a Shift-click that extends
 * a selection from where it started.
 */
export function keysBetween(
  list: readonly PageEntry[],
  from: string,
  to: string
): string[] {
  const start = list.findIndex((entry) => entry.key === from)
  const end = list.findIndex((entry) => entry.key === to)
  if (start < 0 || end < 0) return end < 0 ? [] : [list[end].key]
  return list
    .slice(Math.min(start, end), Math.max(start, end) + 1)
    .map((entry) => entry.key)
}
