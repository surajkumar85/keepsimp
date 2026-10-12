import { describe, expect, it } from "vitest"
import {
  BLACK,
  FEWEST_BOXES,
  isComb,
  MOST_BOXES,
  readObject,
  type TextObject,
} from "./objects"
import { lookOf, partsFor, stylesWith, withLook } from "./styles"
import { combLine, combStarts } from "./text-layout"
import { defaultStyles, makeText } from "./tools"

const text: TextObject = {
  id: "t1",
  kind: "text",
  rotation: 0,
  opacity: 1,
  box: { x: 20, y: 40, width: 120, height: 20 },
  text: "AB12",
  lines: ["AB12"],
  font: "sans",
  bold: false,
  italic: false,
  size: 12,
  colour: BLACK,
  align: "left",
}
const callout: TextObject = { ...text, id: "c1", tip: { x: 5, y: 5 } }

describe("a row of boxes", () => {
  it("is a whole number of boxes, from two to sixty", () => {
    expect(isComb(FEWEST_BOXES)).toBe(true)
    expect(isComb(MOST_BOXES)).toBe(true)
    expect(isComb(6)).toBe(true)
    for (const value of [0, 1, 61, 6.5, -6, "6", null, undefined, NaN])
      expect(isComb(value)).toBe(false)
  })

  it("holds one line, with no more letters than boxes", () => {
    expect(combLine("AB12", 6)).toBe("AB12")
    expect(combLine("AB123456", 6)).toBe("AB1234")
    expect(combLine("AB\r\n12\n34", 6)).toBe("AB1234")
    // Counted as letters, not as the pieces a letter may be stored in.
    expect(combLine("😀😀😀", 2)).toBe("😀😀")
    expect(combLine("", 4)).toBe("")
  })

  it("puts each letter in the middle of its box", () => {
    // Six boxes of twenty across 120: a letter ten wide starts five into its box.
    expect(combStarts([10, 10, 10], 120, 6)).toEqual([5, 25, 45])
    // A wide letter and a narrow one are each centred in their own.
    expect(combStarts([20, 4], 120, 6)).toEqual([0, 28])
    // Wider than its box, a letter hangs over both sides alike.
    expect(combStarts([30], 120, 6)).toEqual([-5])
    expect(combStarts([], 120, 6)).toEqual([])
  })
})

describe("a text box in a row of boxes", () => {
  it("is read back with its boxes, and without them when they make no sense", () => {
    expect(readObject({ ...text, comb: 6 })).toMatchObject({ comb: 6 })
    expect(readObject(text)).not.toHaveProperty("comb")
    expect(readObject({ ...text, comb: 1 })).not.toHaveProperty("comb")
    expect(readObject({ ...text, comb: "6" })).not.toHaveProperty("comb")
    // A call-out is not written in boxes.
    const read = readObject({ ...callout, comb: 6 })
    expect(read).toHaveProperty("tip")
    expect(read).not.toHaveProperty("comb")
  })

  it("is given boxes, other boxes and none through its look", () => {
    const six = withLook(text, { comb: 6 }) as TextObject
    expect(six.comb).toBe(6)
    expect(withLook(six, { comb: 6 })).toBe(six)
    expect((withLook(six, { comb: 8 }) as TextObject).comb).toBe(8)
    const none = withLook(six, { comb: 0 })
    expect(none).not.toHaveProperty("comb")
    expect(none).toEqual(text)
    // What is not a number of boxes is none, and no change where there were none.
    expect(withLook(text, { comb: 1 })).toBe(text)
    expect(withLook(text, { comb: 500 })).toBe(text)
    expect(withLook(six, { comb: 2.5 })).not.toHaveProperty("comb")
    // A call-out takes none.
    expect(withLook(callout, { comb: 6 })).toBe(callout)
  })

  it("offers the boxes for text, and not for a call-out", () => {
    expect(partsFor([], "text")).toContain("comb")
    expect(partsFor([], "callout")).not.toContain("comb")
    expect(partsFor([text], "select")).toContain("comb")
    expect(partsFor([callout], "select")).not.toContain("comb")
    expect(partsFor([text, callout], "select")).not.toContain("comb")
    expect(partsFor([text, callout], "select")).toContain("font")
  })

  it("remembers the boxes for the next text box, and shows them in the bar", () => {
    const six = stylesWith(defaultStyles, "text", { comb: 6 })
    expect(six.comb).toBe(6)
    expect(stylesWith(six, "text", { comb: 0 }).comb).toBe(0)
    expect(stylesWith(six, "text", { comb: 1 }).comb).toBe(0)
    // Other tools have no boxes to remember.
    expect(stylesWith(defaultStyles, "callout", { comb: 6 })).toBe(
      defaultStyles
    )
    expect(stylesWith(defaultStyles, "box", { comb: 6 })).toBe(defaultStyles)
    expect(lookOf([], "text", six).comb).toBe(6)
    expect(lookOf([], "callout", six).comb).toBe(0)
    expect(lookOf([], "text", defaultStyles).comb).toBe(0)
    expect(lookOf([{ ...text, comb: 9 }], "select", six).comb).toBe(9)
    expect(lookOf([text], "select", six).comb).toBe(0)
  })

  it("is made with the boxes that were chosen", () => {
    const page = { width: 400, height: 600 }
    const at = { x: 50, y: 50 }
    expect(
      makeText(at, { ...defaultStyles, comb: 6 }, "n1", page)
    ).toMatchObject({ comb: 6, lines: [""] })
    expect(makeText(at, defaultStyles, "n2", page)).not.toHaveProperty("comb")
  })
})
