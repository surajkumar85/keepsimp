import { describe, expect, it } from "vitest"
import { changedGroups } from "@/lib/settings-groups"
import { defaultExtras, type Extras } from "./options"
import { defaultSettings, type CompressSettings } from "./settings"
import {
  EXTRAS_GROUPS,
  extrasSummary,
  levelChanged,
  levelSummary,
} from "./summary"

const KB = 1024
const level = (change: Partial<CompressSettings>) => ({
  ...defaultSettings,
  ...change,
})
const extras = (change: Partial<Extras>) => ({ ...defaultExtras, ...change })

describe("levelSummary", () => {
  it("names a level, and what is done to scans", () => {
    expect(levelSummary(defaultSettings)).toBe("Balanced")
    expect(levelSummary(level({ mode: "strong", scans: "layers" }))).toBe(
      "Strong · scans as text and paper"
    )
    expect(levelSummary(level({ scans: "grey" }))).toBe(
      "Balanced · scans in greyscale"
    )
    expect(levelSummary(level({ scans: "mono" }))).toBe(
      "Balanced · scans in black and white"
    )
    // Lossless leaves scans as they are, whatever was chosen before.
    expect(levelSummary(level({ mode: "lossless", scans: "mono" }))).toBe(
      "Lossless"
    )
  })

  it("names a size, or says one is to be typed", () => {
    expect(levelSummary(level({ mode: "size", target: 200 * KB }))).toBe(
      "Under 200 KB"
    )
    expect(levelSummary(level({ mode: "size", target: 1536 * KB }))).toBe(
      "Under 1.5 MB"
    )
    expect(
      levelSummary(level({ mode: "size", target: 1024 * KB, further: true }))
    ).toBe("Under 1 MB · going further if it takes it")
    expect(levelSummary(level({ mode: "size", target: null }))).toBe(
      "A size is still to be typed"
    )
  })

  it("says settings of one's own", () => {
    expect(levelSummary(level({ mode: "custom" }))).toBe("150 dpi · quality 75")
    expect(
      levelSummary(
        level({
          mode: "custom",
          custom: { dpi: 72, quality: 40, grey: true, fonts: false },
        })
      )
    ).toBe("72 dpi · quality 40 · greyscale · whole fonts")
  })

  it("is changed only when it would write something else", () => {
    expect(levelChanged(defaultSettings)).toBe(false)
    // A size chosen and then left for a level changes nothing.
    expect(levelChanged(level({ target: 200 * KB }))).toBe(false)
    expect(levelChanged(level({ mode: "strong" }))).toBe(true)
  })
})

describe("extrasSummary", () => {
  it("says what is taken out", () => {
    expect(extrasSummary("takeOut", defaultExtras)).toBe("Everything kept")
    expect(
      extrasSummary("takeOut", extras({ details: true, bookmarks: true }))
    ).toBe("Details and bookmarks taken out")
    expect(
      extrasSummary(
        "takeOut",
        extras({
          attachments: true,
          comments: true,
          scripts: true,
          tags: true,
          flatten: true,
        })
      )
    ).toBe(
      "Attached files, notes, scripts and tags taken out · fields flattened"
    )
    expect(extrasSummary("takeOut", extras({ flatten: true }))).toBe(
      "Fields flattened"
    )
  })

  it("says the password", () => {
    expect(extrasSummary("password", defaultExtras)).toBe("No password")
    expect(
      extrasSummary(
        "password",
        extras({ protect: true, password: "k", allowChanges: false })
      )
    ).toBe("Locked with a password · no changes")
  })

  it("finds the groups that differ", () => {
    expect(
      changedGroups(extras({ tags: true }), defaultExtras, EXTRAS_GROUPS)
    ).toEqual(["takeOut"])
  })
})
