// @vitest-environment node
import { readFileSync } from "node:fs"
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { describe, expect, it } from "vitest"
import { CERTIFICATE_PASSWORD, certificateFile } from "@/tests/pdf-certificates"
import { readIdentity, signatureFor } from "./certificate"
import { checkSignature, verdictOf } from "./signatures"
import { readTrusted } from "./trust"
import { coveredBy } from "./sign-bytes"

/** A file of some bytes with room for a signature in its middle, and a signature over the rest. */
async function signedFile(name = "rsa-aes") {
  const file = new TextEncoder().encode("%PDF before <0000> after %%EOF")
  const ranges = [0, 12, 18, file.length - 18]
  const identity = await readIdentity(
    certificateFile(name),
    CERTIFICATE_PASSWORD
  )
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", coveredBy(file, ranges))
  )
  const signature = await signatureFor(identity, digest)
  // The room keeps trailing zeros after the signature.
  const room = new Uint8Array(signature.length + 64)
  room.set(signature)
  return { file, ranges, room }
}

describe("checkSignature", () => {
  it.each(["rsa-aes", "ec-aes"])(
    "finds a signature made with %s intact over the bytes it covers, and names who made it",
    async (name) => {
      const { file, ranges, room } = await signedFile(name)
      expect(await checkSignature(file, ranges, room)).toMatchObject({
        intact: true,
        problem: "",
        signer: { name: `Sam Example (${name.split("-")[0]})` },
      })
    }
  )

  it("finds it broken when a byte it covers was changed", async () => {
    const { file, ranges, room } = await signedFile()
    const changed = file.slice()
    changed[3] = 120
    const checked = await checkSignature(changed, ranges, room)
    expect(checked.intact).toBe(false)
    expect(checked.signer?.name).toBe("Sam Example (rsa)")
    expect(checked.problem).toContain("The file was changed")
    // A byte in the room is not covered: changing it changes nothing.
    const roomy = file.slice()
    roomy[14] = "7".charCodeAt(0)
    expect((await checkSignature(roomy, ranges, room)).intact).toBe(true)
  })

  it("says when the signature cannot be read, or covers what is not there", async () => {
    const { file, ranges, room } = await signedFile()
    expect(await checkSignature(file, ranges, Uint8Array.of(1, 2, 3))).toEqual({
      intact: false,
      signer: null,
      problem: "This signature cannot be read.",
      trust: null,
    })
    for (const bad of [
      [0, 12, 18],
      [1, 12, 18, 10],
      [0, -1, 18, 10],
      [0, 12, 10, 10],
      [0, 12, 18, -1],
      [0, 12, 18, file.length],
    ])
      expect((await checkSignature(file, bad, room)).problem).toBe(
        "What the signature says it covers is not in this file."
      )
    expect(ranges).toHaveLength(4)
  })

  it("does not hold when it leaves out more than its own room", async () => {
    const { file, ranges, room } = await signedFile()
    const wider =
      "It leaves out more of the file than the room for the signature itself, so what it leaves out could have been changed."
    // Leaving out a byte before the room, or after it.
    for (const bad of [
      [0, 11, 18, file.length - 18],
      [0, 12, 19, file.length - 19],
      [0, 12, 13, file.length - 13],
    ])
      expect((await checkSignature(file, bad, room)).problem).toBe(wider)
    // Something other than hex digits in the room.
    const words = file.slice()
    words[14] = "x".charCodeAt(0)
    expect((await checkSignature(words, ranges, room)).problem).toBe(wider)
    // White space between the digits is a hex string all the same.
    const spaced = file.slice()
    spaced[14] = 0x20
    expect((await checkSignature(spaced, ranges, room)).intact).toBe(true)
    const lower = new TextEncoder().encode("%PDF before <a0F9> after %%EOF")
    expect((await checkSignature(lower, ranges, room)).problem).not.toBe(wider)
  })

  it("cannot say who signed, nor find it intact, when the signature carries no certificate", async () => {
    const { file, ranges, room } = await signedFile()
    const info = pkijs.ContentInfo.fromBER(room.slice().buffer)
    const data = new pkijs.SignedData({ schema: info.content })
    data.certificates = undefined
    const bare = new Uint8Array(
      new pkijs.ContentInfo({
        contentType: info.contentType,
        content: data.toSchema(true),
      })
        .toSchema()
        .toBER(false)
    )
    expect(await checkSignature(file, ranges, bare)).toMatchObject({
      intact: false,
      signer: null,
    })
  })
})

