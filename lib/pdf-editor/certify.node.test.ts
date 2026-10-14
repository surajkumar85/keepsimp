// @vitest-environment node
/**
 * Signing written files with certificates, with the real engine: each
 * result is checked by OpenSSL and, where it is installed, by Poppler's
 * pdfsig, and read by pdf-lib and pdf.js.
 */
import { degrees, PDFDocument, StandardFonts } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import {
  CERTIFICATE_PASSWORD,
  certificateFile,
  HAS_PDFSIG,
  opensslSignatures,
  pdfsigSays,
} from "@/tests/pdf-certificates"
import { danglingRefs, texts } from "@/tests/pdf-reader"
import { makeSignedPdf } from "@/tests/pdf-signing"
import { readIdentity } from "./certificate"
import { defaultSpec } from "./form-fields"
import { certify } from "./mupdf-certify"
import { exportEdited, startEditing, stopEditing } from "./mupdf-edit"
import { applyMakeFields } from "./mupdf-form-fields"

const identity = (name = "rsa-aes") =>
  readIdentity(certificateFile(name), CERTIFICATE_PASSWORD)
// The test certificates are valid from the day they were made, 14 October 2026, for twenty years.
const NOW = new Date("2026-12-01T12:00:00Z")

/** A letter of two pages, the second turned to be shown on its side. */
async function letter() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc
    .addPage([400, 300])
    .drawText("A contract to sign", { x: 40, y: 250, size: 18, font })
  const turned = doc.addPage([300, 400])
  turned.setRotation(degrees(90))
  turned.drawText("Page two", { x: 40, y: 40, size: 14, font })
  return doc.save()
}

/**
 * What a page shows in words, its widgets' looks included, with the way
 * each line runs as the page is shown.
 */
function shownLines(doc: mupdf.Document, index: number) {
  const list = doc.loadPage(index).toDisplayList(true)
  const lines: { text: string; along: number[] }[] = []
  let line = { text: "", along: [1, 0] }
  try {
    list.toStructuredText("preserve-whitespace").walk({
      beginLine(_box, _wmode, along) {
        line = { text: "", along: [...along] }
      },
      onChar(letter) {
        line.text += letter
      },
      endLine() {
        lines.push(line)
      },
    })
  } finally {
    list.destroy()
  }
  return lines
}

/** What the signature fields of a file are, read by pdf-lib. */
async function signatureFields(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc
    .getForm()
    .getFields()
    .filter((field) => field.constructor.name === "PDFSignature")
    .map((field) => field.getName())
}

