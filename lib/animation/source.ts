import { isAnimated, sniffFormat } from "@/lib/image-compressor/formats"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { Compositor } from "./compose"
import { readApng } from "./decoders/apng"
import { decodeGifFrame, readGif } from "./decoders/gif"
import { readWebp } from "./decoders/webp"
import type { Patch } from "./types"

export type ImageFormat = "gif" | "apng" | "webp"
export type SourceFormat = ImageFormat | "video" | "stills"

export const sourceFormats: Record<SourceFormat, string> = {
  gif: "GIF",
  apng: "APNG",
  webp: "WebP",
  video: "Video",
  stills: "Images",
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
   * Whole frames for the given frame numbers, which must be in ascending
   * order. The same canvas may be handed back every time, so copy a frame to
   * keep it.
   */
  read(indices: readonly number[]): AsyncGenerator<Pixels>
  /**
   * Whether any frame can be read without reading the ones before it. Video
   * can; an animated image builds each frame on the last.
   */
  seekable: boolean
  /** Let go of anything held open, such as a video file being read. */
  close?(): void
}

/** Every frame number of a source, for reading it from start to finish. */
export const allFrames = (source: Source) =>
  source.durations.map((_, index) => index)

export interface SourceDeps {
  /** Decode a still PNG or WebP to pixels. */
  decodeStill(format: "png" | "webp", bytes: Uint8Array): Promise<Pixels>
}

/** Which animated format a file is, by its bytes; a reason when it cannot be used. */
export function identify(
  bytes: Uint8Array
): { format: ImageFormat } | { problem: string } {
  const format = sniffFormat(bytes)
  if (format !== "gif" && format !== "png" && format !== "webp")
    return { problem: format ? NOT_ANIMATED : UNSUPPORTED }
  if (!isAnimated(bytes, format)) return { problem: NOT_ANIMATED }
  return { format: format === "png" ? "apng" : format }
}

/** True for MP4, MOV and WebM or Matroska files, told by their first bytes. */
export function isVideo(bytes: Uint8Array) {
  const tag = String.fromCharCode(...bytes.subarray(4, 8))
  return (
    // MP4 and MOV start with a box; "ftyp" in almost every file.
    ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(tag) ||
    // WebM and Matroska start with an EBML header.
    (bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3)
  )
}

export type FileKind = "video" | "animation" | "still" | "svg" | "unknown"

/** What a dropped file is, from its first bytes, so the page knows what to do with it. */
export function classify(bytes: Uint8Array): FileKind {
  if (isVideo(bytes)) return "video"
  const format = sniffFormat(bytes)
  if (!format) return "unknown"
  if (format === "svg") return "svg"
  return isAnimated(bytes, format) ? "animation" : "still"
}

export interface StillsDeps {
  /** Decode still image number `index`. */
  load(index: number): Promise<Pixels>
  resize(
    pixels: Pixels,
    size: { width: number; height: number },
    kernel: "lanczos3" | "mitchell"
  ): Promise<Pixels>
}

/**
 * A set of still images as one animation. The first image sets the size; the
 * others are scaled to fit inside it and centred, with clear space around them.
 */
export async function openStills(
  durations: readonly number[],
  deps: StillsDeps
): Promise<Source> {
  if (!durations.length) throw new Error("Add at least one image.")
  const first = await deps.load(0)
  const { width, height } = first
  const fit = async (pixels: Pixels): Promise<Pixels> => {
    if (pixels.width === width && pixels.height === height) return pixels
    const scale = Math.min(width / pixels.width, height / pixels.height)
    const size = {
      width: Math.max(1, Math.round(pixels.width * scale)),
      height: Math.max(1, Math.round(pixels.height * scale)),
    }
    const scaled = await deps.resize(
      pixels,
      size,
      scale > 1 ? "mitchell" : "lanczos3"
    )
    const data = new Uint8ClampedArray(width * height * 4)
    const left = Math.floor((width - size.width) / 2)
    const top = Math.floor((height - size.height) / 2)
    for (let row = 0; row < size.height; row++)
      data.set(
        scaled.data.subarray(row * size.width * 4, (row + 1) * size.width * 4),
        ((top + row) * width + left) * 4
      )
    return { data, width, height }
  }
  return {
    format: "stills",
    width,
    height,
    plays: 0,
    durations: [...durations],
    seekable: true,
    async *read(indices) {
      for (const index of indices)
        yield index === 0 ? first : await fit(await deps.load(index))
    },
  }
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
    seekable: false,
    async *read(indices) {
      const wanted = new Set(indices)
      const last = Math.max(-1, ...indices)
      const compositor = new Compositor(size.width, size.height)
      // Every frame up to the last one asked for is drawn; only the wanted ones are handed out.
      for (let index = 0; index <= last && index < patches.length; index++) {
        const patch = patches[index]
        const canvas = compositor.draw(
          // There is nothing before the first frame to go back to.
          index === 0 && patch.dispose === "previous"
            ? { ...patch, dispose: "background" }
            : patch,
          await pixelsOf(index)
        )
        if (wanted.has(index)) yield canvas
      }
    },
  }
}
