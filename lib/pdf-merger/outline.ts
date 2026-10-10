/** One bookmark of an opened file. */
export interface Bookmark {
  title: string
  /** Where it leads: "#page=3&view=Fit" inside the file, an address outside it, or nothing. */
  uri: string | undefined
  /** The page it opens, counted from 0; null when it leads outside the file or nowhere. */
  page: number | null
  open: boolean
  children: Bookmark[]
}

/**
 * How bookmarks are carried into the result.
 * - nested: each file's bookmarks under one entry for the file
 * - keep: every bookmark, in order
 * - files: one entry per file and nothing else
 * - none: no bookmarks
 */
export type BookmarkPolicy = "nested" | "keep" | "files" | "none"

/** What the result takes from one file. */
export interface OutlineSource {
  /** What the file is called in the bookmarks. */
  name: string
  bookmarks: readonly Bookmark[]
  /** For each of the file's pages that is in the result: where it first appears, counted from 0. */
  placed: ReadonlyMap<number, number>
  /** Where the file's first page sits in the result. */
  first: number
}

export interface MergedBookmark {
  title: string
  uri: string | undefined
  open: boolean
  children: MergedBookmark[]
}

const toPage = (page: number) => `#page=${page + 1}`

/** The same view of another page: "#page=3&view=Fit" moved to page 7 is "#page=8&view=Fit". */
export function retarget(uri: string | undefined, page: number) {
  const match = /^#page=\d+(.*)$/.exec(uri ?? "")
  return match ? `${toPage(page)}${match[1]}` : toPage(page)
}

/** The first place a list of bookmarks leads to, searching downwards. */
function firstTarget(list: readonly MergedBookmark[]): string | undefined {
  for (const item of list) {
    const uri = item.uri ?? firstTarget(item.children)
    if (uri) return uri
  }
  return undefined
}

/**
 * A file's bookmarks, pointed at the pages of the result. One for a page that
 * was left out is dropped, unless something beneath it is kept; then it leads
 * where the first of those does.
 */
function kept(
  bookmarks: readonly Bookmark[],
  placed: ReadonlyMap<number, number>
): MergedBookmark[] {
  const result: MergedBookmark[] = []
  for (const bookmark of bookmarks) {
    const children = kept(bookmark.children, placed)
    const page = bookmark.page === null ? undefined : placed.get(bookmark.page)
    const gone = bookmark.page !== null && page === undefined
    if (gone && !children.length) continue
    result.push({
      title: bookmark.title.trim() || "Untitled",
      uri: gone
        ? firstTarget(children)
        : page === undefined
          ? bookmark.uri
          : retarget(bookmark.uri, page),
      open: bookmark.open,
      children,
    })
  }
  return result
}

/** The bookmarks of the result. Files with no pages in it are not passed in. */
export function mergeBookmarks(
  sources: readonly OutlineSource[],
  policy: BookmarkPolicy
): MergedBookmark[] {
  if (policy === "none") return []
  if (policy === "files")
    return sources.map((source) => ({
      title: source.name,
      uri: toPage(source.first),
      open: false,
      children: [],
    }))
  const own = sources.map((source) => kept(source.bookmarks, source.placed))
  // One file needs no entry of its own above its bookmarks.
  if (policy === "keep" || sources.length === 1) return own.flat()
  return sources.map((source, index) => ({
    title: source.name,
    uri: toPage(source.first),
    open: false,
    children: own[index],
  }))
}

/** How many bookmarks a list holds, at every depth. */
export function countBookmarks(
  list: readonly { children: readonly unknown[] }[]
): number {
  return list.reduce(
    (total, item) =>
      total + 1 + countBookmarks(item.children as { children: unknown[] }[]),
    0
  )
}
