import { isAnimated, sniffFormat } from "@/lib/image-compressor/formats"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { Compositor } from "./compose"
import { readApng } from "./decoders/apng"
import { decodeGifFrame, readGif } from "./decoders/gif"
import { readWebp } from "./decoders/webp"
import type { Patch } from "./types"

export type SourceFormat = "gif" | "apng" | "webp"

export const sourceFormats: Record<SourceFormat, string> = {
  gif: "GIF",
  apng: "APNG",
  webp: "WebP",
}

export const NOT_ANIMATED =
  "This picture does not move. Use the image converter for still images."
export const UNSUPPORTED = "Choose an animated GIF, APNG or WebP file."

/** An animated file, opened: its facts, and its frames on request. */
export interface Source {
  format: SourceFormat
  width: number
  height: number
  /** Times the original plays; 0 means forever. */
  plays: number
  /** Milliseconds each frame is shown. */
  durations: number[]
  /**
   * Whole frames, in order. The same canvas is handed back every time, so
   * copy a frame to keep it.
   */
  frames(): AsyncGenerator<Pixels>
}

export interface SourceDeps {
  /** Decode a still PNG or WebP to pixels. */
  decodeStill(format: "png" | "webp", bytes: Uint8Array): Promise<Pixels>
}

/** Which animated format a file is, by its bytes; a reason when it cannot be used. */
export function identify(
  bytes: Uint8Array
): { format: SourceFormat } | { problem: string } {
  const format = sniffFormat(bytes)
  if (format !== "gif" && format !== "png" && format !== "webp")
    return { problem: format ? NOT_ANIMATED : UNSUPPORTED }
  if (!isAnimated(bytes, format)) return { problem: NOT_ANIMATED }
  return { format: format === "png" ? "apng" : format }
}

/** Open an animated GIF, APNG or WebP. Throws with a message for the page when it cannot. */
export function openAnimation(bytes: Uint8Array, deps: SourceDeps): Source {
  const found = identify(bytes)
  if ("problem" in found) throw new Error(found.problem)
  const { format } = found
  let size: { width: number; height: number; plays: number }
  let patches: Patch[]
  let pixelsOf: (index: number) => Promise<Uint8ClampedArray>
  if (format === "gif") {
    const file = readGif(bytes)
    size = file
    patches = file.frames
    pixelsOf = async (index) => decodeGifFrame(bytes, file.frames[index])
  } else if (format === "apng") {
    const file = readApng(bytes)
    size = file
    patches = file.frames
    pixelsOf = async (index) =>
      (await deps.decodeStill("png", file.frames[index].png)).data
  } else {
    const file = readWebp(bytes)
    size = file
    patches = file.frames
    pixelsOf = async (index) =>
      (await deps.decodeStill("webp", file.frames[index].webp)).data
  }
  return {
    format,
    width: size.width,
    height: size.height,
    plays: size.plays,
    durations: patches.map((patch) => patch.duration),
    async *frames() {
      const compositor = new Compositor(size.width, size.height)
      for (let index = 0; index < patches.length; index++) {
        const patch = patches[index]
        yield compositor.draw(
          // There is nothing before the first frame to go back to.
          index === 0 && patch.dispose === "previous"
            ? { ...patch, dispose: "background" }
            : patch,
          await pixelsOf(index)
        )
      }
    },
  }
}
