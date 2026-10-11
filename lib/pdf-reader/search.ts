import { quadBox, type Quad } from "./text"

/** One place the words were found: on a page, covering one box per line it spans. */
export interface Match {
  /** The page it is on, counted from 0 in the order pages are read. */
  page: number
  quads: Quad[]
}

/** Shorter than this, a search would match nearly every line. */
export const MIN_NEEDLE = 2
/** Beyond this the count stops, and the page says there are more. */
export const MAX_MATCHES = 2000

/** What is searched for: what was typed, without the space around it; empty when too short. */
export function needleOf(text: string) {
  const needle = text.trim().replace(/\s+/g, " ")
  return needle.length >= MIN_NEEDLE ? needle : ""
}

const topOf = (match: Match) => quadBox(match.quads[0]).top

/**
 * Add the matches of one page to those already found. Pages may be searched
 * in any order; the list stays in reading order and never grows past the limit.
 */
export function addMatches(
  found: readonly Match[],
  page: number,
  hits: readonly Quad[][]
): Match[] {
  const mine = hits
    .filter((quads) => quads.length > 0)
    .map((quads) => ({ page, quads }))
    .sort((a, b) => topOf(a) - topOf(b))
  if (!mine.length) return found as Match[]
  const at = found.findIndex((match) => match.page > page)
  const merged =
    at < 0
      ? [...found, ...mine]
      : [...found.slice(0, at), ...mine, ...found.slice(at)]
  return merged.slice(0, MAX_MATCHES)
}

/** The match to show first: the first one on the page being read, or after it. */
export function firstFrom(matches: readonly Match[], page: number) {
  if (!matches.length) return -1
  const at = matches.findIndex((match) => match.page >= page)
  return at < 0 ? 0 : at
}

/** The next or previous match, going round at either end. */
export const stepMatch = (current: number, count: number, direction: 1 | -1) =>
  count ? (Math.max(current, 0) + direction + count) % count : -1

/** The matches of one page, with each one's place in the whole list. */
export const matchesOn = (matches: readonly Match[], page: number) =>
  matches.flatMap((match, index) =>
    match.page === page ? [{ ...match, index }] : []
  )

/** What the search field says beside itself. */
export function searchStatus(state: {
  needle: string
  searching: boolean
  count: number
  current: number
  /** No page that was searched holds any text. */
  noText: boolean
}) {
  if (!state.needle) return ""
  if (state.count > 0) {
    const of =
      state.count >= MAX_MATCHES
        ? `${MAX_MATCHES.toLocaleString("en")}+`
        : state.count.toLocaleString("en")
    return `${(state.current + 1).toLocaleString("en")} of ${of}`
  }
  if (state.searching) return "Searching…"
  return state.noText ? "No text to search" : "No matches"
}
