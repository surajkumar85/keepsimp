import { describe, expect, it } from "vitest"
import {
  contentsPageCount,
  drawContents,
  layoutContents,
  showGlyphs,
  winAnsiHex,
  type ContentsEntry,
} from "./contents"

const a4 = { width: 595, height: 842 }
/** Every character is half as wide as the text is tall. */
const measure = (text: string, size: number) => [...text].length * size * 0.5
const entries = (count: number): ContentsEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    title: `Chapter ${index + 1}`,
    page: index * 3 + 2,
  }))

describe("contentsPageCount", () => {
  it("fits fewer lines on the first page, which has the heading", () => {
    // A4 with a 60-point margin: 722 points of height, 44 of them for the heading.
    expect(contentsPageCount(0, a4)).toBe(0)
    expect(contentsPageCount(1, a4)).toBe(1)
    expect(contentsPageCount(30, a4)).toBe(1)
    expect(contentsPageCount(31, a4)).toBe(2)
    expect(contentsPageCount(30 + 32, a4)).toBe(2)
    expect(contentsPageCount(30 + 33, a4)).toBe(3)
  })

  it("always fits at least one line on a page", () => {
    expect(contentsPageCount(3, { width: 100, height: 60 })).toBe(3)
  })

  it("agrees with the layout", () => {
    for (const count of [1, 29, 30, 31, 62, 63, 200])
      expect(
        layoutContents(entries(count), a4, measure),
        `${count}`
      ).toHaveLength(contentsPageCount(count, a4))
  })
})

describe("layoutContents", () => {
  it("puts the heading on the first page and the lines beneath it", () => {
    const [page] = layoutContents(entries(2), a4, measure)
    expect(page.heading).toEqual({ text: "Contents", x: 60, y: 762, size: 20 })
    expect(page.lines).toEqual([
      {
        title: "Chapter 1",
        number: "2",
        titleX: 60,
        // One digit, 5.5 points wide, ends at the right margin.
        numberX: 529.5,
        y: 727,
        leader: { from: 117.5, to: 521.5 },
        area: [60, 722, 535, 741],
        target: 1,
      },
      {
        title: "Chapter 2",
        number: "5",
        titleX: 60,
        numberX: 529.5,
        y: 705,
        leader: { from: 117.5, to: 521.5 },
        area: [60, 700, 535, 719],
        target: 4,
      },
    ])
  })

  it("carries on at the top of the next page, without a heading", () => {
    const pages = layoutContents(entries(31), a4, measure)
    expect(pages.map((page) => page.lines.length)).toEqual([30, 1])
    expect(pages[1].heading).toBeNull()
    expect(pages[1].lines[0]).toMatchObject({ title: "Chapter 31", y: 771 })
    // No line runs into the bottom margin.
    expect(
      Math.min(...pages[0].lines.map((line) => line.y))
    ).toBeGreaterThanOrEqual(60)
  })

  it("shortens a title that would run into the page number", () => {
    const long = "A very long title ".repeat(12)
    const [page] = layoutContents([{ title: long, page: 1234 }], a4, measure)
    const [line] = page.lines
    expect(line.title.endsWith("…")).toBe(true)
    expect(line.title.length).toBeLessThan(long.length)
    // It stops short of the number, and has no room for dots.
    expect(60 + measure(line.title, 11)).toBeLessThanOrEqual(line.numberX - 8)
    expect(line.leader).toBeNull()
    expect(line.title).not.toMatch(/ …$/)
  })

  it("names an entry that has no title, and trims the others", () => {
    const [page] = layoutContents(
      [
        { title: "   ", page: 1 },
        { title: "  Spaced  ", page: 2 },
      ],
      a4,
      measure
    )
    expect(page.lines.map((line) => line.title)).toEqual(["Untitled", "Spaced"])
  })

  it("uses a margin that suits small and large pages", () => {
    const small = layoutContents(
      entries(1),
      { width: 200, height: 300 },
      measure
    )
    expect(small[0].lines[0].titleX).toBe(24)
    const large = layoutContents(
      entries(1),
      { width: 2000, height: 3000 },
      measure
    )
    expect(large[0].lines[0].titleX).toBe(64)
  })

  it("keeps one letter of a title even on a page too narrow for it", () => {
    const [page] = layoutContents(
      [{ title: "Wide", page: 1 }],
      { width: 60, height: 300 },
      measure
    )
    expect(page.lines[0].title).toBe("W…")
  })

  it("has nothing to lay out for no entries", () => {
    expect(layoutContents([], a4, measure)).toEqual([])
  })
})

describe("drawContents", () => {
  it("draws the heading, each title and number, and the dots between", () => {
    const [page] = layoutContents(entries(1), a4, measure)
    const show = (text: string, size: number, x: number, y: number) =>
      `[${text}@${size}:${x},${y}]`
    expect(drawContents(page, show).split("\n")).toEqual([
      "[Contents@20:60,762]",
      "[Chapter 1@11:60,727]",
      "[2@11:529.5,727]",
      "q 0.55 G 0.6 w [0.6 3] 0 d 1 J 117.5 729 m 521.5 729 l S Q",
    ])
  })

  it("leaves out the heading and the dots where there are none", () => {
    const pages = layoutContents(
      [...entries(30), { title: "x".repeat(200), page: 9 }],
      a4,
      measure
    )
    const drawn = drawContents(pages[1], (text) => `[${text.length}]`)
    expect(drawn.split("\n")).toHaveLength(2)
    expect(drawn).not.toContain(" l S")
  })
})

describe("showGlyphs", () => {
  it("writes a text command with rounded numbers", () => {
    expect(showGlyphs("F1", "00220045", 11, 60, 727.004)).toBe(
      "BT /F1 11 Tf 60 727 Td <00220045> Tj ET"
    )
    expect(showGlyphs("F2", "", 20.555, 1 / 3, 2)).toBe(
      "BT /F2 20.56 Tf 0.33 2 Td <> Tj ET"
    )
  })
})

describe("winAnsiHex", () => {
  it("writes plain and accented Latin letters as one byte each", () => {
    expect(winAnsiHex("Az 09~")).toBe("417a2030397e")
    expect(winAnsiHex("Résumé ÿ")).toBe("52e973756de920ff")
    expect(winAnsiHex("")).toBe("")
  })

  it("knows the dashes, quotes and signs the encoding adds", () => {
    expect(
      winAnsiHex("– — … ‘ ’ “ ” • € ™ Œ œ Š š Ž ž Ÿ ƒ ˆ ˜ ‚ „ † ‡ ‰ ‹ ›")
    ).toBe(
      "96 97 85 91 92 93 94 95 80 99 8c 9c 8a 9a 8e 9e 9f 83 88 98 82 84 86 87 89 8b 9b"
        .split(" ")
        .join("20")
    )
  })

  it("has no answer for letters outside the encoding", () => {
    for (const text of [
      "Обзор",
      "αβγ",
      "概要",
      "tab\there",
      "line\nbreak",
      "emoji 😀",
      "Ł",
    ])
      expect(winAnsiHex(text), text).toBeNull()
  })
})
