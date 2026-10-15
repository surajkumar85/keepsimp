import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { unzipSync } from "fflate"
import { bytesOf, type Upload } from "./pdf"

const EDITOR = "/dashboard/audio-editor/"
const folder = mkdtempSync(join(tmpdir(), "keepsimp-audio-e2e-"))
/** Decoded sound can be many megabytes. */
const LARGE = { maxBuffer: 1 << 30 }

const workspace = (page: Page) => page.getByTestId("audio-workspace")
const item = (page: Page, name: string) =>
  page.getByTestId("queue-item").filter({ hasText: name })
const chip = (page: Page, label: string) =>
  page.getByRole("radio", { name: label, exact: true })

const fixture = (name: string, type = "audio/wav"): Upload => ({
  name,
  mimeType: type,
  buffer: readFileSync(`tests/fixtures/audio/${name}`),
})
const sample = (name: string, type: string): Upload => ({
  name,
  mimeType: type,
  buffer: readFileSync(`public/samples/${name}`),
})

/** What FFprobe says of a file. */
function probe(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,codec_type,sample_rate,channels,bits_per_raw_sample:format=duration:format_tags",
      "-of",
      "json",
      path,
    ]).toString()
  ) as {
    streams: Record<string, string | number>[]
    format: { duration: string; tags?: Record<string, string> }
  }
}

/** The samples per channel FFmpeg decodes from a file, following its gapless header or edit list. */
function samples(bytes: Uint8Array, name: string, channels = 2) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return (
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", path, "-f", "s16le", "-"],
      LARGE
    ).length /
    (2 * channels)
  )
}

/** Wait until every file is written with the current settings. */
async function settled(page: Page) {
  await expect(workspace(page)).toHaveAttribute("data-settled", "true", {
    timeout: 60_000,
  })
}

/** The result of one file in the list, downloaded. */
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download")
  // The link's own click: in Playwright's emulated phone Safari a tap here
  // can land where the link was before the page scrolled (checked on a real
  // iPhone simulator instead).
  await item(page, name)
    .getByRole("link", { name: /^Download / })
    .dispatchEvent("click")
  const got = await pending
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

async function open(page: Page, files: Upload[], route = EDITOR) {
  await page.goto(route)
  await page.locator("#audio-file").setInputFiles(files)
  await settled(page)
}

test("the samples: a tune and a video, written as gapless MP3 with their tags, checked and zipped", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(EDITOR)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(page.getByTestId("queue-item")).toHaveCount(2)
  const check = page.getByTestId("audio-check")
  await expect(check).toContainText(
    "Checked: the file written was opened again and listened to. It is 0:08.0 long, 44.1 kHz, stereo, as asked."
  )
  await expect(page.getByTestId("audio-tags")).toContainText(
    "A short tune · KeepSimp · Samples · 2026"
  )
  await expect(page.getByTestId("audio-cover")).toBeVisible()
  await expect(page.getByTestId("waveform")).toBeVisible()

  const tune = await download(page, "keepsimp-tune.flac")
  expect(tune.name).toBe("keepsimp-tune.mp3")
  const said = probe(tune.bytes, "tune.mp3")
  expect(said.streams.find((one) => one.codec_type === "audio")).toMatchObject({
    codec_name: "mp3",
    sample_rate: "44100",
    channels: 2,
  })
  // The cover goes along as a picture, and the tags with it.
  expect(said.streams.some((one) => one.codec_type === "video")).toBe(true)
  expect(said.format.tags?.title).toBe("A short tune")
  expect(said.format.tags?.artist).toBe("KeepSimp")
  // Gapless: exactly the 8 seconds of the original, not a sample more.
  expect(samples(tune.bytes, "tune.mp3")).toBe(8 * 44100)

  // Both in one ZIP, with clear names.
  const pending = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download all (ZIP)" }).click()
  const zip = unzipSync(await bytesOf(await pending))
  expect(Object.keys(zip).sort()).toEqual([
    "keepsimp-clip.mp3",
    "keepsimp-tune.mp3",
  ])
})

