import { describe, expect, it } from "vitest"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import {
  deepestLevel,
  headingsAt,
  headingsOf,
  partsFromHeadings,
  type Heading,
} from "./bookmarks"

const mark = (
  title: string,
  page: number | null,
  children: Bookmark[] = []
): Bookmark => ({ title, uri: undefined, page, open: false, children })

const book = [
  mark("Preface", 1),
  mark("Part one", 3, [
    mark("Chapter 1", 3, [mark("A detail", 4)]),
    mark("Chapter 2", 6),
  ]),
  mark("  Notes  ", null, [mark("Chapter 3", 9)]),
  mark("Elsewhere", null),
]
const shown = (parts: { pages: number[]; label?: string }[]) =>
  parts.map((part) => [
    part.label,
    part.pages[0] + 1,
    part.pages[part.pages.length - 1] + 1,
  ])

describe("headingsOf", () => {
  it("lists every bookmark that leads to a page, with its level", () => {
    expect(headingsOf(book)).toEqual([
      { title: "Preface", page: 1, level: 1 },
      { title: "Part one", page: 3, level: 1 },
      { title: "Chapter 1", page: 3, level: 2 },
      { title: "A detail", page: 4, level: 3 },
      { title: "Chapter 2", page: 6, level: 2 },
      { title: "Chapter 3", page: 9, level: 2 },
    ])
  })

  it("finds how deep the bookmarks go", () => {
    expect(deepestLevel(headingsOf(book))).toBe(3)
    expect(deepestLevel(headingsOf([mark("Nowhere", null)]))).toBe(0)
    expect(deepestLevel([])).toBe(0)
  })
})

describe("headingsAt", () => {
  const all = headingsOf(book)

  it("takes the bookmarks of one level", () => {
    expect(headingsAt(all, 1).map((heading) => heading.title)).toEqual([
      "Preface",
      "Part one",
    ])
    expect(headingsAt(all, 2).map((heading) => heading.title)).toEqual([
      "Chapter 1",
      "Chapter 2",
      "Chapter 3",
    ])
    expect(headingsAt(all, 4)).toEqual([])
  })

  it("keeps only titles that hold the words typed, whatever their capitals", () => {
    expect(
      headingsAt(all, 2, " chapter 2 ").map((heading) => heading.title)
    ).toEqual(["Chapter 2"])
    expect(headingsAt(all, 2, "appendix")).toEqual([])
  })

  it("puts bookmarks in page order, and lets the first of a page stand", () => {
    const mixed: Heading[] = [
      { title: "Late", page: 8, level: 1 },
      { title: "Early", page: 2, level: 1 },
      { title: "Also early", page: 2, level: 1 },
      { title: "Middle", page: 5, level: 1 },
    ]
    expect(headingsAt(mixed, 1).map((heading) => heading.title)).toEqual([
      "Early",
      "Middle",
      "Late",
    ])
  })
})

describe("partsFromHeadings", () => {
  const starts = headingsAt(headingsOf(book), 2)

  it("runs each part from its bookmark to the page before the next", () => {
    expect(shown(partsFromHeadings(starts, 12, "join"))).toEqual([
      ["Chapter 1", 1, 6],
      ["Chapter 2", 7, 9],
      ["Chapter 3", 10, 12],
    ])
  })

  it("gives the pages before the first bookmark a part of their own when asked", () => {
    expect(shown(partsFromHeadings(starts, 12, "own"))).toEqual([
      ["Front", 1, 3],
      ["Chapter 1", 4, 6],
      ["Chapter 2", 7, 9],
      ["Chapter 3", 10, 12],
    ])
  })

  it("has no front part when the first bookmark opens the first page", () => {
    const first: Heading[] = [
      { title: "Start", page: 0, level: 1 },
      { title: "More", page: 2, level: 1 },
    ]
    expect(shown(partsFromHeadings(first, 4, "own"))).toEqual([
      ["Start", 1, 2],
      ["More", 3, 4],
    ])
  })

  it("ignores bookmarks that lead outside the file, and makes nothing from none", () => {
    const outside: Heading[] = [
      { title: "In", page: 1, level: 1 },
      { title: "Out", page: 40, level: 1 },
      { title: "Before", page: -1, level: 1 },
    ]
    expect(shown(partsFromHeadings(outside, 5, "join"))).toEqual([["In", 1, 5]])
    expect(partsFromHeadings([], 5, "own")).toEqual([])
  })
})
