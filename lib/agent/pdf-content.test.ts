import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { FakePdfClient, fakePdf, type FakeFile } from "@/tests/agent-pdf-fake"
import type { LineStyle, PageLine } from "@/lib/pdf-editor/retext"
import { Agent } from "./agent"
import { MOST_LISTED, pdfContentTools, placesOf, readId } from "./pdf-content"
import { pdfDrawTools } from "./pdf-draw"
import { pdfEditTools } from "./pdf-edit"
import { PdfEngine } from "./pdf-engine"

const style = (more: Partial<LineStyle> = {}): LineStyle => ({
  font: "Body",
  size: 10,
  colour: [0, 0, 0],
  rise: 0,
  standIn: "serif",
  letters: "abcdefghijklmnopqrstuvwxyz ",
  ...more,
})

/** A line of a page, as the editor reads one. */
function line(
  text: string,
  x: number,
  y: number,
  width: number,
  more: Partial<PageLine> = {}
): PageLine {
  return {
    text,
    box: { x, y: y - 8, width, height: 10 },
    origin: { x, y },
    along: { x: 1, y: 0 },
    styles: [style()],
    looks: Array.from(text).map(() => 0),
    first: 20,
    ...more,
  }
}

/** A heading, then a paragraph of three lines, then a line that cannot be retyped. */
const page = [
  line("Heading", 50, 60, 80),
  ...[300, 298, 120].map((width, at) =>
    line("word word word", 50, 100 + at * 12, width)
  ),
  line("Fixed", 50, 300, 40, { fixed: "It is written downwards." }),
]

const font = (name: string) =>
  new Uint8Array(readFileSync(`public/fonts/editor/${name}.ttf`))
/** A real font whose maker allows no embedding (its OS/2 table says so). */
function restricted() {
  const bytes = font("Kalam-Regular").slice()
  const view = new DataView(bytes.buffer)
  for (let at = 0; at < view.getUint16(4); at++) {
    const record = 12 + at * 16
    if (String.fromCharCode(...bytes.subarray(record, record + 4)) === "OS/2")
      view.setUint16(view.getUint32(record + 8) + 8, 0x0002)
  }
  return bytes
}

function setup() {
  let client!: FakePdfClient
  const engine = new PdfEngine((onFile) => (client = new FakePdfClient(onFile)))
  const shown: string[] = []
  const text = {
    font: async () => new ArrayBuffer(4),
    own: async (key: string) => void shown.push(key),
    layOut: (object: { text: string }) =>
      ({ ...object, lines: [object.text] }) as never,
  }
  const agent = new Agent([
    ...pdfContentTools(engine, text),
    ...pdfDrawTools(engine, text),
    ...pdfEditTools(engine, text, async () => {
      throw new Error("No OCR here.")
    }),
  ])
  const add = (file: FakeFile, name = "doc.pdf") =>
    agent.files.add(fakePdf(file), name).id
  const addBytes = (bytes: Uint8Array, name: string) =>
    agent.files.add(new Blob([bytes as BlobPart]), name).id
  const call = (name: string, input: unknown) =>
    agent.call(name, input, { caller: "page" })
  const asked = (what: string) =>
    client.asked
      .filter(([kind]) => kind === what)
      .map(
        ([, change]) =>
          change as { label: string; ops: Record<string, unknown>[] }
      )
  return { client: () => client, add, addBytes, call, asked, shown }
}

describe("the lines and paragraphs of a page", () => {
  it("names each from the top down, with paragraphs or without", () => {
    const places = placesOf(0, page, true)
    expect(
      places.map((place) => [place.id, place.kind, place.lines.length])
    ).toEqual([
      ["p1-l1", "line", 1],
      ["p1-b1", "paragraph", 3],
      ["p1-l5", "line", 1],
    ])
    expect(places[1].whole.text).toBe(
      "word word word word word word word word word"
    )
    expect(placesOf(2, page, false).map((place) => place.id)).toEqual([
      "p3-l1",
      "p3-l2",
      "p3-l3",
      "p3-l4",
      "p3-l5",
    ])
    // Two at one height go from the left.
    expect(
      placesOf(0, [line("b", 200, 60, 10), line("a", 10, 60, 10)], true).map(
        (p) => p.whole.text
      )
    ).toEqual(["a", "b"])
  })

  it("reads ids, and says what they look like", () => {
    expect(readId("p2-b3", "b|l", 4)).toEqual({ page: 1, kind: "b", index: 2 })
    expect(() => readId("line 3", "b|l", 4)).toThrow(
      '"line 3" is not an id read_pdf_page_content gives for this.'
    )
    expect(() => readId("p9-i1", "i", 4)).toThrow(
      '"p9-i1" names page 9; the file has 4.'
    )
  })
})

