// @vitest-environment node
/**
 * The engine on files FFmpeg makes, in Node: facts read as FFprobe reads
 * them, and copies between kinds whose packets FFmpeg finds unchanged.
 * Node has no video encoder or decoder, so encoding is tested in browsers.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as mediabunny from "mediabunny"
import { describe, expect, it } from "vitest"
import { writtenProblems } from "./check"
import { fastStart } from "./faststart"
import { sniffContainer, type Container } from "./formats"
import {
  convertVideo,
  readBack,
  readVideo,
  VideoProblem,
} from "./mediabunny-video"
import { defaultSettings, planFor, type VideoSettings } from "./settings"

const folder = mkdtempSync(join(tmpdir(), "keepsimp-video-"))

function made(name: string, args: string[]) {
  const path = join(folder, name)
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args, path])
  return path
}
const picture = (size = "320x240", rate = 25, seconds = 2) => [
  "-f",
  "lavfi",
  "-i",
  `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
]
const tone = (seconds = 2) => [
  "-f",
  "lavfi",
  "-i",
  `sine=frequency=440:duration=${seconds}`,
]
const blobOf = (path: string) => new Blob([readFileSync(path)])
const kindOf = (path: string) =>
  sniffContainer(new Uint8Array(readFileSync(path).subarray(0, 4096)))!

/** Packet hashes of one stream, copied rather than decoded. */
const packets = (path: string, stream: "v" | "a") =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    `0:${stream}:0`,
    "-c",
    "copy",
    // H.264 the same way whatever the kind stored it as.
    ...(stream === "v" ? ["-bsf:v", "h264_mp4toannexb"] : []),
    "-f",
    "framemd5",
    "-",
  ])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    // The packet's own hash; side data (an encoder's priming, say) follows it.
    .map((line) => line.split(",")[5].trim())

/** Hashes of every decoded frame of the picture. */
const frames = (path: string) =>
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-f",
    "framemd5",
    "-",
  ])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[5].trim())

const probe = (path: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path,
    ]).toString()
  ) as {
    streams: {
      codec_type: string
      codec_name: string
      width?: number
      height?: number
      side_data_list?: { rotation?: number }[]
    }[]
    format: { duration: string }
  }

/** Write a file by the settings in Node, which can only copy, then read it back. */
async function written(path: string, change: Partial<VideoSettings>) {
  const { facts } = await readVideo(mediabunny, blobOf(path), kindOf(path))
  const plan = planFor(facts, { ...defaultSettings, ...change }, () => false)
  expect(plan.problem).toBeNull()
  const target = new mediabunny.BufferTarget()
  await convertVideo(mediabunny, blobOf(path), plan, target)
  let file = new Blob([target.buffer!])
  if (plan.container === "mp4" || plan.container === "mov")
    file = (await fastStart(file)).file
  const out = join(
    folder,
    `out-${Math.random().toString(36).slice(2)}.${plan.container}`
  )
  writeFileSync(out, new Uint8Array(await file.arrayBuffer()))
  const back = await readBack(mediabunny, file, plan.container)
  return { facts, plan, out, back }
}

describe("reading video files", () => {
  it("reads an H.264 and AAC MP4 as FFprobe does", async () => {
    const path = made("clip.mp4", [
      ...picture("640x360", 30, 3),
      ...tone(3),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ac",
      "2",
    ])
    const { facts, poster } = await readVideo(mediabunny, blobOf(path), "mp4")
    expect(poster).toBeNull()
    expect(facts.video).toMatchObject({
      codec: "avc",
      width: 640,
      height: 360,
      rotation: 0,
      flip: false,
      frameRate: 30,
      variableRate: false,
      hdr: false,
    })
    expect(facts.video!.bitrate).toBeGreaterThan(0)
    expect(facts.audio).toMatchObject({
      codec: "aac",
      sampleRate: 44100,
      channels: 2,
    })
    expect(facts.duration).toBeCloseTo(Number(probe(path).format.duration), 1)
    expect(facts.size).toBe(readFileSync(path).length)
  })

  it("reads VP9 and Opus in WebM, and HEVC in Matroska", async () => {
    const webm = made("clip.webm", [
      ...picture("320x240", 24, 2),
      ...tone(2),
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "300k",
      "-c:a",
      "libopus",
    ])
    const fromWebm = await readVideo(mediabunny, blobOf(webm), "webm")
    expect(fromWebm.facts.video).toMatchObject({ codec: "vp9", frameRate: 24 })
    expect(fromWebm.facts.audio).toMatchObject({ codec: "opus" })
    const mkv = made("clip.mkv", [
      ...picture("320x240", 25, 1),
      "-c:v",
      "libx265",
      "-x265-params",
      "log-level=error",
    ])
    const fromMkv = await readVideo(mediabunny, blobOf(mkv), "mkv")
    expect(fromMkv.facts.video).toMatchObject({ codec: "hevc" })
    expect(fromMkv.facts.audio).toBeNull()
  })

  it("reads a phone's turn as the size shown", async () => {
    const plain = made("upright.mp4", [
      ...picture("640x360", 25, 1),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ])
    const turned = join(folder, "turned.mp4")
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-display_rotation",
      "90",
      "-i",
      plain,
      "-c",
      "copy",
      turned,
    ])
    const { facts } = await readVideo(mediabunny, blobOf(turned), "mp4")
    expect(facts.video).toMatchObject({ width: 360, height: 640 })
    expect([90, 270]).toContain(facts.video!.rotation)
  })

  it("reads sound alone, and refuses what is not a video", async () => {
    const m4a = made("sound.m4a", [...tone(1), "-c:a", "aac"])
    const { facts } = await readVideo(mediabunny, blobOf(m4a), "mp4")
    expect(facts.video).toBeNull()
    expect(facts.audio).toMatchObject({ codec: "aac" })
    await expect(
      readVideo(mediabunny, new Blob(["not a video at all"]), "mp4")
    ).rejects.toThrow(VideoProblem)
  })
})

