import type { Bookmark } from "@/lib/pdf-merger/outline"
import type { Part } from "./parts"

/** A bookmark that leads to a page of the file, with how deep it sits. */
export interface Heading {
  title: string
  /** The page it opens, counted from 0. */
  page: number
  /** 1 for the top of the bookmarks, 2 for what is under those, and so on. */
  level: number
}

/** Every bookmark that leads to a page, in the order the file lists them. */
export function headingsOf(
  bookmarks: readonly Bookmark[],
  level = 1
): Heading[] {
  return bookmarks.flatMap((bookmark) => [
    ...(bookmark.page === null
      ? []
      : [{ title: bookmark.title.trim(), page: bookmark.page, level }]),
    ...headingsOf(bookmark.children, level + 1),
  ])
}

/** The deepest level that has a bookmark leading to a page; 0 when none does. */
export const deepestLevel = (headings: readonly Heading[]) =>
  headings.reduce((deepest, heading) => Math.max(deepest, heading.level), 0)

/**
 * The bookmarks a file is split at: those of one level whose titles hold the
 * words typed, in page order. Of several that open the same page, the first
 * stands, since a page can start only one part.
 */
export function headingsAt(
  headings: readonly Heading[],
  level: number,
  filter = ""
) {
  const wanted = filter.trim().toLowerCase()
  const seen = new Set<number>()
  return headings
    .filter(
      (heading) =>
        heading.level === level &&
        (!wanted || heading.title.toLowerCase().includes(wanted))
    )
    .map((heading, order) => ({ heading, order }))
    .sort((a, b) => a.heading.page - b.heading.page || a.order - b.order)
    .map(({ heading }) => heading)
    .filter((heading) => {
      if (seen.has(heading.page)) return false
      seen.add(heading.page)
      return true
    })
}

/** What happens to pages that come before the first bookmark. */
export type FrontChoice = "own" | "join"

/** The label of the part that holds the pages before the first bookmark. */
export const FRONT_LABEL = "Front"

/**
 * One part for each bookmark, from its page to the page before the next
 * one's. Pages before the first bookmark become a part of their own, or
 * join the first part.
 * @param starts Bookmarks in page order, one a page (see `headingsAt`).
 */
export function partsFromHeadings(
  starts: readonly Heading[],
  count: number,
  front: FrontChoice
): Part[] {
  const inside = starts.filter(
    (heading) => heading.page >= 0 && heading.page < count
  )
  if (!inside.length) return []
  const parts: Part[] = inside.map((heading, index) => {
    const end = index + 1 < inside.length ? inside[index + 1].page : count
    return {
      pages: Array.from(
        { length: end - heading.page },
        (_, at) => heading.page + at
      ),
      label: heading.title,
    }
  })
  const before = Array.from({ length: inside[0].page }, (_, at) => at)
  if (!before.length) return parts
  if (front === "join") {
    parts[0] = { ...parts[0], pages: [...before, ...parts[0].pages] }
    return parts
  }
  return [{ pages: before, label: FRONT_LABEL }, ...parts]
}
