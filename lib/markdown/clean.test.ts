import { describe, expect, it, vi } from "vitest"

describe("cleanSvg", () => {
  it("keeps a drawing and its styles, and takes out what could run or reach out", async () => {
    const { cleanSvg } = await import("./clean")
    const out = cleanSvg(
      '<svg id="d"><style>#d .node{fill:red}</style><g onclick="x()"><rect width="5"/><foreignObject><div>html</div></foreignObject><a href="https://x"><text>link</text></a><image href="https://x/p.png"/><script>bad()</script></g></svg>'
    )
    expect(out).toContain("<style>#d .node{fill:red}</style>")
    expect(out).toContain('<rect width="5"></rect>')
    expect(out).not.toMatch(/onclick|foreignObject|<a |<image|<script|html/)
  })
})

describe("clean without a browser", () => {
  it("refuses to hand HTML over uncleaned", async () => {
    vi.resetModules()
    vi.doMock("dompurify", () => ({ default: () => ({ isSupported: false }) }))
    const { clean } = await import("./clean")
    expect(() => clean("<p>hi</p>")).toThrow(
      "HTML can only be cleaned where there is a browser's document."
    )
    vi.doUnmock("dompurify")
  })
})
