import { describe, expect, it } from "vitest"
import { tidyMarkdown } from "./tidy"

describe("tidyMarkdown", () => {
  it("writes lists, emphasis and tables one way, and keeps lines as wrapped", async () => {
    expect(
      await tidyMarkdown(
        "# Title\n* one\n* two\n\n|a|b|\n|-|-|\n|1|22|\n\n*soft* and __bold__\nsame paragraph\n"
      )
    ).toBe(
      "# Title\n\n- one\n- two\n\n| a   | b   |\n| --- | --- |\n| 1   | 22  |\n\n_soft_ and **bold**\nsame paragraph\n"
    )
  })
})
