import { readFileSync } from "node:fs"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import { bytesOf } from "./pdf"
import {
  canEncode,
  chip,
  clip,
  COMPRESSOR,
  CONVERTER,
  decodesCleanly,
  download,
  EDITOR,
  item,
  open,
  packets,
  probe,
  sample,
  settled,
  syncClip,
  syncOffset,
  topOrder,
  reportWorkerErrors,
} from "./video"

reportWorkerErrors()

test("copies the sample into an MP4 as it is, index first, every packet unchanged", async ({
  page,
}) => {
  await page.goto(CONVERTER)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(page.getByTestId("video-plan")).toContainText(
    "The picture (H.264) is copied as it is, without encoding it again"
  )
  await expect(page.getByTestId("video-plan")).toContainText(
    "Written and checked"
  )
  const result = await download(page, "keepsimp-clip.mp4")
  expect(result.name).toBe("keepsimp-clip-converted.mp4")
  const original = readFileSync("public/samples/keepsimp-clip.mp4")
  expect(packets(result.bytes, "copy.mp4", "v")).toEqual(
    packets(original, "original.mp4", "v")
  )
  expect(packets(result.bytes, "copy.mp4", "a")).toEqual(
    packets(original, "original.mp4", "a")
  )
  const order = topOrder(result.bytes)
  expect(order.indexOf("moov")).toBeLessThan(order.indexOf("mdat"))
  // The help is written out, the numbers in it too.
  const help = page.locator("#tutorial-title").locator("..")
  await expect(help).toContainText("Up to 20 at once.")
  await expect(help).not.toContainText("function")
  // The door says what it is.
  await page.getByRole("button", { name: "Clear all" }).click()
  await expect(page.getByTestId("video-focused")).toContainText(
    "This page is the Video editor, opened for converting."
  )
})

test("writes WebM with VP9 and Opus, every frame there and decoding cleanly", async ({
  page,
}) => {
  await open(page, [sample()])
  await chip(page, "WebM").click()
  const vp9 = await canEncode(page, "vp9", 320, 180)
  if (!vp9) {
    await expect(item(page, "keepsimp-clip.mp4")).toContainText(
      "This browser cannot write a picture WebM holds at 320 × 180"
    )
    return
  }
  // New settings are taken up after a moment: wait for the plan to follow.
  await expect(page.getByTestId("video-plan")).toContainText(
    "encoded again as VP9"
  )
  await settled(page)
  await expect(page.getByTestId("video-result")).toContainText(
    "WebM · VP9 · 320 × 180 · 15 fps · 0:06"
  )
  const result = await download(page, "keepsimp-clip.mp4")
  expect(result.name).toBe("keepsimp-clip.webm")
  const said = probe(result.bytes, "clip.webm")
  const picture = said.streams.find((one) => one.codec_type === "video")!
  expect(picture).toMatchObject({ codec_name: "vp9", width: 320, height: 180 })
  expect(Number(picture.nb_read_frames)).toBe(90)
  expect(
    said.streams.find((one) => one.codec_type === "audio")?.codec_name
  ).toBe("opus")
  expect(Number(said.format.duration)).toBeCloseTo(6, 0)
  expect(decodesCleanly(result.bytes, "clip.webm")).toBe(true)
})

test("makes a 720p clip 360p at 15 frames a second, small, as H.264", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const source = clip("wide.mp4", { size: "1280x720", rate: 30, seconds: 3 })
  await page.goto(EDITOR)
  if (!(await canEncode(page, "avc", 640, 360))) test.skip()
  await page.locator("#video-file").setInputFiles([source])
  await settled(page)
  await chip(page, "Small").click()
  await chip(page, "360p").click()
  await chip(page, "15 fps").click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "The picture is encoded again as H.264, 640 × 360 at 15 frames a second"
  )
  await settled(page)
  const result = await download(page, "wide.mp4")
  const said = probe(result.bytes, "small.mp4")
  const picture = said.streams.find((one) => one.codec_type === "video")!
  expect(picture).toMatchObject({ codec_name: "h264", width: 640, height: 360 })
  expect(picture.r_frame_rate).toBe("15/1")
  expect(Number(picture.nb_read_frames)).toBe(45)
  expect(Number(said.format.duration)).toBeCloseTo(3, 0)
  expect(result.bytes.length).toBeLessThan(source.buffer.length)
  expect(decodesCleanly(result.bytes, "small.mp4")).toBe(true)
})

test("turns an MP4 by its setting and an MKV by redrawing, and leaves sound out", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await open(page, [sample()])
  await chip(page, "90° right").click()
  await settled(page)
  await expect(page.getByTestId("video-plan")).toContainText(
    "The turn is written as a setting that players follow"
  )
  const turned = await download(page, "keepsimp-clip.mp4")
  const picture = probe(turned.bytes, "turned.mp4").streams.find(
    (one) => one.codec_type === "video"
  )!
  expect(Math.abs(picture.side_data_list![0].rotation!)).toBe(90)
  // The packets are the original's: nothing was encoded.
  expect(packets(turned.bytes, "turned.mp4", "v")).toEqual(
    packets(readFileSync("public/samples/keepsimp-clip.mp4"), "s.mp4", "v")
  )

  await chip(page, "MKV").click()
  await chip(page, "Leave out").click()
  if (!(await canEncode(page, "avc", 180, 320))) return
  await expect(page.getByTestId("video-plan")).toContainText(
    "MKV cannot carry a turn as a setting"
  )
  await settled(page)
  const redrawn = await download(page, "keepsimp-clip.mp4")
  expect(redrawn.name).toBe("keepsimp-clip.mkv")
  const said = probe(redrawn.bytes, "redrawn.mkv")
  expect(said.streams.map((one) => one.codec_type)).toEqual(["video"])
  expect(said.streams[0]).toMatchObject({ width: 180, height: 320 })
  expect(decodesCleanly(redrawn.bytes, "redrawn.mkv")).toBe(true)
})

