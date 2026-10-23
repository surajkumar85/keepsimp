import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { hand, ran, ready, run, saved } from "./agent"
import {
  canEncode,
  decodesCleanly,
  packets,
  probe,
  reportWorkerErrors,
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
