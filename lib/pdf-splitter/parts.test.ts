import { describe, expect, it } from "vitest"
import {
  cutsEqual,
  cutsEvery,
  describePages,
  MAX_PARTS,
  oddEvenParts,
  partKeys,
  partsFromCuts,
  partsFromRanges,
  partsOfPages,
  planProblem,
  selectionPart,
  selectionText,
  selectSpan,
  tidyCuts,
  toggleCut,
  toggleSelected,
  type Part,
} from "./parts"

const pagesOf = (parts: Part[]) => parts.map((part) => part.pages)
/** Pages from 1, as people count them. */
const shown = (parts: Part[]) =>
  parts.map((part) => part.pages.map((page) => page + 1))

describe("cuts", () => {
  it("are kept in order, once each, and only where a cut can be", () => {
    expect(tidyCuts([5, 1, 1, 3], 10)).toEqual([1, 3, 5])
    // After the last page, before the first, and half-way through a page are not places.
    expect(tidyCuts([9, -1, 2.5, 12, 8], 10)).toEqual([8])
    expect(tidyCuts([0], 1)).toEqual([])
  })

  it("are put in and taken away with the same press", () => {
    expect(toggleCut([2], 5, 10)).toEqual([2, 5])
    expect(toggleCut([2, 5], 2, 10)).toEqual([5])
    expect(toggleCut([], 9, 10)).toEqual([])
  })

  it("divide a file into parts", () => {
    expect(shown(partsFromCuts(6, [1, 3]))).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
  })

  it("leave one part when there are none", () => {
    expect(shown(partsFromCuts(3, []))).toEqual([[1, 2, 3]])
    expect(partsFromCuts(0, [])).toEqual([])
  })

  it("ignore cuts that are not places in the file", () => {
    expect(shown(partsFromCuts(3, [2, 7, 0, 0]))).toEqual([[1], [2, 3]])
  })

  it("after every N pages leave a shorter last part", () => {
    expect(cutsEvery(7, 3)).toEqual([2, 5])
    expect(shown(partsFromCuts(7, cutsEvery(7, 3)))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7],
    ])
    expect(cutsEvery(6, 3)).toEqual([2])
  })

  it("after every page give every page its own part", () => {
    expect(partsFromCuts(4, cutsEvery(4, 1))).toHaveLength(4)
  })

  it("treat a number that is no count of pages as one", () => {
    expect(cutsEvery(4, 0)).toEqual([0, 1, 2])
    expect(cutsEvery(4, Number.NaN)).toEqual([0, 1, 2])
    expect(cutsEvery(4, 2.9)).toEqual([1])
    expect(cutsEvery(4, 50)).toEqual([])
  })

  it("into equal parts put the longer parts first", () => {
    expect(
      pagesOf(partsFromCuts(10, cutsEqual(10, 3))).map((p) => p.length)
    ).toEqual([4, 3, 3])
    expect(
      pagesOf(partsFromCuts(9, cutsEqual(9, 3))).map((p) => p.length)
    ).toEqual([3, 3, 3])
    expect(cutsEqual(10, 1)).toEqual([])
  })

  it("never make more parts than there are pages", () => {
    expect(partsFromCuts(3, cutsEqual(3, 8))).toHaveLength(3)
    expect(cutsEqual(0, 4)).toEqual([])
    expect(cutsEqual(5, 0)).toEqual([])
    expect(cutsEqual(5, Number.NaN)).toEqual([])
    expect(cutsEqual(5, 2.7)).toEqual([2])
  })
})

describe("partsFromRanges", () => {
  const parts = (text: string, count = 12) => {
    const read = partsFromRanges(text, count)
    return "parts" in read ? shown(read.parts) : read.problem
  }

  it("makes one part for each range", () => {
    expect(parts("1-3, 4-10, 11-")).toEqual([
      [1, 2, 3],
      [4, 5, 6, 7, 8, 9, 10],
      [11, 12],
    ])
  })

  it("takes lines and semicolons between parts as well as commas", () => {
    expect(parts("1\n2-3; 4")).toEqual([[1], [2, 3], [4]])
  })

  it("joins ranges into one part with a plus sign", () => {
    expect(parts("1-2 + 7, 3+5+6")).toEqual([
      [1, 2, 7],
      [3, 5, 6],
    ])
  })

  it("lets ranges overlap, repeat and count down", () => {
    expect(parts("1-3, 2-4, 2-4, 3-1")).toEqual([
      [1, 2, 3],
      [2, 3, 4],
      [2, 3, 4],
      [3, 2, 1],
    ])
  })

  it("understands odd, even and open ends", () => {
    expect(parts("odd, even, -2", 5)).toEqual([
      [1, 3, 5],
      [2, 4],
      [1, 2],
    ])
  })

  it("ignores empty places between commas", () => {
    expect(parts("1,, 2 ,")).toEqual([[1], [2]])
  })

  it("asks for something when nothing is typed", () => {
    expect(parts("")).toMatch(/^Type the pages for each part/)
    expect(parts(" , ;\n")).toMatch(/^Type the pages for each part/)
  })

  it("explains a range that is not one, or is outside the file", () => {
    expect(parts("1-3, two")).toMatch(/"two" is not a page or a range/)
    expect(parts("1-3, 40")).toMatch(/has 12 pages/)
  })

  it("explains a plus sign with nothing to join", () => {
    for (const text of ["+3", "3+", "1 + + 2"])
      expect(parts(text)).toMatch(/plus sign with nothing to join/)
  })

  it("refuses more parts than anyone means", () => {
    const text = Array.from({ length: MAX_PARTS + 1 }, () => "1").join(",")
    expect(parts(text)).toMatch(/more than 5,000 parts/)
  })
})

