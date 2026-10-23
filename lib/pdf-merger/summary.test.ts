import { describe, expect, it } from "vitest"
import { changedGroups, resetOf } from "@/lib/settings-groups"
import { defaultSettings, type MergeSettings } from "./settings"
import {
  capital,
  listed,
  lockSummary,
  MERGE_GROUPS,
  mergeSummary,
  pictureSummary,
} from "./summary"

const with_ = (change: Partial<MergeSettings>) => ({
  ...defaultSettings,
  ...change,
})

describe("merger settings groups", () => {
  it("finds the groups that differ and puts one back", () => {
    expect(
      changedGroups(defaultSettings, defaultSettings, MERGE_GROUPS)
    ).toEqual([])
    const changed = with_({ sheet: "a4", protect: true, password: "x" })
    expect(changedGroups(changed, defaultSettings, MERGE_GROUPS)).toEqual([
      "printing",
      "password",
    ])
    expect(resetOf(defaultSettings, MERGE_GROUPS.printing)).toEqual({
      duplex: false,
      sheet: "keep",
      enlarge: true,
    })
  })

  it("leaves the file name out of every group", () => {
    expect(Object.values(MERGE_GROUPS).flat()).not.toContain("name")
  })
})

describe("mergeSummary", () => {
  it("says the usual settings plainly", () => {
    expect(mergeSummary("contents", defaultSettings)).toBe(
      "Bookmarks under each file · no contents page"
    )
    expect(mergeSummary("fields", defaultSettings)).toBe("Fields kept")
    expect(mergeSummary("labels", defaultSettings)).toBe("Counted from 1")
    expect(mergeSummary("attachments", defaultSettings)).toBe(
      "Attached files kept"
    )
    expect(mergeSummary("printing", defaultSettings)).toBe(
      "Page sizes as they are"
    )
    expect(mergeSummary("footer", defaultSettings)).toBe("No footer")
    expect(mergeSummary("details", defaultSettings)).toBe("Nothing added")
    expect(mergeSummary("password", defaultSettings)).toBe("No password")
  })

  it("says bookmarks and a contents page", () => {
    expect(
      mergeSummary("contents", with_({ bookmarks: "keep", contents: "files" }))
    ).toBe("Every bookmark kept · contents by file name")
    expect(
      mergeSummary(
        "contents",
        with_({ bookmarks: "files", contents: "titles", cover: true })
      )
    ).toBe("One bookmark per file · contents by title · after a cover")
    // A cover means nothing without a contents page.
    expect(
      mergeSummary("contents", with_({ bookmarks: "none", cover: true }))
    ).toBe("No bookmarks · no contents page")
  })

  it("says what happens to fields, numbers and attachments", () => {
    expect(mergeSummary("fields", with_({ forms: "join" }))).toBe(
      "Fields of the same name joined"
    )
    expect(mergeSummary("fields", with_({ forms: "flatten" }))).toBe(
      "Fields flattened"
    )
    expect(mergeSummary("fields", with_({ forms: "remove" }))).toBe(
      "Fields taken out"
    )
    expect(mergeSummary("labels", with_({ labels: "keep" }))).toBe(
      "Each file's own numbers"
    )
    expect(mergeSummary("attachments", with_({ attachments: false }))).toBe(
      "Attached files left out"
    )
  })

  it("says how the result is made ready for paper", () => {
    expect(
      mergeSummary("printing", with_({ sheet: "a4", enlarge: false }))
    ).toBe("Every page on A4 · small pages not enlarged")
    expect(mergeSummary("printing", with_({ sheet: "letter" }))).toBe(
      "Every page on Letter"
    )
    expect(
      mergeSummary("printing", with_({ sheet: "first", duplex: true }))
    ).toBe("Every page like the first · double-sided")
    expect(
      mergeSummary("printing", with_({ sheet: "largest", enlarge: false }))
    ).toBe("Every page like the largest · small pages not enlarged")
    // Enlarging means nothing while pages keep their sizes.
    expect(mergeSummary("printing", with_({ enlarge: false }))).toBe(
      "Page sizes as they are"
    )
  })

  it("says what the footer holds", () => {
    expect(mergeSummary("footer", with_({ footerName: true }))).toBe(
      "File names"
    )
    expect(mergeSummary("footer", with_({ numbers: "number" }))).toBe(
      "Page numbers in the centre"
    )
    expect(
      mergeSummary(
        "footer",
        with_({
          footerName: true,
          numbers: "of",
          numbersAt: "right",
          numbersFrom: 5,
        })
      )
    ).toBe("File names · “3 of 12” numbers on the right · from 5")
    // A start that is not yet a number is left out; the page says why.
    expect(
      mergeSummary(
        "footer",
        with_({ numbers: "number", numbersAt: "left", numbersFrom: NaN })
      )
    ).toBe("Page numbers on the left")
    // A start without numbers means nothing.
    expect(mergeSummary("footer", with_({ numbersFrom: 9 }))).toBe("No footer")
  })

  it("says the details given", () => {
    expect(
      mergeSummary(
        "details",
        with_({ title: " The book ", author: "Ada", keywords: "engines" })
      )
    ).toBe("“The book” · by Ada · keywords")
    expect(
      mergeSummary("details", with_({ author: "  ", subject: "Engines" }))
    ).toBe("A subject")
    expect(mergeSummary("details", with_({ author: "Ada" }))).toBe("By Ada")
  })

  it("says the password and what it bars", () => {
    expect(mergeSummary("password", with_({ protect: true }))).toBe(
      "A password is still to be typed"
    )
    expect(
      mergeSummary("password", with_({ protect: true, password: "x" }))
    ).toBe("Locked with a password")
    expect(
      lockSummary({
        protect: true,
        password: "x",
        allowPrint: false,
        allowCopy: true,
        allowChanges: true,
      })
    ).toBe("Locked with a password · no printing")
    expect(
      lockSummary({
        protect: true,
        password: "x",
        allowPrint: false,
        allowCopy: false,
        allowChanges: false,
      })
    ).toBe("Locked with a password · no printing, copying or changes")
  })
})

describe("pictureSummary", () => {
  it("says where pictures go", () => {
    expect(pictureSummary("previous", "small")).toBe(
      "Like the page before · small margin"
    )
    expect(pictureSummary("fit", "none")).toBe("Each page fits its picture")
    expect(pictureSummary("a4", "none")).toBe("On A4 · no margin")
    expect(pictureSummary("letter", "normal")).toBe("On Letter · normal margin")
  })
})

describe("words", () => {
  it("lists and capitalises", () => {
    expect(listed([])).toBe("")
    expect(listed(["a"])).toBe("a")
    expect(listed(["a", "b"])).toBe("a and b")
    expect(listed(["a", "b", "c"], "or")).toBe("a, b or c")
    expect(capital("")).toBe("")
    expect(capital("page")).toBe("Page")
  })
})
