import { describe, expect, it } from "vitest"
import {
  Duplicates,
  HASHED_END,
  hashBytes,
  isDescription,
  sameBytes,
} from "./duplicates"

describe("hashBytes", () => {
  it("gives equal bytes the same number and others another", () => {
    const a = new Uint8Array([1, 2, 3, 4])
    expect(hashBytes(a)).toBe(hashBytes(new Uint8Array([1, 2, 3, 4])))
    expect(hashBytes(a)).not.toBe(hashBytes(new Uint8Array([1, 2, 3, 5])))
    expect(hashBytes(a)).not.toBe(hashBytes(new Uint8Array([4, 3, 2, 1])))
  })

  it("is a whole number that fits in 32 bits, for nothing at all too", () => {
    expect(hashBytes(new Uint8Array(0))).toBe(0x811c9dc5)
    const hash = hashBytes(new Uint8Array(1000).fill(255))
    expect(Number.isInteger(hash)).toBe(true)
    expect(hash).toBeGreaterThanOrEqual(0)
    expect(hash).toBeLessThan(2 ** 32)
  })

  it("reads both ends of a long run and skips the middle", () => {
    const long = new Uint8Array(HASHED_END * 2 + 10)
    const first = hashBytes(long)
    const middle = long.slice()
    middle[HASHED_END + 5] = 1
    expect(hashBytes(middle)).toBe(first)
    const start = long.slice()
    start[0] = 1
    expect(hashBytes(start)).not.toBe(first)
    const end = long.slice()
    end[end.length - 1] = 1
    expect(hashBytes(end)).not.toBe(first)
    // A run just short enough is read whole.
    const whole = new Uint8Array(HASHED_END * 2)
    const changed = whole.slice()
    changed[HASHED_END] = 1
    expect(hashBytes(changed)).not.toBe(hashBytes(whole))
  })
})

describe("sameBytes", () => {
  it("is true only for the same bytes at the same length", () => {
    const a = new Uint8Array([1, 2, 3])
    expect(sameBytes(a, new Uint8Array([1, 2, 3]))).toBe(true)
    expect(sameBytes(a, new Uint8Array([1, 2, 4]))).toBe(false)
    expect(sameBytes(a, new Uint8Array([1, 2]))).toBe(false)
    expect(sameBytes(new Uint8Array(0), new Uint8Array(0))).toBe(true)
  })
})

describe("Duplicates", () => {
  it("remembers the first of each key and names it for copies", () => {
    const seen = new Duplicates()
    expect(seen.find("a", 1, () => true)).toBeNull()
    expect(seen.find("b", 2, () => true)).toBeNull()
    expect(seen.find("a", 3, () => true)).toBe(1)
    expect(seen.find("a", 4, () => true)).toBe(1)
    expect(seen.find("b", 5, () => true)).toBe(2)
  })

  it("keeps things apart that share a key and are not the same", () => {
    const seen = new Duplicates()
    const bytes = new Map([
      [1, "x"],
      [2, "y"],
      [3, "y"],
      [4, "x"],
      [5, "z"],
    ])
    const find = (number: number) =>
      seen.find(
        "key",
        number,
        (other) => bytes.get(other) === bytes.get(number)
      )
    expect(find(1)).toBeNull()
    expect(find(2)).toBeNull()
    expect(find(3)).toBe(2)
    expect(find(4)).toBe(1)
    expect(find(5)).toBeNull()
  })

  it("never asks about a key it has not seen", () => {
    const seen = new Duplicates()
    let asked = 0
    seen.find("a", 1, () => {
      asked++
      return true
    })
    expect(asked).toBe(0)
  })
})

describe("isDescription", () => {
  it("takes fonts and drawing states, and nothing with an identity", () => {
    for (const type of ["Font", "FontDescriptor", "ExtGState", "Encoding"])
      expect(isDescription(type)).toBe(true)
    for (const type of ["Page", "Annot", "OCG", "StructElem", "Catalog", ""])
      expect(isDescription(type)).toBe(false)
  })
})
