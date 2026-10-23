import { describe, expect, it } from "vitest"
import {
  downloadChanged,
  downloadGroups,
  downloadSummary,
  writtenAfter,
  type DownloadChoices,
} from "./download-summary"
import { CLEAN_NOTHING } from "./redact"

const usual: DownloadChoices = {
  signed: false,
  signedHow: "keep",
  keepEditable: false,
  comments: "keep",
  commentCount: 0,
  fields: "keep",
  fieldCount: 0,
  clean: CLEAN_NOTHING,
  protect: false,
  certify: false,
  signer: "",
}

describe("downloadGroups", () => {
  it("offers everything but the signature for a file that is not signed", () => {
    expect(downloadGroups(usual)).toEqual([
      "added",
      "leave",
      "certificate",
      "password",
    ])
    expect(writtenAfter(usual)).toBe(false)
  })

  it("offers only the signature and the certificate when written after a signature", () => {
    const signed = { ...usual, signed: true }
    expect(writtenAfter(signed)).toBe(true)
    expect(downloadGroups(signed)).toEqual(["signature", "certificate"])
  })

  it("offers everything again when a signed file is written anew", () => {
    const anew = { ...usual, signed: true, signedHow: "anew" as const }
    expect(writtenAfter(anew)).toBe(false)
    expect(downloadGroups(anew)).toEqual([
      "signature",
      "added",
      "leave",
      "certificate",
      "password",
    ])
  })
})

describe("downloadSummary", () => {
  it("says what becomes of a signature", () => {
    expect(downloadSummary("signature", usual)).toBe(
      "Kept valid · changes written after it"
    )
    expect(downloadSummary("signature", { ...usual, signedHow: "anew" })).toBe(
      "Written anew · the signature will not hold"
    )
  })

  it("names comments and fields only when the file has them", () => {
    expect(downloadSummary("added", usual)).toBe("Part of the page")
    expect(
      downloadSummary("added", {
        ...usual,
        keepEditable: true,
        commentCount: 2,
        comments: "flatten",
        fieldCount: 3,
        fields: "flatten",
      })
    ).toBe("Kept editable · comments drawn in · fields drawn in")
    expect(
      downloadSummary("added", {
        ...usual,
        commentCount: 1,
        comments: "remove",
        fieldCount: 1,
      })
    ).toBe("Part of the page · comments left out · fields kept")
    expect(downloadSummary("added", { ...usual, commentCount: 1 })).toBe(
      "Part of the page · comments kept"
    )
  })

  it("lists what is left out", () => {
    expect(downloadSummary("leave", usual)).toBe("Nothing left out")
    expect(
      downloadSummary("leave", {
        ...usual,
        clean: { ...CLEAN_NOTHING, scripts: true },
      })
    ).toBe("Scripts left out")
    expect(
      downloadSummary("leave", {
        ...usual,
        clean: { details: true, attachments: false, scripts: true },
      })
    ).toBe("Details and scripts left out")
    expect(
      downloadSummary("leave", {
        ...usual,
        clean: { details: true, attachments: true, scripts: true },
      })
    ).toBe("Details, attached files and scripts left out")
  })

  it("says whether the download is signed with a certificate", () => {
    expect(downloadSummary("certificate", usual)).toBe(
      "Not signed with a certificate"
    )
    expect(downloadSummary("certificate", { ...usual, certify: true })).toBe(
      "Choose a certificate to sign with"
    )
    expect(
      downloadSummary("certificate", {
        ...usual,
        certify: true,
        signer: "Ada Lovelace",
      })
    ).toBe("Signed with the certificate of Ada Lovelace")
  })

  it("says whether the result is locked", () => {
    expect(downloadSummary("password", usual)).toBe("No password")
    expect(downloadSummary("password", { ...usual, protect: true })).toBe(
      "Locked with a password"
    )
  })
})

describe("downloadChanged", () => {
  it("finds nothing changed in the usual choices", () => {
    for (const group of [
      "signature",
      "added",
      "leave",
      "certificate",
      "password",
    ] as const)
      expect(downloadChanged(group, usual)).toBe(false)
  })

  it("finds each group changed", () => {
    expect(downloadChanged("signature", { ...usual, signedHow: "anew" })).toBe(
      true
    )
    expect(downloadChanged("added", { ...usual, keepEditable: true })).toBe(
      true
    )
    expect(
      downloadChanged("leave", {
        ...usual,
        clean: { ...CLEAN_NOTHING, details: true },
      })
    ).toBe(true)
    expect(downloadChanged("certificate", { ...usual, certify: true })).toBe(
      true
    )
    expect(downloadChanged("password", { ...usual, protect: true })).toBe(true)
  })

  it("counts comments and fields only when the file has them", () => {
    const flattened = {
      ...usual,
      comments: "flatten" as const,
      fields: "flatten" as const,
    }
    expect(downloadChanged("added", flattened)).toBe(false)
    expect(downloadChanged("added", { ...flattened, commentCount: 1 })).toBe(
      true
    )
    expect(downloadChanged("added", { ...flattened, fieldCount: 1 })).toBe(true)
  })
})
