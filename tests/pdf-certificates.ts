/**
 * Checking the signatures of a PDF with other software, not with the
 * code that made them: each signature's bytes are put together from its
 * `/ByteRange` and checked by OpenSSL against the test authority, and
 * Poppler's `pdfsig` is asked when it is installed.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const CERTIFICATE_PASSWORD = "keepsimp"

/** A certificate file of the test set, by its name. */
export const certificateFile = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/certificates/${name}.p12`))

const has = (tool: string) => {
  try {
    execFileSync("which", [tool], { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}
export const HAS_PDFSIG = has("pdfsig")

/** How long a DER value is, header and all, from its header: the room after it is zeros. */
function derLength(der: Buffer) {
  const first = der[1]
  if (first < 0x80) return 2 + first
  const count = first & 0x7f
  let length = 0
  for (let at = 0; at < count; at++) length = length * 256 + der[2 + at]
  return 2 + count + length
}

/** What OpenSSL makes of each signature in a file, in the order they were written. */
export function opensslSignatures(bytes: Uint8Array) {
  const file = Buffer.from(bytes)
  const text = file.toString("latin1")
  const folder = mkdtempSync(join(tmpdir(), "keepsimp-pdfsig-"))
  return [
    ...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g),
  ].map((found, index) => {
    const [from, length, next, rest] = found.slice(1).map(Number)
    const covered = Buffer.concat([
      file.subarray(from, from + length),
      file.subarray(next, next + rest),
    ])
    const room = Buffer.from(text.slice(from + length + 1, next - 1), "hex")
    const signature = join(folder, `${index}.der`)
    const content = join(folder, `${index}.bin`)
    writeFileSync(signature, room.subarray(0, derLength(room)))
    writeFileSync(content, covered)
    let valid = true
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
          signature,
          "-content",
          content,
          "-noverify",
          "-out",
          join(folder, `${index}.out`),
        ],
        { stdio: "pipe" }
      )
    } catch {
      valid = false
    }
    return { valid, whole: next + rest === file.length }
  })
}

/** What Poppler's `pdfsig` says of a file's signatures, or null when it is not installed. */
export function pdfsigSays(bytes: Uint8Array) {
  if (!HAS_PDFSIG) return null
  const folder = mkdtempSync(join(tmpdir(), "keepsimp-pdfsig-"))
  const file = join(folder, "signed.pdf")
  writeFileSync(file, bytes)
  try {
    return execFileSync("pdfsig", [file], { stdio: "pipe" }).toString()
  } catch (error) {
    return String((error as { stdout?: Buffer }).stdout ?? "")
  }
}
