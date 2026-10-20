import { readFileSync } from "node:fs"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { chip, download, EDITOR, loudnessOf, samples, settled } from "./audio"

const NORMALIZE = "/dashboard/normalize-audio/"
const BOOSTER = "/dashboard/volume-booster/"
const tune = new Uint8Array(readFileSync("public/samples/keepsimp-tune.flac"))
const original = loudnessOf(tune, "original.flac")

async function withSample(page: Page, route: string, focused?: string) {
  await page.goto(route)
  if (focused)
    await expect(page.getByTestId("audio-focused")).toContainText(focused)
  await page.getByRole("button", { name: "Try a sample" }).first().click()
  await settled(page)
}

test("normalizes every file to −14 LUFS, then to −23, as FFmpeg measures them", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await withSample(page, NORMALIZE, "opened for normalizing loudness")
  await expect(chip(page, "Normalize loudness")).toBeChecked()
  await expect(page.getByTestId("audio-loudness")).toContainText("LUFS")
  await expect(page.getByTestId("audio-level")).toContainText(
    /^Made [\d.]+ dB (louder|quieter) to −14 LUFS\./
  )
  // Safari cannot decode FLAC to check it, and says so.
  await expect(page.getByTestId("audio-check")).toContainText(
    /It measures −1[34](\.\d)? LUFS|cannot decode FLAC/
  )
  // The tune as FLAC (its own format), the clip's sound as M4A.
  const flac = await download(page, "keepsimp-tune.flac")
  expect(flac.name).toBe("keepsimp-tune.flac")
  const loud = loudnessOf(flac.bytes, "tune-14.flac")
  expect(Math.abs(loud.integrated - -14)).toBeLessThan(0.5)
  expect(loud.truePeak).toBeLessThanOrEqual(-0.8)
  expect(samples(flac.bytes, "tune-14.flac")).toBe(8 * 44100)
  const clip = await download(page, "keepsimp-clip.mp4")
  expect(clip.name).toBe("keepsimp-clip.m4a")
  expect(
    Math.abs(loudnessOf(clip.bytes, "clip-14.m4a").integrated - -14)
  ).toBeLessThan(0.7)

  await page.getByRole("radio", { name: /−23 LUFS/ }).click()
  await settled(page)
  const quiet = loudnessOf(
    (await download(page, "keepsimp-tune.flac")).bytes,
    "tune-23.flac"
  )
  expect(Math.abs(quiet.integrated - -23)).toBeLessThan(0.5)
})

test("a loudness out of bounds is refused and said", async ({ page }) => {
  await withSample(page, NORMALIZE)
  await page
    .getByRole("radiogroup", { name: "Loudness to reach" })
    .getByRole("radio", { name: "Custom", exact: true })
    .click()
  await page.getByLabel("LUFS", { exact: true }).fill("-3")
  await expect(page.getByTestId("audio-settings")).toContainText(
    "Choose a loudness from −40 to −5 LUFS."
  )
  await page.getByLabel("LUFS", { exact: true }).fill("-18")
  await settled(page)
  const custom = loudnessOf(
    (await download(page, "keepsimp-tune.flac")).bytes,
    "tune-18.flac"
  )
  expect(Math.abs(custom.integrated - -18)).toBeLessThan(0.5)
})

test("the booster makes it 6 dB louder, the limiter holding its peaks", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await withSample(page, BOOSTER, "opened for making sound louder")
  await expect(chip(page, "Make louder")).toBeChecked()
  await expect(page.getByTestId("audio-level")).toContainText(
    /^Made 6 dB louder/
  )
  const boosted = loudnessOf(
    (await download(page, "keepsimp-tune.flac")).bytes,
    "boosted.flac"
  )
  expect(boosted.integrated - original.integrated).toBeGreaterThan(4)
  expect(boosted.integrated - original.integrated).toBeLessThan(6.3)
  expect(boosted.truePeak).toBeLessThanOrEqual(-0.8)
})

test("the editor shows loudness and normalizes peaks", async ({ page }) => {
  test.setTimeout(120_000)
  await withSample(page, EDITOR)
  await page.getByRole("button", { name: "Preview keepsimp-tune.flac" }).click()
  await expect(page.getByTestId("audio-loudness")).toContainText(
    `${original.integrated.toFixed(1).replace("-", "−")} LUFS`.replace(
      ".0 LUFS",
      " LUFS"
    )
  )
  await expect(page.getByTestId("loudness-graph")).toBeVisible()
  const start = page
    .getByTestId("sound-editor")
    .getByLabel("Start", { exact: true })
  await start.fill("1")
  await start.press("Enter")
  const end = page
    .getByTestId("sound-editor")
    .getByLabel("End", { exact: true })
  await end.fill("5")
  await end.press("Enter")
  await expect(page.getByTestId("editor-loudness")).toContainText(
    "Loudness of the selection:"
  )
  await chip(page, "WAV").click()
  await chip(page, "Normalize peaks").click()
  await settled(page)
  const peaked = loudnessOf(
    (await download(page, "keepsimp-tune.flac")).bytes,
    "peaked.wav"
  )
  expect(Math.abs(peaked.truePeak - -1)).toBeLessThan(0.3)
})

test("the doors stay accessible and fit a phone", async ({ page }) => {
  test.setTimeout(120_000)
  for (const route of [NORMALIZE, BOOSTER]) {
    await withSample(page, route)
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
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  for (const [guide, route] of [
    ["/blog/normalize-audio-loudness/", NORMALIZE],
    ["/blog/make-audio-louder/", BOOSTER],
  ]) {
    await page.goto(guide)
    await expect(page.locator(`a[href="${route}"]`).first()).toBeAttached()
  }
})
