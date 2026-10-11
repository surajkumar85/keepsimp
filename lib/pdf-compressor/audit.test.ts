import { describe, expect, it } from "vitest"
import { auditLabels, breakdown, heaviest, percentOf } from "./audit"

describe("breakdown", () => {
  it("adds up by kind, largest first, with the rest last", () => {
    expect(
      breakdown(1000, [
        { kind: "fonts", bytes: 100 },
        { kind: "pictures", bytes: 300 },
        { kind: "pictures", bytes: 400 },
        { kind: "thumbnails", bytes: 0 },
      ])
    ).toEqual({
      total: 1000,
      parts: [
        { kind: "pictures", bytes: 700, share: 0.7 },
        { kind: "fonts", bytes: 100, share: 0.1 },
        { kind: "rest", bytes: 200, share: 0.2 },
      ],
    })
  })

  it("has no rest when the streams account for everything", () => {
    expect(breakdown(50, [{ kind: "content", bytes: 50 }]).parts).toEqual([
      { kind: "content", bytes: 50, share: 1 },
    ])
  })

  it("still adds up when a file claims more than it holds", () => {
    const { total, parts } = breakdown(100, [
      { kind: "pictures", bytes: 150 },
      { kind: "private", bytes: 50 },
    ])
    expect(total).toBe(200)
    expect(parts.map((part) => part.share)).toEqual([0.75, 0.25])
  })

  it("names every kind", () => {
    expect(Object.values(auditLabels).every((label) => label.length > 3)).toBe(
      true
    )
  })
})

describe("heaviest", () => {
  const row = (object: number, bytes: number) => ({
    object,
    bytes,
    width: 10,
    height: 10,
    page: null,
  })

  it("lists the heaviest pictures first, in a steady order", () => {
    expect(
      heaviest([row(4, 10), row(2, 90), row(9, 50), row(1, 50)], 3).map(
        (picture) => picture.object
      )
    ).toEqual([2, 1, 9])
  })

  it("lists five unless asked otherwise", () => {
    expect(
      heaviest(Array.from({ length: 8 }, (_, index) => row(index, index)))
    ).toHaveLength(5)
  })
})

describe("percentOf", () => {
  it("rounds to whole percent, and never shows something as nothing", () => {
    expect(percentOf(0.426)).toBe(43)
    expect(percentOf(0.001)).toBe(1)
    expect(percentOf(0)).toBe(0)
  })
})
