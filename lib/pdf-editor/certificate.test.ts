// @vitest-environment node
/**
 * Certificate files as they come from OpenSSL, Windows and macOS, opened
 * and signed with; each signature is checked by OpenSSL's own CMS reader,
 * against the test authority that issued the certificate.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import forge from "node-forge"
import { describe, expect, it } from "vitest"
import {
  CertificateProblem,
  readIdentity,
  signatureFor,
  signatureRoom,
} from "./certificate"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/certificates/${name}.p12`))
const PASSWORD = "keepsimp"

/** Whether OpenSSL takes a signature of some bytes for a good one, issued by the test authority. */
function opensslVerifies(signature: Uint8Array, content: Uint8Array) {
  const folder = mkdtempSync(join(tmpdir(), "keepsimp-cms-"))
  writeFileSync(join(folder, "signature.der"), signature)
  writeFileSync(join(folder, "content.bin"), content)
  try {
    execFileSync(
      "openssl",
      [
        "cms",
        "-verify",
        "-binary",
        "-inform",
        "DER",
        "-in",
        join(folder, "signature.der"),
        "-content",
        join(folder, "content.bin"),
        "-CAfile",
        "tests/fixtures/certificates/ca.pem",
        "-purpose",
        "any",
        "-out",
        join(folder, "out.bin"),
      ],
      { stdio: "pipe" }
    )
    return true
  } catch {
    return false
  }
}

const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))

describe("readIdentity", () => {
  it.each([
    ["rsa-aes", "RSA 2048"],
    ["rsa-legacy", "RSA 2048"],
    ["ec-aes", "ECDSA P-256"],
    ["ec-legacy", "ECDSA P-256"],
  ])("opens %s and signs with it, as OpenSSL agrees", async (name, key) => {
    const identity = await readIdentity(fixture(name), PASSWORD)
    expect(identity.signer).toMatchObject({
      name: `Sam Example (${name.split("-")[0]})`,
      email: "sam@example.org",
      organisation: "KeepSimp Tests",
      issuer: "KeepSimp Test Authority",
      selfSigned: false,
      key,
    })
    // The signer's certificate first, then the authority's.
    expect(identity.certificates).toHaveLength(2)
    expect(identity.key.extractable).toBe(false)
    const content = new TextEncoder().encode(`A contract, signed with ${name}`)
    const signature = await signatureFor(identity, await sha256(content))
    expect(signature.length).toBeLessThan(signatureRoom(identity))
    expect(opensslVerifies(signature, content)).toBe(true)
    // Another content does not pass with it.
    expect(
      opensslVerifies(signature, new TextEncoder().encode("Another"))
    ).toBe(false)
  })

  it("opens a file without a password, that signed itself", async () => {
    const identity = await readIdentity(fixture("self-nopass"), "")
    expect(identity.signer).toMatchObject({
      name: "Self Signed Sam",
      issuer: "Self Signed Sam",
      selfSigned: true,
      email: "",
      organisation: "",
    })
    expect(identity.certificates).toHaveLength(1)
    expect(Date.parse(identity.signer.validTo)).toBeGreaterThan(
      Date.parse(identity.signer.validFrom)
    )
  })

  it("says what is wrong with a file it cannot sign with", async () => {
    const problem = async (bytes: Uint8Array, password = PASSWORD) => {
      try {
        await readIdentity(bytes, password)
        return "opened"
      } catch (error) {
        expect(error).toBeInstanceOf(CertificateProblem)
        return (error as Error).message
      }
    }
    expect(await problem(fixture("rsa-aes"), "wrong")).toBe(
      "That password does not open this certificate file."
    )
    expect(await problem(new TextEncoder().encode("not a certificate"))).toBe(
      "This is not a certificate file that can be read (.p12 or .pfx)."
    )
    expect(await problem(fixture("certificate-only"))).toContain(
      "holds certificates but no key"
    )
    expect(await problem(fixture("dsa"))).toContain(
      "This kind of key cannot sign here."
    )
    // A key with a certificate that is not its own.
    const own = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(fixture("rsa-aes"))),
      false,
      PASSWORD
    )
    const key = own.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]![0].key!
    const other = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(fixture("self-nopass"))),
      false,
      ""
    )
    const cert = other.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]![0].cert!
    const mixed = forge.asn1
      .toDer(
        forge.pkcs12.toPkcs12Asn1(key, [cert], PASSWORD, {
          algorithm: "aes256",
        })
      )
      .getBytes()
    expect(
      await problem(Uint8Array.from(mixed, (letter) => letter.charCodeAt(0)))
    ).toBe("No certificate in this file goes with its key.")
  })

  it("names a holder by the organisation, or says it has no name, and skips what is not the key's", async () => {
    expect(
      (await readIdentity(fixture("organisation-only"), PASSWORD)).signer.name
    ).toBe("KeepSimp Tests")
    expect((await readIdentity(fixture("unnamed"), PASSWORD)).signer.name).toBe(
      "Unnamed"
    )
    // An EC key whose certificate is marked as an authority, beside an RSA
    // certificate that is not: the RSA one is tried first and passed over.
    const two = await readIdentity(fixture("two-certificates"), PASSWORD)
    expect(two.signer).toMatchObject({
      name: "Two Certificates Sam",
      key: "ECDSA P-256",
    })
    expect(two.certificates).toHaveLength(2)
  })

  it("keeps a certificate whose issuer the file does not hold, alone", async () => {
    const own = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(fixture("rsa-aes"))),
      false,
      PASSWORD
    )
    const key = own.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]![0].key!
    const [signer] = own.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]!
    const alone = forge.asn1
      .toDer(
        forge.pkcs12.toPkcs12Asn1(key, [signer.cert!], PASSWORD, {
          algorithm: "aes256",
        })
      )
      .getBytes()
    const identity = await readIdentity(
      Uint8Array.from(alone, (letter) => letter.charCodeAt(0)),
      PASSWORD
    )
    expect(identity.signer.issuer).toBe("KeepSimp Test Authority")
    expect(identity.certificates).toHaveLength(1)
  })

  it("refuses keys WebCrypto cannot sign with, and a key with no certificate", async () => {
    for (const name of ["secp256k1", "explicit-curve"])
      await expect(readIdentity(fixture(name), PASSWORD)).rejects.toThrow(
        "This kind of key cannot sign here."
      )
    await expect(readIdentity(fixture("key-only"), PASSWORD)).rejects.toThrow(
      "No certificate in this file goes with its key."
    )
  })
})