describe("oddEvenParts", () => {
  it("gives the odd pages and the even pages", () => {
    const parts = oddEvenParts(5)
    expect(shown(parts)).toEqual([
      [1, 3, 5],
      [2, 4],
    ])
    expect(parts.map((part) => part.label)).toEqual(["odd", "even"])
  })

  it("gives one part for one page and none for no pages", () => {
    expect(shown(oddEvenParts(1))).toEqual([[1]])
    expect(oddEvenParts(0)).toEqual([])
  })
})

describe("selecting pages", () => {
  it("takes the selected pages out in the order of the file", () => {
    expect(shown(selectionPart(new Set([4, 0, 2]), 6, "extract"))).toEqual([
      [1, 3, 5],
    ])
  })

  it("keeps everything else when pages are removed", () => {
    expect(shown(selectionPart(new Set([4, 0, 2]), 6, "remove"))).toEqual([
      [2, 4, 6],
    ])
  })

  it("makes nothing from nothing", () => {
    expect(selectionPart(new Set(), 6, "extract")).toEqual([])
    expect(selectionPart(new Set([0, 1]), 2, "remove")).toEqual([])
    // Pages that are not in the file do not count.
    expect(selectionPart(new Set([9]), 6, "extract")).toEqual([])
  })

  it("selects and lets go with the same press", () => {
    const one = toggleSelected(new Set([1]), 3)
    expect([...one]).toEqual([1, 3])
    expect([...toggleSelected(one, 1)]).toEqual([3])
  })

  it("selects everything between two pages, either way round", () => {
    expect([...selectSpan(new Set([9]), 2, 4)].sort()).toEqual([2, 3, 4, 9])
    expect([...selectSpan(new Set(), 4, 2)]).toEqual([2, 3, 4])
  })

  it("writes a selection as it would be typed", () => {
    expect(selectionText(new Set([6, 0, 2, 1]))).toBe("1-3, 7")
    expect(selectionText(new Set())).toBe("")
  })
})

describe("describePages", () => {
  it("says what a part holds", () => {
    expect(describePages({ pages: [2] })).toBe("page 3")
    expect(describePages({ pages: [4, 5, 6, 7, 8] })).toBe("pages 5-9")
    expect(describePages({ pages: [0, 2, 4, 5, 6] })).toBe("pages 1, 3, 5-7")
  })
})

describe("partsOfPages", () => {
  it("says which parts each page is in", () => {
    expect(partsOfPages([{ pages: [0, 1] }, { pages: [1, 2, 2] }], 4)).toEqual([
      [0],
      [0, 1],
      [1],
      [],
    ])
  })

  it("ignores pages that are not in the file", () => {
    expect(partsOfPages([{ pages: [0, 7] }], 2)).toEqual([[0], []])
  })
})

describe("partKeys", () => {
  const parts = [{ pages: [0, 1] }, { pages: [2] }]

  it("knows a part made by cuts by its first page", () => {
    expect(partKeys("cuts", parts)).toEqual(["p0", "p2"])
  })

  it("knows any other part by its place", () => {
    expect(partKeys("ranges", [...parts, { pages: [0, 1] }])).toEqual([
      "n0",
      "n1",
      "n2",
    ])
  })
})

describe("planProblem", () => {
  it("asks for a cut before a file can be cut", () => {
    expect(planProblem("cuts", partsFromCuts(5, []), 5)).toMatch(
      /^Cut the file somewhere first/
    )
    expect(planProblem("cuts", partsFromCuts(1, []), 1)).toBe(
      "A file with one page cannot be cut."
    )
    expect(planProblem("cuts", partsFromCuts(5, [1]), 5)).toBeNull()
  })

  it("asks for pages to take out", () => {
    expect(planProblem("extract", [], 5)).toBe("Select the pages to take out.")
    expect(planProblem("extract", [{ pages: [1] }], 5)).toBeNull()
  })

  it("asks for pages to remove, but not all of them", () => {
    expect(
      planProblem("remove", selectionPart(new Set(), 3, "remove"), 3)
    ).toBe("Select the pages to remove.")
    expect(
      planProblem("remove", selectionPart(new Set([0, 1, 2]), 3, "remove"), 3)
    ).toMatch(/removes every page/)
    expect(
      planProblem("remove", selectionPart(new Set([1]), 3, "remove"), 3)
    ).toBeNull()
  })

  it("says a one-page file has no even pages", () => {
    expect(planProblem("oddeven", oddEvenParts(1), 1)).toMatch(/no even pages/)
    expect(planProblem("oddeven", oddEvenParts(2), 2)).toBeNull()
  })

  it("has nothing to say about ranges that were read", () => {
    expect(planProblem("ranges", [{ pages: [0] }], 5)).toBeNull()
  })
})