describe("signing with a certificate", () => {
  it.each(["rsa-aes", "ec-legacy"])(
    "signs a file unseen with %s, and other software says the signature holds over the whole file",
    async (name) => {
      const file = await letter()
      const done = await certify(
        mupdf,
        file,
        await identity(name),
        {
          place: { kind: "none" },
          reason: "I agree",
          location: "London",
        },
        NOW
      )
      expect(done).toMatchObject({ field: "Signature", page: null })
      expect(done.checked.intact).toBe(true)
      expect(done.checked.signer?.name).toBe(
        `Sam Example (${name.split("-")[0]})`
      )
      // Written after the file: what came first is there byte for byte.
      expect(done.bytes.subarray(0, file.length)).toEqual(file)
      expect(opensslSignatures(done.bytes)).toEqual([
        { valid: true, whole: true },
      ])
      expect(await danglingRefs(done.bytes)).toEqual([])
      expect(await signatureFields(done.bytes)).toEqual(["Signature"])
      expect((await texts(done.bytes))[0]).toContain("A contract to sign")
      if (HAS_PDFSIG) {
        const said = pdfsigSays(done.bytes)!
        expect(said).toContain("Signature is Valid.")
        expect(said).toContain("Total document signed")
        expect(said).toContain("Signature Type: ETSI.CAdES.detached")
      }
    }
  )

  it("shows a signature in a box at the foot of a turned page, upright as the page is shown", async () => {
    const done = await certify(
      mupdf,
      await letter(),
      await identity(),
      {
        place: { kind: "box", page: 1 },
        reason: "Approved",
        location: "",
      },
      NOW
    )
    expect(done.page).toBe(1)
    expect(opensslSignatures(done.bytes)).toEqual([
      { valid: true, whole: true },
    ])
    // The box is on the page, and its words read the right way as the page is shown.
    const doc = mupdf.PDFDocument.openDocument(done.bytes, "application/pdf")
    try {
      const page = doc.loadPage(1)
      const [widget] = (page as mupdf.PDFPage).getWidgets()
      const [x0, y0, x1, y1] = widget.getBounds()
      const [, , width, height] = page.getBounds()
      expect(x0).toBeGreaterThan(0)
      expect(y0).toBeGreaterThan(0)
      expect(x1).toBeLessThanOrEqual(width)
      expect(y1).toBeLessThanOrEqual(height)
      // At the foot, on the right, as shown.
      expect(x1).toBeGreaterThan(width / 2)
      expect(y1).toBeGreaterThan(height / 2)
      const lines = shownLines(doc, 1)
      const first = lines.find((one) =>
        one.text.includes("Digitally signed by")
      )!
      expect(first.text).toContain("Digitally signed by Sam Example (rsa)")
      // Across the page as it is shown, from the left: upright.
      expect(first.along[0]).toBeCloseTo(1)
      expect(first.along[1]).toBeCloseTo(0)
      expect(lines.map((one) => one.text).join("\n")).toContain(
        "Reason: Approved"
      )
    } finally {
      doc.destroy()
    }
    if (HAS_PDFSIG)
      expect(pdfsigSays(done.bytes)).toContain("Signature is Valid.")
  })

  it("signs into an empty place for a signature that the form has", async () => {
    const session = startEditing(mupdf, await letter())
    applyMakeFields(mupdf, session, {
      label: "Add a field",
      ops: [
        {
          do: "add",
          page: 0,
          box: { x: 160, y: 200, width: 200, height: 60 },
          field: { ...defaultSpec("signature"), name: "Approver" },
        },
      ],
    })
    const { bytes } = await exportEdited(mupdf, session)
    stopEditing(session)
    const done = await certify(
      mupdf,
      bytes,
      await identity("ec-aes"),
      {
        place: { kind: "field", name: "Approver" },
        reason: "",
        location: "",
      },
      NOW
    )
    expect(done).toMatchObject({ field: "Approver", page: 0 })
    expect(opensslSignatures(done.bytes)).toEqual([
      { valid: true, whole: true },
    ])
    expect(await signatureFields(done.bytes)).toEqual(["Approver"])
    const doc = mupdf.PDFDocument.openDocument(done.bytes, "application/pdf")
    try {
      expect(
        shownLines(doc, 0)
          .map((one) => one.text)
          .join("\n")
      ).toContain("Digitally signed by Sam Example (ec)")
    } finally {
      doc.destroy()
    }
    // Signed, the place is no longer empty: it cannot be signed into again.
    await expect(
      certify(
        mupdf,
        done.bytes,
        await identity(),
        {
          place: { kind: "field", name: "Approver" },
          reason: "",
          location: "",
        },
        NOW
      )
    ).rejects.toThrow(
      "There is no empty place for a signature called “Approver”."
    )
  })

  it("adds a signature after one a file already has, and both hold", async () => {
    const signed = await makeSignedPdf({ plain: true })
    const done = await certify(
      mupdf,
      signed,
      await identity(),
      {
        place: { kind: "none" },
        reason: "",
        location: "",
      },
      NOW
    )
    expect(done.bytes.subarray(0, signed.length)).toEqual(signed)
    // The first covers the file as it was; the second, all of it.
    expect(opensslSignatures(done.bytes)).toEqual([
      { valid: true, whole: false },
      { valid: true, whole: true },
    ])
    expect(await signatureFields(done.bytes)).toEqual([
      "Signature1",
      "Signature",
    ])
    if (HAS_PDFSIG) {
      const said = pdfsigSays(done.bytes)!
      expect(said.match(/Signature is Valid\./g)).toHaveLength(2)
    }
  })

  it("refuses what it cannot sign, and says why", async () => {
    const none = { place: { kind: "none" as const }, reason: "", location: "" }
    await expect(
      certify(mupdf, await letter(), await identity("expired"), none, NOW)
    ).rejects.toThrow("This certificate expired on 1 February 2020")
    await expect(
      certify(
        mupdf,
        await letter(),
        await identity(),
        none,
        new Date("2020-01-01")
      )
    ).rejects.toThrow("This certificate is not valid until")
    await expect(
      certify(
        mupdf,
        await letter(),
        await identity(),
        {
          ...none,
          place: { kind: "box", page: 5 },
        },
        NOW
      )
    ).rejects.toThrow("That page is not in the file.")
    // Locked with a password at download: not signed here.
    const session = startEditing(mupdf, await letter())
    const { bytes: locked } = await exportEdited(mupdf, session, {
      lock: { password: "open", ownerPassword: "owner", permissions: -4 },
    })
    stopEditing(session)
    await expect(
      certify(mupdf, locked, await identity(), none, NOW)
    ).rejects.toThrow("A file locked with a password cannot be signed here.")
  })
})
