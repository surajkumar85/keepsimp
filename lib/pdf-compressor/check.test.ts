import { describe, expect, it } from "vitest"
import { checkResult, pagesToCheck } from "./check"

describe("pagesToCheck", () => {
  it("checks every changed page when there are few, and a few of the others", () => {
    expect(pagesToCheck([7, 2, 2, 5], 10, 24)).toEqual([0, 2, 4, 5, 7, 9])
    // Only as many of the others as there is room for.
    expect(pagesToCheck([7, 2, 5], 10, 4)).toEqual([0, 2, 5, 7])
    expect(pagesToCheck([7, 2, 5], 10, 3)).toEqual([2, 5, 7])
    expect(pagesToCheck([7, 2, 5], 10, 5)).toEqual([0, 2, 5, 7, 9])
    // A file whose every page changed has no others.
    expect(pagesToCheck([0, 1], 2, 24)).toEqual([0, 1])
  })

  it("leaves out pages the file does not have", () => {
    expect(pagesToCheck([-1, 3, 10], 4, 24)).toEqual([0, 1, 2, 3])
    expect(pagesToCheck([-1, 3, 10], 4, 1)).toEqual([3])
  })

  it("spreads its checks when there are many, ends included", () => {
    const changed = Array.from({ length: 100 }, (_, page) => page)
    expect(pagesToCheck(changed, 100, 5)).toEqual([0, 25, 50, 74, 99])
    expect(pagesToCheck(changed, 100, 1)).toEqual([0])
    expect(pagesToCheck(changed, 100, 0)).toEqual([0])
  })

  it("spot-checks a file whose pictures did not change", () => {
    expect(pagesToCheck([], 11, 24)).toEqual([0, 5, 10])
    expect(pagesToCheck([], 2, 24)).toEqual([0, 1])
    expect(pagesToCheck([], 40, 0)).toEqual([0])
  })
})

describe("checkResult", () => {
  it("lists the pages under the mark, least alike first", () => {
    expect(
      checkResult(
        [
          { page: 4, score: 0.99 },
          { page: 9, score: 0.9 },
          { page: 1, score: 0.9 },
          { page: 2, score: 0.5 },
        ],
        6,
        0.97
      )
    ).toEqual({
      checked: 4,
      changed: 6,
      low: [
        { page: 2, score: 0.5 },
        { page: 1, score: 0.9 },
        { page: 9, score: 0.9 },
      ],
    })
  })

  it("can hold each page to a mark of its own", () => {
    const scores = [
      { page: 0, score: 0.9 },
      { page: 1, score: 0.9 },
    ]
    expect(
      checkResult(scores, 2, (page) => (page === 1 ? 0.95 : 0.5)).low
    ).toEqual([{ page: 1, score: 0.9 }])
  })

  it("passes a file whose pages all reach the mark", () => {
    expect(checkResult([{ page: 0, score: 1 }], 1, 0.97).low).toEqual([])
  })
})
