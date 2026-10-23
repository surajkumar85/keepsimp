import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { chip, download, EDITOR, folder, LARGE, settled } from "./audio"
import { openGroups } from "./settings"

const NOISE = "/dashboard/remove-background-noise/"
const VOICE = "keepsimp-voice.mp3"
const RATE = 48000
const group = (page: Page, name: string) =>
  page.getByRole("radiogroup", { name })

/** The sound FFmpeg decodes from a file, as one channel of floats. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-"],
    LARGE
  )
  return new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)
  )
}

const db = (power: number) => 10 * Math.log10(power + 1e-20)

/** The power of each 20 ms window. */
function windows(sound: Float32Array) {
  const size = RATE / 50
  return Array.from({ length: Math.floor(sound.length / size) }, (_, at) => {
    let sum = 0
    for (let index = at * size; index < (at + 1) * size; index++)
      sum += sound[index] ** 2
    return sum / size
  })
}

/** The power of one frequency over the whole sound (Goertzel). */
function tone(sound: Float32Array, frequency: number) {
  const k = 2 * Math.cos((2 * Math.PI * frequency) / RATE)
  let s1 = 0,
    s2 = 0
  for (const x of sound) {
    const s = x + k * s1 - s2
    s2 = s1
    s1 = s
  }
  return (s1 * s1 + s2 * s2 - k * s1 * s2) / sound.length ** 2
}

/** Mean power in the source's quietest and loudest fifth of windows, before and after. */
function compare(source: Float32Array, result: Float32Array) {
  const before = windows(source)
  const after = windows(result)
  const order = before
    .map((power, index) => [power, index] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, index]) => index)
  const fifth = Math.floor(order.length / 5)
  const mean = (list: number[], picked: number[]) =>
    db(picked.reduce((sum, index) => sum + list[index], 0) / picked.length)
  const pauses = order.slice(0, fifth)
  const words = order.slice(-fifth)
  return {
    pausesBefore: mean(before, pauses),
    pausesAfter: mean(after, pauses),
    wordsBefore: mean(before, words),
    wordsAfter: mean(after, words),
  }
}

test("takes the noise out between the words and the hum from under them, on the device", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const source = decoded(readFileSync(`public/samples/${VOICE}`), "voice.mp3")
  const outside: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      url.protocol.startsWith("http") &&
      url.host !== new URL(test.info().project.use.baseURL!).host
    )
      outside.push(request.url())
  })
  await page.goto(NOISE)
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for taking away background noise"
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(page.getByLabel("Take away background noise")).toHaveValue("100")
  await expect(page.getByTestId("audio-check")).toContainText("as asked")
  const result = decoded((await download(page, VOICE)).bytes, "cleaned.mp3")
  // Every sample, where it was: the MP3 decoder's own delay is measured in
  // each browser (Safari's puts none).
  expect(result.length).toBe(source.length)
  const cleaned = compare(source, result)
  // The pauses lose more than 10 dB of noise; the words keep their level
  // (less the noise that was under them).
  expect(cleaned.pausesBefore - cleaned.pausesAfter).toBeGreaterThan(10)
  expect(Math.abs(cleaned.wordsAfter - cleaned.wordsBefore)).toBeLessThan(2)

  // Before and after at the same moment.
  const player = page.getByTestId("audio-player")
  await expect
    .poll(() =>
      player.evaluate((element: HTMLAudioElement) => element.duration)
    )
    .toBeGreaterThan(8)
  await player.evaluate((element: HTMLAudioElement) => {
    element.currentTime = 4
  })
  await group(page, "Listen to").getByRole("radio", { name: "Result" }).click()
  await expect(player).toHaveAttribute("aria-label", "Result")
  await expect
    .poll(() =>
      player.evaluate((element: HTMLAudioElement) => element.currentTime)
    )
    .toBeCloseTo(4, 0)

  // The hum alone: 50 Hz goes, the voice stays.
  const strength = page.getByLabel("Take away background noise")
  await strength.focus()
  await page.keyboard.press("Home")
  await expect(strength).toHaveValue("0")
  await group(page, "Mains hum").getByRole("radio", { name: "50 Hz" }).click()
  await settled(page)
  const dehummed = decoded((await download(page, VOICE)).bytes, "hum.mp3")
  expect(db(tone(source, 50)) - db(tone(dehummed, 50))).toBeGreaterThan(20)
  const humless = compare(source, dehummed)
  expect(Math.abs(humless.wordsAfter - humless.wordsBefore)).toBeLessThan(1)

  // Nothing went anywhere but this site.
  expect(outside).toEqual([])
})

test("draws over clicks and says how many", async ({ page }) => {
  test.setTimeout(120_000)
  // Two seconds of a quiet tone with five one-sample spikes on it.
  const rate = 44100
  const clean = Float32Array.from(
    { length: rate * 2 },
    (_, index) => 0.3 * Math.sin((2 * Math.PI * 220 * index) / rate)
  )
  const clicked = clean.slice()
  for (const at of [0.3, 0.7, 1.1, 1.4, 1.8])
    clicked[Math.round(at * rate)] = 0.95
  const pcm = Buffer.from(
    Int16Array.from(clicked, (value) => Math.round(value * 32767)).buffer
  )
  const path = join(folder, "clicks.wav")
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(rate),
      "-ac",
      "1",
      "-i",
      "-",
      path,
    ],
    { input: pcm }
  )
  await page.goto(EDITOR)
  await page.locator("#audio-file").setInputFiles({
    name: "clicks.wav",
    mimeType: "audio/wav",
    buffer: readFileSync(path),
  })
  await settled(page)
  await openGroups(page)
  await chip(page, "WAV").click()
  await page.getByRole("switch", { name: "Remove clicks" }).click()
  await settled(page)
  await expect(page.getByTestId("audio-level")).toContainText(
    "5 clicks were drawn over."
  )
  const sound = decoded(
    (await download(page, "clicks.wav")).bytes,
    "declicked.wav"
  )
  expect(sound.length).toBe(clean.length)
  // Every spike is gone, and the tone is where it was.
  let most = 0
  for (let index = 0; index < sound.length; index++)
    most = Math.max(most, Math.abs(sound[index] - clean[index]))
  expect(most).toBeLessThan(0.05)
})

test("the door stays accessible and fits a phone", async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto(NOISE)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await group(page, 'Harsh "s" sounds')
    .getByRole("radio", { name: "Strong" })
    .click()
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
  await page.goto("/blog/remove-background-noise-from-audio/")
  await expect(page.locator(`a[href="${NOISE}"]`).first()).toBeAttached()
})
