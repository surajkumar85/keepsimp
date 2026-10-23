/** What the video specs share: the page, generated files, and FFmpeg to read results. */
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { bytesOf, type Upload } from "./pdf"
import { openGroups } from "./settings"

export const EDITOR = "/dashboard/video-editor/"
export const CONVERTER = "/dashboard/video-converter/"
export const COMPRESSOR = "/dashboard/video-compressor/"
export const TRIMMER = "/dashboard/video-trimmer/"
export const CROP = "/dashboard/crop-video/"
export const SPEED = "/dashboard/change-video-speed/"
export const MUTE = "/dashboard/mute-video/"
export const folder = mkdtempSync(join(tmpdir(), "keepsimp-video-e2e-"))

export const workspace = (page: Page) => page.getByTestId("video-workspace")
export const item = (page: Page, name: string) =>
  page.getByTestId("queue-item").filter({ hasText: name })
export const chip = (page: Page, label: string) =>
  page.getByRole("radio", { name: label, exact: true })

/** A clip FFmpeg makes: a test picture, a tone, H.264 and AAC in MP4 unless told otherwise. */
export function clip(
  name: string,
  {
    size = "1280x720",
    rate = 30,
    seconds = 3,
    sound = true,
    args = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"],
  }: {
    size?: string
    rate?: number
    seconds?: number
    sound?: boolean
    args?: string[]
  } = {}
): Upload {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
    ...(sound
      ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`]
      : []),
    ...args,
    path,
  ])
  return { name, mimeType: "video/mp4", buffer: readFileSync(path) }
}

export const sample = (): Upload => ({
  name: "keepsimp-clip.mp4",
  mimeType: "video/mp4",
  buffer: readFileSync("public/samples/keepsimp-clip.mp4"),
})

export interface Probed {
  streams: {
    codec_type: string
    codec_name: string
    width?: number
    height?: number
    r_frame_rate?: string
    nb_read_frames?: string
    side_data_list?: { rotation?: number }[]
  }[]
  format: { duration: string; format_name: string }
}

/** What FFprobe says of a file, counting its frames. */
export function probe(bytes: Uint8Array, name: string): Probed {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      path,
    ]).toString()
  ) as Probed
}

/** FFmpeg decodes every frame and sample without a complaint. */
export function decodesCleanly(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return (
    execFileSync("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], {
      encoding: "utf8",
    }).trim() === ""
  )
}

/** Hashes of one stream's packets, copied rather than decoded. */
export function packets(bytes: Uint8Array, name: string, stream: "v" | "a") {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    `0:${stream}:0`,
    "-c",
    "copy",
    "-f",
    "framemd5",
    "-",
  ])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[5].trim())
}

/** Hashes of every frame FFmpeg decodes, as it is shown (edit lists followed). */
export function frameHashes(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-map",
    "0:v:0",
    "-fps_mode",
    "passthrough",
    "-f",
    "framemd5",
    "-",
  ])
    .toString()
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",")[5].trim())
}

/** One stream's length in seconds, as FFprobe reads it. */
export function streamSeconds(
  bytes: Uint8Array,
  name: string,
  stream: "v" | "a"
) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      `${stream}:0`,
      "-show_entries",
      "stream=duration",
      "-of",
      "csv=p=0",
      path,
    ])
      .toString()
      .trim()
  )
}

/** The order of an MP4's top boxes: the index first means fast start. */
export function topOrder(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const order: string[] = []
  for (let at = 0; at + 8 <= bytes.length;) {
    let size = view.getUint32(at)
    if (size === 1) size = Number(view.getBigUint64(at + 8))
    if (size === 0) size = bytes.length - at
    order.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)))
    at += size
  }
  return order
}

/** Wait until every file is written with the current settings. */
export async function settled(page: Page, timeout = 120_000) {
  try {
    await expect(workspace(page)).toHaveAttribute("data-settled", "true", {
      timeout,
    })
  } catch (error) {
    const rows = await page.getByTestId("queue-item").allTextContents()
    const plan = await page
      .getByTestId("video-plan")
      .textContent()
      .catch(() => null)
    throw new Error(
      `The videos did not finish. Files: ${rows.join(" | ")}. Plan: ${plan}`,
      { cause: error }
    )
  }
}

/** The result of one file in the list, downloaded. */
export async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download")
  await item(page, name)
    .getByRole("link", { name: /^Download / })
    .dispatchEvent("click")
  const got = await pending
  return { name: got.suggestedFilename(), bytes: await bytesOf(got) }
}

export async function open(page: Page, files: Upload[], route = EDITOR) {
  await page.goto(route)
  await page.locator("#video-file").setInputFiles(files)
  await settled(page)
  await openGroups(page)
}

/** Whether this browser can write a codec at a size, as the page asks it. */
export const canEncode = (
  page: Page,
  codec: string,
  width: number,
  height: number
) =>
  page.evaluate(
    async ({ codec, width, height }) => {
      if (typeof VideoEncoder === "undefined") return false
      const strings: Record<string, string> = {
        avc: "avc1.42001f",
        vp9: "vp09.00.10.08",
        vp8: "vp8",
        av1: "av01.0.04M.08",
        hevc: "hev1.1.6.L93.B0",
      }
      try {
        const { supported } = await VideoEncoder.isConfigSupported({
          codec: strings[codec],
          width,
          height,
          bitrate: 1_000_000,
        })
        return Boolean(supported)
      } catch {
        return false
      }
    },
    { codec, width, height }
  )

/** A clip with a white flash and a beep, both at exactly one second. */
export function syncClip(name = "sync.mp4"): Upload {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=black:size=320x240:rate=30:duration=3",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:sample_rate=48000:duration=0.2",
    "-filter_complex",
    "[0]drawbox=enable='between(t,1,1.1)':color=white:t=fill[v];[2]adelay=1000|1000,apad[b];[1][b]amix=inputs=2:duration=first:normalize=0[a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    path,
  ])
  return { name, mimeType: "video/mp4", buffer: readFileSync(path) }
}

/** Milliseconds the beep is heard after the flash is seen, as FFmpeg plays the file. */
export function syncOffset(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const frames = execFileSync("ffprobe", [
    "-v",
    "error",
    "-f",
    "lavfi",
    `movie=${path},signalstats`,
    "-show_entries",
    "frame=pts_time:frame_tags=lavfi.signalstats.YAVG",
    "-of",
    "csv=p=0",
  ])
    .toString()
    .trim()
    .split("\n")
    .map((line) => line.split(",").map(Number))
  const flash = frames.find(([, luma]) => luma > 100)![0]
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
    { maxBuffer: 1 << 28 }
  )
  const sound = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4)
  const onset = sound.findIndex((value) => Math.abs(value) > 0.1) / 48000
  return (onset - flash) * 1000
}

/** Each frame's time and average brightness (0 to 255), as FFmpeg decodes them. */
export function brightness(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  return execFileSync("ffprobe", [
    "-v",
    "error",
    "-f",
    "lavfi",
    `movie=${path},signalstats`,
    "-show_entries",
    "frame=pts_time:frame_tags=lavfi.signalstats.YAVG",
    "-of",
    "csv=p=0",
  ])
    .toString()
    .trim()
    .split("\n")
    .map((line) => line.split(",").map(Number) as [number, number])
}

/** The sound, mono at 48 kHz, as FFmpeg decodes it. */
export function soundOf(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"],
    { maxBuffer: 1 << 28 }
  )
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4)
}

/** How loud a stretch of sound is (root mean square), from and to seconds. */
export function loudness(sound: Float32Array, from: number, to: number) {
  const part = sound.subarray(Math.round(from * 48000), Math.round(to * 48000))
  return Math.sqrt(
    part.reduce((sum, value) => sum + value * value, 0) / part.length
  )
}

/** A steady tone's pitch, by its upward zero crossings over a stretch. */
export function pitch(sound: Float32Array, from: number, to: number) {
  const part = sound.subarray(Math.round(from * 48000), Math.round(to * 48000))
  let crossings = 0
  for (let index = 1; index < part.length; index++)
    if (part[index - 1] < 0 && part[index] >= 0) crossings++
  return crossings / (to - from)
}

/** Integrated loudness (LUFS) and true peak (dBTP), as FFmpeg's EBU R 128 meter reads them. */
export function ebur128(bytes: Uint8Array, name: string) {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const said = spawnSync(
    "ffmpeg",
    [
      "-nostats",
      "-i",
      path,
      "-vn",
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" }
  ).stderr
  const summary = said.slice(said.lastIndexOf("Summary:"))
  return {
    integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)![1]),
    truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)![1]),
  }
}

/** How alike a result is to the source as FFmpeg crops it (PSNR in dB, averaged over frames). */
export function croppedLike(
  result: Uint8Array,
  source: Uint8Array,
  crop: string
) {
  const out = join(folder, "crop-result.mp4")
  const original = join(folder, "crop-source.mp4")
  writeFileSync(out, result)
  writeFileSync(original, source)
  const said = spawnSync(
    "ffmpeg",
    [
      "-nostats",
      "-i",
      out,
      "-i",
      original,
      "-lavfi",
      `[1:v]crop=${crop}[ref];[0:v][ref]psnr`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" }
  ).stderr
  return Number(/average:([\d.]+|inf)/.exec(said)![1].replace("inf", "99"))
}

/** How strong one tone is in a stretch of sound (Goertzel), as an amplitude. */
export function toneLevel(
  sound: Float32Array,
  frequency: number,
  from: number,
  to: number
) {
  const part = sound.subarray(Math.round(from * 48000), Math.round(to * 48000))
  const k = (2 * Math.PI * frequency) / 48000
  const coefficient = 2 * Math.cos(k)
  let previous = 0
  let before = 0
  for (const value of part) {
    const next = value + coefficient * previous - before
    before = previous
    previous = next
  }
  const power =
    previous * previous + before * before - coefficient * previous * before
  return (2 * Math.sqrt(Math.max(0, power))) / part.length
}

/** A tone FFmpeg writes as a sound file of its own. */
export function toneFile(
  name: string,
  frequency: number,
  seconds: number,
  codec = ["-c:a", "aac"]
) {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${frequency}:sample_rate=44100:duration=${seconds}`,
    ...codec,
    path,
  ])
  return { name, mimeType: "audio/mp4", buffer: readFileSync(path) }
}