describe("copying between kinds", () => {
  const source = () =>
    made("source.mp4", [
      ...picture("320x240", 25, 2),
      ...tone(2),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
    ])

  it("copies an MP4 into MKV and back, every packet unchanged", async () => {
    const path = source()
    const mkv = await written(path, { format: "mkv" })
    expect(mkv.plan.video).toEqual({ action: "copy" })
    expect(kindOf(mkv.out)).toBe("mkv")
    expect(packets(mkv.out, "v")).toEqual(packets(path, "v"))
    expect(packets(mkv.out, "a")).toEqual(packets(path, "a"))
    const mp4 = await written(mkv.out, { format: "mp4" })
    expect(packets(mp4.out, "v")).toEqual(packets(path, "v"))
    expect(
      writtenProblems(
        mp4.plan,
        mp4.back.facts,
        { duration: mp4.facts.duration, frameRate: 25 },
        mp4.back.decoded
      )
    ).toEqual([])
  })

  it("turns a copy by its setting, which FFprobe reads", async () => {
    const turned = await written(source(), { rotate: 90 })
    expect(turned.plan.video).toEqual({ action: "copy" })
    expect(turned.back.facts.video).toMatchObject({ width: 240, height: 320 })
    const stream = probe(turned.out).streams.find(
      (one) => one.codec_type === "video"
    )!
    expect(Math.abs(stream.side_data_list![0].rotation!)).toBe(90)
  })

  it("leaves the sound out, and keeps it as MOV", async () => {
    const quiet = await written(source(), { sound: "none" })
    expect(probe(quiet.out).streams.map((one) => one.codec_type)).toEqual([
      "video",
    ])
    const mov = await written(source(), { format: "mov" })
    expect(kindOf(mov.out)).toBe("mov")
    expect(probe(mov.out).streams.map((one) => one.codec_name)).toEqual([
      "h264",
      "aac",
    ])
  })

  it("says what could not be written", async () => {
    const path = source()
    const { facts } = await readVideo(mediabunny, blobOf(path), "mp4")
    // A copy into a kind that cannot hold H.264, where Node cannot encode.
    const plan = {
      ...planFor(facts, defaultSettings, () => true),
      container: "webm" as const,
    }
    await expect(
      convertVideo(
        mediabunny,
        blobOf(path),
        plan,
        new mediabunny.BufferTarget()
      )
    ).rejects.toThrow(
      /^The picture could not be written: this browser cannot (play|write) it\. Choose another format or codec\.$/
    )
  })
})

describe("kinds read but not written", () => {
  it("copies a transport stream into MP4", async () => {
    const ts = made("clip.ts", [
      ...picture("320x240", 25, 2),
      ...tone(2),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
    ])
    expect(kindOf(ts) satisfies Container).toBe("ts")
    const mp4 = await written(ts, { format: "same" })
    expect(mp4.plan.container).toBe("mp4")
    expect(mp4.plan.notes[0]).toBe(
      "MPEG-TS is read here but not written, so it becomes an MP4."
    )
    // Start codes become lengths, so the packets differ by a byte; the frames do not.
    expect(frames(mp4.out)).toEqual(frames(ts))
  })
})
