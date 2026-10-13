/**
 * The file as a whole: its bookmarks, what it says of itself (title,
 * author, subject, keywords) and the numbers it gives its own pages.
 *
 * This is the part that needs no engine: a list of bookmarks with one
 * added, renamed, moved, put beneath another or taken out; the changes as
 * they arrive from the page; and how a run of page numbers is written.
 */
import { retarget, type Bookmark } from "@/lib/pdf-merger/outline"

/** Where a bookmark is in the list: which one at each level, counted from 0. */
export type Path = readonly number[]

/** What a file says of itself. */
export interface Details {
  title: string
  author: string
  subject: string
  keywords: string
}

/** How the numbers of a run of pages are written; "" for no number at all. */
export const LABEL_STYLES = ["D", "r", "R", "a", "A", ""] as const
export type LabelStyle = (typeof LABEL_STYLES)[number]

export const LABEL_NAMES: Record<LabelStyle, string> = {
  D: "1, 2, 3",
  r: "i, ii, iii",
  R: "I, II, III",
  a: "a, b, c",
  A: "A, B, C",
  "": "No number",
}

/** A run of the numbers a file gives its own pages. */
export interface LabelRun {
  /** The page it begins at, counted from 0. */
  start: number
  style: LabelStyle
  /** What is written ahead of each number. */
  prefix: string
  /** The number the run begins with. */
  first: number
}

/** One change to the file as a whole. */
export type DocumentOp =
  | { do: "bookmarks"; items: Bookmark[] }
  | { do: "details"; details: Details }
  | { do: "labels"; runs: LabelRun[] }

export interface DocumentChange {
  label: string
  ops: DocumentOp[]
}

export const MOST_BOOKMARKS = 10_000
export const DEEPEST_BOOKMARK = 12
export const LONGEST_TITLE = 500
export const LONGEST_DETAIL = 2000
export const MOST_RUNS = 200

/** How many bookmarks a list holds, with those beneath them. */
export const countBookmarks = (items: readonly Bookmark[]): number =>
  items.reduce((sum, item) => sum + 1 + countBookmarks(item.children), 0)

/** The bookmark at a place; null when there is none. */
export function bookmarkAt(items: readonly Bookmark[], path: Path) {
  let list = items
  let found: Bookmark | null = null
  for (const at of path) {
    found = list[at] ?? null
    if (!found) return null
    list = found.children
  }
  return found
}

/** A list with the list of siblings at a place changed; the place names one of them. */
function withSiblings(
  items: readonly Bookmark[],
  path: Path,
  change: (siblings: Bookmark[], at: number) => Bookmark[]
): Bookmark[] {
  const [at, ...rest] = path
  if (!rest.length) return change([...items], at)
  return items.map((item, index) =>
    index === at
      ? { ...item, children: withSiblings(item.children, rest, change) }
      : item
  )
}

/** A list with one bookmark changed. */
const withOne = (
  items: readonly Bookmark[],
  path: Path,
  change: (item: Bookmark) => Bookmark
) =>
  withSiblings(items, path, (siblings, at) => {
    if (siblings[at]) siblings[at] = change(siblings[at])
    return siblings
  })

/** A bookmark that leads to a page, by a name. */
export const bookmarkTo = (title: string, page: number): Bookmark => ({
  title,
  uri: retarget(undefined, page),
  page,
  open: true,
  children: [],
})

/** A list with a bookmark called otherwise. */
export const renamed = (
  items: readonly Bookmark[],
  path: Path,
  title: string
) => withOne(items, path, (item) => ({ ...item, title }))

/** A list with a bookmark leading to another page, in the view it led to its own. */
export const retargeted = (
  items: readonly Bookmark[],
  path: Path,
  page: number
) =>
  withOne(items, path, (item) => ({
    ...item,
    page,
    uri: retarget(item.page === null ? undefined : item.uri, page),
  }))

