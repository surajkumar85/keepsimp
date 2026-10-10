// @vitest-environment node
/**
 * Runs the merger with the real engine. The files that go in are written by
 * pdf-lib and the results are read back by pdf.js, so the engine is never
 * only checked against itself.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import sharp from "sharp"
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
  mergePages,
  mergePdfs,
  NO_PAGES,
  openPdf,
  openPicture,
  PasswordNeeded,
  renderPage,
  UNREADABLE,
  type MergeInput,
  type MergePage,
  type MergeSource,
  type OpenedPdf,
} from "./mupdf-engine"
import type { BookmarkPolicy } from "./outline"
import { permissionBits } from "./settings"

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
      attachments: 0,
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

describe("a contents page", () => {
  type Options = Parameters<typeof mergePdfs>[2]
  const withContents = async (
    inputs: MergeInput[],
    options: Partial<Options> = {}
  ) =>
    readPdf(
      (
        await mergePdfs(mupdf, inputs, {
          bookmarks: "files",
          contents: "files",
          ...options,
        })
      ).bytes
    )

  it("lists every file with the page it starts on, as links", async () => {
    const a = await source("A", { pages: 2, size: () => [400, 500] })
    const b = await source("B", { pages: 3 })
    const c = await source("C")
    const result = await withContents([
      part(a, "Introduction"),
      part(b, "Résumé – Обзор"),
      part(c, "Notes"),
    ])
    expect(result.pages.map((page) => page.text)).toEqual([
      "Contents Introduction 2 Résumé – Обзор 4 Notes 7",
      "A-P1",
      "A-P2",
      "B-P1",
      "B-P2",
      "B-P3",
      "C-P1",
    ])
    // The contents page is as large as the first page, and each line leads to its file.
    expect([result.pages[0].width, result.pages[0].height]).toEqual([400, 500])
    expect(result.pages[0].links).toEqual([2, 4, 7])
    // Bookmarks point past the new page, with one for the contents themselves.
    expect(result.bookmarks.map((item) => `${item.title}>${item.to}`)).toEqual([
      "Contents>1",
      "Introduction>2",
      "Résumé – Обзор>4",
      "Notes>7",
    ])
  })

  it("carries a font only for letters the standard one lacks", async () => {
    const a = await source("A")
    const size = async (name: string) =>
      (
        await mergePdfs(mupdf, [part(a, name)], {
          bookmarks: "none",
          contents: "files",
        })
      ).bytes.length
    const without = (await merge([part(a, "x")], "none")).length
    // Western names, accents and dashes included, add a page and no font.
    expect((await size("Résumé – “final”")) - without).toBeLessThan(1_500)
    // Greek or Cyrillic brings the engine's font along.
    expect((await size("Обзор")) - without).toBeGreaterThan(10_000)
    const greek = await withContents([
      part(a, "Résumé"),
      part(a, "αβγ – Обзор"),
    ])
    expect(greek.pages[0].text).toBe("Contents Résumé 2 αβγ – Обзор 3")
  })

  it("uses each document's own title where it has one", async () => {
    const a = await source("A", { title: "Annual report 2026" })
    const b = await source("B")
    const result = await withContents([part(a, "a-file"), part(b, "b-file")], {
      contents: "titles",
      bookmarks: "none",
    })
    expect(result.pages[0].text).toBe("Contents Annual report 2026 2 b-file 3")
    // With no bookmarks asked for, the contents get none either.
    expect(result.bookmarks).toEqual([])
  })

  it("comes after a cover, which it does not list", async () => {
    const cover = await source("C", { pages: 2 })
    const a = await source("A", { pages: 2 })
    const b = await source("B")
    const result = await withContents(
      [part(cover, "Cover"), part(a, "First"), part(b, "Second")],
      { cover: true }
    )
    expect(result.pages.map((page) => page.text)).toEqual([
      "C-P1",
      "C-P2",
      "Contents First 4 Second 6",
      "A-P1",
      "A-P2",
      "B-P1",
    ])
    expect(result.pages[2].links).toEqual([4, 6])
    expect(result.bookmarks.map((item) => `${item.title}>${item.to}`)).toEqual([
      "Contents>3",
      "Cover>1",
      "First>4",
      "Second>6",
    ])
    // A cover and nothing else leaves nothing to list.
    const alone = await withContents([part(cover, "Cover")], { cover: true })
    expect(alone.pages.map((page) => page.text)).toEqual(["C-P1", "C-P2"])
  })

  it("runs onto more pages when there are many files", async () => {
    const one = await source("A")
    const inputs = Array.from({ length: 40 }, (_, index) =>
      part(one, `File ${index + 1}`)
    )
    const result = await withContents(inputs, { bookmarks: "none" })
    // A6 pages hold 14 lines under the heading and 16 after: three contents pages.
    expect(result.pages).toHaveLength(43)
    expect(result.pages[0].text).toMatch(/^Contents File 1 4 File 2 5 /)
    expect(result.pages[1].text).not.toContain("Contents")
    const links = result.pages.slice(0, 3).flatMap((page) => page.links)
    expect(links).toEqual(Array.from({ length: 40 }, (_, index) => index + 4))
    expect(result.pages[3].text).toBe("A-P1")
  })

  it("writes names in other scripts as pictures when it is given a way to draw them", async () => {
    const a = await source("A")
    const plain = await withContents([part(a, "概要 notes")])
    // Without a way to draw them, the letters the font lacks become "?".
    expect(plain.pages[0].text).toBe("Contents ?? notes 2")
    expect(plain.pages[0].pictures).toBe(0)
    const asked: string[] = []
    const drawn = await withContents(
      [part(a, "概要 notes"), part(a, "Plain")],
      {
        textPicture: (text, height) => {
          asked.push(`${text}@${height}`)
          return {
            data: new Uint8ClampedArray(120 * 40 * 4).fill(255),
            width: 120,
            height: 40,
          }
        },
      }
    )
    expect(asked).toEqual(["概要 notes@64"])
    expect(drawn.pages[0].pictures).toBe(1)
    expect(drawn.pages[0].text).toBe("Contents 2 Plain 3")
    expect(drawn.pages[0].links).toEqual([2, 3])
    // A drawing that fails falls back to "?" too.
    const failed = await withContents([part(a, "概要")], {
      textPicture: () => null,
    })
    expect(failed.pages[0].text).toBe("Contents ?? 2")
  })
})

describe("form choices", () => {
  const two = async () => [
    part(
      await source("A", { fields: [{ name: "name", value: "Ada", page: 1 }] }),
      "A"
    ),
    part(
      await source("B", {
        fields: [
          { name: "name", value: "Grace", page: 1 },
          { name: "city", value: "Paris", page: 1 },
        ],
      }),
      "B"
    ),
  ]
  const formed = async (
    inputs: MergeInput[],
    forms: "join" | "flatten" | "remove"
  ) =>
    readPdf(
      (await mergePdfs(mupdf, inputs, { bookmarks: "none", forms })).bytes
    )

  it("joins fields with the same name into one, keeping the first entry", async () => {
    const result = await formed(await two(), "join")
    expect(result.fields).toEqual(["city", "name"])
    // Both places show the one field; the first file's entry stands.
    expect(result.pages.map((page) => page.fields.sort())).toEqual([
      ["name=Ada"],
      ["city=Paris", "name=Ada"],
    ])
  })

  it("joins three of a name, and leaves fields of different kinds apart", async () => {
    const [a, b] = await two()
    const c = part(
      await source("C", {
        fields: [{ name: "name", value: "Third", page: 1 }],
      }),
      "C"
    )
    const tick = part(await source("D", { checkBox: "name" }), "D")
    const result = await formed([a, b, c, tick], "join")
    // A check box cannot be part of a text field, so it gets a name of its own.
    expect(result.fields).toEqual(["city", "name", "name_4"])
    expect(result.pages.map((page) => page.fields.sort()[0])).toEqual([
      "name=Ada",
      "city=Paris",
      "name=Ada",
      "name_4=Yes",
    ])
  })

  it("flattens fields into the page", async () => {
    const result = await formed(await two(), "flatten")
    expect(result.fields).toEqual([])
    expect(result.info.IsAcroFormPresent).toBe(false)
    expect(result.pages.map((page) => page.kinds)).toEqual([[], []])
    // What was filled in is now part of the page's own text.
    expect(result.pages[0].text).toBe("A-P1 Ada")
    expect(result.pages[1].text).toContain("Grace")
    expect(result.pages[1].text).toContain("Paris")
  })

  it("removes fields and what was filled in", async () => {
    const result = await formed(await two(), "remove")
    expect(result.fields).toEqual([])
    expect(result.pages.map((page) => [page.text, page.kinds])).toEqual([
      ["A-P1", []],
      ["B-P1", []],
    ])
  })

  it("leaves a file without fields as it is, whatever the choice", async () => {
    const a = await source("A", { notes: [{ page: 1, text: "kept" }] })
    for (const forms of ["join", "flatten", "remove"] as const) {
      const result = await formed([part(a, "A")], forms)
      expect(result.pages[0].notes, forms).toEqual(["kept"])
      expect(result.pages[0].text, forms).toBe("A-P1")
    }
  })
})

describe("details, page numbers, attachments and a password", () => {
  type Options = Parameters<typeof mergePdfs>[2]
  const made = async (inputs: MergeInput[], options: Partial<Options>) =>
    (await mergePdfs(mupdf, inputs, { bookmarks: "none", ...options })).bytes

  it("reads the details a file names, and writes the ones asked for", async () => {
    const a = await source("A", {
      title: "Old title",
      author: "Old author",
      subject: "Old subject",
      keywords: "old, words",
      attachments: { "note.txt": "hello" },
    })
    expect(a.facts).toMatchObject({
      title: "Old title",
      author: "Old author",
      subject: "Old subject",
      keywords: "old, words",
      attachments: 1,
    })
    const { info } = await readPdf(
      await made([part(a, "A")], {
        details: {
          title: "  Board pack  ",
          author: "Ada Lovelace",
          subject: "",
          keywords: "minutes, budget",
        },
      })
    )
    expect(info).toMatchObject({
      Title: "Board pack",
      Author: "Ada Lovelace",
      Keywords: "minutes, budget",
      Producer: "KeepSimp",
    })
    // Nothing is carried over from the files, and an empty field writes nothing.
    expect(info.Subject).toBeUndefined()
  })

  it("keeps each file's own page numbers when asked", async () => {
    const book = await source("A", { pages: 4, romanPages: 2 })
    const plain = await source("B", { pages: 2 })
    expect(book.labels).toEqual(["i", "ii", "1", "2"])
    expect(plain.labels).toBeUndefined()
    const inputs = [part(book, "Book"), part(plain, "Plain", [1, 0])]
    expect((await readPdf(await made(inputs, {}))).labels).toBeNull()
    expect(
      (await readPdf(await made(inputs, { labels: "keep" }))).labels
    ).toEqual([
      "i",
      "ii",
      "1",
      "2",
      // A file without numbers of its own counts its pages from 1.
      "2",
      "1",
    ])
    // Contents pages count in small Roman numerals of their own.
    const withContents = await readPdf(
      await made(inputs, { labels: "keep", contents: "files" })
    )
    expect(withContents.labels).toEqual(["i", "i", "ii", "1", "2", "2", "1"])
    expect(withContents.pages[0].text).toBe("Contents Book 2 Plain 6")
  })

  it("leaves blank pages and pictures without a number of their own", async () => {
    const a = await source("A")
    const result = await mergePages(
      mupdf,
      new Map([["a", { pdf: a, name: "A" }]]),
      [
        { blank: { width: 100, height: 100 } },
        { source: "a", index: 0, rotation: 0 },
      ],
      { bookmarks: "none", labels: "keep" }
    )
    expect((await readPdf(result.bytes)).labels).toEqual(["", "1"])
  })

  it("carries attachments over, numbering a name that is taken", async () => {
    const a = await source("A", { attachments: { "note.txt": "from A" } })
    const b = await source("B", {
      attachments: { "note.txt": "from B", "data.csv": "1,2" },
    })
    const c = await source("C")
    const inputs = [part(a, "A"), part(c, "C"), part(b, "B")]
    expect((await readPdf(await made(inputs, {}))).attachments).toEqual([
      "data.csv",
      "note (2).txt",
      "note.txt",
    ])
    expect(
      (await readPdf(await made(inputs, { attachments: false }))).attachments
    ).toEqual([])
  })

  it("locks the result with a password of any characters", async () => {
    const a = await source("A", { pages: 2 })
    const password = 'pä, ss=w "ord"'
    const bytes = await made([part(a, "A")], {
      lock: {
        password,
        ownerPassword: "owner, too",
        permissions: permissionBits({
          allowPrint: false,
          allowCopy: true,
          allowChanges: false,
        }),
      },
    })
    await expect(readPdf(bytes)).rejects.toMatchObject({
      name: "PasswordException",
    })
    await expect(readPdf(bytes, "wrong")).rejects.toMatchObject({
      name: "PasswordException",
    })
    const opened = await readPdf(bytes, password)
    expect(opened.encrypted).toBe(true)
    expect(opened.pages.map((page) => page.text)).toEqual(["A-P1", "A-P2"])
    // Copying is allowed (16), printing (4) and changing (8) are not.
    expect(opened.permissions).toContain(16)
    expect(opened.permissions).not.toContain(4)
    expect(opened.permissions).not.toContain(8)
    // Our own engine asks for the password too, and takes either one.
    expect(() => open(bytes)).toThrow(PasswordNeeded)
    expect(open(bytes, password).facts).toMatchObject({
      unlocked: true,
      restricted: true,
    })
    expect(open(bytes, "owner, too").facts.restricted).toBe(false)
  })

  it("limits nothing when every permission is given", async () => {
    const a = await source("A")
    const bytes = await made([part(a, "A")], {
      lock: {
        password: "open",
        ownerPassword: "own",
        permissions: permissionBits({
          allowPrint: true,
          allowCopy: true,
          allowChanges: true,
        }),
      },
    })
    const opened = await readPdf(bytes, "open")
    for (const flag of [4, 8, 16, 32, 256, 1024, 2048])
      expect(opened.permissions, `${flag}`).toContain(flag)
  })
})

describe("arranging single pages", () => {
  const arrange = async (
    sources: Record<string, OpenedPdf>,
    wanted: MergePage[],
    options: Partial<Parameters<typeof mergePages>[3]> = {}
  ) =>
    (
      await mergePages(
        mupdf,
        new Map<string, MergeSource>(
          Object.entries(sources).map(([key, pdf]) => [
            key,
            { pdf, name: `File ${key}` },
          ])
        ),
        wanted,
        { bookmarks: "nested", ...options }
      )
    ).bytes
  const from = (
    source: string,
    index: number,
    rotation: MergeInput["rotation"] = 0
  ): MergePage => ({ source, index, rotation })

  it("weaves pages of two files together, and their links still find them", async () => {
    const a = await source("A", {
      pages: 3,
      links: [{ from: 1, to: 3 }],
      bookmarks: [{ title: "A end", page: 3 }],
    })
    const b = await source("B", {
      pages: 2,
      links: [{ from: 2, to: 1, how: "name" }],
      bookmarks: [{ title: "B start", page: 1 }],
    })
    const result = await readPdf(
      await arrange({ a, b }, [
        from("a", 0),
        from("b", 0),
        from("a", 2),
        from("b", 1),
        from("a", 1),
      ])
    )
    expect(result.pages.map((page) => page.text)).toEqual([
      "A-P1",
      "B-P1",
      "A-P3",
      "B-P2",
      "A-P2",
    ])
    // A's first page links to its third, now page 3; B's second to its first, now page 2.
    expect(result.pages.map((page) => page.links)).toEqual([
      [3],
      [],
      [],
      [2],
      [],
    ])
    // One entry per file, at the file's first page, in order of first use.
    expect(result.bookmarks).toEqual([
      { title: "File a", to: 1, items: [{ title: "A end", to: 3, items: [] }] },
      {
        title: "File b",
        to: 2,
        items: [{ title: "B start", to: 2, items: [] }],
      },
    ])
  })

  it("turns each page by itself, copies included", async () => {
    const a = await source("A", { pages: 2, rotate: { 2: 90 } })
    const result = await readPdf(
      await arrange({ a }, [
        from("a", 0, 90),
        from("a", 0),
        from("a", 1, 180),
        from("a", 0, 270),
        from("a", 1),
      ])
    )
    expect(result.pages.map((page) => [page.text, page.rotate])).toEqual([
      ["A-P1", 90],
      ["A-P1", 0],
      // This page was already turned a quarter inside the file.
      ["A-P2", 270],
      ["A-P1", 270],
      ["A-P2", 90],
    ])
  })

  it("adds blank pages of the size asked", async () => {
    const a = await source("A", { pages: 2 })
    const bytes = await arrange({ a }, [
      { blank: { width: 200, height: 300 } },
      from("a", 0),
      { blank: { width: 298, height: 420 } },
      from("a", 1),
    ])
    const result = await readPdf(bytes)
    expect(
      result.pages.map((page) => [page.text, page.width, page.height])
    ).toEqual([
      ["", 200, 300],
      ["A-P1", 298, 420],
      ["", 298, 420],
      ["A-P2", 298, 420],
    ])
    // A blank page is white all over.
    const blank = renderPage(mupdf, open(bytes), 0, 40)
    expect(new Set(blank.data)).toEqual(new Set([255]))
    // Only blank pages is still a file.
    const empty = await mergePages(
      mupdf,
      new Map(),
      [{ blank: { width: 100, height: 100 } }],
      { bookmarks: "nested" }
    )
    expect(await texts(empty.bytes)).toEqual([""])
  })

  it("says so when a page's file is not open, or there is nothing to merge", async () => {
    const a = await source("A")
    await expect(arrange({ a }, [from("gone", 0)])).rejects.toThrow(
      "A file to merge is no longer open."
    )
    await expect(arrange({ a }, [])).rejects.toThrow(
      "Choose at least one page to merge."
    )
  })
})

describe("pictures as pages", () => {
  const photo = (width: number, height: number, orientation?: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        // Red on the left half, blue on the right: a turn is easy to see.
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: Math.floor(width / 2),
              height,
              channels: 3,
              background: { r: 255, g: 0, b: 0 },
            },
          },
          left: 0,
          top: 0,
        },
      ])
      .withMetadata(orientation ? { orientation } : {})
      .jpeg({ quality: 90 })
      .toBuffer()
  const picture = (input: Parameters<typeof openPicture>[1]): OpenedPdf => {
    const pdf = openPicture(mupdf, input)
    opened.push(pdf)
    return pdf
  }
  const colourAt = (
    image: { data: Uint8ClampedArray; width: number; height: number },
    x: number,
    y: number
  ) => {
    const at =
      (Math.floor(y * image.height) * image.width +
        Math.floor(x * image.width)) *
      4
    const [r, , b] = image.data.subarray(at, at + 3)
    return r > 200 && b < 80 ? "red" : b > 200 && r < 80 ? "blue" : "other"
  }
  const sources = (pdfs: Record<string, OpenedPdf>) =>
    new Map<string, MergeSource>(
      Object.entries(pdfs).map(([key, pdf]) => [key, { pdf, name: key }])
    )

  it("keeps a JPEG as it is, on a page that fits it", async () => {
    const jpeg = new Uint8Array(await photo(600, 300))
    const pdf = picture({ jpeg, turn: 0 })
    expect(pdf.facts).toMatchObject({
      pages: 1,
      // 600 × 300 pixels at 150 to the inch.
      width: 288,
      height: 144,
      picture: { width: 600, height: 300 },
    })
    const merged = await mergePages(
      mupdf,
      sources({ p: pdf }),
      [{ source: "p", index: 0, rotation: 0 }],
      { bookmarks: "nested", picturePage: "fit" }
    )
    const result = await readPdf(merged.bytes)
    expect(result.pages).toMatchObject([
      { width: 288, height: 144, pictures: 1, text: "" },
    ])
    // The JPEG went in whole: the file is the picture plus a little wrapping.
    expect(merged.bytes.length).toBeGreaterThan(jpeg.length)
    expect(merged.bytes.length).toBeLessThan(jpeg.length + 1500)
    expect(
      Buffer.from(merged.bytes).includes(Buffer.from(jpeg.subarray(0, 64)))
    ).toBe(true)
    const drawn = renderPage(mupdf, open(merged.bytes), 0, 200)
    expect([colourAt(drawn, 0.25, 0.5), colourAt(drawn, 0.75, 0.5)]).toEqual([
      "red",
      "blue",
    ])
  })

  it("shows a JPEG stored on its side the right way up", async () => {
    // Orientation 6: the stored picture must be turned a quarter clockwise.
    const jpeg = new Uint8Array(await photo(600, 300, 6))
    const pdf = picture({ jpeg, turn: 90 })
    expect(pdf.facts).toMatchObject({
      width: 144,
      height: 288,
      picture: { width: 300, height: 600 },
    })
    const merged = await mergePages(
      mupdf,
      sources({ p: pdf }),
      [{ source: "p", index: 0, rotation: 0 }],
      { bookmarks: "nested", picturePage: "fit" }
    )
    const drawn = renderPage(mupdf, open(merged.bytes), 0, 200)
    expect([drawn.width, drawn.height]).toEqual([100, 200])
    // The stored left half (red) is now at the top.
    expect([colourAt(drawn, 0.5, 0.25), colourAt(drawn, 0.5, 0.75)]).toEqual([
      "red",
      "blue",
    ])
    // The thumbnail from the opened picture agrees.
    const thumbnail = renderPage(mupdf, pdf, 0, 200)
    expect(colourAt(thumbnail, 0.5, 0.25)).toBe("red")
  })

  it("takes pixels from any other format, filling see-through parts with white", async () => {
    const width = 40
    const height = 20
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++)
      // Solid red on the left, fully see-through on the right.
      data.set(i % width < width / 2 ? [255, 0, 0, 255] : [0, 0, 255, 0], i * 4)
    const pdf = picture({ pixels: { data, width, height } })
    expect(pdf.facts.picture).toEqual({ width: 40, height: 20 })
    const drawn = renderPage(mupdf, pdf, 0, 40)
    expect(colourAt(drawn, 0.25, 0.5)).toBe("red")
    const right = (10 * drawn.width + 30) * 4
    expect([...drawn.data.subarray(right, right + 3)]).toEqual([255, 255, 255])
  })

  it("gives a picture the size of the page before it, or a sheet, with a margin", async () => {
    const pdf = picture({
      jpeg: new Uint8Array(await photo(600, 300)),
      turn: 0,
    })
    const tall = picture({
      jpeg: new Uint8Array(await photo(300, 600)),
      turn: 0,
    })
    const doc = await source("A", { size: () => [400, 600] })
    const all = sources({ p: pdf, t: tall, a: doc })
    const wanted: MergePage[] = [
      { source: "p", index: 0, rotation: 0 },
      { source: "a", index: 0, rotation: 0 },
      { source: "t", index: 0, rotation: 0 },
      { source: "p", index: 0, rotation: 0 },
    ]
    const like = await readPdf(
      (await mergePages(mupdf, all, wanted, { bookmarks: "nested" })).bytes
    )
    expect(like.pages.map((page) => [page.width, page.height])).toEqual([
      // Nothing comes before the first picture, so it gets A4, turned to suit it.
      [841.89, 595.28],
      [400, 600],
      // After the document, pictures take its size; the wide one turns the sheet.
      [400, 600],
      [600, 400],
    ])
    const letter = await mergePages(mupdf, all, wanted, {
      bookmarks: "nested",
      picturePage: "letter",
      pictureMargin: "normal",
    })
    expect(
      (await readPdf(letter.bytes)).pages.map((page) => [
        page.width,
        page.height,
      ])
    ).toEqual([
      [792, 612],
      [400, 600],
      [612, 792],
      [792, 612],
    ])
    // With a margin, the corner is paper and the middle is the picture.
    const drawn = renderPage(mupdf, open(letter.bytes), 0, 396)
    expect([...drawn.data.subarray(0, 3)]).toEqual([255, 255, 255])
    expect(colourAt(drawn, 0.3, 0.5)).toBe("red")
    // The same picture on two pages is stored once.
    const once = await mergePages(mupdf, sources({ p: pdf }), [wanted[0]], {
      bookmarks: "nested",
    })
    const twice = await mergePages(
      mupdf,
      sources({ p: pdf }),
      [wanted[0], { source: "p", index: 0, rotation: 90 }],
      { bookmarks: "nested" }
    )
    expect(twice.bytes.length - once.bytes.length).toBeLessThan(600)
    expect(
      (await readPdf(twice.bytes)).pages.map((page) => page.rotate)
    ).toEqual([0, 90])
  })

  it("says so when the bytes are not a picture", () => {
    expect(() =>
      openPicture(mupdf, {
        jpeg: new TextEncoder().encode("not a jpeg"),
        turn: 0,
      })
    ).toThrow("This picture could not be read. It may be damaged.")
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
