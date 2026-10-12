// @vitest-environment node
/**
 * Drafts with the real engine: the steps of a session, kept as text and
 * read back, make a fresh copy of the file what the session's copy was.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { installNodeCodecShims } from "@/tests/node-codecs"
import { makeFormPdf } from "@/tests/pdf-fixtures"
import { pngOf, readPictures, scene } from "@/tests/pdf-pictures"
import { danglingRefs, readPdf } from "@/tests/pdf-reader"
import { fontsOf, picturesOf, readDraft } from "./draft"
import { fontUrls } from "./fonts"
import { applyComments, commentsOn, lettersOn } from "./mupdf-comments"
import {
  addFont,
  addPicture,
  applyChange,
  exportEdited,
  historyOf,
  objectsOn,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyFields, fieldsOn } from "./mupdf-forms"
import { BLACK, type EditorObject } from "./objects"

installNodeCodecShims()

const words: EditorObject = {
  id: "t1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 240, y: 300, width: 120, height: 20 },
  text: "Kept overnight",
  lines: ["Kept overnight"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const photo: EditorObject = {
  id: "p1",
  kind: "picture",
  picture: "photo",
  rotation: 0,
  opacity: 1,
  box: { x: 240, y: 340, width: 60, height: 40 },
}
const add = (session: EditSession, object: EditorObject) =>
  applyChange(mupdf, session, {
    label: "Add",
    ops: [{ do: "add", page: 0, object }],
  })

/** What a draft needs handed over before it is taken up. */
async function give(session: EditSession, fonts: string[], pictures: string[]) {
  for (const key of fonts)
    addFont(
      mupdf,
      session,
      key,
      new Uint8Array(readFileSync(`public${fontUrls[key]}`))
    )
  for (const name of pictures)
    addPicture(mupdf, session, name, await pngOf(scene(30, 20, 4)))
}

const held = (session: EditSession) => [
  objectsOn(session, 0),
  commentsOn(session, 0),
  fieldsOn(session, 0),
  fieldsOn(session, 1),
]

describe("a draft", () => {
  it("makes a fresh copy of the file what the session's copy was, undo list and all", async () => {
    const bytes = await makeFormPdf()
    const session = startEditing(mupdf, bytes)
    await give(session, ["sans"], ["photo"])
    const name = fieldsOn(session, 0).find(
      (field) => field.name === "applicant.full_name"
    )!
    applyFields(mupdf, session, {
      label: "Fill in Your full name",
      ops: [{ do: "fill", page: 0, id: name.id, value: "Ada Lovelace" }],
    })
    add(session, words)
    add(session, photo)
    const [line] = lettersOn(session, 0)
    const first = line.quads[0]
    const last = line.quads.at(-1)!
    applyComments(mupdf, session, {
      label: "Highlight",
      ops: [
        {
          do: "mark",
          page: 0,
          kind: "highlight",
          quads: [
            [
              first[0],
              first[1],
              last[2],
              last[3],
              first[4],
              first[5],
              last[6],
              last[7],
            ],
          ],
          colour: [1, 0.86, 0.2],
          author: "Ada",
          when: 1,
        } as never,
      ],
    })
    // The last step is undone, and still there to be made again.
    stepBack(session)

    // Kept as text, as storage keeps it, and read back with every check.
    const kept = JSON.parse(
      JSON.stringify({
        name: "form.pdf",
        size: bytes.length,
        when: 5,
        steps: session.steps,
        position: session.position,
      })
    )
    const draft = readDraft(kept)!
    expect(draft.steps).toHaveLength(4)
    expect(draft.position).toBe(3)
    expect(fontsOf(draft.steps)).toEqual(["sans"])
    expect(picturesOf(draft.steps)).toEqual(["photo"])

    const again = startEditing(mupdf, bytes)
    await give(again, fontsOf(draft.steps), picturesOf(draft.steps))
    takeUp(again, draft.steps, draft.position)
    expect(held(again)).toEqual(held(session))
    expect(historyOf(again)).toEqual(historyOf(session))
    // What was undone when the draft was kept can still be made again.
    expect(stepForward(again)).toEqual([0])
    expect(commentsOn(again, 0)).toHaveLength(1)
    expect(stepBack(again)).toEqual([0])

    const { bytes: result } = await exportEdited(mupdf, again)
    expect(await danglingRefs(result)).toEqual([])
    const [page] = (await readPdf(result)).pages
    expect(page.text).toContain("Kept overnight")
    expect(page.fields).toContain("applicant.full_name=Ada Lovelace")
    expect(await readPictures(result)).toHaveLength(1)
    stopEditing(session)
    stopEditing(again)
  })

  it("is not taken up when a step cannot be made again, and the file stays as it came", async () => {
    const bytes = await makeFormPdf()
    const session = startEditing(mupdf, bytes)
    await give(session, ["sans"], [])
    add(session, words)
    const { steps } = readDraft({
      name: "form.pdf",
      size: bytes.length,
      when: 5,
      steps: JSON.parse(JSON.stringify(session.steps)),
      position: 1,
    })!
    // The font the step is written in was not handed over.
    const bare = startEditing(mupdf, bytes)
    expect(() => takeUp(bare, steps, 1)).toThrow("has not been loaded")
    expect(historyOf(bare)).toEqual({ steps: [], position: 0, saved: null })
    expect(objectsOn(bare, 0)).toEqual([])
    // And it works once the font is there.
    await give(bare, ["sans"], [])
    takeUp(bare, steps, 1)
    expect(objectsOn(bare, 0)).toHaveLength(1)
    // A file that has been changed takes no draft up.
    expect(() => takeUp(session, steps, 1)).toThrow("has been changed")
    stopEditing(session)
    stopEditing(bare)
  })
})
