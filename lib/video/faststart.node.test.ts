// @vitest-environment node
/**
 * Fast start on files FFmpeg writes with the index last: FFprobe finds the
 * index first, and every frame and sound packet decodes as before.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fastStart, topBoxes } from "./faststart"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-faststart-"))

function made(name: string, args: string[]) {
  const path = join(folder, name)
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args, path])
  return path
}

/** A hash of every decoded frame and sound packet. */
const hashes = (path: string) =>
  execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "framemd5", "-"])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))

async function moved(path: string) {
  const result = await fastStart(new Blob([readFileSync(path)]))
  expect(result.moved).toBe(true)
  const out = path.replace(/(\.\w+)$/, "-fast$1")
  writeFileSync(out, new Uint8Array(await result.file.arrayBuffer()))
  return out
}

const order = async (path: string) =>
  (await topBoxes(new Blob([readFileSync(path)])))!
    .map((box) => box.type)
    .filter((type) => type === "moov" || type === "mdat")

describe("fast start on real files", () => {
  it("moves the index of an H.264 and AAC MP4 and keeps every frame", async () => {
    const path = made("clip.mp4", [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=25:duration=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
    ])
    expect(await order(path)).toEqual(["mdat", "moov"])
    const fast = await moved(path)
    expect(await order(fast)).toEqual(["moov", "mdat"])
    expect(hashes(fast)).toEqual(hashes(path))
  })

  it("moves the index of a MOV with several tracks", async () => {
    const path = made("clip.mov", [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=176x144:rate=15:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=330:duration=2",
      "-map",
      "0",
      "-map",
      "1",
      "-map",
      "2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "pcm_s16le",
    ])
    const fast = await moved(path)
    expect(await order(fast)).toEqual(["moov", "mdat"])
    expect(hashes(fast)).toEqual(hashes(path))
  })

  it("leaves a file FFmpeg already wrote with fast start", async () => {
    const path = made("fast.mp4", [
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x120:rate=10:duration=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ])
    expect(await fastStart(new Blob([readFileSync(path)]))).toMatchObject({
      moved: false,
      reason: "already",
    })
  })
})
