import { customIsNumeric, targets, type AnimationSettings } from "./settings"

/** One rung of the ladder: how far each lever is pulled. */
export interface Level {
  /** 0 keeps the chosen quality; 1 to 3 lower it step by step. */
  quality: 0 | 1 | 2 | 3
  /** Most frames per second, or null to leave the frame rate alone. */
  fps: number | null
  /** A further scale on the size, 1 for none. */
  scale: number
}

/**
 * The steps tried to get a file under a size limit, gentlest first: quality
 * goes before frame rate, and frame rate before size, but none is pushed to
 * its end before the next one starts.
 */
export const LADDER: readonly Level[] = [
  { quality: 0, fps: null, scale: 1 },
  { quality: 1, fps: null, scale: 1 },
  { quality: 2, fps: null, scale: 1 },
  { quality: 2, fps: 20, scale: 1 },
  { quality: 2, fps: 15, scale: 0.85 },
  { quality: 3, fps: 15, scale: 0.85 },
  { quality: 3, fps: 12, scale: 0.7 },
  { quality: 3, fps: 12, scale: 0.6 },
  { quality: 3, fps: 10, scale: 0.5 },
  { quality: 3, fps: 10, scale: 0.4 },
  { quality: 3, fps: 8, scale: 0.3 },
  { quality: 3, fps: 8, scale: 0.2 },
]

const least = (chosen: number, step: number) => Math.min(chosen, step)

/** The settings for one rung: the chosen ones, with each lever pulled as far as the rung says. */
export function applyLevel(
  settings: AnimationSettings,
  level: Level
): AnimationSettings {
  const next: AnimationSettings = {
    ...settings,
    fps:
      level.fps === null
        ? settings.fps
        : least(settings.fps ?? Infinity, level.fps),
    // An exact size is a promise about the canvas, so it is never scaled.
    shrink: settings.resize === "exact" ? 1 : level.scale,
  }
  const { quality } = level
  const kind = targets[settings.target].kind
  // Video is sized by its bitrate, which the pipeline works out from the limit.
  if (quality === 0 || kind === "video") return next
  const numeric = [0, 60, 45, 30][quality]
  const colours = [0, 128, 64, 32][quality]
  if (settings.target === "webp")
    return {
      ...next,
      quality: "custom",
      customQuality: least(
        settings.quality === "custom" ? settings.customQuality : 100,
        numeric
      ),
    }
  if (kind === "bundle")
    // PNG has no quality to lower; its rungs differ only in frame rate and size.
    return settings.frameFormat === "png"
      ? next
      : { ...next, quality: "custom", customQuality: numeric }
  if (settings.target === "gif" && settings.gifEngine === "best")
    return {
      ...next,
      quality: "custom",
      customQuality: [0, 70, 50, 30][quality],
    }
  // GIF and APNG: fewer colours, and no dithering once the palette is small.
  return {
    ...next,
    quality: "custom",
    colours: least(
      settings.quality === "custom" ? settings.colours : 256,
      settings.target === "apng" ? colours * 2 : colours
    ),
    dithering: quality < 2 && settings.dithering,
  }
}

/** What a rung changed, in words for the page; empty when it changed nothing. */
export function describeLevel(
  settings: AnimationSettings,
  level: Level
): string[] {
  const applied = applyLevel(settings, level)
  const parts: string[] = []
  if (
    applied.quality !== settings.quality ||
    applied.customQuality !== settings.customQuality ||
    applied.colours !== settings.colours
  )
    parts.push(
      customIsNumeric(applied)
        ? `quality ${applied.customQuality}`
        : `${applied.colours} colours`
    )
  if (applied.fps !== settings.fps)
    parts.push(`at most ${applied.fps} frames a second`)
  if (applied.shrink !== 1)
    parts.push(`${Math.round(applied.shrink * 100)}% of the size`)
  return parts
}

export interface Fitted<T> {
  /** Position on the ladder of the rung that was used. */
  index: number
  result: T
  /** Whether the result is within the limit. */
  fits: boolean
  /** How many rungs were tried. */
  tries: number
}

/**
 * Find the gentlest rung whose result is within the limit. The chosen
 * settings are tried first; after that the ladder is halved each time, so at
 * most five rungs are tried. If even the last rung is too big, it is returned
 * with `fits` false.
 */
export async function fitLadder<T>(
  rungs: number,
  limit: number,
  attempt: (
    index: number,
    tries: number
  ) => Promise<{ result: T; bytes: number }>
): Promise<Fitted<T>> {
  let tries = 0
  const tried = new Map<number, { result: T; bytes: number }>()
  const tryAt = async (index: number) => {
    const known = tried.get(index)
    if (known) return known
    const made = await attempt(index, ++tries)
    tried.set(index, made)
    return made
  }
  const first = await tryAt(0)
  if (first.bytes <= limit || rungs === 1)
    return { index: 0, result: first.result, fits: first.bytes <= limit, tries }
  // Between a rung that is too big and one that fits (or the last one).
  let low = 0
  let high = rungs - 1
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if ((await tryAt(middle)).bytes <= limit) high = middle
    else low = middle
  }
  const last = await tryAt(high)
  return { index: high, result: last.result, fits: last.bytes <= limit, tries }
}
