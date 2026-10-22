import { describe, expect, it } from "vitest"
import { FakePdfClient, fakePdf, type FakeFile } from "@/tests/agent-pdf-fake"
import { Agent } from "./agent"
import { objectOf, pdfDrawTools, type Item } from "./pdf-draw"
import { PdfEngine } from "./pdf-engine"

function setup() {
  let client!: FakePdfClient
  const engine = new PdfEngine((onFile) => (client = new FakePdfClient(onFile)))
  const agent = new Agent(
    pdfDrawTools(engine, {
      font: async () => new ArrayBuffer(4),
      layOut: (object) => ({ ...object, lines: [object.text] }),
    })
  )
  const add = (file: FakeFile, name = "doc.pdf") =>
    agent.files.add(fakePdf(file), name).id
  const call = (name: string, input: unknown) =>
    agent.call(name, input, { caller: "page" })
  const asked = (what: string) =>
    client.asked
      .filter(([kind]) => kind === what)
      .map(
        ([, change]) =>
          change as { label: string; ops: Record<string, unknown>[] }
      )
  return { client: () => client, add, call, asked }
}

const page = { width: 400, height: 600 }
const made = (item: Partial<Item>) =>
  objectOf({ kind: "box", page: 1, x: 10, y: 20, ...item } as Item, page, "a")

/** A line of two letters, "Hi", 10 points tall at the top left. */
const hi = {
  letters: ["H", "i"],
  quads: [
    [0, 0, 8, 0, 0, 10, 8, 10],
    [8, 0, 12, 0, 8, 10, 12, 10],
  ],
}

