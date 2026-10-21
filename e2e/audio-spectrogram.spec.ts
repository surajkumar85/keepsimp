import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Locator, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { EDITOR, folder, settled } from "./audio"

// Three seconds of a 1 kHz tone.
const path = join(folder, "tone-1k.wav")
execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=1000:duration=3:sample_rate=44100",
  "-c:a",
  "pcm_s16le",
  path,
])

async function open(page: Page, route: string) {
  await page.goto(route)
  await page.locator("#audio-file").setInputFiles({
    name: "tone-1k.wav",
    mimeType: "audio/wav",
    buffer: readFileSync(path),
  })
  await settled(page)
}

/**
 * The frequency of the brightest row of a drawn spectrogram, read from its
 * pixels: rows from 40 Hz at the bottom to 22.05 kHz at the top, evenly in pitch.
 */
async function brightestFrequency(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!
    const { width, height } = element
    const data = context.getImageData(0, 0, width, height).data
    const [r0, g0, b0] = data.slice(0, 3)
    let best = 0
    let row = 0
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4
        sum +=
          Math.abs(data[at] - r0) +
          Math.abs(data[at + 1] - g0) +
          Math.abs(data[at + 2] - b0)
      }
      if (sum > best) {
        best = sum
        row = y
      }
    }
    const fraction = (height - 1 - row + 0.5) / height
    return 40 * (22050 / 40) ** fraction
  })
}

test("draws a tone where its pitch is, in the overview and in the editor", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await open(page, "/dashboard/audio-converter/")
  await page.getByRole("radio", { name: "Spectrogram" }).click()
  const overview = page.getByTestId("spectrogram")
  await expect(overview).toBeVisible()
  const heard = await brightestFrequency(overview)
  expect(heard).toBeGreaterThan(900)
  expect(heard).toBeLessThan(1120)
  // Back to the waveform.
  await page.getByRole("radio", { name: "Waveform" }).click()
  await expect(page.getByTestId("waveform")).toBeVisible()

  await open(page, EDITOR)
  await page.getByRole("button", { name: "Spectrogram" }).click()
  await expect(
    page.getByRole("button", { name: "Spectrogram" })
  ).toHaveAttribute("aria-pressed", "true")
  const editor = page.getByTestId("editor-spectrogram")
  await expect(editor).toBeVisible()
  const there = await brightestFrequency(editor)
  expect(there).toBeGreaterThan(900)
  expect(there).toBeLessThan(1120)
})

test("the spectrogram stays accessible in both themes", async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, "/dashboard/audio-converter/")
  await page.getByRole("radio", { name: "Spectrogram" }).click()
  await expect(page.getByTestId("spectrogram")).toHaveAttribute(
    "aria-label",
    /Spectrogram of tone-1k\.wav/
  )
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
})
