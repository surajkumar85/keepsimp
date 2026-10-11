// @vitest-environment node
/**
 * The reader's side of the real engine. What it says about pages, text and
 * places is checked against pdf.js reading the same file.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { afterEach, describe, expect, it } from "vitest"
import { makePdf, pageText, type FixtureOptions } from "@/tests/pdf-fixtures"
import {
  closePdf,
  openPdf,
  openPicture,
  renderPage,
  type OpenedPdf,
} from "@/lib/pdf-merger/mupdf-engine"
import { pageSizes, readPage, searchPage } from "./mupdf-read"
import { placeLine, plainText, quadBox } from "./text"

const opened: OpenedPdf[] = []
afterEach(() => {
  for (const pdf of opened.splice(0)) closePdf(pdf)
})
const open = (bytes: Uint8Array) => {
  const pdf = openPdf(mupdf, bytes)
  opened.push(pdf)
  return pdf
}

/** Each page as pdf.js sees it: its size as shown, and where each run of text starts. */
async function seenByPdfJs(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  try {
    const pages = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      const view = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      pages.push({
        width: view.width,
        height: view.height,
        runs: content.items.flatMap((item) => {
          if (!("str" in item) || !item.str.trim()) return []
          // The start of the run's baseline, measured from the top left of the page as shown.
          const [x, y] = view.convertToViewportPoint(
            item.transform[4],
            item.transform[5]
          )
          return [{ text: item.str, x, y }]
        }),
      })
    }
    return pages
  } finally {
    await doc.loadingTask.destroy()
  }
}

const fixture = (tag: string, options: FixtureOptions = {}) =>
  makePdf(tag, options)

describe("pageSizes", () => {
  it("agrees with pdf.js and with the engine's own drawing, for turned and mixed pages", async () => {
    const bytes = await fixture("S", {
      pages: 5,
      size: (page) => (page % 2 ? [298, 420] : [612, 792]),
      rotate: { 2: 90, 3: 180, 4: 270, 5: -90 },
    })
    const pdf = open(bytes)
    const sizes = pageSizes(pdf)
    const seen = await seenByPdfJs(bytes)
    expect(sizes).toHaveLength(5)
    sizes.forEach((size, index) => {
      expect(size.width).toBeCloseTo(seen[index].width, 3)
      expect(size.height).toBeCloseTo(seen[index].height, 3)
      const picture = renderPage(mupdf, pdf, index, 400)
      expect(picture.width / picture.height).toBeCloseTo(
        size.width / size.height,
        1
      )
    })
    expect(sizes[1]).toEqual({ width: 792, height: 612 })
  })

  it("reads sizes that pages leave to the page tree", async () => {
    const bytes = await fixture("I", { pages: 2, inherit: true })
    const sizes = pageSizes(open(bytes))
    const seen = await seenByPdfJs(bytes)
    expect(sizes).toEqual([
      { width: seen[0].width, height: seen[0].height },
      { width: seen[1].width, height: seen[1].height },
    ])
    expect(sizes[0]).toEqual({ width: 420, height: 298 })
  })

  it("agrees with pdf.js on files from other software", async () => {
    for (const name of ["chromium-tagged", "quartz-scan"]) {
      const bytes = new Uint8Array(readFileSync(`e2e/fixtures/pdf/${name}.pdf`))
      const sizes = pageSizes(open(bytes))
      const seen = await seenByPdfJs(bytes)
      expect(sizes).toHaveLength(seen.length)
      sizes.forEach((size, index) => {
        expect(size.width).toBeCloseTo(seen[index].width, 1)
        expect(size.height).toBeCloseTo(seen[index].height, 1)
      })
    }
  })

  it("shows only the cropped part of a sheet, scaled by the page's own unit", async () => {
    const { PDFDocument, PDFName } = await import("@cantoo/pdf-lib")
    const doc = await PDFDocument.create()
    const cropped = doc.addPage([600, 800])
    cropped.node.set(
      PDFName.of("CropBox"),
      doc.context.obj([100, 100, 400, 300])
    )
    // A crop that reaches beyond the sheet is cut off at the sheet's edge.
    const beyond = doc.addPage([600, 800])
    beyond.node.set(
      PDFName.of("CropBox"),
      doc.context.obj([500, 700, 900, 900])
    )
    // A crop that misses the sheet altogether is ignored.
    const missed = doc.addPage([600, 800])
    missed.node.set(
      PDFName.of("CropBox"),
      doc.context.obj([900, 900, 950, 950])
    )
    const large = doc.addPage([600, 800])
    large.node.set(PDFName.of("UserUnit"), doc.context.obj(2))
    // Corners written the wrong way round, and a box that is no box.
    const backwards = doc.addPage([600, 800])
    backwards.node.set(
      PDFName.of("MediaBox"),
      doc.context.obj([300, 500, 0, 0])
    )
    const broken = doc.addPage([600, 800])
    broken.node.set(PDFName.of("MediaBox"), doc.context.obj([0, 0, 0]))
    const pdf = open(await doc.save())
    const sizes = pageSizes(pdf)
    expect(sizes).toEqual([
      { width: 300, height: 200 },
      { width: 100, height: 100 },
      { width: 600, height: 800 },
      { width: 1200, height: 1600 },
      { width: 300, height: 500 },
      { width: 612, height: 792 },
    ])
    // The engine draws each page with the same shape.
    sizes.forEach((size, index) => {
      const picture = renderPage(mupdf, pdf, index, 300)
      expect(picture.width / picture.height).toBeCloseTo(
        size.width / size.height,
        1
      )
    })
  })

  it("gives a picture its page", () => {
    const pixels = {
      data: new Uint8ClampedArray(40 * 30 * 4).fill(255),
      width: 40,
      height: 30,
    }
    const pdf = openPicture(mupdf, { pixels })
    opened.push(pdf)
    const [size] = pageSizes(pdf)
    expect(size.width / size.height).toBeCloseTo(40 / 30, 3)
  })
})

