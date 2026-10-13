import { describe, expect, it } from "vitest"
import type { Bookmark } from "@/lib/pdf-merger/outline"
import {
  added,
  bookmarkAt,
  bookmarkTo,
  countBookmarks,
  DEEPEST_BOOKMARK,
  indented,
  labelsFor,
  listed,
  MOST_BOOKMARKS,
  movedBy,
  numbered,
  outdented,
  readDocumentOp,
  removed,
  renamed,
  retargeted,
  sameDetails,
} from "./document"

const mark = (title: string, page: number | null, children: Bookmark[] = []) =>
  ({
    title,
    uri: page === null ? undefined : `#page=${page + 1}&view=Fit`,
    page,
    open: false,
    children,
  }) satisfies Bookmark

/** A, B (with B1, B2), C. */
const tree = () => [
  mark("A", 0),
  mark("B", 1, [mark("B1", 2), mark("B2", 3)]),
  mark("C", 4),
]

/** A list as a line: titles, with those beneath in brackets. */
const said = (items: readonly Bookmark[]): string =>
  items
    .map(
      (item) =>
        item.title + (item.children.length ? `(${said(item.children)})` : "")
    )
    .join(" ")

describe("a list of bookmarks", () => {
  it("is counted and walked from the top down", () => {
    expect(countBookmarks(tree())).toBe(5)
    expect(countBookmarks([])).toBe(0)
    expect(listed(tree()).map((one) => one.path.join("."))).toEqual([
      "0",
      "1",
      "1.0",
      "1.1",
      "2",
    ])
    expect(bookmarkAt(tree(), [1, 1])?.title).toBe("B2")
    expect(bookmarkAt(tree(), [3])).toBeNull()
    expect(bookmarkAt(tree(), [0, 0])).toBeNull()
    expect(bookmarkAt(tree(), [])).toBeNull()
  })

  it("has a bookmark renamed, led elsewhere and taken out", () => {
    expect(said(renamed(tree(), [1, 0], "First"))).toBe("A B(First B2) C")
    // A place that is not there changes nothing.
    expect(said(renamed(tree(), [7], "x"))).toBe(said(tree()))
    const led = retargeted(tree(), [1], 9)
    expect(led[1].page).toBe(9)
    // It keeps the view it had of its page.
    expect(led[1].uri).toBe("#page=10&view=Fit")
    // One that led nowhere, or outside the file, leads to the page plainly.
    const outside = [{ ...mark("Web", null), uri: "https://example.org/" }]
    expect(retargeted(outside, [0], 2)[0].uri).toBe("#page=3")
    expect(said(removed(tree(), [1]))).toBe("A C")
    expect(said(removed(tree(), [1, 0]))).toBe("A B(B2) C")
  })

  it("has a bookmark added after another, or at the end", () => {
    const fresh = bookmarkTo("New", 6)
    expect(fresh).toEqual({
      title: "New",
      uri: "#page=7",
      page: 6,
      open: true,
      children: [],
    })
    const end = added(tree(), null, fresh)
    expect(said(end.items)).toBe("A B(B1 B2) C New")
    expect(end.path).toEqual([3])
    const after = added(tree(), [0], fresh)
    expect(said(after.items)).toBe("A New B(B1 B2) C")
    expect(after.path).toEqual([1])
    const beneath = added(tree(), [1, 0], fresh)
    expect(said(beneath.items)).toBe("A B(B1 New B2) C")
    expect(beneath.path).toEqual([1, 1])
    // After a place that is not there is at the end.
    expect(added(tree(), [9], fresh).path).toEqual([3])
  })

  it("moves a bookmark up and down among those on its level", () => {
    const down = movedBy(tree(), [0], 1)!
    expect(said(down.items)).toBe("B(B1 B2) A C")
    expect(down.path).toEqual([1])
    const up = movedBy(tree(), [1, 1], -1)!
    expect(said(up.items)).toBe("A B(B2 B1) C")
    expect(up.path).toEqual([1, 0])
    expect(movedBy(tree(), [0], -1)).toBeNull()
    expect(movedBy(tree(), [2], 1)).toBeNull()
    expect(movedBy(tree(), [1, 1], 1)).toBeNull()
    expect(movedBy(tree(), [5], 1)).toBeNull()
    expect(movedBy(tree(), [0, 0], 1)).toBeNull()
  })

  it("puts a bookmark beneath the one before it, and takes it out again", () => {
    const under = indented(tree(), [2])!
    expect(said(under.items)).toBe("A B(B1 B2 C)")
    expect(under.path).toEqual([1, 2])
    // The one it went beneath is shown open.
    expect(under.items[1].open).toBe(true)
    const deeper = indented(tree(), [1, 1])!
    expect(said(deeper.items)).toBe("A B(B1(B2)) C")
    expect(deeper.path).toEqual([1, 0, 0])
    expect(indented(tree(), [0])).toBeNull()
    expect(indented(tree(), [1, 0])).toBeNull()
    expect(indented(tree(), [9])).toBeNull()
    const out = outdented(tree(), [1, 0])!
    expect(said(out.items)).toBe("A B(B2) B1 C")
    expect(out.path).toEqual([2])
    expect(outdented(tree(), [1])).toBeNull()
    expect(outdented(tree(), [1, 5])).toBeNull()
    // And back.
    expect(said(outdented(under.items, under.path)!.items)).toBe(said(tree()))
  })

  it("is never made deeper than a list may be", () => {
    // A chain as deep as is allowed, and one bookmark before it.
    let chain = mark("deepest", 0)
    for (let level = 1; level < DEEPEST_BOOKMARK - 1; level++)
      chain = mark(`level ${level}`, 0, [chain])
    const items = [mark("before", 0), chain]
    // Beneath "before" the chain would be one level too deep.
    expect(indented([mark("x", 0), mark("y", 0, [chain])], [1])).toBeNull()
    expect(indented(items, [1])).not.toBeNull()
  })
})

