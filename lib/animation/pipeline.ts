import { clampCrop, orientedSize } from "@/lib/image-compressor/geometry"
import { extractOriented, flattenAlpha } from "@/lib/image-compressor/pixels"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  buildApng,
  buildApngIndexed,
  buildFrames,
  buildGif,
  buildGifBest,
  buildSprite,
  buildWebp,
  type BuildDeps,
} from "./build"
import {
  bestFits,
  budgetProblem,
  encodePlan,
  layoutFor,
  matte,
  playsFor,
  type AnimationSettings,
  type Trim,
} from "./settings"
import type { Source } from "./source"
import { applyLevel, describeLevel, fitLadder, LADDER } from "./target-size"
import { planFrames, sum } from "./timeline"
import type { Frame } from "./types"

export interface ConvertDeps extends BuildDeps {
  resize(
    pixels: Pixels,
    size: { width: number; height: number },
    kernel: "lanczos3" | "mitchell"
  ): Promise<Pixels>
}

export interface Converted {
  bytes: Uint8Array
  width: number
  height: number
  /** Frames asked for; a writer may store fewer when neighbours match. */
  frames: number
  /** Milliseconds for one play. */
  duration: number
  /** Times it plays; 0 means forever. */
  plays: number
  /** Something the page should say about how the result was made. */
  note: string | null
}

export const BEST_TOO_LARGE =
  "This is too long for gifski at this size, so the fast encoder was used. Trim it or make it smaller to use gifski."

/** Read the frames the result needs and bring each to its final size and orientation. */
export async function gatherFrames(
  source: Source,
  settings: AnimationSettings,
  trim: Trim,
  deps: ConvertDeps
): Promise<Frame[]> {
  const steps = planFrames(source.durations, {
    start: trim.start,
    end: trim.end,
    longest: settings.maxSeconds === null ? null : settings.maxSeconds * 1000,
    speed: settings.speed,
    fps: settings.fps,
    reverse: settings.reverse,
    boomerang: settings.boomerang,
  })
  const oriented = orientedSize(source, settings.rotation)
  // A crop is kept inside the picture, however it was arrived at.
  const crop = trim.crop ? clampCrop(trim.crop, oriented) : null
  const kept = crop ?? { x: 0, y: 0, ...oriented }
  const { canvas, picture, x, y } = layoutFor(source, settings, crop)
  const needed = new Set(steps.map((step) => step.source))
  const problem = budgetProblem(needed.size, canvas, settings)
  if (problem) throw new Error(problem)
  const order = [...needed].sort((a, b) => a - b)
  const background = matte(settings)
  const kernel =
    picture.width > kept.width || picture.height > kept.height
      ? "mitchell"
      : "lanczos3"
  const padded =
    picture.width !== canvas.width || picture.height !== canvas.height
  const ready = new Map<number, Pixels>()
  let position = 0
  for await (const frame of source.read(order)) {
    await deps.checkpoint()
    deps.progress(`Reading frame ${position + 1} of ${order.length}`)
    // This also copies the frame off the shared canvas.
    const pixels = extractOriented(
      frame,
      settings.rotation,
      settings.flipX,
      settings.flipY,
      kept
    )
    const sized = await deps.resize(pixels, picture, kernel)
    // A resampler may hand back an ImageData, whose fields do not copy with "...".
    let placed: Pixels = {
      data: sized.data,
      width: sized.width,
      height: sized.height,
    }
    if (padded) {
      // An exact size: the picture sits in the middle of a clear canvas.
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4)
      for (let row = 0; row < picture.height; row++)
        data.set(
          sized.data.subarray(
            row * picture.width * 4,
            (row + 1) * picture.width * 4
          ),
          ((y + row) * canvas.width + x) * 4
        )
      placed = { data, ...canvas }
    }
    ready.set(
      order[position],
      background ? flattenAlpha(placed, background) : placed
    )
    position++
  }
  // A damaged file can hold fewer frames than it claims.
  if (position < order.length)
    throw new Error("This file ended before its last frame. It may be damaged.")
  return steps.map((step) => ({
    ...ready.get(step.source)!,
    duration: step.duration,
  }))
}

