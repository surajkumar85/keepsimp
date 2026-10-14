/**
 * Opening a certificate file (PKCS #12, .p12 or .pfx; RFC 7292): its keys
 * and certificates, with its password. The file's integrity check (its MAC)
 * tells a wrong password. What is locked is decrypted with the browser's
 * cryptography where it can (PBES2: PBKDF2 and AES), and with the old
 * ciphers of `legacy-ciphers.ts` where it cannot (3DES and RC2, with the
 * PKCS #12 way of making keys from a password), as OpenSSL's -legacy,
 * macOS and older Windows still write them.
 */
import * as asn1js from "asn1js"
import { rc2Decrypt, tripleDesDecrypt } from "./legacy-ciphers"

/** Words for what is wrong with a file, to be shown as they are. */
export class Pkcs12Problem extends Error {}

const NOT_READABLE =
  "This is not a certificate file that can be read (.p12 or .pfx)."
const WRONG_PASSWORD = "That password does not open this certificate file."

const OID = {
  data: "1.2.840.113549.1.7.1",
  encryptedData: "1.2.840.113549.1.7.6",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  shroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  x509: "1.2.840.113549.1.9.22.1",
  pbes2: "1.2.840.113549.1.5.13",
  pbkdf2: "1.2.840.113549.1.5.12",
}

/** The PKCS #12 ciphers, by their identifiers: the cipher, its key length and how many bits count. */
const LEGACY: Record<
  string,
  { cipher: "3des" | "rc2"; key: number; bits: number }
> = {
  "1.2.840.113549.1.12.1.3": { cipher: "3des", key: 24, bits: 192 },
  "1.2.840.113549.1.12.1.4": { cipher: "3des", key: 16, bits: 128 },
  "1.2.840.113549.1.12.1.5": { cipher: "rc2", key: 16, bits: 128 },
  "1.2.840.113549.1.12.1.6": { cipher: "rc2", key: 5, bits: 40 },
}

/** The hashes the file may use, as WebCrypto names them, with their lengths and block sizes. */
const HASHES: Record<string, { name: string; u: number; v: number }> = {
  "1.3.14.3.2.26": { name: "SHA-1", u: 20, v: 64 },
  "2.16.840.1.101.3.4.2.1": { name: "SHA-256", u: 32, v: 64 },
  "2.16.840.1.101.3.4.2.2": { name: "SHA-384", u: 48, v: 128 },
  "2.16.840.1.101.3.4.2.3": { name: "SHA-512", u: 64, v: 128 },
}

/** The HMACs PBKDF2 may use, by their identifiers. */
const PRFS: Record<string, string> = {
  "1.2.840.113549.2.7": "SHA-1",
  "1.2.840.113549.2.9": "SHA-256",
  "1.2.840.113549.2.10": "SHA-384",
  "1.2.840.113549.2.11": "SHA-512",
}

/** Triple DES in CBC, which PBES2 may use as well. */
const DES_EDE3_CBC = "1.2.840.113549.3.7"

/** The AES ciphers PBES2 may use, by their identifiers, with their key lengths. */
const AES: Record<string, number> = {
  "2.16.840.1.101.3.4.1.2": 16,
  "2.16.840.1.101.3.4.1.22": 24,
  "2.16.840.1.101.3.4.1.42": 32,
}

type Value = asn1js.AsnType

/** Read DER, or say the file cannot be read. */
function parse(bytes: Uint8Array): Value {
  const read = asn1js.fromBER(new Uint8Array(bytes))
  if (read.offset === -1) throw new Pkcs12Problem(NOT_READABLE)
  return read.result
}

/** The parts of a sequence or set, or say the file cannot be read. */
function partsOf(value: Value | undefined): Value[] {
  if (value instanceof asn1js.Sequence || value instanceof asn1js.Set)
    return value.valueBlock.value as Value[]
  throw new Pkcs12Problem(NOT_READABLE)
}

/** What is inside a context-specific [n] EXPLICIT tag. */
function inside(value: Value | undefined): Value {
  if (value instanceof asn1js.Constructed && value.idBlock.tagClass === 3) {
    const [first] = value.valueBlock.value as Value[]
    if (first) return first
  }
  throw new Pkcs12Problem(NOT_READABLE)
}

const oidOf = (value: Value | undefined) => {
  if (value instanceof asn1js.ObjectIdentifier)
    return value.valueBlock.toString()
  throw new Pkcs12Problem(NOT_READABLE)
}

/** The bytes of an OCTET STRING, constructed or not. */
function octets(value: Value | undefined): Uint8Array {
  if (value instanceof asn1js.OctetString) {
    if (value.idBlock.isConstructed)
      return concat(
        (value.valueBlock.value as Value[]).map((part) => octets(part))
      )
    return new Uint8Array(value.valueBlock.valueHexView)
  }
  throw new Pkcs12Problem(NOT_READABLE)
}

