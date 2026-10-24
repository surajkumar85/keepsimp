import { describe, expect, it } from "vitest"
import { checkDocument, fixAll, fixIssues } from "./check"

describe("the document check", () => {
  it("finds skipped heading levels, missing headings, pictures without words", () => {
    const text = [
      "# Title",
      "",
      "### Too deep",
      "",
      "See [the part](#nowhere) and ![](a.png).",
      "",
      "Line with spaces   ",
      "",
    ].join("\n")
    const issues = checkDocument(text)
    const rules = issues.map((one) => one.rule)
    expect(rules).toContain("MD001")
    expect(rules).toContain("MD051")
    expect(rules).toContain("MD045")
    expect(rules).toContain("MD009")
    expect(issues.find((one) => one.rule === "MD001")!.said).toBe(
      "A heading skips a level: go down one level at a time."
    )
    expect(issues.map((one) => one.line)).toEqual(
      [...issues.map((one) => one.line)].sort((a, b) => a - b)
    )
    // Long lines, HTML and bare addresses are fine, as on GitHub.
    expect(
      checkDocument(
        `# T\n\n${"word ".repeat(40)}<b>x</b> https://example.com\n`
      )
    ).toEqual([])
  })

  it("says rules it has no words of its own for in markdownlint's", () => {
    const issues = checkDocument(
      "# T\n\n```\ncode\n```\n\n~~~\nmore\n~~~\n\nText\n\n`` x ``\n"
    )
    expect(issues.length).toBeGreaterThan(0)
    for (const one of issues) expect(one.said).toMatch(/\.$/)
  })

  it("fixes what can be fixed, one finding or all of them", () => {
    const text = "#Title\n\n\n\nEnds with spaces  \t\n"
    const issues = checkDocument(text)
    const fixed = fixAll(text)
    expect(fixed).toBe("# Title\n\nEnds with spaces\n")
    expect(fixAll(fixed)).toBe(fixed)
    expect(checkDocument(fixed)).toEqual([])
    const first = issues.find((one) => one.rule === "MD018")!
    expect(fixIssues(text, [first])).toMatch(/^# Title/)
    const unfixable = checkDocument("# A\n\n### B\n").filter(
      (one) => !one.fixable
    )
    expect(fixIssues("# A\n\n### B\n", unfixable)).toBe("# A\n\n### B\n")
  })
})
