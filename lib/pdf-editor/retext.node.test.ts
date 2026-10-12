// @vitest-environment node
/**
 * Changing the words of a page with the real engine. Results are read back
 * by pdf.js and pdf-lib: the old words must be gone, the new ones there in
 * the font the line was written in, and nothing else touched.
 */
import { readFileSync } from "node:fs"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { drawPage } from "@/lib/pdf-merger/mupdf-engine"
import {
  danglingRefs,
  embeddedFonts,
  readPdf,
  textPlaces,
} from "@/tests/pdf-reader"
import { makeTextPdf, TEXT } from "@/tests/pdf-text"
import { readDraft } from "./draft"
import { fontUrls } from "./fonts"
import {
  addFont,
  exportEdited,
  FontMissing,
  historyOf,
  madeAgain,
  startEditing,
  stepBack,
  stepForward,
  stopEditing,
  takeUp,
  type EditSession,
} from "./mupdf-edit"
import { applyText, linesOn } from "./mupdf-text"
import { checkLines } from "./report"
import type { PageLine } from "./retext"

function give(session: EditSession, ...keys: string[]) {
  for (const key of keys)
    addFont(
      mupdf,
      session,
      key,
      new Uint8Array(readFileSync(`public${fontUrls[key]}`))
    )
}

const lines = (session: EditSession, page = 0) => linesOn(mupdf, session, page)
const line = (session: EditSession, text: string, page = 0) =>
  lines(session, page).find((one) => one.text === text)!
const said = (session: EditSession, page = 0) =>
  lines(session, page).map((one) => one.text)

const retext = (session: EditSession, was: PageLine, text: string, page = 0) =>
  applyText(mupdf, session, {
    label: text ? "Change text" : "Take out text",
    ops: [{ do: "retext", page, box: was.box, was: was.text, text }],
  })

const PAID = TEXT.paidBold + TEXT.paidPlain
const ALL = [
  TEXT.title,
  TEXT.total,
  PAID,
  TEXT.warning,
  `${TEXT.area}2`,
  TEXT.linked,
  ...TEXT.tight,
  TEXT.turned,
]

describe("reading the lines of a page", () => {
  it("reads each line with where it is and how its letters look", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    expect(said(session)).toEqual(ALL)
    const total = line(session, TEXT.total)
    expect(total.styles).toHaveLength(1)
    expect(total.styles[0]).toMatchObject({
      font: "Helvetica",
      size: 11,
      colour: [0, 0, 0],
      rise: 0,
      standIn: "sans",
    })
    // From the top left of the page; the line it is written on is 100 down.
    expect(total.origin.x).toBeCloseTo(40, 1)
    expect(total.origin.y).toBeCloseTo(100, 1)
    expect(total.box.y).toBeLessThan(100)
    expect(total.box.y + total.box.height).toBeGreaterThan(100)

    // Two looks on one line, a colour, and a raised mark.
    const paid = line(session, PAID)
    expect(paid.styles.map((style) => style.font)).toEqual([
      "Helvetica-Bold",
      "Helvetica",
    ])
    expect(paid.styles[0].standIn).toBe("sans-bold")
    expect(paid.looks.join("")).toBe(
      "0".repeat(TEXT.paidBold.length) + "1".repeat(TEXT.paidPlain.length)
    )
    expect(line(session, TEXT.warning).styles[0].colour[0]).toBeCloseTo(0.8)
    const area = line(session, `${TEXT.area}2`)
    expect(area.styles[1]).toMatchObject({ size: 7, rise: 4 })
    expect(area.looks.at(-1)).toBe(1)
    stopEditing(session)
  })

  it("knows what each font of the file can write", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    // A font that is not embedded writes every letter of its kind.
    const plain = line(session, TEXT.total).styles[0].letters
    for (const letter of "AZaz09€éß.,:;") expect(plain).toContain(letter)
    // One that was embedded with only the letters in use writes only those.
    const title = line(session, TEXT.title).styles[0]
    expect(title.font).toMatch(/Kalam/)
    expect([...title.letters].sort().join("")).toBe(
      [...new Set(TEXT.title)].sort().join("")
    )
    // The copy that is read from is opened once, and let go of with the session.
    const { reading } = session
    expect(reading?.fonts.size).toBeGreaterThan(1)
    lines(session)
    expect(session.reading).toBe(reading)
    stopEditing(session)
    expect(session.reading).toBeUndefined()
  })

  it("says which lines cannot be retyped, and why", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    expect(line(session, TEXT.turned).fixed).toContain("turned")
    expect(line(session, TEXT.total).fixed).toBeUndefined()
    // On a page the file shows turned, a line that reads upright there is like any other.
    const second = line(session, TEXT.second, 1)
    expect(second.fixed).toBeUndefined()
    expect(second.origin.x).toBeCloseTo(60, 0)
    expect(second.origin.y).toBeCloseTo(100, 0)
    stopEditing(session)
  })
})

