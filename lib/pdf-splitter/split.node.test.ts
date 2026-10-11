// @vitest-environment node
/**
 * Splitting with the real engine. Files are written by pdf-lib and the parts
 * are read back by pdf.js and pdf-lib, so the engine is never only checked
 * against itself.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { afterEach, describe, expect, it } from "vitest"
import {
  makePdf,
  makeSharedPdf,
  pageText,
  SHARED_PICTURE,
  type FixtureOptions,
} from "@/tests/pdf-fixtures"
import { readPdf, storedPictures } from "@/tests/pdf-reader"
import {
  closePdf,
  openPdf,
  renderPage,
  type OpenedPdf,
} from "@/lib/pdf-merger/mupdf-engine"
import { splitPart } from "./mupdf-split"
import {
  cutsEqual,
  cutsEvery,
  oddEvenParts,
  partsFromCuts,
  partsFromRanges,
  selectionPart,
  type Part,
} from "./parts"

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

/** Split a file by a plan and give back each part's bytes. */
const split = async (pdf: OpenedPdf, parts: readonly Part[]) => {
  const written: Uint8Array[] = []
  for (const [index, part] of parts.entries())
    written.push(
      (await splitPart(mupdf, pdf, part.pages, { attachments: index === 0 }))
        .bytes
    )
  return written
}
/** The text of every page of every part, as pdf.js reads it. */
const textsOf = async (parts: Uint8Array[]) =>
  Promise.all(
    parts.map(async (bytes) =>
      (await readPdf(bytes)).pages.map((page) => page.text)
    )
  )
const expected = (tag: string, parts: readonly Part[]) =>
  parts.map((part) => part.pages.map((page) => pageText(tag, page + 1)))

describe("splitting into parts", () => {
  it("cuts a file where it is told to", async () => {
    const pdf = await source("A", { pages: 7 })
    const plan = partsFromCuts(7, [1, 4])
    expect(await textsOf(await split(pdf, plan))).toEqual([
      ["A-P1", "A-P2"],
      ["A-P3", "A-P4", "A-P5"],
      ["A-P6", "A-P7"],
    ])
  })

  it("follows every rule that places cuts", async () => {
    const pdf = await source("R", { pages: 10 })
    for (const plan of [
      partsFromCuts(10, cutsEvery(10, 3)),
      partsFromCuts(10, cutsEvery(10, 1)),
      partsFromCuts(10, cutsEqual(10, 4)),
      oddEvenParts(10),
      selectionPart(new Set([0, 4, 9]), 10, "extract"),
      selectionPart(new Set([0, 4, 9]), 10, "remove"),
    ])
      expect(await textsOf(await split(pdf, plan))).toEqual(expected("R", plan))
  })

  it("follows typed ranges that overlap, repeat and count down", async () => {
    const pdf = await source("T", { pages: 6 })
    const read = partsFromRanges("1-3, 2-4, 6-4, 2 + 2 + 5", 6)
    if (!("parts" in read)) throw new Error(read.problem)
    expect(await textsOf(await split(pdf, read.parts))).toEqual([
      ["T-P1", "T-P2", "T-P3"],
      ["T-P2", "T-P3", "T-P4"],
      ["T-P6", "T-P5", "T-P4"],
      ["T-P2", "T-P2", "T-P5"],
    ])
  })

  it("puts a file back together from any set of cuts", async () => {
    const count = 23
    const pdf = await source("X", { pages: count })
    let seed = 20261011
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (let round = 0; round < 60; round++) {
      const cuts = Array.from({ length: count - 1 }, (_, at) => at).filter(
        () => random() < 0.25
      )
      const plan = partsFromCuts(count, cuts)
      const parts = await textsOf(await split(pdf, plan))
      expect(parts).toHaveLength(cuts.length + 1)
      // Every page once, in order, across the parts.
      expect(parts.flat(), `cuts ${cuts.join(",")}`).toEqual(
        Array.from({ length: count }, (_, at) => pageText("X", at + 1))
      )
    }
  }, 120_000)

  it("refuses a part with no pages", async () => {
    const pdf = await source("E", { pages: 2 })
    expect(() => splitPart(mupdf, pdf, [])).toThrow(
      "A part needs at least one page."
    )
  })

  it("can be stopped between pages", async () => {
    const pdf = await source("C", { pages: 30 })
    let calls = 0
    await expect(
      splitPart(mupdf, pdf, [0, 1, 2, 3, 4, 5], {
        checkpoint: async () => {
          if (++calls > 3) throw new Error("stopped")
        },
      })
    ).rejects.toThrow("stopped")
  })

  it("says how far it has got", async () => {
    const pdf = await source("G", { pages: 5 })
    const seen: number[] = []
    await splitPart(mupdf, pdf, [0, 1, 2], {
      progress: (done, total) => {
        expect(total).toBe(3)
        seen.push(done)
      },
    })
    expect(seen).toEqual([1, 2, 3])
  })
})

