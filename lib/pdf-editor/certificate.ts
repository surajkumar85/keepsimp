/**
 * A certificate to sign with, read from a .p12 or .pfx file on the device,
 * and the signature (CMS, as PAdES asks for it) made with its key.
 *
 * The file is opened with node-forge, which reads the old ciphers such
 * files are often locked with (3DES, RC2) as well as AES. The key is then
 * handed to the browser's own cryptography (WebCrypto) and cannot be read
 * out again; the signature itself is put together with PKI.js. Nothing of
 * the file, its password or its key is kept or sent anywhere.
 */
import * as asn1js from "asn1js"
import forge from "node-forge"
import * as pkijs from "pkijs"

/** Words for what is wrong with a certificate file, to be shown as they are. */
export class CertificateProblem extends Error {}

/** Who a certificate names, and what it is good for. */
export interface Signer {
  /** The certificate's own name for its holder (its common name). */
  name: string
  email: string
  organisation: string
  /** Who issued it: a name, or the holder's own when it signed itself. */
  issuer: string
  selfSigned: boolean
  /** From when to when it may sign, as ISO dates. */
  validFrom: string
  validTo: string
  /** The kind of key, as it is said: "RSA 2048" or "ECDSA P-256". */
  key: string
}

/** Everything that signing needs: the key, the certificates, and who signs. */
export interface Identity {
  key: CryptoKey
  /** The signer's certificate first, then those that issued it, in DER. */
  certificates: Uint8Array[]
  signer: Signer
}

const OID = {
  rsa: "1.2.840.113549.1.1.1",
  ec: "1.2.840.10045.2.1",
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  basicConstraints: "2.5.29.19",
  commonName: "2.5.4.3",
  organisation: "2.5.4.10",
  email: "1.2.840.113549.1.9.1",
}

/** The curves an elliptic-curve key may be on, by the name the certificate gives. */
const CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
}

let engine = false
/** PKI.js works with the browser's cryptography, or Node's, which is the same. */
export function readyWebCrypto() {
  if (engine) return
  pkijs.setEngine(
    "webcrypto",
    new pkijs.CryptoEngine({ name: "webcrypto", crypto: globalThis.crypto })
  )
  engine = true
}

const bytesOf = (binary: string) =>
  Uint8Array.from(binary, (letter) => letter.charCodeAt(0))
const derOf = (asn1: forge.asn1.Asn1) =>
  bytesOf(forge.asn1.toDer(asn1).getBytes())
const bufferOf = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer

/** A value of a distinguished name, or "". */
function nameValue(name: pkijs.RelativeDistinguishedNames, type: string) {
  const found = name.typesAndValues.find((one) => one.type === type)
  return found ? String(found.value.valueBlock.value).trim() : ""
}

/** A name as it is said: its common name, or else its organisation. */
const nameSaid = (name: pkijs.RelativeDistinguishedNames) =>
  nameValue(name, OID.commonName) ||
  nameValue(name, OID.organisation) ||
  "Unnamed"

const isAuthority = (certificate: pkijs.Certificate) =>
  Boolean(
    certificate.extensions?.some(
      (one) =>
        one.extnID === OID.basicConstraints &&
        (one.parsedValue as pkijs.BasicConstraints | undefined)?.cA
    )
  )

/**
 * A key's kind, as `kindOf` gives a certificate's, read from its PKCS #8
 * form: a sequence of a version, the algorithm (with the curve for an
 * elliptic-curve key) and the key.
 */
function kindOfKey(pkcs8: Uint8Array) {
  const [, algorithm] = forge.asn1.fromDer(
    forge.util.createBuffer(new Uint8Array(pkcs8))
  ).value as forge.asn1.Asn1[]
  const [id, params] = algorithm.value as forge.asn1.Asn1[]
  const oid = (asn1: forge.asn1.Asn1) =>
    forge.asn1.derToOid(asn1.value as string)
  return `${oid(id)} ${params?.type === forge.asn1.Type.OID ? oid(params) : ""}`
}

