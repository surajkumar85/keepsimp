/**
 * Which pages to draw before and after, and what the comparison says. Every
 * page with a changed picture is looked at when there are few; a spread of
 * them when there are many. A few pages where nothing was meant to change
 * are looked at too, while there is room.
 */

/**
 * Pages checked though nothing on them was meant to change: enough to catch
 * a fault in the tidying itself.
 */
const SPOT_CHECKS = 3

/** `count` numbers spread evenly from `list`, ends included. */
function spread(list: readonly number[], count: number) {
  if (count <= 0) return []
  if (list.length <= count) return [...list]
  if (count === 1) return [list[0]]
  const picked = new Set<number>()
  for (let step = 0; step < count; step++)
    picked.add(list[Math.round((step * (list.length - 1)) / (count - 1))])
  return [...picked]
}

/**
 * The pages to compare, counted from 0, in order.
 * @param changed Pages that show a picture that was changed.
 * @param total How many pages the file has.
 * @param budget The most pages to draw.
 */
export function pagesToCheck(
  changed: readonly number[],
  total: number,
  budget: number
) {
  const pages = [...new Set(changed)]
    .filter((page) => page >= 0 && page < total)
    .sort((a, b) => a - b)
  const room = Math.max(1, budget)
  const picked = spread(pages, room)
  // Where there is room, a few of the other pages are looked at as well.
  const changes = new Set(pages)
  const others: number[] = []
  for (let page = 0; page < total; page++)
    if (!changes.has(page)) others.push(page)
  const spots = spread(others, Math.min(SPOT_CHECKS, room - picked.length))
  return [...picked, ...spots].sort((a, b) => a - b)
}

export interface PageScore {
  /** Counted from 0. */
  page: number
  /** 1 for identical. */
  score: number
}

export interface CheckResult {
  /** How many pages were compared. */
  checked: number
  /** How many pages show a changed picture. */
  changed: number
  /** Pages that look less alike than the level allows, least alike first. */
  low: PageScore[]
}

/**
 * @param mark How alike a page must look before and after: one number for
 *   every page, or a rule that gives each page's own.
 */
export function checkResult(
  scores: readonly PageScore[],
  changed: number,
  mark: number | ((page: number) => number)
): CheckResult {
  const markOf = typeof mark === "number" ? () => mark : mark
  return {
    checked: scores.length,
    changed,
    low: scores
      .filter((entry) => entry.score < markOf(entry.page))
      .sort((a, b) => a.score - b.score || a.page - b.page),
  }
}