describe("what a part keeps", () => {
  it("keeps page sizes and turns", async () => {
    const pdf = await source("S", {
      pages: 4,
      size: (page) => (page % 2 ? [298, 420] : [612, 792]),
      rotate: { 3: 90 },
    })
    const [, second] = await split(pdf, partsFromCuts(4, [1]))
    const read = await readPdf(second)
    expect(
      read.pages.map((page) => [page.width, page.height, page.rotate])
    ).toEqual([
      [298, 420, 90],
      [612, 792, 0],
    ])
  })

  it("keeps links inside a part and drops links that lead out of it", async () => {
    const pdf = await source("L", {
      pages: 6,
      links: [
        { from: 1, to: 2 },
        { from: 1, to: 5, how: "name" },
        { from: 4, to: 6, how: "action" },
        { from: 5, to: 1 },
      ],
    })
    const [first, second] = await split(pdf, partsFromCuts(6, [2]))
    expect((await readPdf(first)).pages.map((page) => page.links)).toEqual([
      [2],
      [],
      [],
    ])
    // Pages 4, 5 and 6 are pages 1, 2 and 3 of the second part.
    expect((await readPdf(second)).pages.map((page) => page.links)).toEqual([
      [3],
      [],
      [],
    ])
  })

  it("gives each part the bookmarks of its own pages, pointing at the right page", async () => {
    const pdf = await source("B", {
      pages: 6,
      bookmarks: [
        { title: "One", page: 1 },
        {
          title: "Two",
          page: 3,
          children: [
            { title: "Two A", page: 4 },
            { title: "Two B", page: 6 },
          ],
        },
      ],
    })
    const [first, second, third] = await split(pdf, partsFromCuts(6, [1, 3]))
    expect((await readPdf(first)).bookmarks).toEqual([
      { title: "One", to: 1, items: [] },
    ])
    expect((await readPdf(second)).bookmarks).toEqual([
      { title: "Two", to: 1, items: [{ title: "Two A", to: 2, items: [] }] },
    ])
    // A heading whose own page went elsewhere still holds what is under it.
    const last = (await readPdf(third)).bookmarks
    expect(last).toHaveLength(1)
    expect(last[0].title).toBe("Two")
    expect(last[0].items).toEqual([{ title: "Two B", to: 2, items: [] }])
  })

  it("keeps form fields with the pages they are on", async () => {
    const pdf = await source("F", {
      pages: 4,
      fields: [
        { name: "first", value: "one", page: 1 },
        { name: "last", value: "four", page: 4 },
      ],
    })
    const [first, second] = await split(pdf, partsFromCuts(4, [1]))
    const a = await readPdf(first)
    const b = await readPdf(second)
    expect(a.fields).toEqual(["first"])
    expect(a.pages[0].fields).toEqual(["first=one"])
    expect(b.fields).toEqual(["last"])
    expect(b.pages[1].fields).toEqual(["last=four"])
  })

  it("keeps notes, and the page numbers a file gives its own pages", async () => {
    const pdf = await source("N", {
      pages: 6,
      notes: [{ page: 5, text: "remember" }],
      romanPages: 2,
    })
    const [first, second] = await split(pdf, partsFromCuts(6, [1]))
    expect((await readPdf(first)).labels).toEqual(["i", "ii"])
    const read = await readPdf(second)
    expect(read.labels).toEqual(["1", "2", "3", "4"])
    expect(read.pages.map((page) => page.notes)).toEqual([
      [],
      [],
      ["remember"],
      [],
    ])
  })

  it("counts pages from 1 when the file does not number its own", async () => {
    const pdf = await source("P", { pages: 4 })
    const [, second] = await split(pdf, partsFromCuts(4, [1]))
    expect((await readPdf(second)).labels).toBeNull()
  })

  it("keeps the document's details in every part", async () => {
    const pdf = await source("D", {
      pages: 2,
      title: "Annual report",
      author: "Ada",
      subject: "Numbers",
      keywords: "money, people",
    })
    for (const bytes of await split(pdf, partsFromCuts(2, [0]))) {
      const { info } = await readPdf(bytes)
      expect(info.Title).toBe("Annual report")
      expect(info.Author).toBe("Ada")
      expect(info.Subject).toBe("Numbers")
      expect(info.Keywords).toBe("money, people")
      expect(info.Producer).toBe("KeepSimp")
    }
  })

  it("keeps attached files in the first part only", async () => {
    const pdf = await source("K", {
      pages: 3,
      attachments: { "notes.txt": "hello" },
    })
    const [first, second] = await split(pdf, partsFromCuts(3, [0]))
    expect((await readPdf(first)).attachments).toEqual(["notes.txt"])
    expect((await readPdf(second)).attachments).toEqual([])
  })

  it("opens a locked file's parts without a password", async () => {
    const pdf = await source("W", { pages: 2, password: { user: "pw" } })
    const [first] = await split(pdf, partsFromCuts(2, [0]))
    expect((await readPdf(first)).pages.map((page) => page.text)).toEqual([
      "W-P1",
    ])
  })

  it("draws every page of every part like the page it came from", async () => {
    const pdf = await source("V", {
      pages: 5,
      rotate: { 2: 90 },
      notes: [{ page: 3, text: "n" }],
      layers: true,
    })
    const plan = partsFromCuts(5, [0, 2])
    const parts = await split(pdf, plan)
    for (const [index, part] of plan.entries()) {
      const written = open(parts[index])
      part.pages.forEach((page, at) => {
        const before = renderPage(mupdf, pdf, page, 240)
        const after = renderPage(mupdf, written, at, 240)
        expect(Buffer.from(after.data).equals(Buffer.from(before.data))).toBe(
          true
        )
      })
    }
  })
})