describe("changing a line", () => {
  it("takes the old words out of the file and writes the new ones in the same font, size and place", async () => {
    const original = await makeTextPdf()
    const session = startEditing(mupdf, original)
    const before = (await textPlaces(original))[0]
    const was = before.find((run) => run.text === TEXT.total)!
    expect(
      retext(session, line(session, TEXT.total), "Total due: 95 dollars")
    ).toEqual([0])
    expect(said(session)).toEqual(
      ALL.map((text) => (text === TEXT.total ? "Total due: 95 dollars" : text))
    )

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toEqual({ steps: 1, lines: 1, found: 1 })
    expect(report.added).toBe(0)
    expect(checkLines(report)).toContainEqual({
      text: "The page's own text was changed in 1 place. The old words are no longer in the file, and the line you wrote was read back from the result.",
      good: true,
    })
    expect(await danglingRefs(bytes)).toEqual([])
    const [page] = (await readPdf(bytes)).pages
    expect(page.text).toContain("Total due: 95 dollars")
    expect(page.text).not.toContain("120 euros")
    // Every other line says what it said, and the link is still a link.
    for (const text of ALL.filter(
      (one) => one !== TEXT.total && one !== TEXT.turned
    ))
      expect(page.text).toContain(text.replace(/2$/, ""))
    expect(page.links).toHaveLength(1)
    // The new line is where the old one was, in the same font at the same size.
    const [placed] = await textPlaces(bytes)
    const now = placed.find((run) => run.text.startsWith("Total due: 95"))!
    expect(now.x).toBeCloseTo(was.x, 1)
    expect(now.y).toBeCloseTo(was.y, 1)
    expect(now.size).toBeCloseTo(was.size, 1)
    // It is written with the very font the lines around it are written with.
    const untouched = placed.find((run) => run.text === TEXT.warning)!
    expect(now.font).toBe(untouched.font)
    // No font was added to the file, and none was copied.
    expect(await embeddedFonts(bytes)).toEqual(await embeddedFonts(original))
    stopEditing(session)
  })

  it("leaves the rest of the page as it was drawn", async () => {
    const original = await makeTextPdf()
    const session = startEditing(mupdf, original)
    const target = line(session, TEXT.warning)
    retext(session, target, "Paid on time")
    const { bytes } = await exportEdited(mupdf, session)
    const draw = (file: Uint8Array) => {
      const doc = new mupdf.PDFDocument(file)
      try {
        return drawPage(mupdf, doc, 0, 600)
      } finally {
        doc.destroy()
      }
    }
    const was = draw(original)
    const now = draw(bytes)
    let outside = 0
    let inside = 0
    for (let y = 0; y < was.height; y++)
      for (let x = 0; x < was.width; x++) {
        const at = (y * was.width + x) * 4
        if (
          was.data[at] === now.data[at] &&
          was.data[at + 1] === now.data[at + 1] &&
          was.data[at + 2] === now.data[at + 2]
        )
          continue
        if (
          y >= target.box.y - 2 &&
          y <= target.box.y + target.box.height + 2 &&
          x >= target.box.x - 2 &&
          x <= target.box.x + target.box.width + 60
        )
          inside++
        else outside++
      }
    // The drawn line, the filled box and every other letter are untouched.
    expect(outside).toBe(0)
    expect(inside).toBeGreaterThan(50)
    stopEditing(session)
  })

  it("gives typed letters the look of the letters beside them", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    // Typed straight after the bold words, then in the plain ones: a change at a time.
    const first = `${TEXT.paidBold}, on time${TEXT.paidPlain}`
    retext(session, line(session, PAID), first)
    retext(session, line(session, first), "Paid in full, on time by Ada King")
    const changed = line(session, "Paid in full, on time by Ada King")
    // ", on time" took the look of the bold letter before it; the rest kept its own.
    expect(changed.styles.map((style) => style.font)).toEqual([
      "Helvetica-Bold",
      "Helvetica",
    ])
    expect(changed.looks.join("")).toBe(
      "0".repeat("Paid in full, on time".length) +
        "1".repeat(" by Ada King".length)
    )
    // A raised mark stays raised and small when the words before it change.
    retext(session, line(session, `${TEXT.area}2`), "Floor in m2")
    const floor = line(session, "Floor in m2")
    expect(floor.styles[1]).toMatchObject({ size: 7, rise: 4 })
    // A colour stays.
    retext(session, line(session, TEXT.warning), "Overdue since April")
    expect(
      line(session, "Overdue since April").styles[0].colour[0]
    ).toBeCloseTo(0.8)
    const { bytes } = await exportEdited(mupdf, session)
    const runs = (await textPlaces(bytes))[0]
    const bold = runs.find((run) => run.text.includes("on time"))!
    const plain = runs.find((run) => run.text.includes("Ada King"))!
    expect(bold.font).not.toBe(plain.font)
    expect(plain.x).toBeGreaterThan(bold.x + 100)
    stopEditing(session)
  })

  it("writes a letter the file's font lacks in one of the editor's, and only that letter", async () => {
    const original = await makeTextPdf()
    const session = startEditing(mupdf, original)
    const title = line(session, TEXT.title)
    // The editor's font has to be there first: nothing is changed without it.
    expect(() => retext(session, title, "Quarterly report 2026")).toThrow(
      FontMissing
    )
    expect(said(session)).toEqual(ALL)
    expect(historyOf(session).position).toBe(0)
    give(session, title.styles[0].standIn)
    retext(session, title, "Quarterly report 2026")
    // Letters the font has need nothing else.
    retext(session, line(session, TEXT.total), "Total due: 99 euros")

    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toEqual({ steps: 2, lines: 2, found: 2 })
    expect(await danglingRefs(bytes)).toEqual([])
    const [page] = (await readPdf(bytes)).pages
    expect(page.text.replace(/\s+/g, "")).toContain("Quarterlyreport2026")
    const runs = (await textPlaces(bytes))[0]
    const words = runs.find((run) => run.text.includes("Quarterly"))!
    const year = runs.find((run) => run.text.includes("2026"))!
    // The words are still in the file's font; the figures are in ours, at the same size, after them.
    expect(year.font).not.toBe(words.font)
    expect(year.size).toBeCloseTo(18, 0)
    expect(year.x).toBeGreaterThan(words.x + 100)
    const fonts = await embeddedFonts(bytes)
    expect(fonts.filter((font) => font.name.includes("Kalam"))).toHaveLength(1)
    const ours = fonts.filter((font) => font.name.includes("Liberation"))
    expect(ours).toHaveLength(1)
    // Cut down to the four figures.
    expect(ours[0].bytes).toBeLessThan(20_000)
    stopEditing(session)
  })

  it("takes a line out when nothing is typed, also one that cannot be retyped", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    retext(session, line(session, TEXT.linked), "")
    const turned = line(session, TEXT.turned)
    expect(() => retext(session, turned, "Printed upright")).toThrow("turned")
    retext(session, turned, "")
    expect(said(session)).toEqual(
      ALL.filter((text) => text !== TEXT.linked && text !== TEXT.turned)
    )
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toEqual({ steps: 2, lines: 0, found: 0 })
    expect(checkLines(report).map((told) => told.text)).toContain(
      "The page's own text was changed in 2 places. What you took out is no longer in the file."
    )
    const [page] = (await readPdf(bytes)).pages
    expect(page.text).not.toContain(TEXT.linked)
    expect(page.text).not.toContain(TEXT.turned)
    // The link that lay over the words is still there.
    expect(page.links).toHaveLength(1)
    stopEditing(session)
  })

  it("changes a line between two that are set close to it, and leaves them whole", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    retext(session, line(session, TEXT.tight[1]), "The middle one, changed")
    expect(said(session)).toEqual(
      ALL.map((text) =>
        text === TEXT.tight[1] ? "The middle one, changed" : text
      )
    )
    const { bytes } = await exportEdited(mupdf, session)
    const [page] = (await readPdf(bytes)).pages
    expect(page.text).toContain(TEXT.tight[0])
    expect(page.text).toContain("The middle one, changed")
    expect(page.text).toContain(TEXT.tight[2])
    stopEditing(session)
  })

  it("writes upright on a page the file shows turned", async () => {
    const original = await makeTextPdf()
    const session = startEditing(mupdf, original)
    const was = (await textPlaces(original))[1][0]
    expect(
      retext(session, line(session, TEXT.second, 1), "Changed on its side", 1)
    ).toEqual([1])
    const again = line(session, "Changed on its side", 1)
    expect(again.fixed).toBeUndefined()
    expect(again.origin.x).toBeCloseTo(60, 0)
    const { bytes } = await exportEdited(mupdf, session)
    const [now] = (await textPlaces(bytes))[1]
    expect(now.text).toContain("Changed on its side")
    expect(now.x).toBeCloseTo(was.x, 0)
    expect(now.y).toBeCloseTo(was.y, 0)
    expect(now.angle).toBe(was.angle)
    stopEditing(session)
  })
})

