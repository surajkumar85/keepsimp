import { orientedSize } from "@/lib/image-compressor/geometry"
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
  matte,
  outputSize,
  playsFor,
  type AnimationSettings,
  type Trim,
} from "./settings"
import type { Source } from "./source"
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
    speed: settings.speed,
    fps: settings.fps,
    reverse: settings.reverse,
    boomerang: settings.boomerang,
  })
  const size = outputSize(source, settings)
  const needed = new Set(steps.map((step) => step.source))
  const problem = budgetProblem(needed.size, size, settings)
  if (problem) throw new Error(problem)
  const order = [...needed].sort((a, b) => a - b)
  const oriented = orientedSize(source, settings.rotation)
  const background = matte(settings)
  const kernel =
    size.width > oriented.width || size.height > oriented.height
      ? "mitchell"
      : "lanczos3"
  const ready = new Map<number, Pixels>()
  let position = 0
  for await (const canvas of source.read(order)) {
    await deps.checkpoint()
    deps.progress(`Reading frame ${position + 1} of ${order.length}`)
    // This also copies the frame off the shared canvas.
    let pixels = extractOriented(
      canvas,
      settings.rotation,
      settings.flipX,
      settings.flipY,
      { x: 0, y: 0, ...oriented }
    )
    if (background) pixels = flattenAlpha(pixels, background)
    const sized = await deps.resize(pixels, size, kernel)
    // A resampler may hand back an ImageData, whose fields do not copy with "...".
    ready.set(order[position], {
      data: sized.data,
      width: sized.width,
      height: sized.height,
    })
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

/** Convert one opened animation with the chosen settings. */
export async function convertAnimation(
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
    const video = await deps.encodeVideo(frames, plan.container, plan.level)
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
