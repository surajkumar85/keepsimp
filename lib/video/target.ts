/**
 * Fitting a video under a file size. Browser encoders have no second pass
 * and do not always keep to a bitrate, so a size is reached by a budget,
 * by lowering the frame rate and then the size when the budget is too thin
 * for the picture, by watching the bytes as they are written, and by
 * writing again with a corrected bitrate when a pass misses (at most three).
 */

/** What a container adds to the media: a share and a little more (KeepSimp's own allowance). */
export const OVERHEAD_SHARE = 0.015
export const OVERHEAD_BYTES = 16 * 1024

/**
 * The fewest bits a pixel of a frame can have and still look like video,
 * for H.264: 0.05, as HandBrake's "Social" presets imply (25 MB for 30 s
 * of 1080p60, a minute of 720p60, two of 540p60 and five of 360p60 all
 * come to about 0.05). Other codecs need less by their efficiency.
 */
export const LEAST_BITS_PER_PIXEL = 0.05

/** Shorter sides to step down through, largest first. */
export const SIZE_STEPS = [2160, 1440, 1080, 720, 540, 480, 360, 240] as const

/** Passes at most, the first included. */
export const MOST_PASSES = 3
/** A pass may come this far under its target and still stand. */
export const UNDER_ENOUGH = 0.85

export interface Fit {
  /** bit/s for the picture. */
  bitrate: number
  /** As shown. */
  width: number
  height: number
  /** null keeps the file's own. */
  frameRate: number | null
  /** The budget is too small even at the smallest size: the size it would come to there. */
  short: null | { least: number }
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)

/** The bits the picture may have, for a file `target` bytes long. */
export function pictureBudget(
  target: number,
  duration: number,
  soundBits: number
) {
  const usable = target * (1 - OVERHEAD_SHARE) - OVERHEAD_BYTES
  return Math.floor((usable * 8) / Math.max(duration, 0.001) - soundBits)
}

/** The bitrate, size and frame rate that fit a file of `target` bytes. */
export function fitToSize({
  target,
  duration,
  soundBits,
  width,
  height,
  frameRate,
  efficiency,
}: {
  target: number
  duration: number
  soundBits: number
  width: number
  height: number
  frameRate: number
  /** Bits the codec needs for H.264's look (`CODEC_EFFICIENCY`). */
  efficiency: number
}): Fit {
  const bitrate = pictureBudget(target, duration, soundBits)
  const least = LEAST_BITS_PER_PIXEL * efficiency
  const fits = (w: number, h: number, fps: number) =>
    bitrate / (w * h * fps) >= least
  const rate = frameRate > 30.5 ? 30 : null
  const fps = rate ?? frameRate
  // The file's own size and rate first, then 30 frames a second, then smaller sizes.
  if (fits(width, height, frameRate))
    return { bitrate, width, height, frameRate: null, short: null }
  const short = Math.min(width, height)
  const steps = [
    { width, height, side: short },
    ...SIZE_STEPS.filter((side) => side < short).map((side) => ({
      width: even((width * side) / short),
      height: even((height * side) / short),
      side,
    })),
  ]
  for (const step of steps)
    if (fits(step.width, step.height, fps))
      return {
        bitrate,
        width: step.width,
        height: step.height,
        frameRate: rate,
        short: null,
      }
  const smallest = steps.at(-1)!
  const needed = least * smallest.width * smallest.height * fps
  return {
    bitrate: Math.max(bitrate, needed),
    width: smallest.width,
    height: smallest.height,
    frameRate: rate,
    short: {
      least: Math.ceil(
        (((needed + soundBits) * duration) / 8 + OVERHEAD_BYTES) /
          (1 - OVERHEAD_SHARE)
      ),
    },
  }
}

/** The bitrate for the next pass, from what the last one wrote. */
export function correctedBitrate(
  bitrate: number,
  target: number,
  written: number
) {
  // A little under the straight ratio, so the next pass lands inside.
  return Math.floor(bitrate * (target / written) * 0.97)
}

/** Whether a pass is done: under the target, and not wastefully far under it. */
export function passStands(target: number, written: number, last: boolean) {
  return written <= target && (last || written >= target * UNDER_ENOUGH)
}

/**
 * Whether a pass will miss, judged while it is written: the bytes so far
 * against how far through it is, once a quarter is done. Encoders spend
 * more at the start (the first keyframes), so a tenth of slack is allowed.
 */
export function willMiss(target: number, written: number, fraction: number) {
  return fraction >= 0.25 && written / fraction > target * 1.1
}