describe("read_pdf_page_content", () => {
  it("lists text, pictures and links with their ids", async () => {
    const { add, call } = setup()
    const file = add({
      pages: 2,
      lines: [page, [line("Odd", 10, 10, 20, { styles: [], looks: [] })]],
      pictures: [
        [
          {
            index: 0,
            at: [1, 0, 0, 1, 0, 0],
            box: { x: 10.04, y: 20, width: 30, height: 40 },
            upright: true,
            cut: false,
            width: 300,
            height: 400,
          },
          {
            index: 1,
            at: [0, 1, -1, 0, 0, 0],
            box: { x: 1, y: 2, width: 3, height: 4 },
            upright: false,
            cut: true,
            width: 3,
            height: 4,
          },
        ],
      ],
      links: [
        [
          {
            index: 0,
            box: { x: 1, y: 2, width: 3, height: 4 },
            to: { page: 1 },
          },
          { index: 1, box: { x: 1, y: 2, width: 3, height: 4 }, to: null },
        ],
      ],
    })
    const read = await call("read_pdf_page_content", { file })
    expect(read.summary).toBe(
      "2 pages: 4 lines or paragraphs, 2 pictures, 2 links."
    )
    const pages = (
      read.data as {
        pages: {
          text: Record<string, unknown>[]
          pictures: unknown[]
          links: unknown[]
        }[]
      }
    ).pages
    expect(pages[0].text[0]).toEqual({
      id: "p1-l1",
      kind: "line",
      text: "Heading",
      box: { x: 50, y: 52, width: 80, height: 10 },
      font: "Body",
      size: 10,
      colour: "#000000",
    })
    expect(pages[0].text[2]).toMatchObject({
      id: "p1-l5",
      fixed: "It is written downwards.",
    })
    expect(pages[1].text[0]).not.toHaveProperty("font")
    expect(pages[0].pictures).toEqual([
      {
        id: "p1-i1",
        box: { x: 10, y: 20, width: 30, height: 40 },
        dots: { width: 300, height: 400 },
      },
      {
        id: "p1-i2",
        box: { x: 1, y: 2, width: 3, height: 4 },
        dots: { width: 3, height: 4 },
        cut: true,
        upright: false,
      },
    ])
    expect(pages[0].links).toEqual([
      { id: "p1-k1", box: { x: 1, y: 2, width: 3, height: 4 }, to: "Page 2" },
      { id: "p1-k2", box: { x: 1, y: 2, width: 3, height: 4 }, to: null },
    ])
    const one = await call("read_pdf_page_content", {
      file,
      pages: "2",
      paragraphs: false,
    })
    expect(one.summary).toBe(
      "1 page: 1 line or paragraph, 0 pictures, 0 links."
    )
    await expect(
      call("read_pdf_page_content", { file: add({ pages: MOST_LISTED + 1 }) })
    ).rejects.toThrow(
      `That is ${MOST_LISTED + 1} pages; read at most ${MOST_LISTED} at a time with "pages".`
    )
  })
})

