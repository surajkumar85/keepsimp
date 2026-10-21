/**
 * The rules for reading colours out of an image, kept in one place for the
 * colour workspace and the agent tool: which files, how large, and how small
 * the sample is drawn before it is counted.
 */

export const SAMPLE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]
export const SAMPLE_MOST_BYTES = 10 * 1024 * 1024
export const SAMPLE_MOST_PIXELS = 30_000_000
/** The longest side of the drawing that is counted. */
export const SAMPLE_SIDE = 256

/** What is wrong with a file to sample, or null. */
export function sampleProblem(type: string, size: number) {
  return SAMPLE_TYPES.includes(type) && size <= SAMPLE_MOST_BYTES
    ? null
    : "Choose a PNG, JPEG, WebP or GIF up to 10 MiB. GIF uses the frame decoded by your browser."
}

/** The size an image is drawn at to be counted, no side over 256 pixels. */
export function sampleSize(width: number, height: number) {
  if (width * height > SAMPLE_MOST_PIXELS)
    throw new Error("Use an image up to 30 million pixels.")
  const scale = Math.min(1, SAMPLE_SIDE / width, SAMPLE_SIDE / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
