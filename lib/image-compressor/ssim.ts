export interface Pixels {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

const WINDOW = 8
const STRIDE = 4
const C1 = (0.01 * 255) ** 2
const C2 = (0.03 * 255) ** 2
/** Larger images are box-downsampled first so a measurement stays fast. */
export const SSIM_MAX_PIXELS = 2_000_000

/** Rec. 709 luma, with transparent pixels composited over white. */
export function luma(image: Pixels, factor = 1) {
  const width = Math.max(1, Math.floor(image.width / factor))
  const height = Math.max(1, Math.floor(image.height / factor))
  const out = new Float32Array(width * height)
  const { data } = image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      // Output sizes are floored, so every sampled pixel lies inside the image.
      for (let oy = 0; oy < factor; oy++) {
        const sy = y * factor + oy
        for (let ox = 0; ox < factor; ox++) {
          const sx = x * factor + ox
          const i = (sy * image.width + sx) * 4
          const alpha = data[i + 3] / 255
          const value =
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          sum += value * alpha + 255 * (1 - alpha)
          count++
        }
      }
      out[y * width + x] = sum / count
    }
  }
  return { values: out, width, height }
}

const factorFor = (image: Pixels) =>
  Math.max(
    1,
    Math.ceil(Math.sqrt((image.width * image.height) / SSIM_MAX_PIXELS))
  )

export interface Similarity {
  /** Mean SSIM over all windows: 1 for identical images. */
  mean: number
  /** Mean of the worst 1% of windows, which exposes local damage such as ringing around text. */
  worst: number
}

/**
 * SSIM over 8×8 windows with a stride of 4 (Wang et al., 2004), pooled two ways:
 * the usual mean, and the mean of the lowest-scoring 1% (percentile pooling,
 * Moorthy & Bovik, 2009).
 */
export function similarity(reference: Pixels, candidate: Pixels): Similarity {
  if (
    reference.width !== candidate.width ||
    reference.height !== candidate.height
  )
    throw new Error("Images must have the same dimensions to compare.")
  const factor = factorFor(reference)
  const a = luma(reference, factor)
  const b = luma(candidate, factor)
  const { width, height } = a
  const windowW = Math.min(WINDOW, width)
  const windowH = Math.min(WINDOW, height)
  const n = windowW * windowH
  const scores: number[] = []
  for (let y = 0; y + windowH <= height; y += STRIDE) {
    for (let x = 0; x + windowW <= width; x += STRIDE) {
      let sumA = 0
      let sumB = 0
      let sumAA = 0
      let sumBB = 0
      let sumAB = 0
      for (let wy = 0; wy < windowH; wy++) {
        let index = (y + wy) * width + x
        for (let wx = 0; wx < windowW; wx++, index++) {
          const va = a.values[index]
          const vb = b.values[index]
          sumA += va
          sumB += vb
          sumAA += va * va
          sumBB += vb * vb
          sumAB += va * vb
        }
      }
      const meanA = sumA / n
      const meanB = sumB / n
      const varA = sumAA / n - meanA * meanA
      const varB = sumBB / n - meanB * meanB
      const cov = sumAB / n - meanA * meanB
      scores.push(
        ((2 * meanA * meanB + C1) * (2 * cov + C2)) /
          ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2))
      )
    }
  }
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
  const count = Math.max(1, Math.floor(scores.length * 0.01))
  const lowest = Float64Array.from(scores).sort().subarray(0, count)
  const worst = lowest.reduce((sum, value) => sum + value, 0) / count
  return { mean, worst }
}

export function ssim(reference: Pixels, candidate: Pixels) {
  return similarity(reference, candidate).mean
}

export type ContentKind = "photo" | "graphic"

/** Share of 8×8 windows that are practically flat (luma variance below 1). */
export function flatFraction(image: Pixels) {
  const { values, width, height } = luma(image, factorFor(image))
  const windowW = Math.min(WINDOW, width)
  const windowH = Math.min(WINDOW, height)
  const n = windowW * windowH
  let flat = 0
  let total = 0
  for (let y = 0; y + windowH <= height; y += STRIDE) {
    for (let x = 0; x + windowW <= width; x += STRIDE) {
      let sum = 0
      let squares = 0
      for (let wy = 0; wy < windowH; wy++) {
        let index = (y + wy) * width + x
        for (let wx = 0; wx < windowW; wx++, index++) {
          sum += values[index]
          squares += values[index] * values[index]
        }
      }
      if (squares / n - (sum / n) ** 2 < 1) flat++
      total++
    }
  }
  return flat / total
}

/**
 * Graphics (interfaces, text, logos) are mostly flat colour; their artefacts
 * concentrate at edges where they are easy to see. Photos hide loss in texture.
 */
export function contentKind(image: Pixels): ContentKind {
  return flatFraction(image) >= 0.6 ? "graphic" : "photo"
}
