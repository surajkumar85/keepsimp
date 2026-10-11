import type { Size } from "@/lib/image-compressor/geometry"
import { quadBox, type TextLine } from "@/lib/pdf-reader/text"
import type { Part } from "./parts"

/** Part of a page, as shares of its width and height from its top left corner. */
export interface Area {
  left: number
  top: number
  right: number
  bottom: number
}

/** An area with its sides in order and inside the page; null when nothing is left of it. */
export function tidyArea(area: Area): Area | null {
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  const left = clamp(Math.min(area.left, area.right))
  const right = clamp(Math.max(area.left, area.right))
  const top = clamp(Math.min(area.top, area.bottom))
  const bottom = clamp(Math.max(area.top, area.bottom))
  return right - left >= 0.01 && bottom - top >= 0.01
    ? { left, top, right, bottom }
    : null
}

/** Text with runs of space made one, and none at the ends. */
export const tidyText = (text: string) => text.replace(/\s+/g, " ").trim()

/** Longer than this, text found in an area is cut: it is a label, not a paragraph. */
export const MAX_LABEL = 80

/**
 * The text of the lines that lie in an area of a page: those whose middle is
 * inside it, in reading order.
 */
export function textInArea(lines: readonly TextLine[], size: Size, area: Area) {
  return tidyText(
    lines
      .filter((line) => {
        const box = quadBox(line.quad)
        const x = (box.left + box.width / 2) / Math.max(size.width, 1)
        const y = (box.top + box.height / 2) / Math.max(size.height, 1)
        return (
          x >= area.left && x <= area.right && y >= area.top && y <= area.bottom
        )
      })
      .map((line) => line.text)
      .join(" ")
  ).slice(0, MAX_LABEL)
}

/**
 * A new part wherever the text found on a page differs from the text found
 * on the page before. A page with no text there stays with the part before
 * it. Each part is labelled with its text.
 */
export function partsFromTexts(texts: readonly string[]): Part[] {
  const parts: Part[] = []
  /** The text of the part being filled; empty until some is found. */
  let shown = ""
  for (const [page, raw] of texts.entries()) {
    const text = tidyText(raw)
    const last = parts[parts.length - 1]
    if (!last) parts.push({ pages: [page], label: text })
    else if (text && text !== shown) {
      // Pages before any text is found take the first text that is.
      if (shown) parts.push({ pages: [page], label: text })
      else {
        last.label = text
        last.pages.push(page)
      }
    } else last.pages.push(page)
    shown = text || shown
  }
  return parts
}

/**
 * A new part at each page that holds the words searched for. Pages before
 * the first such page become a part of their own, or join the first part.
 */
export function partsFromStarts(
  starts: readonly number[],
  count: number,
  front: "own" | "join"
): Part[] {
  const sorted = [...new Set(starts)]
    .filter((page) => page >= 0 && page < count)
    .sort((a, b) => a - b)
  if (!sorted.length) return []
  const parts: Part[] = sorted.map((start, index) => {
    const end = index + 1 < sorted.length ? sorted[index + 1] : count
    return { pages: Array.from({ length: end - start }, (_, at) => start + at) }
  })
  const before = Array.from({ length: sorted[0] }, (_, at) => at)
  if (!before.length) return parts
  if (front === "join") {
    parts[0] = { pages: [...before, ...parts[0].pages] }
    return parts
  }
  return [{ pages: before }, ...parts]
}
