/**
 * A spectrogram small enough to draw at once: how loud each band of
 * frequencies is in each column of a file, gathered while the file is read
 * chunk by chunk, as the waveform's peaks are. Each column averages up to
 * FFTS_PER_COLUMN Hann-windowed FFTs of FFT_SIZE frames spread over it, so
 * an hour costs no more than a few seconds; bands are spaced evenly in
 * pitch (logarithmically) from LOWEST Hz to half the sample rate.
 */

export const FFT_SIZE = 2048
export const FFTS_PER_COLUMN = 4
export const BANDS = 96
export const LOWEST = 40
/** The loudness the darkest and brightest colours stand for, in dBFS. */
export const FLOOR = -100
export const CEILING = 0
export const MOST_COLUMNS = 8000
export const COLUMNS_PER_SECOND = 25

export interface Spectrum {
  columns: number
  bands: number
  /** Column after column, lowest band first, from FLOOR (0) to CEILING (255). */
  values: Uint8Array
  /** The frequencies the bands span, in Hz. */
  lowest: number
  highest: number
}

/** How many columns a file of `seconds` is read into. */
export const spectrumColumns = (seconds: number) =>
  Math.min(
    MOST_COLUMNS,
    Math.max(100, Math.round(seconds * COLUMNS_PER_SECOND))
  )

/** An in-place radix-2 FFT of real and imaginary parts, of a power-of-two length. */
export function fft(real: Float64Array, imaginary: Float64Array) {
  const size = real.length
  for (let index = 1, swap = 0; index < size; index++) {
    let bit = size >> 1
    for (; swap & bit; bit >>= 1) swap ^= bit
    swap ^= bit
    if (index < swap) {
      ;[real[index], real[swap]] = [real[swap], real[index]]
      ;[imaginary[index], imaginary[swap]] = [imaginary[swap], imaginary[index]]
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)
    for (let start = 0; start < size; start += length) {
      let turnReal = 1
      let turnImaginary = 0
      for (let index = 0; index < length / 2; index++) {
        const a = start + index
        const b = a + length / 2
        const productReal = real[b] * turnReal - imaginary[b] * turnImaginary
        const productImaginary =
          real[b] * turnImaginary + imaginary[b] * turnReal
        real[b] = real[a] - productReal
        imaginary[b] = imaginary[a] - productImaginary
        real[a] += productReal
        imaginary[a] += productImaginary
        const next = turnReal * stepReal - turnImaginary * stepImaginary
        turnImaginary = turnReal * stepImaginary + turnImaginary * stepReal
        turnReal = next
      }
    }
  }
}

export class SpectrumBuilder {
  private readonly window: Float64Array
  /** The last FFT_SIZE frames, mixed to one channel, as a ring. */
  private readonly ring = new Float64Array(FFT_SIZE)
  private seen = 0
  /** Where the next FFT ends, in frames of the input. */
  private next = FFT_SIZE
  private readonly hop: number
  private readonly power: Float64Array
  private readonly counts: Uint16Array
  /** For each band, the FFT bins it averages. */
  private readonly ranges: [number, number][]
  private readonly highest: number
  private readonly per: number
  private readonly scale: number

  constructor(
    sampleRate: number,
    totalFrames: number,
    private readonly columns: number
  ) {
    this.window = Float64Array.from(
      { length: FFT_SIZE },
      (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / FFT_SIZE)
    )
    this.power = new Float64Array(columns * BANDS)
    this.counts = new Uint16Array(columns)
    this.per = Math.max(1, totalFrames) / columns
    // About FFTS_PER_COLUMN in each column: apart in a long file, overlapping in a short one.
    this.hop = Math.max(1, this.per / FFTS_PER_COLUMN)
    this.highest = sampleRate / 2
    const bin = sampleRate / FFT_SIZE
    this.ranges = Array.from({ length: BANDS }, (_, band) => {
      const low = LOWEST * (this.highest / LOWEST) ** (band / BANDS)
      const high = LOWEST * (this.highest / LOWEST) ** ((band + 1) / BANDS)
      const from = Math.ceil(low / bin)
      const to = Math.min(FFT_SIZE / 2, Math.ceil(high / bin))
      // A band narrower than a bin takes the bin nearest its middle.
      const middle = Math.round(Math.sqrt(low * high) / bin)
      return to > from ? [from, to] : [middle, middle + 1]
    })
    // A full-scale sine through a Hann window peaks at a quarter of the size.
    this.scale = 1 / (FFT_SIZE / 4) ** 2
  }

  /** The next frames, one array per channel. */
  push(planes: readonly Float32Array[]) {
    const frames = planes[0]?.length ?? 0
    for (let index = 0; index < frames; index++) {
      let sum = 0
      for (const plane of planes) sum += plane[index]
      this.ring[this.seen % FFT_SIZE] = sum / planes.length
      this.seen++
      if (this.seen >= this.next) {
        this.take(this.seen)
        this.next += this.hop
      }
    }
  }

  /** The FFT_SIZE frames before `end` (silence before the start), into the column their middle lies in. */
  private take(end: number) {
    const real = new Float64Array(FFT_SIZE)
    const imaginary = new Float64Array(FFT_SIZE)
    for (let index = 0; index < FFT_SIZE; index++) {
      const frame = end - FFT_SIZE + index
      if (frame >= 0)
        real[index] = this.ring[frame % FFT_SIZE] * this.window[index]
    }
    fft(real, imaginary)
    const column = Math.min(
      this.columns - 1,
      Math.max(0, Math.floor((end - FFT_SIZE / 2) / this.per))
    )
    this.counts[column]++
    const at = column * BANDS
    this.ranges.forEach(([from, to], band) => {
      let sum = 0
      for (let bin = from; bin < to; bin++)
        sum += real[bin] ** 2 + imaginary[bin] ** 2
      this.power[at + band] += sum / (to - from)
    })
  }

  result(): Spectrum {
    // A sound shorter than one FFT is heard once, as it is.
    if (this.seen > 0 && this.seen < FFT_SIZE) {
      this.take(this.seen)
      this.next = Infinity
    }
    const values = new Uint8Array(this.columns * BANDS)
    for (let column = 0; column < this.columns; column++) {
      const count = this.counts[column]
      for (let band = 0; band < BANDS; band++) {
        const at = column * BANDS + band
        const db = count
          ? 10 * Math.log10((this.power[at] / count) * this.scale + 1e-20)
          : FLOOR
        values[at] = Math.round(
          (Math.min(CEILING, Math.max(FLOOR, db)) - FLOOR) *
            (255 / (CEILING - FLOOR))
        )
      }
    }
    return {
      columns: this.columns,
      bands: BANDS,
      values,
      lowest: LOWEST,
      highest: this.highest,
    }
  }
}