describe("readDocumentOp", () => {
  it("takes bookmarks, with what is beneath them", () => {
    expect(
      readDocumentOp({
        do: "bookmarks",
        items: [
          {
            title: "A",
            uri: "#page=1",
            page: 0,
            open: true,
            more: 1,
            children: [{ title: "B", page: null, uri: null }],
          },
        ],
      })
    ).toEqual({
      do: "bookmarks",
      items: [
        {
          title: "A",
          uri: "#page=1",
          page: 0,
          open: true,
          children: [
            {
              title: "B",
              uri: undefined,
              page: null,
              open: false,
              children: [],
            },
          ],
        },
      ],
    })
    expect(readDocumentOp({ do: "bookmarks", items: [] })).toEqual({
      do: "bookmarks",
      items: [],
    })
  })

  it("refuses bookmarks that are none", () => {
    const deep = (levels: number): unknown =>
      levels ? [{ title: "x", page: 0, children: deep(levels - 1) }] : []
    for (const items of [
      null,
      "A",
      [null],
      ["A"],
      [{ title: 5, page: 0 }],
      [{ title: "x".repeat(501), page: 0 }],
      [{ title: "A", page: -1 }],
      [{ title: "A", page: 0.5 }],
      [{ title: "A", page: "0" }],
      [{ title: "A", page: 0, uri: 7 }],
      [{ title: "A", page: 0, uri: "x".repeat(2001) }],
      [{ title: "A", page: 0, children: "none" }],
      deep(DEEPEST_BOOKMARK + 1),
      Array.from({ length: MOST_BOOKMARKS + 1 }, () => ({
        title: "A",
        page: 0,
      })),
    ])
      expect(readDocumentOp({ do: "bookmarks", items })).toBeNull()
    expect(
      readDocumentOp({ do: "bookmarks", items: deep(DEEPEST_BOOKMARK) })
    ).not.toBeNull()
  })

  it("takes what a file says of itself, and the runs of its page numbers", () => {
    const details = { title: "T", author: "A", subject: "", keywords: "k, l" }
    expect(
      readDocumentOp({ do: "details", details: { ...details, more: 1 } })
    ).toEqual({ do: "details", details })
    for (const bad of [
      null,
      {},
      { ...details, title: 5 },
      { ...details, author: "x".repeat(2001) },
      { title: "T", author: "A", subject: "" },
    ])
      expect(readDocumentOp({ do: "details", details: bad })).toBeNull()
    expect(
      readDocumentOp({
        do: "labels",
        runs: [
          { start: 2, style: "D", prefix: "", first: 1, more: 1 },
          { start: 0, style: "r", prefix: "p. ", first: 3 },
        ],
      })
    ).toEqual({
      do: "labels",
      runs: [
        { start: 0, style: "r", prefix: "p. ", first: 3 },
        { start: 2, style: "D", prefix: "", first: 1 },
      ],
    })
    expect(readDocumentOp({ do: "labels", runs: [] })).toEqual({
      do: "labels",
      runs: [],
    })
    const run = { start: 0, style: "D", prefix: "", first: 1 }
    for (const runs of [
      null,
      [null],
      [{ ...run, start: -1 }],
      [{ ...run, start: 0.5 }],
      [{ ...run, style: "x" }],
      [{ ...run, prefix: 5 }],
      [{ ...run, prefix: "x".repeat(61) }],
      [{ ...run, first: 0 }],
      [{ ...run, first: 1.5 }],
      [{ ...run, first: 2_000_000 }],
      [run, run],
      Array.from({ length: 201 }, (_, start) => ({ ...run, start })),
    ])
      expect(readDocumentOp({ do: "labels", runs })).toBeNull()
  })

  it("refuses what is no change to the file as a whole", () => {
    expect(readDocumentOp(null)).toBeNull()
    expect(readDocumentOp("details")).toBeNull()
    expect(readDocumentOp({ do: "other" })).toBeNull()
  })
})

