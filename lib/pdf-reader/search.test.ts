import { describe, expect, it } from "vitest"
import {
  addMatches,
  firstFrom,
  matchesOn,
  MAX_MATCHES,
  needleOf,
  searchStatus,
  stepMatch,
  type Match,
} from "./search"
import type { Quad } from "./text"

/** A level box at a height. */
const at = (top: number, left = 0) =>
  [
    left,
    top,
    left + 50,
    top,
    left,
    top + 10,
    left + 50,
    top + 10,
  ] as unknown as Quad

describe("needleOf", () => {
  it("trims what was typed and joins runs of space", () => {
    expect(needleOf("  quarterly   report ")).toBe("quarterly report")
  })

  it("is empty until there is enough to search for", () => {
    expect(needleOf("")).toBe("")
    expect(needleOf(" a ")).toBe("")
    expect(needleOf("ab")).toBe("ab")
  })
})

describe("addMatches", () => {
  it("keeps matches in reading order, whichever page arrives first", () => {
    let found: Match[] = []
    found = addMatches(found, 4, [[at(10)]])
    found = addMatches(found, 1, [[at(300)], [at(20)]])
    found = addMatches(found, 2, [[at(5)]])
    expect(found.map((match) => [match.page, match.quads[0][1]])).toEqual([
      [1, 20],
      [1, 300],
      [2, 5],
      [4, 10],
    ])
  })

  it("keeps a match that spans two lines as one", () => {
    const found = addMatches([], 0, [[at(10), at(22)]])
    expect(found).toHaveLength(1)
    expect(found[0].quads).toHaveLength(2)
  })

  it("orders by the top of a turned box, whichever corner that is", () => {
    const turned = [100, 250, 100, 50, 112, 250, 112, 5] as unknown as Quad
    const found = addMatches([], 0, [[at(40)], [turned]])
    expect(found[0].quads[0]).toBe(turned)
  })

  it("gives back the same list when a page has no matches", () => {
    const found = addMatches([], 0, [[at(1)]])
    expect(addMatches(found, 3, [])).toBe(found)
    expect(addMatches(found, 3, [[]])).toBe(found)
  })

  it("stops counting at the limit", () => {
    const many = Array.from({ length: MAX_MATCHES }, (_, index) => [at(index)])
    const found = addMatches(addMatches([], 0, many), 1, [[at(1)], [at(2)]])
    expect(found).toHaveLength(MAX_MATCHES)
    expect(found.at(-1)?.page).toBe(0)
  })
})

describe("stepping through matches", () => {
  const found = [0, 2, 2, 5].map((page, index) => ({
    page,
    quads: [at(index)],
  }))

  it("starts at the page being read, or the next one that has a match", () => {
    expect(firstFrom(found, 0)).toBe(0)
    expect(firstFrom(found, 1)).toBe(1)
    expect(firstFrom(found, 2)).toBe(1)
    expect(firstFrom(found, 3)).toBe(3)
  })

  it("starts from the top when nothing follows, and nowhere without matches", () => {
    expect(firstFrom(found, 9)).toBe(0)
    expect(firstFrom([], 0)).toBe(-1)
  })

  it("goes round at either end", () => {
    expect(stepMatch(0, 4, 1)).toBe(1)
    expect(stepMatch(3, 4, 1)).toBe(0)
    expect(stepMatch(0, 4, -1)).toBe(3)
    expect(stepMatch(-1, 4, 1)).toBe(1)
    expect(stepMatch(0, 0, 1)).toBe(-1)
  })

  it("lists a page's matches with their place in the whole", () => {
    expect(matchesOn(found, 2).map((match) => match.index)).toEqual([1, 2])
    expect(matchesOn(found, 1)).toEqual([])
  })
})

describe("searchStatus", () => {
  const base = {
    needle: "report",
    searching: false,
    count: 0,
    current: -1,
    noText: false,
  }

  it("says nothing before a search", () => {
    expect(searchStatus({ ...base, needle: "" })).toBe("")
  })

  it("counts matches, also while more pages are searched", () => {
    expect(searchStatus({ ...base, count: 17, current: 2 })).toBe("3 of 17")
    expect(
      searchStatus({ ...base, count: 1234, current: 0, searching: true })
    ).toBe("1 of 1,234")
  })

  it("says there are more than it counts", () => {
    expect(searchStatus({ ...base, count: MAX_MATCHES, current: 0 })).toBe(
      "1 of 2,000+"
    )
  })

  it("says it is searching, then that nothing was found", () => {
    expect(searchStatus({ ...base, searching: true })).toBe("Searching…")
    expect(searchStatus(base)).toBe("No matches")
  })

  it("says so when the file has no text at all", () => {
    expect(searchStatus({ ...base, noText: true })).toBe("No text to search")
  })
})