describe("things drawn as the editor's tools draw them", () => {
  it("makes boxes, ellipses and covers in the editor's looks, or in the looks asked", () => {
    expect(made({ width: 50, height: 30 })).toMatchObject({
      kind: "box",
      box: { x: 10, y: 20, width: 50, height: 30 },
      stroke: [0.86, 0.15, 0.15],
      fill: null,
      weight: 2,
      opacity: 1,
      rotation: 0,
    })
    expect(
      made({
        kind: "ellipse",
        width: 5,
        height: 5,
        colour: "#000000",
        fill: "#00ff00",
        weight: 4,
        opacity: 0.5,
        rotation: 45,
      })
    ).toMatchObject({
      kind: "ellipse",
      stroke: [0, 0, 0],
      fill: [0, 1, 0],
      weight: 4,
      opacity: 0.5,
      rotation: 45,
    })
    expect(
      made({ kind: "box", width: 5, height: 5, fill: "none" })
    ).toMatchObject({ fill: null })
    expect(made({ kind: "cover", width: 5, height: 5 })).toMatchObject({
      kind: "cover",
      fill: [1, 1, 1],
    })
    expect(() => made({ kind: "box" })).toThrow(
      "A box needs a width and a height."
    )
  })

  it("makes stamps of the usual size, lines, arrows and measuring lines", () => {
    expect(made({ kind: "stamp" })).toMatchObject({
      kind: "stamp",
      label: "Approved",
      box: { width: 150, height: 46 },
      colour: [0.09, 0.56, 0.24],
    })
    expect(
      made({ kind: "stamp", label: "Paid in full", width: 100, height: 40 })
    ).toMatchObject({
      label: "PAID IN FULL",
    })
    expect(
      made({ kind: "arrow", toX: 100, toY: 120, opacity: 0.4 })
    ).toMatchObject({
      kind: "arrow",
      from: { x: 10, y: 20 },
      to: { x: 100, y: 120 },
      opacity: 0.4,
    })
    expect(
      made({ kind: "measure", toX: 100, toY: 20, unit: "cm", scale: 50 })
    ).toMatchObject({
      kind: "measure",
      unit: "cm",
      scale: 50,
    })
    expect(made({ kind: "line", toX: 1, toY: 1 })).not.toHaveProperty("unit")
    expect(() => made({ kind: "line" })).toThrow(
      "A line needs toX and toY: where it ends."
    )
    expect(() => made({ kind: "arrow", toX: 500, toY: 10 })).toThrow(
      "It reaches off page 1."
    )
  })

  it("writes text, on a row of boxes too, and call-outs that point", () => {
    expect(
      made({
        kind: "text",
        text: "Hello",
        size: 20,
        font: "serif",
        bold: true,
        italic: true,
        align: "centre",
        width: 90,
        rotation: 10,
      })
    ).toMatchObject({
      kind: "text",
      text: "Hello",
      lines: ["Hello"],
      box: { x: 10, y: 20, width: 90, height: 24 },
      font: "serif",
      bold: true,
      italic: true,
      align: "centre",
      size: 20,
      colour: [0, 0, 0],
      rotation: 10,
    })
    expect(made({ kind: "text", text: "12345", boxes: 5 })).toMatchObject({
      comb: 5,
    })
    expect(made({ kind: "text", text: "plain" })).not.toHaveProperty("comb")
    expect(() => made({ kind: "text" })).toThrow("A text needs text.")
    const callout = made({
      kind: "callout",
      text: "Look",
      toX: 200,
      toY: 300,
      colour: "#0000ff",
    })
    expect(callout).toMatchObject({
      kind: "text",
      tip: { x: 200, y: 300 },
      colour: [0, 0, 1],
    })
    expect(() => made({ kind: "callout", text: "Look" })).toThrow(
      "A callout needs toX and toY: what it points at."
    )
  })

  it("draws strokes and the marks of a paper form", () => {
    const ink = made({
      kind: "freehand",
      strokes: [
        [
          { x: 10, y: 20 },
          { x: 50, y: 60 },
        ],
      ],
      colour: "#ff0000",
      weight: 3,
    })
    expect(ink).toMatchObject({
      kind: "ink",
      box: { x: 10, y: 20, width: 40, height: 40 },
      stroke: [1, 0, 0],
      weight: 3,
    })
    expect(() => made({ kind: "freehand" })).toThrow(
      "A freehand needs strokes."
    )
    expect(() =>
      made({ kind: "freehand", strokes: [[{ x: 10, y: 700 }]] })
    ).toThrow("A stroke goes off page 1.")
    expect(
      made({ kind: "tick", colour: "#ff0000", opacity: 0.5 })
    ).toMatchObject({
      kind: "ink",
      stroke: [1, 0, 0],
      opacity: 0.5,
    })
    expect(made({ kind: "cross" }).kind).toBe("ink")
    expect(made({ kind: "dot" }).kind).toBe("ink")
    expect(() => made({ kind: "dot", x: 500 })).toThrow(
      "500, 20 is off page 1, which is 400 by 600 points."
    )
  })
})