const numberOf = (value: Value | undefined) => {
  if (value instanceof asn1js.Integer) return value.valueBlock.valueDec
  throw new Pkcs12Problem(NOT_READABLE)
}

function concat(parts: readonly Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const der = (value: Value) => new Uint8Array(value.toBER(false))
const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer

/** A password as PKCS #12 makes keys from it: UTF-16 big-endian, ending in two zeros; empty when there is none. */
export function bmpPassword(password: string) {
  if (!password) return new Uint8Array(0)
  const out = new Uint8Array((password.length + 1) * 2)
  for (let at = 0; at < password.length; at++) {
    out[2 * at] = password.charCodeAt(at) >> 8
    out[2 * at + 1] = password.charCodeAt(at) & 255
  }
  return out
}

/**
 * Key material from a password the PKCS #12 way (RFC 7292, appendix B):
 * `id` 1 for a key, 2 for an IV, 3 for a MAC key.
 */
export async function pkcs12Key(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  id: number,
  length: number,
  hash: { name: string; u: number; v: number }
) {
  const { u, v } = hash
  const fill = (source: Uint8Array) => {
    if (!source.length) return new Uint8Array(0)
    const out = new Uint8Array(v * Math.ceil(source.length / v))
    for (let at = 0; at < out.length; at++) out[at] = source[at % source.length]
    return out
  }
  let i = concat([fill(salt), fill(password)])
  const d = new Uint8Array(v).fill(id)
  const out = new Uint8Array(length)
  for (let made = 0; made < length; made += u) {
    let a = concat([d, i])
    for (let round = 0; round < iterations; round++)
      a = new Uint8Array(await crypto.subtle.digest(hash.name, a))
    out.set(a.subarray(0, Math.min(u, length - made)), made)
    if (made + u >= length) break
    // I becomes each of its v-byte blocks plus B plus 1, where B is A repeated.
    const b = fill(a).subarray(0, v)
    const next = new Uint8Array(i.length)
    for (let block = 0; block < i.length; block += v) {
      let carry = 1
      for (let at = v - 1; at >= 0; at--) {
        const sum = i[block + at] + b[at] + carry
        next[block + at] = sum & 255
        carry = sum >> 8
      }
    }
    i = next
  }
  return out
}

/** Take PKCS #7 padding off, or say the password does not open it. */
function unpad(bytes: Uint8Array, block: number) {
  const pad = bytes[bytes.length - 1]
  if (
    !bytes.length ||
    pad < 1 ||
    pad > block ||
    bytes.subarray(bytes.length - pad).some((byte) => byte !== pad)
  )
    throw new Pkcs12Problem(WRONG_PASSWORD)
  return bytes.subarray(0, bytes.length - pad)
}

/** Decrypt what a file locked with one of its ciphers, with the password. */
async function decrypt(
  algorithm: Value | undefined,
  data: Uint8Array,
  password: string
): Promise<Uint8Array> {
  const [id, params] = partsOf(algorithm)
  const oid = oidOf(id)
  const legacy = LEGACY[oid]
  if (legacy) {
    const [salt, count] = partsOf(params)
    const iterations = numberOf(count)
    const bmp = bmpPassword(password)
    const sha1 = HASHES["1.3.14.3.2.26"]
    const key = await pkcs12Key(
      bmp,
      octets(salt),
      iterations,
      1,
      legacy.key,
      sha1
    )
    const iv = await pkcs12Key(bmp, octets(salt), iterations, 2, 8, sha1)
    const plain =
      legacy.cipher === "3des"
        ? tripleDesDecrypt(data, key, iv)
        : rc2Decrypt(data, key, iv, legacy.bits)
    return unpad(plain, 8)
  }
  if (oid === OID.pbes2) {
    const [kdf, scheme] = partsOf(params)
    const [kdfId, kdfParams] = partsOf(kdf)
    if (oidOf(kdfId) !== OID.pbkdf2) throw new Pkcs12Problem(UNSUPPORTED)
    const [salt, count, ...rest] = partsOf(kdfParams)
    const prf = rest.find((one) => one instanceof asn1js.Sequence)
    const hash = prf ? PRFS[oidOf(partsOf(prf)[0])] : "SHA-1"
    const [cipherId, iv] = partsOf(scheme)
    const cipher = oidOf(cipherId)
    const length = cipher === DES_EDE3_CBC ? 24 : AES[cipher]
    if (!hash || !length) throw new Pkcs12Problem(UNSUPPORTED)
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    )
    const key = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: buffer(octets(salt)),
          iterations: numberOf(count),
          hash,
        },
        base,
        length * 8
      )
    )
    // Triple DES is not the browser's to decrypt: it is done here.
    if (cipher === DES_EDE3_CBC)
      return unpad(tripleDesDecrypt(data, key, octets(iv)), 8)
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-CBC", iv: buffer(octets(iv)) },
          await crypto.subtle.importKey("raw", buffer(key), "AES-CBC", false, [
            "decrypt",
          ]),
          buffer(data)
        )
      )
    } catch {
      throw new Pkcs12Problem(WRONG_PASSWORD)
    }
  }
  throw new Pkcs12Problem(UNSUPPORTED)
}