/** Convert one opened animation with the settings exactly as given. */
async function convertOnce(
  source: Source,
  settings: AnimationSettings,
  trim: Trim,
  deps: ConvertDeps
): Promise<Converted> {
  const frames = await gatherFrames(source, settings, trim, deps)
  const { width, height } = frames[0]
  const plays = playsFor(settings)
  let plan = encodePlan(settings)
  let note: string | null = null
  if (plan.kind === "gifski" && !bestFits(frames.length, { width, height })) {
    // gifski also needs at least two frames; a single one is not worth a note.
    if (frames.length > 1) note = BEST_TOO_LARGE
    plan = encodePlan({ ...settings, gifEngine: "fast" })
  }
  const duration = sum(frames.map((frame) => frame.duration))
  if (plan.kind === "frames") {
    const bundle = await buildFrames(frames, plan, deps)
    return { ...bundle, width, height, duration, plays, note }
  }
  if (plan.kind === "sprite") {
    const sheet = await buildSprite(frames, plays, plan, deps)
    return { ...sheet, duration, plays, note }
  }
  if (plan.kind === "video") {
    deps.progress(`Encoding ${frames.length} frames as video…`)
    // With a size limit, the bitrate is what fills it: a little under, as files carry some overhead.
    const level =
      settings.sizeLimit === null
        ? plan.level
        : (settings.sizeLimit * 8 * 0.9) /
          (duration / 1000) /
          (width * height * Math.min(60, (frames.length * 1000) / duration))
    const video = await deps.encodeVideo(frames, plan.container, level)
    return {
      bytes: video.bytes,
      width,
      height,
      frames: video.frames,
      duration,
      // A video file has no loop count; the player decides.
      plays: 0,
      note:
        video.frames < frames.length
          ? `This browser's video encoder kept ${video.frames} of ${frames.length} frames. The length is unchanged.`
          : note,
    }
  }
  const bytes =
    plan.kind === "gif"
      ? await buildGif(frames, plays, plan, deps)
      : plan.kind === "gifski"
        ? await buildGifBest(frames, plays, plan.quality, deps)
        : plan.kind === "webp"
          ? await buildWebp(frames, plays, plan, deps)
          : plan.kind === "apng-exact"
            ? await buildApng(frames, plays, deps)
            : await buildApngIndexed(frames, plays, plan, deps)
  return {
    bytes,
    width,
    height,
    frames: frames.length,
    duration,
    plays,
    note,
  }
}

const sizeText = (bytes: number) =>
  bytes >= 1_000_000
    ? `${Math.round(bytes / 100_000) / 10} MB`
    : `${Math.round(bytes / 1000)} KB`

/**
 * Convert one opened animation. With a size limit, lower quality, frame rate
 * and size step by step until the file fits, and say what was changed.
 */
export async function convertAnimation(
  source: Source,
  settings: AnimationSettings,
  trim: Trim,
  deps: ConvertDeps
): Promise<Converted> {
  const limit = settings.sizeLimit
  if (limit === null) return convertOnce(source, settings, trim, deps)
  const fitted = await fitLadder(LADDER.length, limit, async (index, tries) => {
    const label = `Fitting under ${sizeText(limit)} · try ${tries}`
    deps.progress(label)
    const result = await convertOnce(
      source,
      applyLevel(settings, LADDER[index]),
      trim,
      { ...deps, progress: (step) => deps.progress(`${label} · ${step}`) }
    )
    return { result, bytes: result.bytes.length }
  })
  const changes = describeLevel(settings, LADDER[fitted.index])
  const notes = [
    fitted.result.note,
    fitted.fits
      ? changes.length
        ? `To fit under ${sizeText(limit)}: ${changes.join(", ")}.`
        : null
      : `This could not be made smaller than ${sizeText(fitted.result.bytes.length)}, which is over ${sizeText(limit)}. Trim it or choose a smaller size.`,
  ].filter(Boolean)
  return { ...fitted.result, note: notes.length ? notes.join(" ") : null }
}