/** A certificate's kind, with its curve for an elliptic-curve one: "1.2.840.10045.2.1 1.2.840.10045.3.1.7". */
function kindOf(algorithm: pkijs.AlgorithmIdentifier) {
  const curve =
    algorithm.algorithmParams instanceof asn1js.ObjectIdentifier
      ? algorithm.algorithmParams.valueBlock.toString()
      : ""
  return `${algorithm.algorithmId} ${curve}`
}

/** How a key signs, from the certificate's public key: the algorithm WebCrypto is given. */
function algorithmOf(certificate: pkijs.Certificate) {
  const { algorithm } = certificate.subjectPublicKeyInfo
  if (algorithm.algorithmId === OID.rsa)
    return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
  if (algorithm.algorithmId === OID.ec) {
    const curve =
      algorithm.algorithmParams instanceof asn1js.ObjectIdentifier
        ? CURVES[algorithm.algorithmParams.valueBlock.toString()]
        : undefined
    if (curve) return { name: "ECDSA", namedCurve: curve, hash: "SHA-256" }
  }
  return null
}

/** The kind of key a certificate holds, as it is said. */
function keySaid(certificate: pkijs.Certificate) {
  const algorithm = algorithmOf(certificate)
  if (algorithm?.name === "ECDSA") return `ECDSA ${algorithm.namedCurve}`
  // PKI.js reads the modulus without the zero byte DER puts before a high first bit.
  const rsa = certificate.subjectPublicKeyInfo.parsedKey as pkijs.RSAPublicKey
  return `RSA ${rsa.modulus.valueBlock.valueHexView.length * 8}`
}

/**
 * Open a certificate file with its password: the key it holds, the
 * certificate that goes with that key, and those that issued it.
 * @throws CertificateProblem with words for what is wrong.
 */
export async function readIdentity(
  file: Uint8Array,
  password: string
): Promise<Identity> {
  readyWebCrypto()
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(new Uint8Array(file))
    )
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password)
  } catch (error) {
    throw new CertificateProblem(
      /password|MAC|decrypt/i.test(String((error as Error).message))
        ? "That password does not open this certificate file."
        : "This is not a certificate file that can be read (.p12 or .pfx)."
    )
  }
  // forge gives a list for the kind asked for, empty when there are none.
  const bagsOf = (type: string) =>
    p12.getBags({ bagType: type })[type] as forge.pkcs12.Bag[]
  const keyBags = [
    ...bagsOf(forge.pki.oids.pkcs8ShroudedKeyBag),
    ...bagsOf(forge.pki.oids.keyBag),
  ]
  const keys = keyBags.map((bag) =>
    bag.key
      ? derOf(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(bag.key)))
      : derOf(bag.asn1!)
  )
  const certificates = bagsOf(forge.pki.oids.certBag).map((bag) =>
    bag.cert ? derOf(forge.pki.certificateToAsn1(bag.cert)) : derOf(bag.asn1!)
  )
  if (!keys.length)
    throw new CertificateProblem(
      "This file holds certificates but no key. Only a file with its private key can sign; export it again with the key."
    )
  const parsed = certificates.map((one) =>
    pkijs.Certificate.fromBER(bufferOf(one))
  )
  // Which certificate goes with the key: the one whose public key checks
  // what the key signs. Authorities are tried last.
  const order = parsed
    .map((certificate, at) => ({ certificate, at }))
    .sort(
      (a, b) =>
        Number(isAuthority(a.certificate)) - Number(isAuthority(b.certificate))
    )
  const proof = new TextEncoder().encode("KeepSimp")
  let unsupported = false
  for (const pkcs8 of keys) {
    const kind = kindOfKey(pkcs8)
    for (const { certificate, at } of order) {
      const algorithm = algorithmOf(certificate)
      if (!algorithm) {
        unsupported = true
        continue
      }
      // A key only goes with a certificate of its own kind, on its curve.
      if (kindOf(certificate.subjectPublicKeyInfo.algorithm) !== kind) continue
      const key = await crypto.subtle.importKey(
        "pkcs8",
        bufferOf(pkcs8),
        algorithm,
        false,
        ["sign"]
      )
      const signed = await crypto.subtle.sign(algorithm, key, proof)
      const check = await crypto.subtle.importKey(
        "spki",
        certificate.subjectPublicKeyInfo.toSchema().toBER(false),
        algorithm,
        false,
        ["verify"]
      )
      if (!(await crypto.subtle.verify(algorithm, check, signed, proof)))
        continue
      return {
        key,
        certificates: chainFrom(at, parsed).map((index) => certificates[index]),
        signer: signerOf(certificate),
      }
    }
  }
  throw new CertificateProblem(
    unsupported
      ? "This kind of key cannot sign here. RSA keys and elliptic-curve keys (P-256, P-384, P-521) can."
      : "No certificate in this file goes with its key."
  )
}