describe("edit_pdf_text", () => {
  it("changes lines and paragraphs as Change text does, in one step", async () => {
    const { add, call, asked, client } = setup()
    const file = add({ pages: 1, lines: [page] })
    const done = await call("edit_pdf_text", {
      file,
      changes: [
        { id: "p1-l1", text: "Heading two", size: 14, colour: "#ff0000" },
        {
          id: "p1-b1",
          text: "new words here",
          align: "justify",
          dx: 5,
          font: "serif",
          bold: true,
        },
        { id: "p1-l5", delete: true },
      ],
    })
    expect(done.summary).toMatch(
      /^2 lines or paragraphs changed, 1 taken out, each read back from the page\./
    )
    const change = asked("text")[0]
    expect(change.label).toBe("Change text")
    expect(change.ops[0]).toEqual({
      do: "retext",
      page: 0,
      box: page[0].box,
      was: "Heading",
      text: "Heading two",
      look: { size: 14, colour: [1, 0, 0] },
    })
    expect(change.ops[1]).toMatchObject({
      do: "reflow",
      lines: [1, 2, 3].map((at) => ({
        box: page[at].box,
        was: "word word word",
      })),
      text: "new words here",
      look: { font: "serif-bold" },
      align: "justify",
      move: { x: 5, y: 0 },
    })
    expect(change.ops[2]).toMatchObject({ do: "retext", text: "" })
    // The font chosen is in the worker before the change; letters the line's own lacks bring their stand-in.
    expect(client().fonts).toEqual(["serif", "serif-bold"])
    await call("edit_pdf_text", {
      file,
      changes: [{ id: "p1-l1", text: "Heading 2", dy: -3 }],
    })
    expect(client().fonts.at(-1)).toBe("serif")
    expect(asked("text")[1].ops[0]).toMatchObject({ move: { x: 0, y: -3 } })
  })

  it("sets a line in a font of one's own, and refuses a font that may not be embedded", async () => {
    const { add, addBytes, call, asked, client, shown } = setup()
    const file = add({ pages: 1, lines: [page] })
    const kalam = addBytes(font("Kalam-Regular"), "Kalam.ttf")
    const done = await call("edit_pdf_text", {
      file,
      fontFile: kalam,
      changes: [{ id: "p1-l1", font: "own" }],
    })
    expect(done.summary).toMatch(/Set in Kalam/)
    const key = (asked("text")[0].ops[0].look as { font: string }).font
    expect(key).toMatch(/^own-[0-9a-f]{12}$/)
    expect(shown).toEqual([key])
    expect(client().fontNames.get(key)).toMatch(/Kalam/)
    await expect(
      call("edit_pdf_text", { file, changes: [{ id: "p1-l1", font: "own" }] })
    ).rejects.toThrow('Give "fontFile" for font "own".')
    await expect(
      call("edit_pdf_text", {
        file,
        fontFile: addBytes(restricted(), "Kept.ttf"),
        changes: [{ id: "p1-l1", font: "own" }],
      })
    ).rejects.toThrow(/does not allow it to be put into documents/)
    // A file larger than any font is not read at all.
    await expect(
      call("edit_pdf_text", {
        file,
        fontFile: addBytes(new Uint8Array(30 * 1024 * 1024 + 1), "Huge.ttf"),
        changes: [{ id: "p1-l1", font: "own" }],
      })
    ).rejects.toThrow("Huge.ttf is not a font the editor can use")
    await expect(
      call("edit_pdf_text", {
        file,
        fontFile: addBytes(Uint8Array.of(1, 2, 3), "Not.ttf"),
        changes: [{ id: "p1-l1", font: "own" }],
      })
    ).rejects.toThrow(
      "Not.ttf is not a font the editor can use: give a TrueType or OpenType font (.ttf or .otf)."
    )
  })

  it("refuses what Change text would not do", async () => {
    const { add, call } = setup()
    const file = add({ pages: 1, lines: [page] })
    const refused = (changes: unknown[], why: string | RegExp, more = {}) =>
      expect(call("edit_pdf_text", { file, changes, ...more })).rejects.toThrow(
        why
      )
    await refused(
      [{ id: "p1-l1", align: "centre" }],
      "p1-l1 is a line: only a paragraph is aligned."
    )
    await refused(
      [{ id: "p1-l1", bold: true }],
      'p1-l1: bold and italic come with a font of the editor\'s ("font").'
    )
    await refused(
      [{ id: "p1-l5", text: "Up" }],
      "p1-l5 cannot be retyped: It is written downwards."
    )
    await refused(
      [{ id: "p1-l1", text: "Heading" }],
      "p1-l1: nothing to change."
    )
    await refused(
      [{ id: "p1-l1", text: "x".repeat(2001) }],
      "p1-l1: that is too many words for it."
    )
    await refused(
      [{ id: "p1-l2", text: "a" }],
      'There is no line "p1-l2" on page 1. read_pdf_page_content gives the ids.'
    )
    await refused(
      [{ id: "p1-b1", text: "a" }],
      'There is no paragraph "p1-b1" on page 1 with paragraphs off.',
      {
        paragraphs: false,
      }
    )
    // A line that cannot be retyped can still be moved; a paragraph can be given only new words.
    await call("edit_pdf_text", {
      file,
      changes: [
        { id: "p1-l5", dx: 1 },
        { id: "p1-b1", text: "other words" },
      ],
    })
  })
})

