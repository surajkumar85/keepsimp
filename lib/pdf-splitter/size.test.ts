import { describe, expect, it } from "vitest"
import { limitBytes, partsBySize, type SizedPart } from "./size"

describe("limitBytes", () => {
  it("reads a size in megabytes or kilobytes", () => {
    expect(limitBytes("10", "MB")).toBe(10 * 1024 * 1024)
    expect(limitBytes(" 2.5 ", "MB")).toBe(2.5 * 1024 * 1024)
    expect(limitBytes("2,5", "MB")).toBe(2.5 * 1024 * 1024)
    expect(limitBytes("500", "KB")).toBe(512_000)
  })

  it("refuses what is not a size, or is too small to hold a page", () => {
    for (const text of ["", "ten", "-5", "1.2.3", "0"])
      expect(limitBytes(text, "MB")).toBeNull()
    expect(limitBytes("9", "KB")).toBeNull()
    expect(limitBytes("10", "KB")).toBe(10_240)
  })
})

describe("partsBySize", () => {
  /** A file whose pages have these sizes, and a part costs 100 bytes besides. */
  const file = (sizes: number[]) => {
    const calls: [number, number][] = []
    const measure = async (start: number, length: number) => {
      calls.push([start, length])
      return (
        100 +
        sizes.slice(start, start + length).reduce((sum, size) => sum + size, 0)
      )
    }
    return { measure, calls }
  }
  const lengths = (parts: SizedPart[]) => parts.map((part) => part.length)

  it("fills each part as far as the limit allows", async () => {
    const { measure } = file(Array.from({ length: 10 }, () => 1000))
    const parts = await partsBySize(10, 3500, measure)
    expect(lengths(parts)).toEqual([3, 3, 3, 1])
    expect(parts.map((part) => part.start)).toEqual([0, 3, 6, 9])
    expect(parts.map((part) => part.bytes)).toEqual([3100, 3100, 3100, 1100])
    expect(parts.every((part) => !part.over)).toBe(true)
  })

  it("keeps every part under the limit when pages differ greatly", async () => {
    const sizes = [50, 4000, 60, 70, 3000, 3000, 10, 10, 10, 5000, 20]
    const { measure } = file(sizes)
    const parts = await partsBySize(sizes.length, 6000, measure)
    expect(parts.reduce((sum, part) => sum + part.length, 0)).toBe(sizes.length)
    for (const part of parts) expect(part.bytes).toBeLessThanOrEqual(6000)
    // No part could have taken the next page as well.
    for (const part of parts.slice(0, -1))
      expect(await measure(part.start, part.length + 1)).toBeGreaterThan(6000)
  })

  it("gives a page that is over the limit a part to itself, and says so", async () => {
    const { measure } = file([100, 9000, 100, 100])
    const parts = await partsBySize(4, 1000, measure)
    expect(parts.map((part) => [part.start, part.length, part.over])).toEqual([
      [0, 1, false],
      [1, 1, true],
      [2, 2, false],
    ])
  })

  it("takes the whole file as one part when it fits", async () => {
    const { measure, calls } = file([10, 10, 10, 10, 10])
    expect(lengths(await partsBySize(5, 1_000_000, measure))).toEqual([5])
    // One page, then everything: no more measuring than that.
    expect(calls).toEqual([
      [0, 1],
      [0, 5],
    ])
  })

  it("does not measure a long file page by page", async () => {
    const { measure, calls } = file(Array.from({ length: 1000 }, () => 100))
    const parts = await partsBySize(1000, 10_000, measure)
    expect(lengths(parts).slice(0, 3)).toEqual([99, 99, 99])
    expect(calls.length).toBeLessThan(parts.length * 12)
  })

  it("hands each part over as soon as it is settled", async () => {
    const { measure } = file([1000, 1000, 1000])
    const seen: number[] = []
    await partsBySize(3, 2200, measure, (part) => {
      seen.push(part.start)
    })
    expect(seen).toEqual([0, 2])
  })

  it("copes with a size of nothing, and with no pages", async () => {
    expect(lengths(await partsBySize(3, 500, async () => 0))).toEqual([3])
    expect(await partsBySize(0, 500, async () => 1)).toEqual([])
  })
})