describe("trust", () => {
  it("says whether the signer goes back to a certificate trusted, at the time the signature gives", async () => {
    const authority = new Uint8Array(
      readFileSync("tests/fixtures/certificates/test-authority.crt")
    )
    const [trusted] = await readTrusted(authority)
    const { file, ranges, room } = await signedFile()
    const at = new Date("2026-10-15T12:00:00Z")
    expect(
      await checkSignature(file, ranges, room, false, {
        trusted: [trusted.der],
        at,
      })
    ).toMatchObject({
      intact: true,
      trust: { trusted: true, by: "KeepSimp Test Authority", itself: false },
    })
    expect(
      await verdictOf(file, "ETSI.CAdES.detached", ranges, room, {
        trusted: [trusted.der],
        at,
      })
    ).toMatchObject({ trust: { trusted: true } })
    // Trusting none, or a signature that does not hold: nothing is said of trust.
    expect((await checkSignature(file, ranges, room)).trust).toBeNull()
    const changed = file.slice()
    changed[3] = 120
    expect(
      (
        await checkSignature(changed, ranges, room, false, {
          trusted: [trusted.der],
        })
      ).trust
    ).toBeNull()
  })
})

describe("other kinds of signature", () => {
  /** An adbe.pkcs7.sha1 signature: over the SHA-1 digest of the bytes covered, which it carries. */
  async function sha1Signature(file: Uint8Array, ranges: number[]) {
    const identity = await readIdentity(
      certificateFile("rsa-aes"),
      CERTIFICATE_PASSWORD
    )
    const certificates = identity.certificates.map((one) =>
      pkijs.Certificate.fromBER(new Uint8Array(one).buffer)
    )
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-1", coveredBy(file, ranges))
    )
    const data = new pkijs.SignedData({
      version: 1,
      encapContentInfo: new pkijs.EncapsulatedContentInfo({
        eContentType: "1.2.840.113549.1.7.1",
        eContent: new asn1js.OctetString({ valueHex: digest }),
      }),
      signerInfos: [
        new pkijs.SignerInfo({
          version: 1,
          sid: new pkijs.IssuerAndSerialNumber({
            issuer: certificates[0].issuer,
            serialNumber: certificates[0].serialNumber,
          }),
        }),
      ],
      certificates,
    })
    await data.sign(identity.key, 0, "SHA-256")
    return new Uint8Array(
      new pkijs.ContentInfo({
        contentType: "1.2.840.113549.1.7.2",
        content: data.toSchema(true),
      })
        .toSchema()
        .toBER(false)
    )
  }

  it("checks a signature over the SHA-1 digest the signature carries", async () => {
    const file = new TextEncoder().encode("%PDF before <0000> after %%EOF")
    const ranges = [0, 12, 18, file.length - 18]
    const signature = await sha1Signature(file, ranges)
    expect(
      await verdictOf(file, "adbe.pkcs7.sha1", ranges, signature)
    ).toMatchObject({
      checked: true,
      intact: true,
      signer: { name: "Sam Example (rsa)" },
    })
    const changed = file.slice()
    changed[2] = 0
    expect(
      (await verdictOf(changed, "adbe.pkcs7.sha1", ranges, signature)) as {
        intact: boolean
      }
    ).toMatchObject({ intact: false })
    // A detached signature carries no digest: as this kind, it does not hold.
    const { file: other, ranges: otherRanges, room } = await signedFile()
    expect(
      await verdictOf(other, "adbe.pkcs7.sha1", otherRanges, room)
    ).toMatchObject({
      checked: true,
      intact: false,
    })
    expect(
      await verdictOf(other, "adbe.pkcs7.detached", otherRanges, room)
    ).toMatchObject({
      checked: true,
      intact: true,
    })
  })

  it("says which kinds are not checked here", async () => {
    const { file, ranges, room } = await signedFile()
    expect(await verdictOf(file, "ETSI.RFC3161", ranges, room)).toEqual({
      checked: false,
      why: "This is a time stamp on the document, not a signature by a person: it is not checked here.",
    })
    expect(await verdictOf(file, "adbe.x509.rsa_sha1", ranges, room)).toEqual({
      checked: false,
      why: "This kind of signature (adbe.x509.rsa_sha1) is not checked here.",
    })
    expect(await verdictOf(file, "", ranges, room)).toMatchObject({
      why: "This kind of signature (of no stated kind) is not checked here.",
    })
  })
})
