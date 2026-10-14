// @vitest-environment node
/**
 * Reading the signatures of real signed files with the engine: one signed
 * by another program (@signpdf), filled in and commented on after it was
 * signed (written after it, as the editor does), signed again by us, and
 * changed where its signature covers it.
 */
import { PDFDocument } from "@cantoo/pdf-lib"
import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import {
  CERTIFICATE_PASSWORD,
  certificateFile,
  HAS_PDFSIG,
  pdfsigSays,
} from "@/tests/pdf-certificates"
import { makeSignedPdf, SIGNER } from "@/tests/pdf-signing"
import { readIdentity } from "./certificate"
import { lettersOn } from "./mupdf-comments"
import { certify } from "./mupdf-certify"
import { applyComments } from "./mupdf-comments"
import { startEditing, stopEditing, type EditSession } from "./mupdf-edit"
import { applyFields, fieldsOn } from "./mupdf-forms"
import { exportAfter } from "./mupdf-signed"
import { signaturesOf } from "./mupdf-signatures"

const field = (session: EditSession, name: string) =>
  fieldsOn(session, 0).find((one) => one.name === name)!

/** A signed form, filled in after it was signed and given a highlight, written after the signature. */
async function filledAfter() {
  const signed = await makeSignedPdf()
  const session = startEditing(mupdf, signed)
  applyFields(mupdf, session, {
    label: "Fill in",
    ops: [{ do: "fill", page: 0, id: field(session, "name").id, value: "Ada" }],
  })
  const [line] = lettersOn(session, 0)
  const first = line.quads[0]
  const last = line.quads.at(-1)!
  applyComments(mupdf, session, {
    label: "Highlight",
    ops: [
      {
        do: "mark",
        page: 0,
        kind: "highlight",
        quads: [
          [
            first[0],
            first[1],
            last[2],
            last[3],
            first[4],
            first[5],
            last[6],
            last[7],
          ],
        ],
        colour: [1, 0.85, 0],
      } as never,
    ],
  })
  const { bytes } = await exportAfter(mupdf, session)
  stopEditing(session)
  return { signed, bytes }
}

describe("reading a file's signatures", () => {
  it("finds a signature another program made, intact over the whole file, with who and when", async () => {
    const signed = await makeSignedPdf()
    const [one, ...rest] = await signaturesOf(mupdf, signed)
    expect(rest).toEqual([])
    expect(one).toMatchObject({
      field: "Signature1",
      page: 0,
      shown: true,
      kind: "adbe.pkcs7.detached",
      time: "2026-10-12T00:00:00.000Z",
      reason: "Approved",
      whole: true,
      changes: null,
      verdict: {
        checked: true,
        intact: true,
        signer: { name: SIGNER, selfSigned: true },
      },
    })
  })

  it("says what was added after a signature: a field filled in and a comment", async () => {
    const { bytes } = await filledAfter()
    const [one] = await signaturesOf(mupdf, bytes)
    expect(one.whole).toBe(false)
    expect(one.verdict).toMatchObject({ checked: true, intact: true })
    expect(one.changes).toMatchObject({
      updates: 1,
      pagesAdded: 0,
      pagesRemoved: 0,
      pagesChanged: [0],
      commentsAdded: 1,
      commentsRemoved: 0,
      fieldsChanged: ["name"],
      signaturesAdded: [],
      detailsChanged: false,
    })
    // Poppler agrees: the signature holds, over the file as it was signed.
    if (HAS_PDFSIG) {
      const said = pdfsigSays(bytes)!
      expect(said).toContain("Signature is Valid.")
      expect(said).toContain("Not total document signed")
    }
  })

  it("finds a second signature made after the first, both holding", async () => {
    const signed = await makeSignedPdf({ plain: true })
    const identity = await readIdentity(
      certificateFile("ec-aes"),
      CERTIFICATE_PASSWORD
    )
    const twice = await certify(
      mupdf,
      signed,
      identity,
      {
        place: { kind: "none" },
        reason: "Seen",
        location: "Leeds",
      },
      new Date("2026-12-01T12:00:00Z")
    )
    const [first, second] = await signaturesOf(mupdf, twice.bytes)
    expect(first).toMatchObject({ field: "Signature1", whole: false })
    expect(first.changes?.signaturesAdded).toEqual(["Signature"])
    expect(first.changes?.pagesChanged).toEqual([])
    expect(second).toMatchObject({
      field: "Signature",
      shown: false,
      kind: "ETSI.CAdES.detached",
      time: "2026-12-01T12:00:00.000Z",
      reason: "Seen",
      location: "Leeds",
      name: "Sam Example (ec)",
      whole: true,
      verdict: {
        checked: true,
        intact: true,
        signer: { issuer: "KeepSimp Test Authority" },
      },
    })
  })

  it("shows what a signature said when it was signed, and that it was written anew after", async () => {
    const signed = await makeSignedPdf({ plain: true })
    const doc = new mupdf.PDFDocument(signed)
    const [widget] = doc
      .loadPage(0)
      .getWidgets()
      .filter((one) => one.getFieldType() === "signature")
    const value = widget.getObject().get("V")
    value.put("Reason", doc.newString("Never signed"))
    value.put("M", doc.newString("D:20200101000000Z"))
    const rewritten = doc.saveToBuffer("incremental").asUint8Array().slice()
    doc.destroy()
    const [one] = await signaturesOf(mupdf, rewritten)
    expect(one).toMatchObject({
      reason: "Approved",
      time: "2026-10-12T00:00:00.000Z",
      whole: false,
      verdict: { checked: true, intact: true },
      changes: { detailsChanged: true, fieldsChanged: [], pagesChanged: [] },
    })
  })

  it("finds a signature broken when what it covers was changed", async () => {
    const signed = await makeSignedPdf({ plain: true })
    const text = Buffer.from(signed).toString("latin1")
    const at = text.indexOf("/Producer")
    expect(at).toBeGreaterThan(0)
    const changed = signed.slice()
    changed[at + 1] = "Q".charCodeAt(0)
    const [one] = await signaturesOf(mupdf, changed)
    expect(one.verdict).toMatchObject({ checked: true, intact: false })
    if (HAS_PDFSIG)
      expect(pdfsigSays(changed)).not.toContain("Signature is Valid.")
  })

  it("finds none in a file that is not signed", async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    expect(await signaturesOf(mupdf, await doc.save())).toEqual([])
  })
})
