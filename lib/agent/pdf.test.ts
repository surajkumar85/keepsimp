import { describe, expect, it } from "vitest"
import { FakePdfClient, fakePdf } from "@/tests/agent-pdf-fake"
import { Agent } from "./agent"
import { lockOf, MOST_PART_FILES, pdfTools } from "./pdf"
import { PdfEngine } from "./pdf-engine"
import type { ToolResult } from "./registry"

function setup() {
  let client!: FakePdfClient
  const engine = new PdfEngine((onFile) => (client = new FakePdfClient(onFile)))
  const agent = new Agent(pdfTools(engine))
  const add = (file: Parameters<typeof fakePdf>[0], name = "doc.pdf") =>
    agent.files.add(fakePdf(file), name).id
  const call = (name: string, input: unknown) =>
    agent.call(name, input, { caller: "page" })
  return { agent, client, engine, add, call }
}

const PNG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13)
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"/>'
)

describe("the lock", () => {
  it("is checked by the merger's rules, with a second password for limits", () => {
    expect(lockOf(undefined)).toBeNull()
    expect(lockOf({ password: "open" })).toEqual({
      password: "open",
      ownerPassword: "open",
      permissions: -3904 | 512 | 4 | 2048 | 16 | 8 | 32 | 256 | 1024,
    })
    const limited = lockOf({ password: "open", allowCopy: false })!
    expect(limited.ownerPassword).not.toBe("open")
    expect(limited.ownerPassword.length).toBeGreaterThan(20)
    expect(
      lockOf({
        password: "a",
        ownerPassword: "b",
        allowPrint: false,
        allowChanges: false,
      })
    ).toMatchObject({
      ownerPassword: "b",
      permissions: -3904 | 512 | 16,
    })
    expect(() => lockOf({ password: "same", ownerPassword: "same" })).toThrow(
      /must differ/
    )
  })
})

describe("pdf_info", () => {
  it("tells what a file holds, with the text asked for", async () => {
    const { add, call, client } = setup()
    const id = add({
      pages: 3,
      title: "Report",
      signed: true,
      empty: [2],
      bookmarks: [
        {
          title: "One ",
          uri: "",
          page: 0,
          open: true,
          children: [
            { title: "Inside", uri: "", page: 1, open: true, children: [] },
          ],
        },
        {
          title: "Away",
          uri: "https://x",
          page: null,
          open: true,
          children: [],
        },
      ],
    })
    const plain = await call("pdf_info", { file: id })
    expect(plain.summary).toBe("3 pages, “Report”. It is signed.")
    expect(plain.data).toMatchObject({
      pages: 3,
      title: "Report",
      author: "",
      signed: true,
      sizes: [
        { width: 595.3, height: 841.9 },
        expect.anything(),
        expect.anything(),
      ],
      bookmarks: [
        { title: "One", page: 1, level: 1 },
        { title: "Inside", page: 2, level: 2 },
      ],
      attachments: 0,
    })
    expect(
      (plain.data as object as Record<string, unknown>).text
    ).toBeUndefined()
    const text = await call("pdf_info", { file: id, text: "all" })
    expect(text.summary).toMatch(
      /Text of 3 pages; 1 page without text \(perhaps scanned\)\.$/
    )
    expect(
      (text.data as { text: { page: number; text: string }[] }).text[0]
    ).toEqual({
      page: 1,
      text: "Page 1\nxxx",
    })
    const some = await call("pdf_info", { file: id, text: "2" })
    expect(some.summary).toMatch(/Text of 1 page\.$/)
    expect(client.closed.length).toBe(3)
  })

  it("opens locked files with their password, and says what is wrong", async () => {
    const { add, call, agent } = setup()
    const locked = add({ pages: 1, password: "pw" })
    await expect(call("pdf_info", { file: locked })).rejects.toThrow(
      'doc.pdf is locked with a password: give it as "password".'
    )
    await expect(
      call("pdf_info", { file: locked, password: "no" })
    ).rejects.toThrow("The password for doc.pdf is wrong.")
    expect(
      (await call("pdf_info", { file: locked, password: "pw" })).summary
    ).toMatch(/It was locked; the password opened it\./)
    const broken = add({ pages: 1, broken: true })
    await expect(call("pdf_info", { file: broken })).rejects.toThrow(
      "doc.pdf could not be opened: it is damaged"
    )
    const empty = agent.files.add(new Blob([]), "empty.pdf").id
    await expect(call("pdf_info", { file: empty })).rejects.toThrow(
      "empty.pdf is empty."
    )
    const picture = agent.files.add(new Blob([PNG]), "a.png").id
    await expect(call("pdf_info", { file: picture })).rejects.toThrow(
      "a.png is not a PDF."
    )
    const big = agent.files.add(
      new Blob([new Uint8Array(301 * 1024 * 1024)]),
      "big.pdf"
    ).id
    await expect(call("pdf_info", { file: big })).rejects.toThrow(
      "larger than 300 MB"
    )
    const plain = add({ pages: 200 })
    await expect(
      call("pdf_info", { file: plain, text: "all" })
    ).rejects.toThrow(/at most 100 pages/)
    await expect(
      call("pdf_info", { file: plain, text: "500" })
    ).rejects.toThrow(/^text: /)
  })

  it("cuts long text off, and copes with a page whose text cannot be read", async () => {
    const { add, call, client, engine } = setup()
    const long = add({ pages: 3, title: "long" })
    const result = await call("pdf_info", { file: long, text: "1-3" })
    expect(result.summary).toMatch(/cut off at 200,000 characters/)
    const text = (result.data as { text: { text: string }[] }).text
    expect(text).toHaveLength(2)
    expect(text.map((page) => page.text.length).reduce((a, b) => a + b)).toBe(
      200_000
    )
    // A page that cannot be read gives no text; a missing layout is a problem.
    const { id } = await engine.open(fakePdf({ pages: 100 }), "x.pdf")
    expect(await engine.text(id, 99)).toBe("")
    await expect(engine.layout("nothing")).rejects.toThrow(/could not be read/)
    void client
  })
})

