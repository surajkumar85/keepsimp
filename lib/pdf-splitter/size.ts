/** Sizes a limit can be typed in. */
export type SizeUnit = "KB" | "MB"

/** Sizes are counted in steps of 1,024, as the rest of the site shows them. */
export const UNIT_BYTES: Record<SizeUnit, number> = {
  KB: 1024,
  MB: 1024 * 1024,
}

/** The smallest limit worth asking for, 10 KB: below it, hardly any page fits. */
export const MIN_LIMIT = 10 * 1024

/** A limit as typed, in bytes; null when it is not a size that can be used. */
export function limitBytes(text: string, unit: SizeUnit) {
  if (!/^\s*\d+([.,]\d+)?\s*$/.test(text)) return null
  const bytes = Math.round(
    Number(text.trim().replace(",", ".")) * UNIT_BYTES[unit]
  )
  return bytes >= MIN_LIMIT ? bytes : null
}

export interface SizedPart {
  /** The first page, counted from 0, and how many pages follow on from it. */
  start: number
  length: number
  bytes: number
  /** A single page that is larger than the limit by itself. */
  over: boolean
}

/**
 * Cut a file into runs of pages that each stay under a size, as few as can
 * be, by measuring. `measure` writes the run that starts at a page and gives
 * its size; `accept` is told each part once it is settled, with the last
 * measurement that fitted, so the part need not be written again.
 *
 * Sizes are found by trying: first one page, then as many as the size so far
 * suggests, then by halving between the longest run known to fit and the
 * shortest known not to. A single page over the limit becomes a part by
 * itself and is marked.
 */
export async function partsBySize(
  count: number,
  limit: number,
  measure: (start: number, length: number) => Promise<number>,
  accept: (part: SizedPart) => Promise<void> | void = () => {}
): Promise<SizedPart[]> {
  const parts: SizedPart[] = []
  let start = 0
  while (start < count) {
    const left = count - start
    let fits = 1
    let bytes = await measure(start, 1)
    let over = bytes > limit
    if (!over) {
      /** The shortest run known not to fit; one more than is left when none is known. */
      let tooLong = left + 1
      while (fits + 1 < tooLong) {
        // What fits so far says roughly how many pages a part can hold.
        const guess = Math.floor((fits * limit) / Math.max(bytes, 1))
        const next =
          tooLong > left
            ? Math.min(left, Math.max(fits + 1, guess))
            : Math.floor((fits + tooLong) / 2)
        const size = await measure(start, next)
        if (size <= limit) {
          fits = next
          bytes = size
        } else tooLong = next
      }
    }
    const part = { start, length: fits, bytes, over }
    parts.push(part)
    await accept(part)
    start += fits
    over = false
  }
  return parts
}