/** One frame's pixels at a moment, as FFmpeg decodes it: RGB, a row at a time. */
export function frameAt(
  bytes: Uint8Array,
  name: string,
  seconds: number
): { width: number; height: number; at: (x: number, y: number) => number[] } {
  const path = join(folder, name)
  writeFileSync(path, bytes)
  const [width, height] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    path,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number)
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 28 }
  )
  return {
    width,
    height,
    at: (x, y) => {
      const index = (y * width + x) * 3
      return [raw[index], raw[index + 1], raw[index + 2]]
    },
  }
}

/** A clip of one colour, with a tone, as FFmpeg makes it. */
export function plainClip(
  name: string,
  colour: string,
  seconds: number
): Upload {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${colour}:size=640x360:rate=30:duration=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    path,
  ])
  return { name, mimeType: "video/mp4", buffer: readFileSync(path) }
}

/** A picture of one colour, as a PNG file. */
export function plainPicture(
  name: string,
  colour: string,
  size: string
): Upload {
  const path = join(folder, name)
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${colour}:size=${size}`,
    "-frames:v",
    "1",
    path,
  ])
  return { name, mimeType: "image/png", buffer: readFileSync(path) }
}

/** Print what a worker reports as an error, so a failed run says why. */
export function reportWorkerErrors() {
  test.beforeEach(({ page }) => {
    page.on("worker", (worker) =>
      worker.on("console", (message) => {
        if (message.type() === "error")
          console.log(
            `[${test.info().project.name}] worker: ${message.text().slice(0, 2000)}`
          )
      })
    )
  })
}
