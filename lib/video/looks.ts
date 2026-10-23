/**
 * How close a result looks to its original: SSIM (the image compressor's,
 * Wang et al. 2004, on luma) on frames drawn at the same moments from both,
 * spread through the clip. A reading, not a promise: SSIM follows structure,
 * and a few frames stand for the whole.
 */

/** Frames compared, and the width they are drawn at (KeepSimp's own choices, for speed). */
export const LOOK_FRAMES = 6
export const LOOK_WIDTH = 480

/** The moments to compare: spread from a tenth of the way in to nine tenths. */
export function moments(start: number, duration: number, count = LOOK_FRAMES) {
  if (count === 1) return [start + duration / 2]
  return Array.from(
    { length: count },
    (_, index) => start + duration * (0.1 + (0.8 * index) / (count - 1))
  )
}

/** The size frames are drawn at for comparing: at most `LOOK_WIDTH` wide, even, in shape. */
export function lookSize(width: number, height: number) {
  const scale = Math.min(1, LOOK_WIDTH / width)
  return {
    width: Math.max(2, Math.round((width * scale) / 2) * 2),
    height: Math.max(2, Math.round((height * scale) / 2) * 2),
  }
}

export interface Looks {
  /** Mean SSIM over the frames compared. */
  mean: number
  /** The lowest frame's. */
  least: number
  frames: number
}

/** In words, KeepSimp's own: how close the frames compared look. */
export function looksSaid(looks: Looks) {
  const words =
    looks.mean >= 0.99
      ? "hard to tell apart from the original"
      : looks.mean >= 0.95
        ? "very close to the original"
        : looks.mean >= 0.9
          ? "close to the original, a little softer"
          : "noticeably softer than the original"
  return `Looks ${words}: SSIM ${looks.mean.toFixed(3)} on average over ${looks.frames} frames, ${looks.least.toFixed(3)} at the least.`
}
