import { describe, expect, it } from "vitest"
import {
  addressFrom,
  linkName,
  LONGEST_ADDRESS,
  readLinkOp,
  sameBox,
  sameTarget,
  targetFrom,
  targetText,
} from "./links"

describe("an address a link is given", () => {
  it("takes the web, a letter and a telephone, as they are typed", () => {
    expect(addressFrom("https://example.org/a?b=c#d")).toBe(
      "https://example.org/a?b=c#d"
    )
    expect(addressFrom("  HTTP://Example.org  ")).toBe("http://example.org/")
    expect(addressFrom("mailto:ada@example.org")).toBe("mailto:ada@example.org")
    expect(addressFrom("tel:+441234567890")).toBe("tel:+441234567890")
    // A name without its kind is the web's; what looks like a letter's address is a letter's.
    expect(addressFrom("example.org")).toBe("https://example.org/")
    expect(addressFrom("www.example.org/terms")).toBe(
      "https://www.example.org/terms"
    )
    expect(addressFrom("ada@example.org")).toBe("mailto:ada@example.org")
  })

  it("takes nothing that runs anything, and nothing that is no address", () => {
    for (const bad of [
      "",
      "   ",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
      "ftp://example.org/file",
      "two words.com",
      "just-a-word",
      "example.",
      "https://localhost",
      "https://",
      "http://exa mple.org",
      "a@b",
      `https://example.org/${"x".repeat(LONGEST_ADDRESS)}`,
    ])
      expect(addressFrom(bad)).toBeNull()
  })
})

describe("where a link is to lead, from what was typed", () => {
  it("reads a page in the ways a page is typed", () => {
    expect(targetFrom("3", 10)).toEqual({ page: 2 })
    expect(targetFrom(" Page 10 ", 10)).toEqual({ page: 9 })
    expect(targetFrom("p. 1", 10)).toEqual({ page: 0 })
    expect(targetFrom("p7", 10)).toEqual({ page: 6 })
    // A page the file has not is nowhere to lead.
    expect(targetFrom("0", 10)).toBeNull()
    expect(targetFrom("11", 10)).toBeNull()
  })

  it("reads an address, and nothing else", () => {
    expect(targetFrom("example.org", 3)).toEqual({
      url: "https://example.org/",
    })
    expect(targetFrom("somewhere", 3)).toBeNull()
    expect(targetFrom("", 3)).toBeNull()
  })

  it("says where a link leads, and what it is called", () => {
    expect(targetText({ page: 2 })).toBe("Page 3")
    expect(targetText({ url: "https://example.org/" })).toBe(
      "https://example.org/"
    )
    expect(targetText(null)).toBe("")
    expect(linkName({ page: 0 })).toBe("Link to page 1")
    expect(linkName({ url: "https://www.example.org/terms/" })).toBe(
      "Link to example.org/terms"
    )
    expect(linkName({ url: "mailto:ada@example.org" })).toBe(
      "Link to mailto:ada@example.org"
    )
    expect(linkName({ url: `https://example.org/${"x".repeat(100)}` })).toBe(
      `Link to example.org/${"x".repeat(48)}…`
    )
    expect(linkName(null)).toMatch(/cannot read/)
  })

  it("compares boxes and where links lead", () => {
    const box = { x: 1, y: 2, width: 30, height: 10 }
    expect(sameBox(box, { x: 1.4, y: 1.6, width: 30.5, height: 9.5 })).toBe(
      true
    )
    for (const other of [
      { ...box, x: 2 },
      { ...box, y: 3 },
      { ...box, width: 31 },
      { ...box, height: 11 },
    ])
      expect(sameBox(box, other)).toBe(false)
    expect(sameTarget({ page: 1 }, { page: 1 })).toBe(true)
    expect(sameTarget({ page: 1 }, { page: 2 })).toBe(false)
    expect(sameTarget({ url: "a:b" }, { url: "a:b" })).toBe(true)
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget(null, { page: 0 })).toBe(false)
  })
})

describe("a change to a link as it arrives", () => {
  const box = { x: 10, y: 20, width: 100, height: 14 }
  const op = (more: object = {}) => ({ do: "link", page: 0, ...more })

  it("reads a new link, which needs a place and somewhere to lead", () => {
    expect(
      readLinkOp(op({ box: { ...box, extra: 1 }, to: { url: "example.org" } }))
    ).toEqual({
      do: "link",
      page: 0,
      box,
      to: { url: "https://example.org/" },
    })
    expect(readLinkOp(op({ box, to: { page: 2, url: 7 }, more: 1 }))).toEqual({
      do: "link",
      page: 0,
      box,
      to: { page: 2 },
    })
    expect(readLinkOp(op({ box }))).toBeNull()
    expect(readLinkOp(op({ to: { page: 1 } }))).toBeNull()
    expect(readLinkOp(op())).toBeNull()
  })

  it("reads a link led somewhere else, put somewhere else, or taken away", () => {
    const named = { index: 1, at: box }
    expect(readLinkOp(op({ ...named, to: { page: 0 } }))).toEqual({
      do: "link",
      page: 0,
      ...named,
      to: { page: 0 },
    })
    const moved = { ...box, x: 50 }
    expect(readLinkOp(op({ ...named, box: moved }))).toEqual({
      do: "link",
      page: 0,
      ...named,
      box: moved,
    })
    expect(
      readLinkOp(op({ ...named, box: moved, to: { url: "tel:123" } }))
    ).toEqual({
      do: "link",
      page: 0,
      ...named,
      box: moved,
      to: { url: "tel:123" },
    })
    // Taking away comes before anything else that is said.
    expect(readLinkOp(op({ ...named, remove: true, to: { page: 0 } }))).toEqual(
      { do: "link", page: 0, ...named, remove: true }
    )
  })

  it("refuses what is not one", () => {
    const named = { index: 1, at: box }
    for (const bad of [
      null,
      "link",
      op({ do: "picture", box, to: { page: 0 } }),
      op({ page: -1, box, to: { page: 0 } }),
      op({ page: 0.5, box, to: { page: 0 } }),
      op({ box: "here", to: { page: 0 } }),
      op({ box: null, to: { page: 0 } }),
      op({ box: { ...box, x: "1" }, to: { page: 0 } }),
      op({ box: { ...box, y: NaN }, to: { page: 0 } }),
      op({ box: { ...box, x: 1e9 }, to: { page: 0 } }),
      op({ box: { ...box, width: 2 }, to: { page: 0 } }),
      op({ box: { ...box, height: 1 }, to: { page: 0 } }),
      op({ box, to: "somewhere" }),
      op({ box, to: null }),
      op({ box, to: { url: "javascript:alert(1)" } }),
      op({ box, to: { page: -1 } }),
      op({ box, to: { page: 1.5 } }),
      op({ box, to: {} }),
      // A link that is named has to be named whole, and something has to be done to it.
      op({ index: 1, remove: true }),
      op({ at: box, remove: true }),
      op({ index: -1, at: box, remove: true }),
      op({ index: "1", at: box, remove: true }),
      op({ index: 1, at: { ...box, width: 0 }, remove: true }),
      op(named),
      op({ ...named, remove: 1 }),
    ])
      expect(readLinkOp(bad)).toBeNull()
  })
})
