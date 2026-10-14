/**
 * Checking a signature a PDF carries: whether the bytes it covers are
 * those it was made over, and who made it. Who issued the certificate is
 * said, but not judged: there is no list of authorities to trust here, so
 * whether the signer is who the certificate says is not known.
 */
import * as pkijs from "pkijs"
import { readyWebCrypto, signerOf, type Signer } from "./certificate"
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

/**
 * Check a detached CMS signature (`adbe.pkcs7.detached`,
 * `ETSI.CAdES.detached`) over the bytes of a file it says it covers.
 * @param ranges The signature's `/ByteRange`.
 * @param signature Its `/Contents`, trailing zeros and all.
 */
export async function checkSignature(
  file: Uint8Array,
  ranges: readonly number[],
  signature: Uint8Array
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
    intact = await data.verify({
      signer: 0,
      data: coveredBy(file, ranges).buffer as ArrayBuffer,
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
