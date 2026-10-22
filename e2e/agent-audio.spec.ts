import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { folder, loudnessOf, probe, samples } from "./audio"
import { hand, ran, ready, saved } from "./agent"

const tune = readFileSync("public/samples/keepsimp-tune.flac")

test("reads, converts, edits and levels sound with the workspace's own engines", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const id = await hand(page, "tune.flac", tune, "audio/flac")

  const info = await ran(page, "audio_info", { file: id })
  expect(info.data).toMatchObject({
    container: "flac",
    codec: "flac",
    sampleRate: 44100,
    channels: 2,
  })
  expect(info.data!.seconds as number).toBeCloseTo(8, 2)
  // Measured as FFmpeg measures it.
  const own = loudnessOf(tune, "agent-tune.flac")
  expect(
    Math.abs(
      (info.data!.loudness as { integrated: number }).integrated -
        own.integrated
    )
  ).toBeLessThan(0.3)

  // An MP3, gapless: as many samples as the source, no more.
  const mp3 = await ran(page, "convert_audio", { file: id })
  expect(mp3.summary).toMatch(/^MP3, .*Checked: decoded again/)
  const mp3File = await saved(page, mp3.files![0].id)
  expect(mp3File.name).toBe("tune.mp3")
  expect(samples(mp3File.bytes, "agent-tune.mp3")).toBe(8 * 44100)

  // Trimmed to 1–5 s and faded in: four seconds of WAV, exactly.
  const edited = await ran(page, "edit_audio", {
    file: id,
    steps: [
      { do: "keep", from: 1, to: 5 },
      { do: "fade", from: 0, to: 1 },
    ],
    format: "wav",
  })
  const wav = await saved(page, edited.files![0].id)
  expect(wav.name).toBe("tune-edited.wav")
  expect(samples(wav.bytes, "agent-edited.wav")).toBe(4 * 44100)

  // Brought to −16 LUFS, its true peaks under −1 dBTP, as FFmpeg measures.
  const levelled = await ran(page, "normalize_audio", {
    file: id,
    target: -16,
    format: "flac",
  })
  expect(levelled.summary).toMatch(/LUFS/)
  const flac = await saved(page, levelled.files![0].id)
  const measured = loudnessOf(flac.bytes, "agent-normalised.flac")
  expect(Math.abs(measured.integrated - -16)).toBeLessThan(0.5)
  expect(measured.truePeak).toBeLessThanOrEqual(-0.9)

  // Twice as fast: half as long.
  const fast = await ran(page, "change_audio_speed", {
    file: id,
    tempo: 2,
    format: "wav",
  })
  const fastFile = await saved(page, fast.files![0].id)
  expect(
    Number(probe(fastFile.bytes, "agent-fast.wav").format.duration)
  ).toBeCloseTo(4, 2)

  // An iPhone ringtone of all eight seconds, as AAC in M4R.
  const ringtone = await ran(page, "make_ringtone", {
    file: id,
    kind: "iphone",
  })
  expect(ringtone.summary).toMatch(/^iPhone ringtone: 8\.00 s from 0\.00 s\./)
  const m4r = await saved(page, ringtone.files![0].id)
  expect(m4r.name).toBe("tune-ringtone.m4r")
  const tone = probe(m4r.bytes, "agent-ringtone.m4a")
  expect(tone.streams[0].codec_name).toBe("aac")
  expect(Number(tone.format.duration)).toBeCloseTo(8, 1)
})

