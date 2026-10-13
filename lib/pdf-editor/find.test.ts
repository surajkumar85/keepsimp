import { describe, expect, it } from "vitest"
import {
  findIn,
  foundLine,
  LONGEST_FIND,
  opFor,
  placeAt,
  placesIn,
  preview,
  readQuery,
  replaced,
  type Found,
  type Query,
} from "./find"
import { SOFT } from "./retext"

const query = (find: string, more: Partial<Query> = {}): Query => ({
  find,
  matchCase: false,
  wholeWords: false,
  ...more,
})
const said = (text: string, spans: [number, number][]) =>
  spans.map(([start, end]) => Array.from(text).slice(start, end).join(""))

describe("what is asked for", () => {
  it("is read with how to look, and refused when nothing can be looked for", () => {
    expect(readQuery({ find: "word", matchCase: true, extra: 1 })).toEqual({
      find: "word",
      matchCase: true,
      wholeWords: false,
    })
    expect(
      readQuery({ find: " a ", wholeWords: true, matchCase: "yes" })
    ).toEqual({ find: " a ", matchCase: false, wholeWords: true })
    for (const bad of [
      null,
      "word",
      {},
      { find: 7 },
      { find: "" },
      { find: "   " },
      { find: "x".repeat(LONGEST_FIND + 1) },
    ])
      expect(readQuery(bad)).toBeNull()
  })
})

describe("finding words in a text", () => {
  it("finds every place, none lying over another", () => {
    const text = "The cat sat on the mat; the CAT sat."
    expect(findIn(text, query("the"))).toEqual([
      [0, 3],
      [15, 18],
      [24, 27],
    ])
    expect(said(text, findIn(text, query("cat")))).toEqual(["cat", "CAT"])
    expect(findIn("aaaa", query("aa"))).toEqual([
      [0, 2],
      [2, 4],
    ])
    expect(findIn(text, query("dog"))).toEqual([])
    expect(findIn("", query("a"))).toEqual([])
    expect(findIn("ab", query("abc"))).toEqual([])
    expect(findIn("abc", query("   "))).toEqual([])
  })

  it("tells capitals apart when asked, and leaves odd letters as they are", () => {
    const text = "The cat, the CAT"
    expect(said(text, findIn(text, query("cat", { matchCase: true })))).toEqual(
      ["cat"]
    )
    expect(said(text, findIn(text, query("The", { matchCase: true })))).toEqual(
      ["The"]
    )
    // A capital whose small form is two letters is only itself.
    expect(findIn("İstanbul", query("İ"))).toEqual([[0, 1]])
    expect(findIn("ÉCOLE école", query("école"))).toHaveLength(2)
  })

  it("finds whole words only when asked", () => {
    const text = "art, part, art-house and artist; ART"
    expect(findIn(text, query("art"))).toHaveLength(5)
    expect(
      said(text, findIn(text, query("art", { wholeWords: true })))
    ).toEqual(["art", "art", "ART"])
    // What is looked for may begin or end with a mark: that is an edge of its own.
    expect(findIn("a (b) c", query("(b)", { wholeWords: true }))).toEqual([
      [2, 5],
    ])
    expect(findIn("x1 1x 1", query("1", { wholeWords: true }))).toEqual([
      [6, 7],
    ])
    expect(findIn("under_score", query("score", { wholeWords: true }))).toEqual(
      []
    )
  })

  it("takes any run of spaces and line ends for a space", () => {
    const text = "day on\nwhich   this"
    expect(said(text, findIn(text, query("on which this")))).toEqual([
      "on\nwhich   this",
    ])
    expect(findIn(text, query("on  which"))).toHaveLength(1)
    expect(findIn(text, query("onwhich"))).toEqual([])
    // What is looked for is taken without the spaces around it.
    expect(findIn(text, query("  day "))).toEqual([[0, 3]])
    // A space that is looked for has to be there.
    expect(findIn("ab cd ef gh", query("b c d"))).toEqual([])
  })

  it("finds a word that a line break parted, with its soft hyphen", () => {
    const text = `the bor${SOFT}rower and the borrower`
    const spans = findIn(text, query("borrower"))
    expect(spans).toEqual([
      [4, 13],
      [22, 30],
    ])
    expect(said(text, spans)[0]).toBe(`bor${SOFT}rower`)
    // Counted in letters: a letter that takes two units is one.
    expect(findIn("𝒜 cat", query("cat"))).toEqual([[2, 5]])
  })
})

