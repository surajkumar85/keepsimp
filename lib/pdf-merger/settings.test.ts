import { describe, expect, it } from "vitest"
import {
  admit,
  defaultSettings,
  describeSize,
  entryName,
  desktopLimits,
  limitsFor,
  limitsReaders,
  looksLikePdf,
  megabytes,
  outputName,
  permissionBits,
  phoneLimits,
  refusal,
  settingsKey,
  settingsProblem,
  type MergeSettings,
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

describe("settingsProblem", () => {
  const problem = (change: Partial<MergeSettings>) =>
    settingsProblem({ ...defaultSettings, ...change })

  it("accepts the defaults and ordinary details", () => {
    expect(problem({})).toBeNull()
    expect(
      problem({ title: "Annual report", author: "Ada", keywords: "a, b" })
    ).toBeNull()
    expect(problem({ subject: "x".repeat(500) })).toBeNull()
  })

  it("keeps details to a sensible length", () => {
    expect(problem({ title: "x".repeat(501) })).toBe(
      "Keep the title under 500 characters."
    )
    expect(problem({ author: "x".repeat(501) })).toMatch(/the author/)
    expect(problem({ subject: "x".repeat(501) })).toMatch(/the subject/)
    expect(problem({ keywords: "x".repeat(501) })).toMatch(/the keywords/)
  })

  it("asks for a password only when one is wanted", () => {
    expect(problem({ password: "" })).toBeNull()
    expect(problem({ protect: true })).toBe(
      "Enter a password for the merged PDF, or turn the password off."
    )
    expect(problem({ protect: true, password: "hunter2" })).toBeNull()
    expect(problem({ protect: true, password: "a, b = c" })).toBeNull()
  })

  it("keeps passwords within what the lock can take", () => {
    expect(problem({ protect: true, password: "x".repeat(127) })).toBeNull()
    expect(problem({ protect: true, password: "x".repeat(128) })).toMatch(
      /at most 127 bytes/
    )
    // Letters outside plain ASCII take more than one byte each.
    expect(problem({ protect: true, password: "é".repeat(64) })).toMatch(
      /at most 127 bytes/
    )
    expect(
      problem({ protect: true, password: "a", ownerPassword: "y".repeat(128) })
    ).toMatch(/at most 127 bytes/)
    // A long password matters only when it is used.
    expect(problem({ password: "x".repeat(300) })).toBeNull()
  })

  it("checks where page numbers start, when there are any", () => {
    expect(problem({ numbersFrom: NaN })).toBeNull()
    expect(problem({ numbers: "number", numbersFrom: 0 })).toBeNull()
    expect(problem({ numbers: "of", numbersFrom: 99_999 })).toBeNull()
    for (const from of [-1, 1.5, NaN, 100_000])
      expect(problem({ numbers: "number", numbersFrom: from }), `${from}`).toBe(
        "Start page numbers at a whole number from 0 to 99,999."
      )
  })

  it("wants the second password to be a different one", () => {
    expect(
      problem({ protect: true, password: "same", ownerPassword: "same" })
    ).toBe("The second password must differ from the first, or be left empty.")
    expect(
      problem({ protect: true, password: "one", ownerPassword: "two" })
    ).toBeNull()
  })
})

describe("permissionBits and limitsReaders", () => {
  const all = { allowPrint: true, allowCopy: true, allowChanges: true }
  const none = { allowPrint: false, allowCopy: false, allowChanges: false }

  it("sets the bits a PDF reader looks at", () => {
    // Printing (two bits), copying, the four kinds of change, and reading aloud.
    expect(permissionBits(all)).toBe(-4)
    expect(permissionBits(none)).toBe(-3392)
    expect(permissionBits({ ...none, allowPrint: true }) & (4 | 2048)).toBe(
      4 | 2048
    )
    expect(permissionBits({ ...none, allowCopy: true }) & 16).toBe(16)
    expect(
      permissionBits({ ...none, allowChanges: true }) & (8 | 32 | 256 | 1024)
    ).toBe(8 | 32 | 256 | 1024)
    // Reading aloud is never taken away, and the two lowest bits are never set.
    expect(permissionBits(none) & 512).toBe(512)
    expect(permissionBits(all) & 3).toBe(0)
  })

  it("knows when a lock would limit its readers", () => {
    expect(limitsReaders(defaultSettings)).toBe(false)
    expect(limitsReaders({ ...defaultSettings, allowCopy: false })).toBe(false)
    expect(
      limitsReaders({ ...defaultSettings, protect: true, password: "x" })
    ).toBe(false)
    expect(
      limitsReaders({ ...defaultSettings, protect: true, allowPrint: false })
    ).toBe(true)
  })
})

describe("settingsKey", () => {
  const key = (change: Partial<MergeSettings>) =>
    settingsKey({ ...defaultSettings, ...change })
  const base = key({})

  it("changes with what changes the result, not with the file name", () => {
    expect(key({ name: "other" })).toBe(base)
    for (const change of [
      { bookmarks: "none" },
      { contents: "files" },
      { forms: "flatten" },
      { labels: "keep" },
      { attachments: false },
      { title: "T" },
      { author: "A" },
      { subject: "S" },
      { keywords: "K" },
      { protect: true },
      { duplex: true },
      { sheet: "a4" },
      { footerName: true },
      { numbers: "of" },
    ] as Partial<MergeSettings>[])
      expect(key(change), JSON.stringify(change)).not.toBe(base)
  })

  it("ignores options that are not in use", () => {
    // A cover only matters with a contents page.
    expect(key({ cover: true })).toBe(base)
    expect(key({ contents: "files", cover: true })).not.toBe(
      key({ contents: "files" })
    )
    // Enlarging only matters with one page size, and number options with numbers.
    expect(key({ enlarge: false })).toBe(base)
    expect(key({ sheet: "a4", enlarge: false })).not.toBe(key({ sheet: "a4" }))
    expect(key({ numbersAt: "left" })).toBe(base)
    expect(key({ numbersFrom: 7 })).toBe(base)
    expect(key({ numbers: "number", numbersAt: "left" })).not.toBe(
      key({ numbers: "number" })
    )
    expect(key({ numbers: "number", numbersFrom: 7 })).not.toBe(
      key({ numbers: "number" })
    )
    // The lock's details only matter with a lock.
    for (const change of [
      { password: "x" },
      { ownerPassword: "y" },
      { allowPrint: false },
      { allowCopy: false },
      { allowChanges: false },
    ] as Partial<MergeSettings>[]) {
      expect(key(change), JSON.stringify(change)).toBe(base)
      expect(
        key({ protect: true, ...change }),
        JSON.stringify(change)
      ).not.toBe(key({ protect: true }))
    }
  })
})

describe("refusal", () => {
  it("says how to get a document in: as a PDF", () => {
    for (const name of [
      "letter.docx",
      "old.DOC",
      "sums.xlsx",
      "slides.pptx",
      "notes.odt",
      "book.epub",
      "readme.txt",
      "page.html",
      "plan.pages",
    ])
      expect(refusal(name), name).toBe(
        `${name} is not a PDF. Save or export it as a PDF first, then add that.`
      )
  })

  it("says plainly that anything else is not accepted", () => {
    for (const name of ["archive.zip", "song.mp3", "noextension", "docx"])
      expect(refusal(name), name).toBe(`${name} is not a PDF or a picture.`)
  })
})
