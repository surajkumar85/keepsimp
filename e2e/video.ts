/** What the video specs share: the page, generated files, and FFmpeg to read results. */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { bytesOf, type Upload } from "./pdf"

export const EDITOR = "/dashboard/video-editor/"
export const CONVERTER = "/dashboard/video-converter/"
export const COMPRESSOR = "/dashboard/video-compressor/"
export const TRIMMER = "/dashboard/video-trimmer/"
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