describe("other words in the place of some", () => {
  it("replaces the places that are named", () => {
    const text = "the cat sat on the mat"
    const spans = findIn(text, query("the"))
    expect(replaced(text, spans, "a")).toBe("a cat sat on a mat")
    expect(replaced(text, [spans[1]], "my")).toBe("the cat sat on my mat")
    expect(replaced(text, [], "x")).toBe(text)
    expect(replaced(text, spans, "")).toBe(" cat sat on  mat")
  })

  it("takes a soft hyphen along with the word it was in, and leaves the others", () => {
    const text = `the bor${SOFT}rower is trans${SOFT}ported`
    expect(replaced(text, findIn(text, query("borrower")), "debtor")).toBe(
      `the debtor is trans${SOFT}ported`
    )
    expect(replaced("𝒜 cat", [[2, 5]], "dog")).toBe("𝒜 dog")
  })

  it("makes the change a line or a paragraph is changed by", () => {
    const box = { x: 1, y: 2, width: 3, height: 4 }
    const line: Found = {
      page: 2,
      kind: "line",
      lines: [{ box, was: "the cat" }],
      text: "the cat",
      spans: [[4, 7]],
      fonts: [],
    }
    expect(opFor(line, line.spans, "dog")).toEqual({
      do: "retext",
      page: 2,
      box,
      was: "the cat",
      text: "the dog",
    })
    const block: Found = {
      ...line,
      kind: "block",
      lines: [
        { box, was: "the cat" },
        { box, was: "sat" },
      ],
      text: "the cat sat",
    }
    expect(opFor(block, block.spans, "dog")).toEqual({
      do: "reflow",
      page: 2,
      lines: block.lines,
      text: "the dog sat",
    })
  })
})

describe("what is shown of a place", () => {
  it("shows the words around it, what is there and what will be", () => {
    const text =
      "The lender agrees to lend the sum named above to the borrower."
    const [span] = findIn(text, query("sum"))
    expect(preview(text, span, "amount")).toEqual({
      before: "…e lender agrees to lend the ",
      was: "sum",
      now: "amount",
      after: " named above to the borrower…",
    })
    // At the start and the end nothing is cut, and line ends are spaces.
    expect(preview("a cat\nsat", [2, 5], "dog")).toEqual({
      before: "a ",
      was: "cat",
      now: "dog",
      after: " sat",
    })
    const long = `${"x".repeat(40)} cat ${"y".repeat(40)}`
    const cut = preview(long, [41, 44], "")
    expect(cut.before).toBe(`…${"x".repeat(27)} `)
    expect(cut.after).toBe(` ${"y".repeat(27)}…`)
    // A soft hyphen is not shown.
    expect(preview(`a bor${SOFT}rower b${SOFT}c`, [2, 11], "x")).toEqual({
      before: "a ",
      was: "borrower",
      now: "x",
      after: " bc",
    })
  })
})

describe("counting what was found", () => {
  const unit = (page: number, places: number): Found => ({
    page,
    kind: "line",
    lines: [],
    text: "",
    spans: Array.from({ length: places }, (_, at) => [at, at + 1]),
    fonts: [],
  })
  const found = [unit(0, 2), unit(0, 1), unit(3, 3)]

  it("counts places, and finds the place with a number", () => {
    expect(placesIn(found)).toBe(6)
    expect(placesIn([])).toBe(0)
    expect(placeAt(found, 0)).toEqual({ unit: 0, span: 0 })
    expect(placeAt(found, 1)).toEqual({ unit: 0, span: 1 })
    expect(placeAt(found, 2)).toEqual({ unit: 1, span: 0 })
    expect(placeAt(found, 5)).toEqual({ unit: 2, span: 2 })
    expect(placeAt(found, 6)).toBeNull()
    expect(placeAt([], 0)).toBeNull()
  })

  it("says how much was found", () => {
    expect(foundLine(found, false)).toBe("6 places on 2 pages")
    expect(foundLine([unit(4, 1)], false)).toBe("1 place on 1 page")
    expect(foundLine([unit(0, 5000)], true)).toBe(
      "More than 5,000 places on 1 page"
    )
    expect(foundLine([], false)).toBe("Not found in the words of this file.")
  })
})
