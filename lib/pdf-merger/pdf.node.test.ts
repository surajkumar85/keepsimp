// @vitest-environment node
/**
 * Runs the merger with the real engine. The files that go in are written by
 * pdf-lib and the results are read back by pdf.js, so the engine is never
 * only checked against itself.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { afterEach, describe, expect, it } from "vitest"
import {
  damage,
  makePdf,
  pageText,
  type FixtureOptions,
} from "@/tests/pdf-fixtures"
import { readPdf, texts } from "@/tests/pdf-reader"
import {
  closePdf,
  mergePdfs,
  NO_PAGES,
  openPdf,
  PasswordNeeded,
  renderPage,
  UNREADABLE,
  type MergeInput,
  type OpenedPdf,
} from "./mupdf-engine"
import type { BookmarkPolicy } from "./outline"

const opened: OpenedPdf[] = []
afterEach(() => {
  for (const pdf of opened.splice(0)) closePdf(pdf)
})

const open = (bytes: Uint8Array, password?: string) => {
  const pdf = openPdf(mupdf, bytes, password)
  opened.push(pdf)
  return pdf
}
const source = async (tag: string, options: FixtureOptions = {}) =>
  open(await makePdf(tag, options), options.password?.user)
const all = (pdf: OpenedPdf) =>
  Array.from({ length: pdf.facts.pages }, (_, index) => index)
const part = (
  pdf: OpenedPdf,
  name: string,
  pages: number[] = all(pdf),
  rotation: MergeInput["rotation"] = 0
): MergeInput => ({ pdf, name, pages, rotation })
const merge = async (
  inputs: MergeInput[],
  bookmarks: BookmarkPolicy = "nested"
) => (await mergePdfs(mupdf, inputs, { bookmarks })).bytes

describe("opening", () => {
  it("reports what a file holds", async () => {
    const pdf = await source("A", {
      pages: 3,
      title: "Annual report",
      size: (page) => [300 + page, 400],
      bookmarks: [
        { title: "One", page: 1, children: [{ title: "Two", page: 2 }] },
      ],
      fields: [{ name: "who", value: "Ada", page: 1 }],
    })
    expect(pdf.facts).toEqual({
      pages: 3,
      width: 301,
      height: 400,
      title: "Annual report",
      bookmarks: 2,
      repaired: false,
      unlocked: false,
      restricted: false,
      signed: false,
      tagged: false,
      forms: true,
    })
    expect(pdf.bookmarks).toMatchObject([
      { title: "One", page: 0, children: [{ title: "Two", page: 1 }] },
    ])
  })

  it("reports the first page as it is shown when it is turned", async () => {
    const pdf = await source("A", { rotate: { 1: 90 }, size: () => [300, 400] })
    expect([pdf.facts.width, pdf.facts.height]).toEqual([400, 300])
  })

  it("notices signatures and accessibility tags", async () => {
    expect((await source("S", { signed: true })).facts).toMatchObject({
      signed: true,
      forms: true,
    })
    expect((await source("T", { tagged: true })).facts.tagged).toBe(true)
  })

  it("asks for a password, refuses a wrong one and opens with the right one", async () => {
    const bytes = await makePdf("L", { pages: 2, password: { user: "s3cret" } })
    const attempt = (password?: string) => {
      try {
        open(bytes, password)
        return "opened"
      } catch (error) {
        return error instanceof PasswordNeeded
          ? `needed, wrong=${error.wrong}`
          : error
      }
    }
    expect(attempt()).toBe("needed, wrong=false")
    expect(attempt("nope")).toBe("needed, wrong=true")
    expect(attempt("")).toBe("needed, wrong=true")
    const pdf = open(bytes, "s3cret")
    expect(pdf.facts).toMatchObject({ pages: 2, unlocked: true })
    // pdf-lib locks changes by default, which the user's password does not lift.
    expect(pdf.facts.restricted).toBe(true)
    // The owner's password opens it too, with nothing held back.
    expect(open(bytes, "s3cret-owner").facts).toMatchObject({
      pages: 2,
      unlocked: true,
      restricted: false,
    })
  })

  it("opens a file that only restricts changes, and says so", async () => {
    const bytes = await makePdf("R", { password: { user: "", owner: "boss" } })
    const pdf = open(bytes)
    expect(pdf.facts).toMatchObject({ unlocked: false, restricted: true })
    expect(await texts(await merge([part(pdf, "R")]))).toEqual(["R-P1"])
  })

  it("says so when a file is not a PDF, is empty or is cut short beyond repair", async () => {
    const text = new TextEncoder().encode("just some text, not a PDF")
    for (const bytes of [text, new Uint8Array(0), new Uint8Array(64)])
      expect(() => open(bytes)).toThrow(new RegExp(`${UNREADABLE}|${NO_PAGES}`))
  })

  it("repairs a damaged file and says that it did", async () => {
    const good = await makePdf("D", { pages: 3, picture: true })
    for (const how of ["table", "cut"] as const) {
      const pdf = open(damage(good, how))
      expect(pdf.facts, how).toMatchObject({ pages: 3, repaired: true })
      expect(await texts(await merge([part(pdf, "D")])), how).toEqual([
        "D-P1",
        "D-P2",
        "D-P3",
      ])
    }
    // Bytes after the end are ignored without any repair.
    const padded = open(damage(good, "junk"))
    expect(padded.facts).toMatchObject({ pages: 3, repaired: false })
    // An undamaged file is not reported as repaired.
    expect(open(good).facts.repaired).toBe(false)
  })
})

describe("merging pages", () => {
  it("joins files in order, page for page", async () => {
    const a = await source("A", { pages: 3 })
    const b = await source("B", { pages: 2 })
    const result = await mergePdfs(mupdf, [part(a, "A"), part(b, "B")], {
      bookmarks: "nested",
    })
    expect(result.pages).toBe(5)
    expect(await texts(result.bytes)).toEqual([
      "A-P1",
      "A-P2",
      "A-P3",
      "B-P1",
      "B-P2",
    ])
  })

  it("takes chosen pages in the order asked, repeats included", async () => {
    const a = await source("A", { pages: 4 })
    const b = await source("B", { pages: 3 })
    const bytes = await merge([
      part(b, "B", [2]),
      part(a, "A", [3, 0, 0]),
      part(b, "B again", [0, 1]),
    ])
    expect(await texts(bytes)).toEqual([
      "B-P3",
      "A-P4",
      "A-P1",
      "A-P1",
      "B-P1",
      "B-P2",
    ])
  })

  it("keeps each page's size and turn, and adds the turn asked for", async () => {
    const a = await source("A", {
      pages: 3,
      size: (page) => [200 + page * 10, 300 + page * 5],
      rotate: { 2: 90, 3: 270 },
    })
    const plain = await readPdf(await merge([part(a, "A")]))
    expect(
      plain.pages.map((page) => [page.width, page.height, page.rotate])
    ).toEqual([
      [210, 305, 0],
      [220, 310, 90],
      [230, 315, 270],
    ])
    const turned = await readPdf(await merge([part(a, "A", all(a), 90)]))
    expect(turned.pages.map((page) => page.rotate)).toEqual([90, 180, 0])
  })

  it("writes down what pages left to the page tree", async () => {
    const a = await source("A", { pages: 2, inherit: true })
    const b = await source("B", { pages: 1 })
    const result = await readPdf(await merge([part(b, "B"), part(a, "A", [1])]))
    expect(result.pages.map((page) => page.text)).toEqual(["B-P1", "A-P2"])
    // Size, turn and the font all came from the tree the page no longer has.
    expect(result.pages[1]).toMatchObject({
      width: 298,
      height: 420,
      rotate: 90,
    })
  })

  it("refuses to merge nothing", async () => {
    const a = await source("A")
    await expect(merge([part(a, "A", [])])).rejects.toThrow(
      "Choose at least one page to merge."
    )
    await expect(merge([])).rejects.toThrow("Choose at least one page")
  })

  it("leaves the files as they were, so they can be merged again", async () => {
    const a = await source("A", { pages: 2, links: [{ from: 1, to: 2 }] })
    const first = await merge([part(a, "A", [1])])
    const second = await merge([part(a, "A")])
    expect(await texts(first)).toEqual(["A-P2"])
    const again = await readPdf(second)
    expect(again.pages.map((page) => page.text)).toEqual(["A-P1", "A-P2"])
    expect(again.pages[0].links).toEqual([2])
  })

  it("stores shared parts once when a file is merged with itself", async () => {
    const bytes = await makePdf("A", { pages: 3, picture: true })
    const once = await merge([part(open(bytes), "A")])
    const twice = await merge([
      part(open(bytes), "A"),
      part(open(bytes), "A copy"),
    ])
    expect(await texts(twice)).toHaveLength(6)
    // The picture takes most of the file; a second copy would show at once.
    expect(once.length).toBeGreaterThan(8_000)
    expect(twice.length - once.length).toBeLessThan(2_000)
    // Repeating pages of one file shares it too.
    const repeated = await merge([part(open(bytes), "A", [0, 1, 2, 0, 1, 2])])
    expect(repeated.length - once.length).toBeLessThan(2_000)
  })

  it("stamps the result as its own document", async () => {
    const a = await source("A", { title: "Not carried over" })
    const result = await mergePdfs(mupdf, [part(a, "A")], {
      bookmarks: "none",
      now: new Date("2026-10-11T08:09:10Z"),
    })
    const { info } = await readPdf(result.bytes)
    expect(info).toMatchObject({
      Producer: "KeepSimp",
      CreationDate: "D:20261011080910Z",
      ModDate: "D:20261011080910Z",
    })
    expect(info.Title).toBeUndefined()
  })

  it("pauses between pages, reports progress and can be stopped", async () => {
    const a = await source("A", { pages: 3 })
    const progress: string[] = []
    let pauses = 0
    await mergePdfs(mupdf, [part(a, "A")], {
      bookmarks: "none",
      checkpoint: async () => void pauses++,
      progress: (done, total) => progress.push(`${done}/${total}`),
    })
    expect(progress).toEqual(["1/3", "2/3", "3/3"])
    // Once before each page and once before the file is written.
    expect(pauses).toBe(4)
    await expect(
      mergePdfs(mupdf, [part(a, "A")], {
        bookmarks: "none",
        checkpoint: async () => {
          throw new Error("stopped")
        },
      })
    ).rejects.toThrow("stopped")
    // Stopping leaves the file usable.
    expect(await texts(await merge([part(a, "A", [0])]))).toEqual(["A-P1"])
  })
})

describe("links, notes and bookmarks", () => {
  it("keeps links pointing at the same pages, however they were written", async () => {
    const a = await source("A", {
      pages: 4,
      links: [
        { from: 1, to: 3 },
        { from: 1, to: 4, how: "name" },
        { from: 2, to: 1, how: "action" },
      ],
    })
    const b = await source("B", {
      pages: 2,
      links: [{ from: 2, to: 1, how: "name" }],
    })
    const result = await readPdf(await merge([part(b, "B"), part(a, "A")]))
    // B takes pages 1-2, so A's pages are 3-6.
    expect(result.pages.map((page) => page.links)).toEqual([
      [],
      [1],
      [5, 6],
      [3],
      [],
      [],
    ])
  })

  it("follows a link's page when pages are reordered, and drops it when the page is left out", async () => {
    const a = await source("A", {
      pages: 3,
      links: [
        { from: 1, to: 3 },
        { from: 1, to: 2, how: "name" },
      ],
    })
    const reordered = await readPdf(await merge([part(a, "A", [2, 0])]))
    expect(reordered.pages.map((page) => page.text)).toEqual(["A-P3", "A-P1"])
    // The link to page 3 follows it to the front; the one to page 2 has nowhere to go.
    expect(reordered.pages[1].links).toEqual([1])
  })

  it("keeps notes, and gives a repeated page its own copies", async () => {
    const a = await source("A", {
      pages: 2,
      notes: [{ page: 1, text: "Check this figure" }],
      links: [{ from: 1, to: 2 }],
    })
    const result = await readPdf(await merge([part(a, "A", [0, 1, 0])]))
    expect(result.pages.map((page) => page.notes)).toEqual([
      ["Check this figure"],
      [],
      ["Check this figure"],
    ])
    // Both copies of page 1 link to the one page 2.
    expect(result.pages.map((page) => page.links)).toEqual([[2], [], [2]])
  })

  const chapters = {
    pages: 3,
    bookmarks: [
      {
        title: "Chapter 1",
        page: 1,
        children: [{ title: "Section 1.1", page: 2 }],
      },
      { title: "Chapter 2", page: 3 },
    ],
  }

  it("nests each file's bookmarks under the file, pointing at the new pages", async () => {
    const a = await source("A", chapters)
    const b = await source("B", { pages: 2 })
    const c = await source("C", {
      pages: 2,
      bookmarks: [{ title: "Only", page: 2 }],
    })
    const result = await mergePdfs(
      mupdf,
      [part(a, "First file"), part(b, "Second file"), part(c, "Third file")],
      { bookmarks: "nested" }
    )
    expect(result.bookmarks).toBe(7)
    expect((await readPdf(result.bytes)).bookmarks).toEqual([
      {
        title: "First file",
        to: 1,
        items: [
          {
            title: "Chapter 1",
            to: 1,
            items: [{ title: "Section 1.1", to: 2, items: [] }],
          },
          { title: "Chapter 2", to: 3, items: [] },
        ],
      },
      { title: "Second file", to: 4, items: [] },
      {
        title: "Third file",
        to: 6,
        items: [{ title: "Only", to: 7, items: [] }],
      },
    ])
  })

  it("follows the other bookmark choices", async () => {
    const a = await source("A", chapters)
    const b = await source("B", {
      pages: 1,
      bookmarks: [{ title: "B start", page: 1 }],
    })
    const inputs = [part(a, "A", [2, 0]), part(b, "B")]
    const titles = async (policy: BookmarkPolicy) =>
      (await readPdf(await merge(inputs, policy))).bookmarks.map(
        (item) => `${item.title}>${item.to}`
      )
    // Page 2 of A is left out, and with it "Section 1.1".
    expect(await titles("keep")).toEqual([
      "Chapter 1>2",
      "Chapter 2>1",
      "B start>3",
    ])
    expect(await titles("files")).toEqual(["A>1", "B>3"])
    expect(await titles("none")).toEqual([])
  })

  it("writes titles in any script", async () => {
    const a = await source("A", {
      bookmarks: [{ title: "Résumé – 概要 – Обзор", page: 1 }],
    })
    const result = await readPdf(
      await merge([part(a, "Übersicht ✓"), part(a, "二")])
    )
    expect(result.bookmarks.map((item) => item.title)).toEqual([
      "Übersicht ✓",
      "二",
    ])
    expect(result.bookmarks[0].items[0].title).toBe("Résumé – 概要 – Обзор")
  })
})

describe("forms, signatures and layers", () => {
  it("keeps fields fillable, renaming one whose name is taken", async () => {
    const a = await source("A", {
      pages: 2,
      fields: [
        { name: "name", value: "Ada", page: 1 },
        { name: "city", value: "London", page: 2 },
      ],
    })
    const b = await source("B", {
      fields: [{ name: "name", value: "Grace", page: 1 }],
    })
    const result = await readPdf(await merge([part(a, "A"), part(b, "B")]))
    expect(result.fields).toEqual(["city", "name", "name_2"])
    expect(result.pages.map((page) => page.fields)).toEqual([
      ["name=Ada"],
      ["city=London"],
      ["name_2=Grace"],
    ])
  })

  it("drops fields whose page is left out, and has no form when none remain", async () => {
    const a = await source("A", {
      pages: 2,
      fields: [
        { name: "kept", value: "1", page: 2 },
        { name: "gone", value: "2", page: 1 },
      ],
    })
    const some = await readPdf(await merge([part(a, "A", [1])]))
    expect(some.fields).toEqual(["kept"])
    expect(some.pages[0].fields).toEqual(["kept=1"])
    const b = await source("B", {
      pages: 2,
      fields: [{ name: "x", value: "y", page: 1 }],
    })
    const none = await readPdf(await merge([part(b, "B", [1])]))
    expect(none.fields).toEqual([])
    expect(none.info.IsAcroFormPresent).toBe(false)
  })

  it("keeps a signature's picture but not the signature", async () => {
    const a = await source("S", {
      signed: true,
      fields: [{ name: "note", value: "hi", page: 1 }],
    })
    const result = await readPdf(await merge([part(a, "S")]))
    expect(result.signatures).toBe(false)
    expect(result.fields).toEqual(["note"])
    expect(result.pages[0].kinds).toEqual(["Stamp", "Widget"])
  })

  it("keeps layers shown or hidden as each file had them", async () => {
    const a = await source("A", { layers: true })
    const b = await source("B", { layers: true })
    const plain = await source("C")
    const result = await readPdf(
      await merge([part(a, "A"), part(plain, "C"), part(b, "B")])
    )
    expect(result.layers).toEqual([
      { name: "A shown", visible: true },
      { name: "A hidden", visible: false },
      { name: "B shown", visible: true },
      { name: "B hidden", visible: false },
    ])
    const single = await readPdf(await merge([part(a, "A")]))
    expect(single.layers.map((layer) => layer.visible)).toEqual([true, false])
  })
})

describe("locked files", () => {
  it("merges a locked file once opened, and the result has no lock", async () => {
    const locked = await source("L", {
      pages: 2,
      password: { user: "open sesame" },
    })
    const plain = await source("P")
    const bytes = await merge([part(plain, "P"), part(locked, "L")])
    const result = await readPdf(bytes)
    expect(result.encrypted).toBe(false)
    expect(result.pages.map((page) => page.text)).toEqual([
      "P-P1",
      "L-P1",
      "L-P2",
    ])
  })
})

describe("pictures of pages", () => {
  it("draws a page at the size asked, turned as the page is", async () => {
    const a = await source("A", {
      pages: 2,
      size: () => [200, 400],
      rotate: { 2: 90 },
    })
    const upright = renderPage(mupdf, a, 0, 100)
    expect([upright.width, upright.height]).toEqual([50, 100])
    expect(upright.data).toHaveLength(50 * 100 * 4)
    const turned = renderPage(mupdf, a, 1, 100)
    expect([turned.width, turned.height]).toEqual([100, 50])
    // White paper with dark text on it, fully opaque.
    const values = new Set(upright.data)
    expect(values.has(255)).toBe(true)
    expect(Math.min(...upright.data)).toBeLessThan(80)
    expect(
      upright.data.filter((_, index) => index % 4 === 3).every((a) => a === 255)
    ).toBe(true)
  })

  it("draws a merged page like the page it came from", async () => {
    const a = await source("A", {
      pages: 2,
      layers: true,
      notes: [{ page: 1, text: "n" }],
    })
    const merged = open(await merge([part(a, "A", [1, 0])]))
    for (const [from, to] of [
      [0, 1],
      [1, 0],
    ]) {
      const before = renderPage(mupdf, a, from, 240)
      const after = renderPage(mupdf, merged, to, 240)
      expect([after.width, after.height]).toEqual([before.width, before.height])
      expect(Buffer.from(after.data).equals(Buffer.from(before.data))).toBe(
        true
      )
    }
  })
})

describe("files from other producers", () => {
  // Written by Chromium's print engine and by macOS; see scripts/pdf-test-files.mjs.
  const load = (name: string) =>
    new Uint8Array(readFileSync(`e2e/fixtures/pdf/${name}`))

  it("reads what they hold", () => {
    const printed = open(load("chromium-tagged.pdf"))
    expect(printed.facts).toMatchObject({
      pages: 3,
      title: "Printed by Chromium",
      tagged: true,
      bookmarks: 3,
      repaired: false,
      forms: false,
    })
    expect([printed.facts.width, printed.facts.height].map(Math.round)).toEqual(
      [420, 595]
    )
    expect(open(load("quartz-scan.pdf")).facts).toMatchObject({
      pages: 1,
      tagged: false,
      bookmarks: 0,
    })
  })

  it("merges them with one of our own, links and bookmarks intact", async () => {
    const printed = open(load("chromium-tagged.pdf"))
    const scan = open(load("quartz-scan.pdf"))
    const own = await source("A", { pages: 2 })
    const bytes = await merge([
      part(scan, "Scan"),
      part(printed, "Printed"),
      part(own, "Own"),
    ])
    const result = await readPdf(bytes)
    expect(result.pages.map((page) => page.text.split(" ")[0])).toEqual([
      // The scan is a picture; it has no text to read.
      "",
      "CHROME-ONE",
      "CHROME-TWO",
      "CHROME-THREE",
      "A-P1",
      "A-P2",
    ])
    // The link inside the printed file follows its page; the one outside is untouched.
    expect(result.pages[1].links.sort()).toEqual(
      [4, "https://keepsimp.vercel.app/"].sort()
    )
    expect(result.bookmarks).toEqual([
      { title: "Scan", to: 1, items: [] },
      {
        title: "Printed",
        to: 2,
        items: [
          { title: "CHROME-ONE", to: 2, items: [] },
          { title: "CHROME-TWO", to: 3, items: [] },
          { title: "CHROME-THREE", to: 4, items: [] },
        ],
      },
      { title: "Own", to: 5, items: [] },
    ])
    // Reordered and reduced, the link still finds its page.
    const shuffled = await readPdf(await merge([part(printed, "P", [2, 0])]))
    expect(shuffled.pages[1].links.sort()).toEqual(
      [1, "https://keepsimp.vercel.app/"].sort()
    )
  })

  it("draws every merged page exactly like its source", async () => {
    const printed = open(load("chromium-tagged.pdf"))
    const scan = open(load("quartz-scan.pdf"))
    const merged = open(
      await merge([part(printed, "P", [2, 1, 0]), part(scan, "S")])
    )
    const pairs: [OpenedPdf, number, number][] = [
      [printed, 2, 0],
      [printed, 1, 1],
      [printed, 0, 2],
      [scan, 0, 3],
    ]
    for (const [from, page, at] of pairs) {
      const before = renderPage(mupdf, from, page, 400)
      const after = renderPage(mupdf, merged, at, 400)
      expect(
        Buffer.from(after.data).equals(Buffer.from(before.data)),
        `page ${at + 1}`
      ).toBe(true)
    }
  })

  it("does not make them larger", async () => {
    const printed = load("chromium-tagged.pdf")
    const scan = load("quartz-scan.pdf")
    const bytes = await merge([part(open(printed), "P"), part(open(scan), "S")])
    expect(bytes.length).toBeLessThan(printed.length + scan.length)
  })
})

describe("many page orders", () => {
  it("puts every page where the plan says, for a hundred random plans", async () => {
    const sizes = [5, 3, 8, 1]
    const sources = await Promise.all(
      sizes.map((pages, index) =>
        source(String.fromCharCode(65 + index), { pages })
      )
    )
    // A small generator with a fixed seed, so a failure can be repeated.
    let seed = 20261011
    const random = (below: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed % below
    }
    for (let round = 0; round < 100; round++) {
      const inputs: MergeInput[] = []
      const expected: string[] = []
      for (let piece = 0; piece < 1 + random(5); piece++) {
        const file = random(sources.length)
        const pages = Array.from({ length: 1 + random(6) }, () =>
          random(sizes[file])
        )
        inputs.push(part(sources[file], `piece ${piece}`, pages))
        for (const page of pages)
          expected.push(pageText(String.fromCharCode(65 + file), page + 1))
      }
      expect(await texts(await merge(inputs)), `round ${round}`).toEqual(
        expected
      )
    }
  })
})
