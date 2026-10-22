import { expect, test, type Page } from "@playwright/test"
import { makePlainPdf } from "@/tests/pdf-fixtures"
import { danglingRefs, readComments, readPdf } from "@/tests/pdf-reader"
import { hand, ran, ready, saved } from "./agent"

const give = async (page: Page, name: string, bytes: Uint8Array) =>
  hand(page, name, Buffer.from(bytes), "application/pdf")

const plain = () =>
  makePlainPdf([{ top: "Invoice total due", body: "Budget 2026" }])

/** The bytes of a file a tool made. */
const bytesOf = async (page: Page, done: { files?: { id: string }[] }) =>
  new Uint8Array((await saved(page, done.files![0].id)).bytes)
const words = async (bytes: Uint8Array) =>
  (await readPdf(bytes)).pages[0].text.replace(/\s+/g, " ")

test("draws what the editor's toolbar draws, into the page or kept editable", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "plain.pdf", await plain())
  const items = [
    { kind: "box", page: 1, x: 20, y: 20, width: 80, height: 40 },
    {
      kind: "ellipse",
      page: 1,
      x: 120,
      y: 20,
      width: 40,
      height: 40,
      fill: "#00ff00",
    },
    { kind: "arrow", page: 1, x: 20, y: 200, toX: 120, toY: 240 },
    {
      kind: "freehand",
      page: 1,
      x: 0,
      y: 0,
      strokes: [
        [
          { x: 30, y: 300 },
          { x: 60, y: 320 },
          { x: 90, y: 300 },
        ],
      ],
    },
    { kind: "stamp", page: 1, x: 140, y: 340, label: "Paid" },
    {
      kind: "callout",
      page: 1,
      x: 180,
      y: 150,
      toX: 150,
      toY: 120,
      text: "Look here",
    },
    { kind: "measure", page: 1, x: 20, y: 380, toX: 120, toY: 380, unit: "mm" },
    { kind: "text", page: 1, x: 20, y: 260, text: "Hello agent", size: 14 },
    {
      kind: "text",
      page: 1,
      x: 20,
      y: 280,
      text: "12345",
      boxes: 5,
      width: 100,
    },
    { kind: "tick", page: 1, x: 250, y: 30 },
  ]
  const drawn = await ran(page, "draw_on_pdf", { file: doc, items })
  expect(drawn.summary).toMatch(/^10 things added\. Checked: the words of /)
  const flat = await bytesOf(page, drawn)
  const text = await words(flat)
  for (const said of [
    "PAID",
    "Look here",
    "Hello agent",
    "35.3 mm",
    "Budget 2026",
  ])
    expect(text).toContain(said)
  // The row of boxes holds its five figures.
  expect(text.replace(/\s/g, "")).toContain("12345")
  // Drawn into the page: no annotations are left.
  expect((await readComments(flat))[0]).toEqual([])
  expect(await danglingRefs(flat)).toEqual([])

  // Kept editable, each is a separate thing other programs show as a stamp.
  const kept = await ran(page, "draw_on_pdf", {
    file: doc,
    items,
    keepEditable: true,
  })
  const keptBytes = await bytesOf(page, kept)
  expect((await readComments(keptBytes))[0]).toHaveLength(10)
  // Listed again, moved and taken away by their ids.
  const again = await give(page, "kept.pdf", keptBytes)
  const listed = await ran(page, "list_pdf_comments", { file: again })
  const things = (listed.data as { things: { id: string; kind: string }[] })
    .things
  expect(things).toHaveLength(10)
  const stamp = things.find((thing) => thing.kind === "stamp")!
  const removed = await ran(page, "draw_on_pdf", {
    file: again,
    remove: [stamp.id],
    move: [{ id: things[0].id, dx: 10, dy: 10 }],
    keepEditable: true,
  })
  expect(removed.summary).toMatch(/^1 thing moved, 1 thing removed\./)
  const after = await bytesOf(page, removed)
  expect((await readComments(after))[0]).toHaveLength(9)
  expect(await words(after)).not.toContain("PAID")

  // A cover hides and says so; the words stay in the file.
  const covered = await ran(page, "draw_on_pdf", {
    file: doc,
    items: [{ kind: "cover", page: 1, x: 30, y: 10, width: 200, height: 30 }],
  })
  expect(covered.summary).toMatch(/A cover only hides/)
  expect(await words(await bytesOf(page, covered))).toContain(
    "Invoice total due"
  )
})

test("comments as the annotator does: marks on words, notes, replies, changes, and flattening", async ({
  page,
}) => {
  await ready(page)
  const doc = await give(page, "plain.pdf", await plain())
  const marked = await ran(page, "comment_on_pdf", {
    file: doc,
    author: "Agent",
    changes: [
      { do: "highlight", words: "Budget" },
      {
        do: "underline",
        area: { page: 1, x: 25, y: 20, width: 110, height: 20 },
      },
      { do: "note", page: 1, x: 250, y: 40, text: "Check the total" },
      {
        do: "pen",
        page: 1,
        strokes: [
          [
            { x: 30, y: 350 },
            { x: 200, y: 350 },
          ],
        ],
      },
    ],
  })
  expect(marked.summary).toMatch(
    /^Highlight: 1 place of "Budget" on 1 page\. Underline: 1 place of that area on 1 page\. 1 note, 1 pen stroke\./
  )
  const bytes = await bytesOf(page, marked)
  const comments = (await readComments(bytes))[0]
  expect(comments.map((one) => one.kind).sort()).toEqual([
    "Highlight",
    "Ink",
    "Text",
    "Underline",
  ])
  expect(comments.every((one) => one.author === "Agent")).toBe(true)
  expect(comments.find((one) => one.kind === "Text")!.text).toBe(
    "Check the total"
  )

  // Read back with the words each mark lies on, then answered, changed and deleted by id.
  const again = await give(page, "commented.pdf", bytes)
  const listed = await ran(page, "list_pdf_comments", { file: again })
  const found = (
    listed.data as { comments: { id: string; kind: string; marks?: string }[] }
  ).comments
  const highlight = found.find((one) => one.kind === "highlight")!
  expect(highlight.marks).toBe("Budget")
  expect(found.find((one) => one.kind === "underline")!.marks).toMatch(
    /^Invoice/
  )
  const note = found.find((one) => one.kind === "note")!
  const changed = await ran(page, "comment_on_pdf", {
    file: again,
    author: "Agent",
    changes: [
      { do: "reply", id: note.id, text: "Checked." },
      { do: "edit", id: note.id, text: "Check the total again" },
      { do: "delete", id: highlight.id },
    ],
  })
  expect(changed.summary).toBe("1 reply, 1 change, 1 deleted comment.")
  const changedComments = (await readComments(await bytesOf(page, changed)))[0]
  expect(changedComments.some((one) => one.kind === "Highlight")).toBe(false)
  expect(changedComments.find((one) => one.reply)!.text).toBe("Checked.")
  expect(
    changedComments.find((one) => one.kind === "Text" && !one.reply)!.text
  ).toBe("Check the total again")

  // Drawn into the page for good, or left out: no comments either way, the words as they were.
  for (const existing of ["flatten", "remove"]) {
    const done = await ran(page, "comment_on_pdf", { file: again, existing })
    const result = await bytesOf(page, done)
    expect((await readComments(result))[0]).toEqual([])
    expect(await words(result)).toContain("Budget 2026")
  }
})
