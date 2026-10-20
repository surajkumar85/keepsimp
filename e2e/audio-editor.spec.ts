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
  probe,
  samples,
  settled,
} from "./audio"

const TRIMMER = "/dashboard/audio-trimmer/"
const RINGTONES = "/dashboard/ringtone-maker/"
const RATE = 44100

const editor = (page: Page) => page.getByTestId("sound-editor")
const steps = (page: Page) => page.getByTestId("editor-steps").locator("li")
const press = (page: Page, name: string) =>
  editor(page).getByRole("button", { name, exact: true }).click()

/** Choose a part by typing its start and end. */
async function choose(page: Page, from: string, to: string) {
  const start = editor(page).getByLabel("Start", { exact: true })
  await start.fill(from)
  await start.press("Enter")
  const end = editor(page).getByLabel("End", { exact: true })
  await end.fill(to)
  await end.press("Enter")
}

/** Open a page with the sample in it; a door first says what it is opened for. */
async function withSample(page: Page, route: string, focused?: string) {
  await page.goto(route)
  if (focused)
    await expect(page.getByTestId("audio-focused")).toContainText(focused)
  await page.getByRole("button", { name: "Try a sample" }).first().click()
  await expect(editor(page).first()).toBeVisible()
  await settled(page)
}

/** Samples a file decodes to, as 16-bit integers, by FFmpeg. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "s16le", "-"],
    LARGE
  )
  return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
}

/** The loudest sample (of either channel) from `from` to `to` seconds. */
function loudest(pcm: Int16Array, from: number, to: number) {
  let most = 0
  for (let index = from * RATE * 2; index < to * RATE * 2; index++)
    most = Math.max(most, Math.abs(pcm[Math.round(index)]))
  return most
}

test("the trimmer keeps the part chosen, to the sample, in the file's own format", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await withSample(page, TRIMMER, "opened for trimming")
  await choose(page, "1.5", "0:04")
  await expect(page.getByTestId("editor-selection-said")).toHaveText(
    "Selected 0:01.500 to 0:04.000, 2.500 seconds."
  )
  await press(page, "Keep only this")
  await expect(steps(page)).toHaveText(["Kept 0:01.500–0:04.000"])
  await expect(page.getByTestId("editor-time")).toContainText("/ 0:02.500")
  await settled(page)
  await expect(page.getByTestId("audio-notes")).toContainText(
    "The sound is encoded again in its own format, to make the edits."
  )
  // Safari cannot decode FLAC to check it, and says so.
  await expect(page.getByTestId("audio-check")).toContainText(
    /It is 0:02\.5 long|cannot decode FLAC/
  )
  const trimmed = await download(page, "keepsimp-tune.flac")
  expect(trimmed.name).toBe("keepsimp-tune.flac")
  expect(probe(trimmed.bytes, "trimmed.flac").streams[0]).toMatchObject({
    codec_name: "flac",
  })
  // Exactly the part kept, and inside its short fades every sample is the original's.
  const ours = decoded(trimmed.bytes, "trimmed.flac")
  expect(ours.length / 2).toBe(2.5 * RATE)
  const source = decoded(
    readFileSync("public/samples/keepsimp-tune.flac"),
    "tune.flac"
  )
  const offset = 1.5 * RATE * 2
  const edge = 200 * 2
  let differ = 0
  for (let index = edge; index < ours.length - edge; index++)
    if (ours[index] !== source[offset + index]) differ++
  expect(differ).toBe(0)
  // At the cut the sound fades in from nothing, so it does not click.
  expect(Math.abs(ours[0])).toBeLessThanOrEqual(1)

  // Undone, the file is written whole again.
  await editor(page).getByRole("button", { name: "Undo" }).click()
  await expect(steps(page)).toHaveCount(0)
  await settled(page)
  await expect(page.getByTestId("audio-check")).toContainText(
    /It is 0:08\.0 long|cannot decode FLAC/
  )
})

