/** What the audio specs share: the page, its files, and FFmpeg to read results. */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, type Page } from "@playwright/test"
import { bytesOf, type Upload } from "./pdf"

export const EDITOR = "/dashboard/audio-editor/"
export const folder = mkdtempSync(join(tmpdir(), "keepsimp-audio-e2e-"))
/** Decoded sound can be many megabytes. */
export const LARGE = { maxBuffer: 1 << 30 }

export const workspace = (page: Page) => page.getByTestId("audio-workspace")
export const item = (page: Page, name: string) =>
  page.getByTestId("queue-item").filter({ hasText: name })
export const chip = (page: Page, label: string) =>
  page.getByRole("radio", { name: label, exact: true })

export const fixture = (name: string, type = "audio/wav"): Upload => ({
  name,
  mimeType: type,
  buffer: readFileSync(`tests/fixtures/audio/${name}`),
})
export const sample = (name: string, type: string): Upload => ({
  name,
  mimeType: type,
  buffer: readFileSync(`public/samples/${name}`),
})

/** What FFprobe says of a file. */
export function probe(bytes: Uint8Array, name: string) {
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
export function samples(bytes: Uint8Array, name: string, channels = 2) {
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
export async function settled(page: Page) {
  try {
    await expect(workspace(page)).toHaveAttribute("data-settled", "true", {
      timeout: 60_000,
    })
  } catch (error) {
    // Say what each file shows, so a run elsewhere tells why it stopped.
    const rows = await page.getByTestId("queue-item").allTextContents()
    const result = await page
      .getByTestId("audio-result")
      .textContent()
      .catch(() => null)
    throw new Error(
      `The files did not finish. Files: ${rows.join(" | ")}. Result: ${result}`,
      { cause: error }
    )
  }
}

/** The result of one file in the list, downloaded. */
export async function download(page: Page, name: string) {
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

export async function open(page: Page, files: Upload[], route = EDITOR) {
  await page.goto(route)
  await page.locator("#audio-file").setInputFiles(files)
  await settled(page)
}