describe("edit_pdf_pictures", () => {
  const picture = (index: number) => ({
    index,
    at: [10, 0, 0, 10, index, 0],
    box: { x: 100, y: 200, width: 40, height: 20 },
    upright: true,
    cut: false,
    width: 4,
    height: 2,
  })

  it("moves, resizes, turns, cuts, shows whole, puts another in place and takes out, each as the page does", async () => {
    const { add, addBytes, call, asked, client } = setup()
    const file = add({
      pages: 2,
      pictures: [[picture(0), picture(1), picture(2)], [picture(0)]],
    })
    const png = addBytes(Uint8Array.of(137, 80, 78, 71), "new.png")
    const done = await call("edit_pdf_pictures", {
      file,
      changes: [
        { id: "p1-i1", delete: true },
        { id: "p1-i3", delete: true },
        {
          id: "p2-i1",
          replace: png,
          whole: true,
          cut: { left: 0.1 },
          scale: 2,
          turn: 90,
          dx: 5,
          dy: 6,
        },
      ],
    })
    expect(done.summary).toBe(
      "3 pictures changed: put another picture in its place, show a whole picture, cut a picture to a part, resize a picture, turn a picture, move a picture, take out a picture. Each change was read back: the other pictures and the text are where they were. A picture cut to a part is still whole in the file: anyone can show it again. redact_pdf takes it out."
    )
    const ops = asked("page-picture").map((change) => change.ops[0])
    expect(ops.map((op) => [op.page, op.index])).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [0, 2],
      [0, 0],
    ])
    expect(ops[0]).toMatchObject({
      at: [10, 0, 0, 10, 0, 0],
      picture: expect.any(String),
    })
    expect(ops[1]).toMatchObject({ cut: null })
    expect(ops[2]).toMatchObject({
      cut: { left: 0.1, top: 0, right: 0, bottom: 0 },
    })
    expect(ops[3].by).toEqual([2, 0, 0, 2, -100, -200])
    expect(ops[4].by).toEqual([0, 1, -1, 0, 330, 90])
    expect(ops[5].by).toEqual([1, 0, 0, 1, 5, 6])
    expect(ops[6]).toMatchObject({ remove: true })
    expect(client().asked.some(([kind]) => kind === "picture")).toBe(true)
  })

  it("refuses what cannot be done", async () => {
    const { add, call } = setup()
    const file = add({ pages: 1, pictures: [[picture(0)]] })
    expect(
      (
        await call("edit_pdf_pictures", {
          file,
          changes: [
            { id: "p1-i1", dx: 3 },
            { id: "p1-i1", dy: 4 },
          ],
        })
      ).summary
    ).toBe(
      "2 pictures changed: move a picture. Each change was read back: the other pictures and the text are where they were."
    )
    await expect(
      call("edit_pdf_pictures", { file, changes: [{ id: "p1-i1" }] })
    ).rejects.toThrow("p1-i1: nothing to change.")
    await expect(
      call("edit_pdf_pictures", { file, changes: [{ id: "p1-i1", scale: 1 }] })
    ).rejects.toThrow("nothing to change")
    await expect(
      call("edit_pdf_pictures", {
        file,
        changes: [{ id: "p1-i1", cut: { left: 0.5, right: 0.5 } }],
      })
    ).rejects.toThrow("p1-i1: that cut leaves nothing showing.")
    await expect(
      call("edit_pdf_pictures", {
        file,
        changes: [{ id: "p1-i1", cut: { top: 0.6, bottom: 0.6 } }],
      })
    ).rejects.toThrow("leaves nothing showing")
    await expect(
      call("edit_pdf_pictures", { file, changes: [{ id: "p1-i2", dx: 1 }] })
    ).rejects.toThrow(
      'There is no picture "p1-i2" on page 1. read_pdf_page_content gives the ids.'
    )
  })
})

