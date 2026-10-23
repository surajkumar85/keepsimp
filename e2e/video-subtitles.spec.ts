import { test, expect } from "@playwright/test"
import {
  download,
  EDITOR,
  frameAt,
  plainClip,
  reportWorkerErrors,
  settled,
} from "./video"

reportWorkerErrors()

const SRT = {
  name: "words.srt",
  mimeType: "application/x-subrip",
  buffer: Buffer.from(
    "1\n00:00:01,000 --> 00:00:02,000\nHELLO HELLO\n\n2\n00:00:03,000 --> 00:00:03,500\n<i>later</i>\n"
  ),
}

/** White pixels along the bottom of a frame. */
function whiteAt(bytes: Uint8Array, seconds: number) {
  const frame = frameAt(bytes, `subtitles-${seconds}.mp4`, seconds)
  let white = 0
  for (let y = Math.round(frame.height * 0.7); y < frame.height; y++)
    for (let x = 0; x < frame.width; x += 2) {
      const [r, g, b] = frame.at(x, y)
      if (r > 200 && g > 200 && b > 200) white++
    }
  return white
}

test("writes subtitles on the frames they cover, and moves them with a trim", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const blue = plainClip("subtitled.mp4", "blue", 4)
  await page.goto(EDITOR)
  await page.locator("#video-file").setInputFiles([blue])
  await settled(page)
  await page.getByLabel("Choose subtitles").setInputFiles([SRT])
  await expect(page.getByTestId("subtitles")).toContainText(
    "2 subtitles from words.srt"
  )
  await expect(page.getByTestId("video-plan")).toContainText(
    "2 subtitles from words.srt are written on the picture."
  )
  await settled(page, 120_000)
  const written = await download(page, "subtitled.mp4")
  expect(whiteAt(written.bytes, 0.5)).toBe(0)
  expect(whiteAt(written.bytes, 1.5)).toBeGreaterThan(200)
  expect(whiteAt(written.bytes, 2.5)).toBe(0)

  // Trimmed to start at 1 s: the first subtitle now shows from the start.
  await page.getByLabel("Start", { exact: true }).fill("1")
  await page.getByLabel("Start", { exact: true }).press("Enter")
  await page.getByLabel("End", { exact: true }).fill("4")
  await page.getByLabel("End", { exact: true }).press("Enter")
  await page.getByRole("button", { name: "Keep the selection" }).click()
  await expect(page.getByTestId("video-plan")).toContainText(
    "2 subtitles from words.srt are written on the picture."
  )
  // The trimmed result, once it is written.
  await expect(
    page.getByRole("link", { name: /subtitled-trimmed\.mp4/ })
  ).toBeVisible({ timeout: 120_000 })
  await settled(page, 120_000)
  const trimmed = await download(page, "subtitled.mp4")
  expect(trimmed.name).toBe("subtitled-trimmed.mp4")
  expect(whiteAt(trimmed.bytes, 0.5)).toBeGreaterThan(200)
  expect(whiteAt(trimmed.bytes, 1.5)).toBe(0)
})
