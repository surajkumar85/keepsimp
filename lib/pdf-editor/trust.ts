/**
 * The certificates a person trusts, and whether a signer's certificate goes
 * back to one of them. A certificate is only as good as whoever issued it:
 * a person who trusts their company's authority, or one an agency gave
 * them, can add it here, and a signature whose certificate leads back to it
 * through certificates that each issued the next is said to be trusted by
 * them. Nothing is fetched: no revocation lists, no OCSP, no issuer
 * downloaded from an address a certificate names.
 */
import * as pkijs from "pkijs"
import { nameSaid, readyWebCrypto } from "./certificate"

/** A certificate a person has said they trust. */
export interface TrustedCertificate {
  /** Its SHA-256 fingerprint in hex, which tells it from any other. */
  fingerprint: string
  /** The name it gives its holder, and who issued it (its own name when it signed itself). */
  name: string
  issuer: string
  /** Until when it is valid, as an ISO date. */
  validTo: string
  /** The certificate as a file holds it (DER). */
  der: Uint8Array
}

/** Whether a certificate one trusts vouches for a signer. */
export type Trust =
  | {
      trusted: true
      /** The certificate trusted that it goes back to, by name. */
      by: string
      /** Whether that is the signer's own certificate. */
      itself: boolean
    }
  | { trusted: false; why: string }

/** A file that holds no certificate that can be read. */
export class TrustProblem extends Error {}

/** The most certificates one file may add. */
export const MOST_TRUSTED = 50

const BASIC_CONSTRAINTS = "2.5.29.19"
const PEM =
  /-----BEGIN (?:X509 |TRUSTED )?CERTIFICATE-----([\s\S]*?)-----END (?:X509 |TRUSTED )?CERTIFICATE-----/g

const bufferOf = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

function base64Bytes(text: string) {
  const binary = atob(text.replace(/\s+/g, ""))
  return Uint8Array.from(binary, (letter) => letter.charCodeAt(0))
}

/** A certificate from its DER bytes; null when they are not one. */
function parsed(der: Uint8Array): pkijs.Certificate | null {
  try {
    return pkijs.Certificate.fromBER(bufferOf(der))
  } catch {
    return null
  }
}

/** The certificates a file holds: one in DER, or any number in PEM. */
export async function readTrusted(
  bytes: Uint8Array
): Promise<TrustedCertificate[]> {
  readyWebCrypto()
  const text = new TextDecoder("latin1").decode(bytes)
  const blocks = [...text.matchAll(PEM)].map((found) => found[1])
  let ders: Uint8Array[]
  try {
    ders = blocks.length ? blocks.map(base64Bytes) : [bytes]
  } catch {
    ders = []
  }
  const found: TrustedCertificate[] = []
  for (const der of ders.slice(0, MOST_TRUSTED)) {
    const certificate = parsed(der)
    if (!certificate) continue
    const fingerprint = hex(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bufferOf(der)))
    )
    if (found.some((one) => one.fingerprint === fingerprint)) continue
    const own = certificate.subject.isEqual(certificate.issuer)
    found.push({
      fingerprint,
      name: nameSaid(certificate.subject),
      issuer: nameSaid(own ? certificate.subject : certificate.issuer),
      validTo: certificate.notAfter.value.toISOString(),
      der: der.slice(),
    })
  }
  if (!found.length)
    throw new TrustProblem(
      "This file holds no certificate that can be read. Choose a certificate file (.cer, .crt, .der or .pem), not a .p12 or .pfx."
    )
  return found
}

/** Whether two certificates are the same one: the same holder, and the same signature of its issuer. */
function same(a: pkijs.Certificate, b: pkijs.Certificate) {
  const one = a.signatureValue.valueBlock.valueHexView
  const other = b.signatureValue.valueBlock.valueHexView
  return (
    a.subject.isEqual(b.subject) &&
    one.length === other.length &&
    one.every((byte, at) => byte === other[at])
  )
}

/** Whether a certificate says it may issue others. */
function mayIssue(certificate: pkijs.Certificate) {
  const extension = certificate.extensions?.find(
    (one) => one.extnID === BASIC_CONSTRAINTS
  )
  return (
    extension?.parsedValue instanceof pkijs.BasicConstraints &&
    Boolean(extension.parsedValue.cA)
  )
}

/** Whether `issuer` signed `certificate`. */
async function signedBy(
  certificate: pkijs.Certificate,
  issuer: pkijs.Certificate
) {
  if (!certificate.issuer.isEqual(issuer.subject)) return false
  try {
    return await certificate.verify(issuer)
  } catch {
    return false
  }
}

/**
 * Whether a signer's certificate goes back to one of the certificates
 * trusted, through the certificates the signature carries and those
 * trusted: each signed by the next, each valid at the moment given, and
 * each after the first allowed to issue others.
 */
export async function trustOf(
  signer: pkijs.Certificate,
  carried: readonly pkijs.Certificate[],
  trusted: readonly Uint8Array[],
  at: Date
): Promise<Trust> {
  readyWebCrypto()
  const anchors = trusted
    .map(parsed)
    .filter((one): one is pkijs.Certificate => one !== null)
  const isTrusted = (one: pkijs.Certificate) =>
    anchors.some((anchor) => same(anchor, one))
  const chain = [signer]
  for (;;) {
    const last = chain[chain.length - 1]
    const outOfDate = chain.find(
      (one) => one.notBefore.value > at || one.notAfter.value < at
    )
    if (isTrusted(last)) {
      if (outOfDate)
        return {
          trusted: false,
          why: `It goes back to “${nameSaid(last.subject)}”, a certificate you trust, but “${nameSaid(outOfDate.subject)}” was not valid at the time the signature gives.`,
        }
      return {
        trusted: true,
        by: nameSaid(last.subject),
        itself: chain.length === 1,
      }
    }
    // Who issued it: one trusted first, then one the signature carries.
    let issuer: pkijs.Certificate | undefined
    for (const one of [...anchors, ...carried])
      if (
        !chain.some((link) => same(link, one)) &&
        (await signedBy(last, one))
      ) {
        issuer = one
        break
      }
    if (!issuer) break
    if (!mayIssue(issuer))
      return {
        trusted: false,
        why: `It was issued by “${nameSaid(issuer.subject)}”, a certificate that may not issue others.`,
      }
    chain.push(issuer)
  }
  const end = chain[chain.length - 1]
  return {
    trusted: false,
    why: end.subject.isEqual(end.issuer)
      ? `It goes back to “${nameSaid(end.subject)}”, which is not among the certificates you trust.`
      : `It goes back to “${nameSaid(end.issuer)}”, which is not among the certificates you trust and is not in the signature.`,
  }
}