describe("the size of parts", () => {
  it("gives each part only its own pictures, so parts add up to about the whole", async () => {
    const bytes = await makeSharedPdf("Z", 8)
    const pdf = open(bytes)
    const plan = partsFromCuts(8, cutsEvery(8, 2))
    const parts = await split(pdf, plan)
    let together = 0
    for (const part of parts) {
      expect(await storedPictures(part)).toBe(2)
      expect(part.length).toBeLessThan(SHARED_PICTURE * 2.5)
      together += part.length
    }
    expect(together).toBeLessThan(bytes.length * 1.2)
    expect(await textsOf(parts)).toEqual(expected("Z", plan))
    for (const part of parts)
      expect((await readPdf(part)).pages.map((page) => page.pictures)).toEqual([
        1, 1,
      ])
  })

  it("stores a picture once when a part shows it on several pages", async () => {
    const pdf = await source("O", { pages: 6, picture: true })
    const whole = (await splitPart(mupdf, pdf, [0, 1, 2, 3, 4, 5])).bytes
    const half = (await splitPart(mupdf, pdf, [0, 1, 2])).bytes
    expect(await storedPictures(whole)).toBe(1)
    expect(await storedPictures(half)).toBe(1)
    expect(half.length).toBeLessThan(whole.length)
  })

  it("splits files from other software without changing a page", async () => {
    for (const name of ["chromium-tagged", "quartz-scan"]) {
      const pdf = open(
        new Uint8Array(readFileSync(`e2e/fixtures/pdf/${name}.pdf`))
      )
      const plan = partsFromCuts(pdf.facts.pages, cutsEvery(pdf.facts.pages, 1))
      const parts = await split(pdf, plan)
      expect(parts).toHaveLength(pdf.facts.pages)
      for (const [index, bytes] of parts.entries()) {
        const before = renderPage(mupdf, pdf, index, 300)
        const after = renderPage(mupdf, open(bytes), 0, 300)
        expect(
          Buffer.from(after.data).equals(Buffer.from(before.data)),
          `${name} page ${index + 1}`
        ).toBe(true)
        expect((await readPdf(bytes)).pages).toHaveLength(1)
      }
    }
  })
})
