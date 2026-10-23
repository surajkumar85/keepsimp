import { test, expect, type Page } from "@playwright/test"
import { openGroups } from "./settings"
import {
  clip,
  download,
  EDITOR,
  packets,
  probe,
  reportWorkerErrors,
  settled,
  soundOf,
  streamSeconds,
  toneFile,
  toneLevel,
  loudness,
} from "./video"

reportWorkerErrors()

async function addSoundtrack(page: Page, file: ReturnType<typeof toneFile>) {
  await page.getByLabel("Choose a soundtrack").setInputFiles([file])
  await expect(page.getByTestId("soundtrack")).toContainText(file.name)
}

test("puts a soundtrack in place of a video's sound, played again until it ends", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const video = clip("tone-video.mp4", { size: "320x180", seconds: 3 })
  const music = toneFile("music.m4a", 880, 1.2)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([video])
  await openGroups(page)
  await settled(page)
  await addSoundtrack(page, music)
  await expect(page.getByTestId("video-plan")).toContainText(
    "The sound is music.m4a, in place of the video's own. It is 1.2 s long, so it plays again from its start until the video ends, fading out over 1 s."
  )
  await settled(page, 120_000)
  const result = await download(page, "tone-video.mp4")
  // The picture copied as it is; the sound as long as it.
  expect(packets(result.bytes, "music-out.mp4", "v")).toEqual(
    packets(video.buffer, "music-in.mp4", "v")
  )
  expect(
    Math.abs(streamSeconds(result.bytes, "music-out.mp4", "a") - 3)
  ).toBeLessThan(0.1)
  const sound = soundOf(result.bytes, "music-out.mp4")
  // The soundtrack's 880 Hz, played again after 1.2 s, and none of the video's 440 Hz.
  for (const [from, to] of [
    [0.2, 1],
    [1.4, 1.9],
  ]) {
    expect(toneLevel(sound, 880, from, to)).toBeGreaterThan(0.05)
    expect(toneLevel(sound, 440, from, to)).toBeLessThan(0.005)
  }
  // Faded out where the video ends.
  expect(loudness(sound, 2.95, 3)).toBeLessThan(loudness(sound, 1, 1.5) * 0.1)
})

test("mixes a soundtrack under the video's own sound, quieter", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const video = clip("mix-video.mp4", { size: "320x180", seconds: 3 })
  const music = toneFile("bed.m4a", 880, 5)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([video])
  await openGroups(page)
  await settled(page)
  await addSoundtrack(page, music)
  await page
    .getByRole("radiogroup", { name: "Use it" })
    .getByRole("radio", { name: "Under the sound" })
    .click()
  await page
    .getByRole("radiogroup", { name: "Soundtrack volume" })
    .getByRole("radio", { name: "-6 dB" })
    .click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "The sound of bed.m4a is mixed under the video's own, 6 dB quieter."
  )
  await settled(page, 120_000)
  const result = await download(page, "mix-video.mp4")
  const sound = soundOf(result.bytes, "mix-out.mp4")
  const own = toneLevel(sound, 440, 1, 2)
  const bed = toneLevel(sound, 880, 1, 2)
  expect(own).toBeGreaterThan(0.05)
  // The video's own tone and the soundtrack's at their own levels, 6 dB apart from where they began.
  const ownBefore = toneLevel(soundOf(video.buffer, "mix-in.mp4"), 440, 1, 2)
  const bedBefore = toneLevel(soundOf(music.buffer, "bed-in.m4a"), 880, 1, 2)
  expect(own / ownBefore).toBeCloseTo(1, 1)
  expect(20 * Math.log10(bed / bedBefore)).toBeCloseTo(-6, 0)
})

test("gives a silent video a soundtrack, as long as the video", async ({
  page,
}) => {
  test.setTimeout(150_000)
  const video = clip("silent.mp4", {
    size: "320x180",
    seconds: 2,
    sound: false,
    args: ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
  })
  const music = toneFile("long.m4a", 660, 6)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([video])
  await openGroups(page)
  await settled(page)
  await addSoundtrack(page, music)
  await expect(page.getByTestId("video-plan")).toContainText(
    "The sound is long.m4a. It fades out over 1 s where the video ends."
  )
  await settled(page, 120_000)
  const result = await download(page, "silent.mp4")
  expect(
    probe(result.bytes, "silent-out.mp4").streams.map((one) => one.codec_type)
  ).toEqual(["video", "audio"])
  expect(
    Math.abs(streamSeconds(result.bytes, "silent-out.mp4", "a") - 2)
  ).toBeLessThan(0.1)
  expect(
    toneLevel(soundOf(result.bytes, "silent-out.mp4"), 660, 0.2, 0.8)
  ).toBeGreaterThan(0.05)
})
