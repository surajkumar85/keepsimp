import { describe, expect, it } from "vitest"
import { FakePdfClient, fakePdf, type FakeFile } from "@/tests/agent-pdf-fake"
import type { FormField } from "@/lib/pdf-editor/forms"
import type { FoundSignature } from "@/lib/pdf-editor/signature-report"
import { Agent } from "./agent"
import { checksSaid, colourOf, pdfEditTools } from "./pdf-edit"
import { PdfEngine } from "./pdf-engine"

/** A stand-in for Tesseract: it reads "Hello there" on every page, or fails to load, or hangs. */
const ocr = {
  mode: "reads" as "reads" | "fails" | "hangs",
  stopped: 0,
  start: async (_languages: string, onShare: (share: number) => void) => {
    // Tesseract tells how far it is from the start.
    onShare(0.1)
    if (ocr.mode === "fails") throw new Error("offline")
    return {
      read: async () =>
        ocr.mode === "hangs"
          ? new Promise<never>(() => undefined)
          : [
              {
                paragraphs: [
                  {
                    lines: [
                      {
                        bbox: { x0: 0, y0: 0, x1: 300, y1: 40 },
                        baseline: { x0: 0, y0: 40, x1: 300, y1: 40 },
                        words: [
                          {
                            text: "Hello",
                            bbox: { x0: 0, y0: 0, x1: 120, y1: 40 },
                            confidence: 92,
                          },
                          {
                            text: "there",
                            bbox: { x0: 150, y0: 0, x1: 300, y1: 40 },
                            confidence: 88,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
      stop: () => void ocr.stopped++,
    }
  },
}

function setup() {
  let client!: FakePdfClient
  const engine = new PdfEngine((onFile) => (client = new FakePdfClient(onFile)))
  const laid: string[] = []
  const agent = new Agent(
    pdfEditTools(
      engine,
      {
        font: async () => new ArrayBuffer(4),
        own: async () => undefined,
        layOut: (object) => {
          laid.push(object.text)
          return { ...object, lines: [object.text] }
        },
      },
      ocr.start
    )
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
  return { agent, client: () => client, add, call, asked, laid }
}

const field = (overrides: Partial<FormField>): Partial<FormField> => overrides

describe("the helpers", () => {
  it("reads colours and says what the checks found", () => {
    expect(colourOf("#ff0080")).toEqual([1, 0, 128 / 255])
    expect(colourOf("00786F")[1]).toBeCloseTo(0.47, 2)
    expect(() => colourOf("teal")).toThrow(
      '"teal" is not a colour written as #rrggbb.'
    )
    const report = (text: [number, number], untouched: [number, number[]]) =>
      ({
        text: { boxes: text[0], found: text[1] },
        untouched: { checked: untouched[0], differ: untouched[1] },
      }) as never
    expect(checksSaid(report([0, 0], [0, []]))).toEqual([])
    expect(checksSaid(report([3, 3], [2, []]))).toEqual([
      "Checked: the words of 3 added texts read back from the file.",
      "2 untouched pages compared with the original: the same.",
    ])
    expect(checksSaid(report([3, 1], [4, [0, 2]]))).toEqual([
      "Only 1 of 3 added texts read back from the file.",
      "2 untouched pages look different: page 1, 3.",
    ])
  })
})

describe("writing a file", () => {
  it("writes the edited file with the editor's checks, locked or not", async () => {
    const { add, call, client } = setup()
    const id = add({ pages: 2 })
    const done = await call("crop_pdf", {
      file: id,
      left: 10,
      lock: { password: "pw" },
    })
    expect(done.files![0].name).toBe("doc-cropped.pdf")
    expect(done.summary).toMatch(/Locked with the password given\.$/)
    expect(client().exports[0]).toEqual({
      keepEditable: false,
      comments: "keep",
      fields: "keep",
      after: false,
      lock: expect.objectContaining({ password: "pw" }),
    })
    expect(done.data).toEqual({
      checked: {
        addedTexts: { boxes: 0, found: 0 },
        untouchedPages: { checked: 0, differ: [] },
        fontsCut: undefined,
      },
    })
    expect(client().closed).toEqual(["agent-1"])
  })

  it("writes a signed file after its signature where it can, and says when it cannot", async () => {
    const { add, call, client } = setup()
    const after = await call("crop_pdf", {
      file: add({ pages: 1, signed: true, after: true }),
      left: 5,
    })
    expect(after.summary).toMatch(/written after its signature/)
    expect(client().exports[0].after).toBe(true)
    const anew = await call("crop_pdf", {
      file: add({ pages: 1, signed: true }),
      left: 5,
    })
    expect(anew.summary).toMatch(/its signature no longer holds/)
    const locked = await call("crop_pdf", {
      file: add({ pages: 1, signed: true, after: true }),
      left: 5,
      lock: { password: "x" },
    })
    expect(locked.summary).toMatch(/no longer holds/)
  })

  it("refuses what is not a PDF or cannot be edited", async () => {
    const { add, call, agent } = setup()
    const picture = agent.files.add(
      new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)]),
      "a.png"
    ).id
    await expect(call("crop_pdf", { file: picture, left: 1 })).rejects.toThrow(
      "a.png is not a PDF."
    )
    await expect(
      call("crop_pdf", { file: add({ pages: 1, noEdit: true }), left: 1 })
    ).rejects.toThrow("doc.pdf could not be opened for editing.")
    await expect(
      call("crop_pdf", {
        file: add({ pages: 1 }),
        left: 1,
        lock: { password: "a", ownerPassword: "a" },
      })
    ).rejects.toThrow()
  })

  it("stops while it writes", async () => {
    const { add, agent, client } = setup()
    const id = add({ pages: 1 })
    const run = agent.call(
      "crop_pdf",
      { file: id, left: 1 },
      { caller: "page", id: "w" }
    )
    client().hold = true
    await new Promise((resolve) => setTimeout(resolve, 10))
    agent.stop("w")
    await expect(run).rejects.toThrow("Stopped")
  })
})

describe("organize_pdf_pages", () => {
  it("makes each step as the pages panel does, counting pages as they stand", async () => {
    const { add, call, asked, agent } = setup()
    const id = add({ pages: 4 })
    const other = add({ pages: 2 }, "other.pdf")
    const done = await call("organize_pdf_pages", {
      file: id,
      steps: [
        { do: "turn", pages: "2", by: 90 },
        { do: "delete", pages: "4" },
        { do: "move", pages: "3", to: 1 },
        { do: "copy", pages: "1" },
        { do: "size", pages: "1-2", size: "A4" },
        { do: "blank" },
        { do: "blank", at: 1, size: "Letter" },
        { do: "insert", at: 2 },
        { do: "insert", insert: 1 },
      ],
      insertFiles: [other],
    })
    expect(done.summary).toMatch(/The file now has 10 pages\.$/)
    expect(done.data).toMatchObject({ pages: 10 })
    expect(done.files![0].name).toBe("doc-pages.pdf")
    const ops = asked("pages").map((change) => change.ops[0])
    expect(ops[0]).toEqual({ do: "turn", pages: [1], by: 90 })
    expect(ops[1]).toEqual({ do: "delete", pages: [3] })
    expect(ops[2]).toEqual({ do: "move", pages: [2], to: 0 })
    expect(ops[3]).toEqual({ do: "copy", pages: [0] })
    expect(ops[4]).toMatchObject({
      do: "size",
      pages: [0, 1],
      size: { width: 595.28 },
    })
    expect(ops[5]).toMatchObject({ do: "blank", at: 4 })
    expect(ops[6]).toMatchObject({ do: "blank", at: 0, size: { width: 612 } })
    expect(ops[7]).toMatchObject({ do: "insert", at: 1, count: 2 })
    expect(ops[8]).toMatchObject({ do: "insert", at: 8, count: 2 })
    // The other file was handed over once, for both steps.
    expect(ops[7].file).toBe(ops[8].file)
    void agent
  })

  it("says what a step is missing or cannot do", async () => {
    const { add, call } = setup()
    const id = add({ pages: 3 })
    const step = (one: Record<string, unknown>, more = {}) =>
      call("organize_pdf_pages", { file: id, steps: [one], ...more })
    await expect(step({ do: "turn", pages: "1" })).rejects.toThrow(
      'Step 1 (turn) needs "by".'
    )
    await expect(step({ do: "delete" })).rejects.toThrow(
      'Step 1 (delete) needs "pages".'
    )
    await expect(step({ do: "move", pages: "1" })).rejects.toThrow('needs "to"')
    await expect(step({ do: "size", pages: "1" })).rejects.toThrow(
      'needs "size"'
    )
    await expect(step({ do: "blank", at: 9 })).rejects.toThrow(
      "there are 3 pages, so the place is at most 4"
    )
    await expect(step({ do: "insert" })).rejects.toThrow(
      "names insertFiles 1, which was not given"
    )
    await expect(step({ do: "delete", pages: "1-3" })).rejects.toThrow(
      /^Step 1 \(delete\): /
    )
    await expect(step({ do: "copy", pages: "9" })).rejects.toThrow(
      /^Step 1 \(copy\): /
    )
    const locked = add({ pages: 1, password: "pw" }, "locked.pdf")
    await expect(
      step({ do: "insert" }, { insertFiles: [locked] })
    ).rejects.toThrow(
      'locked.pdf is locked with a password: give it as "insertPassword".'
    )
    await expect(
      step({ do: "insert" }, { insertFiles: [locked], insertPasswords: ["no"] })
    ).rejects.toThrow("The password for locked.pdf is wrong.")
    expect(
      (
        await step(
          { do: "insert" },
          { insertFiles: [locked], insertPasswords: ["pw"] }
        )
      ).summary
    ).toMatch(/4 pages/)
    const broken = add({ pages: 1, broken: true })
    await expect(
      step({ do: "insert" }, { insertFiles: [broken] })
    ).rejects.toThrow("It is damaged.")
  })
})

describe("crop_pdf", () => {
  it("cuts so much off each edge, in the unit asked, or shows the whole page again", async () => {
    const { add, call, asked } = setup()
    const id = add({ pages: 3 })
    const cut = await call("crop_pdf", {
      file: id,
      pages: "2-3",
      top: 1,
      bottom: 2,
      unit: "in",
    })
    expect(cut.summary).toMatch(
      /^Cropped 2 pages\. What was cut off is hidden, not removed/
    )
    expect(asked("pages")[0].ops[0]).toEqual({
      do: "crop",
      pages: [1, 2],
      off: { left: 0, top: 72, right: 0, bottom: 144 },
    })
    const mm = await call("crop_pdf", { file: id, right: 25.4, unit: "mm" })
    expect(asked("pages")[1].ops[0]).toMatchObject({
      pages: [0, 1, 2],
      off: { right: 72 },
    })
    expect(mm.summary).toMatch(/^Cropped 3 pages/)
    const whole = await call("crop_pdf", { file: id, whole: true })
    expect(whole.summary).toMatch(/^The whole sheet of 3 pages shows again\./)
    await expect(call("crop_pdf", { file: id })).rejects.toThrow(
      /Say how much to cut off/
    )
    await expect(call("crop_pdf", { file: id, left: 395 })).rejects.toThrow(
      "That leaves too little of page 1"
    )
  })
})

describe("lines on pages", () => {
  it("writes page numbers in each format, laid out as the editor lays them out", async () => {
    const { add, call, asked, laid, client } = setup()
    const id = add({ pages: 3 })
    const numbered = await call("add_page_numbers", {
      file: id,
      format: "Page 1 of 9",
      startAt: 5,
      pages: "2-3",
    })
    expect(numbered.summary).toMatch(/^Page numbers written on 2 pages\./)
    expect(numbered.files![0].name).toBe("doc-numbered.pdf")
    const [change] = asked("apply")
    expect(change.label).toBe("Write on 2 pages")
    expect(
      change.ops.map((op) => (op.object as { text: string }).text)
    ).toEqual(["Page 5 of 3", "Page 6 of 3"])
    expect(laid).toEqual(["Page 5 of 3", "Page 6 of 3"])
    // Each font goes to the worker once.
    expect(client().fonts).toEqual(["sans"])
    await call("add_page_numbers", { file: id })
    expect((asked("apply")[1].ops[0].object as { text: string }).text).toBe("1")
  })

  it("writes Bates numbers, in a place and look of one's own", async () => {
    const { add, call, asked } = setup()
    const id = add({ pages: 2 })
    const done = await call("add_page_numbers", {
      file: id,
      bates: { prefix: "X-", suffix: "/A", first: 9, figures: 3 },
      position: "top-left",
      size: 12,
      margin: 10,
      font: "serif",
      bold: true,
      colour: "#ff0000",
      keepEditable: true,
    })
    expect(done.summary).toMatch(/^Bates numbers written on 2 pages\./)
    const objects = asked("apply")[0].ops.map(
      (op) => op.object as Record<string, unknown>
    )
    expect(objects.map((object) => object.text)).toEqual(["X-009/A", "X-010/A"])
    expect(objects[0]).toMatchObject({
      font: "serif",
      bold: true,
      size: 12,
      colour: [1, 0, 0],
      align: "left",
    })
    await call("add_page_numbers", { file: id, bates: {} })
    expect((asked("apply")[1].ops[0].object as { text: string }).text).toBe(
      "000001"
    )
    await expect(
      call("add_page_numbers", { file: id, bates: {}, format: "1" })
    ).rejects.toThrow('Give "format" or "bates", not both.')
  })

  it("writes a header or footer with its words filled in", async () => {
    const { add, call, asked } = setup()
    const id = add({ pages: 2 }, "plan.pdf")
    const done = await call("add_header_footer", {
      file: id,
      text: "{name} {page}",
      startAt: 3,
    })
    expect(done.summary).toMatch(/^Written on 2 pages\./)
    expect(
      asked("apply")[0].ops.map((op) => (op.object as { text: string }).text)
    ).toEqual(["plan.pdf 3", "plan.pdf 4"])
    await expect(
      call("add_header_footer", { file: id, text: "   " })
    ).rejects.toThrow("Type what is to be written.")
  })
})

describe("watermark_pdf", () => {
  it("lays words or a picture over pages, and says it does not protect", async () => {
    const { add, call, asked, agent } = setup()
    const id = add({ pages: 2 })
    const words = await call("watermark_pdf", {
      file: id,
      pages: "1",
      colour: "#000000",
      slanted: false,
      opacity: 0.5,
      share: 0.4,
      font: "mono",
      bold: false,
    })
    expect(words.summary).toMatch(
      /^Watermarked 1 page\. A watermark marks a file; it does not protect it\./
    )
    expect(asked("apply")[0].ops[0].object).toMatchObject({
      kind: "text",
      text: "DRAFT",
      opacity: 0.5,
      rotation: 0,
      font: "mono",
      colour: [0, 0, 0],
    })
    const logo = agent.files.add(
      new Blob([new Uint8Array(10)], { type: "image/png" }),
      "logo.png"
    ).id
    await call("watermark_pdf", { file: id, image: logo })
    expect(asked("apply")[1].ops[0].object).toMatchObject({ kind: "picture" })
    const empty = agent.files.add(new Blob([]), "empty.png").id
    await expect(
      call("watermark_pdf", { file: id, image: empty })
    ).rejects.toThrow("This picture could not be read")
    await expect(
      call("watermark_pdf", { file: id, image: logo, text: "X" })
    ).rejects.toThrow('Give "text" or "image", not both.')
    await expect(
      call("watermark_pdf", { file: id, text: "  " })
    ).rejects.toThrow("Type the words of the watermark.")
  })
})

describe("edit_pdf_details", () => {
  it("sets details over the file's own, bookmarks and page labels", async () => {
    const { add, call, asked } = setup()
    const id = add({ pages: 5, title: "Old" })
    const done = await call("edit_pdf_details", {
      file: id,
      subject: "Plans",
      bookmarks: [
        { title: "One", page: 1, children: [{ title: "Two", page: 2 }] },
      ],
      pageLabels: [
        { from: 3, style: "1", prefix: "A-", start: 4 },
        { from: 1, style: "i" },
      ],
    })
    expect(done.summary).toMatch(
      /^Details set\. Bookmarks replaced\. Page labels set\./
    )
    const ops = asked("document")[0].ops
    expect(ops[0]).toEqual({
      do: "details",
      details: { title: "Old", author: "Who", subject: "Plans", keywords: "" },
    })
    expect(ops[1]).toMatchObject({
      do: "bookmarks",
      items: [
        {
          title: "One",
          page: 0,
          children: [{ title: "Two", page: 1, children: [] }],
        },
      ],
    })
    expect(ops[2]).toEqual({
      do: "labels",
      runs: [
        { start: 0, style: "r", prefix: "", first: 1 },
        { start: 2, style: "D", prefix: "A-", first: 4 },
      ],
    })
    const out = await call("edit_pdf_details", { file: id, bookmarks: [] })
    expect(out.summary).toMatch(/^Bookmarks taken out\./)
    await call("edit_pdf_details", {
      file: id,
      title: "New",
      author: "A",
      keywords: "k",
    })
    expect(asked("document")[2].ops[0]).toMatchObject({
      details: { title: "New", author: "A", keywords: "k" },
    })
    await expect(call("edit_pdf_details", { file: id })).rejects.toThrow(
      "Give details, bookmarks or pageLabels to change."
    )
    await expect(
      call("edit_pdf_details", {
        file: id,
        bookmarks: [{ title: "Far", page: 9 }],
      })
    ).rejects.toThrow("The bookmark “Far” leads to page 9, but there are 5.")
    await expect(
      call("edit_pdf_details", {
        file: id,
        pageLabels: [{ from: 9, style: "A" }],
      })
    ).rejects.toThrow(/past the last page/)
  })
})

describe("forms", () => {
  const form: FakeFile = {
    pages: 2,
    fields: [
      [
        field({ name: "name", label: "Your name", maxLength: 5 }),
        field({ name: "agree", kind: "check", on: true }),
        field({ name: "size", kind: "radio" }),
        field({ name: "size", kind: "radio", on: true }),
        field({
          name: "colour",
          kind: "choice",
          options: ["r", "g"],
          shown: ["Red", "Green"],
        }),
      ],
      [
        field({
          name: "pets",
          kind: "list",
          options: ["cat", "dog"],
          multiple: true,
        }),
        field({ name: "free", kind: "choice", options: ["a"], custom: true }),
        field({ name: "one", kind: "list", options: ["x", "y"] }),
        field({ name: "day", date: "dd/mm/yyyy" }),
        field({ name: "sig", kind: "signature" }),
        field({ name: "go", kind: "button" }),
        field({ name: "fixed", readOnly: true }),
      ],
    ],
  }

  it("lists each field once, with what it holds and offers", async () => {
    const { add, call } = setup()
    const listed = await call("list_pdf_form_fields", { file: add(form) })
    expect(listed.files).toBeUndefined()
    expect(listed.summary).toBe("11 fields.")
    const data = listed.data as Record<string, unknown>[]
    expect(data.find((one) => one.name === "size")).toMatchObject({
      kind: "radio",
      value: 2,
      choices: 2,
    })
    expect(data.find((one) => one.name === "agree")).toMatchObject({
      value: true,
    })
    expect(data.find((one) => one.name === "colour")).toMatchObject({
      options: ["Red", "Green"],
    })
    expect(data.find((one) => one.name === "pets")).toMatchObject({
      options: ["cat", "dog"],
      page: 2,
    })
    expect(data.find((one) => one.name === "day")).toMatchObject({
      date: "dd/mm/yyyy",
    })
    expect(data.find((one) => one.name === "sig")).toMatchObject({
      readOnly: true,
    })
    const none = await call("list_pdf_form_fields", {
      file: add({ pages: 1, scripts: true, xfa: true }),
    })
    expect(none.summary).toBe(
      "This PDF has no form fields. The form is also of the XFA kind, which is not read here. Some fields are worked out by scripts, which are never run here."
    )
    const unchosen = await call("list_pdf_form_fields", {
      file: add({ pages: 1, fields: [[field({ name: "r", kind: "radio" })]] }),
    })
    expect((unchosen.data as { value: unknown }[])[0].value).toBeNull()
  })

  it("fills each kind of field as its control would", async () => {
    const { add, call, asked } = setup()
    const id = add(form)
    const done = await call("fill_pdf_form", {
      file: id,
      values: {
        name: "Ada",
        agree: false,
        size: 1,
        colour: "Green",
        pets: "cat\ndog",
        free: "own",
        one: "y",
        day: "2026-10-22",
      },
      flatten: true,
    })
    expect(done.summary).toBe(
      "Filled in 8 fields and made them part of the pages."
    )
    expect(done.files![0].name).toBe("doc-filled.pdf")
    expect(asked("fields")[0].ops).toEqual([
      { do: "fill", page: 0, id: "f0", value: "Ada" },
      { do: "turn", page: 0, id: "f1", on: false },
      { do: "turn", page: 0, id: "f2", on: true },
      { do: "fill", page: 0, id: "f4", value: "g" },
      { do: "fill", page: 1, id: "f10", value: "cat\ndog" },
      { do: "fill", page: 1, id: "f11", value: "own" },
      { do: "fill", page: 1, id: "f12", value: "y" },
      { do: "fill", page: 1, id: "f13", value: "22/10/2026" },
    ])
    const scripted = await call("fill_pdf_form", {
      file: add({ ...form, scripts: true }),
      values: { name: "B" },
    })
    expect(scripted.summary).toBe(
      "Filled in 1 field. Fields worked out by scripts were not worked out: scripts are never run here."
    )
  })

  it("says what cannot be filled, and why", async () => {
    const { add, call } = setup()
    const id = add(form)
    const fill = (values: Record<string, unknown>) =>
      call("fill_pdf_form", { file: id, values })
    await expect(fill({ nope: "x" })).rejects.toThrow(
      /There is no field called “nope”\. The fields are: name, agree/
    )
    await expect(
      call("fill_pdf_form", { file: add({ pages: 1 }), values: { x: "y" } })
    ).rejects.toThrow(/The fields are: none\./)
    await expect(fill({ sig: "x" })).rejects.toThrow(
      "“sig” cannot be filled in: it is a place for a signature."
    )
    await expect(fill({ go: "x" })).rejects.toThrow("it is a button")
    await expect(fill({ fixed: "x" })).rejects.toThrow("it is read-only")
    await expect(fill({ agree: "yes" })).rejects.toThrow(
      "“agree” is a tick box: give true or false."
    )
    await expect(fill({ size: 3 })).rejects.toThrow(
      "give the number of the choice, 1 to 2"
    )
    await expect(fill({ size: "1" })).rejects.toThrow("round buttons")
    await expect(fill({ colour: "Blue" })).rejects.toThrow(
      "“colour” offers: Red, Green."
    )
    await expect(fill({ one: "z" })).rejects.toThrow("“one” offers: x, y.")
    await expect(fill({ one: "x\ny" })).rejects.toThrow(
      "“one” takes one choice."
    )
    await expect(fill({ day: "2026-02-30" })).rejects.toThrow(
      "2026-02-30 is not a day."
    )
    await expect(fill({ name: "Adaline" })).rejects.toThrow(
      "“name” takes at most 5 letters."
    )
    expect((await fill({ day: "22 Oct" })).summary).toBe("Filled in 1 field.")
  })
})

describe("verify_pdf_signatures", () => {
  const signature = (
    overrides: Partial<FoundSignature>
  ): Partial<FoundSignature> => ({
    field: "Client",
    page: 0,
    shown: true,
    kind: "adbe.pkcs7.detached",
    time: "2026-10-14T16:00:00.000Z",
    name: "Sam",
    reason: "Agreed",
    location: "Leeds",
    whole: true,
    changes: null,
    verdict: {
      checked: true,
      intact: true,
      signer: null,
      problem: "",
      trust: null,
    },
    ...overrides,
  })

  it("says what each signature is, in the editor's words", async () => {
    const { add, call } = setup()
    const checked = await call("verify_pdf_signatures", {
      file: add({
        pages: 1,
        signatures: [
          signature({}),
          signature({
            field: "Witness",
            page: null,
            whole: false,
            verdict: { checked: false, why: "Its kind is not read here." },
            changes: {
              updates: 1,
              pagesAdded: 0,
              pagesRemoved: 0,
              pagesChanged: [],
              commentsAdded: 1,
              commentsRemoved: 0,
              fieldsChanged: [],
              signaturesAdded: [],
              detailsChanged: false,
            },
          }),
        ],
      }),
    })
    expect(checked.files).toBeUndefined()
    expect(checked.summary).toBe(
      "2 signatures: 1 still holds. Trust in a certificate is for the reader to judge."
    )
    const [first, second] = checked.data as Record<string, unknown>[]
    expect(first).toMatchObject({
      field: "Client",
      page: 1,
      holds: true,
      signer: ["It gives the name Sam."],
      changedAfter: null,
    })
    expect(second).toMatchObject({
      page: null,
      holds: false,
      verdict: "Its kind is not read here.",
      changedAfter: expect.stringContaining("1 comment added"),
    })
    const two = await call("verify_pdf_signatures", {
      file: add({ pages: 1, signatures: [signature({}), signature({})] }),
    })
    expect(two.summary).toMatch(/^2 signatures: 2 still hold\./)
    const none = await call("verify_pdf_signatures", {
      file: add({ pages: 1 }),
    })
    expect(none.summary).toBe("This PDF carries no digital signature.")
    await expect(
      call("verify_pdf_signatures", {
        file: add({ pages: 1, title: "unreadable" }),
      })
    ).rejects.toThrow("The signatures of this file could not be read.")
  })
})

describe("redact_pdf", () => {
  const letter: FakeFile = {
    pages: 3,
    redact: {
      secret: [
        { page: 0, text: "secret" },
        { page: 2, text: "secret" },
      ],
      email: [{ page: 0, text: "a@b.co" }],
      "###-####": [{ page: 1, text: "555-1234" }],
    },
  }

  it("marks every place found, applies the marks and writes the file anew", async () => {
    const { add, call, asked, client } = setup()
    const id = add({ ...letter, signed: true, after: true })
    const done = await call("redact_pdf", {
      file: id,
      words: ["secret"],
      patterns: ["email"],
      shapes: ["###-####"],
      matchCase: true,
      removeDetails: true,
    })
    expect(done.summary).toMatch(
      /^4 places on 3 pages were emptied for good \(“secret”: 2; e-mail addresses: 1; the shape “###-####”: 1\): the letters, pictures and drawings under them are gone/
    )
    expect(done.files![0].name).toBe("doc-redacted.pdf")
    const [marks, applying] = asked("redact")
    expect(marks.label).toBe("Mark 4 places")
    expect(marks.ops).toHaveLength(4)
    expect(applying.ops).toEqual([{ do: "apply" }])
    // Never written after a signature: what was taken out would stay beneath.
    expect(client().exports[0]).toMatchObject({
      after: false,
      clean: { details: true, attachments: false, scripts: false },
    })
    expect(done.summary).toMatch(/its signature no longer holds/)
    expect(done.data).toMatchObject({ places: 4, pages: 3, residue: 0 })
  })

  it("says what is still drawn, when there were more, and takes drawings whole", async () => {
    const { add, call, asked } = setup()
    const one = await call("redact_pdf", {
      file: add({
        pages: 1,
        redact: { x: [{ page: 0, text: "x" }] },
        residue: 1,
        more: true,
      }),
      words: ["x"],
      wholeDrawings: true,
    })
    expect(one.summary).toMatch(
      /^1 place on 1 page was emptied for good \(“x”: 1\): the letters, pictures and drawings under it are gone/
    )
    expect(one.summary).toMatch(
      /There were more places than are looked through at once/
    )
    expect(one.summary).toMatch(/Under 1 mark something is still drawn/)
    expect(asked("redact")[1].ops).toEqual([{ do: "apply", touched: true }])
  })

  it("writes nothing when nothing is found, and says what it needs", async () => {
    const { add, call } = setup()
    const id = add(letter)
    const nothing = await call("redact_pdf", { file: id, words: ["absent"] })
    expect(nothing.files).toBeUndefined()
    expect(nothing.summary).toMatch(
      /^Nothing was taken out: none of “absent” was found/
    )
    await expect(call("redact_pdf", { file: id })).rejects.toThrow(
      'Say what to take out: "words", "patterns" or "shapes".'
    )
    await expect(
      call("redact_pdf", { file: id, shapes: ["***"] })
    ).rejects.toThrow(/cannot be looked for/)
    await expect(
      call("redact_pdf", {
        file: add({ pages: 1, title: "unsearchable" }),
        words: ["x"],
      })
    ).rejects.toThrow("The file could not be looked through.")
  })
})

describe("find_replace_pdf_text", () => {
  it("changes every place, with the stand-in fonts ready first", async () => {
    const { add, call, asked, client } = setup()
    const id = add({
      pages: 2,
      find: [
        { page: 0, text: "Hello world", spans: [[6, 11]], fonts: ["serif"] },
        {
          page: 1,
          text: "world and world",
          spans: [
            [0, 5],
            [10, 15],
          ],
          fonts: ["serif", "mono"],
          block: true,
        },
      ],
    })
    const done = await call("find_replace_pdf_text", {
      file: id,
      find: "world",
      replace: "there",
      wholeWords: true,
    })
    expect(done.summary).toBe("3 places changed, as one step.")
    expect(client().fonts).toEqual(["serif", "mono"])
    const [change] = asked("replace")
    expect(change.ops[0]).toMatchObject({
      do: "retext",
      page: 0,
      text: "Hello there",
    })
    expect(change.ops[1]).toMatchObject({
      do: "reflow",
      page: 1,
      text: "there and there",
    })
    expect(done.data).toMatchObject({ places: 3, changed: 3, refused: [] })
  })

  it("says what was left as it was, and when it cannot count", async () => {
    const { add, call } = setup()
    const found = [
      { page: 0, text: "Hello world", spans: [[6, 11]] as [number, number][] },
    ]
    const one = await call("find_replace_pdf_text", {
      file: add({
        pages: 1,
        find: found,
        refuse: ["The font has no shape for é."],
        more: true,
      }),
      find: "world",
      replace: "wörld",
    })
    expect(one.summary).toBe(
      "0 of 1 place changed. 1 line or paragraph was left as it was: The font has no shape for é. There were more places than are looked through at once: run it again for the rest."
    )
    const two = await call("find_replace_pdf_text", {
      file: add({ pages: 1, find: found, refuse: ["a", "b"] }),
      find: "world",
      replace: "big world",
    })
    expect(two.summary).toBe(
      "Some of 1 place changed. 2 lines or paragraphs were left as they were: a"
    )
    const none = await call("find_replace_pdf_text", {
      file: add({ pages: 1 }),
      find: "x",
      replace: "y",
    })
    expect(none.summary).toBe(
      "“x” is not in the words of this file; nothing was changed."
    )
    await expect(
      call("find_replace_pdf_text", {
        file: add({ pages: 1, title: "unsearchable" }),
        find: "x",
        replace: "y",
      })
    ).rejects.toThrow("could not be looked through")
  })
})

describe("text and pictures", () => {
  it("adds a text box where it is asked, in its look", async () => {
    const { add, call, asked, client } = setup()
    const id = add({ pages: 2 })
    const done = await call("add_text_to_pdf", {
      file: id,
      page: 2,
      x: 10,
      y: 20,
      text: "Approved",
      size: 14,
      font: "serif",
      bold: true,
      italic: true,
      colour: "#00786f",
      align: "centre",
      rotation: 5,
      opacity: 0.8,
    })
    expect(done.summary).toMatch(/^Text added to page 2\./)
    const op = asked("apply")[0].ops[0]
    expect(op).toMatchObject({ do: "add", page: 1 })
    expect(op.object).toMatchObject({
      kind: "text",
      text: "Approved",
      box: { x: 10, y: 20, width: 354 },
      font: "serif",
      bold: true,
      italic: true,
      size: 14,
      align: "centre",
      rotation: 5,
      opacity: 0.8,
    })
    expect(client().fonts).toEqual(["serif-bold-italic"])
    await call("add_text_to_pdf", {
      file: id,
      page: 1,
      x: 380,
      y: 0,
      text: "Edge",
      width: 15,
    })
    expect(asked("apply")[1].ops[0].object).toMatchObject({
      box: { width: 15 },
      font: "sans",
      colour: [0, 0, 0],
      align: "left",
    })
    client().lacking = ["ß"]
    const lacking = await call("add_text_to_pdf", {
      file: id,
      page: 1,
      x: 0,
      y: 0,
      text: "Straße",
    })
    expect(lacking.summary).toMatch(
      /The font has no shape for ß; it is left out\./
    )
    client().lacking = ["a", "b"]
    expect(
      (
        await call("add_text_to_pdf", {
          file: id,
          page: 1,
          x: 0,
          y: 0,
          text: "ab",
        })
      ).summary
    ).toMatch(/they are left out/)
    await expect(
      call("add_text_to_pdf", { file: id, page: 3, x: 0, y: 0, text: "x" })
    ).rejects.toThrow("There are 2 pages; page 3 is not one of them.")
    await expect(
      call("add_text_to_pdf", { file: id, page: 1, x: 500, y: 0, text: "x" })
    ).rejects.toThrow("That place is off page 1, which is 400 by 600 points.")
  })

  it("places a picture in its own proportions", async () => {
    const { add, call, asked, agent } = setup()
    const id = add({ pages: 1 })
    const logo = agent.files.add(new Blob([new Uint8Array(4)]), "logo.png").id
    const natural = await call("add_image_to_pdf", {
      file: id,
      image: logo,
      page: 1,
      x: 0,
      y: 0,
    })
    // 30 by 20 pixels at 150 to the inch.
    expect(natural.summary).toBe("Picture placed on page 1, 14 by 10 points.")
    await call("add_image_to_pdf", {
      file: id,
      image: logo,
      page: 1,
      x: 0,
      y: 0,
      height: 40,
      opacity: 0.5,
      rotation: 90,
    })
    expect(asked("apply")[1].ops[0].object).toMatchObject({
      kind: "picture",
      box: { width: 60, height: 40 },
      opacity: 0.5,
      rotation: 90,
    })
    await call("add_image_to_pdf", {
      file: id,
      image: logo,
      page: 1,
      x: 0,
      y: 0,
      width: 90,
      height: 10,
    })
    expect(asked("apply")[2].ops[0].object).toMatchObject({
      box: { width: 90, height: 10 },
    })
    await expect(
      call("add_image_to_pdf", { file: id, image: logo, page: 2, x: 0, y: 0 })
    ).rejects.toThrow(/page 2 is not one of them/)
  })
})

describe("ocr_pdf", () => {
  it("reads scans with Tesseract, lays the words as one step and lets Tesseract go", async () => {
    const { add, call, asked } = setup()
    ocr.mode = "reads"
    ocr.stopped = 0
    const id = add({ pages: 3, hasText: [1], undrawn: [2] })
    const done = await call("ocr_pdf", { file: id, languages: ["eng", "deu"] })
    expect(done.summary).toMatch(/^Words were recognised on page 1/)
    expect(done.files![0].name).toBe("doc-ocr.pdf")
    expect(asked("ocr")[0].label).toBe("Recognise text on page 1")
    expect(done.data).toMatchObject({ read: [0], hadText: [1], failed: [2] })
    expect(ocr.stopped).toBe(1)
    const also = await call("ocr_pdf", { file: id, pages: "2", alsoText: true })
    expect(also.data).toMatchObject({ read: [1] })
  })

  it("writes nothing when nothing was read, and says when Tesseract cannot load", async () => {
    const { add, call } = setup()
    ocr.mode = "reads"
    const typed = await call("ocr_pdf", {
      file: add({ pages: 1, hasText: [0] }),
    })
    expect(typed.files).toBeUndefined()
    ocr.mode = "fails"
    await expect(call("ocr_pdf", { file: add({ pages: 1 }) })).rejects.toThrow(
      /could not be loaded/
    )
    ocr.mode = "reads"
  })

  it("stops in the middle of a page without waiting for Tesseract", async () => {
    const { add, agent } = setup()
    ocr.mode = "hangs"
    const running = agent.call(
      "ocr_pdf",
      { file: add({ pages: 2 }) },
      { caller: "page", id: "o" }
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
    agent.stop("o")
    await expect(running).rejects.toThrow("Stopped")
    ocr.mode = "reads"
  })

  it("says how many recognised words were read back", () => {
    const report = (ocr: unknown) =>
      ({
        text: { boxes: 0, found: 0 },
        untouched: { checked: 0, differ: [] },
        ocr,
      }) as never
    expect(
      checksSaid(report({ pages: 1, words: 9, checked: 9, found: 9 }))
    ).toEqual(["Checked: the 9 recognised words read back from the file."])
    expect(
      checksSaid(report({ pages: 1, words: 9, checked: 9, found: 7 }))
    ).toEqual(["Only 7 of 9 recognised words read back from the file."])
  })
})
