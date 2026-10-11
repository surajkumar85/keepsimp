import { describe, expect, it } from "vitest"
import {
  defaultSettings,
  levelChoices,
  levelPlans,
  modeChoices,
  modeNote,
  outcome,
  pageMarks,
  resultName,
  settingsKey,
  settingsProblem,
  SIZE_NOTE,
} from "./settings"

describe("levels", () => {
  it("offers every level once, each with a plan and a mark", () => {
    expect(levelChoices.map((choice) => choice.value).sort()).toEqual(
      Object.keys(levelPlans).sort()
    )
    expect(levelPlans.lossless).toBeNull()
    expect(levelPlans.strong!.dpi).toBeLessThan(levelPlans.balanced!.dpi)
    expect(pageMarks.lossless).toBeGreaterThan(pageMarks.balanced)
    expect(pageMarks.balanced).toBeGreaterThan(pageMarks.strong)
  })

  it("starts balanced, and tells settings apart by their key", () => {
    expect(defaultSettings.mode).toBe("balanced")
    expect(settingsKey({ ...defaultSettings, mode: "strong" })).not.toBe(
      settingsKey(defaultSettings)
    )
    // The size only matters when the file is compressed to a size.
    expect(settingsKey({ ...defaultSettings, target: 5 })).toBe(
      settingsKey(defaultSettings)
    )
    const sized = { ...defaultSettings, mode: "size" as const }
    expect(settingsKey(sized)).toBe("size:1048576:false")
    expect(settingsKey({ ...sized, further: true })).not.toBe(
      settingsKey(sized)
    )
  })

  it("offers a size as a fourth choice, with a note of its own", () => {
    expect(modeChoices.map((choice) => choice.value)).toEqual([
      "lossless",
      "balanced",
      "strong",
      "size",
    ])
    expect(modeNote("size")).toBe(SIZE_NOTE)
    expect(modeNote("lossless")).toContain("Nothing you can see changes")
  })

  it("needs a size before it compresses to one", () => {
    expect(settingsProblem(defaultSettings)).toBeNull()
    expect(settingsProblem({ ...defaultSettings, mode: "size" })).toBeNull()
    expect(
      settingsProblem({ ...defaultSettings, mode: "size", target: null })
    ).toContain("Type a size")
    expect(settingsProblem({ ...defaultSettings, target: null })).toBeNull()
  })
})

describe("resultName", () => {
  it("marks the file's own name", () => {
    expect(resultName("Report 2026.PDF")).toBe("Report 2026-compressed.pdf")
    expect(resultName("scan")).toBe("scan-compressed.pdf")
  })

  it("has a name for a file without one", () => {
    expect(resultName(".pdf")).toBe("document-compressed.pdf")
  })
})

describe("outcome", () => {
  it("counts what was saved", () => {
    expect(outcome(1000, 400)).toEqual({
      saved: 600,
      percent: 60,
      smaller: true,
    })
  })

  it("does not call a hair's breadth smaller", () => {
    expect(outcome(1000, 995)).toEqual({ saved: 0, percent: 0, smaller: false })
    expect(outcome(1000, 1200).smaller).toBe(false)
    expect(outcome(0, 0).smaller).toBe(false)
  })
})
