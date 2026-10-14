// @vitest-environment node
import * as pkijs from "pkijs"
import { describe, expect, it } from "vitest"
import { CERTIFICATE_PASSWORD, certificateFile } from "@/tests/pdf-certificates"
import { readIdentity, signatureFor } from "./certificate"
import { checkSignature } from "./signatures"
import { coveredBy } from "./sign-bytes"

/** A file of some bytes with room for a signature in its middle, and a signature over the rest. */
async function signedFile(name = "rsa-aes") {
  const file = new TextEncoder().encode("%PDF before <ROOM> after %%EOF")
  const ranges = [0, 12, 18, file.length - 18]
  const identity = await readIdentity(
    certificateFile(name),
    CERTIFICATE_PASSWORD
  )
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", coveredBy(file, ranges))
  )
  const signature = await signatureFor(identity, digest)
  // The room keeps trailing zeros after the signature.
  const room = new Uint8Array(signature.length + 64)
  room.set(signature)
  return { file, ranges, room }
}

describe("checkSignature", () => {
  it.each(["rsa-aes", "ec-aes"])(
    "finds a signature made with %s intact over the bytes it covers, and names who made it",
    async (name) => {
      const { file, ranges, room } = await signedFile(name)
      expect(await checkSignature(file, ranges, room)).toMatchObject({
        intact: true,
        problem: "",
        signer: { name: `Sam Example (${name.split("-")[0]})` },
      })
    }
  )

  it("finds it broken when a byte it covers was changed", async () => {
    const { file, ranges, room } = await signedFile()
    const changed = file.slice()
    changed[3] = 120
    const checked = await checkSignature(changed, ranges, room)
    expect(checked.intact).toBe(false)
    expect(checked.signer?.name).toBe("Sam Example (rsa)")
    expect(checked.problem).toContain("The file was changed")
    // A byte in the room is not covered: changing it changes nothing.
    const roomy = file.slice()
    roomy[14] = 120
    expect((await checkSignature(roomy, ranges, room)).intact).toBe(true)
  })

  it("says when the signature cannot be read, or covers what is not there", async () => {
    const { file, ranges, room } = await signedFile()
    expect(await checkSignature(file, ranges, Uint8Array.of(1, 2, 3))).toEqual({
      intact: false,
      signer: null,
      problem: "This signature cannot be read.",
    })
    for (const bad of [
      [0, 12, 18],
      [1, 12, 18, 10],
      [0, -1, 18, 10],
      [0, 12, 10, 10],
      [0, 12, 18, -1],
      [0, 12, 18, file.length],
    ])
      expect((await checkSignature(file, bad, room)).problem).toBe(
        "What the signature says it covers is not in this file."
      )
    expect(ranges).toHaveLength(4)
  })

  it("cannot say who signed, nor find it intact, when the signature carries no certificate", async () => {
    const { file, ranges, room } = await signedFile()
    const info = pkijs.ContentInfo.fromBER(room.slice().buffer)
    const data = new pkijs.SignedData({ schema: info.content })
    data.certificates = undefined
    const bare = new Uint8Array(
      new pkijs.ContentInfo({
        contentType: info.contentType,
        content: data.toSchema(true),
      })
        .toSchema()
        .toBER(false)
    )
    expect(await checkSignature(file, ranges, bare)).toMatchObject({
      intact: false,
      signer: null,
    })
  })
})
