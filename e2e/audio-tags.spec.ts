import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { chip, download, fixture, folder, probe, settled } from "./audio"

const TAGS = "/dashboard/edit-audio-tags/"
const panel = (page: Page) => page.getByTestId("tag-panel")
const field = (page: Page, label: string) =>
  panel(page).getByLabel(label, { exact: true })

/** FFmpeg's hash of a file's sound packets, copied as they are. */
function soundHash(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:a",
    "-c",
    "copy",
    "-f",
    "md5",
    "-",
  ])
    .toString()
    .trim()
}

/** What FFprobe reads of a file's tags, keys in lower case, Ogg's stream tags too. */
function tagsOf(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const json = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format_tags:stream_tags:stream=codec_type",
      "-of",
      "json",
      path,
    ]).toString()
  ) as {
    format: { tags?: Record<string, string> }
    streams: { codec_type: string; tags?: Record<string, string> }[]
  }
  const tags: Record<string, string> = {}
  for (const from of [
    json.format.tags,
    ...json.streams
      .filter((stream) => stream.codec_type === "audio")
      .map((stream) => stream.tags),
  ])
    for (const [key, value] of Object.entries(from ?? {}))
      tags[key.toLowerCase()] = value
  return {
    tags,
    pictures: json.streams.filter((stream) => stream.codec_type === "video")
      .length,
  }
}

/** ExifTool's warnings about a file's tags. */
function warnings(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const read = JSON.parse(
    execFileSync("exiftool", ["-j", "-a", "-G1", path]).toString()
  )[0] as Record<string, unknown>
  return Object.keys(read).filter((key) => /Warning|Error/.test(key))
}

const sample = (name: string) =>
  new Uint8Array(readFileSync(`public/samples/${name}`))

execFileSync("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=c=orange:s=48x48",
  "-frames:v",
  "1",
  join(folder, "cover.png"),
])
const cover = readFileSync(join(folder, "cover.png"))

test("changes the tags of many files at once and of one alone, the sound byte for byte", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto(TAGS)
  await expect(page.getByTestId("audio-focused")).toContainText(
    "opened for changing tags"
  )
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await expect(panel(page).getByTestId("tag-said")).toContainText(
    "Only the tags are written"
  )

  // Both files: one album and artist.
  await panel(page).getByRole("radio", { name: "All 2 files" }).click()
  await expect(field(page, "Title")).toHaveAttribute(
    "placeholder",
    "Different in each file"
  )
  await field(page, "Album").fill("Morning sessions")
  await field(page, "Artist").fill("The KeepSimp Band")
  await field(page, "Artist").blur()

  // The tune alone: its title, its track and a cover.
  await panel(page).getByRole("radio", { name: "This file" }).click()
  await field(page, "Title").fill("Tune ✓ for the morning")
  await field(page, "Track").fill("1")
  await field(page, "Tracks in all").fill("2")
  await field(page, "Lyrics").fill("La la la\nLa la")
  await field(page, "Lyrics").blur()
  await panel(page)
    .locator('input[type="file"]')
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: cover })
  await expect(panel(page).getByAltText("The cover")).toBeVisible()
  await settled(page)

  const tune = await download(page, "keepsimp-tune.flac")
  expect(tune.name).toBe("keepsimp-tune.flac")
  expect(soundHash(tune.bytes, "tune.flac")).toBe(
    soundHash(sample("keepsimp-tune.flac"), "tune-source.flac")
  )
  const read = tagsOf(tune.bytes, "tune-tags.flac")
  expect(read.tags).toMatchObject({
    title: "Tune ✓ for the morning",
    artist: "The KeepSimp Band",
    album: "Morning sessions",
    // Kept as the file had them.
    genre: "Demo",
    date: "2026",
  })
  expect(read.tags.track).toMatch(/^1(\/2)?$/)
  expect(read.tags.lyrics).toContain("La la la")
  expect(read.pictures).toBe(1)
  expect(warnings(tune.bytes, "tune-exif.flac")).toEqual([])

  const voice = await download(page, "keepsimp-voice.mp3")
  expect(soundHash(voice.bytes, "voice.mp3")).toBe(
    soundHash(sample("keepsimp-voice.mp3"), "voice-source.mp3")
  )
  expect(tagsOf(voice.bytes, "voice-tags.mp3").tags).toMatchObject({
    title: "A noisy voice note",
    artist: "The KeepSimp Band",
    album: "Morning sessions",
  })
  expect(warnings(voice.bytes, "voice-exif.mp3")).toEqual([])

  // Put back: the very file it was.
  await page.getByRole("button", { name: "Preview keepsimp-voice.mp3" }).click()
  await panel(page)
    .getByRole("button", { name: "Put the file's tags back" })
    .click()
  await settled(page)
  expect((await download(page, "keepsimp-voice.mp3")).bytes).toEqual(
    sample("keepsimp-voice.mp3")
  )
})

test("writes M4A, Opus and WAV in place, and another format with its sound", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto(TAGS)
  await page
    .locator("#audio-file")
    .setInputFiles([
      fixture("tone.m4a", "audio/mp4"),
      fixture("tone.opus", "audio/ogg"),
      fixture("tone.wav"),
    ])
  await settled(page)
  await panel(page).getByRole("radio", { name: "All 3 files" }).click()
  await field(page, "Genre").fill("Jazz")
  await field(page, "Year").fill("2024")
  await field(page, "Year").blur()
  await settled(page)
  for (const name of ["tone.m4a", "tone.opus", "tone.wav"]) {
    const got = await download(page, name)
    expect(soundHash(got.bytes, `new-${name}`)).toBe(
      soundHash(
        new Uint8Array(readFileSync(`tests/fixtures/audio/${name}`)),
        `old-${name}`
      )
    )
    const { tags } = tagsOf(got.bytes, `tags-${name}`)
    expect(tags.genre).toBe("Jazz")
    expect(tags.date ?? tags.year ?? "").toContain("2024")
    expect(warnings(got.bytes, `exif-${name}`)).toEqual([])
  }

  // As MP3: the sound is written, and the tags go with it.
  await chip(page, "MP3").click()
  await expect(panel(page).getByTestId("tag-said")).toContainText(
    "The tags go into the file as it is written"
  )
  await settled(page)
  const mp3 = await download(page, "tone.m4a")
  expect(mp3.name).toBe("tone.mp3")
  expect(probe(mp3.bytes, "tone-as.mp3").streams[0].codec_name).toBe("mp3")
  expect(tagsOf(mp3.bytes, "tone-as-tags.mp3").tags.genre).toBe("Jazz")

  // With tags turned off, the panel says so and turns them back on.
  await page
    .getByRole("switch", { name: "Keep the title, artist and cover" })
    .click()
  await expect(panel(page)).toContainText("Results are written without tags")
  await panel(page).getByRole("button", { name: "Keep tags" }).click()
  await expect(field(page, "Genre")).toBeVisible()
})

test("says what cannot be written, and stays accessible on a phone", async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto(TAGS)
  await page.getByRole("button", { name: "Try a sample" }).click()
  await settled(page)
  await field(page, "Year").fill("twenty")
  await expect(panel(page)).toContainText("Write the year as a number")
  await panel(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "cover.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    })
  await expect(panel(page).getByRole("alert")).toContainText("JPEG or PNG")
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
  await page.goto("/blog/edit-audio-tags-and-cover-art/")
  await expect(page.locator(`a[href="${TAGS}"]`).first()).toBeAttached()
})
