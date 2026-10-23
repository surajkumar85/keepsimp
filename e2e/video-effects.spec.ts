import { readFileSync } from "node:fs"
import { test, expect } from "@playwright/test"
import {
  brightness,
  clip,
  croppedLike,
  CROP,
  decodesCleanly,
  download,
  ebur128,
  loudness,
  MUTE,
  packets,
  pitch,
  probe,
  reportWorkerErrors,
  sample,
  settled,
  soundOf,
  SPEED,
  streamSeconds,
  EDITOR,
} from "./video"

reportWorkerErrors()

test("crops the sample to 9:16 around its middle, checked", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(CROP)
  await expect(page.getByTestId("video-focused")).toContainText(
    "opened for cropping."
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(page.getByTestId("video-plan")).toContainText(
    "because it is cut to 9:16"
  )
  const result = await download(page, "keepsimp-scene.mp4")
  const video = probe(result.bytes, "crop.mp4").streams.find(
    (one) => one.codec_type === "video"
  )
  expect(video).toMatchObject({ width: 304, height: 540 })
  expect(decodesCleanly(result.bytes, "crop.mp4")).toBe(true)
  // The middle of the picture, not the whole of it squeezed.
  const scene = readFileSync("public/samples/keepsimp-scene.mp4")
  const middle = croppedLike(result.bytes, scene, "304:540:328:0")
  expect(croppedLike(result.bytes, scene, "304:540:0:0")).toBeLessThan(
    middle - 3
  )
})

test("plays a clip twice as fast, every other frame, the tone keeping its pitch", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const tone = clip("tone.mp4", { size: "640x360", seconds: 4 })
  await page.goto(SPEED)
  await page.locator("#video-file").setInputFiles([tone])
  await settled(page, 120_000)
  await expect(page.getByTestId("video-plan")).toContainText(
    "It plays twice as fast: 0:04.00 becomes 0:02.00, the sound keeping its pitch."
  )
  const result = await download(page, "tone.mp4")
  const said = probe(result.bytes, "fast.mp4")
  const picture = said.streams.find((one) => one.codec_type === "video")!
  expect(Number(picture.nb_read_frames)).toBe(60)
  expect(streamSeconds(result.bytes, "fast.mp4", "v")).toBeCloseTo(2, 1)
  expect(
    Math.abs(streamSeconds(result.bytes, "fast.mp4", "a") - 2)
  ).toBeLessThan(0.1)
  // A 440 Hz tone, sped up, is still 440 Hz.
  expect(pitch(soundOf(result.bytes, "fast.mp4"), 0.5, 1.5)).toBeCloseTo(
    440,
    -1
  )
})

test("fades in from black and silence and out to them", async ({ page }) => {
  test.setTimeout(150_000)
  const tone = clip("fades.mp4", { size: "640x360", seconds: 4 })
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([tone])
  await settled(page)
  await page
    .getByRole("radiogroup", { name: "Fade in" })
    .getByRole("radio", { name: "1 s", exact: true })
    .click()
  await page
    .getByRole("radiogroup", { name: "Fade out" })
    .getByRole("radio", { name: "1 s", exact: true })
    .click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "It fades in from black over 1 s and out to black over 1 s, the sound with it."
  )
  await settled(page, 120_000)
  const result = await download(page, "fades.mp4")
  const frames = brightness(result.bytes, "fades-out.mp4")
  const original = brightness(tone.buffer, "fades-in.mp4")
  // Black is 16 in video range (some encoders write 0): a tenth of the way to the picture at most.
  const dark = (luma: number) => 16 + (luma - 16) * 0.1
  expect(frames[0][1]).toBeLessThan(dark(original[0][1]))
  expect(frames.at(-1)![1]).toBeLessThan(dark(original.at(-1)![1]))
  expect(frames[60][1]).toBeCloseTo(original[60][1], -1)
  const sound = soundOf(result.bytes, "fades-out.mp4")
  const middle = loudness(sound, 1.5, 2.5)
  expect(loudness(sound, 0, 0.05)).toBeLessThan(middle * 0.1)
  expect(loudness(sound, 3.95, 4)).toBeLessThan(middle * 0.1)
})

test("mutes the sample: the picture copied packet for packet, no sound", async ({
  page,
}) => {
  await page.goto(MUTE)
  await page.locator("#video-file").setInputFiles([sample()])
  await settled(page)
  await expect(page.getByTestId("video-plan")).toContainText(
    "The sound is left out."
  )
  const result = await download(page, "keepsimp-clip.mp4")
  expect(
    probe(result.bytes, "mute.mp4").streams.map((one) => one.codec_type)
  ).toEqual(["video"])
  expect(packets(result.bytes, "mute.mp4", "v")).toEqual(
    packets(
      readFileSync("public/samples/keepsimp-clip.mp4"),
      "mute-source.mp4",
      "v"
    )
  )
})

test("makes a quiet clip's sound −16 LUFS, as FFmpeg's meter reads it", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const quiet = clip("quiet.mp4", {
    size: "320x180",
    seconds: 4,
    args: [
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-af",
      "volume=-24dB",
      "-c:a",
      "aac",
    ],
  })
  expect(ebur128(quiet.buffer, "quiet-in.mp4").integrated).toBeLessThan(-30)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([quiet])
  await settled(page)
  await page
    .getByRole("radiogroup", { name: "Loudness" })
    .getByRole("radio", { name: "−16 LUFS", exact: true })
    .click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "made louder or quieter to −16 LUFS"
  )
  await settled(page, 120_000)
  await expect(page.getByTestId("video-level")).toContainText("dB louder to")
  const result = await download(page, "quiet.mp4")
  const measured = ebur128(result.bytes, "quiet-out.mp4")
  expect(Math.abs(measured.integrated - -16)).toBeLessThanOrEqual(1)
  expect(measured.truePeak).toBeLessThanOrEqual(-0.5)
  // The picture is copied as it is.
  expect(packets(result.bytes, "quiet-out.mp4", "v")).toEqual(
    packets(quiet.buffer, "quiet-in.mp4", "v")
  )
})

test("crops by hand with the keys: the result is the source cropped there", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const wide = clip("hand-crop.mp4", { size: "640x360", seconds: 2 })
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([wide])
  await settled(page)
  await page.getByRole("button", { name: "Crop by hand" }).click()
  await page
    .getByRole("radiogroup", { name: "Crop shape" })
    .getByRole("radio", { name: "1:1", exact: true })
    .click()
  // A square of 360 in the middle (left 140), moved right by a tenth (64 px).
  const box = page.getByTestId("crop-box")
  await box.focus()
  for (let step = 0; step < 10; step++) await page.keyboard.press("ArrowRight")
  await page.getByRole("button", { name: "Use this crop" }).click()
  await expect(page.getByTestId("crop-said")).toHaveText(
    "Cropped by hand to 360 × 360."
  )
  await expect(page.getByTestId("video-plan")).toContainText(
    "because it is cropped to 360 × 360"
  )
  await settled(page, 120_000)
  const result = await download(page, "hand-crop.mp4")
  expect(
    probe(result.bytes, "hand-crop-out.mp4").streams.find(
      (one) => one.codec_type === "video"
    )
  ).toMatchObject({ width: 360, height: 360 })
  // Most alike where it was cropped, and less so a few pixels either way.
  const there = croppedLike(result.bytes, wide.buffer, "360:360:204:0")
  for (const left of [196, 212, 0])
    expect(
      croppedLike(result.bytes, wide.buffer, `360:360:${left}:0`)
    ).toBeLessThan(there - 3)
})
