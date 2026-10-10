import { describe, expect, it } from "vitest"
import {
  countBookmarks,
  mergeBookmarks,
  retarget,
  type Bookmark,
  type OutlineSource,
} from "./outline"

const mark = (
  title: string,
  page: number | null,
  children: Bookmark[] = [],
  uri: string | undefined = page === null
    ? undefined
    : `#page=${page + 1}&view=Fit`
): Bookmark => ({ title, uri, page, open: true, children })

const placed = (...pairs: [number, number][]) => new Map(pairs)

/** Two files: the first keeps pages 1 and 3 of 3, the second both of 2. */
const sources: OutlineSource[] = [
  {
    name: "Report",
    bookmarks: [
      mark("Intro", 0, [mark("Scope", 1), mark("Method", 2)]),
      mark("Lost chapter", 1),
    ],
    placed: placed([0, 0], [2, 1]),
    first: 0,
  },
  {
    name: "Appendix",
    bookmarks: [mark("Tables", 1)],
    placed: placed([0, 2], [1, 3]),
    first: 2,
  },
]

const titles = (list: { title: string; children: unknown[] }[]): unknown[] =>
  list.map((item) =>
    item.children.length
      ? [item.title, titles(item.children as typeof list)]
      : item.title
  )

describe("retarget", () => {
  it("keeps the view and changes the page", () => {
    expect(retarget("#page=3&view=Fit", 7)).toBe("#page=8&view=Fit")
    expect(retarget("#page=12&zoom=100,0,792", 0)).toBe(
      "#page=1&zoom=100,0,792"
    )
    expect(retarget("#page=3", 4)).toBe("#page=5")
  })

  it("leads to the page itself when there is no view to keep", () => {
    expect(retarget(undefined, 2)).toBe("#page=3")
    expect(retarget("#nameddest=intro", 2)).toBe("#page=3")
  })
})

describe("mergeBookmarks", () => {
  it("nests each file's bookmarks under an entry for the file", () => {
    const result = mergeBookmarks(sources, "nested")
    expect(titles(result)).toEqual([
      ["Report", [["Intro", ["Method"]]]],
      ["Appendix", ["Tables"]],
    ])
    expect(result.map((item) => [item.uri, item.open])).toEqual([
      ["#page=1", false],
      ["#page=3", false],
    ])
    // Page 3 of the first file is page 2 of the result; its view is kept.
    expect(result[0].children[0].children[0].uri).toBe("#page=2&view=Fit")
    expect(result[1].children[0].uri).toBe("#page=4&view=Fit")
    expect(result[0].children[0].open).toBe(true)
  })

  it("keeps them all in one list", () => {
    expect(titles(mergeBookmarks(sources, "keep"))).toEqual([
      ["Intro", ["Method"]],
      "Tables",
    ])
  })

  it("makes one entry per file, or none at all", () => {
    expect(mergeBookmarks(sources, "files")).toEqual([
      { title: "Report", uri: "#page=1", open: false, children: [] },
      { title: "Appendix", uri: "#page=3", open: false, children: [] },
    ])
    expect(mergeBookmarks(sources, "none")).toEqual([])
  })

  it("does not wrap a single file's bookmarks", () => {
    expect(titles(mergeBookmarks([sources[1]], "nested"))).toEqual(["Tables"])
    expect(titles(mergeBookmarks([sources[1]], "files"))).toEqual(["Appendix"])
  })

  it("gives a file with no bookmarks an entry all the same", () => {
    const result = mergeBookmarks(
      [
        sources[1],
        { name: "Scan", bookmarks: [], placed: placed([0, 4]), first: 4 },
      ],
      "nested"
    )
    expect(titles(result)).toEqual([["Appendix", ["Tables"]], "Scan"])
    expect(result[1].uri).toBe("#page=5")
  })

  it("points a bookmark whose page is gone at the first kept one beneath it", () => {
    const [result] = mergeBookmarks(
      [
        {
          name: "Book",
          bookmarks: [
            mark("Part one", 0, [
              mark("Heading only", null, [mark("Deep", 3)]),
              mark("Gone too", 1),
            ]),
          ],
          placed: placed([3, 0]),
          first: 0,
        },
      ],
      "keep"
    )
    expect(titles([result])).toEqual([
      ["Part one", [["Heading only", ["Deep"]]]],
    ])
    expect(result.uri).toBe("#page=1&view=Fit")
    // A heading that led nowhere still leads nowhere.
    expect(result.children[0].uri).toBeUndefined()
  })

  it("keeps bookmarks that lead outside the file, and names untitled ones", () => {
    const result = mergeBookmarks(
      [
        {
          name: "Links",
          bookmarks: [
            mark("Website", null, [], "https://example.com/"),
            mark("  ", 0),
            mark("Empty heading", null),
          ],
          placed: placed([0, 0]),
          first: 0,
        },
      ],
      "keep"
    )
    expect(result).toEqual([
      {
        title: "Website",
        uri: "https://example.com/",
        open: true,
        children: [],
      },
      { title: "Untitled", uri: "#page=1&view=Fit", open: true, children: [] },
      { title: "Empty heading", uri: undefined, open: true, children: [] },
    ])
  })

  it("keeps a heading under a lost page, though neither leads anywhere", () => {
    const result = mergeBookmarks(
      [
        {
          name: "Book",
          bookmarks: [mark("Lost", 5, [mark("Heading", null)])],
          placed: placed([0, 0]),
          first: 0,
        },
      ],
      "keep"
    )
    // A heading has no page to lose, so it stays, and its parent with it.
    expect(titles(result)).toEqual([["Lost", ["Heading"]]])
    expect(result[0].uri).toBeUndefined()
  })
})

describe("countBookmarks", () => {
  it("counts every depth", () => {
    expect(countBookmarks([])).toBe(0)
    expect(countBookmarks(sources[0].bookmarks)).toBe(4)
    expect(countBookmarks(mergeBookmarks(sources, "nested"))).toBe(5)
  })
})