describe("merge_pdfs", () => {
  it("joins files in order, with their chosen pages, turns and details", async () => {
    const { add, call, agent, client } = setup()
    const a = add({ pages: 3 }, "a.pdf")
    const b = add({ pages: 2, password: "pw" }, "b.pdf")
    const picture = agent.files.add(new Blob([PNG]), "photo.png").id
    const result = await call("merge_pdfs", {
      files: [a, b, picture],
      pages: ["2-3", "", "all"],
      rotate: [0, 90, 0],
      passwords: ["", "pw", ""],
      name: "together.pdf",
      title: "Both",
      bookmarks: "files",
      pageNumbers: "of",
      picturePage: "a4",
      lock: { password: "secret" },
    })
    expect(result.summary).toBe(
      "Merged 3 files into 5 pages with 2 bookmarks, locked with the password given. Checked: it opens with every page."
    )
    expect(result.files![0].name).toBe("together.pdf")
    const order = client.merges[0]
    expect(order.pages).toEqual([
      { file: "agent-1", page: 1, rotation: 0 },
      { file: "agent-1", page: 2, rotation: 0 },
      { file: "agent-2", page: 0, rotation: 90 },
      { file: "agent-2", page: 1, rotation: 90 },
      { file: "agent-3", page: 0, rotation: 0 },
    ])
    expect(order.names).toEqual({
      "agent-1": "a",
      "agent-2": "b",
      "agent-3": "photo",
    })
    expect(order).toMatchObject({
      bookmarks: "files",
      picturePage: "a4",
      pictureMargin: "small",
      details: { title: "Both", author: "" },
      print: { numbers: "of" },
      lock: { password: "secret" },
    })
    expect(client.closed).toEqual(
      expect.arrayContaining(["agent-1", "agent-2", "agent-3", "agent-4"])
    )
  })

  it("takes defaults, and refuses what cannot be merged", async () => {
    const { add, call, agent, client } = setup()
    const a = add({ pages: 2 })
    const plain = await call("merge_pdfs", { files: [a], bookmarks: "none" })
    expect(plain.summary).toBe(
      "Merged 1 file into 2 pages. Checked: it opens with every page."
    )
    expect(plain.files![0].name).toBe("merged.pdf")
    expect(client.merges[0]).toMatchObject({
      bookmarks: "none",
      forms: "keep",
      labels: "continuous",
      attachments: true,
      lock: null,
    })
    await expect(
      call("merge_pdfs", { files: [a, a], pages: ["1"] })
    ).rejects.toThrow('Give "pages" one entry for each of the 2 files.')
    await expect(
      call("merge_pdfs", {
        files: [a],
        title: "x".repeat(400),
        author: "y".repeat(501),
      })
    ).rejects.toThrow()
    await expect(
      call("merge_pdfs", { files: [a], pages: ["5"] })
    ).rejects.toThrow(/^doc\.pdf: /)
    const svg = agent.files.add(new Blob([SVG]), "a.svg").id
    await expect(call("merge_pdfs", { files: [svg] })).rejects.toThrow(
      "a.svg is not a PDF or a picture KeepSimp can add as a page."
    )
    const huge = add({ pages: 3000 })
    await expect(call("merge_pdfs", { files: [huge, huge] })).rejects.toThrow(
      /at most 5,000/
    )
    const short = await call("merge_pdfs", {
      files: [a],
      title: "short",
    }).catch((error: Error) => error)
    expect((short as Error).message).toMatch(/opened with 1 pages instead of 2/)
  })

  it("is stopped when asked", async () => {
    const { add, agent, client } = setup()
    const a = add({ pages: 2 })
    client.hold = true
    const running = agent.call(
      "merge_pdfs",
      { files: [a] },
      { caller: "page", id: "m" }
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    agent.stop("m")
    await expect(running).rejects.toThrow("Stopped before it was done.")
    expect(client.cancelled).toBe(1)
  })
})

describe("split_pdf", () => {
  async function parts(
    input: Record<string, unknown>,
    file: Parameters<typeof fakePdf>[0] = { pages: 6 }
  ) {
    const { add, call, client, agent } = setup()
    const id = add(file, "book.pdf")
    const result = await call("split_pdf", { file: id, ...input })
    return { result, client, agent }
  }
  const pagesOf = (result: ToolResult) =>
    (result.data as { parts: { from: number; to: number }[] }).parts.map(
      (part) => [part.from, part.to]
    )

  it("splits by every way the splitter does", async () => {
    expect(pagesOf((await parts({ mode: "every", every: 4 })).result)).toEqual([
      [1, 4],
      [5, 6],
    ])
    expect(pagesOf((await parts({ mode: "parts", parts: 3 })).result)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
    expect(
      pagesOf((await parts({ mode: "single" }, { pages: 2 })).result)
    ).toEqual([
      [1, 1],
      [2, 2],
    ])
    expect(
      pagesOf((await parts({ mode: "ranges", ranges: "1-2, 5-6" })).result)
    ).toEqual([
      [1, 2],
      [5, 6],
    ])
    expect(pagesOf((await parts({ mode: "oddeven" })).result)).toEqual([
      [1, 5],
      [2, 6],
    ])
    expect(
      pagesOf((await parts({ mode: "extract", pages: "2, 4" })).result)
    ).toEqual([[2, 4]])
    expect(
      pagesOf((await parts({ mode: "remove", pages: "1" })).result)
    ).toEqual([[2, 6]])
    const bookmarks = await parts(
      { mode: "bookmarks", front: "join" },
      {
        pages: 6,
        bookmarks: [
          { title: "Start", uri: "", page: 2, open: true, children: [] },
          { title: "End", uri: "", page: 4, open: true, children: [] },
        ],
      }
    )
    expect(pagesOf(bookmarks.result)).toEqual([
      [1, 4],
      [5, 6],
    ])
    expect(bookmarks.result.files!.map((file) => file.name)).toEqual([
      "book-1.pdf",
      "book-2.pdf",
    ])
    const blank = await parts(
      { mode: "blank", sensitivity: "normal", blankPages: "drop" },
      { pages: 5, ink: [0.2, 0.2, 0, 0.2, 0.2] }
    )
    expect(pagesOf(blank.result)).toEqual([
      [1, 2],
      [4, 5],
    ])
    const text = await parts(
      { mode: "text", words: "Invoice" },
      { pages: 5, words: { Invoice: [0, 3] } }
    )
    expect(pagesOf(text.result)).toEqual([
      [1, 3],
      [4, 5],
    ])
    const named = await parts({
      mode: "every",
      every: 3,
      pattern: "{name} p{from}-{to}",
    })
    expect(named.result.files!.map((file) => file.name)).toEqual([
      "book-p1-3.pdf",
      "book-p4-6.pdf",
    ])
  })

  it("splits by size, saying which part is over it", async () => {
    const { result, client } = await parts(
      { mode: "size", maxMegabytes: 1.5 },
      { pages: 5 }
    )
    expect(client.splits[0].limit).toBe(1572864)
    expect(pagesOf(result)).toEqual([
      [1, 2],
      [3, 4],
      [5, 5],
    ])
    expect(result.summary).toMatch(/2 parts are one page over the size/)
    const more = await parts({ mode: "size", maxMegabytes: 1 }, { pages: 1 })
    expect(more.result.summary).toMatch(/1 part is one page over/)
  })

  it("keeps what is asked, locks and zips", async () => {
    const { result, client, agent } = await parts(
      {
        mode: "single",
        keepBookmarks: false,
        keepLabels: false,
        keepDetails: false,
        attachments: "all",
        zip: true,
        lock: { password: "pw" },
      },
      { pages: 3 }
    )
    expect(client.splits[0].keep).toEqual({
      bookmarks: false,
      labels: false,
      details: false,
      attachments: "all",
      lock: expect.objectContaining({ password: "pw" }),
    })
    expect(result.summary).toBe(
      "Split book.pdf into 3 parts, in one ZIP. Checked: each part has the pages it was meant to."
    )
    expect(result.files).toHaveLength(1)
    const zip = agent.files.get(result.files![0].id)
    expect(zip.ref.name).toBe("book-split.zip")
    expect(zip.ref.type).toBe("application/zip")
    const many = await parts({ mode: "single" }, { pages: MOST_PART_FILES + 1 })
    expect(many.result.files).toHaveLength(1)
    const few = await parts({ mode: "single" }, { pages: MOST_PART_FILES })
    expect(few.result.files).toHaveLength(MOST_PART_FILES)
    expect(few.client.splits[0].keep).toMatchObject({
      bookmarks: true,
      labels: true,
      details: true,
      attachments: "first",
      lock: null,
    })
  })

  it("says what is missing or wrong, and checks every part", async () => {
    await expect(parts({ mode: "every" })).rejects.toThrow(
      'Splitting by every needs "every".'
    )
    await expect(parts({ mode: "text" })).rejects.toThrow(
      'Splitting by text needs "words".'
    )
    await expect(parts({ mode: "ranges", ranges: "9" })).rejects.toThrow()
    await expect(parts({ mode: "bookmarks" })).rejects.toThrow(/no bookmarks/)
    await expect(
      parts({ mode: "blank" }, { pages: 2, ink: [0.3, 0.3] })
    ).rejects.toThrow(/No blank pages/)
    await expect(
      parts({ mode: "every", every: 2, pattern: "{nope}" })
    ).rejects.toThrow()
    await expect(parts({ mode: "single" }, { pages: 6000 })).rejects.toThrow(
      /6,000 pages/
    )
    await expect(
      parts({ mode: "every", every: 2 }, { pages: 4, title: "wrong" })
    ).rejects.toThrow(
      "Part 2 came out with 3 pages instead of 2, so nothing is handed over."
    )
  })

  it("stops while it looks for pages, and while it writes", async () => {
    for (const input of [
      { mode: "blank" },
      { mode: "text", words: "x" },
      { mode: "single" },
      { mode: "size", maxMegabytes: 1 },
    ]) {
      const { add, agent, client } = setup()
      const id = add({ pages: 3, ink: [1, 0, 1] })
      client.hold = true
      const running = agent.call(
        "split_pdf",
        { file: id, ...input },
        { caller: "page", id: "s" }
      )
      await new Promise((resolve) => setTimeout(resolve, 5))
      agent.stop("s")
      await expect(running).rejects.toThrow("Stopped before it was done.")
    }
  })
})

describe("compress_pdf", () => {
  it("compresses at a level, saying what changed and what was checked", async () => {
    const { add, call, client } = setup()
    const id = add({ pages: 4 }, "big.pdf")
    const result = await call("compress_pdf", {
      file: id,
      scans: "layers",
      remove: { details: true },
      lock: { password: "pw" },
    })
    expect(result.summary).toBe(
      "0.95 MB became 0.38 MB (60% smaller). Checked: 4 pages look the same before and after. Locked with the password given."
    )
    expect(result.files![0].name).toBe("big-compressed.pdf")
    expect(client.compressions[0]).toMatchObject({
      how: "balanced",
      scans: "layers",
      remove: { details: true, tags: false },
      lock: { password: "pw" },
      maxPixels: 40_000_000,
    })
    expect(result.data).toMatchObject({
      before: 1_000_000,
      after: 400_000,
      looksTheSame: true,
      taken: ["details"],
    })
  })

  it("says when a file is already as small, and takes custom settings and sizes", async () => {
    const { add, call, client } = setup()
    const id = add({ pages: 4 })
    const same = await call("compress_pdf", {
      file: id,
      level: "lossless",
      scans: "mono",
    })
    expect(same.files).toBeUndefined()
    expect(same.summary).toMatch(/already as small as this level/)
    expect(client.compressions[0]).toMatchObject({
      how: "lossless",
      scans: "keep",
      remove: null,
    })
    await call("compress_pdf", { file: id, custom: { dpi: 96, quality: 50 } })
    expect(client.compressions[1].how).toEqual({
      custom: { dpi: 96, quality: 50, grey: false, fonts: true },
    })
    const sized = await call("compress_pdf", {
      file: id,
      targetMegabytes: 0.25,
      further: true,
    })
    expect(client.compressions[2].how).toEqual({
      target: 262144,
      further: true,
    })
    expect(sized.summary).toMatch(/could not get under the size asked for/)
    const met = await call("compress_pdf", { file: id, targetMegabytes: 1 })
    expect(met.summary).not.toMatch(/could not/)
    expect(met.data).toMatchObject({ target: { wanted: 1048576, met: true } })
    const grey = await call("compress_pdf", { file: id, scans: "grey" })
    expect(grey.summary).toMatch(/differ only as you asked/)
    await expect(
      call("compress_pdf", { file: id, level: "strong", targetMegabytes: 1 })
    ).rejects.toThrow(/Give one of/)
  })

  it("says nothing of a check that did not happen", async () => {
    const { add, call } = setup()
    const id = add({ pages: 1, title: "unchecked" })
    const result = await call("compress_pdf", { file: id })
    expect(result.summary).toBe("0.95 MB became 0.38 MB (60% smaller).")
    expect(result.data).toMatchObject({ checked: 0, looksTheSame: null })
  })

  it("says when a page changed more than expected", async () => {
    const { add, call } = setup()
    const id = add({ pages: 4, title: "changed" })
    const result = await call("compress_pdf", { file: id })
    expect(result.summary).toMatch(/changed more than expected: page 2/)
    expect(result.data).toMatchObject({ looksTheSame: false })
  })

  it("is stopped when asked, and when the call was stopped before it began", async () => {
    const { add, agent, client } = setup()
    const id = add({ pages: 2 })
    client.hold = true
    const running = agent.call(
      "compress_pdf",
      { file: id },
      { caller: "page", id: "c" }
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    agent.stop("c")
    await expect(running).rejects.toThrow("Stopped")
  })
})

describe("the engine", () => {
  it("ignores files it did not open, and stops a job asked to stop before it starts", async () => {
    let client!: FakePdfClient
    const engine = new PdfEngine(
      (onFile) => (client = new FakePdfClient(onFile))
    )
    client.onFile({ type: "opened", id: "someone-else", facts: {} as never })
    const { id } = await engine.open(fakePdf({ pages: 2 }), "a.pdf")
    const stopped = new AbortController()
    stopped.abort()
    await expect(
      engine.merge(
        {
          pages: [{ file: id, page: 0, rotation: 0 }],
          details: { title: "" },
        } as never,
        stopped.signal,
        () => undefined
      )
    ).rejects.toThrow("Stopped.")
    expect(client.cancelled).toBe(1)
  })
})