test("the editor cuts, silences and fades, written as an MP3 of exactly the edited length", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await withSample(page, EDITOR)
  await page.getByRole("button", { name: "Preview keepsimp-tune.flac" }).click()
  await choose(page, "2", "3")
  await press(page, "Cut out")
  await expect(page.getByTestId("editor-time")).toContainText("/ 0:07.000")
  await choose(page, "0", "1")
  await press(page, "Silence")
  await choose(page, "5", "7")
  await press(page, "Fade out")
  await expect(steps(page)).toHaveText([
    "Cut out 0:02.000–0:03.000",
    "Silenced 0:00.000–0:01.000",
    "Faded out 0:05.000–0:07.000 (S-curve)",
  ])
  await settled(page)
  const edited = await download(page, "keepsimp-tune.flac")
  expect(edited.name).toBe("keepsimp-tune.mp3")
  expect(samples(edited.bytes, "edited.mp3")).toBe(7 * RATE)
  const pcm = decoded(edited.bytes, "edited.mp3")
  // Silent where it was silenced, sounding after, and faded to nothing at the end.
  expect(loudest(pcm, 0.05, 0.95)).toBeLessThan(40)
  expect(loudest(pcm, 1.2, 1.8)).toBeGreaterThan(3000)
  expect(loudest(pcm, 6.97, 6.99)).toBeLessThan(200)
  expect(loudest(pcm, 6.97, 6.99)).toBeLessThan(loudest(pcm, 5.0, 5.2) / 20)

  // Undo, redo, and start again: each file keeps its own steps.
  const undo = editor(page).getByRole("button", { name: "Undo" })
  const redo = editor(page).getByRole("button", { name: "Redo" })
  await undo.click()
  await expect(steps(page)).toHaveCount(2)
  await redo.click()
  await expect(steps(page)).toHaveCount(3)
  await page.getByRole("button", { name: "Preview keepsimp-clip.mp4" }).click()
  await expect(steps(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Preview keepsimp-tune.flac" }).click()
  await expect(steps(page)).toHaveCount(3)
  await press(page, "Start again")
  await expect(steps(page)).toHaveCount(0)
  await expect(redo).toBeDisabled()

  // Louder by 6 dB doubles the peaks of the part chosen.
  await choose(page, "1", "2")
  await editor(page).getByLabel("Volume of the selection").fill("-6.0206")
  await press(page, "Make quieter")
  await expect(steps(page)).toHaveText([
    "Quieter by 6.0206 dB, 0:01.000–0:02.000",
  ])
  await chip(page, "WAV").click()
  await settled(page)
  const quieter = decoded(
    (await download(page, "keepsimp-tune.flac")).bytes,
    "quieter.wav"
  )
  const whole = decoded(
    readFileSync("public/samples/keepsimp-tune.flac"),
    "tune.flac"
  )
  expect(loudest(quieter, 1.1, 1.9) / loudest(whole, 1.1, 1.9)).toBeCloseTo(
    0.5,
    2
  )
})

test("the ringtone maker makes iPhone and Android ringtones of the part chosen", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await withSample(page, RINGTONES, "opened for making ringtones")
  await expect(chip(page, "M4R (iPhone ringtone)")).toBeChecked()
  await choose(page, "1", "7")
  await editor(page).getByRole("button", { name: "Make the ringtone" }).click()
  await expect(steps(page)).toHaveText([
    "Kept 0:01.000–0:07.000; Faded in 0:00.000–0:00.050 (even); Faded out 0:04.500–0:06.000 (S-curve)",
  ])
  await settled(page)
  const iphone = await download(page, "keepsimp-tune.flac")
  expect(iphone.name).toBe("keepsimp-tune.m4r")
  expect(probe(iphone.bytes, "tune.m4r").streams[0]).toMatchObject({
    codec_name: "aac",
  })
  // FFmpeg before 7 plays an edit list's start but not its end: up to one frame more.
  const length = samples(iphone.bytes, "tune.m4r")
  expect(length).toBeGreaterThanOrEqual(6 * RATE)
  expect(length).toBeLessThan(6 * RATE + 1024)
  await expect(
    page.getByText("How to put it on your phone", { exact: true })
  ).toBeVisible()

  // For Android, with nothing chosen: all of it (shorter than 30 s), as MP3.
  await press(page, "Start again")
  await page.getByRole("radio", { name: "Android ringtone" }).click()
  await editor(page).getByRole("button", { name: "Make the ringtone" }).click()
  await expect(chip(page, "MP3")).toBeChecked()
  await expect(steps(page)).toHaveText([
    "Faded in 0:00.000–0:00.050 (even); Faded out 0:06.000–0:08.000 (S-curve)",
  ])
  await settled(page)
  const android = await download(page, "keepsimp-tune.flac")
  expect(android.name).toBe("keepsimp-tune.mp3")
  expect(samples(android.bytes, "android.mp3")).toBe(8 * RATE)
})

