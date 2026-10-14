/**
 * Checking a signature a PDF carries: whether the bytes it covers are
 * those it was made over, and who made it. Who issued the certificate is
 * said, but not judged: there is no list of authorities to trust here, so
 * whether the signer is who the certificate says is not known.
 */
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { readyWebCrypto, signerOf, type Signer } from "./certificate"
import type { Verdict } from "./signature-report"
import { coveredBy } from "./sign-bytes"

/** What a check of one signature found. */
export interface Checked {
  /** The bytes it covers are those it was made over, and its signature fits its certificate. */
  intact: boolean
  /** Who signed, from the certificate the signature names; null when it could not be read. */
  signer: Signer | null
  /** Why it is not intact, in words; "" when it is. */
  problem: string
}

/** The bytes of an OCTET STRING, written in one piece or in parts; undefined when there is none. */
function octetsOf(
  value: asn1js.OctetString | undefined
): Uint8Array | undefined {
  if (!value) return undefined
  if (!value.idBlock.isConstructed) return value.valueBlock.valueHexView
  const parts = (value.valueBlock.value as asn1js.OctetString[]).map((part) =>
    octetsOf(part)!
  )
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Whether the bytes a signature leaves out are only its own room: a string of hex digits in "<" and ">". */
function onlyRoom(gap: Uint8Array) {
  if (gap.length < 2 || gap[0] !== 0x3c || gap[gap.length - 1] !== 0x3e)
    return false
  for (let at = 1; at < gap.length - 1; at++) {
    const byte = gap[at]
    const hex =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x46) ||
      (byte >= 0x61 && byte <= 0x66)
    // White space may stand between the digits of a hex string.
    if (!hex && ![0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(byte)) return false
  }
  return true
}

/**
 * Check a detached CMS signature (`adbe.pkcs7.detached`,
 * `ETSI.CAdES.detached`) over the bytes of a file it says it covers.
 * @param ranges The signature's `/ByteRange`.
 * @param signature Its `/Contents`, trailing zeros and all.
 */
export async function checkSignature(
  file: Uint8Array,
  ranges: readonly number[],
  signature: Uint8Array,
  /**
   * `adbe.pkcs7.sha1`: the signature is over the SHA-1 digest of the bytes
   * covered, which it carries inside itself, rather than over the bytes.
   */
  encapsulated = false
): Promise<Checked> {
  readyWebCrypto()
  const [start, first, second, last] = ranges
  if (
    ranges.length !== 4 ||
    start !== 0 ||
    first < 0 ||
    second < first ||
    last < 0 ||
    second + last > file.length
  )
    return {
      intact: false,
      signer: null,
      problem: "What the signature says it covers is not in this file.",
    }
  if (!onlyRoom(file.subarray(first, second)))
    return {
      intact: false,
      signer: null,
      problem:
        "It leaves out more of the file than the room for the signature itself, so what it leaves out could have been changed.",
    }
  let data: pkijs.SignedData
  try {
    const info = pkijs.ContentInfo.fromBER(
      signature.buffer.slice(
        signature.byteOffset,
        signature.byteOffset + signature.byteLength
      ) as ArrayBuffer
    )
    data = new pkijs.SignedData({ schema: info.content })
  } catch {
    return {
      intact: false,
      signer: null,
      problem: "This signature cannot be read.",
    }
  }
  const [info] = data.signerInfos
  const sid = info?.sid
  const certificate = (data.certificates ?? []).find(
    (one): one is pkijs.Certificate =>
      one instanceof pkijs.Certificate &&
      sid instanceof pkijs.IssuerAndSerialNumber &&
      one.issuer.isEqual(sid.issuer) &&
      one.serialNumber.isEqual(sid.serialNumber)
  )
  const signer = certificate ? signerOf(certificate) : null
  let intact = false
  try {
    const covered = coveredBy(file, ranges)
    if (encapsulated) {
      // The digest it carries must be the bytes' own, and the signature over it hold.
      const carried = octetsOf(data.encapContentInfo.eContent)
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-1", covered)
      )
      intact =
        Boolean(carried) &&
        carried!.length === digest.length &&
        carried!.every((byte, at) => byte === digest[at]) &&
        (await data.verify({ signer: 0, checkChain: false }))
    } else
      intact = await data.verify({
        signer: 0,
        data: covered.buffer as ArrayBuffer,
        checkChain: false,
      })
  } catch {
    intact = false
  }
  return {
    intact,
    signer,
    problem: intact
      ? ""
      : "The file was changed in what the signature covers, or the signature does not fit its certificate.",
  }
}

/** The kinds of signature checked here, by their `/SubFilter`. */
const DETACHED = ["adbe.pkcs7.detached", "ETSI.CAdES.detached"]

/** Check a signature of any kind a PDF may carry, or say why it is not checked. */
export async function verdictOf(
  file: Uint8Array,
  kind: string,
  ranges: readonly number[],
  signature: Uint8Array
): Promise<Verdict> {
  if (kind === "ETSI.RFC3161")
    return {
      checked: false,
      why: "This is a time stamp on the document, not a signature by a person: it is not checked here.",
    }
  if (!DETACHED.includes(kind) && kind !== "adbe.pkcs7.sha1")
    return {
      checked: false,
      why: `This kind of signature (${kind || "of no stated kind"}) is not checked here.`,
    }
  const checked = await checkSignature(
    file,
    ranges,
    signature,
    kind === "adbe.pkcs7.sha1"
  )
  return { checked: true, ...checked }
}
