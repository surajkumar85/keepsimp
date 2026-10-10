import { orientedSize } from "@/lib/image-compressor/geometry"
import { extractOriented, flattenAlpha } from "@/lib/image-compressor/pixels"
import type { Pixels } from "@/lib/image-compressor/ssim"
import {
  buildApng,
  buildApngIndexed,
  buildGif,
  buildGifBest,
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
  const last = Math.max(...needed)
  const oriented = orientedSize(source, settings.rotation)
  const background = matte(settings)
  const kernel =
    size.width > oriented.width || size.height > oriented.height
      ? "mitchell"
      : "lanczos3"
  const ready = new Map<number, Pixels>()
  let index = 0
  for await (const canvas of source.frames()) {
    await deps.checkpoint()
    deps.progress(`Reading frame ${index + 1} of ${last + 1}`)
    if (needed.has(index)) {
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
      ready.set(index, {
        data: sized.data,
        width: sized.width,
        height: sized.height,
      })
    }
    if (index === last) break
    index++
  }
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
    duration: sum(frames.map((frame) => frame.duration)),
    plays,
    note,
  }
}
