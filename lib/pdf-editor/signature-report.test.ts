import type { Trust } from "./trust"
import { describe, expect, it } from "vitest"
import {
  changesSaid,
  readPdfDate,
  signerSaid,
  verdictSaid,
  type Changes,
  type FoundSignature,
} from "./signature-report"

const signer = {
  name: "Sam Example",
  email: "",
  organisation: "",
  issuer: "KeepSimp Test Authority",
  selfSigned: false,
  validFrom: "2026-01-01T00:00:00.000Z",
  validTo: "2046-01-01T00:00:00.000Z",
  key: "RSA 2048",
}
const found = (change: Partial<FoundSignature> = {}): FoundSignature => ({
  field: "Signature1",
  page: 0,
  shown: true,
  kind: "ETSI.CAdES.detached",
  time: "2026-10-14T12:00:00.000Z",
  name: "",
  reason: "",
  location: "",
  whole: true,
  verdict: { checked: true, intact: true, signer, problem: "", trust: null },
  changes: null,
  ...change,
})
const none: Changes = {
  updates: 1,
  pagesAdded: 0,
  pagesRemoved: 0,
  pagesChanged: [],
  commentsAdded: 0,
  commentsRemoved: 0,
  fieldsChanged: [],
  signaturesAdded: [],
  detailsChanged: false,
}

describe("readPdfDate", () => {
  it("reads a PDF's moments, with or without their zone and parts", () => {
    expect(readPdfDate("D:20261014173005+05'30'")).toBe(
      "2026-10-14T12:00:05.000Z"
    )
    expect(readPdfDate("D:20261014080005-04'00'")).toBe(
      "2026-10-14T12:00:05.000Z"
    )
    expect(readPdfDate("D:20261014120005Z")).toBe("2026-10-14T12:00:05.000Z")
    expect(readPdfDate("20261014120005Z00'00'")).toBe(
      "2026-10-14T12:00:05.000Z"
    )
    expect(readPdfDate("D:2026")).toBe("2026-01-01T00:00:00.000Z")
    expect(readPdfDate("D:20261014+01")).toBe("2026-10-13T23:00:00.000Z")
    expect(readPdfDate("D:20261014120000+")).toBe("2026-10-14T12:00:00.000Z")
    expect(readPdfDate("yesterday")).toBeNull()
    expect(readPdfDate("D:20261399")).toBeNull()
  })
})

describe("changesSaid", () => {
  it("says what was added after a signature", () => {
    expect(changesSaid(none)).toBe(
      "The file was added to once after this signature, without changing what any page shows, any field or any comment."
    )
    expect(
      changesSaid({
        updates: 2,
        pagesAdded: 1,
        pagesRemoved: 2,
        pagesChanged: [1],
        commentsAdded: 1,
        commentsRemoved: 3,
        fieldsChanged: ["name"],
        signaturesAdded: ["Second"],
        detailsChanged: false,
      })
    ).toBe(
      "The file was added to 2 times after this signature: a signature was added (“Second”); a field was filled in or changed (“name”); 1 comment added; 3 comments taken away; 1 page added; 2 pages taken out; page 2 looks different."
    )
    const many = changesSaid({
      ...none,
      pagesChanged: Array.from({ length: 10 }, (_, at) => at),
      fieldsChanged: ["a", "b", "c", "d", "e", "f", "g"],
      signaturesAdded: ["x", "y"],
    })
    expect(many).toContain("2 signatures were added (“x”, “y”)")
    expect(many).toContain(
      "7 fields were filled in or changed (“a”, “b”, “c”, “d”, “e”, “f” and more)"
    )
    expect(many).toContain(
      "pages 1, 2, 3, 4, 5, 6, 7, 8 and 2 more look different"
    )
    expect(changesSaid({ ...none, detailsChanged: true })).toBe(
      "The file was added to once after this signature: what this signature says of itself (its time, name, reason or place) was written anew, and is shown here as it was signed."
    )
  })
})

describe("verdictSaid and signerSaid", () => {
  it("says whether a signature holds, over the whole file or as it was signed", () => {
    expect(verdictSaid(found())).toEqual({
      text: "This signature holds: nothing in the file has changed since it was signed.",
      good: true,
    })
    expect(verdictSaid(found({ whole: false })).text).toBe(
      "This signature holds over the file as it was signed."
    )
    expect(
      verdictSaid(
        found({
          verdict: {
            checked: true,
            intact: false,
            signer,
            problem: "It was changed.",
            trust: null,
          },
        })
      )
    ).toEqual({
      text: "This signature does not hold. It was changed.",
      good: false,
    })
    expect(
      verdictSaid(
        found({ verdict: { checked: false, why: "Not checked here." } })
      )
    ).toEqual({ text: "Not checked here.", good: false })
  })

  it("names the signer, and says when the certificate was not valid at the time given", () => {
    expect(signerSaid(found())).toEqual([
      "Signed with the certificate of Sam Example, issued by KeepSimp Test Authority.",
    ])
    expect(
      signerSaid(
        found({
          verdict: {
            checked: true,
            intact: true,
            signer: { ...signer, selfSigned: true },
            problem: "",
            trust: null,
          },
        })
      )[0]
    ).toContain("which signed itself")
    expect(
      signerSaid(found({ time: "2050-01-01T00:00:00.000Z" }))[1]
    ).toContain("was not valid at the time")
    expect(
      signerSaid(found({ time: "2020-01-01T00:00:00.000Z" }))
    ).toHaveLength(2)
    expect(signerSaid(found({ time: null }))).toHaveLength(1)
    expect(
      signerSaid(found({ name: "Ada", verdict: { checked: false, why: "x" } }))
    ).toEqual(["It gives the name Ada."])
    expect(
      signerSaid(
        found({
          verdict: {
            checked: true,
            intact: false,
            signer: null,
            problem: "",
            trust: null,
          },
        })
      )
    ).toEqual([])
  })

  it("says whether a certificate the person trusts vouches for the signer", () => {
    const trusting = (trust: Trust, selfSigned = false) =>
      signerSaid(
        found({
          time: null,
          verdict: {
            checked: true,
            intact: true,
            signer: { ...signer, selfSigned },
            problem: "",
            trust,
          },
        })
      )
    expect(
      trusting({ trusted: true, by: "KeepSimp Test Authority", itself: false })
    ).toEqual([
      "Signed with the certificate of Sam Example, issued by KeepSimp Test Authority.",
      "It goes back to “KeepSimp Test Authority”, a certificate you trust.",
    ])
    expect(
      trusting({ trusted: true, by: "Sam Example", itself: true }, true)
    ).toEqual([
      "Signed with the certificate of Sam Example, which signed itself.",
      "It is a certificate you trust.",
    ])
    expect(trusting({ trusted: false, why: "Not yours." }, true)).toEqual([
      "Signed with the certificate of Sam Example, which signed itself: nobody vouches for that name.",
      "Not yours.",
    ])
  })
})