test("the keys and the pointer choose, cut, undo and zoom", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await withSample(page, TRIMMER)
  const wave = page.getByRole("slider", { name: /^Playhead in / })
  await wave.focus()
  await page.keyboard.press("Home")
  await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("Shift+ArrowRight")
  await expect(wave).toHaveAttribute("aria-valuenow", "2")
  await page.keyboard.press("i")
  await page.keyboard.press("l")
  await expect(wave).toHaveAttribute("aria-valuenow", "7")
  await page.keyboard.press("o")
  await expect(page.getByTestId("editor-selection-said")).toHaveText(
    "Selected 0:02.000 to 0:07.000, 5.000 seconds."
  )
  await page.keyboard.press("Delete")
  await expect(steps(page)).toHaveText(["Cut out 0:02.000–0:07.000"])
  await expect(page.getByTestId("editor-time")).toContainText("/ 0:03.000")
  await page.keyboard.press("ControlOrMeta+z")
  await expect(steps(page)).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(steps(page)).toHaveCount(1)
  await page.keyboard.press("ControlOrMeta+z")

  // Zoom in and back out with the keys.
  const fit = editor(page).getByRole("button", { name: "Show all of it" })
  await expect(fit).toBeDisabled()
  await page.keyboard.press("+")
  await expect(fit).toBeEnabled()
  await expect(
    editor(page).getByRole("slider", { name: "Scroll along the sound" })
  ).toBeVisible()
  await page.keyboard.press("0")
  await expect(fit).toBeDisabled()

  // A drag across the waveform chooses the part under it.
  const box = (await wave.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, {
    steps: 4,
  })
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, {
    steps: 4,
  })
  await page.mouse.up()
  const said = await page.getByTestId("editor-selection-said").textContent()
  const [, from, to] = /0:0(\d\.\d+) to 0:0(\d\.\d+)/.exec(said!)!
  expect(Number(from)).toBeCloseTo(2, 0)
  expect(Number(to)).toBeCloseTo(4, 0)
})

test("the trimmer and ringtone maker stay accessible and fit a phone", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const route of [TRIMMER, RINGTONES]) {
    await withSample(page, route)
    await choose(page, "1", "3")
    const axe = async () =>
      (
        await new AxeBuilder({ page })
          .include("[data-testid=audio-workspace]")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations
    expect(await axe()).toEqual([])
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
    expect(await axe()).toEqual([])
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" })
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // Each door has its own article, which leads back to it.
  for (const [guide, route] of [
    ["/blog/trim-audio-without-uploading/", TRIMMER],
    ["/blog/make-a-ringtone/", RINGTONES],
  ]) {
    await page.goto(guide)
    await expect(page.locator(`a[href="${route}"]`).first()).toBeAttached()
  }
  expect(errors).toEqual([])
})

test("trims the silence at the ends and shortens a long pause, as steps", async ({
  page,
}) => {
  test.setTimeout(120_000)
  // 1 s of silence, 2 s of tone, a 2.5 s pause, 2.5 s of tone, 1 s of silence.
  const path = join(folder, "pauses.wav")
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=if(between(t\\,1\\,3)+between(t\\,5.5\\,8)\\,0.3*sin(2*PI*440*t)\\,0):s=44100:d=9",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    path,
  ])
  await page.goto(TRIMMER)
  await page.locator("#audio-file").setInputFiles({
    name: "pauses.wav",
    mimeType: "audio/wav",
    buffer: readFileSync(path),
  })
  await settled(page)
  const found = page.getByTestId("silence-found")
  await expect(found).toContainText("Silence at the ends: 1.8 s.")
  await expect(found).toContainText(
    "1 pause longer than 1 s; shortening it to 0.4 s takes out 2.1 s."
  )
  await editor(page)
    .getByRole("button", { name: "Trim silence at the ends" })
    .click()
  await expect(steps(page)).toHaveText(["Kept 0:00.900–0:08.100"])
  await expect(found).toContainText("No silence at the ends.")
  await editor(page)
    .getByRole("button", { name: "Shorten long pauses" })
    .click()
  await expect(steps(page)).toHaveCount(2)
  await expect(page.getByTestId("editor-time")).toContainText("/ 0:05.100")
  await settled(page)
  const trimmed = await download(page, "pauses.wav")
  expect(
    Math.abs(samples(trimmed.bytes, "pauses-out.wav") - 5.1 * RATE)
  ).toBeLessThan(2)
  // One undo brings the pause back.
  await editor(page).getByRole("button", { name: "Undo" }).click()
  await expect(page.getByTestId("editor-time")).toContainText("/ 0:07.200")
})
