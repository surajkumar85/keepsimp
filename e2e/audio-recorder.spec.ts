import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { chip, folder, LARGE, probe, settled } from "./audio"
import { bytesOf } from "./pdf"

const RECORDER = "/dashboard/voice-recorder/"
const recorder = (page: Page) => page.getByTestId("recorder")
const seconds = async (page: Page) => {
  const [minutes, rest] = (
    await page.getByTestId("recorder-time").innerText()
  ).split(":")
  return Number(minutes) * 60 + Number(rest)
}

/** The sound FFmpeg decodes, as one channel of floats at 48 kHz. */
function decoded(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "48000", "-"],
    LARGE
  )
  return new Float32Array(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)
  )
}

/**
 * How much of a sound's power is at one frequency: Goertzel over each
 * tenth of a second, averaged, so a jump of phase at a pause (the tone
 * goes on while the take is paused) does not cancel it out.
 */
function share(sound: Float32Array, frequency: number) {
  const size = 4800
  const k = 2 * Math.cos((2 * Math.PI * frequency) / 48000)
  const shares: number[] = []
  for (let from = 0; from + size <= sound.length; from += size) {
    let s1 = 0,
      s2 = 0,
      total = 0
    for (let index = from; index < from + size; index++) {
      const x = sound[index]
      const s = x + k * s1 - s2
      s2 = s1
      s1 = s
      total += x * x
    }
    if (total < 1e-6) continue
    const power = (s1 * s1 + s2 * s2 - k * s1 * s2) / size
    shares.push((2 * power) / total)
  }
  return shares.reduce((sum, one) => sum + one, 0) / shares.length
}

/** The file in the list that a take made, downloaded. */
async function take(page: Page) {
  const row = page
    .getByTestId("queue-item")
    .filter({ hasText: /recording-\d{4}-\d{2}-\d{2}-\d{6}\.wav/ })
  await expect(row).toHaveCount(1)
  const pending = page.waitForEvent("download")
  await row.getByRole("link", { name: /^Download / }).dispatchEvent("click")
  const got = await pending
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

/**
 * A microphone made by the page itself: a 440 Hz tone from an oscillator,
 * as a media stream. Headless browsers on a Mac cannot open even a fake
 * device past the system's permission, so the microphone is the one part
 * not the browser's own; everything after it is.
 */
/** Whether this browser can start its sound engine here (Firefox on a machine with no sound device cannot). */
async function soundRuns(page: Page) {
  return page.evaluate(async () => {
    const context = new AudioContext()
    const started = await Promise.race([
      context.resume().then(() => context.state === "running"),
      new Promise<boolean>((done) => setTimeout(() => done(false), 3000)),
    ])
    void context.close()
    return started
  })
}

async function toneMicrophone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext()
        await context.resume()
        const tone = context.createOscillator()
        tone.frequency.value = 440
        const gain = context.createGain()
        gain.gain.value = 0.5
        const out = context.createMediaStreamDestination()
        tone.connect(gain).connect(out)
        tone.start()
        return out.stream
      },
    })
  })
}

