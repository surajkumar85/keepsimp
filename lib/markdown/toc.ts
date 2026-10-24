/**
 * A table of contents written into the document between two comments,
 * `<!-- toc -->` and `<!-- tocstop -->` (the markers markdown-toc and the
 * VS Code extensions use), so it can be written again when the headings
 * change. Its links use GitHub's anchors.
 */
import type { Edit, Range } from "./edits"
import type { Heading } from "./render"

export const TOC_START = "<!-- toc -->"
export const TOC_END = "<!-- tocstop -->"

/** The contents as a nested list, from the second level down (the first is the title), deepest third. */
export function tocFor(headings: Heading[], top = 2, deepest = 3) {
  const shown = headings.filter(
    (heading) => heading.level >= top && heading.level <= deepest
  )
  // A document whose headings all sit deeper than `top` starts from its shallowest.
  const base = Math.min(...shown.map((heading) => heading.level))
  return shown
    .map(
      (heading) =>
        `${"  ".repeat(heading.level - base)}- [${heading.text.replace(/[[\]]/g, "\\$&")}](#${heading.id})`
    )
    .join("\n")
}

/**
 * Writes the contents: in place of the ones already between the markers,
 * or at the cursor with the markers round them.
 */
export function insertToc(
  doc: string,
  range: Range,
  headings: Heading[]
): Edit {
  const list = tocFor(headings)
  const block = `${TOC_START}\n\n${list || "_No headings yet._"}\n\n${TOC_END}`
  const start = doc.indexOf(TOC_START)
  const end = start === -1 ? -1 : doc.indexOf(TOC_END, start)
  if (start !== -1 && end !== -1) {
    const to = end + TOC_END.length
    return {
      from: start,
      to,
      insert: block,
      anchor: start,
      head: start + block.length,
    }
  }
  const before = range.from === 0 || doc[range.from - 1] === "\n" ? "" : "\n\n"
  const insert = `${before}${block}\n`
  const at = range.from + insert.length
  return { from: range.from, to: range.to, insert, anchor: at, head: at }
}
