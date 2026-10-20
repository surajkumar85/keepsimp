import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import {
  chip,
  download,
  EDITOR,
  folder,
  LARGE,
  samples,
  settled,
} from "./audio"

const SPEED = "/dashboard/change-audio-speed/"
const RATE = 44100
const group = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name })

/** Interleaved 16-bit samples FFmpeg decodes, as two channels. */
function channels(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-"],
    LARGE
  )
  const all = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
  return [0, 1].map((channel) =>
    Int16Array.from(
      { length: all.length / 2 },
      (_, index) => all[index * 2 + channel]
    )
  )
}

test("speeds up, slows down and moves the pitch, each file exactly as long as it should be", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto(SPEED)
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for changing speed and pitch"
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(chip(page, "1.25×")).toBeChecked()
  const quicker = await download(page, "keepsimp-tune.flac")
  expect(samples(quicker.bytes, "quicker.flac")).toBe(
    Math.round((8 * RATE) / 1.25)
  )

  await group(page, "Speed").getByRole("radio", { name: "2×" }).click()
  await settled(page)
  expect(
    samples((await download(page, "keepsimp-tune.flac")).bytes, "double.flac")
  ).toBe(4 * RATE)

  // As a tape plays: half as fast, twice as long.
  await group(page, "Speed").getByRole("radio", { name: "0.5×" }).click()
  await page.getByRole("switch", { name: "Keep the pitch" }).click()
  await settled(page)
  expect(
    samples((await download(page, "keepsimp-tune.flac")).bytes, "tape.flac")
  ).toBe(16 * RATE)

  // An octave up at the same speed, with the keys: as long as it was.
  await page.getByRole("switch", { name: "Keep the pitch" }).click()
  await group(page, "Speed").getByRole("radio", { name: "Normal" }).click()
  const pitch = page.getByLabel("Pitch", { exact: true })
  await pitch.focus()
  await page.keyboard.press("End")
  await expect(page.getByTestId("audio-settings")).toContainText(
    "+12 semitones"
  )
  await settled(page)
  await expect(page.getByTestId("audio-check")).toContainText(
    /0:08\.0 long|cannot decode FLAC/
  )
  expect(
    samples((await download(page, "keepsimp-tune.flac")).bytes, "octave.flac")
  ).toBe(8 * RATE)
})

test("plays backwards, sample for sample, and swaps the channels exactly", async ({
  page,
}) => {
  test.setTimeout(150_000)
  // Two seconds: a tone on the left, a quieter one on the right.
  const path = join(folder, "two.wav")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.5*sin(2*PI*440*t)|0.25*sin(2*PI*660*t):s=44100:d=2",
    "-c:a",
    "pcm_s16le",
    path,
  ])
  const source = new Uint8Array(readFileSync(path))
  const [left, right] = channels(source, "two-source.wav")
  await page.goto(EDITOR)
  await page.locator("#audio-file").setInputFiles({
    name: "two.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from(source),
  })
  await settled(page)
  await chip(page, "WAV").click()
  await page.getByRole("switch", { name: "Play backwards" }).click()
  await settled(page)
  const [backL, backR] = channels(
    (await download(page, "two.wav")).bytes,
    "back.wav"
  )
  expect(backL).toEqual(left.slice().reverse())
  expect(backR).toEqual(right.slice().reverse())

  await page.getByRole("switch", { name: "Play backwards" }).click()
  await group(page, "Channels")
    .getByRole("radio", { name: "Swap left and right" })
    .click()
  await settled(page)
  const [swappedL, swappedR] = channels(
    (await download(page, "two.wav")).bytes,
    "swapped.wav"
  )
  expect(swappedL).toEqual(right)
  expect(swappedR).toEqual(left)

  // Karaoke says what it is.
  await group(page, "Channels").getByRole("radio", { name: "Karaoke" }).click()
  await expect(page.getByTestId("audio-settings")).toContainText(
    "It is not a real vocal remover"
  )
})

test("the door stays accessible and fits a phone", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(SPEED)
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
  await page.goto("/blog/change-audio-speed-and-pitch/")
  await expect(page.locator(`a[href="${SPEED}"]`).first()).toBeAttached()
})
