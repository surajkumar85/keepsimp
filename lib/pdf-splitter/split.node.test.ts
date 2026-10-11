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
import {
  areaTexts,
  halvePdf,
  pageInk,
  splitBySize,
  splitPart,
  type SizedWritten,
} from "./mupdf-split"
import { BLANK_BELOW } from "./blank"
import { defaultHalves, type HalveChoice } from "./halves"
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

describe("splitting by size", () => {
  /** Eight pages, each with a picture of about 30 kB that cannot be compressed. */
  const heavy = async () => open(await makeSharedPdf("W", 8))
  const bySize = async (pdf: OpenedPdf, limit: number) => {
    const parts: SizedWritten[] = []
    const listed = await splitBySize(mupdf, pdf, limit, {
      onPart: (part) => {
        parts.push(part)
      },
    })
    expect(listed.map((part) => [part.start, part.length])).toEqual(
      parts.map((part) => [part.start, part.length])
    )
    return parts
  }

  it("fills each part as far as the size allows, and no further", async () => {
    const pdf = await heavy()
    const limit = SHARED_PICTURE * 3.5
    const parts = await bySize(pdf, limit)
    expect(parts.map((part) => part.length)).toEqual([3, 3, 2])
    for (const part of parts) {
      expect(part.over).toBe(false)
      // The size that was measured is the size of the file handed over.
      expect(part.written.bytes.length).toBe(part.bytes)
      expect(part.bytes).toBeLessThanOrEqual(limit)
    }
    // Every page once, in order.
    expect(
      (
        await Promise.all(
          parts.map(async (part) =>
            (await readPdf(part.written.bytes)).pages.map((page) => page.text)
          )
        )
      ).flat()
    ).toEqual(Array.from({ length: 8 }, (_, at) => pageText("W", at + 1)))
    // One page more would not have fitted.
    const more = await splitPart(mupdf, pdf, [0, 1, 2, 3])
    expect(more.bytes.length).toBeGreaterThan(limit)
  })

  it("gives a page that is over the size a part to itself, and says so", async () => {
    const pdf = await heavy()
    const parts = await bySize(pdf, SHARED_PICTURE / 2)
    expect(parts).toHaveLength(8)
    expect(parts.every((part) => part.over && part.length === 1)).toBe(true)
    expect((await readPdf(parts[4].written.bytes)).pages[0].text).toBe("W-P5")
  })

  it("keeps a file that fits as one part", async () => {
    const pdf = await heavy()
    const parts = await bySize(pdf, SHARED_PICTURE * 20)
    expect(parts.map((part) => [part.start, part.length])).toEqual([[0, 8]])
    expect((await readPdf(parts[0].written.bytes)).pages).toHaveLength(8)
  })

  it("says how far it has got, and can be stopped", async () => {
    const pdf = await heavy()
    const seen: number[] = []
    await splitBySize(mupdf, pdf, SHARED_PICTURE * 2.5, {
      onPart: () => {},
      progress: (done, total) => {
        expect(total).toBe(8)
        seen.push(done)
      },
    })
    expect(seen).toEqual([2, 4, 6, 8])
    let calls = 0
    await expect(
      splitBySize(mupdf, pdf, SHARED_PICTURE * 2.5, {
        onPart: () => {},
        checkpoint: async () => {
          if (++calls > 5) throw new Error("stopped")
        },
      })
    ).rejects.toThrow("stopped")
  })

  it("puts attached files in the first part only", async () => {
    const pdf = await source("Q", {
      pages: 4,
      picture: true,
      attachments: { "notes.txt": "hello" },
    })
    const whole = (await splitPart(mupdf, pdf, [0, 1, 2, 3])).bytes.length
    const parts = await bySize(pdf, Math.round(whole * 0.7))
    expect(parts.length).toBeGreaterThan(1)
    expect((await readPdf(parts[0].written.bytes)).attachments).toEqual([
      "notes.txt",
    ])
    expect((await readPdf(parts[1].written.bytes)).attachments).toEqual([])
  })
})

