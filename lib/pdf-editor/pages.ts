/**
 * The pages of a file as a list that can be changed: pages moved, taken
 * out, copied, turned, and blank ones put between them.
 *
 * This is the part that needs no engine: what the list of pages is after a
 * change, where each page of before is afterwards, and which pages are
 * chosen. A change is worked out here first, as a plan, and the engine
 * makes the file fit the plan; the same plan says afterwards which pages of
 * the result are still pages of the file as it came.
 */
import type { Size } from "@/lib/image-compressor/geometry"

/** A turn to the right, in degrees. */
export type Turn = 90 | 180 | 270

/** One change to the list of pages. Pages are counted from 0, as they are before the change. */
export type PageOp =
  /** The pages, in their order, are put before the page that is now at `to`; at the end when `to` is the count. */
  | { do: "move"; pages: number[]; to: number }
  | { do: "delete"; pages: number[] }
  /** A copy of each, together, after the last of them. */
  | { do: "copy"; pages: number[] }
  /** An empty page before the page that is now at `at`. */
  | { do: "blank"; at: number; size: Size }
  | { do: "turn"; pages: number[]; by: Turn }

/** What links, bookmarks and fields went with pages that were taken out. */
export interface Lost {
  links: number
  bookmarks: number
  fields: number
}

export interface PagesChange {
  label: string
  ops: PageOp[]
  /** What the engine said went with the pages, for each change: kept so that a download can say it. */
  lost?: Lost[]
}

/** Where a page of the list after a change comes from. */
export type Source =
  /** The page that was at `was`, turned or not. */
  | { was: number; by?: Turn }
  /** A copy of the page that was at `copy`. */
  | { copy: number }
  | { blank: Size }

/** The list of pages after a change: for each, where it comes from. */
export type Plan = Source[]

/** The most pages a file is let grow to. */
export const MOST_PAGES = 20_000
/** The shortest and the longest side a page can have, in points: what the PDF format allows. */
export const SHORTEST_SIDE = 3
export const LONGEST_SIDE = 14_400

/** Sizes offered for a blank page, in points. */
export const SHEETS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
} as const

const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0

/** Pages as they are named in a change: each once, from the first to the last. */
function readPages(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MOST_PAGES)
    return null
  if (!value.every(isCount)) return null
  const pages = [...new Set(value as number[])].sort((a, b) => a - b)
  return pages.length === value.length ? pages : null
}

const isSide = (value: unknown): value is number =>
  typeof value === "number" && value >= SHORTEST_SIDE && value <= LONGEST_SIDE

/** A change to the list of pages as it arrives from the page or from a draft, or null when it is not one. */
export function readPageOp(value: unknown): PageOp | null {
  if (typeof value !== "object" || value === null) return null
  const op = value as Record<string, unknown>
  if (op.do === "blank") {
    const size = op.size as Record<string, unknown> | null
    if (!isCount(op.at) || typeof size !== "object" || size === null)
      return null
    if (!isSide(size.width) || !isSide(size.height)) return null
    return {
      do: "blank",
      at: op.at,
      size: { width: size.width, height: size.height },
    }
  }
  const pages = readPages(op.pages)
  if (!pages) return null
  if (op.do === "move")
    return isCount(op.to) ? { do: "move", pages, to: op.to } : null
  if (op.do === "delete" || op.do === "copy") return { do: op.do, pages }
  if (op.do === "turn")
    return op.by === 90 || op.by === 180 || op.by === 270
      ? { do: "turn", pages, by: op.by }
      : null
  return null
}

/** What went with pages as it comes out of a draft: a count of each for every change, or nothing. */
export function readLost(value: unknown, ops: number): Lost[] | undefined {
  if (!Array.isArray(value) || value.length !== ops) return undefined
  const lost: Lost[] = []
  for (const one of value as Record<string, unknown>[]) {
    if (typeof one !== "object" || one === null) return undefined
    const { links, bookmarks, fields } = one
    if (!isCount(links) || !isCount(bookmarks) || !isCount(fields))
      return undefined
    lost.push({ links, bookmarks, fields })
  }
  return lost
}