describe("the numbers a file gives its pages", () => {
  it("writes a number in each way", () => {
    expect(numbered("D", 12)).toBe("12")
    expect(numbered("r", 4)).toBe("iv")
    expect(numbered("r", 1994)).toBe("mcmxciv")
    expect(numbered("R", 9)).toBe("IX")
    expect(numbered("a", 1)).toBe("a")
    expect(numbered("a", 26)).toBe("z")
    // After z come aa, bb and so on, as the PDF format has it.
    expect(numbered("a", 27)).toBe("aa")
    expect(numbered("A", 28)).toBe("BB")
    expect(numbered("", 3)).toBe("")
  })

  it("names every page by its run", () => {
    expect(
      labelsFor(
        [
          { start: 0, style: "r", prefix: "", first: 1 },
          { start: 2, style: "D", prefix: "", first: 1 },
          { start: 4, style: "D", prefix: "A-", first: 10 },
        ],
        6
      )
    ).toEqual(["i", "ii", "1", "2", "A-10", "A-11"])
    // Pages ahead of the first run are simply counted; without runs, all are.
    expect(
      labelsFor([{ start: 2, style: "", prefix: "Cover", first: 1 }], 3)
    ).toEqual(["1", "2", "Cover"])
    expect(labelsFor([], 2)).toEqual(["1", "2"])
  })
})

describe("sameDetails", () => {
  it("tells whether a file says the same of itself", () => {
    const details = { title: "T", author: "A", subject: "S", keywords: "K" }
    expect(sameDetails(details, { ...details })).toBe(true)
    for (const key of ["title", "author", "subject", "keywords"] as const)
      expect(sameDetails(details, { ...details, [key]: "other" })).toBe(false)
  })
})
