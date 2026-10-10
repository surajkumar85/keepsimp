import { describe, expect, it } from "vitest"
import { formatRanges, MAX_RANGE_PAGES, parseRanges } from "./ranges"

const pages = (text: string, count = 10) => {
  const result = parseRanges(text, count)
  return "pages" in result ? result.pages : result.problem
}

describe("parseRanges", () => {
  it("takes every page for empty text or 'all'", () => {
    expect(pages("", 3)).toEqual([0, 1, 2])
    expect(pages("   ", 3)).toEqual([0, 1, 2])
    expect(pages("All", 2)).toEqual([0, 1])
  })

  it("reads single pages and ranges, in the order written", () => {
    expect(pages("3")).toEqual([2])
    expect(pages("1-3, 7")).toEqual([0, 1, 2, 6])
    expect(pages("7,1-2")).toEqual([6, 0, 1])
    expect(pages("2 - 4; 9")).toEqual([1, 2, 3, 8])
    expect(pages("5-5")).toEqual([4])
  })

  it("reads open ends, and counts down when the range is backwards", () => {
    expect(pages("8-")).toEqual([7, 8, 9])
    expect(pages("-3")).toEqual([0, 1, 2])
    expect(pages("3-1")).toEqual([2, 1, 0])
    expect(pages("10-8")).toEqual([9, 8, 7])
  })

  it("lets a page repeat", () => {
    expect(pages("1, 1, 2-3, 3")).toEqual([0, 0, 1, 2, 2])
  })

  it("reads odd and even pages", () => {
    expect(pages("odd", 5)).toEqual([0, 2, 4])
    expect(pages("EVEN", 5)).toEqual([1, 3])
    expect(pages("even, 1", 4)).toEqual([1, 3, 0])
  })

  it("accepts the dashes that get pasted in place of a hyphen", () => {
    expect(pages("1–3")).toEqual([0, 1, 2])
    expect(pages("1—2")).toEqual([0, 1])
    expect(pages("2−3")).toEqual([1, 2])
  })

  it("skips spare commas", () => {
    expect(pages("1,,2,")).toEqual([0, 1])
  })

  it("says what is wrong with text it cannot read", () => {
    for (const text of ["a", "1-2-3", "1..3", "12 3", "-", "1.5", "page 2"])
      expect(pages(text), text).toMatch(/is not a page or a range/)
    expect(pages("x")).toBe(
      '"x" is not a page or a range. Write pages like 1-3, 7, 10-.'
    )
  })

  it("says how many pages there are when a number is outside them", () => {
    expect(pages("0")).toMatch(/from 1 to 10/)
    expect(pages("11")).toMatch(/from 1 to 10/)
    expect(pages("9-12")).toMatch(/from 1 to 10/)
    expect(pages("0-2")).toMatch(/from 1 to 10/)
    expect(pages("3-0")).toMatch(/from 1 to 10/)
    expect(pages("2", 1)).toBe("This file has 1 page.")
    expect(pages("1500", 1200)).toBe(
      "This file has 1,200 pages, so use numbers from 1 to 1,200."
    )
  })

  it("says so when nothing is left", () => {
    expect(pages("even", 1)).toBe("That leaves no pages from this file.")
    expect(pages(",", 3)).toBe("That leaves no pages from this file.")
  })

  it("refuses an absurd number of repeats", () => {
    const text = Array.from({ length: 5 }, () => "1-5000").join(",")
    expect(pages(text, 5000)).toBe(
      "That repeats pages more than 20,000 times. Use fewer."
    )
    expect(pages("1-", MAX_RANGE_PAGES)).toHaveLength(MAX_RANGE_PAGES)
  })
})

describe("formatRanges", () => {
  it("writes runs as ranges and the rest as single pages", () => {
    expect(formatRanges([])).toBe("")
    expect(formatRanges([4])).toBe("5")
    expect(formatRanges([0, 1, 2, 6])).toBe("1-3, 7")
    expect(formatRanges([0, 2, 4])).toBe("1, 3, 5")
    expect(formatRanges([2, 1, 0, 5, 6])).toBe("3-1, 6-7")
    expect(formatRanges([0, 0, 1])).toBe("1, 1-2")
  })

  it("gives back what parseRanges read", () => {
    for (const text of ["1-3, 7", "5-1", "2, 4, 6-10", "1, 1"])
      expect(formatRanges(pages(text) as number[])).toBe(text)
  })
})