/** A list without a bookmark, and without what was beneath it. */
export const removed = (items: readonly Bookmark[], path: Path) =>
  withSiblings(items, path, (siblings, at) => {
    siblings.splice(at, 1)
    return siblings
  })

/**
 * A list with a bookmark added: after the one at a place, on its level, or
 * at the end of the list when no place is given.
 * @returns The list, and where the new bookmark is in it.
 */
export function added(
  items: readonly Bookmark[],
  after: Path | null,
  bookmark: Bookmark
): { items: Bookmark[]; path: number[] } {
  if (!after || !bookmarkAt(items, after))
    return { items: [...items, bookmark], path: [items.length] }
  const at = after[after.length - 1] + 1
  return {
    items: withSiblings(items, after, (siblings) => {
      siblings.splice(at, 0, bookmark)
      return siblings
    }),
    path: [...after.slice(0, -1), at],
  }
}

/** A bookmark one place up or down among those on its level; null at the edge. */
export function movedBy(
  items: readonly Bookmark[],
  path: Path,
  by: -1 | 1
): { items: Bookmark[]; path: number[] } | null {
  const item = bookmarkAt(items, path)
  const parent = path.slice(0, -1)
  const level = parent.length ? bookmarkAt(items, parent)?.children : items
  const at = path[path.length - 1]
  const to = at + by
  if (!item || !level || to < 0 || to >= level.length) return null
  return {
    items: withSiblings(items, path, (siblings) => {
      siblings.splice(at, 1)
      siblings.splice(to, 0, item)
      return siblings
    }),
    path: [...parent, to],
  }
}

/** A bookmark put beneath the one before it, as the last there; null when there is none before it, or it would lie too deep. */
export function indented(
  items: readonly Bookmark[],
  path: Path
): { items: Bookmark[]; path: number[] } | null {
  const item = bookmarkAt(items, path)
  const at = path[path.length - 1]
  // It lies one level deeper afterwards, with all that is beneath it.
  if (!item || at === 0 || path.length + 1 + depthOf(item) > DEEPEST_BOOKMARK)
    return null
  let beneath = 0
  const next = withSiblings(items, path, (siblings) => {
    const before = siblings[at - 1]
    beneath = before.children.length
    // It is shown: a bookmark put beneath a shut one would seem to vanish.
    siblings[at - 1] = {
      ...before,
      open: true,
      children: [...before.children, item],
    }
    siblings.splice(at, 1)
    return siblings
  })
  return { items: next, path: [...path.slice(0, -1), at - 1, beneath] }
}

/** A bookmark taken out from beneath another and put after it; null when it is beneath none. */
export function outdented(
  items: readonly Bookmark[],
  path: Path
): { items: Bookmark[]; path: number[] } | null {
  const item = bookmarkAt(items, path)
  if (!item || path.length < 2) return null
  const parent = path.slice(0, -1)
  const without = removed(items, path)
  const after = parent[parent.length - 1] + 1
  return {
    items: withSiblings(without, parent, (siblings) => {
      siblings.splice(after, 0, item)
      return siblings
    }),
    path: [...parent.slice(0, -1), after],
  }
}

/** How many levels a bookmark has beneath it. */
const depthOf = (item: Bookmark): number =>
  item.children.reduce(
    (deepest, child) => Math.max(deepest, 1 + depthOf(child)),
    0
  )

/** Every bookmark of a list from the top down, with where it is and how deep. */
export function listed(
  items: readonly Bookmark[],
  under: Path = []
): { bookmark: Bookmark; path: number[] }[] {
  return items.flatMap((bookmark, at) => {
    const path = [...under, at]
    return [{ bookmark, path }, ...listed(bookmark.children, path)]
  })
}

const isText = (value: unknown, longest: number): value is string =>
  typeof value === "string" && value.length <= longest

