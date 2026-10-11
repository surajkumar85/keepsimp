import { describe, expect, it } from "vitest"
import type { Quad, TextLine } from "@/lib/pdf-reader/text"
import {
  MAX_LABEL,
  partsFromStarts,
  partsFromTexts,
  textInArea,
  tidyArea,
  tidyText,
} from "./text-rule"

const line = (
  text: string,
  left: number,
  top: number,
  width = 100,
  height = 12
): TextLine => ({
  text,
  size: 12,
  quad: [
    left,
    top,
    left + width,
    top,
    left,
    top + height,
    left + width,
    top + height,
  ] as unknown as Quad,
})
const shown = (parts: { pages: number[]; label?: string }[]) =>
  parts.map((part) => [part.label, ...part.pages.map((page) => page + 1)])

describe("tidyArea", () => {
  it("puts the sides in order and keeps them on the page", () => {
    expect(tidyArea({ left: 0.8, top: 0.5, right: 0.2, bottom: 0.1 })).toEqual({
      left: 0.2,
      top: 0.1,
      right: 0.8,
      bottom: 0.5,
    })
    expect(tidyArea({ left: -1, top: -1, right: 2, bottom: 2 })).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
    })
  })

  it("is nothing when too small to hold a word", () => {
    expect(
      tidyArea({ left: 0.5, top: 0.1, right: 0.505, bottom: 0.9 })
    ).toBeNull()
    expect(
      tidyArea({ left: 0.1, top: 0.3, right: 0.9, bottom: 0.3 })
    ).toBeNull()
  })
})

describe("textInArea", () => {
  const size = { width: 600, height: 800 }
  const lines = [
    line("Invoice", 50, 40),
    line("No.   1042", 400, 40),
    line("Dear customer,", 50, 200),
    line("Total: 12.00", 400, 700),
  ]

  it("reads the lines whose middle is in the area", () => {
    expect(
      textInArea(lines, size, { left: 0.5, top: 0, right: 1, bottom: 0.2 })
    ).toBe("No. 1042")
    expect(
      textInArea(lines, size, { left: 0, top: 0, right: 1, bottom: 0.2 })
    ).toBe("Invoice No. 1042")
  })

  it("is empty where there is no text", () => {
    expect(
      textInArea(lines, size, { left: 0, top: 0.4, right: 1, bottom: 0.6 })
    ).toBe("")
    expect(textInArea([], size, { left: 0, top: 0, right: 1, bottom: 1 })).toBe(
      ""
    )
  })

  it("cuts very long text, and copes with a page of no size", () => {
    const long = [line("x".repeat(300), 50, 40)]
    expect(
      textInArea(long, size, { left: 0, top: 0, right: 1, bottom: 1 })
    ).toHaveLength(MAX_LABEL)
    expect(
      textInArea(
        lines,
        { width: 0, height: 0 },
        {
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
        }
      )
    ).toBe("")
  })

  it("tidies space", () => {
    expect(tidyText("  a \n\t b  ")).toBe("a b")
  })
})

describe("partsFromTexts", () => {
  it("starts a part whenever the text changes", () => {
    expect(shown(partsFromTexts(["A", "A", "B", "B", "B", "C"]))).toEqual([
      ["A", 1, 2],
      ["B", 3, 4, 5],
      ["C", 6],
    ])
  })

  it("keeps a page with no text there with the part before it", () => {
    expect(shown(partsFromTexts(["A", "", "A", "", "B", ""]))).toEqual([
      ["A", 1, 2, 3, 4],
      ["B", 5, 6],
    ])
  })

  it("gives pages before any text the first text that is found", () => {
    expect(shown(partsFromTexts(["", " ", "A", "B"]))).toEqual([
      ["A", 1, 2, 3],
      ["B", 4],
    ])
  })

  it("compares text with its space tidied", () => {
    expect(shown(partsFromTexts(["No. 1", " No.  1 ", "No. 2"]))).toEqual([
      ["No. 1", 1, 2],
      ["No. 2", 3],
    ])
  })

  it("starts a new part when the same text comes back later", () => {
    expect(shown(partsFromTexts(["A", "B", "A"]))).toEqual([
      ["A", 1],
      ["B", 2],
      ["A", 3],
    ])
  })

  it("is one unnamed part when no page has text there, and nothing for no pages", () => {
    expect(shown(partsFromTexts(["", "", ""]))).toEqual([["", 1, 2, 3]])
    expect(partsFromTexts([])).toEqual([])
  })
})

describe("partsFromStarts", () => {
  it("starts a part at each page given", () => {
    expect(shown(partsFromStarts([0, 3, 5], 7, "own"))).toEqual([
      [undefined, 1, 2, 3],
      [undefined, 4, 5],
      [undefined, 6, 7],
    ])
  })

  it("gives the pages before the first a part of their own, or joins them on", () => {
    expect(shown(partsFromStarts([2, 4], 6, "own"))).toEqual([
      [undefined, 1, 2],
      [undefined, 3, 4],
      [undefined, 5, 6],
    ])
    expect(shown(partsFromStarts([2, 4], 6, "join"))).toEqual([
      [undefined, 1, 2, 3, 4],
      [undefined, 5, 6],
    ])
  })

  it("takes pages in any order, once each, and only those in the file", () => {
    expect(shown(partsFromStarts([4, 1, 1, 9, -2], 6, "join"))).toEqual([
      [undefined, 1, 2, 3, 4],
      [undefined, 5, 6],
    ])
    expect(partsFromStarts([], 6, "own")).toEqual([])
  })
})
