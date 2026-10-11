import { describe, expect, it } from "vitest"
import {
  CUSTOM_MARK,
  CUSTOM_NOTE,
  customDpis,
  customPlan,
  customQuality,
  defaultCustom,
  defaultSettings,
  layerStep,
  levelChoices,
  levelPlans,
  modeChoices,
  modeNote,
  outcome,
  pageMarks,
  resultName,
  SCAN_COVERS,
  scanChoices,
  scanMarks,
  scanSettings,
  scansFor,
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
    expect(settingsKey({ ...sized, scans: "layers" })).toBe(
      "size:1048576:false:layers"
    )
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
      "custom",
    ])
    expect(modeNote("size")).toBe(SIZE_NOTE)
    expect(modeNote("custom")).toBe(CUSTOM_NOTE)
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

describe("settings of one's own", () => {
  it("save pictures exactly as set", () => {
    expect(customPlan(defaultCustom)).toEqual({
      dpi: 150,
      slack: 1.25,
      look: "smallest",
      keepBelow: 75,
      floor: 75,
      fixed: 75,
    })
    expect(customDpis).toContain(defaultCustom.dpi)
    expect(CUSTOM_MARK).toBeLessThan(pageMarks.strong)
  })

  it("keep the quality within what can be written", () => {
    expect(customPlan({ ...defaultCustom, quality: 3 }).fixed).toBe(
      customQuality.min
    )
    expect(customPlan({ ...defaultCustom, quality: 99.6 }).fixed).toBe(
      customQuality.max
    )
    expect(customPlan({ ...defaultCustom, quality: 60.4 }).fixed).toBe(60)
  })

  it("count as part of the settings, each of them", () => {
    const custom = { ...defaultSettings, mode: "custom" as const }
    expect(settingsKey(custom)).toBe("custom:150:75:false:true")
    for (const change of [
      { dpi: 96 },
      { quality: 50 },
      { grey: true },
      { fonts: false },
    ])
      expect(
        settingsKey({ ...custom, custom: { ...defaultCustom, ...change } })
      ).not.toBe(settingsKey(custom))
    // They do not matter at a level.
    expect(
      settingsKey({
        ...defaultSettings,
        custom: { ...defaultCustom, grey: true },
      })
    ).toBe("balanced")
  })
})

describe("scanned pages", () => {
  it("can be rebuilt three ways, or left as they are", () => {
    expect(scanChoices.map((choice) => choice.value)).toEqual([
      "keep",
      "layers",
      "grey",
      "mono",
    ])
    expect(Object.keys(scanMarks).sort()).toEqual(["grey", "layers", "mono"])
    expect(SCAN_COVERS).toBeGreaterThan(0.5)
  })

  it("count as part of the settings, except where nothing may be lost", () => {
    const mono = { ...defaultSettings, scans: "mono" as const }
    expect(settingsKey(mono)).toBe("balanced:mono")
    expect(scansFor(mono)).toBe("mono")
    const lossless = { ...mono, mode: "lossless" as const }
    expect(settingsKey(lossless)).toBe("lossless")
    expect(scansFor(lossless)).toBe("keep")
  })

  it("give soft layers whole steps of the scan's pixels", () => {
    expect(layerStep(300, 100)).toBe(3)
    expect(layerStep(149.98, 100)).toBe(2)
    expect(layerStep(150.05, 100)).toBe(2)
    expect(layerStep(104, 100)).toBe(1)
    expect(layerStep(60, 100)).toBe(1)
  })

  it("keep letters at twice the level's resolution, and paper softer than pictures", () => {
    expect(scanSettings(levelPlans.balanced!)).toEqual({
      maskDpi: 300,
      paperDpi: 100,
      paperQuality: 65,
    })
    expect(scanSettings(levelPlans.strong!)).toMatchObject({
      maskDpi: 192,
      paperDpi: 64,
      paperQuality: 50,
    })
    // A file squeezed hard keeps a quality a JPEG can still be written at.
    expect(
      scanSettings({ ...levelPlans.strong!, dpi: 36, fixed: 26 })
    ).toMatchObject({ maskDpi: 72, paperDpi: 24, paperQuality: 30 })
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
