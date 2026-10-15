/**
 * A waveform small enough to draw at once: the lowest and highest sample
 * of every bucket of a file, over all its channels, gathered while the
 * file is decoded chunk by chunk so the sound itself is never held.
 */

export interface Peaks {
  min: Float32Array
  max: Float32Array
}

export class PeakBuilder {
  private readonly min: Float32Array
  private readonly max: Float32Array
  private frame = 0
  /** Frames in each bucket, as a fraction. */
  private readonly per: number

  constructor(
    /** How many frames the file is expected to have. */
    totalFrames: number,
    buckets: number
  ) {
    const count = Math.max(1, Math.floor(buckets))
    this.min = new Float32Array(count)
    this.max = new Float32Array(count)
    this.per = Math.max(1, totalFrames) / count
  }

  /** The next frames, one array per channel. */
  push(planes: readonly Float32Array[]) {
    const frames = planes[0]?.length ?? 0
    const last = this.min.length - 1
    for (let index = 0; index < frames; index++) {
      const bucket = Math.min(last, Math.floor((this.frame + index) / this.per))
      let low = this.min[bucket]
      let high = this.max[bucket]
      for (const plane of planes) {
        const value = plane[index]
        if (value < low) low = value
        if (value > high) high = value
      }
      this.min[bucket] = low
      this.max[bucket] = high
    }
    this.frame += frames
  }

  result(): Peaks {
    return { min: this.min.slice(), max: this.max.slice() }
  }
}

/** The loudest sample's level in a set of peaks, from 0 to 1. */
export const peakLevel = (peaks: Peaks) =>
  peaks.min.reduce(
    (loudest, low, index) => Math.max(loudest, -low, peaks.max[index]),
    0
  )
