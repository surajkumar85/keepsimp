import { describe, expect, it } from "vitest"
import { keepsEntry, namesIn, RESOURCE_KINDS } from "./resources"

const bytes = (text: string) =>
  Uint8Array.from(text, (letter) => letter.charCodeAt(0))
const names = (text: string) => [...namesIn(bytes(text))].sort()

describe("namesIn", () => {
  it("finds the font, picture and graphics state a page uses", () => {
    expect(
      names("BT /F1 12 Tf (Hello) Tj ET q /GS0 gs 100 0 0 100 0 0 cm /Im3 Do Q")
    ).toEqual(["F1", "GS0", "Im3"])
  })

  it("finds colour spaces, patterns, shadings and marked content", () => {
    expect(
      names(
        "/Cs1 cs /P0 scn /Sh2 sh /OC /MC0 BDC EMC /Artifact <</Type/Pagination>> BDC"
      )
    ).toEqual([
      "Artifact",
      "Cs1",
      "MC0",
      "OC",
      "P0",
      "Pagination",
      "Sh2",
      "Type",
    ])
  })

  it("ends a name at white space and at every delimiter", () => {
    expect(
      names("/A/B /C(text)/D<00>/E[1]/F{}/G%note\n/H\t/I\r/J\f/K\0")
    ).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"])
  })

  it("reads characters written as #xx", () => {
    expect(names("/Im#201 Do /A#2fB Do /#46ont Tf")).toEqual([
      "A/B",
      "Font",
      "Im 1",
    ])
  })

  it("keeps a # that is not followed by two hex digits", () => {
    expect(names("/A#G1 /B# /C#4")).toEqual(["A#G1", "B#", "C#4"])
  })

  it("reads hex digits in either case", () => {
    expect(names("/#4a#4A#6b")).toEqual(["JJk"])
  })

  it("would rather find a name too many than miss one", () => {
    // Inside text and inside an inline picture's data, a "/" still counts.
    expect(names("(see /Im9) Tj BI /W 1 /H 1 ID \x00/Zz \x01 EI")).toEqual([
      "H",
      "Im9",
      "W",
      "Zz",
    ])
  })

  it("keeps bytes above ASCII as they are", () => {
    expect([...namesIn(Uint8Array.from([0x2f, 0xe9, 0x41]))]).toEqual(["éA"])
  })

  it("counts a lone slash as the empty name, which PDF allows", () => {
    expect(names("/ Do /")).toEqual([""])
  })

  it("finds nothing where there is nothing", () => {
    expect(names("")).toEqual([])
    expect(names("q 1 0 0 1 0 0 cm Q")).toEqual([])
  })

  it("adds to names found before", () => {
    const found = namesIn(bytes("/A Do"))
    expect(namesIn(bytes("/B Do"), found)).toBe(found)
    expect([...found]).toEqual(["A", "B"])
  })
})

describe("keepsEntry", () => {
  const used = new Set(["F1", "Im 1"])

  it("keeps what the page names and drops what it does not", () => {
    expect(keepsEntry("F1", used)).toBe(true)
    expect(keepsEntry("F2", used)).toBe(false)
  })

  it("compares names with spaces and other plain characters exactly", () => {
    expect(keepsEntry("Im 1", used)).toBe(true)
    expect(keepsEntry("Im 2", used)).toBe(false)
    expect(keepsEntry("", used)).toBe(false)
  })

  it("always keeps a name that cannot be compared with certainty", () => {
    expect(keepsEntry("Bildé", used)).toBe(true)
    expect(keepsEntry("图1", used)).toBe(true)
  })
})

describe("RESOURCE_KINDS", () => {
  it("lists every kind of resource that is looked up by name", () => {
    expect(RESOURCE_KINDS).toEqual([
      "Font",
      "XObject",
      "ExtGState",
      "ColorSpace",
      "Pattern",
      "Shading",
      "Properties",
    ])
  })
})
