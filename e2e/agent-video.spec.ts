import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { hand, ran, ready, run, saved } from "./agent"
import {
  canEncode,
  decodesCleanly,
  frameHashes,
  packets,
  probe,
  reportWorkerErrors,
  frameAt,
  plainPicture,
  plainClip,
  soundOf,
  toneFile,
  toneLevel,
  topOrder,
} from "./video"

reportWorkerErrors()

const clip = readFileSync("public/samples/keepsimp-clip.mp4")

test("reads a video and copies it into MKV as it is, for an agent", async ({
  page,
}) => {
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  const info = await ran(page, "video_info", { file })
  expect(info.summary).toBe(
    "clip.mp4: MP4 · H.264 · 320 × 180 · 15 fps · 0:06, 124 KB."
  )
  const mkv = await ran(page, "convert_video", { file, format: "mkv" })
  expect(mkv.summary).toMatch(
    /^The picture \(H\.264\) is copied as it is, without encoding it again/
  )
  const out = await saved(page, mkv.files![0].id)
  expect(out.name).toBe("clip.mkv")
  expect(packets(out.bytes, "agent.mkv", "v")).toEqual(
    packets(clip, "agent-source.mp4", "v")
  )
  // A turn into an MP4 is a setting; the index is in front.
  const turned = await ran(page, "convert_video", { file, rotate: 270 })
  const mp4 = await saved(page, turned.files![0].id)
  const order = topOrder(mp4.bytes)
  expect(order.indexOf("moov")).toBeLessThan(order.indexOf("mdat"))
  expect(
    probe(mp4.bytes, "agent-turned.mp4").streams.find(
      (one) => one.codec_type === "video"
    )
  ).toMatchObject({ codec_name: "h264" })
})

test("encodes for an agent, or says what this browser cannot write", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  const settings = {
    file,
    format: "webm",
    quality: "small",
    frameRate: 15,
    sound: "none",
  }
  if (!(await canEncode(page, "vp9", 320, 180))) {
    expect(await run(page, "convert_video", settings)).toMatchObject({
      ok: false,
      problem: expect.stringContaining("cannot write a picture WebM holds"),
    })
    return
  }
  const webm = await ran(page, "convert_video", settings)
  expect(webm.summary).toMatch(/^The picture is encoded again as VP9/)
  const out = await saved(page, webm.files![0].id)
  const said = probe(out.bytes, "agent.webm")
  expect(said.streams.map((one) => one.codec_name)).toEqual(["vp9"])
  expect(Number(said.streams[0].nb_read_frames)).toBe(90)
  expect(decodesCleanly(out.bytes, "agent.webm")).toBe(true)
  // What is not read here is refused in words.
  const avi = await hand(
    page,
    "old.avi",
    Buffer.from("RIFF\0\0\0\0AVI LIST", "latin1"),
    "video/x-msvideo"
  )
  expect(await run(page, "video_info", { file: avi })).toMatchObject({
    ok: false,
    problem: expect.stringContaining("AVI files are not read here"),
  })
})

test("compresses a video under a size for an agent", async ({ page }) => {
  test.setTimeout(240_000)
  await ready(page)
  if (!(await canEncode(page, "avc", 960, 540))) test.skip()
  const scene = readFileSync("public/samples/keepsimp-scene.mp4")
  const file = await hand(page, "scene.mp4", scene, "video/mp4")
  expect(await run(page, "compress_video", { file })).toMatchObject({
    ok: false,
    problem: expect.stringContaining('Give either "megabytes" or "share".'),
  })
  const smaller = await ran(page, "compress_video", { file, megabytes: 0.5 })
  expect(smaller.summary).toMatch(/because it is to fit under 512 KB/)
  expect(smaller.summary).toMatch(/Looks /)
  const out = await saved(page, smaller.files![0].id)
  expect(out.bytes.length).toBeLessThanOrEqual(512 * 1024)
  expect(decodesCleanly(out.bytes, "agent-small.mp4")).toBe(true)
})

test("trims a video and saves a frame, for an agent", async ({ page }) => {
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  const trimmed = await ran(page, "trim_video", {
    file,
    keep: [{ start: 1.5, end: 4 }],
  })
  expect(trimmed.summary).toContain("the file says where to start playing")
  const out = await saved(page, trimmed.files![0].id)
  expect(out.name).toBe("clip-trimmed.mp4")
  // One keyframe at the start, so the copy runs on to the end: 4.5 s shown.
  expect(
    Number(probe(out.bytes, "agent-trimmed.mp4").format.duration)
  ).toBeCloseTo(4.5, 1)
  expect(decodesCleanly(out.bytes, "agent-trimmed.mp4")).toBe(true)
  const frame = await ran(page, "video_frame", { file, seconds: 2 })
  expect(frame.summary).toMatch(/^The frame at 0:02\.00: 320 × 180 PNG, /)
  const png = await saved(page, frame.files![0].id)
  expect(png.name).toBe("clip 0-02.00.png")
  expect([...png.bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47])
})

test("splits a video into files at its keyframes, for an agent", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await ready(page)
  const scene = readFileSync("public/samples/keepsimp-scene.mp4")
  const file = await hand(page, "scene.mp4", scene, "video/mp4")
  const split = await ran(page, "split_video", { file, at: [2, 4] })
  expect(split.summary).toMatch(/^Split into 3 files\./)
  expect(split.files).toHaveLength(3)
  const all = frameHashes(scene, "agent-scene.mp4")
  for (const [index, ref] of split.files!.entries()) {
    const out = await saved(page, ref.id)
    expect(out.name).toBe(`scene-part-${index + 1}.mp4`)
    expect(frameHashes(out.bytes, `agent-part-${index}.mp4`)).toEqual(
      all.slice(index * 60, (index + 1) * 60)
    )
  }
})

