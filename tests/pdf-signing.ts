/**
 * PDFs that carry a real digital signature, for tests. The file is written
 * by pdf-lib, the signature is made by @signpdf with a certificate that is
 * made on the spot and signed by itself, so no key is kept anywhere.
 * Poppler's `pdfsig` says such a signature is valid and its signer unknown.
 */
import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
} from "@cantoo/pdf-lib"
import { SignPdf } from "@signpdf/signpdf"
import { P12Signer } from "@signpdf/signer-p12"
import forge from "node-forge"

/** Room for the signature, in bytes. */
const ROOM = 4096
export const SIGNER = "KeepSimp Test Signer"

let made: Buffer | null = null

/** A certificate and its key as a PKCS#12 file with the password "test", made once for a run. */
function certificate() {
  if (made) return made
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = "01"
  cert.validity.notBefore = new Date(Date.UTC(2026, 0, 1))
  cert.validity.notAfter = new Date(Date.UTC(2046, 0, 1))
  const who = [{ name: "commonName", value: SIGNER }]
  cert.setSubject(who)
  cert.setIssuer(who)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const packed = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "test", {
    algorithm: "3des",
  })
  made = Buffer.from(forge.asn1.toDer(packed).getBytes(), "binary")
  return made
}

export interface SignedOptions {
  pages?: number
  /** Leave the form's fields out: a signed letter, not a signed form. */
  plain?: boolean
}

/**
 * A signed form: every page says "signed-P<number>"; the first has a text
 * field "name", a tick box "agree" and a signature field "Signature1" that
 * has been signed.
 */
export async function makeSignedPdf(options: SignedOptions = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = Array.from({ length: options.pages ?? 1 }, (_, at) => {
    const page = doc.addPage([400, 600])
    page.drawText(`signed-P${at + 1}`, { x: 20, y: 570, size: 12, font })
    return page
  })
  const [first] = pages
  const form = doc.getForm()
  if (!options.plain) {
    form
      .createTextField("name")
      .addToPage(first, { x: 20, y: 500, width: 200, height: 20, font })
    form
      .createCheckBox("agree")
      .addToPage(first, { x: 20, y: 460, width: 16, height: 16 })
  }

  // The place the signature goes: its numbers and its bytes are filled in
  // by the signer, which looks for exactly this.
  const range = PDFArray.withContext(doc.context)
  range.push(PDFNumber.of(0))
  for (let at = 0; at < 3; at++) range.push(PDFName.of("**********"))
  const signature = doc.context.register(
    doc.context.obj({
      Type: "Sig",
      Filter: "Adobe.PPKLite",
      SubFilter: "adbe.pkcs7.detached",
      ByteRange: range,
      Contents: PDFHexString.of("0".repeat(ROOM * 2)),
      Reason: PDFString.of("Approved"),
      M: PDFString.fromDate(new Date(Date.UTC(2026, 9, 12))),
    })
  )
  const widget = doc.context.register(
    doc.context.obj({
      Type: "Annot",
      Subtype: "Widget",
      FT: "Sig",
      Rect: [20, 400, 220, 440],
      V: signature,
      T: PDFString.of("Signature1"),
      F: 4,
      P: first.ref,
    })
  )
  first.node.addAnnot(widget)
  form.acroForm.addField(widget)
  form.acroForm.dict.set(PDFName.of("SigFlags"), PDFNumber.of(3))

  const bytes = await doc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  })
  const signed = await new SignPdf().sign(
    Buffer.from(bytes),
    new P12Signer(certificate(), { passphrase: "test" })
  )
  return new Uint8Array(signed)
}

/**
 * What a file's first signature says, worked out with node-forge and
 * Node's own hashing, not with the engine: whether the signature is the
 * signer's over the bytes it names, whether those bytes are the whole
 * file, and who signed.
 */
export function readSignature(bytes: Uint8Array) {
  const file = Buffer.from(bytes)
  const text = file.toString("latin1")
  const found = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(
    text
  )
  if (!found) return { valid: false, whole: false, signer: "" }
  const [from, length, next, rest] = found.slice(1).map(Number)
  try {
    const covered = Buffer.concat([
      file.subarray(from, from + length),
      file.subarray(next, next + rest),
    ])
    // Between the two runs is the signature itself, as hexadecimal in angle brackets.
    const packed = Buffer.from(
      text.slice(from + length + 1, next - 1),
      "hex"
    ).toString("binary")
    const message = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(packed, { parseAllBytes: false } as never)
    ) as unknown as {
      certificates: forge.pki.Certificate[]
      rawCapture: {
        signature: string
        authenticatedAttributes: forge.asn1.Asn1[]
      }
    }
    const { signature, authenticatedAttributes: attributes } =
      message.rawCapture
    const [cert] = message.certificates
    // What was signed is the attributes, one of which is the hash of the bytes.
    const signed = forge.md.sha256.create()
    signed.update(
      forge.asn1.toDer(
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SET,
          true,
          attributes
        )
      ).data
    )
    const ours = (cert.publicKey as forge.pki.rsa.PublicKey).verify(
      signed.digest().getBytes(),
      signature
    )
    const hash = forge.md.sha256.create()
    hash.update(covered.toString("binary"))
    const wanted = hash.digest().getBytes()
    const digest = attributes
      .map((attribute) => attribute.value as forge.asn1.Asn1[])
      .find(
        ([type]) =>
          forge.asn1.derToOid(type.value as string) ===
          forge.pki.oids.messageDigest
      )
    const said = digest
      ? ((digest[1].value as forge.asn1.Asn1[])[0].value as string)
      : ""
    return {
      valid: ours && said === wanted,
      whole: next + rest === file.length,
      signer: String(cert.subject.getField("CN")?.value ?? ""),
    }
  } catch {
    return { valid: false, whole: false, signer: "" }
  }
}