test("keeps the sound in step with the picture when it is encoded again", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const source = syncClip()
  expect(Math.abs(syncOffset(source.buffer, "sync-source.mp4"))).toBeLessThan(2)
  await open(page, [source])
  await chip(page, "Convert").click()
  await chip(page, "High").click()
  for (const [format, name] of [
    ["MP4", "sync-converted.mp4"],
    ["WebM", "sync.webm"],
    ["MKV", "sync.mkv"],
  ] as const) {
    await chip(page, format).click()
    const row = item(page, "sync.mp4")
    await expect(
      row
        .getByRole("link", { name: `Download ${name}` })
        .or(row.filter({ hasText: /cannot write/ }))
    ).toBeVisible({ timeout: 120_000 })
    if (!(await row.getByRole("link").count())) continue
    const result = await download(page, "sync.mp4")
    expect(result.name).toBe(name)
    const offset = syncOffset(result.bytes, `out-${name}`)
    // Within a quarter of a frame at 60 fps.
    expect(Math.abs(offset), `${format}: ${offset.toFixed(1)} ms`).toBeLessThan(
      4
    )
  }
})

/**
 * The size the picture was written at: the plan's, or a smaller one the
 * page names when the browser's encoder would not come down to its bitrate
 * (Firefox's H.264 on Linux).
 */
async function writtenSize(page: Page, planned: [number, number]) {
  const floor = await page
    .getByTestId("video-plan")
    .getByText("would not come down")
    .textContent({ timeout: 1000 })
    .catch(() => null)
  const size = floor?.match(/(\d+) × (\d+), to fit/)
  return size
    ? { width: Number(size[1]), height: Number(size[2]) }
    : { width: planned[0], height: planned[1] }
}

test("compresses the sample to half its size and to a quarter, checked and measured", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.goto(COMPRESSOR)
  const original = readFileSync("public/samples/keepsimp-scene.mp4")
  if (!(await canEncode(page, "avc", 960, 540))) test.skip()
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page, 180_000)
  const plan = page.getByTestId("video-plan")
  await expect(plan).toContainText("because it is to fit under")
  const half = await download(page, "keepsimp-scene.mp4")
  expect(half.bytes.length).toBeLessThanOrEqual(Math.floor(original.length / 2))
  const said = probe(half.bytes, "half.mp4")
  expect(said.streams.find((one) => one.codec_type === "video")).toMatchObject({
    codec_name: "h264",
    ...(await writtenSize(page, [960, 540])),
  })
  expect(decodesCleanly(half.bytes, "half.mp4")).toBe(true)
  await expect(page.getByTestId("video-looks")).toContainText(
    /^Looks .*: SSIM 0\.\d{3} on average over 6 frames/
  )

  await chip(page, "A quarter").click()
  await expect(plan).toContainText("640 × 360", { timeout: 10_000 })
  await expect(plan).toContainText("to leave room for the picture")
  await settled(page, 180_000)
  const quarter = await download(page, "keepsimp-scene.mp4")
  expect(quarter.bytes.length).toBeLessThanOrEqual(
    Math.floor(original.length / 4)
  )
  const small = probe(quarter.bytes, "quarter.mp4")
  expect(small.streams.find((one) => one.codec_type === "video")).toMatchObject(
    await writtenSize(page, [640, 360])
  )
  expect(small.streams.find((one) => one.codec_type === "audio")).toMatchObject(
    { codec_name: "aac" }
  )
})

test("says why a file cannot be opened, and zips the rest", async ({
  page,
}) => {
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([
    sample(),
    {
      name: "old.avi",
      mimeType: "video/x-msvideo",
      buffer: Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("AVI LIST"),
        Buffer.alloc(64),
      ]),
    },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
  ])
  await settled(page)
  await expect(item(page, "old.avi")).toContainText(
    "AVI files are not read here."
  )
  await expect(item(page, "notes.txt")).toContainText(
    "This is not a video file read here."
  )
  await page
    .locator("#video-file-more, input[type=file]")
    .last()
    .setInputFiles([{ ...sample(), name: "second.mp4" }])
  await settled(page)
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const zip = unzipSync(await bytesOf(await pending))
  expect(Object.keys(zip).sort()).toEqual([
    "keepsimp-clip-converted.mp4",
    "second-converted.mp4",
  ])
  expect(packets(zip["second-converted.mp4"], "zipped.mp4", "v")).toEqual(
    packets(readFileSync("public/samples/keepsimp-clip.mp4"), "s2.mp4", "v")
  )
})

test("is accessible in both themes and fits a phone", async ({ page }) => {
  await open(page, [sample()])
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" })
    const scan = await new AxeBuilder({ page })
      .include('[data-testid="video-workspace"]')
      .analyze()
    expect(scan.violations, scheme).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})
