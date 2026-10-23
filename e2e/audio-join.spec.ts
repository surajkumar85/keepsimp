import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import { chip, folder, loudnessOf, samples, settled } from "./audio"
import { bytesOf } from "./pdf"
import { openGroups } from "./settings"

const SPLITTER = "/dashboard/split-audio/"
const JOINER = "/dashboard/join-audio/"
const RATE = 44100

async function withSample(page: Page, route: string, focused: string) {
  await page.goto(route)
  await expect(page.getByTestId("audio-focused")).toContainText(focused)
  await page.getByRole("button", { name: "Try a sample" }).first().click()
  await settled(page)
  await openGroups(page)
}

/** A download a link or button starts. */
async function saved(page: Page, start: () => Promise<void>) {
  const pending = page.waitForEvent("download")
  await start()
  const got = await pending
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

const group = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name })

test("splits into equal parts, each checked, one by one or as a ZIP", async ({
  page,
}) => {
  test.setTimeout(150_000)
  await withSample(page, SPLITTER, "opened for splitting")
  const panel = page.getByTestId("split-panel")
  await group(page, "Split")
    .getByRole("radio", { name: "Into equal parts" })
    .click()
  await expect(page.getByTestId("split-preview")).toContainText("3 parts:")
  await panel.getByRole("button", { name: "Split into 3 files" }).click()
  await expect(page.getByTestId("split-part")).toHaveCount(3, {
    timeout: 90_000,
  })
  const part = await saved(page, () =>
    page
      .getByRole("link", { name: "Download keepsimp-tune-02.flac" })
      .dispatchEvent("click")
  )
  expect(part.name).toBe("keepsimp-tune-02.flac")
  expect(
    Math.abs(samples(part.bytes, "part-2.flac") - (8 / 3) * RATE)
  ).toBeLessThan(2)
  const zip = await saved(page, () =>
    panel.getByRole("button", { name: "Download all parts (ZIP)" }).click()
  )
  expect(zip.name).toBe("keepsimp-tune-parts.zip")
  expect(Object.keys(unzipSync(zip.bytes)).sort()).toEqual([
    "keepsimp-tune-01.flac",
    "keepsimp-tune-02.flac",
    "keepsimp-tune-03.flac",
  ])
})

test("splits at markers placed with the keys", async ({ page }) => {
  test.setTimeout(150_000)
  await withSample(page, SPLITTER, "opened for splitting")
  const wave = page.getByRole("slider", { name: /^Playhead in / })
  await wave.focus()
  for (let step = 0; step < 3; step++)
    await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("m")
  for (let step = 0; step < 2; step++)
    await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("m")
  await expect(page.getByTestId("editor-marker")).toHaveCount(2)
  await expect(
    page.getByRole("button", { name: "Remove the marker at 0:03.000" })
  ).toBeVisible()
  await group(page, "Split")
    .getByRole("radio", { name: "At markers (2)" })
    .click()
  await expect(page.getByTestId("split-preview")).toContainText(
    "0:00.000–0:03.000"
  )
  await page.getByRole("button", { name: "Split into 3 files" }).click()
  await expect(page.getByTestId("split-part")).toHaveCount(3, {
    timeout: 90_000,
  })
  const middle = await saved(page, () =>
    page
      .getByRole("link", { name: "Download keepsimp-tune-02.flac" })
      .dispatchEvent("click")
  )
  expect(samples(middle.bytes, "marked-2.flac")).toBe(2 * RATE)
  // A marker taken away leaves two parts.
  await page
    .getByRole("button", { name: "Remove the marker at 0:05.000" })
    .click()
  await expect(page.getByTestId("split-preview")).toContainText("2 parts:")
})

test("joins in order with a chapter each, then crossfaded and normalised", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await withSample(page, JOINER, "opened for joining files")
  const panel = page.getByTestId("join-panel")
  await expect(page.getByTestId("join-row")).toHaveCount(2)
  await expect(page.getByTestId("join-length")).toContainText(
    "Joined: 0:14.000"
  )
  await panel.getByRole("button", { name: "Join 2 files" }).click()
  await expect(page.getByTestId("join-result")).toBeVisible({ timeout: 90_000 })
  const straight = await saved(page, () =>
    page.getByTestId("join-download").dispatchEvent("click")
  )
  expect(straight.name).toBe("keepsimp-tune-joined.mp3")
  expect(samples(straight.bytes, "joined.mp3")).toBe(14 * RATE)
  const chapters = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_chapters",
      "-of",
      "json",
      join(folder, "joined.mp3"),
    ]).toString()
  ) as { chapters: { start_time: string; tags: { title: string } }[] }
  expect(chapters.chapters.map((chapter) => chapter.tags.title)).toEqual([
    "A short tune",
    "keepsimp-clip",
  ])
  expect(Number(chapters.chapters[1].start_time)).toBeCloseTo(8, 2)

  // The clip first, crossfaded over 2 s, both brought to −16 LUFS.
  await panel.getByRole("button", { name: "Move keepsimp-clip.mp4 up" }).click()
  await expect(page.getByTestId("join-row").first()).toContainText(
    "keepsimp-clip.mp4"
  )
  await group(page, "Between files")
    .getByRole("radio", { name: "Crossfade" })
    .click()
  await chip(page, "Normalize loudness").click()
  await page.getByRole("radio", { name: /−16 LUFS/ }).click()
  await expect(page.getByTestId("join-result")).toContainText(
    "This was joined before the last change"
  )
  await panel.getByRole("button", { name: "Join 2 files" }).click()
  await expect(page.getByTestId("join-result")).not.toContainText(
    "before the last change",
    { timeout: 90_000 }
  )
  const matched = await saved(page, () =>
    page.getByTestId("join-download").dispatchEvent("click")
  )
  expect(matched.name).toBe("keepsimp-clip-joined.mp3")
  expect(samples(matched.bytes, "matched.mp3")).toBe(12 * RATE)
  expect(
    Math.abs(loudnessOf(matched.bytes, "matched.mp3").integrated - -16)
  ).toBeLessThan(1)
})

test("the splitter and joiner stay accessible and fit a phone", async ({
  page,
}) => {
  test.setTimeout(150_000)
  for (const [route, focused] of [
    [SPLITTER, "opened for splitting"],
    [JOINER, "opened for joining files"],
  ]) {
    await withSample(page, route, focused)
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
    ["/blog/split-audio-into-parts/", SPLITTER],
    ["/blog/join-audio-files/", JOINER],
  ]) {
    await page.goto(guide)
    await expect(page.locator(`a[href="${route}"]`).first()).toBeAttached()
  }
})
