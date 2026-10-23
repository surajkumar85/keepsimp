import { readFileSync } from "node:fs"
import { test, expect } from "@playwright/test"
import {
  brightness,
  clip,
  CROP,
  decodesCleanly,
  download,
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
