import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { folder, LARGE, settled } from "./audio"
import { bytesOf } from "./pdf"

const VIDEO = "/dashboard/audio-to-video/"
const panel = (page: Page) => page.getByTestId("video-panel")

/** Make the video and download it. */
async function made(page: Page, name: string) {
  await panel(page)
    .getByRole("button", { name: /^Make (the video|it again)$/ })
    .click()
  await expect(page.getByTestId("video-made")).toBeVisible({ timeout: 180_000 })
  const pending = page.waitForEvent("download")
  await page.getByTestId("video-download").dispatchEvent("click")
  const got = await pending
  const path = join(folder, name)
  writeFileSync(path, await bytesOf(got))
  return { path, name: got.suggestedFilename() }
}

/** What FFprobe reads of a video's streams and length. */
function probe(path: string) {
  return JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration",
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
      avg_frame_rate: string
    }[]
    format: { duration: string }
  }
}

/** The share of pixels (0 to 1) that differ clearly between two frames, in any colour. */
function apart(a: Buffer, b: Buffer) {
  let changed = 0
  for (let index = 0; index < a.length; index += 3)
    if (
      Math.max(
        Math.abs(a[index] - b[index]),
        Math.abs(a[index + 1] - b[index + 1]),
        Math.abs(a[index + 2] - b[index + 2])
      ) > 48
    )
      changed++
  return changed / (a.length / 3)
}

/** One frame of the video at a time, as raw pixels. */
const frameAt = (path: string, seconds: number) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    LARGE
  )

test("makes a video of the sound with its cover, a moving waveform and its title", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for making a video"
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(
    panel(page).getByRole("radio", { name: "The cover" })
  ).toBeChecked()
  const { path, name } = await made(page, "tune-video")
  const info = probe(path)
  const video = info.streams.find((stream) => stream.codec_type === "video")!
  const audio = info.streams.find((stream) => stream.codec_type === "audio")!
  // H.264 and AAC in an MP4 where the browser writes H.264; otherwise WebM, and the page says so.
  if (name.endsWith(".mp4")) {
    expect([video.codec_name, audio.codec_name]).toEqual(["h264", "aac"])
    await expect(page.getByTestId("video-said")).toContainText(
      "MP4 with H.264 and AAC"
    )
  } else {
    expect(name).toMatch(/\.webm$/)
    expect(["vp9", "vp8"]).toContain(video.codec_name)
    expect(audio.codec_name).toBe("opus")
    await expect(page.getByTestId("video-said")).toContainText("WebM")
  }
  expect([video.width, video.height]).toEqual([1080, 1080])
  expect(Number(info.format.duration)).toBeGreaterThan(7.9)
  expect(Number(info.format.duration)).toBeLessThan(8.2)
  // The playhead moves: the picture is not the same at 1 s and at 7 s.
  expect(apart(frameAt(path, 1), frameAt(path, 7))).toBeGreaterThan(0.015)
})

test("a still picture is one frame a second, in the shape chosen", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.goto(VIDEO)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await panel(page)
    .getByRole("radio", { name: /^Portrait/ })
    .click()
  await panel(page)
    .getByRole("switch", { name: "Waveform with a moving playhead" })
    .click()
  await panel(page).getByRole("switch", { name: "Title and artist" }).click()
  const { path } = await made(page, "tune-still")
  const info = probe(path)
  const video = info.streams.find((stream) => stream.codec_type === "video")!
  expect([video.width, video.height]).toEqual([1080, 1920])
  expect(video.avg_frame_rate).toMatch(/^1\/1$|^1$/)
  // The last frame stops with the sound.
  expect(Number(info.format.duration)).toBeLessThan(8.2)
  // The same picture, but for what lossy coding changes.
  expect(apart(frameAt(path, 1), frameAt(path, 7))).toBeLessThan(0.001)
})

test("the door stays accessible and fits a phone", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(VIDEO)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    const violations = (
      await new AxeBuilder({ page })
        .include("[data-testid=audio-workspace]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
    expect(violations).toEqual([])
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.goto("/blog/turn-audio-into-video/")
  await expect(page.locator(`a[href="${VIDEO}"]`).first()).toBeAttached()
})
