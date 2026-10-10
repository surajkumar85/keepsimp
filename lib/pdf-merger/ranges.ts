/** More pages than this from one range field is a slip of the keyboard, not a wish. */
export const MAX_RANGE_PAGES = 20_000

export type Ranges = { pages: number[] } | { problem: string }

const outside = (count: number) =>
  count === 1
    ? "This file has 1 page."
    : `This file has ${count.toLocaleString("en")} pages, so use numbers from 1 to ${count.toLocaleString("en")}.`

/**
 * The pages chosen by text such as "1-3, 7, 10-" in a file with `count` pages.
 * Numbers start at 1 in the text and at 0 in the result. Empty text means
 * every page. Pages come out in the order written, and may repeat; "5-1"
 * counts down.
 */
export function parseRanges(text: string, count: number): Ranges {
  const every = Array.from({ length: count }, (_, index) => index)
  // People paste en and em dashes and the minus sign for a hyphen.
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[‒-―−]/g, "-")
  if (!cleaned || cleaned === "all") return { pages: every }
  const pages: number[] = []
  for (const part of cleaned.split(/[,;]/).map((piece) => piece.trim())) {
    if (!part) continue
    if (part === "odd" || part === "even") {
      const first = part === "odd" ? 0 : 1
      pages.push(...every.filter((index) => index % 2 === first))
    } else {
      const match = /^(\d*)\s*(-?)\s*(\d*)$/.exec(part)
      // "12 3" has two numbers and no hyphen; "-" has no number at all.
      if (!match || (!match[1] && !match[3]) || (!match[2] && match[3]))
        return {
          problem: `"${part}" is not a page or a range. Write pages like 1-3, 7, 10-.`,
        }
      const first = match[1] ? Number(match[1]) : 1
      const last = match[2] ? (match[3] ? Number(match[3]) : count) : first
      if (first < 1 || last < 1 || first > count || last > count)
        return { problem: outside(count) }
      const step = first <= last ? 1 : -1
      for (let page = first; page !== last + step; page += step)
        pages.push(page - 1)
    }
    if (pages.length > MAX_RANGE_PAGES)
      return {
        problem: `That repeats pages more than ${MAX_RANGE_PAGES.toLocaleString("en")} times. Use fewer.`,
      }
  }
  // "even" in a one-page file, or only commas.
  if (!pages.length) return { problem: "That leaves no pages from this file." }
  return { pages }
}

/** Pages as short text, the way they would be typed: [0, 1, 2, 6] is "1-3, 7". */
export function formatRanges(pages: readonly number[]) {
  const parts: string[] = []
  let start = 0
  while (start < pages.length) {
    let end = start
    const step = pages[start + 1] - pages[start]
    if (step === 1 || step === -1)
      while (pages[end + 1] - pages[end] === step) end++
    parts.push(
      end > start
        ? `${pages[start] + 1}-${pages[end] + 1}`
        : String(pages[start] + 1)
    )
    start = end + 1
  }
  return parts.join(", ")
}
