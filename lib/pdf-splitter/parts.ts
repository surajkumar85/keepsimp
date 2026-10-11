import { formatRanges, parseRanges } from "@/lib/pdf-merger/ranges"

/** One file a split makes: pages counted from 0, in the order they go in. */
export interface Part {
  pages: number[]
  /** Words that belong to the part, such as a bookmark's title, for its name. */
  label?: string
}

/**
 * How a file is split.
 * - cuts: at places chosen between pages
 * - ranges: one part for each range that is typed
 * - oddeven: odd pages in one file, even pages in another
 * - extract: the selected pages as one file
 * - remove: everything but the selected pages as one file
 */
export type SplitMode = "cuts" | "ranges" | "oddeven" | "extract" | "remove"

/** More parts than this from one file is a slip, not a wish. */
export const MAX_PARTS = 5000

/**
 * Cuts in order, each once, and only where a cut can be: a cut is the number,
 * counted from 0, of the page it comes after, so the last page has none.
 */
export const tidyCuts = (cuts: Iterable<number>, count: number) =>
  [...new Set(cuts)]
    .filter((cut) => Number.isInteger(cut) && cut >= 0 && cut < count - 1)
    .sort((a, b) => a - b)

/** Put a cut after a page, or take away the one that is there. */
export function toggleCut(
  cuts: readonly number[],
  after: number,
  count: number
) {
  return tidyCuts(
    cuts.includes(after)
      ? cuts.filter((cut) => cut !== after)
      : [...cuts, after],
    count
  )
}

/** The parts a file falls into when it is cut. No cuts gives the whole file as one part. */
export function partsFromCuts(count: number, cuts: readonly number[]): Part[] {
  const parts: Part[] = []
  let start = 0
  for (const cut of [...tidyCuts(cuts, count), count - 1]) {
    if (cut < start) continue
    parts.push({
      pages: Array.from({ length: cut - start + 1 }, (_, at) => start + at),
    })
    start = cut + 1
  }
  return parts
}

/** A cut after every `every` pages. */
export function cutsEvery(count: number, every: number) {
  const step = Math.max(1, Math.floor(every) || 1)
  const cuts: number[] = []
  for (let cut = step - 1; cut < count - 1; cut += step) cuts.push(cut)
  return cuts
}

/**
 * Cuts that make `parts` parts as equal as can be: none is more than one
 * page longer than another, and the longer ones come first. A file cannot
 * have more parts than pages.
 */
export function cutsEqual(count: number, parts: number) {
  const wanted = Math.min(
    Math.max(1, Math.floor(parts) || 1),
    Math.max(count, 1)
  )
  const short = Math.floor(count / wanted)
  const longer = count % wanted
  const cuts: number[] = []
  let end = -1
  for (let part = 0; part < wanted - 1; part++) {
    end += short + (part < longer ? 1 : 0)
    cuts.push(end)
  }
  return cuts
}

export type Planned = { parts: Part[] } | { problem: string }

/**
 * One part for each range that is typed: "1-3, 4-10, 11-" gives three. A
 * plus sign joins ranges into one part, as in "1-3 + 7". Ranges may overlap
 * and repeat, and "5-1" counts down.
 */
export function partsFromRanges(text: string, count: number): Planned {
  const pieces = text
    .split(/[,;\n]/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  if (!pieces.length)
    return {
      problem: "Type the pages for each part, for example 1-3, 4-10, 11-.",
    }
  if (pieces.length > MAX_PARTS)
    return {
      problem: `That is more than ${MAX_PARTS.toLocaleString("en")} parts. Use fewer.`,
    }
  const parts: Part[] = []
  for (const piece of pieces) {
    // A plus at either end joins nothing.
    if (/^\+|\+$|\+\s*\+/.test(piece))
      return {
        problem: `"${piece}" has a plus sign with nothing to join. Write parts like 1-3 + 7.`,
      }
    const read = parseRanges(piece.replaceAll("+", ","), count)
    if ("problem" in read) return read
    parts.push({ pages: read.pages })
  }
  return { parts }
}

/** Odd pages as one part and even pages as another. A one-page file has only the first. */
export function oddEvenParts(count: number): Part[] {
  const every = Array.from({ length: count }, (_, index) => index)
  return [
    { pages: every.filter((page) => page % 2 === 0), label: "odd" },
    { pages: every.filter((page) => page % 2 === 1), label: "even" },
  ].filter((part) => part.pages.length)
}

/**
 * The selected pages as one part, in the order of the file, or everything
 * but them. Nothing selected, or nothing left, gives no part.
 */
export function selectionPart(
  selected: ReadonlySet<number>,
  count: number,
  how: "extract" | "remove"
): Part[] {
  const pages: number[] = []
  for (let page = 0; page < count; page++)
    if (selected.has(page) === (how === "extract")) pages.push(page)
  return pages.length ? [{ pages }] : []
}

/** Select a page, or let go of it. */
export function toggleSelected(selected: ReadonlySet<number>, page: number) {
  const next = new Set(selected)
  if (!next.delete(page)) next.add(page)
  return next
}

/** Add every page between two pages, both included, to a selection. */
export function selectSpan(
  selected: ReadonlySet<number>,
  from: number,
  to: number
) {
  const next = new Set(selected)
  for (let page = Math.min(from, to); page <= Math.max(from, to); page++)
    next.add(page)
  return next
}

/** A selection as it would be typed: "1-3, 7". */
export const selectionText = (selected: ReadonlySet<number>) =>
  formatRanges([...selected].sort((a, b) => a - b))

/** What a part holds, in words: "page 3", "pages 5-9", "pages 1, 3, 5-7". */
export function describePages(part: Part) {
  const text = formatRanges(part.pages)
  return `${part.pages.length === 1 ? "page" : "pages"} ${text}`
}

/**
 * For each page, the parts it is in, counted from 0. A page may be in
 * several when ranges overlap, and in none when it is left out.
 */
export function partsOfPages(parts: readonly Part[], count: number) {
  const found: number[][] = Array.from({ length: count }, () => [])
  parts.forEach((part, index) => {
    for (const page of part.pages)
      if (found[page] && !found[page].includes(index)) found[page].push(index)
  })
  return found
}

/**
 * A name for each part that stays with it while the plan changes, so a name
 * typed for a part, or a part left out, is remembered. A part made by cuts is
 * known by its first page; any other by its place in the list.
 */
export const partKeys = (mode: SplitMode, parts: readonly Part[]) =>
  parts.map((part, index) =>
    mode === "cuts" ? `p${part.pages[0]}` : `n${index}`
  )

/** Why a plan cannot be carried out as it stands; null when it can. */
export function planProblem(
  mode: SplitMode,
  parts: readonly Part[],
  count: number
) {
  if (mode === "extract" && !parts.length)
    return "Select the pages to take out."
  if (mode === "remove") {
    if (!parts.length) return "That removes every page. Keep at least one."
    if (parts[0].pages.length === count) return "Select the pages to remove."
  }
  if (mode === "cuts" && parts.length < 2)
    return count < 2
      ? "A file with one page cannot be cut."
      : "Cut the file somewhere first: press between two pages, or use a rule."
  if (mode === "oddeven" && parts.length < 2)
    return "A file with one page has no even pages."
  return null
}
