import { describe, expect, it } from "vitest"
import { desktopLimits } from "@/lib/pdf-merger/settings"
import {
  fileProblem,
  givesOneFile,
  nothingToWrite,
  pagesProblem,
  patternFor,
  planFor,
  splitKey,
  typedCount,
  withOverrides,
  type SplitChoices,
} from "./settings"

const choices = (change: Partial<SplitChoices>): SplitChoices => ({
  mode: "cuts",
  cuts: [],
  ranges: "",
  selected: new Set(),
  ...change,
})
const shown = (plan: ReturnType<typeof planFor>) =>
  "parts" in plan
    ? plan.parts.map((part) => part.pages.map((page) => page + 1))
    : plan.problem

describe("fileProblem", () => {
  const file = (name: string, size = 1000) => ({ name, size })

  it("takes a PDF of a size that can be handled", () => {
    expect(fileProblem(file("a.pdf"), true, desktopLimits)).toBeNull()
  })

  it("refuses an empty file, whatever it claims to be", () => {
    expect(fileProblem(file("a.pdf", 0), true, desktopLimits)).toBe(
      "a.pdf is empty."
    )
  })

  it("refuses what is not a PDF, and says how to make one from a document", () => {
    expect(fileProblem(file("photo.png"), false, desktopLimits)).toBe(
      "photo.png is not a PDF."
    )
    expect(fileProblem(file("letter.docx"), false, desktopLimits)).toBe(
      "letter.docx is not a PDF. Save or export it as a PDF first, then add that."
    )
  })

  it("refuses a file that is too large for the device", () => {
    expect(
      fileProblem(
        file("big.pdf", desktopLimits.fileBytes + 1),
        true,
        desktopLimits
      )
    ).toBe("big.pdf is larger than 300 MB.")
  })
})

describe("pagesProblem", () => {
  it("says when a file has more pages than can be split", () => {
    expect(pagesProblem(5001, 5000)).toBe(
      "This file has 5,001 pages. Up to 5,000 can be split at once."
    )
    expect(pagesProblem(5000, 5000)).toBeNull()
  })
})

describe("planFor", () => {
  it("cuts a file at its cuts", () => {
    expect(shown(planFor(choices({ cuts: [1] }), 4))).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it("asks for a cut when there is none", () => {
    expect(shown(planFor(choices({}), 4))).toMatch(/^Cut the file somewhere/)
  })

  it("reads typed ranges, and passes on what is wrong with them", () => {
    expect(
      shown(planFor(choices({ mode: "ranges", ranges: "1, 3-4" }), 4))
    ).toEqual([[1], [3, 4]])
    expect(shown(planFor(choices({ mode: "ranges", ranges: "9" }), 4))).toMatch(
      /has 4 pages/
    )
  })

  it("parts odd pages from even", () => {
    expect(shown(planFor(choices({ mode: "oddeven" }), 4))).toEqual([
      [1, 3],
      [2, 4],
    ])
  })

  it("takes pages out, or removes them", () => {
    const selected = new Set([0, 3])
    expect(shown(planFor(choices({ mode: "extract", selected }), 4))).toEqual([
      [1, 4],
    ])
    expect(shown(planFor(choices({ mode: "remove", selected }), 4))).toEqual([
      [2, 3],
    ])
    expect(shown(planFor(choices({ mode: "extract" }), 4))).toBe(
      "Select the pages to take out."
    )
  })
})

describe("modes", () => {
  it("knows which ways of splitting give one file", () => {
    expect(givesOneFile("extract")).toBe(true)
    expect(givesOneFile("remove")).toBe(true)
    expect(givesOneFile("cuts")).toBe(false)
    expect(givesOneFile("ranges")).toBe(false)
    expect(givesOneFile("oddeven")).toBe(false)
  })

  it("has a fitting pattern for each", () => {
    expect(patternFor("cuts")).toBe("{name}-{part}")
    expect(patternFor("ranges")).toBe("{name}-{part}")
    expect(patternFor("oddeven")).toBe("{name}-{label}")
    expect(patternFor("extract")).toBe("{name}-pages-{pages}")
    expect(patternFor("remove")).toBe("{name}-edited")
  })
})

describe("withOverrides", () => {
  const parts = [{ pages: [0, 1] }, { pages: [2] }, { pages: [3, 4] }]

  it("remembers a typed name and a part left out by the part's first page", () => {
    const planned = withOverrides(
      "cuts",
      parts,
      { p2: "Middle" },
      new Set(["p3"])
    )
    expect(
      planned.map((part) => [part.key, part.number, part.typed, part.skipped])
    ).toEqual([
      ["p0", 1, "", false],
      ["p2", 2, "Middle", false],
      ["p3", 3, "", true],
    ])
  })

  it("keeps a name with its part when an earlier cut is added", () => {
    const more = [{ pages: [0] }, { pages: [1] }, ...parts.slice(1)]
    const planned = withOverrides("cuts", more, { p2: "Middle" }, new Set())
    expect(planned.map((part) => part.typed)).toEqual(["", "", "Middle", ""])
  })

  it("remembers by place when parts are not made by cuts", () => {
    const planned = withOverrides("ranges", parts, { n1: "Second" }, new Set())
    expect(planned.map((part) => part.typed)).toEqual(["", "Second", ""])
  })
})

describe("nothingToWrite", () => {
  const parts = [{ pages: [0] }, { pages: [1] }]

  it("says so when every part is left out", () => {
    expect(
      nothingToWrite(withOverrides("cuts", parts, {}, new Set(["p0", "p1"])))
    ).toMatch(/^Every part is left out/)
  })

  it("is content with one part to write", () => {
    expect(
      nothingToWrite(withOverrides("cuts", parts, {}, new Set(["p0"])))
    ).toBeNull()
  })
})

describe("splitKey", () => {
  const parts = withOverrides(
    "cuts",
    [{ pages: [0] }, { pages: [1] }, { pages: [2] }],
    {},
    new Set(["p1"])
  )

  it("changes with the file, the parts written and their names", () => {
    const key = splitKey("a", parts, ["x.pdf", "y.pdf"])
    expect(splitKey("a", parts, ["x.pdf", "y.pdf"])).toBe(key)
    expect(splitKey("b", parts, ["x.pdf", "y.pdf"])).not.toBe(key)
    expect(splitKey("a", parts, ["x.pdf", "z.pdf"])).not.toBe(key)
    expect(
      splitKey(
        "a",
        [parts[0], { ...parts[1], skipped: false }, parts[2]],
        ["x.pdf", "y.pdf"]
      )
    ).not.toBe(key)
  })

  it("does not change with a part that is left out", () => {
    const key = splitKey("a", parts, ["x.pdf", "y.pdf"])
    const other = [parts[0], { ...parts[1], pages: [1, 2, 3] }, parts[2]]
    expect(splitKey("a", other, ["x.pdf", "y.pdf"])).toBe(key)
  })
})

describe("typedCount", () => {
  it("reads a whole number of at least 1", () => {
    expect(typedCount("3", 10)).toBe(3)
    expect(typedCount(" 10 ", 10)).toBe(10)
  })

  it("refuses anything else", () => {
    for (const text of ["0", "11", "", "2.5", "-1", "two"])
      expect(typedCount(text, 10)).toBeNull()
  })
})