/** The signer's certificate, then its issuer, then that one's, as far as the file holds them. */
function chainFrom(first: number, all: readonly pkijs.Certificate[]) {
  const chain = [first]
  for (;;) {
    const last = all[chain[chain.length - 1]]
    if (selfSigned(last)) break
    const next = all.findIndex(
      (one, at) => !chain.includes(at) && one.subject.isEqual(last.issuer)
    )
    if (next < 0) break
    chain.push(next)
  }
  // Any others the file holds go after.
  return [
    ...chain,
    ...all.map((_, at) => at).filter((at) => !chain.includes(at)),
  ]
}

const selfSigned = (certificate: pkijs.Certificate) =>
  certificate.subject.isEqual(certificate.issuer)

/** Who a certificate names. */
export function signerOf(certificate: pkijs.Certificate): Signer {
  const own = selfSigned(certificate)
  return {
    name: nameSaid(certificate.subject),
    email: nameValue(certificate.subject, OID.email),
    organisation: nameValue(certificate.subject, OID.organisation),
    issuer: own ? nameSaid(certificate.subject) : nameSaid(certificate.issuer),
    selfSigned: own,
    validFrom: certificate.notBefore.value.toISOString(),
    validTo: certificate.notAfter.value.toISOString(),
    key: keySaid(certificate),
  }
}

/** How many bytes a signature with these certificates takes at most, with room to spare. */
export const signatureRoom = (identity: Pick<Identity, "certificates">) =>
  identity.certificates.reduce((sum, one) => sum + one.length, 0) + 4096

/**
 * The signature of some bytes, as a PDF carries it: a detached CMS
 * SignedData (PAdES, `ETSI.CAdES.detached`) over the SHA-256 digest of the
 * bytes the signature covers, with the attributes PAdES asks for (the
 * content's type, its digest, and which certificate signed). The time of
 * signing is the signature dictionary's, not the CMS's, as PAdES asks.
 * @param digest The SHA-256 digest of the bytes signed.
 */
export async function signatureFor(
  identity: Identity,
  digest: Uint8Array
): Promise<Uint8Array> {
  readyWebCrypto()
  const certificates = identity.certificates.map((one) =>
    pkijs.Certificate.fromBER(bufferOf(one))
  )
  const [signer] = certificates
  const certificateHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bufferOf(identity.certificates[0]))
  )
  // ESS signing-certificate-v2: the certificate's SHA-256 hash (the default, so its algorithm is left out).
  const essCertificate = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [new asn1js.OctetString({ valueHex: certificateHash })],
          }),
        ],
      }),
    ],
  })
  const data = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID.data,
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: signer.issuer,
          serialNumber: signer.serialNumber,
        }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new pkijs.Attribute({
              type: OID.contentType,
              values: [new asn1js.ObjectIdentifier({ value: OID.data })],
            }),
            new pkijs.Attribute({
              type: OID.messageDigest,
              values: [new asn1js.OctetString({ valueHex: digest })],
            }),
            new pkijs.Attribute({
              type: OID.signingCertificateV2,
              values: [essCertificate],
            }),
          ],
        }),
      }),
    ],
    certificates,
  })
  await data.sign(identity.key, 0, "SHA-256")
  const wrapped = new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: data.toSchema(true),
  })
  return new Uint8Array(wrapped.toSchema().toBER(false))
}
