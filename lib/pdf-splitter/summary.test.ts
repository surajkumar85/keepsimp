import { describe, expect, it } from "vitest"
import { changedGroups } from "@/lib/settings-groups"
import { defaultOptions, type SplitOptions } from "./options"
import { SPLIT_GROUPS, splitSummary } from "./summary"

const with_ = (change: Partial<SplitOptions>) => ({
  ...defaultOptions,
  ...change,
})

describe("splitSummary", () => {
  it("says what every part keeps", () => {
    expect(splitSummary("keeps", defaultOptions)).toBe(
      "Bookmarks, page numbers and details · attached files in the first part"
    )
    expect(
      splitSummary("keeps", with_({ bookmarks: false, attachments: "all" }))
    ).toBe("Page numbers and details · attached files in every part")
    expect(
      splitSummary(
        "keeps",
        with_({
          bookmarks: false,
          labels: false,
          details: false,
          attachments: "none",
        })
      )
    ).toBe("No bookmarks, page numbers or details · no attached files")
  })

  it("says the password", () => {
    expect(splitSummary("password", defaultOptions)).toBe("No password")
    expect(
      splitSummary(
        "password",
        with_({ protect: true, password: "s", allowCopy: false })
      )
    ).toBe("Locked with a password · no copying")
  })

  it("finds the groups that differ", () => {
    expect(changedGroups(defaultOptions, defaultOptions, SPLIT_GROUPS)).toEqual(
      []
    )
    expect(
      changedGroups(with_({ details: false }), defaultOptions, SPLIT_GROUPS)
    ).toEqual(["keeps"])
  })
})