const UNSUPPORTED =
  "This certificate file is locked in a way that cannot be opened here. Export it again with AES or 3DES."

/**
 * Check the file's MAC: an HMAC of what it holds, with a key made from
 * the password. A file without one is taken as it is.
 */
async function checkMac(
  mac: Value | undefined,
  content: Uint8Array,
  password: string
) {
  if (!mac) return
  const [digestInfo, salt, count] = partsOf(mac)
  const [algorithm, digest] = partsOf(digestInfo)
  const hash = HASHES[oidOf(partsOf(algorithm)[0])]
  if (!hash) throw new Pkcs12Problem(UNSUPPORTED)
  const iterations = count ? numberOf(count) : 1
  // Some programs make the key from an empty password as nothing, others as two zeros.
  const tries = password
    ? [bmpPassword(password)]
    : [new Uint8Array(0), new Uint8Array(2)]
  for (const bmp of tries) {
    const raw = await pkcs12Key(bmp, octets(salt), iterations, 3, hash.u, hash)
    const key = await crypto.subtle.importKey(
      "raw",
      buffer(raw),
      { name: "HMAC", hash: hash.name },
      false,
      ["verify"]
    )
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        buffer(octets(digest)),
        buffer(content)
      )
    )
      return
  }
  throw new Pkcs12Problem(WRONG_PASSWORD)
}

/** What a certificate file holds: its private keys (PKCS #8, DER) and its certificates (DER). */
export interface Pkcs12Contents {
  keys: Uint8Array[]
  certificates: Uint8Array[]
}

/**
 * Open a certificate file with its password.
 * @throws Pkcs12Problem with words for what is wrong.
 */
export async function readPkcs12(
  file: Uint8Array,
  password: string
): Promise<Pkcs12Contents> {
  try {
    return await read(file, password)
  } catch (error) {
    // Whatever else went wrong (a cipher given data of the wrong length,
    // say), the file is not one that can be read.
    if (error instanceof Pkcs12Problem) throw error
    throw new Pkcs12Problem(NOT_READABLE)
  }
}

async function read(
  file: Uint8Array,
  password: string
): Promise<Pkcs12Contents> {
  const [, authSafe, mac] = partsOf(parse(file))
  const [type, content] = partsOf(authSafe)
  if (oidOf(type) !== OID.data) throw new Pkcs12Problem(UNSUPPORTED)
  const safe = octets(inside(content))
  await checkMac(mac, safe, password)
  const contents: Pkcs12Contents = { keys: [], certificates: [] }
  for (const info of partsOf(parse(safe))) {
    const [infoType, infoContent] = partsOf(info)
    let bags: Uint8Array
    if (oidOf(infoType) === OID.data) bags = octets(inside(infoContent))
    else if (oidOf(infoType) === OID.encryptedData) {
      const [, encrypted] = partsOf(inside(infoContent))
      const [, algorithm, data] = partsOf(encrypted)
      // The encrypted content is an [0] IMPLICIT OCTET STRING: its bytes, or its parts.
      const locked = data as asn1js.Constructed | asn1js.Primitive
      const raw =
        locked instanceof asn1js.Constructed
          ? concat(
              (locked.valueBlock.value as Value[]).map((part) => octets(part))
            )
          : new Uint8Array((locked as asn1js.Primitive).valueBlock.valueHexView)
      bags = await decrypt(algorithm, raw, password)
    } else continue
    for (const bag of partsOf(parse(bags))) {
      const [bagId, bagValue] = partsOf(bag)
      const kind = oidOf(bagId)
      const value = inside(bagValue)
      if (kind === OID.keyBag) contents.keys.push(der(value))
      else if (kind === OID.shroudedKeyBag) {
        const [algorithm, data] = partsOf(value)
        contents.keys.push(await decrypt(algorithm, octets(data), password))
      } else if (kind === OID.certBag) {
        const [certId, certValue] = partsOf(value)
        if (oidOf(certId) === OID.x509)
          contents.certificates.push(octets(inside(certValue)))
      }
    }
  }
  return contents
}