describe("edit_pdf_links", () => {
  const link = (index: number) => ({
    index,
    box: { x: 10, y: 10, width: 50, height: 12 },
    to: { url: "https://a.org/" },
  })

  it("changes, adds and takes away links, the highest places last", async () => {
    const { add, call, asked } = setup()
    const file = add({ pages: 3, links: [[link(0), link(1)], [], [link(0)]] })
    const done = await call("edit_pdf_links", {
      file,
      changes: [
        { id: "p1-k1", to: "page 3" },
        { id: "p1-k2", x: 1, y: 2, width: 30, height: 10 },
        { page: 2, x: 5, y: 5, width: 40, height: 10, to: "example.org" },
        { page: 2, x: 5, y: 25, width: 40, height: 10, to: "ada@example.org" },
        { id: "p1-k1", delete: true },
        { id: "p3-k1", delete: true },
      ],
    })
    expect(done.summary).toBe(
      "2 links added, 2 links changed, 2 links taken away. Each was read back; where an address leads is not checked."
    )
    const ops = asked("link").map((change) => [change.label, change.ops[0]])
    expect(ops[0]).toEqual([
      "Change a link",
      { do: "link", page: 0, index: 0, at: link(0).box, to: { page: 2 } },
    ])
    expect(ops[1][1]).toMatchObject({
      index: 1,
      box: { x: 1, y: 2, width: 30, height: 10 },
    })
    expect(ops[2]).toEqual([
      "Add a link",
      {
        do: "link",
        page: 1,
        box: { x: 5, y: 5, width: 40, height: 10 },
        to: { url: "https://example.org/" },
      },
    ])
    expect(ops[3][1]).toMatchObject({ to: { url: "mailto:ada@example.org" } })
    expect(ops[4]).toEqual([
      "Take away a link",
      { do: "link", page: 2, index: 0, at: link(0).box, remove: true },
    ])
    expect(ops[5][1]).toMatchObject({ page: 0, index: 0, remove: true })
    expect(
      (
        await call("edit_pdf_links", {
          file,
          changes: [{ id: "p1-k1", to: "tel:+441234" }],
        })
      ).summary
    ).toMatch(/^1 link changed\./)
    expect(
      (
        await call("edit_pdf_links", {
          file,
          changes: [
            { id: "p1-k1", delete: true },
            { id: "p1-k2", delete: true },
          ],
        })
      ).summary
    ).toMatch(/^2 links taken away\./)
    expect(
      asked("link")
        .slice(-2)
        .map((change) => change.ops[0].index)
    ).toEqual([1, 0])
  })

  it("refuses links that cannot be made", async () => {
    const { add, call } = setup()
    const file = add({ pages: 2, links: [[link(0)]] })
    const refused = (changes: unknown[], why: string | RegExp) =>
      expect(call("edit_pdf_links", { file, changes })).rejects.toThrow(why)
    await refused([{ id: "p1-k1" }], "p1-k1: nothing to change.")
    await refused(
      [{ id: "p1-k1", x: 1 }],
      "A link's place needs x, y, width and height."
    )
    await refused(
      [{ id: "p1-k1", to: "page 9" }],
      '"page 9" is not a page of this file, which has 2.'
    )
    await refused(
      [{ id: "p1-k1", to: "javascript:alert(1)" }],
      /is not an address a link is given/
    )
    await refused([{ delete: true }], "Give the id of the link to take away.")
    await refused(
      [{ page: 1, to: "3" }],
      "A new link needs a page, x, y, width, height and where it leads (to)."
    )
    await refused(
      [{ x: 1, y: 1, width: 9, height: 9, to: "page 1" }],
      "A new link needs"
    )
    await refused(
      [{ page: 1, x: 1, y: 1, width: 9, height: 9 }],
      "A new link needs"
    )
    await refused(
      [{ page: 4, x: 1, y: 1, width: 9, height: 9, to: "page 1" }],
      "There are 2 pages; page 4 is not one of them."
    )
    await refused(
      [{ id: "p1-k5", to: "page 1" }],
      'There is no link "p1-k5" on page 1.'
    )
    await refused(
      [{ id: "p2-k1", delete: true }],
      'There is no link "p2-k1" on page 2.'
    )
  })
})

describe("fonts of one's own for added text", () => {
  it("writes drawn text and a text box in a font file, and asks for the file", async () => {
    const { add, addBytes, call, asked, shown } = setup()
    const file = add({ pages: 1 })
    const kalam = addBytes(font("Kalam-Regular"), "Kalam.ttf")
    await call("draw_on_pdf", {
      file,
      fontFile: kalam,
      items: [
        { kind: "text", page: 1, x: 10, y: 10, text: "Mine", font: "own" },
      ],
    })
    const object = asked("apply")[0].ops[0].object as { font: string }
    expect(object.font).toBe(shown[0])
    await call("add_text_to_pdf", {
      file,
      fontFile: kalam,
      page: 1,
      x: 10,
      y: 10,
      text: "Mine",
      font: "own",
    })
    expect((asked("apply")[1].ops[0].object as { font: string }).font).toBe(
      shown[0]
    )
    for (const tool of ["draw_on_pdf", "add_text_to_pdf"])
      await expect(
        call(tool, {
          file,
          ...(tool === "draw_on_pdf"
            ? {
                items: [
                  { kind: "text", page: 1, x: 1, y: 1, text: "x", font: "own" },
                ],
              }
            : { page: 1, x: 1, y: 1, text: "x", font: "own" }),
        })
      ).rejects.toThrow('Give "fontFile" for font "own".')
  })
})
