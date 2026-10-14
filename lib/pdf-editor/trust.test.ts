// @vitest-environment node
import { readFileSync } from "node:fs"
import * as pkijs from "pkijs"
import { describe, expect, it } from "vitest"
import { CERTIFICATE_PASSWORD } from "@/tests/pdf-certificates"
import { readIdentity } from "./certificate"
import { MOST_TRUSTED, readTrusted, trustOf, TrustProblem } from "./trust"

/** A file of the trust fixtures (`tests/fixtures/trust/make.sh`). */
const file = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/trust/${name}`))
/** The DER of a certificate fixture. */
const der = async (name: string) => (await readTrusted(file(name)))[0].der
const certificate = (bytes: Uint8Array) =>
  pkijs.Certificate.fromBER(bytes.slice().buffer)

/** A signer of the fixtures: their certificate, and those their .p12 carries. */
async function signer(name: string) {
  const identity = await readIdentity(file(`${name}.p12`), CERTIFICATE_PASSWORD)
  const [own, ...carried] = identity.certificates.map(certificate)
  return { own, carried }
}

const AT = new Date("2026-10-15T12:00:00Z")

describe("readTrusted", () => {
  it("reads a certificate in PEM or DER, with its name, issuer, end and fingerprint", async () => {
    const [pem] = await readTrusted(file("root.crt"))
    const [binary] = await readTrusted(file("root.der"))
    expect(pem).toMatchObject({
      name: "KeepSimp Trust Root",
      issuer: "KeepSimp Trust Root",
      validTo: "2046-01-01T00:00:00.000Z",
    })
    expect(pem.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(binary.fingerprint).toBe(pem.fingerprint)
    expect(binary.der).toEqual(pem.der)
    const [intermediate] = await readTrusted(file("intermediate.crt"))
    expect(intermediate.issuer).toBe("KeepSimp Trust Root")
  })

  it("reads every certificate of a PEM file, once each", async () => {
    const two = await readTrusted(file("two-roots.crt"))
    expect(two.map((one) => one.name)).toEqual([
      "KeepSimp Trust Root",
      "KeepSimp Other Root",
    ])
    const text = new TextDecoder().decode(file("root.crt"))
    const twice = new TextEncoder().encode(`${text}\n${text}`)
    expect(await readTrusted(twice)).toHaveLength(1)
    // At most so many from one file.
    const many = new TextEncoder().encode(
      Array.from({ length: MOST_TRUSTED + 5 }, () => text).join("\n")
    )
    expect(await readTrusted(many)).toHaveLength(1)
  })

  it("refuses a file that holds no certificate, a .p12 among them", async () => {
    const said =
      "This file holds no certificate that can be read. Choose a certificate file (.cer, .crt, .der or .pem), not a .p12 or .pfx."
    for (const bytes of [
      new TextEncoder().encode("not a certificate"),
      file("signer.p12"),
      new TextEncoder().encode(
        "-----BEGIN CERTIFICATE-----\n!!!\n-----END CERTIFICATE-----"
      ),
      new TextEncoder().encode(
        "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----"
      ),
    ]) {
      const refused = readTrusted(bytes)
      await expect(refused).rejects.toBeInstanceOf(TrustProblem)
      await expect(refused).rejects.toThrow(said)
    }
  })
})

describe("trustOf", () => {
  it("trusts a signer whose certificate goes back to one trusted, through those the signature carries", async () => {
    const { own, carried } = await signer("signer")
    expect(await trustOf(own, carried, [await der("root.crt")], AT)).toEqual({
      trusted: true,
      by: "KeepSimp Trust Root",
      itself: false,
    })
    // Trusting the intermediate is enough, as is trusting the signer.
    expect(
      await trustOf(own, carried, [await der("intermediate.crt")], AT)
    ).toMatchObject({ trusted: true, by: "KeepSimp Trust Intermediate" })
    expect(await trustOf(own, carried, [await der("signer.crt")], AT)).toEqual({
      trusted: true,
      by: "Robin Trust",
      itself: true,
    })
    // An issuer missing from the signature may be one trusted.
    expect(
      await trustOf(
        own,
        [],
        [await der("intermediate.crt"), await der("root.crt")],
        AT
      )
    ).toMatchObject({ trusted: true, by: "KeepSimp Trust Intermediate" })
  })

  it("says where the chain ends when no certificate trusted is on it", async () => {
    const { own, carried } = await signer("signer")
    const other = [await der("other-root.crt"), Uint8Array.of(1, 2, 3)]
    expect(await trustOf(own, carried, other, AT)).toEqual({
      trusted: false,
      why: "It goes back to “KeepSimp Trust Root”, which is not among the certificates you trust and is not in the signature.",
    })
    expect(
      await trustOf(
        own,
        [...carried, certificate(await der("root.crt"))],
        other,
        AT
      )
    ).toEqual({
      trusted: false,
      why: "It goes back to “KeepSimp Trust Root”, which is not among the certificates you trust.",
    })
    expect(await trustOf(own, [], other, AT)).toEqual({
      trusted: false,
      why: "It goes back to “KeepSimp Trust Intermediate”, which is not among the certificates you trust and is not in the signature.",
    })
  })

  it("refuses a chain through a certificate that may not issue others", async () => {
    const root = [await der("root.crt")]
    const leaf = await signer("under-leaf")
    expect(await trustOf(leaf.own, leaf.carried, root, AT)).toEqual({
      trusted: false,
      why: "It was issued by “Not An Issuer”, a certificate that may not issue others.",
    })
    const plain = await signer("under-plain")
    expect(await trustOf(plain.own, plain.carried, root, AT)).toEqual({
      trusted: false,
      why: "It was issued by “Plain Issuer”, a certificate that may not issue others.",
    })
  })

  it("does not trust a chain when one of its certificates was not valid at the time given", async () => {
    const { own, carried } = await signer("signer")
    expect(
      await trustOf(
        own,
        carried,
        [await der("root.crt")],
        new Date("2050-01-01")
      )
    ).toEqual({
      trusted: false,
      why: "It goes back to “KeepSimp Trust Root”, a certificate you trust, but “Robin Trust” was not valid at the time the signature gives.",
    })
  })

  it("is not fooled by a certificate that has the issuer's name but not its key", async () => {
    const { own } = await signer("signer")
    const real = certificate(await der("intermediate.crt"))
    // The same name, with a key that is not the issuer's (and is no point on the curve).
    const fake = certificate(await der("intermediate.crt"))
    const key = fake.subjectPublicKeyInfo.subjectPublicKey.valueBlock
    const broken = new Uint8Array(key.valueHexView)
    broken[broken.length - 1] ^= 0xff
    key.valueHexView = broken
    expect(real.subject.isEqual(fake.subject)).toBe(true)
    expect(
      await trustOf(own, [fake], [await der("root.crt")], AT)
    ).toMatchObject({ trusted: false })
    // A different key that is a point on the curve: the signature does not fit it.
    const otherKey = certificate(await der("root.crt"))
    fake.subjectPublicKeyInfo = otherKey.subjectPublicKeyInfo
    expect(
      await trustOf(own, [fake], [await der("root.crt")], AT)
    ).toMatchObject({ trusted: false })
  })
})
