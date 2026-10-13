/**
 * Writing changes after a file instead of writing the file anew. A digital
 * signature covers the bytes of the file as it was signed; a file that is
 * written anew has other bytes, and the signature no longer holds. Written
 * after it, the signed part is still there byte for byte, and the signature
 * still covers what it covered.
 *
 * The engine can write a file this way once for each time it opens one, so
 * the working copy is never written so. The steps in force are made again
 * on a fresh copy of the file as it came (`madeAgain`), and that copy is
 * written, once, and let go.
 *
 * Nothing is made part of a page here: what was added stays as the stamps
 * and comments it is, and fields stay fields. Programs that check a
 * signature also say what was changed after it, and filling in a form and
 * commenting are the changes they expect.
 */
import type * as MuPDF from "mupdf"
import { open } from "@/lib/pdf-compressor/mupdf-compress"
import { commentsOn } from "./mupdf-comments"
import {
  bufferBytes,
  commentPages,
  formOf,
  madeAgain,
  objectsOn,
  type EditSession,
  type ExportReport,
  documentChanged,
  linksChanged,
  waitingMarks,
  pagesChanged,
  picturesChanged,
} from "./mupdf-edit"
import { fieldsOn } from "./mupdf-forms"
import type { RedactChange } from "./redact"

type Engine = typeof MuPDF

/** Whether changes to this file can be written after it. A file that had to be repaired cannot. */
export const canWriteAfter = (session: EditSession) =>
  session.doc.canBeSavedIncrementally()

/** What a session's pages hold, to tell two sessions apart by. */
const held = (session: EditSession) =>
  JSON.stringify(
    Array.from({ length: session.doc.countPages() }, (_, page) => [
      objectsOn(session, page),
      commentsOn(session, page),
      fieldsOn(session, page),
    ])
  )

/** Whether one run of bytes begins with another. */
function beginsWith(bytes: Uint8Array, start: Uint8Array) {
  if (bytes.length < start.length) return false
  for (let at = 0; at < start.length; at++)
    if (bytes[at] !== start[at]) return false
  return true
}

/**
 * The file as it came with the changes written after it, so that a
 * signature in it stays valid.
 * @throws When the file cannot be written this way, or the fresh copy does
 * not come to hold what the working copy holds.
 */
export async function exportAfter(
  mupdf: Engine,
  session: EditSession,
  options: { checkpoint?: () => Promise<void> } = {}
): Promise<{ bytes: Uint8Array; report: ExportReport }> {
  // What was taken out for good would still be in the part that is signed.
  if (
    session.steps
      .slice(0, session.position)
      .some(
        (step) =>
          step.done.kind === "redact" &&
          (step.done.change as RedactChange).ops.some((op) => op.do === "apply")
      )
  )
    throw new Error(
      "What you took out for good would still be in the signed part of the file. Choose to write the file anew: its signature will no longer hold."
    )
  if (!canWriteAfter(session))
    throw new Error(
      "This file cannot be added to as it is. Download it written anew instead."
    )
  const { position } = session
  const fresh = madeAgain(session)
  try {
    await options.checkpoint?.()
    // Nothing is written unless the copy holds what the working copy holds.
    if (held(fresh) !== held(session))
      throw new Error(
        "The changes could not be written after the file. Download it written anew instead."
      )
    const things = Array.from(
      { length: fresh.doc.countPages() },
      (_, page) => objectsOn(fresh, page).length
    ).reduce((sum, count) => sum + count, 0)
    const comments = commentPages(fresh.doc).count
    const form = formOf(fresh.doc)
    const bytes = bufferBytes(fresh.doc.saveToBuffer("incremental"))
    await options.checkpoint?.()

    // Read from the written file, not from the copy it was written from.
    const written = open(mupdf, bytes, session.password)
    let same = 0
    let left = 0
    let has = 0
    try {
      const now = formOf(written).values
      left = now.size
      for (const [name, value] of form.values)
        if (now.get(name) === value) same++
      has = commentPages(written).count
    } finally {
      written.destroy()
    }
    session.saved = position
    return {
      bytes,
      report: {
        ...(session.steps
          .slice(0, position)
          .some((step) => step.done.kind === "make-fields")
          ? {
              formEdits: session.steps
                .slice(0, position)
                .filter((step) => step.done.kind === "make-fields").length,
            }
          : null),
        added: things,
        editable: true,
        text: { boxes: 0, found: 0 },
        untouched: { checked: 0, differ: [] },
        fontsCut: false,
        locked: false,
        comments: { had: comments, how: "keep", has },
        retext: {
          steps: session.steps
            .slice(0, position)
            .filter((step) => step.done.kind === "text").length,
          lines: 0,
          found: 0,
        },
        pictures: picturesChanged(session.steps.slice(0, position)),
        links: linksChanged(session.steps.slice(0, position)),
        pages: pagesChanged(session.steps.slice(0, position)),
        document: documentChanged(session.steps.slice(0, position)),
        redaction: {
          places: 0,
          pages: 0,
          residue: 0,
          notes: 0,
          fields: 0,
          waiting: waitingMarks(fresh.doc),
        },
        fields: { had: form.values.size, how: "keep", same, left },
        signature: { intact: beginsWith(bytes, session.original) },
      },
    }
  } finally {
    fresh.doc.destroy()
  }
}
