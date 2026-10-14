// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest"
import {
  appearanceLines,
  BOX,
  boxOn,
  dateSaid,
  daySaid,
  LONGEST_SAID,
  pdfDate,
  readCertifyOptions,
  validityProblem,
} from "./certify"

const zone = process.env.TZ
afterEach(() => {
  process.env.TZ = zone
})

describe("readCertifyOptions", () => {
  it("takes where a signature shows and what it says, cleaned", () => {
    expect(
      readCertifyOptions({
        place: { kind: "none" },
        reason: "  I agree\u0007 to\nthis ",
        location: "London",
      })
    ).toEqual({
      place: { kind: "none" },
      reason: "I agree to this",
      location: "London",
    })
    expect(
      readCertifyOptions({
        place: { kind: "box", page: 2 },
        reason: "",
        location: "",
      })
    ).toEqual({ place: { kind: "box", page: 2 }, reason: "", location: "" })
    expect(
      readCertifyOptions({
        place: { kind: "field", name: " Signature1 " },
        reason: "",
        location: "",
      })
    ).toEqual({
      place: { kind: "field", name: "Signature1" },
      reason: "",
      location: "",
    })
  })

  it("refuses what is not such", () => {
    const fine = { place: { kind: "none" }, reason: "", location: "" }
    for (const bad of [
      null,
      "x",
      { ...fine, reason: 1 },
      { ...fine, location: undefined },
      { ...fine, reason: "x".repeat(LONGEST_SAID + 1) },
      { ...fine, location: "x".repeat(LONGEST_SAID + 1) },
      { ...fine, place: null },
      { ...fine, place: "none" },
      { ...fine, place: { kind: "box", page: -1 } },
      { ...fine, place: { kind: "box", page: 1.5 } },
      { ...fine, place: { kind: "box", page: 1e5 } },
      { ...fine, place: { kind: "field", name: "" } },
      { ...fine, place: { kind: "field", name: 3 } },
      { ...fine, place: { kind: "field", name: "x".repeat(LONGEST_SAID + 1) } },
      { ...fine, place: { kind: "corner" } },
    ])
      expect(readCertifyOptions(bad)).toBeNull()
  })
})

describe("dates", () => {
  const moment = new Date("2026-10-14T12:00:05Z")

  it("writes a moment in the time where it is signed, ahead of UTC or behind it", () => {
    process.env.TZ = "Asia/Kolkata"
    expect(pdfDate(moment)).toBe("D:20261014173005+05'30'")
    expect(dateSaid(moment)).toBe("2026-10-14 17:30 +05:30")
    process.env.TZ = "America/New_York"
    expect(pdfDate(moment)).toBe("D:20261014080005-04'00'")
    expect(dateSaid(moment)).toBe("2026-10-14 08:00 -04:00")
    process.env.TZ = "UTC"
    expect(pdfDate(moment)).toBe("D:20261014120005+00'00'")
  })

  it("says the day a certificate's date falls on", () => {
    expect(daySaid("2046-10-14T23:30:00.000Z")).toBe("14 October 2046")
  })
})

describe("validityProblem", () => {
  const signer = {
    name: "Sam",
    email: "",
    organisation: "",
    issuer: "Sam",
    selfSigned: true,
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: "2027-01-01T00:00:00.000Z",
    key: "RSA 2048",
  }
  it("lets a certificate sign only while it is valid", () => {
    expect(validityProblem(signer, new Date("2026-06-01"))).toBe("")
    expect(validityProblem(signer, new Date("2025-06-01"))).toBe(
      "This certificate is not valid until 1 January 2026: a signature made with it now would not hold."
    )
    expect(validityProblem(signer, new Date("2027-06-01"))).toBe(
      "This certificate expired on 1 January 2027: a signature made with it would not hold."
    )
  })
})

describe("what shows", () => {
  it("says who signed and when, with a reason and a place when given", () => {
    process.env.TZ = "UTC"
    const date = new Date("2026-10-14T12:00:00Z")
    expect(
      appearanceLines({ name: "Sam" }, date, { reason: "", location: "" })
    ).toEqual(["Digitally signed by Sam", "Date: 2026-10-14 12:00 +00:00"])
    expect(
      appearanceLines({ name: "Sam" }, date, {
        reason: "Approved",
        location: "Leeds",
      })
    ).toEqual([
      "Digitally signed by Sam",
      "Date: 2026-10-14 12:00 +00:00",
      "Reason: Approved",
      "Location: Leeds",
    ])
  })

  it("puts a box at the foot of a page, on the right, smaller on a small page", () => {
    expect(boxOn({ width: 612, height: 792 })).toEqual({
      x: 612 - BOX.margin - BOX.width,
      y: 792 - BOX.margin - BOX.height,
      width: BOX.width,
      height: BOX.height,
    })
    expect(boxOn({ width: 200, height: 100 })).toEqual({
      x: 10,
      y: 26,
      width: 180,
      height: 64,
    })
  })
})
