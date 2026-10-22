// @vitest-environment node
/**
 * Archives of Blobs, tested by Info-ZIP's unzip and Python's zipfile:
 * plain archives and ZIP64 ones.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { crc32 } from "@/lib/image-resizer/zip"
import { crcOf, zipBlobs } from "./zip-blobs"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-zip-"))
const save = async (name: string, blob: Blob) => {
  const path = join(folder, name)
  writeFileSync(path, new Uint8Array(await blob.arrayBuffer()))
  return path
}
const listed = (path: string) =>
  execFileSync("python3", [
    "-I",
    "-c",
    "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print('\\n'.join(f'{i.filename}:{i.file_size}:{z.read(i).decode()}' for i in z.infolist()))",
    path,
  ])
    .toString()
    .trim()
    .split("\n")

const entries = () => [
  { name: "first.mp4", blob: new Blob(["first file"]) },
  { name: "vidéo deux.webm", blob: new Blob(["second", " file"]) },
  { name: "empty.mkv", blob: new Blob([]) },
]

describe("ZIP archives of Blobs", () => {
  it("is read by unzip and zipfile, names and bytes as given", async () => {
    const zip = await zipBlobs(entries(), { modified: new Date(2026, 9, 22) })
    expect(zip.type).toBe("application/zip")
    const path = await save("plain.zip", zip)
    expect(execFileSync("unzip", ["-tq", path]).toString()).toMatch(
      /No errors detected/
    )
    expect(listed(path)).toEqual([
      "first.mp4:10:first file",
      "vidéo deux.webm:11:second file",
      "empty.mkv:0:",
    ])
  })

  it("writes ZIP64 records for large entries and far offsets, mixed with plain ones", async () => {
    const path = await save(
      "wide.zip",
      await zipBlobs(entries(), { limit: 10 })
    )
    expect(execFileSync("unzip", ["-tq", path]).toString()).toMatch(
      /No errors detected/
    )
    expect(listed(path)).toEqual([
      "first.mp4:10:first file",
      "vidéo deux.webm:11:second file",
      "empty.mkv:0:",
    ])
  })

  it("writes a ZIP64 end when only the directory passes the limit", async () => {
    const path = await save(
      "directory.zip",
      await zipBlobs([{ name: "a", blob: new Blob([]) }], { limit: 40 })
    )
    expect(listed(path)).toEqual(["a:0:"])
  })

  it("writes a ZIP64 end for more than 65,534 entries", async () => {
    const many = Array.from({ length: 0xffff }, (_, index) => ({
      name: `${index}.txt`,
      blob: new Blob([]),
    }))
    const path = await save("many.zip", await zipBlobs(many))
    expect(listed(path)).toHaveLength(0xffff)
  })

  it("reads a Blob's checksum a piece at a time, and stops when asked", async () => {
    const bytes = new Uint8Array(300_000).map((_, index) => index % 251)
    expect(await crcOf(new Blob([bytes]))).toBe(crc32(bytes))
    const stop = new AbortController()
    stop.abort()
    await expect(zipBlobs(entries(), { signal: stop.signal })).rejects.toThrow()
  })
})