describe("draw_on_pdf", () => {
  it("adds, moves and removes things in one step, and says what a cover does", async () => {
    const { add, call, asked, client } = setup()
    const file = add({
      pages: 2,
      objects: [
        [],
        [{ id: "t1", kind: "box", box: { x: 0, y: 0, width: 10, height: 10 } }],
      ],
    })
    client
    const result = await call("draw_on_pdf", {
      file,
      items: [
        { kind: "cover", page: 1, x: 10, y: 10, width: 50, height: 20 },
        { kind: "text", page: 2, x: 10, y: 10, text: "Hi" },
      ],
      move: [{ id: "t1", dx: 5, dy: 5 }],
      remove: ["t1"],
    })
    expect(result.summary).toMatch(
      /^2 things added, 1 thing moved, 1 thing removed\. A cover only hides/
    )
    expect(result.files![0].name).toBe("doc-edited.pdf")
    const change = asked("apply")[0]
    expect(change.label).toBe("Draw")
    expect(change.ops.map((op) => op.do)).toEqual([
      "add",
      "add",
      "change",
      "remove",
    ])
    expect(change.ops[2]).toMatchObject({
      page: 1,
      object: { box: { x: 5, y: 5 } },
    })
  })

  it("says what the font lacks, and refuses ids it does not know or nothing to do", async () => {
    const { add, call, client } = setup()
    const file = add({ pages: 1 })
    await call("draw_on_pdf", { file, items: [] }).catch(() => undefined)
    client().lacking = ["€"]
    expect(
      (
        await call("draw_on_pdf", {
          file,
          items: [{ kind: "text", page: 1, x: 1, y: 1, text: "5 €" }],
        })
      ).summary
    ).toBe("1 thing added. The font has no shape for €; it is left out.")
    client().lacking = ["€", "¥"]
    expect(
      (
        await call("draw_on_pdf", {
          file,
          items: [{ kind: "text", page: 1, x: 1, y: 1, text: "€ ¥" }],
        })
      ).summary
    ).toMatch(/they are left out\.$/)
    client().lacking = []
    const things = add({
      pages: 1,
      objects: [
        [{ id: "t1", kind: "box", box: { x: 0, y: 0, width: 1, height: 1 } }],
      ],
    })
    expect(
      (await call("draw_on_pdf", { file: things, remove: ["t1"] })).summary
    ).toBe("1 thing removed.")
    await expect(
      call("draw_on_pdf", { file, remove: ["nope"] })
    ).rejects.toThrow(
      'There is no thing "nope" in this file. list_pdf_comments gives their ids.'
    )
    await expect(call("draw_on_pdf", { file })).rejects.toThrow(
      'Give "items" to add, or things to "move" or "remove".'
    )
    await expect(
      call("draw_on_pdf", {
        file,
        items: [{ kind: "dot", page: 3, x: 1, y: 1 }],
      })
    ).rejects.toThrow("There are 1 pages; page 3 is not one of them.")
  })
})

describe("list_pdf_comments", () => {
  it("lists comments with the words they mark, and the things kept editable", async () => {
    const { add, call, asked, client } = setup()
    const note = {
      id: "c7",
      kind: "note",
      type: "Text",
      box: { x: 0, y: 0, width: 20, height: 20 },
      quads: [],
      strokes: [],
      colour: null,
      opacity: 1,
      weight: 0,
      text: "Check this",
      author: "Ada",
      when: Date.UTC(2026, 9, 22),
      replies: [
        { id: "c8", text: "Done", author: "Bo", when: null },
        {
          id: "c10",
          text: "Thanks",
          author: "Ada",
          when: Date.UTC(2026, 9, 23),
        },
      ],
    }
    const result = await call("list_pdf_comments", {
      file: add({
        pages: 2,
        comments: [
          [note],
          [
            {
              ...note,
              id: "c9",
              kind: "highlight",
              type: "Highlight",
              quads: [[0, 0, 12, 0, 0, 10, 12, 10]],
              when: null,
              replies: [],
            },
          ],
        ],
        letters: [[], [hi]],
        objects: [
          [
            {
              id: "t1",
              kind: "text",
              text: "Hello",
              box: { x: 1, y: 2, width: 3, height: 4 },
            },
          ],
          [
            {
              id: "t2",
              kind: "stamp",
              box: { x: 1, y: 2, width: 3, height: 4 },
            },
          ],
        ],
      }),
    })
    expect(result.summary).toBe(
      "2 comments and 2 things kept editable in doc.pdf."
    )
    expect(result.files).toBeUndefined()
    const data = result.data as {
      comments: Record<string, unknown>[]
      things: Record<string, unknown>[]
    }
    expect(data.comments[0]).toMatchObject({
      id: "c7",
      page: 1,
      text: "Check this",
      when: "2026-10-22T00:00:00.000Z",
      replies: [
        { id: "c8", text: "Done", when: null },
        { id: "c10", when: "2026-10-23T00:00:00.000Z" },
      ],
    })
    expect(data.comments[0]).not.toHaveProperty("marks")
    expect(data.comments[1]).toMatchObject({ page: 2, marks: "Hi", when: null })
    expect(data.things).toEqual([
      {
        id: "t1",
        page: 1,
        kind: "text box",
        box: { x: 1, y: 2, width: 3, height: 4 },
        text: "Hello",
      },
      {
        id: "t2",
        page: 2,
        kind: "stamp",
        box: { x: 1, y: 2, width: 3, height: 4 },
      },
    ])
    // Only a page with marks has its letters read.
    expect(client().asked.filter(([kind]) => kind === "letters")).toEqual([
      ["letters", 1],
    ])
    expect(asked("comment")).toEqual([])
    const empty = await call("list_pdf_comments", { file: add({ pages: 1 }) })
    expect(empty.summary).toBe("0 comments in doc.pdf.")
  })
})

