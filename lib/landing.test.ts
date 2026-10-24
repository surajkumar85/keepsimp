import { describe, expect, it } from "vitest"
import { tools } from "./catalogue"
import { families, pagesOf, toolById } from "./landing"

describe("the home page's groups of tools", () => {
  it("show every page of the catalogue exactly once", () => {
    const shown = families.flatMap((family) =>
      pagesOf(family).map((tool) => tool.id)
    )
    expect(new Set(shown).size).toBe(shown.length)
    expect([...shown].sort()).toEqual(tools.map((tool) => tool.id).sort())
  })

  it("open with a tool that is listed and can be used, in the group's colour", () => {
    for (const family of families) {
      const [lead, ...rest] = pagesOf(family)
      expect(lead.partOf).toBeUndefined()
      expect(lead.status).toBe("available")
      expect(lead.category).toBe(family.category)
      for (const tool of rest) expect(tool.status).toBe("available")
      expect(family.blurb).toMatch(/\.$/)
    }
  })

  it("refuse a tool that is not in the catalogue", () => {
    expect(() => toolById("no-such-tool")).toThrow("no-such-tool")
  })
})
