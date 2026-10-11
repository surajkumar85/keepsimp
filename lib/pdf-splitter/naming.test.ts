import { describe, expect, it } from "vitest"
import {
  DEFAULT_PATTERN,
  partNames,
  partStem,
  patternProblem,
  typedStem,
  unknownTokens,
  zipName,
} from "./naming"

const values = {
  source: "Annual Report.pdf",
  number: 3,
  total: 12,
  pageCount: 240,
}
const part = { pages: [4, 5, 6, 7, 8] }

describe("patterns", () => {
  it("knows its own placeholders", () => {
    expect(unknownTokens("{name}-{part}-{from}-{to}-{pages}-{label}")).toEqual(
      []
    )
    expect(unknownTokens("{name}-{width}-{}")).toEqual(["width", ""])
    expect(patternProblem(DEFAULT_PATTERN)).toBeNull()
    expect(patternProblem("")).toBeNull()
  })

  it("explains a placeholder it does not know", () => {
    expect(patternProblem("{name}-{chapter}")).toBe(
      "{chapter} is not a placeholder. Use {name}, {part}, {from}, {to}, {pages}, {label}."
    )
  })
})

describe("partStem", () => {
  it("fills in the name and the part number, padded so names sort in order", () => {
    expect(partStem("{name}-{part}", part, values)).toBe("Annual-Report-03")
    expect(partStem("{name}-{part}", part, { ...values, total: 9 })).toBe(
      "Annual-Report-3"
    )
    expect(
      partStem("{name}-{part}", part, { ...values, number: 7, total: 1200 })
    ).toBe("Annual-Report-0007")
  })

  it("fills in the first and last page, padded to the length of the file", () => {
    expect(partStem("p{from}-{to}", part, values)).toBe("p005-009")
    expect(partStem("p{from}-{to}", part, { ...values, pageCount: 9 })).toBe(
      "p5-9"
    )
  })

  it("writes the pages as they would be typed", () => {
    expect(partStem("{name} pages {pages}", part, values)).toBe(
      "Annual-Report-pages-5-9"
    )
    expect(partStem("{pages}", { pages: [0, 2, 4, 5, 6] }, values)).toBe(
      "1_3_5-7"
    )
  })

  it("fills in the part's own words, or nothing when it has none", () => {
    expect(
      partStem(
        "{part} {label}",
        { ...part, label: "Chapter 2: Results" },
        values
      )
    ).toBe("03-Chapter-2-Results")
    expect(partStem("{name}-{label}", part, values)).toBe("Annual-Report")
  })

  it("uses the usual pattern when none is given", () => {
    expect(partStem("  ", part, values)).toBe("Annual-Report-03")
  })

  it("leaves unknown placeholders as they are, made safe", () => {
    expect(partStem("{name}-{chapter}", part, values)).toBe(
      "Annual-Report-chapter"
    )
  })

  it("only drops a .pdf ending from the name, whatever its capitals", () => {
    expect(partStem("{name}", part, { ...values, source: "v1.2.PDF" })).toBe(
      "v1.2"
    )
    expect(partStem("{name}", part, { ...values, source: "notes.txt" })).toBe(
      "notes.txt"
    )
  })

  it("falls back to the part number when nothing is left", () => {
    expect(partStem("///", part, values)).toBe("part-3")
    expect(partStem("{label}", part, values)).toBe("part-3")
  })

  it("cuts a very long name", () => {
    expect(
      partStem("{name}", part, { ...values, source: "x".repeat(300) })
    ).toHaveLength(120)
  })

  it("counts an empty part's pages from 1", () => {
    expect(partStem("{from}-{to}", { pages: [] }, values)).toBe("001-001")
  })
})

describe("typedStem", () => {
  it("makes a typed name safe and drops a .pdf someone added", () => {
    expect(typedStem("  Chapter 1: Start.pdf ")).toBe("Chapter-1-Start")
    expect(typedStem("")).toBe("")
    expect(typedStem("///")).toBe("")
  })
})

describe("partNames", () => {
  const parts = [{ pages: [0] }, { pages: [1] }, { pages: [2] }]

  it("names every part from the pattern", () => {
    expect(partNames(parts, "{name}-{part}", "doc.pdf", 3)).toEqual([
      "doc-1.pdf",
      "doc-2.pdf",
      "doc-3.pdf",
    ])
  })

  it("uses a typed name where there is one", () => {
    expect(
      partNames(parts, "{name}-{part}", "doc.pdf", 3, [undefined, "Cover", " "])
    ).toEqual(["doc-1.pdf", "Cover.pdf", "doc-3.pdf"])
  })

  it("never gives two parts the same name", () => {
    expect(partNames(parts, "{name}", "doc.pdf", 3)).toEqual([
      "doc.pdf",
      "doc-2.pdf",
      "doc-3.pdf",
    ])
    expect(
      partNames(parts, "{name}-{part}", "doc.pdf", 3, ["doc-2", undefined])
    ).toEqual(["doc-2.pdf", "doc-2-2.pdf", "doc-3.pdf"])
  })
})

describe("zipName", () => {
  it("is named after the file that was split", () => {
    expect(zipName("Annual Report.pdf")).toBe("Annual-Report-split.zip")
    expect(zipName("???.pdf")).toBe("pages-split.zip")
  })
})