describe("looking for blank pages", () => {
  /** Pages with: nothing, a line of text, a speck, a faint tint all over, and a punch hole. */
  const scanLike = async () => {
    const { PDFDocument, StandardFonts, rgb } = await import("@cantoo/pdf-lib")
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage([595, 842])
    doc.addPage([595, 842]).drawText("One line of text is not a blank page.", {
      x: 60,
      y: 700,
      size: 12,
      font,
    })
    doc.addPage([595, 842]).drawRectangle({
      x: 300,
      y: 400,
      width: 2,
      height: 2,
      color: rgb(0, 0, 0),
    })
    // Cream paper: a tint over the whole sheet is paper, not ink.
    doc.addPage([595, 842]).drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 842,
      color: rgb(0.96, 0.94, 0.86),
    })
    doc.addPage([595, 842]).drawCircle({
      x: 60,
      y: 421,
      size: 9,
      color: rgb(0.1, 0.1, 0.1),
    })
    return open(await doc.save())
  }

  it("tells empty pages from pages with something on them", async () => {
    const pdf = await scanLike()
    const shares = [0, 1, 2, 3, 4].map((page) => pageInk(mupdf, pdf, page))
    expect(shares[0]).toBe(0)
    expect(shares[3]).toBe(0)
    // A line of text is far above any setting.
    expect(shares[1]).toBeGreaterThan(BLANK_BELOW.loose)
    // A speck passes for blank unless the setting is strict.
    expect(shares[2]).toBeGreaterThan(0)
    expect(shares[2]).toBeLessThan(BLANK_BELOW.normal)
    // A punch hole passes only for the loose setting.
    expect(shares[4]).toBeGreaterThan(BLANK_BELOW.normal)
    expect(shares[4]).toBeLessThan(BLANK_BELOW.loose)
  })

  it("never takes a scanned page with writing on it for blank", () => {
    const pdf = open(
      new Uint8Array(readFileSync("e2e/fixtures/pdf/quartz-scan.pdf"))
    )
    for (let page = 0; page < pdf.facts.pages; page++)
      expect(pageInk(mupdf, pdf, page)).toBeGreaterThan(BLANK_BELOW.loose)
  })
})

describe("reading the text in an area", () => {
  it("reads the same place on every page", async () => {
    // Every page says "<tag>-P<n>" 40 points in and 120 points down a page of 298 by 420.
    const pdf = await source("N", { pages: 4 })
    const where = { left: 0, top: 0.2, right: 0.6, bottom: 0.35 }
    expect(areaTexts(pdf, where, 0, 4)).toEqual([
      "N-P1",
      "N-P2",
      "N-P3",
      "N-P4",
    ])
    expect(areaTexts(pdf, where, 2, 3)).toEqual(["N-P3"])
    // Nothing is written lower down.
    expect(
      areaTexts(pdf, { left: 0, top: 0.6, right: 1, bottom: 1 }, 0, 2)
    ).toEqual(["", ""])
  })

  it("finds no text on a scan", () => {
    const pdf = open(
      new Uint8Array(readFileSync("e2e/fixtures/pdf/quartz-scan.pdf"))
    )
    expect(
      areaTexts(pdf, { left: 0, top: 0, right: 1, bottom: 1 }, 0, 1)
    ).toEqual([""])
  })
})