describe("comment_on_pdf", () => {
  it("marks every place some words or a kind of thing are written, and the words in an area", async () => {
    const { add, call, asked } = setup()
    const file = add({
      pages: 3,
      redact: {
        budget: [
          { page: 0, text: "budget" },
          { page: 2, text: "budget" },
          { page: 2, text: "Budget" },
        ],
        email: [{ page: 1, text: "a@b.c" }],
      },
      letters: [[hi], [], []],
    })
    const result = await call("comment_on_pdf", {
      file,
      author: "Ada",
      changes: [
        { do: "highlight", words: "budget" },
        { do: "underline", pattern: "email", colour: "#0000ff" },
        { do: "strike", area: { page: 1, x: 0, y: 0, width: 12, height: 10 } },
      ],
    })
    expect(result.summary).toMatch(
      /^Highlight: 3 places of "budget" on 2 pages\. Underline: 1 place of email on 1 page\. Strike: 1 place of that area on 1 page\./
    )
    expect(result.files![0].name).toBe("doc-commented.pdf")
    const ops = asked("comment")[0].ops
    expect(ops.map((op) => [op.do, op.kind, op.page])).toEqual([
      ["mark", "highlight", 0],
      ["mark", "highlight", 2],
      ["mark", "underline", 1],
      ["mark", "strike", 0],
    ])
    expect(ops[0]).toMatchObject({
      author: "Ada",
      colour: [1, 0.86, 0.2],
      opacity: 1,
    })
    expect(ops[1].quads).toHaveLength(2)
    expect(ops[2].colour).toEqual([0, 0, 1])
  })

  it("adds notes, pen strokes and replies, and changes or deletes comments by their ids", async () => {
    const { add, call, asked } = setup()
    const comment = { id: "c3", kind: "note", quads: [], replies: [] }
    const file = add({ pages: 2, comments: [[], [comment]] })
    const result = await call("comment_on_pdf", {
      file,
      changes: [
        { do: "note", page: 1, x: 50, y: 60, text: "Why?" },
        {
          do: "pen",
          page: 2,
          strokes: [
            [
              { x: 1, y: 1 },
              { x: 9, y: 9 },
            ],
          ],
          colour: "#00ff00",
          weight: 20,
        },
        { do: "pen", page: 1, strokes: [[{ x: 1, y: 1 }]] },
        { do: "reply", id: "c3", text: "Because." },
        { do: "edit", id: "c3", text: "New words", colour: "#ff0000", dx: 5 },
        { do: "edit", id: "c3", dy: 2 },
        { do: "edit", id: "c3", text: "" },
        { do: "delete", id: "c3" },
      ],
    })
    expect(result.summary).toBe(
      "1 note, 2 pen strokes, 1 reply, 3 changes, 1 deleted comment."
    )
    const ops = asked("comment")[0].ops
    expect(ops[0]).toMatchObject({
      do: "note",
      page: 0,
      at: { x: 50, y: 60 },
      author: "",
      text: "Why?",
    })
    expect(ops[1]).toMatchObject({
      do: "pen",
      page: 1,
      colour: [0, 1, 0],
      weight: 20,
      opacity: 0.4,
    })
    expect(ops[2]).toMatchObject({ weight: 12 })
    expect(ops[3]).toMatchObject({ do: "reply", page: 1, to: "c3" })
    expect(ops[4]).toMatchObject({
      do: "edit",
      page: 1,
      text: "New words",
      colour: [1, 0, 0],
      move: { x: 5, y: 0 },
    })
    expect(ops[5]).toMatchObject({ move: { x: 0, y: 2 } })
    expect(ops[6]).toEqual({
      do: "edit",
      page: 1,
      id: "c3",
      when: expect.any(Number),
      text: "",
    })
    expect(ops[7]).toEqual({ do: "drop", page: 1, id: "c3" })
  })

  it("draws every comment in, or leaves them out, on its own or with changes", async () => {
    const { add, call, client, asked } = setup()
    const file = add({ pages: 1 })
    const flat = await call("comment_on_pdf", { file, existing: "flatten" })
    expect(flat.summary).toMatch(
      /^Every comment is drawn into its page for good\./
    )
    expect(client().exports.at(-1)!.comments).toBe("flatten")
    expect(asked("comment")).toEqual([])
    const out = await call("comment_on_pdf", {
      file,
      existing: "remove",
      changes: [{ do: "highlight", words: "missing" }],
    })
    expect(out.summary).toMatch(
      /^No words found for "missing": nothing marked\. Every comment is left out of the file, the ones it came with too\./
    )
    expect(client().exports.at(-1)!.comments).toBe("remove")
  })

  it("refuses what it cannot do, and writes nothing when nothing was found", async () => {
    const { add, call } = setup()
    const file = add({ pages: 1, letters: [[hi]] })
    await expect(call("comment_on_pdf", { file })).rejects.toThrow(
      'Give "changes", or what becomes of the "existing" comments.'
    )
    await expect(
      call("comment_on_pdf", { file, changes: [{ do: "highlight" }] })
    ).rejects.toThrow('A highlight needs one of "words", "pattern" or "area".')
    await expect(
      call("comment_on_pdf", {
        file,
        changes: [{ do: "squiggle", words: "a", pattern: "email" }],
      })
    ).rejects.toThrow('A squiggle needs one of "words", "pattern" or "area".')
    await expect(
      call("comment_on_pdf", {
        file,
        changes: [
          {
            do: "highlight",
            area: { page: 1, x: 300, y: 300, width: 5, height: 5 },
          },
        ],
      })
    ).rejects.toThrow(
      "No words found for that area: nothing marked. The file is left as it was."
    )
    await expect(
      call("comment_on_pdf", {
        file,
        changes: [{ do: "reply", id: "c1", text: "?" }],
      })
    ).rejects.toThrow('There is no comment "c1" in this file.')
  })
})