test("crops to a square and speeds up, for an agent", async ({ page }) => {
  test.setTimeout(120_000)
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  if (!(await canEncode(page, "avc", 180, 180))) test.skip()
  const done = await ran(page, "convert_video", {
    file,
    shape: "1:1",
    speed: 2,
  })
  expect(done.summary).toContain("It plays twice as fast")
  const out = await saved(page, done.files![0].id)
  const said = probe(out.bytes, "agent-square.mp4")
  expect(said.streams.find((one) => one.codec_type === "video")).toMatchObject({
    width: 180,
    height: 180,
  })
  expect(Number(said.format.duration)).toBeCloseTo(3, 0)
  expect(decodesCleanly(out.bytes, "agent-square.mp4")).toBe(true)
})

test("puts a soundtrack under a video, for an agent", async ({ page }) => {
  test.setTimeout(120_000)
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  const tone = toneFile("agent-tone.m4a", 880, 2)
  const music = await hand(page, tone.name, tone.buffer, "audio/mp4")
  const done = await ran(page, "convert_video", { file, soundtrack: music })
  expect(done.summary).toContain(
    "The sound is agent-tone.m4a, in place of the video's own."
  )
  const out = await saved(page, done.files![0].id)
  const sound = soundOf(out.bytes, "agent-soundtrack.mp4")
  expect(toneLevel(sound, 880, 0.5, 1.5)).toBeGreaterThan(0.05)
  expect(packets(out.bytes, "agent-soundtrack.mp4", "v")).toEqual(
    packets(clip, "agent-soundtrack-in.mp4", "v")
  )
})

test("writes text and draws a logo on a video, for an agent", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await ready(page)
  const file = await hand(page, "clip.mp4", clip, "video/mp4")
  const red = plainPicture("agent-logo.png", "red", "60x60")
  const logo = await hand(page, red.name, red.buffer, "image/png")
  const done = await ran(page, "convert_video", {
    file,
    captionTop: "Hello",
    logo,
    logoCorner: "bottom-left",
    logoSize: 20,
  })
  expect(done.summary).toMatch(
    /text is written on it and a logo is drawn on it/
  )
  const out = await saved(page, done.files![0].id)
  // 320 × 180: the logo 64 px wide, 7 px in from the bottom left.
  const frame = frameAt(out.bytes, "agent-overlay.mp4", 1)
  const [r, g, b] = frame.at(39, 140)
  expect(r).toBeGreaterThan(180)
  expect(g + b).toBeLessThan(140)
})

test("trims a video and makes a GIF of it with convert_animation, for an agent", async ({
  page,
}) => {
  test.setTimeout(150_000)
  await ready(page)
  const scene = readFileSync("public/samples/keepsimp-scene.mp4")
  const file = await hand(page, "scene.mp4", scene, "video/mp4")
  const trimmed = await ran(page, "trim_video", {
    file,
    keep: [{ start: 2, end: 4 }],
  })
  const gif = await ran(page, "convert_animation", {
    files: [trimmed.files![0].id],
    to: "gif",
    longEdge: 320,
  })
  const out = await saved(page, gif.files![0].id)
  expect(out.name).toMatch(/\.gif$/)
  const said = probe(out.bytes, "agent-scene.gif")
  expect(said.streams[0]).toMatchObject({
    codec_name: "gif",
    width: 320,
    height: 180,
  })
  expect(Number(said.format.duration)).toBeCloseTo(2, 0)
})

test("joins two videos into one, for an agent", async ({ page }) => {
  test.setTimeout(120_000)
  await ready(page)
  const first = await hand(page, "one.mp4", clip, "video/mp4")
  const second = await hand(page, "two.mp4", clip, "video/mp4")
  const done = await ran(page, "join_videos", { files: [first, second] })
  expect(done.summary).toContain("the pictures copied as they are.")
  const out = await saved(page, done.files![0].id)
  expect(out.name).toBe("one-joined.mp4")
  const once = frameHashes(clip, "agent-join-in.mp4")
  expect(frameHashes(out.bytes, "agent-joined.mp4")).toEqual([...once, ...once])
})

test("writes subtitles on a video, for an agent", async ({ page }) => {
  test.setTimeout(120_000)
  await ready(page)
  const blue = plainClip("agent-blue.mp4", "blue", 3)
  const file = await hand(page, blue.name, blue.buffer, "video/mp4")
  const srt = await hand(
    page,
    "agent.srt",
    Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHELLO HELLO\n"),
    "application/x-subrip"
  )
  const done = await ran(page, "convert_video", { file, subtitles: srt })
  expect(done.summary).toContain(
    "1 subtitle from agent.srt is written on the picture."
  )
  const out = await saved(page, done.files![0].id)
  const white = (seconds: number) => {
    const frame = frameAt(out.bytes, `agent-subs-${seconds}.mp4`, seconds)
    let count = 0
    for (let y = 250; y < 360; y++)
      for (let x = 0; x < 640; x += 2) {
        const [r, g, b] = frame.at(x, y)
        if (r > 200 && g > 200 && b > 200) count++
      }
    return count
  }
  expect(white(0.5)).toBe(0)
  expect(white(1.5)).toBeGreaterThan(200)
})
