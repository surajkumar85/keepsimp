/**
 * What the page says about a file that was written out: its name, and what
 * the check found when the result was read back.
 */
import type { ExportReport } from "./mupdf-edit"

/** The name the result is saved under: the file's own, marked as edited. */
export function editedName(name: string) {
  const stem = name.replace(/\.pdf$/i, "").trim() || "document"
  return `${stem}-edited.pdf`
}

/** One thing the check found. `good` is false for what should be looked at before the file is relied on. */
export interface CheckLine {
  text: string
  good: boolean
}

/** Page numbers from 1 as a short list: the first few, and how many more. */
function pageList(pages: readonly number[], most = 5) {
  const shown = pages.slice(0, most).map((page) => page + 1)
  const rest = pages.length - shown.length
  return `${pages.length === 1 ? "Page" : "Pages"} ${shown.join(", ")}${rest > 0 ? ` and ${rest.toLocaleString("en")} more` : ""}`
}

/** What the check found, a line for each thing that was looked at. */
export function checkLines(report: ExportReport): CheckLine[] {
  const lines: CheckLine[] = []
  if (report.added === 0 && report.comments.had === 0)
    lines.push({
      text: "Nothing was added. The file was written again as it is.",
      good: true,
    })
  // What became of what was added is always said, so that a download never
  // comes without a word about it.
  if (report.added > 0) {
    const many = report.added !== 1
    const things = `${report.added.toLocaleString("en")} thing${many ? "s" : ""} you added`
    lines.push({
      text: report.editable
        ? `${things} ${many ? "are" : "is"} kept as ${many ? "things" : "a thing"} that can be moved again.`
        : `${things} ${many ? "are" : "is"} part of ${many ? "their pages" : "its page"} now.`,
      good: true,
    })
  }
  const { boxes, found } = report.text
  // Text boxes, call-outs, stamps and what measuring lines say.
  const textBoxes = `${boxes.toLocaleString("en")} piece${boxes === 1 ? "" : "s"} of text`
  if (boxes > 0)
    lines.push(
      found === boxes
        ? {
            text:
              boxes === 1
                ? "The text you added was read back from the result."
                : `All ${textBoxes} you added were read back from the result.`,
            good: true,
          }
        : {
            text: `${(boxes - found).toLocaleString("en")} of ${textBoxes} could not be read back from the result. Read the result before you rely on it.`,
            good: false,
          }
    )
  const { checked, differ } = report.untouched
  if (differ.length)
    lines.push({
      text: `${pageList(differ)} ${differ.length === 1 ? "looks" : "look"} different from the original although nothing was added there. Read the result before you rely on it.`,
      good: false,
    })
  else if (checked > 0)
    lines.push({
      text:
        checked === 1
          ? "A page you did not change was compared with the original and looks the same."
          : `${checked.toLocaleString("en")} pages you did not change were compared with the original and look the same.`,
      good: true,
    })
  if (boxes > 0 && report.fontsCut)
    lines.push({
      text: "The fonts of your text are in the file, cut down to the letters used.",
      good: true,
    })
  const { had, how, has } = report.comments
  const comments = (count: number) =>
    `${count.toLocaleString("en")} comment${count === 1 ? "" : "s"}`
  if (had > 0) {
    // Kept, every one has to be there; made part of the page or left out, none may be.
    const left = how === "keep" ? had - has : has
    if (left > 0)
      lines.push({
        text:
          how === "keep"
            ? `${left.toLocaleString("en")} of ${comments(had)} did not reach the result. Read the result before you rely on it.`
            : `${comments(left)} could not be ${how === "flatten" ? "made part of the page" : "left out"} and ${left === 1 ? "is" : "are"} still in the result as ${left === 1 ? "a comment" : "comments"}.`,
        good: false,
      })
    else
      lines.push({
        text:
          how === "keep"
            ? `${comments(had)} ${had === 1 ? "is" : "are"} in the file, where other programs show ${had === 1 ? "it" : "them"} too.`
            : how === "flatten"
              ? `${comments(had)} ${had === 1 ? "was" : "were"} made part of the page.`
              : `${comments(had)} ${had === 1 ? "was" : "were"} left out.`,
        good: true,
      })
  }
  if (report.locked)
    lines.push({ text: "Locked with your password.", good: true })
  return lines
}