describe("the editor's calls the tools reach the worker by", () => {
  it("passes each on, and says when a page cannot be read", async () => {
    let client!: FakePdfClient
    const engine = new PdfEngine(
      (onFile) => (client = new FakePdfClient(onFile))
    )
    const { id } = await engine.openForEdit(
      fakePdf({ pages: 2, lines: [[{ text: "A line" }]], unreadable: [1] }),
      "doc.pdf"
    )
    expect(await engine.linesOf(id, 0)).toEqual([{ text: "A line" }])
    expect(await engine.pageLinks(id, 0)).toEqual([])
    expect(await engine.pagePictures(id, 0)).toEqual([])
    expect(await engine.suggestFields(id, 0)).toEqual([])
    await expect(engine.lettersOf(id, 1)).rejects.toThrow(
      "Page 2 of this file could not be read."
    )
    const change = { label: "x", ops: [] }
    await engine.editText(id, change as never)
    await engine.editPageLink(id, change as never)
    await engine.editPagePicture(id, change as never)
    await engine.editMakeFields(id, change as never)
    expect(client.asked.map(([kind]) => kind)).toEqual([
      "lines",
      "links",
      "pictures",
      "suggestions",
      "letters",
      "text",
      "link",
      "page-picture",
      "make-fields",
    ])
    engine.editFont(id, "own-abc", new ArrayBuffer(1), "My Font")
    expect(client.fontNames.get("own-abc")).toBe("My Font")
    const trusted = [Uint8Array.of(1)]
    await engine.signatures(id, trusted)
    expect(client.trusted.at(-1)).toBe(trusted)
  })
})