describe("cutting double pages in half", () => {
  /**
   * Sheets of 600 by 400 that each hold two pages: "L<n>" on the left and
   * "R<n>" on the right, with a link on the right half of the first sheet.
   */
  const doubles = async (count: number, turned = false) => {
    const { PDFDocument, PDFName, StandardFonts, rgb, degrees } =
      await import("@cantoo/pdf-lib")
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    for (let sheet = 1; sheet <= count; sheet++) {
      // A turned sheet is stored on its side and shown turned a quarter.
      const page = doc.addPage(turned ? [400, 600] : [600, 400])
      if (turned) {
        page.setRotation(degrees(90))
        page.drawText(`L${sheet}`, {
          x: 300,
          y: 60,
          size: 30,
          font,
          rotate: degrees(90),
        })
        page.drawText(`R${sheet}`, {
          x: 300,
          y: 360,
          size: 30,
          font,
          rotate: degrees(90),
        })
        page.drawRectangle({
          x: 100,
          y: 330,
          width: 60,
          height: 200,
          color: rgb(0.8, 0.1, 0.1),
        })
      } else {
        page.drawText(`L${sheet}`, { x: 60, y: 300, size: 30, font })
        page.drawText(`R${sheet}`, { x: 360, y: 300, size: 30, font })
        page.drawRectangle({
          x: 330,
          y: 100,
          width: 200,
          height: 60,
          color: rgb(0.8, 0.1, 0.1),
        })
      }
    }
    if (!turned)
      doc.getPage(0).node.set(
        PDFName.of("Annots"),
        doc.context.obj([
          doc.context.register(
            doc.context.obj({
              Type: "Annot",
              Subtype: "Link",
              Rect: [330, 100, 530, 160],
              Border: [0, 0, 0],
              Dest: [doc.getPage(count - 1).ref, PDFName.of("Fit")],
            } as never)
          ),
        ])
      )
    doc.setTitle("Scanned book")
    return open(await doc.save())
  }
  const choice = (change: Partial<HalveChoice> = {}): HalveChoice => ({
    ...defaultHalves,
    which: "all",
    cover: false,
    ...change,
  })
  /** Each page's box as pdf-lib reads it: left, bottom, width, height. */
  const boxes = async (pdf: OpenedPdf) => {
    const { PDFDocument } = await import("@cantoo/pdf-lib")
    const bytes = (
      await splitPart(
        mupdf,
        pdf,
        pdf.pages.map((_, index) => index)
      )
    ).bytes
    const doc = await PDFDocument.load(bytes)
    return doc.getPages().map((page) => {
      const { x, y, width, height } = page.getCropBox()
      return [x, y, width, height]
    })
  }
  const halve = async (pdf: OpenedPdf, how: HalveChoice) => {
    const halved = await halvePdf(mupdf, pdf, how)
    opened.push(halved)
    return halved
  }
  /** A part of a picture, as its own picture. */
  const crop = (
    picture: { data: Uint8ClampedArray; width: number; height: number },
    left: number,
    top: number,
    width: number,
    height: number
  ) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++)
      data.set(
        picture.data.subarray(
          ((top + y) * picture.width + left) * 4,
          ((top + y) * picture.width + left + width) * 4
        ),
        y * width * 4
      )
    return data
  }
  const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
    Buffer.from(a).equals(Buffer.from(b))

  it("makes two pages of every sheet, left half first", async () => {
    const pdf = await doubles(3)
    const halved = await halve(pdf, choice())
    expect(halved.facts.pages).toBe(6)
    expect(halved.facts.title).toBe("Scanned book")
    expect(await boxes(halved)).toEqual([
      [0, 0, 300, 400],
      [300, 0, 300, 400],
      [0, 0, 300, 400],
      [300, 0, 300, 400],
      [0, 0, 300, 400],
      [300, 0, 300, 400],
    ])
    // Each half is drawn exactly as that half of the sheet was.
    const sheet = renderPage(mupdf, pdf, 1, 600)
    expect(
      same(renderPage(mupdf, halved, 2, 400).data, crop(sheet, 0, 0, 300, 400))
    ).toBe(true)
    expect(
      same(
        renderPage(mupdf, halved, 3, 400).data,
        crop(sheet, 300, 0, 300, 400)
      )
    ).toBe(true)
  })

  it("reads the right half first when asked, and cuts where it is told", async () => {
    const pdf = await doubles(1)
    expect(await boxes(await halve(pdf, choice({ first: "end" })))).toEqual([
      [300, 0, 300, 400],
      [0, 0, 300, 400],
    ])
    expect(await boxes(await halve(pdf, choice({ at: 0.4 })))).toEqual([
      [0, 0, 240, 400],
      [240, 0, 360, 400],
    ])
    // One above the other: the top half is the high half of the sheet.
    expect(
      await boxes(await halve(pdf, choice({ direction: "down" })))
    ).toEqual([
      [0, 200, 600, 200],
      [0, 0, 600, 200],
    ])
  })

  it("cuts a sheet that is stored on its side along the line a reader sees", async () => {
    const pdf = await doubles(1, true)
    const halved = await halve(pdf, choice())
    // Shown, the sheet is 600 wide; its left half is the low half of the stored page.
    expect(await boxes(halved)).toEqual([
      [0, 0, 400, 300],
      [0, 300, 400, 300],
    ])
    const sheet = renderPage(mupdf, pdf, 0, 600)
    expect([sheet.width, sheet.height]).toEqual([600, 400])
    expect(
      same(renderPage(mupdf, halved, 0, 400).data, crop(sheet, 0, 0, 300, 400))
    ).toBe(true)
    expect(
      same(
        renderPage(mupdf, halved, 1, 400).data,
        crop(sheet, 300, 0, 300, 400)
      )
    ).toBe(true)
  })

  it("keeps a single cover whole, and pages that are not double", async () => {
    const pdf = await doubles(3)
    expect((await halve(pdf, choice({ cover: true }))).facts.pages).toBe(5)
    const mixed = await source("M", {
      pages: 3,
      size: (page) => (page === 2 ? [600, 400] : [300, 400]),
    })
    const halved = await halve(mixed, choice({ which: "wide" }))
    expect(await boxes(halved)).toEqual([
      [0, 0, 300, 400],
      [0, 0, 300, 400],
      [300, 0, 300, 400],
      [0, 0, 300, 400],
    ])
  })

  it("leaves a link with the half it lies on", async () => {
    const pdf = await doubles(2)
    const halved = await halve(pdf, choice())
    const bytes = (await splitPart(mupdf, halved, [0, 1, 2, 3])).bytes
    const read = await readPdf(bytes)
    // The link is on the right half of the first sheet, and leads to the second sheet's first half.
    expect(read.pages.map((page) => page.links)).toEqual([[], [3], [], []])
  })

  it("can be split like any other file afterwards", async () => {
    const pdf = await doubles(2)
    const halved = await halve(pdf, choice())
    const part = (await splitPart(mupdf, halved, [1, 2])).bytes
    expect(await storedPictures(part)).toBe(0)
    const read = await readPdf(part)
    expect(read.pages.map((page) => [page.width, page.height])).toEqual([
      [300, 400],
      [300, 400],
    ])
  })
})
