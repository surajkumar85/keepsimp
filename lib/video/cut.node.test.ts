// @vitest-environment node
/**
 * Cutting without encoding, in Node, on a file FFmpeg makes with a
 * keyframe every second and B-frames: FFmpeg must decode exactly the
 * source's frames in the parts kept, and the sound must last as long.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { beforeAll, describe, expect, it } from "vitest"
import { fastStart } from "./faststart"
import {
  composeTurn,
  convertVideo,
  joinParts,
  readVideo,
} from "./mediabunny-video"
import {
  defaultSettings,
  planFor,
  type VideoFacts,
  type VideoSettings,
} from "./settings"
import type { Part } from "./trim"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-cut-"))
const source = join(folder, "source.mp4")
let facts: VideoFacts

beforeAll(async () => {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x240:rate=25:duration=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=6",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "25",
    "-bf",
    "2",
    "-c:a",
    "aac",
    source,
  ])
  facts = (await readVideo(mediabunny, new Blob([readFileSync(source)]), "mp4"))
    .facts
})

/** Hashes of every frame FFmpeg decodes, optionally only between times. */
function frames(path: string, ranges?: Part[]) {
  const select = ranges
    ? [
        "-vf",
        `select=${ranges.map((r) => `between(t\\,${r.start}\\,${r.end - 0.001})`).join("+")}`,
        "-fps_mode",
        "passthrough",
      ]
    : []
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    ...select,
    "-f",
    "framemd5",
    "-",
  ])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[5].trim())
}

const seconds = (path: string, stream: "v" | "a") =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      `${stream}:0`,
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      path,
    ])
      .toString()
      .trim()
  )

async function cut(parts: Part[], change: Partial<VideoSettings> = {}) {
  const plan = planFor(
    facts,
    { ...defaultSettings, ...change },
    () => false,
    undefined,
    { parts, exact: false }
  )
  expect(plan.problem).toBeNull()
  const target = new mediabunny.BufferTarget()
  const write = plan.cut?.mode === "join" ? joinParts : convertVideo
  await write(mediabunny, new Blob([readFileSync(source)]), plan, target)
  let file = new Blob([target.buffer!])
  if (plan.container === "mp4") file = (await fastStart(file)).file
  const out = join(
    folder,
    `cut-${Math.random().toString(36).slice(2)}.${plan.container}`
  )
  writeFileSync(out, new Uint8Array(await file.arrayBuffer()))
  return { plan, out }
}

describe("cutting without encoding", () => {
  it("reads a keyframe a second", () => {
    expect(facts.video!.keyframes).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("copies one part into an MP4, its edit list starting it where asked", async () => {
    const { plan, out } = await cut([{ start: 1.5, end: 4.2 }])
    expect(plan.cut).toEqual({ mode: "copy", parts: [{ start: 1.5, end: 5 }] })
    // An unbroken run of the source's frames, from within a frame of the
    // cut (the edit list's start) to within two (B-frames are copied in
    // decode order, so a copy can end a frame or two late).
    const all = frames(source)
    const kept = frames(out)
    const first = all.indexOf(kept[0])
    expect(kept).toEqual(all.slice(first, first + kept.length))
    expect(Math.abs(first / 25 - 1.5)).toBeLessThanOrEqual(0.04)
    // Whole groups of pictures: it ends on the keyframe at 5 s, nothing skipped.
    expect((first + kept.length) / 25).toBeCloseTo(5, 5)
    expect(seconds(out, "a")).toBeCloseTo(3.5, 1)
  })

  it("snaps one part to keyframes in MKV, every frame as the source's", async () => {
    const { plan, out } = await cut([{ start: 1.5, end: 4.2 }], {
      format: "mkv",
    })
    expect(plan.cut).toEqual({ mode: "copy", parts: [{ start: 1, end: 5 }] })
    expect(frames(out)).toEqual(frames(source, [{ start: 1, end: 5 }]))
  })

  it("joins two parts, each from its keyframe, the sound as long as the picture", async () => {
    const { plan, out } = await cut([
      { start: 0.5, end: 1.5 },
      { start: 3.2, end: 4.4 },
    ])
    const parts = [
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ]
    expect(plan.cut).toEqual({ mode: "join", parts })
    expect(frames(out)).toEqual(frames(source, parts))
    expect(seconds(out, "v")).toBeCloseTo(4, 1)
    expect(Math.abs(seconds(out, "a") - 4)).toBeLessThan(0.05)
    expect(
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        out,
        "-f",
        "null",
        "-",
      ]).toString()
    ).toBe("")
  })

  it("joins into MKV with the picture's turn kept as a setting", async () => {
    const { out } = await cut(
      [
        { start: 0, end: 1 },
        { start: 4, end: 6 },
      ],
      { format: "mkv" }
    )
    expect(frames(out)).toEqual(
      frames(source, [
        { start: 0, end: 1 },
        { start: 4, end: 6 },
      ])
    )
  })

  it("composes a turn after a mirror the other way", () => {
    expect(
      composeTurn({ rotation: 90, flip: false }, { rotation: 90, flip: true })
    ).toEqual({ rotation: 180, flip: true })
    expect(
      composeTurn({ rotation: 90, flip: true }, { rotation: 90, flip: false })
    ).toEqual({ rotation: 0, flip: true })
    expect(
      composeTurn({ rotation: 0, flip: true }, { rotation: 270, flip: true })
    ).toEqual({ rotation: 90, flip: false })
  })
})