/** Why a change cannot be made to a file with so many pages; "" when it can. */
export function whyNot(count: number, op: PageOp): string {
  const pages = op.do === "blank" ? [] : op.pages
  if (pages.some((page) => page >= count))
    return "That page is not in the file."
  if (op.do === "blank")
    return op.at > count
      ? "That page is not in the file."
      : count + 1 > MOST_PAGES
        ? tooMany
        : ""
  if (op.do === "move")
    return op.to > count ? "That page is not in the file." : ""
  if (op.do === "delete")
    return pages.length >= count
      ? "A file needs at least one page. Leave one page in it."
      : ""
  if (op.do === "copy") return count + pages.length > MOST_PAGES ? tooMany : ""
  return ""
}
const tooMany = `A file can have ${MOST_PAGES.toLocaleString("en")} pages at most here.`

/**
 * The list of pages after a change.
 * @param count How many pages there are before it.
 * @returns Null when the change cannot be made, or changes nothing.
 */
export function planOf(count: number, op: PageOp): Plan | null {
  if (whyNot(count, op)) return null
  const all = Array.from({ length: count }, (_, was): Source => ({ was }))
  if (op.do === "blank")
    return [...all.slice(0, op.at), { blank: op.size }, ...all.slice(op.at)]
  const chosen = new Set(op.pages)
  if (op.do === "turn")
    return all.map((page, at) =>
      chosen.has(at) ? { was: at, by: op.by } : page
    )
  if (op.do === "delete") return all.filter((_, at) => !chosen.has(at))
  if (op.do === "copy") {
    const after = op.pages[op.pages.length - 1] + 1
    return [
      ...all.slice(0, after),
      ...op.pages.map((copy): Source => ({ copy })),
      ...all.slice(after),
    ]
  }
  const rest = all.filter((_, at) => !chosen.has(at))
  const before = rest.filter((page) => (page as { was: number }).was < op.to)
  const plan = [
    ...before,
    ...op.pages.map((was): Source => ({ was })),
    ...rest.slice(before.length),
  ]
  // Pages put where they already are.
  return plan.every((page, at) => (page as { was: number }).was === at)
    ? null
    : plan
}

/** The pages of the list after a change that are not what was at their place before, and the places that are no more. */
export function changedBy(count: number, plan: Plan): number[] {
  const changed: number[] = []
  for (let at = 0; at < Math.max(count, plan.length); at++) {
    const page = plan[at]
    if (!page || !("was" in page) || page.was !== at || page.by)
      changed.push(at)
  }
  return changed
}

/** Each page's size after a change. A page turned a quarter is as wide as it was high. */
export function sizesAfter(sizes: readonly Size[], plan: Plan): Size[] {
  return plan.map((page) => {
    if ("blank" in page) return page.blank
    const was = sizes[("was" in page ? page.was : page.copy) as number]
    return "was" in page && (page.by === 90 || page.by === 270)
      ? { width: was.height, height: was.width }
      : was
  })
}

/** Where each page of before is after a change, by its old place. Pages that were taken out are not in it. */
export function whereNow(plan: Plan) {
  const now = new Map<number, number>()
  plan.forEach((page, at) => {
    if ("was" in page) now.set(page.was, at)
  })
  return now
}

/**
 * What is known of each page, carried through a change: a page that only
 * moved keeps what it had, a page that was turned or made has `fresh`.
 * @param had What each page had before, by its place.
 */
export function carried<T>(had: readonly T[], plan: Plan, fresh: T): T[] {
  return plan.map((page) =>
    "was" in page && !page.by ? (had[page.was] as T) : fresh
  )
}

/** The pages that were chosen, where they are after a change; copies and blank pages are chosen in their stead when it made any. */
export function chosenAfter(plan: Plan, chosen: readonly number[]): number[] {
  const made = plan.flatMap((page, at) => ("was" in page ? [] : [at]))
  if (made.length) return made
  const now = whereNow(plan)
  return chosen.flatMap((page) => now.get(page) ?? []).sort((a, b) => a - b)
}

/**
 * Where the runs of a file's own page numbers begin after a change. A file
 * may number its pages in runs: i, ii, iii for what comes first, then 1, 2,
 * 3. A page that stays among its neighbours stays in its run; a page that
 * is put somewhere else, copied or added joins the run of the page before
 * it, or of the first page when it is put ahead of all. Each run counts on
 * from where it starts, so the numbers have no gaps.
 * @param starts The place each run begins at before the change, in order; the first is 0.
 * @param moved The pages, by their place before, that were taken from where they were and put elsewhere.
 * @returns Each run that still has a page, with the place it begins at now.
 */