test("records from the microphone, pauses and goes on, and keeps every sample", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await toneMicrophone(page)
  await page.goto(RECORDER)
  test.skip(
    !(await soundRuns(page)),
    "This browser cannot start its sound engine on this machine (no sound device)"
  )
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for recording"
  )
  await recorder(page).getByRole("button", { name: "Record" }).click()
  await expect(page.getByTestId("recorder-status")).toHaveText("Recording", {
    timeout: 20_000,
  })
  await expect
    .poll(() => seconds(page), { timeout: 15_000 })
    .toBeGreaterThan(1.5)
  // The meter hears something.
  await expect
    .poll(
      async () =>
        Number(
          await page.getByTestId("recorder-level").getAttribute("aria-valuenow")
        ),
      { timeout: 10_000 }
    )
    .toBeGreaterThan(-50)
  await recorder(page).getByRole("button", { name: "Pause" }).click()
  await expect(page.getByTestId("recorder-status")).toHaveText("Paused")
  const paused = await seconds(page)
  await page.waitForTimeout(1200)
  expect(await seconds(page)).toBe(paused)
  await recorder(page).getByRole("button", { name: "Go on" }).click()
  await expect
    .poll(() => seconds(page), { timeout: 15_000 })
    .toBeGreaterThan(paused + 1.5)
  await recorder(page).getByRole("button", { name: "Stop and keep" }).click()
  await expect(
    recorder(page).getByRole("button", { name: "Record" })
  ).toBeVisible({ timeout: 20_000 })
  await settled(page)

  // Kept as it came: 32-bit floats, in a WAV, as long as the clock said (the pause left out).
  await page
    .getByRole("radiogroup", { name: "Write as" })
    .getByRole("radio", { name: "Same as the file" })
    .click()
  await settled(page)
  const wav = await take(page)
  expect(wav.name).toMatch(/^recording-\d{4}-\d{2}-\d{2}-\d{6}\.wav$/)
  const [stream] = probe(wav.bytes, "take.wav").streams
  expect(stream.codec_name).toBe("pcm_f32le")
  const length = Number(probe(wav.bytes, "take-length.wav").format.duration)
  expect(length).toBeGreaterThan(paused + 1.5)
  expect(length).toBeLessThan(paused + 8)
  const sound = decoded(wav.bytes, "take-sound.wav")
  const peak = sound.reduce((most, x) => Math.max(most, Math.abs(x)), 0)
  expect(peak).toBeGreaterThan(0.01)
  // The microphone plays a 440 Hz tone: the take is that tone.
  expect(share(sound, 440)).toBeGreaterThan(0.8)

  // Written as MP3, as the page chose for a recording.
  await chip(page, "MP3").click()
  await settled(page)
  const mp3 = await take(page)
  expect(mp3.name).toMatch(/\.mp3$/)
  expect(probe(mp3.bytes, "take.mp3").streams[0].codec_name).toBe("mp3")
})

test("keeps a draft that a closed tab does not lose, and deletes it once used", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await toneMicrophone(page)
  await page.goto(RECORDER)
  test.skip(
    !(await soundRuns(page)),
    "This browser cannot start its sound engine on this machine (no sound device)"
  )
  await recorder(page)
    .getByRole("switch", { name: "Keep a draft while recording" })
    .click()
  await recorder(page).getByRole("button", { name: "Record" }).click()
  await expect(page.getByTestId("recorder-status")).toHaveText("Recording", {
    timeout: 20_000,
  })
  await expect
    .poll(() => seconds(page), { timeout: 20_000 })
    .toBeGreaterThan(3.2)
  // The tab goes away mid-take.
  await page.reload()
  const draft = page.getByTestId("recorder-draft")
  await expect(draft).toContainText("was not finished")
  // The switch starts off again.
  await expect(
    recorder(page).getByRole("switch", { name: "Keep a draft while recording" })
  ).not.toBeChecked()
  await draft.getByRole("button", { name: "Add it to the files" }).click()
  await settled(page)
  await page
    .getByRole("radiogroup", { name: "Write as" })
    .getByRole("radio", { name: "Same as the file" })
    .click()
  await settled(page)
  const kept = await take(page)
  // Whole seconds were kept, up to the last before it stopped.
  const length = Number(probe(kept.bytes, "draft.wav").format.duration)
  expect(length).toBeGreaterThanOrEqual(2)
  expect(length).toBeLessThan(4.5)
  await page.reload()
  await expect(page.getByTestId("recorder")).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByTestId("recorder-draft")).toHaveCount(0)
})

test("says why when the microphone is refused, and stays accessible on a phone", async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
      value: () => Promise.reject(new DOMException("No", "NotAllowedError")),
    })
  })
  await page.goto(RECORDER)
  await recorder(page).getByRole("button", { name: "Record" }).click()
  await expect(page.getByTestId("recorder-problem")).toContainText(
    "was not allowed to use the microphone"
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
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // The editor has it a press away.
  await page.goto("/dashboard/audio-editor/")
  await page.getByRole("button", { name: "Record from a microphone" }).click()
  await expect(recorder(page)).toBeVisible()
  await page.goto("/blog/record-audio-online/")
  await expect(page.locator(`a[href="${RECORDER}"]`).first()).toBeAttached()
})