describe("readPage", () => {
  it("gives each line where pdf.js finds it, on pages turned every way", async () => {
    const bytes = await fixture("T", {
      pages: 4,
      rotate: { 2: 90, 3: 180, 4: 270 },
    })
    const pdf = open(bytes)
    const seen = await seenByPdfJs(bytes)
    for (let index = 0; index < 4; index++) {
      const { lines } = readPage(pdf, index)
      expect(lines.map((line) => line.text)).toEqual([pageText("T", index + 1)])
      expect(lines[0].size).toBeCloseTo(24)
      const [run] = seen[index].runs
      // The start of the baseline lies on the left edge of the line's box, between its top and foot.
      const [ulx, uly, , , llx, lly] = lines[0].quad
      const between = (value: number, a: number, b: number) =>
        value >= Math.min(a, b) - 1 && value <= Math.max(a, b) + 1
      expect(between(run.x, ulx, llx)).toBe(true)
      expect(between(run.y, uly, lly)).toBe(true)
      // On a turned page the line is turned with it.
      expect(placeLine(lines[0]).angle).toBeCloseTo([0, 90, 180, -90][index], 0)
    }
  })

  it("reads the lines of a real document in order", () => {
    const pdf = open(
      new Uint8Array(readFileSync("public/samples/keepsimp-report.pdf"))
    )
    const text = plainText(readPage(pdf, 0).lines)
    expect(text.split("\n").slice(0, 2)).toEqual([
      "Quarterly report",
      "A sample document for the KeepSimp PDF merger.",
    ])
  })

  it("finds no text on a scanned page", () => {
    const pdf = open(
      new Uint8Array(readFileSync("e2e/fixtures/pdf/quartz-scan.pdf"))
    )
    expect(readPage(pdf, 0).lines).toEqual([])
  })

  it("lists links to other pages, by place, by name and by action", async () => {
    const pdf = open(
      await fixture("L", {
        pages: 4,
        links: [
          { from: 1, to: 3 },
          { from: 1, to: 4, how: "name" },
          { from: 2, to: 1, how: "action" },
        ],
      })
    )
    const first = readPage(pdf, 0).links
    expect(first.map((link) => link.page).sort()).toEqual([2, 3])
    for (const link of first) {
      const [left, top, right, bottom] = link.rect
      expect(right).toBeGreaterThan(left)
      expect(bottom).toBeGreaterThan(top)
    }
    expect(readPage(pdf, 1).links.map((link) => link.page)).toEqual([0])
    expect(readPage(pdf, 2).links).toEqual([])
  })

  it("leaves out links that lead to the web", async () => {
    const pdf = open(
      new Uint8Array(readFileSync("e2e/fixtures/pdf/chromium-tagged.pdf"))
    )
    for (let index = 0; index < pdf.facts.pages; index++)
      for (const link of readPage(pdf, index).links)
        expect(link.page).toBeLessThan(pdf.facts.pages)
  })
})

describe("searchPage", () => {
  it("finds words whatever their capitals, inside the line that holds them", async () => {
    const pdf = open(
      new Uint8Array(readFileSync("public/samples/keepsimp-report.pdf"))
    )
    const { hits, text } = searchPage(pdf, 0, "keepsimp")
    expect(text).toBe(true)
    expect(hits).toHaveLength(1)
    const box = quadBox(hits[0][0])
    const line = readPage(pdf, 0).lines.find((entry) =>
      entry.text.includes("KeepSimp")
    )!
    const whole = quadBox(line.quad)
    expect(box.left).toBeGreaterThan(whole.left)
    expect(box.left + box.width).toBeLessThan(whole.left + whole.width)
    expect(box.top).toBeCloseTo(whole.top, 0)
    expect(box.height).toBeCloseTo(whole.height, 0)
  })

  it("finds every place on a page, and nothing where there is none", async () => {
    const pdf = open(
      new Uint8Array(readFileSync("public/samples/keepsimp-report.pdf"))
    )
    expect(searchPage(pdf, 0, "report").hits.length).toBeGreaterThan(1)
    expect(searchPage(pdf, 0, "zebra crossing")).toEqual({
      hits: [],
      text: true,
    })
  })

  it("finds a word typed without its accent", async () => {
    const pdf = open(await fixture("Café", { pages: 1 }))
    expect(searchPage(pdf, 0, "cafe-p1").hits).toHaveLength(1)
  })

  it("finds text on the page it is on and not on others", async () => {
    const pdf = open(await fixture("W", { pages: 3 }))
    expect(searchPage(pdf, 1, "W-P2").hits).toHaveLength(1)
    expect(searchPage(pdf, 0, "W-P2").hits).toEqual([])
  })

  it("says when a page has no text to search, as a scan has not", () => {
    const pdf = open(
      new Uint8Array(readFileSync("e2e/fixtures/pdf/quartz-scan.pdf"))
    )
    expect(searchPage(pdf, 0, "anything")).toEqual({ hits: [], text: false })
  })
})
