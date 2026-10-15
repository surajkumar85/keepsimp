// @vitest-environment node
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { oggCrc, withOpusEnd } from "./ogg-end"

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`))
const folder = mkdtempSync(join(tmpdir(), "keepsimp-ogg-"))

/** The samples FFmpeg decodes at 48 kHz, which follows the last page's granule position. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return (
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", path, "-ac", "1", "-f", "s16le", "-"],
      { maxBuffer: 1 << 30 }
    ).length / 2
  )
}

describe("withOpusEnd", () => {
  it("ends an Opus file where its sound ends, with a page checksum FFmpeg accepts", () => {
    const opus = fixture("tone.opus")
    // Half a second at 48 kHz.
    expect(decoded(opus, "full.opus")).toBe(24000)
    const shorter = withOpusEnd(opus, 20000)
    expect(decoded(shorter, "short.opus")).toBe(20000)
    // FFmpeg reads the page without complaint: its checksum is right.
    const path = join(folder, "short.opus")
    expect(
      execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
        stdio: "pipe",
      }).toString()
    ).toBe("")
  })

  it("leaves a file that already ends there, or is not Ogg Opus, as it was", () => {
    const opus = fixture("tone.opus")
    expect(withOpusEnd(opus, 24000)).toBe(opus)
    expect(withOpusEnd(opus, 99999)).toBe(opus)
    const wav = fixture("tone.wav")
    expect(withOpusEnd(wav, 100)).toBe(wav)
    // Cut off after its first page, or inside it: no last page to change.
    for (const length of [200, 40]) {
      const cut = opus.slice(0, length)
      expect(withOpusEnd(cut, 100)).toBe(cut)
    }
  })

  it("works Ogg's checksum out", () => {
    expect(
      oggCrc(new Uint8Array(Array.from("123456789", (c) => c.charCodeAt(0))))
    ).toBe(0x89a1897f)
  })
})
