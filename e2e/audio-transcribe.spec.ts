import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { folder, settled } from "./audio"
import { bytesOf } from "./pdf"

const TRANSCRIBE = "/dashboard/transcribe-audio/"
const panel = (page: Page) => page.getByTestId("transcript-panel")

// eSpeak NG saying two sentences, four times over: about forty seconds, so
// the second window must start where the first one's last sentence ended.
const speech = join(folder, "speech-40.flac")
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-stream_loop",
  "3",
  "-i",
  "tests/fixtures/audio/speech.flac",
  "-c:a",
  "flac",
  speech,
])

async function transcribed(page: Page) {
  await panel(page)
    .getByRole("button", { name: "Transcribe", exact: true })
    .click()
  await expect(page.getByTestId("transcript-status")).toBeVisible()
  await expect(page.getByTestId("transcript-status")).toBeHidden({
    timeout: 240_000,
  })
  await expect(page.getByTestId("transcript")).toBeVisible()
  return page.getByTestId("transcript").innerText()
}

test("transcribes forty seconds of speech window by window, nothing doubled or lost, and saves subtitles", async ({
  page,
}) => {
  test.setTimeout(300_000)
  await page.goto(TRANSCRIBE)
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for transcribing"
  )
  await page.locator("#audio-file").setInputFiles({
    name: "speech-40.flac",
    mimeType: "audio/flac",
    buffer: readFileSync(speech),
  })
  await settled(page)
  await panel(page)
    .getByRole("combobox", { name: "Language spoken" })
    .selectOption("en")
  const text = (await transcribed(page)).toLowerCase()
  // Each sentence four times: never twice where once was said, nor left out.
  const count = (words: string) => text.split(words).length - 1
  expect(count("lazy dog")).toBe(4)
  expect(count("busy room")).toBe(4)

  // Search finds the parts, and a time plays from there.
  const find = panel(page).getByRole("searchbox", {
    name: "Find in the transcript",
  })
  await find.fill("LAZY")
  await expect(panel(page)).toContainText("Found in 4 places.")
  await find.fill("")
  await panel(page)
    .getByRole("button", { name: /^Listen from 0:1/ })
    .first()
    .click()
  await expect
    .poll(() =>
      panel(page)
        .getByLabel("Listen along")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime)
    )
    .toBeGreaterThan(9)

  // Subtitles that FFprobe reads, ending near the end of the sound.
  for (const [label, name, codec] of [
    ["SRT", "speech-40.srt", "subrip"],
    ["WebVTT", "speech-40.vtt", "webvtt"],
  ] as const) {
    const pending = page.waitForEvent("download")
    await panel(page).getByRole("button", { name: label, exact: true }).click()
    const got = await pending
    expect(got.suggestedFilename()).toBe(name)
    const path = join(folder, name)
    writeFileSync(path, await bytesOf(got))
    const probe = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "json",
        path,
      ]).toString()
    ) as { streams: { codec_name: string }[] }
    expect(probe.streams[0].codec_name).toBe(codec)
    // The last cue ends near the end of the sound.
    const ends = [
      ...readFileSync(path, "utf8").matchAll(
        /--> (\d\d):(\d\d):(\d\d)[.,](\d{3})/g
      ),
    ].map(
      ([, h, m, s, ms]) =>
        Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
    )
    expect(ends.at(-1)).toBeGreaterThan(30)
    expect(ends.at(-1)).toBeLessThan(41)
  }
})

test("stops at once and keeps what was heard, and hears the noisy sample", async ({
  page,
}) => {
  test.setTimeout(300_000)
  await page.goto(TRANSCRIBE)
  await page.locator("#audio-file").setInputFiles({
    name: "speech-40.flac",
    mimeType: "audio/flac",
    buffer: readFileSync(speech),
  })
  await settled(page)
  await panel(page)
    .getByRole("button", { name: "Transcribe", exact: true })
    .click()
  await expect(page.getByTestId("transcript-status")).toBeVisible()
  await panel(page).getByRole("button", { name: "Stop" }).click()
  await expect(panel(page)).toContainText("Stopped.")
  await expect(
    panel(page).getByRole("button", { name: "Transcribe again" })
  ).toBeVisible()

  // The noisy sample: its words come through the noise.
  await page.goto(TRANSCRIBE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  const text = await transcribed(page)
  expect(text.toLowerCase()).toContain("noisy room")
  expect(text.toLowerCase()).toContain("noise away")
})

test("the door stays accessible and fits a phone", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(TRANSCRIBE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(panel(page)).toContainText("Base")
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
  await page.goto("/blog/transcribe-audio-on-your-device/")
  await expect(page.locator(`a[href="${TRANSCRIBE}"]`).first()).toBeAttached()
})
