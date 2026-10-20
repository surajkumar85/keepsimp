/**
 * A look-ahead limiter that keeps a sound's true peak under a ceiling. Each
 * frame's level is its loudest sample or point between samples (read as the
 * meter reads true peak, from the twelve samples around it); the gain a
 * frame needs is the ceiling over that level. The gain applied is the least
 * any frame needs over the coming 5 ms, released slowly (100 ms) and then
 * averaged over the 5 ms before, so it falls smoothly to what the loudest
 * frame needs by the time that frame is heard, and never clicks. The sound
 * comes out `latency` frames late: the first call gives fewer frames than
 * it is given, and `flush` gives the rest.
 */

import { interpolators, oversampling } from "./loudness"

/** How far it looks ahead and how slowly it lets go, in seconds. */
export const LOOKAHEAD = 0.005
export const RELEASE = 0.1
/** Under the ceiling by this much, for the small error of a gain that changes. */
const MARGIN = 10 ** (-0.05 / 20)
/** Interpolation reaches this many samples either side (as in the meter). */
const REACH = 6

export class Limiter {
  /** How many frames late the sound comes out. */
  readonly latency: number
  /** The most the gain was lowered, as a level (1 when it never was). */
  lowest = 1
  /** How many frames were made quieter. */
  limited = 0

  private readonly ceiling: number
  private readonly ahead: number
  private readonly release: number
  private readonly phases: Float32Array[]
  private readonly spread: number
  /** Each channel's last twelve samples, twice over, so a window is one run. */
  private readonly windows: Float32Array[]
  private written = 0
  /** Each channel's frames waiting to come out. */
  private readonly delay: Float32Array[]
  /** The gains frames need, waiting for the minimum over the look-ahead. */
  private readonly needed: Float32Array
  /** Indices into `needed` of a falling run, for the sliding minimum. */
  private readonly queue: Int32Array
  private head = 0
  private tail = 0
  /** The released gains of the last `ahead` frames, and their sum. */
  private readonly recent: Float64Array
  private sum: number
  private held = 1
  /** Frames taken in. */
  private frame = 0

  constructor(
    readonly sampleRate: number,
    readonly channels: number,
    /** The highest a sample or point between samples may reach, as a level. */
    ceiling: number
  ) {
    this.ceiling = ceiling * MARGIN
    this.ahead = Math.max(1, Math.round(LOOKAHEAD * sampleRate))
    this.release = 1 - Math.exp(-1 / (RELEASE * sampleRate))
    this.latency = this.ahead + REACH
    this.phases = interpolators(oversampling(sampleRate))
    this.spread = Math.max(
      1,
      ...this.phases.map((taps) =>
        taps.reduce((sum, tap) => sum + Math.abs(tap), 0)
      )
    )
    this.windows = Array.from(
      { length: channels },
      () => new Float32Array(4 * REACH)
    )
    const size = this.latency + 1
    this.delay = Array.from({ length: channels }, () => new Float32Array(size))
    this.needed = new Float32Array(this.ahead + 1)
    this.queue = new Int32Array(this.ahead + 2)
    this.recent = new Float64Array(this.ahead).fill(1)
    this.sum = this.ahead
  }

  /** The frames that are ready, for the next frames given (one array per channel). */
  process(planes: readonly Float32Array[]): Float32Array[] {
    const frames = planes[0]?.length ?? 0
    const ready = Math.max(
      0,
      Math.min(frames, this.frame + frames - this.latency)
    )
    const out = Array.from(
      { length: this.channels },
      () => new Float32Array(ready)
    )
    let made = 0
    for (let index = 0; index < frames; index++)
      if (this.take(planes, index, out, made)) made++
    return out
  }

  /** The frames still waiting, as if silence followed. */
  flush(): Float32Array[] {
    const waiting = Math.min(this.latency, this.frame)
    const silence = Array.from(
      { length: this.channels },
      () => new Float32Array(this.latency)
    )
    const out = Array.from(
      { length: this.channels },
      () => new Float32Array(waiting)
    )
    let made = 0
    for (let index = 0; index < this.latency && made < waiting; index++)
      if (this.take(silence, index, out, made)) made++
    return out
  }

  /** Take in one frame, and put the frame `latency` before it into `out` at `made`; false while none is ready. */
  private take(
    planes: readonly Float32Array[],
    index: number,
    out: Float32Array[],
    made: number
  ) {
    const gain = this.step(planes, index)
    if (gain === null) return false
    const at = (this.frame - 1 - this.latency) % this.delay[0].length
    for (let channel = 0; channel < this.channels; channel++)
      out[channel][made] = this.delay[channel][at] * gain
    return true
  }

  /**
   * Take in one frame; the gain for the frame `latency` before it, or null
   * while the first frames are still on their way.
   */
  private step(planes: readonly Float32Array[], index: number): number | null {
    const frame = this.frame++
    const slot = frame % this.delay[0].length
    // The level of the frame REACH before this one: its sample and the
    // points between it and the next.
    let level = 0
    const quiet = this.ceiling / this.spread
    for (let channel = 0; channel < this.channels; channel++) {
      const value = planes[channel][index]
      this.delay[channel][slot] = value
      const window = this.windows[channel]
      const at = this.written % (2 * REACH)
      window[at] = value
      window[at + 2 * REACH] = value
      // window[at + 1 .. at + 12] is the last twelve samples, oldest first.
      const start = at + 1
      const sample = window[start + REACH - 1]
      const own = sample < 0 ? -sample : sample
      if (own > level) level = own
      let loud = false
      for (let tap = 0; tap < 2 * REACH; tap++) {
        const near = window[start + tap]
        if ((near < 0 ? -near : near) > quiet) {
          loud = true
          break
        }
      }
      if (!loud) continue
      for (const taps of this.phases) {
        let point = 0
        for (let tap = 0; tap < 2 * REACH; tap++)
          point += taps[tap] * window[start + tap]
        if (point < 0) point = -point
        if (point > level) level = point
      }
    }
    this.written++
    if (frame < REACH) return null
    // The gain this level needs, into the sliding minimum.
    const need = level > this.ceiling ? this.ceiling / level : 1
    const position = frame - REACH
    const size = this.needed.length
    this.needed[position % size] = need
    const queue = this.queue
    const length = queue.length
    while (
      this.tail !== this.head &&
      this.needed[queue[(this.tail - 1 + length) % length] % size] >= need
    )
      this.tail = (this.tail - 1 + length) % length
    queue[this.tail] = position
    this.tail = (this.tail + 1) % length
    // The frame whose look-ahead is now complete. The frames before the
    // sound count too (as silence), so that the gain has already fallen
    // when a loud first frame is heard.
    const done = position - this.ahead
    while (queue[this.head] < done) this.head = (this.head + 1) % length
    const least = this.needed[queue[this.head] % size]
    // Let go slowly, fall at once; then average over the look-ahead.
    this.held = Math.min(least, this.held + (1 - this.held) * this.release)
    const oldest = (done + this.ahead) % this.ahead
    this.sum += this.held - this.recent[oldest]
    this.recent[oldest] = this.held
    if (done < 0) return null
    const gain = Math.min(1, this.sum / this.ahead)
    if (gain < 0.99999) this.limited++
    if (gain < this.lowest) this.lowest = gain
    return gain
  }
}
