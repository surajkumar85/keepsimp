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
  if (report.added === 0)
    lines.push({
      text: "Nothing was added. The file was written again as it is.",
      good: true,
    })
  const { boxes, found } = report.text
  const textBoxes = `${boxes.toLocaleString("en")} text box${boxes === 1 ? "" : "es"}`
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
  if (report.locked)
    lines.push({ text: "Locked with your password.", good: true })
  return lines
}
