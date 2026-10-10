import { describe, expect, it } from "vitest"
import {
  admit,
  defaultSettings,
  describeSize,
  entryName,
  desktopLimits,
  limitsFor,
  looksLikePdf,
  megabytes,
  outputName,
  phoneLimits,
} from "./settings"

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0))

describe("outputName", () => {
  it("always ends in .pdf, once", () => {
    expect(outputName(defaultSettings.name)).toBe("merged.pdf")
    expect(outputName("report")).toBe("report.pdf")
    expect(outputName("report.pdf")).toBe("report.pdf")
    expect(outputName(" Report.PDF ")).toBe("Report.pdf")
  })

  it("makes the name safe for a file system", () => {
    expect(outputName("Q3 / final: draft?")).toBe("Q3-final-draft.pdf")
    expect(outputName("../../etc/passwd")).toBe("etc-passwd.pdf")
    expect(outputName("Résumé 2026")).toBe("Résumé-2026.pdf")
    expect(outputName("x".repeat(300))).toBe(`${"x".repeat(120)}.pdf`)
  })

  it("falls back to the default when nothing is left", () => {
    expect(outputName("")).toBe("merged.pdf")
    expect(outputName("  ")).toBe("merged.pdf")
    expect(outputName("///")).toBe("merged.pdf")
    expect(outputName(".pdf")).toBe("merged.pdf")
  })
})

describe("entryName", () => {
  it("drops the extension", () => {
    expect(entryName("Annual report.pdf")).toBe("Annual report")
    expect(entryName("scan.PDF")).toBe("scan")
    expect(entryName("notes")).toBe("notes")
    // A name that is only an extension stays as it is.
    expect(entryName(".pdf")).toBe(".pdf")
  })
})

describe("looksLikePdf", () => {
  it("finds the marker at the start or a little way in", () => {
    expect(looksLikePdf(bytes("%PDF-1.7\n"))).toBe(true)
    expect(looksLikePdf(bytes("\xef\xbb\xbf%PDF-1.4"))).toBe(true)
    expect(looksLikePdf(bytes(`${" ".repeat(1024)}%PDF-2.0`))).toBe(true)
  })

  it("says no to other files", () => {
    expect(looksLikePdf(bytes(""))).toBe(false)
    expect(looksLikePdf(bytes("%PD"))).toBe(false)
    expect(looksLikePdf(bytes("%PDX-1.7"))).toBe(false)
    expect(looksLikePdf(bytes("\x89PNG\r\n\x1a\n"))).toBe(false)
    // Too far in to be a PDF's own marker.
    expect(looksLikePdf(bytes(`${" ".repeat(1025)}%PDF-1.7`))).toBe(false)
  })
})

describe("limitsFor", () => {
  it("gives phones and low-memory devices smaller limits", () => {
    expect(limitsFor({ touch: false })).toBe(desktopLimits)
    expect(limitsFor({ touch: false, memory: 8 })).toBe(desktopLimits)
    expect(limitsFor({ touch: false, memory: 4 })).toBe(desktopLimits)
    expect(limitsFor({ touch: false, memory: 2 })).toBe(phoneLimits)
    expect(limitsFor({ touch: true, memory: 8 })).toBe(phoneLimits)
    expect(limitsFor({ touch: true })).toBe(phoneLimits)
    expect(phoneLimits.totalBytes).toBeLessThan(desktopLimits.totalBytes)
    expect(megabytes(desktopLimits.totalBytes)).toBe("500 MB")
  })
})

describe("admit", () => {
  const file = (size: number) => ({ size })
  const { files, fileBytes, totalBytes } = desktopLimits

  it("takes files while there is room", () => {
    expect(admit([], [file(10), file(20)])).toEqual([null, null])
  })

  it("refuses empty and oversized files, and carries on with the rest", () => {
    expect(admit([], [file(0), file(fileBytes + 1), file(5)])).toEqual([
      "This file is empty.",
      "This file is larger than 300 MB.",
      null,
    ])
    expect(admit([], [file(fileBytes)])).toEqual([null])
  })

  it("stops at the file count, counting what is already there", () => {
    const full = Array.from({ length: files - 1 }, () => file(1))
    expect(admit(full, [file(1), file(1)])).toEqual([
      null,
      "Up to 100 files can be merged at once.",
    ])
  })

  it("stops at the total size, and still takes a smaller file after", () => {
    const current = [file(fileBytes)]
    const room = totalBytes - fileBytes
    expect(admit(current, [file(room + 1), file(room), file(1)])).toEqual([
      "Together the files would be larger than 500 MB.",
      null,
      "Together the files would be larger than 500 MB.",
    ])
  })

  it("uses the limits it is given", () => {
    expect(
      admit([], [file(150 * 1024 * 1024), file(90 * 1024 * 1024)], phoneLimits)
    ).toEqual(["This file is larger than 100 MB.", null])
    expect(
      admit(
        [file(90 * 1024 * 1024), file(90 * 1024 * 1024)],
        [file(30 * 1024 * 1024)],
        phoneLimits
      )
    ).toEqual(["Together the files would be larger than 200 MB."])
  })
})

describe("describeSize", () => {
  it("compares the result with what went in", () => {
    expect(describeSize(1000, 800)).toBe("20% smaller than the files together")
    expect(describeSize(1000, 1250)).toBe("25% larger than the files together")
    expect(describeSize(1000, 1000)).toBe("the same size as the files together")
    expect(describeSize(1000, 996)).toBe("the same size as the files together")
    expect(describeSize(1000, 1004)).toBe("the same size as the files together")
  })
})
