import { describe, expect, it } from "vitest"
import {
  coveredBy,
  findHolder,
  RANGE_HOLDER,
  rangesOf,
  rangeText,
  withRanges,
  withSignature,
} from "./sign-bytes"

const bytes = (text: string) =>
  Uint8Array.from(text, (letter) => letter.charCodeAt(0))
const text = (data: Uint8Array) => String.fromCharCode(...data)

/** A file as the engine writes it: something before, the signature's object, something after. */
const FILE = `%PDF-1.7 body 9 0 obj\n<</Type/Sig/ByteRange${RANGE_HOLDER}/Contents<00000000>/M(D:2026)>>\nendobj\ntrailer`

describe("findHolder", () => {
  it("finds the placeholders of the last signature written", () => {
    const file = bytes(`old ${RANGE_HOLDER}/Contents<00> endobj ${FILE}`)
    const holder = findHolder(file)!
    expect(
      text(file.subarray(holder.range, holder.range + RANGE_HOLDER.length))
    ).toBe(RANGE_HOLDER)
    expect(text(file.subarray(holder.from, holder.to))).toBe("<00000000>")
    expect(holder.range).toBeGreaterThan(30)
  })

  it("finds nothing where there is no room to sign into", () => {
    expect(findHolder(bytes("%PDF no signature"))).toBeNull()
    // No `/Contents` after it, or only in another object.
    expect(findHolder(bytes(`${RANGE_HOLDER}>> endobj`))).toBeNull()
    expect(
      findHolder(bytes(`${RANGE_HOLDER} endobj 2 0 obj /Contents<00>`))
    ).toBeNull()
    expect(findHolder(bytes(`${RANGE_HOLDER}/Contents`))).toBeNull()
    // A string that is not the room: something before it, or not zeros.
    expect(findHolder(bytes(`${RANGE_HOLDER}/Contents 3 0 R<00>`))).toBeNull()
    expect(findHolder(bytes(`${RANGE_HOLDER}/Contents<abcd>`))).toBeNull()
    expect(findHolder(bytes(`${RANGE_HOLDER}/Contents<>`))).toBeNull()
    // With no end of its object, it is read as far as the file goes.
    expect(findHolder(bytes(`${RANGE_HOLDER}/Contents<0000>`))).toEqual({
      range: 0,
      from: RANGE_HOLDER.length + 9,
      to: RANGE_HOLDER.length + 15,
    })
  })
})

describe("filling in", () => {
  it("writes the ranges and the signature in place, so nothing moves", () => {
    const file = bytes(FILE)
    const holder = findHolder(file)!
    const ranged = withRanges(file, holder)
    expect(ranged.length).toBe(file.length)
    const ranges = rangesOf(holder, file.length)
    expect(text(ranged)).toContain(
      `/ByteRange[0 ${holder.from} ${holder.to} ${file.length - holder.to}`
    )
    // What is covered is everything but the room.
    const covered = coveredBy(ranged, ranges)
    expect(text(covered)).toBe(
      text(ranged.subarray(0, holder.from)) + text(ranged.subarray(holder.to))
    )
    const signed = withSignature(ranged, holder, Uint8Array.of(0xab, 0x01))
    expect(text(signed.subarray(holder.from, holder.to))).toBe("<ab010000>")
    expect(signed.length).toBe(file.length)
    expect(() => withSignature(ranged, holder, new Uint8Array(5))).toThrow(
      "larger than the room"
    )
  })

  it("pads the ranges to the placeholder's length, and refuses a file too large for them", () => {
    expect(rangeText([0, 1, 2, 3])).toBe(
      `[0 1 2 3${" ".repeat(RANGE_HOLDER.length - 9)}]`
    )
    expect(
      rangeText([0, 9_999_999_999, 9_999_999_999, 9_999_999_999])
    ).toHaveLength(RANGE_HOLDER.length)
    expect(() => rangeText([0, 1e10, 1e10, 1e10])).toThrow("too large")
  })
})