/** Bookmarks as they arrive from the page or from a draft, or null when they are none. */
function readList(
  value: unknown,
  depth: number,
  left: { count: number }
): Bookmark[] | null {
  if (!Array.isArray(value)) return null
  // A level with nothing on it is no level.
  if (value.length && depth > DEEPEST_BOOKMARK) return null
  const items: Bookmark[] = []
  for (const one of value as Record<string, unknown>[]) {
    if (typeof one !== "object" || one === null || --left.count < 0) return null
    const { title, uri, page, open } = one
    if (!isText(title, LONGEST_TITLE)) return null
    if (uri !== undefined && uri !== null && !isText(uri, LONGEST_DETAIL))
      return null
    if (page !== null && !(Number.isInteger(page) && (page as number) >= 0))
      return null
    const children = readList(one.children ?? [], depth + 1, left)
    if (!children) return null
    items.push({
      title,
      uri: typeof uri === "string" ? uri : undefined,
      page: page as number | null,
      open: open === true,
      children,
    })
  }
  return items
}

function readRuns(value: unknown): LabelRun[] | null {
  if (!Array.isArray(value) || value.length > MOST_RUNS) return null
  const runs: LabelRun[] = []
  for (const one of value as Record<string, unknown>[]) {
    if (typeof one !== "object" || one === null) return null
    const { start, style, prefix, first } = one
    if (
      !Number.isInteger(start) ||
      (start as number) < 0 ||
      !LABEL_STYLES.includes(style as LabelStyle) ||
      !isText(prefix, 60) ||
      !Number.isInteger(first) ||
      (first as number) < 1 ||
      (first as number) > 1_000_000
    )
      return null
    runs.push({
      start: start as number,
      style: style as LabelStyle,
      prefix,
      first: first as number,
    })
  }
  // In order, each beginning at a page of its own.
  runs.sort((a, b) => a.start - b.start)
  return runs.some((run, at) => at > 0 && run.start === runs[at - 1].start)
    ? null
    : runs
}

/** A change to the file as a whole as it arrives from the page or from a draft, or null when it is not one. */
export function readDocumentOp(value: unknown): DocumentOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (op.do === "bookmarks") {
    const items = readList(op.items, 1, { count: MOST_BOOKMARKS })
    return items ? { do: "bookmarks", items } : null
  }
  if (op.do === "details") {
    const details = op.details as Record<string, unknown> | null
    if (typeof details !== "object" || details === null) return null
    const { title, author, subject, keywords } = details
    if (
      ![title, author, subject, keywords].every((one) =>
        isText(one, LONGEST_DETAIL)
      )
    )
      return null
    return {
      do: "details",
      details: { title, author, subject, keywords } as Details,
    }
  }
  if (op.do === "labels") {
    const runs = readRuns(op.runs)
    return runs ? { do: "labels", runs } : null
  }
  return null
}

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
]

/** A number as a run writes it: 4 is "4", "iv", "IV", "d" or "D"; after z comes aa, as the PDF format has it. */
export function numbered(style: LabelStyle, number: number) {
  if (style === "") return ""
  if (style === "D") return String(number)
  if (style === "r" || style === "R") {
    let left = number
    let roman = ""
    for (const [value, letters] of ROMAN)
      while (left >= value) {
        roman += letters
        left -= value
      }
    return style === "R" ? roman.toUpperCase() : roman
  }
  const letter = String.fromCharCode(97 + ((number - 1) % 26))
  const letters = letter.repeat(Math.ceil(number / 26))
  return style === "A" ? letters.toUpperCase() : letters
}

/**
 * What each page of a file is called by its runs of numbers.
 * @param runs In order; pages ahead of the first run are simply counted.
 */
export function labelsFor(runs: readonly LabelRun[], pages: number) {
  const labels: string[] = []
  for (let page = 0; page < pages; page++) {
    const run = [...runs].reverse().find((one) => one.start <= page)
    labels.push(
      run
        ? run.prefix + numbered(run.style, run.first + page - run.start)
        : String(page + 1)
    )
  }
  return labels
}

/** Whether two sets of details say the same. */
export const sameDetails = (one: Details, two: Details) =>
  one.title === two.title &&
  one.author === two.author &&
  one.subject === two.subject &&
  one.keywords === two.keywords