export function runsAfter(
  starts: readonly number[],
  plan: Plan,
  moved: readonly number[] = []
) {
  const runOf = (page: number) => {
    let run = 0
    while (run + 1 < starts.length && starts[run + 1] <= page) run++
    return run
  }
  const goes = new Set(moved)
  const own = plan.map((page) =>
    "was" in page && !goes.has(page.was) ? runOf(page.was) : null
  )
  const first = own.find((run) => run !== null) ?? 0
  const after: { run: number; at: number }[] = []
  let last: number | null = null
  own.forEach((mine, at) => {
    const run: number = mine ?? last ?? first
    if (run !== last) after.push({ run, at })
    last = run
  })
  return after
}

/** Pages as people count them: "page 3", "pages 2 to 4", "3 pages". */
export function pagesNamed(pages: readonly number[]) {
  if (pages.length === 1) return `page ${pages[0] + 1}`
  const [first] = pages
  const last = pages[pages.length - 1]
  return last - first === pages.length - 1
    ? `pages ${first + 1} to ${last + 1}`
    : `${pages.length.toLocaleString("en")} pages`
}

/** What a change is called in the list of what can be undone. */
export function labelOf(op: PageOp) {
  if (op.do === "blank") return "Add a blank page"
  const named = pagesNamed(op.pages)
  return {
    move: `Move ${named}`,
    delete: `Delete ${named}`,
    copy: `Duplicate ${named}`,
    turn: `Turn ${named}`,
  }[op.do]
}

/**
 * The move that takes the chosen pages one place towards the start or the
 * end, together and in their order; null at the edge.
 */
export function nudge(
  count: number,
  pages: readonly number[],
  by: -1 | 1
): PageOp | null {
  if (!pages.length) return null
  const sorted = [...pages].sort((a, b) => a - b)
  const to =
    by < 0
      ? Math.max(0, sorted[0] - 1)
      : Math.min(count, sorted[sorted.length - 1] + 2)
  const op: PageOp = { do: "move", pages: sorted, to }
  return planOf(count, op) ? op : null
}

/**
 * The move that makes the first of the chosen pages the page at a place,
 * the others following it in their order; null when they are there already.
 * @param place The place among all pages afterwards, counted from 0; past the end is the end.
 */
export function moveTo(
  count: number,
  pages: readonly number[],
  place: number
): PageOp | null {
  if (!pages.length) return null
  const sorted = [...pages].sort((a, b) => a - b)
  const rest = Array.from({ length: count }, (_, at) => at).filter(
    (page) => !sorted.includes(page)
  )
  const to = rest[Math.max(0, Math.round(place))] ?? count
  const op: PageOp = { do: "move", pages: sorted, to }
  return planOf(count, op) ? op : null
}

/**
 * The size a blank page is given: that of the page it is put after, or of
 * the first page when it is put ahead of all.
 */
export const blankSize = (sizes: readonly Size[], at: number): Size =>
  sizes[Math.max(0, at - 1)] ?? SHEETS.A4

/**
 * The pages chosen after one is pressed.
 * @param how "only" for a plain press, "also" with Ctrl or ⌘ (in or out), "through" with Shift (from the page pressed before).
 * @param anchor The page that was pressed before; null when none was.
 */
export function chosenWith(
  chosen: readonly number[],
  page: number,
  how: "only" | "also" | "through",
  anchor: number | null
): number[] {
  if (how === "also")
    return chosen.includes(page)
      ? chosen.filter((one) => one !== page)
      : [...chosen, page].sort((a, b) => a - b)
  if (how === "through" && anchor !== null) {
    const from = Math.min(anchor, page)
    return Array.from(
      { length: Math.abs(anchor - page) + 1 },
      (_, at) => from + at
    )
  }
  return [page]
}

/** What went with pages in some changes, added up. */
export function lostIn(changes: readonly PagesChange[]): Lost {
  const sum = { links: 0, bookmarks: 0, fields: 0 }
  for (const change of changes)
    for (const lost of change.lost ?? []) {
      sum.links += lost.links
      sum.bookmarks += lost.bookmarks
      sum.fields += lost.fields
    }
  return sum
}
