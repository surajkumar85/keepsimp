import { describe, expect, it } from "vitest"
import {
  defaultSettings,
  levelChoices,
  levelPlans,
  outcome,
  pageMarks,
  resultName,
  settingsKey,
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

  it("starts balanced, and tells levels apart by their key", () => {
    expect(defaultSettings.level).toBe("balanced")
    expect(settingsKey({ level: "strong" })).not.toBe(
      settingsKey(defaultSettings)
    )
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
