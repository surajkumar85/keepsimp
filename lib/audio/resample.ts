/**
 * Playing a sound faster or slower by a ratio, as a tape does: every output
 * frame is the input at `ratio` times its place, interpolated with a
 * Kaiser-windowed sinc of 16 zero crossings either side, its cutoff lowered
 * when the sound is sped up so that nothing above the new Nyquist folds
 * back. It streams, holding only the taps' reach of input.
 */

/** Zero crossings of the sinc either side, the window's shape, and table steps per unit. */
const CROSSINGS = 16
const BETA = 8
const STEPS = 512

function bessel(x: number) {
  let sum = 1
  let term = 1
  for (let k = 1; k < 40; k++) {
    term *= x / 2 / k
    sum += term * term
  }
  return sum
}

export class Resampler {
  /** How far either side the kernel reaches, in input frames. */
  private readonly half: number
  private readonly table: Float32Array
  private readonly input: Float32Array[]
  /** The input frame input[·][0] is, and how many are held. */
  private base = 0
  private length = 0
  /** Where the next output frame is in the input. */
  private position = 0
  private produced = 0

  constructor(
    private readonly channels: number,
    /** How much faster: 2 plays in half the time, an octave up. */
    private readonly ratio: number
  ) {
    const cutoff = Math.min(1, 1 / ratio)
    this.half = Math.ceil(CROSSINGS / cutoff)
    // The kernel at every 1/STEPS of an input frame, from 0 to `half` (it is even).
    this.table = Float32Array.from(
      { length: this.half * STEPS + 2 },
      (_, index) => {
        const u = index / STEPS
        if (u >= this.half) return 0
        const sinc =
          u === 0 ? 1 : Math.sin(Math.PI * cutoff * u) / (Math.PI * cutoff * u)
        const v = u / this.half
        return (
          cutoff * sinc * (bessel(BETA * Math.sqrt(1 - v * v)) / bessel(BETA))
        )
      }
    )
    this.input = Array.from({ length: channels }, () => new Float32Array(8192))
  }

  private kernel(u: number) {
    const at = Math.abs(u) * STEPS
    // Taps reach at most `half` frames away, inside the table.
    const index = Math.floor(at)
    const part = at - index
    return this.table[index] * (1 - part) + this.table[index + 1] * part
  }

  /** The next input; the output ready, one array per channel. */
  process(planes: readonly Float32Array[]): Float32Array[] {
    this.hold(planes)
    return this.run()
  }

  /** The input has ended: the rest, as if silence followed. */
  flush(): Float32Array[] {
    this.hold(
      Array.from(
        { length: this.channels },
        () => new Float32Array(this.half + 1)
      )
    )
    return this.run()
  }

  private hold(planes: readonly Float32Array[]) {
    const count = planes[0].length
    if (this.length + count > this.input[0].length)
      for (let channel = 0; channel < this.channels; channel++) {
        const grown = new Float32Array(
          Math.max(this.length + count, this.input[0].length * 2)
        )
        grown.set(this.input[channel].subarray(0, this.length))
        this.input[channel] = grown
      }
    for (let channel = 0; channel < this.channels; channel++)
      this.input[channel].set(planes[channel], this.length)
    this.length += count
  }

  private run(): Float32Array[] {
    // Every output frame whose kernel lies within the input held (at the end,
    // the flush has added the silence after the sound).
    const last = this.base + this.length - this.half - 1
    const count = Math.max(0, Math.floor(last / this.ratio) - this.produced + 1)
    const out = Array.from(
      { length: this.channels },
      () => new Float32Array(count)
    )
    const weights = new Float32Array(2 * this.half)
    for (let made = 0; made < count; made++) {
      const centre = Math.floor(this.position)
      const fraction = this.position - centre
      // The kernel's weights once, for every channel.
      for (let tap = -this.half + 1; tap <= this.half; tap++)
        weights[tap + this.half - 1] = this.kernel(tap - fraction)
      const start = centre - this.half + 1 - this.base
      for (let channel = 0; channel < this.channels; channel++) {
        const plane = this.input[channel]
        let value = 0
        for (let tap = 0; tap < weights.length; tap++) {
          const index = start + tap
          if (index >= 0 && index < this.length)
            value += plane[index] * weights[tap]
        }
        out[channel][made] = value
      }
      this.produced++
      this.position = this.produced * this.ratio
    }
    // What no later output frame can reach is let go of.
    const keep = Math.floor(this.position) - this.half - this.base
    if (keep > 0) {
      for (const plane of this.input) plane.copyWithin(0, keep, this.length)
      this.length -= keep
      this.base += keep
    }
    return out
  }
}