test("changes tags in place, splits and joins with chapters", async ({
  page,
}) => {
  test.setTimeout(240_000)
  await ready(page)
  const mp3 = readFileSync("tests/fixtures/audio/tone.mp3")
  const toneId = await hand(page, "tone.mp3", mp3, "audio/mpeg")
  const tagged = await ran(page, "edit_audio_tags", {
    file: toneId,
    fields: { title: "Agent tone", artist: "KeepSimp" },
  })
  expect(tagged.summary).toMatch(/^Written in place/)
  const tagFile = await saved(page, tagged.files![0].id)
  expect(probe(tagFile.bytes, "agent-tagged.mp3").format.tags).toMatchObject({
    title: "Agent tone",
    artist: "KeepSimp",
  })

  const id = await hand(page, "tune.flac", tune, "audio/flac")
  // Without tags, so each part's chapter is named after it.
  const split = await ran(page, "split_audio", {
    file: id,
    by: "count",
    parts: 2,
    keepTags: false,
  })
  expect(split.files!.map((file) => file.name)).toEqual([
    "tune-01.flac",
    "tune-02.flac",
  ])
  for (const [index, file] of split.files!.entries()) {
    const part = await saved(page, file.id)
    expect(samples(part.bytes, `agent-part-${index}.flac`)).toBe(4 * 44100)
  }

  const joined = await ran(page, "join_audio", {
    files: split.files!.map((file) => file.id),
  })
  expect(joined.summary).toMatch(/^Joined 2 files, with a chapter for each\./)
  const whole = await saved(page, joined.files![0].id)
  const path = join(folder, "agent-joined.mp3")
  writeFileSync(path, whole.bytes)
  const chapters = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_chapters",
      "-of",
      "json",
      path,
    ]).toString()
  ) as { chapters: { start_time: string; tags: { title: string } }[] }
  expect(chapters.chapters.map((chapter) => chapter.tags.title)).toEqual([
    "tune-01",
    "tune-02",
  ])
  expect(Number(chapters.chapters[1].start_time)).toBeCloseTo(4, 2)
  expect(samples(whole.bytes, "agent-joined.mp3")).toBe(8 * 44100)
})

test("takes out noise and writes down speech, on the device", async ({
  page,
}) => {
  test.setTimeout(300_000)
  await ready(page)
  const speech = readFileSync("tests/fixtures/audio/speech.flac")
  const id = await hand(page, "speech.flac", speech, "audio/flac")

  const clean = await ran(page, "remove_background_noise", {
    file: id,
    hum: 50,
  })
  const cleaned = await saved(page, clean.files![0].id)
  expect(cleaned.name).toBe("speech-clean.flac")
  expect(samples(cleaned.bytes, "agent-clean.flac", 1)).toBe(
    samples(speech, "agent-speech.flac", 1)
  )

  const transcript = await ran(page, "transcribe_audio", {
    file: id,
    language: "en",
  })
  expect(transcript.files!.map((file) => file.name)).toEqual([
    "speech.txt",
    "speech.srt",
    "speech.vtt",
  ])
  expect((transcript.data!.text as string).toLowerCase()).toContain("lazy dog")
  const srt = await saved(page, transcript.files![1].id)
  expect(srt.text).toMatch(/^1\n00:00:0\d,\d{3} --> /)
})

test("turns sound into a video, checked by FFprobe", async ({ page }) => {
  test.setTimeout(240_000)
  await ready(page)
  const id = await hand(
    page,
    "tone.wav",
    readFileSync("tests/fixtures/audio/tone.wav"),
    "audio/wav"
  )
  const video = await ran(page, "audio_to_video", {
    file: id,
    shape: "landscape",
  })
  expect(video.summary).toMatch(/^Checked: (MP4|WebM) .*Landscape/)
  const file = await saved(page, video.files![0].id)
  const path = join(folder, file.name)
  writeFileSync(path, file.bytes)
  const info = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height",
      "-of",
      "json",
      path,
    ]).toString()
  ) as { streams: { codec_type: string; width?: number; height?: number }[] }
  expect(
    info.streams.find((stream) => stream.codec_type === "video")
  ).toMatchObject({
    width: 1920,
    height: 1080,
  })
  expect(info.streams.some((stream) => stream.codec_type === "audio")).toBe(
    true
  )
  // The sound written on the way is not left among the files.
  const listed = await ran(page, "list_files", {})
  expect(
    (listed.data as unknown as { name: string }[]).map((one) => one.name)
  ).toEqual(["tone.wav", file.name])
})
