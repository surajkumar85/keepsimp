import { describe, expect, it } from "vitest"
import {
  OCR_FILES,
  OCR_LANGUAGES,
  OCR_PACKAGES,
  preferredLanguage,
  sizeSaid,
} from "./ocr-files"

describe("the languages offered", () => {
  it("are listed once each, by their English names, each with its file", () => {
    const codes = OCR_LANGUAGES.map((language) => language.code)
    expect(new Set(codes).size).toBe(codes.length)
    const names = OCR_LANGUAGES.map((language) => language.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    for (const { code } of OCR_LANGUAGES) {
      expect(OCR_FILES[`${code}.traineddata.gz`]).toBe(
        `@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`
      )
      expect(OCR_PACKAGES).toContainEqual([
        `@tesseract.js-data/${code}`,
        "1.0.0",
      ])
    }
    expect(OCR_FILES["worker.min.js"]).toBe("tesseract.js/dist/worker.min.js")
  })
})

describe("preferredLanguage", () => {
  it("takes the first language the browser's user reads that is offered", () => {
    expect(preferredLanguage(["de-DE", "en-US"])).toBe("deu")
    expect(preferredLanguage(["sw", "fr-CA"])).toBe("fra")
    expect(preferredLanguage(["zh-TW"])).toBe("chi_tra")
    expect(preferredLanguage(["zh-Hant-HK"])).toBe("chi_tra")
    expect(preferredLanguage(["zh-CN"])).toBe("chi_sim")
    expect(preferredLanguage(["zh"])).toBe("chi_sim")
    expect(preferredLanguage(["NB-no"])).toBe("nor")
    // A tag only begins like another's: "english" is not "en".
    expect(preferredLanguage(["english", "xx"])).toBe("eng")
    expect(preferredLanguage([])).toBe("eng")
  })
})

describe("sizeSaid", () => {
  it("says a size in kilobytes or megabytes", () => {
    expect(sizeSaid(2_952_873)).toBe("3.0 MB")
    expect(sizeSaid(690_000)).toBe("690 KB")
    expect(sizeSaid(200)).toBe("1 KB")
  })
})
