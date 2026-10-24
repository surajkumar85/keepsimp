/**
 * Keeping the source and the preview in step. Every block of the preview
 * says the line of the source it starts on (`data-source-line`); a place
 * between two blocks is found by going the same share of the way between
 * them on both sides.
 */

/** A block of the preview: the source line it starts on and how far down the preview it is, in pixels. */
export interface Anchor {
  line: number
  top: number
}

/** The anchors in order down the source, one for each line, going only downwards. */
export function ordered(anchors: Anchor[]): Anchor[] {
  const sorted = [...anchors].sort((a, b) => a.line - b.line || a.top - b.top)
  const out: Anchor[] = []
  for (const anchor of sorted) {
    const last = out[out.length - 1]
    // A nested block on the same line, or one drawn above an earlier line, adds nothing.
    if (last && (anchor.line === last.line || anchor.top < last.top)) continue
    out.push(anchor)
  }
  return out
}

/** How far down the preview a line of the source (a fraction past its start allowed) is drawn. */
export function topForLine(anchors: Anchor[], line: number, end: Anchor) {
  const list = [{ line: 0, top: 0 }, ...anchors, end]
  for (let index = list.length - 1; index > 0; index--) {
    const before = list[index - 1]
    const after = list[index]
    if (line >= before.line) {
      if (line >= after.line) return after.top
      const share = (line - before.line) / (after.line - before.line)
      return before.top + share * (after.top - before.top)
    }
  }
  return 0
}

/** Which line of the source (with a fraction) is drawn at a height of the preview. */
export function lineForTop(anchors: Anchor[], top: number, end: Anchor) {
  const list = [{ line: 0, top: 0 }, ...anchors, end]
  for (let index = list.length - 1; index > 0; index--) {
    const before = list[index - 1]
    const after = list[index]
    if (top >= before.top) {
      if (top >= after.top || after.top === before.top) return after.line
      const share = (top - before.top) / (after.top - before.top)
      return before.line + share * (after.line - before.line)
    }
  }
  return 0
}