describe("what is not changed", () => {
  it("makes no step of words that are already there, and refuses a line that is not", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    const total = line(session, TEXT.total)
    expect(retext(session, total, `  ${TEXT.total} `)).toEqual([])
    expect(historyOf(session).position).toBe(0)
    // The line said something else, or was somewhere else, when the change was asked for.
    expect(() =>
      retext(session, { ...total, text: "Total due: 1 euro" }, "x")
    ).toThrow("not on the page as it was")
    expect(() =>
      retext(session, { ...total, box: { ...total.box, y: 300 } }, "x")
    ).toThrow("not on the page as it was")
    expect(() =>
      applyText(mupdf, session, {
        label: "No",
        ops: [{ do: "erase" } as never],
      })
    ).toThrow("not a change to a line")
    // A page that is not there is passed over.
    expect(retext(session, total, "x", 9)).toEqual([])
    expect(said(session)).toEqual(ALL)
    expect(historyOf(session).position).toBe(0)
    stopEditing(session)
  })
})

describe("undoing and keeping", () => {
  it("undoes and makes again, a change at a time, and leaves nothing pointing at what is gone", async () => {
    const session = startEditing(mupdf, await makeTextPdf())
    give(session, "serif")
    retext(session, line(session, TEXT.title), "Yearly report")
    retext(session, line(session, TEXT.total), "Total due: nothing")
    retext(session, line(session, "Total due: nothing"), "Nothing is due")
    expect(stepBack(session)).toEqual([0])
    expect(said(session)).toContain("Total due: nothing")
    stepBack(session)
    stepBack(session)
    expect(said(session)).toEqual(ALL)
    stepForward(session)
    expect(said(session)).toContain("Yearly report")
    // A line that was changed can be changed again like any other.
    retext(session, line(session, "Yearly report"), "Yearly repot")
    const { bytes, report } = await exportEdited(mupdf, session)
    expect(report.retext).toEqual({ steps: 2, lines: 1, found: 1 })
    expect(await danglingRefs(bytes)).toEqual([])
    const [page] = (await readPdf(bytes)).pages
    expect(page.text.replace(/\s+/g, "")).toContain("Yearlyrepot")
    expect(page.text).toContain(TEXT.total)
    stopEditing(session)
  })

  it("is made again on a fresh copy and taken up from a draft", async () => {
    const bytes = await makeTextPdf()
    const session = startEditing(mupdf, bytes)
    retext(session, line(session, TEXT.total), "Total due: 7 euros")
    retext(session, line(session, TEXT.linked), "")
    const copy = madeAgain(session)
    expect(linesOn(mupdf, copy, 0)).toEqual(lines(session))
    copy.doc.destroy()

    const draft = readDraft(
      JSON.parse(
        JSON.stringify({
          name: "text.pdf",
          size: bytes.length,
          when: 1,
          steps: session.steps,
          position: session.position,
        })
      )
    )!
    expect(draft.steps.map((step) => step.done.kind)).toEqual(["text", "text"])
    const again = startEditing(mupdf, bytes)
    takeUp(again, draft.steps, draft.position)
    expect(lines(again)).toEqual(lines(session))
    stopEditing(session)
    stopEditing(again)
  })
})