test("writes every format, each read back by FFmpeg as asked", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await open(page, [sample("keepsimp-tune.flac", "audio/flac")])
  const original = samples(
    readFileSync("public/samples/keepsimp-tune.flac"),
    "original.flac"
  )
  for (const [label, extension, codec, rate] of [
    ["M4A (AAC)", "m4a", "aac", "44100"],
    ["Opus", "opus", "opus", "48000"],
    ["FLAC", "flac", "flac", "44100"],
    ["WAV", "wav", "pcm_s16le", "44100"],
    ["M4R (iPhone ringtone)", "m4r", "aac", "44100"],
  ] as const) {
    await chip(page, label).click()
    await expect(page.getByTestId("audio-result")).toContainText(label, {
      timeout: 60_000,
    })
    await settled(page)
    const result = await download(page, "keepsimp-tune.flac")
    expect(result.name).toBe(`keepsimp-tune.${extension}`)
    const said = probe(result.bytes, result.name)
    expect(
      said.streams.find((one) => one.codec_type === "audio"),
      label
    ).toMatchObject({ codec_name: codec, sample_rate: rate, channels: 2 })
    const decoded = samples(result.bytes, result.name)
    // Opus ends where the sound ends at 48 kHz; AAC is gapless through the
    // edit list written after measuring the encoder.
    if (codec === "opus") expect(decoded).toBe(8 * 48000)
    else expect(decoded, label).toBe(original)
  }
  // FLAC is lossless: the same samples as the original.
  await chip(page, "FLAC").click()
  await settled(page)
  const flac = await download(page, "keepsimp-tune.flac")
  writeFileSync(join(folder, "lossless.flac"), flac.bytes)
  const decode = (path: string) =>
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", path, "-f", "s16le", "-"],
      LARGE
    )
  expect(
    decode(join(folder, "lossless.flac")).equals(
      decode("public/samples/keepsimp-tune.flac")
    )
  ).toBe(true)
  // WAV at 24 bits, and mono at a lower rate.
  await chip(page, "WAV").click()
  await chip(page, "24-bit").click()
  await page.getByLabel("Sample rate").selectOption("22050")
  await chip(page, "Mono").click()
  await settled(page)
  const deep = await download(page, "keepsimp-tune.flac")
  expect(
    probe(deep.bytes, "deep.wav").streams.find(
      (one) => one.codec_type === "audio"
    )
  ).toMatchObject({
    codec_name: "pcm_s24le",
    sample_rate: "22050",
    channels: 1,
  })
  expect(samples(deep.bytes, "deep.wav", 1)).toBe(8 * 22050)
})

test("the extractor takes a video's sound out as it is, and as MP3 when asked", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto("/dashboard/audio-extractor/")
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for taking the sound out of videos"
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(page.getByTestId("audio-result")).toContainText(
    "M4A (AAC) · copied as it is"
  )
  await expect(page.getByTestId("audio-notes")).toContainText(
    "The sound is taken out of the video as it is, without being encoded again."
  )
  const copied = await download(page, "keepsimp-clip.mp4")
  expect(copied.name).toBe("keepsimp-clip.m4a")
  const said = probe(copied.bytes, "copied.m4a")
  expect(said.streams.map((one) => one.codec_type)).toEqual(["audio"])
  expect(said.streams[0]).toMatchObject({ codec_name: "aac" })
  // Copied: the very same AAC packets as the video's, decoded alike.
  writeFileSync(
    join(folder, "clip.mp4"),
    readFileSync("public/samples/keepsimp-clip.mp4")
  )
  const fromVideo = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", join(folder, "clip.mp4"), "-vn", "-f", "s16le", "-"],
    LARGE
  )
  const fromOurs = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", join(folder, "copied.m4a"), "-f", "s16le", "-"],
    LARGE
  )
  expect(fromOurs.equals(fromVideo)).toBe(true)

  await chip(page, "MP3").click()
  await settled(page)
  const mp3 = await download(page, "keepsimp-clip.mp4")
  expect(mp3.name).toBe("keepsimp-clip.mp3")
  expect(probe(mp3.bytes, "clip.mp3").streams[0]).toMatchObject({
    codec_name: "mp3",
  })
})

test("reads AIFF, explains a file it cannot read, keeps or drops tags, and fits a size", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await open(page, [
    fixture("tone-24.aiff", "audio/aiff"),
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    sample("keepsimp-tune.flac", "audio/flac"),
  ])
  await expect(item(page, "notes.txt")).toContainText(
    "This is not a sound or video file that can be read here."
  )
  await expect(item(page, "tone-24.aiff")).toContainText("PCM 24-bit · 0:00")
  const aiff = await download(page, "tone-24.aiff")
  expect(samples(aiff.bytes, "aiff.mp3")).toBe(11025)

  // Tags off: none written.
  await page
    .getByRole("switch", { name: "Keep the title, artist and cover" })
    .click()
  await settled(page)
  const bare = await download(page, "keepsimp-tune.flac")
  const said = probe(bare.bytes, "bare.mp3")
  expect(said.format.tags?.title).toBeUndefined()
  expect(said.streams.some((one) => one.codec_type === "video")).toBe(false)

  // A size limit: the highest bitrate that fits, and the page says so.
  await chip(page, "Custom").last().click()
  await page.getByLabel("Megabytes").fill("0.1")
  await settled(page)
  await page.getByRole("button", { name: "Preview keepsimp-tune.flac" }).click()
  await expect(page.getByTestId("audio-notes")).toContainText(
    "To fit under 102.4 KB, it is written at 80 kbit/s."
  )
  const small = await download(page, "keepsimp-tune.flac")
  expect(small.bytes.length).toBeLessThanOrEqual(0.1 * 1024 * 1024)
})

test("stays accessible, local and responsive", async ({ page }) => {
  test.setTimeout(120_000)
  const external: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      (url.origin !== "http://127.0.0.1:4173" ||
        !["GET", "HEAD"].includes(request.method()))
    )
      external.push(request.url())
  })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/dashboard/audio-converter/")
  const axe = async () =>
    (
      await new AxeBuilder({ page })
        .include("[data-testid=audio-workspace]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  expect(await axe()).toEqual([])
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  expect(await axe()).toEqual([])
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  expect(await axe()).toEqual([])
  await page.setViewportSize({ width: 320, height: 740 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  // The keyboard reaches the formats and changes them.
  await chip(page, "MP3").focus()
  await page.keyboard.press("ArrowRight")
  await expect(chip(page, "M4A (AAC)")).toBeChecked()
  await settled(page)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
