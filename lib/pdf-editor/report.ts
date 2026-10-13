/**
 * What the page says about a file that was written out: its name, and what
 * the check found when the result was read back.
 */
import type { ExportReport } from "./mupdf-edit"
import { pagesNamed } from "./pages"

/** The name the result is saved under: the file's own, marked as edited. */
export function editedName(name: string) {
  const stem = name.replace(/\.pdf$/i, "").trim() || "document"
  return `${stem}-edited.pdf`
}

/** The name some pages of a file are saved under as a file of their own: "plan-page-3.pdf", "plan-pages-2-to-4.pdf", "plan-3-pages.pdf". */
export function partName(name: string, pages: readonly number[]) {
  const stem = name.replace(/\.pdf$/i, "").trim() || "document"
  return `${stem}-${pagesNamed(pages).replace(/ /g, "-")}.pdf`
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
  // Some pages as a file of their own: that this is not the whole is said first.
  if (report.part)
    lines.push({
      text: `Only ${report.part.toLocaleString("en")} page${report.part === 1 ? " was" : "s were"} written, as a file of ${report.part === 1 ? "its" : "their"} own. The file in the editor is as it was, with everything that is not yet downloaded.`,
      good: true,
    })
  // A signed file whose changes were written after it: that is said first.
  if (report.signature)
    lines.push(
      report.signature.intact
        ? {
            text: "The signed part of the file is untouched, so its signature still holds. What you changed was written after it.",
            good: true,
          }
        : {
            text: "The signed part of the file is not what it was. Its signature will not hold; read the result before you rely on it.",
            good: false,
          }
    )
  if (
    report.added === 0 &&
    report.comments.had === 0 &&
    report.fields.had === 0 &&
    report.retext.steps === 0 &&
    report.pictures.steps === 0 &&
    report.links === 0 &&
    report.pages.steps === 0
  )
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
  const { steps, lines: written, found: reread } = report.retext
  if (steps > 0) {
    const places = `${steps.toLocaleString("en")} place${steps === 1 ? "" : "s"}`
    lines.push(
      reread < written
        ? {
            text: `${(written - reread).toLocaleString("en")} of the ${written.toLocaleString("en")} line${written === 1 ? "" : "s"} you changed could not be read back from the result. Read the result before you rely on it.`,
            good: false,
          }
        : report.signature
          ? {
              // Written after a signed file, the file as it came is all still there.
              text: `The page's own text was changed in ${places}. The words as they were are still in the signed part of the file, where a program can find them. To be rid of them, download the file written anew.`,
              good: true,
            }
          : {
              text:
                written === 0
                  ? `The page's own text was changed in ${places}. What you took out is no longer in the file.`
                  : `The page's own text was changed in ${places}. The old words are no longer in the file, and ${written === 1 ? "the line you wrote was" : `all ${written.toLocaleString("en")} lines you wrote were`} read back from the result.`,
              good: true,
            }
    )
  }
  if (report.pages.steps > 0) {
    const { steps: times, taken, lost } = report.pages
    const count = (number: number, one: string, many = `${one}s`) =>
      `${number.toLocaleString("en")} ${number === 1 ? one : many}`
    lines.push({
      text: `The pages were put in order, turned, copied, added or taken out in ${count(times, "step")}.`,
      good: true,
    })
    if (report.pages.added > 0) {
      const { added } = report.pages
      lines.push({
        text: `${count(added, "page")} came from another file, as ${added === 1 ? "it looks" : "they look"}: a form's fields on ${added === 1 ? "it" : "them"} are part of the page now, and that file's bookmarks were not brought along.`,
        good: true,
      })
    }
    if (report.pages.cut)
      lines.push({
        text: "Cropping hides what is outside the frame. It is still in the file, and a program can show it again.",
        good: true,
      })
    if (taken > 0) {
      // What led to a page that is gone, and what was on it, went with it.
      const went = [
        lost.links ? count(lost.links, "link") : "",
        lost.bookmarks ? count(lost.bookmarks, "bookmark") : "",
        lost.fields ? count(lost.fields, "form field") : "",
      ].filter(Boolean)
      const them = taken === 1 ? "it" : "them"
      const too = went.length
        ? ` What led to ${them} or was on ${them} went too: ${went.join(", ")}.`
        : ""
      lines.push({
        text: report.signature
          ? `${count(taken, "page")} you took out ${taken === 1 ? "is" : "are"} still in the signed part of the file, where a program can find ${them}. To be rid of ${them}, download the file written anew.${too}`
          : `${count(taken, "page")} you took out ${taken === 1 ? "is" : "are"} no longer in the file.${too}`,
        good: true,
      })
    }
  }
  if (report.pictures.steps > 0) {
    const { steps: times, cut } = report.pictures
    lines.push({
      text: `Pictures the page${times === 1 ? "" : "s"} already had were changed in ${times.toLocaleString("en")} place${times === 1 ? "" : "s"}.${cut ? " A picture that was cut to a part is whole in the file: the rest of it is hidden, not removed." : ""}`,
      good: true,
    })
  }
  if (report.links > 0)
    lines.push({
      text: `Links were added, changed or taken away in ${report.links.toLocaleString("en")} place${report.links === 1 ? "" : "s"}. Where a link leads is not checked: try each one in the result.`,
      good: true,
    })
  const form = report.fields
  const fields = (count: number) =>
    `${count.toLocaleString("en")} field${count === 1 ? "" : "s"}`
  if (form.had > 0) {
    // Kept, each has to hold what it held; drawn in, none may still be a field.
    const wrong = form.how === "keep" ? form.had - form.same : form.left
    const one = form.had === 1
    lines.push(
      wrong > 0
        ? {
            text:
              form.how === "keep"
                ? `${wrong.toLocaleString("en")} of the form's ${fields(form.had)} ${wrong === 1 ? "does" : "do"} not hold in the result what ${wrong === 1 ? "it holds" : "they hold"} here. Read the result before you rely on it.`
                : `${fields(wrong)} could not be made part of the page and ${wrong === 1 ? "is" : "are"} still in the result as ${wrong === 1 ? "a field" : "fields"}.`,
            good: false,
          }
        : {
            text:
              form.how === "keep"
                ? `The form's ${fields(form.had)} ${one ? "was" : "were"} read back from the result with what ${one ? "it holds" : "they hold"}, and can still be filled in.`
                : `The form's ${fields(form.had)} ${one ? "is" : "are"} part of the page now and can no longer be changed.`,
            good: true,
          }
    )
  }
  if (report.locked)
    lines.push({ text: "Locked with your password.", good: true })
  return lines
}
