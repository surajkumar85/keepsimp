import { describe, expect, it, vi } from "vitest"

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
