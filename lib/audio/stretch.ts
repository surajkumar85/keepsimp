/**
 * Changing the tempo of a sound without changing its pitch, by WSOLA
 * (waveform-similarity overlap-add, Verhelst and Roelands, 1993): the
 * sound is rebuilt from frames of 40 ms under a Hann window, half a frame
 * apart; each frame is taken from about where the tempo puts it in the
 * input, within ±12 ms, at the place whose waveform best matches the
 * natural continuation of the frame before, so the overlaps add in phase.
 * The channels share every choice, so a stereo image stays where it was.
 * It streams: only a few frames of input are held.
 */

/** Frames of input, one array per channel, that grow at the end and are let go of at the start. */
class Held {
  planes: Float32Array[]
  /** The channels summed, for matching. */
  mono: Float32Array
  /** The input frame planes[·][0] is. */
  base = 0
  length = 0
  constructor(channels: number) {
    this.planes = Array.from({ length: channels }, () => new Float32Array(4096))
    this.mono = new Float32Array(4096)
  }
  add(planes: readonly Float32Array[]) {
    const count = planes[0].length
    if (this.length + count > this.mono.length) {
      const size = Math.max(this.length + count, this.mono.length * 2)
      const grow = (plane: Float32Array) => {
        const grown = new Float32Array(size)
        grown.set(plane.subarray(0, this.length))
        return grown
      }
      this.planes = this.planes.map(grow)
      this.mono = grow(this.mono)
    }
    this.planes.forEach((plane, channel) =>
      plane.set(planes[channel], this.length)
    )
    for (let index = 0; index < count; index++) {
      let sum = 0
      for (const plane of planes) sum += plane[index]
      this.mono[this.length + index] = sum
    }
    this.length += count
  }
  /** Let go of everything before input frame `frame`. */
  dropBefore(frame: number) {
    const count = Math.min(this.length, Math.max(0, frame - this.base))
    if (!count) return
    for (const plane of this.planes) plane.copyWithin(0, count, this.length)
    this.mono.copyWithin(0, count, this.length)
    this.length -= count
    this.base += count
  }
  /** Input frame `frame` of a channel, silence outside what is held. */
  at(channel: number, frame: number) {
    const index = frame - this.base
    return index >= 0 && index < this.length ? this.planes[channel][index] : 0
  }
  /** The channels summed at input frame `frame`, silence outside what is held. */
  monoAt(frame: number) {
    const index = frame - this.base
    return index >= 0 && index < this.length ? this.mono[index] : 0
  }
  /** Whether frames `from` to `to` (exclusive) are all held. */
  holds(from: number, to: number) {
    return from >= this.base && to <= this.base + this.length
  }
  /** The frame after the last held. */
  get end() {
    return this.base + this.length
  }
}

/** How long a frame is, and how far the search for a match reaches, in seconds. */
export const FRAME = 0.04
export const SEARCH = 0.012

export class Stretcher {
  private readonly size: number
  private readonly hop: number
  private readonly reach: number
  private readonly window: Float32Array
  private readonly held: Held
  /** The output being added to: one frame long, the first hop of it next out. */
  private readonly sum: Float32Array[]
  private frame = 0
  /** Where the last frame was taken from, in input frames. */
  private last = 0
  private ended = false

  constructor(
    sampleRate: number,
    private readonly channels: number,
    /** How much faster: 2 plays in half the time. */
    private readonly tempo: number
  ) {
    this.hop = Math.max(16, Math.round((FRAME * sampleRate) / 2))
    this.size = this.hop * 2
    this.reach = Math.round(SEARCH * sampleRate)
    // A periodic Hann window: windows a hop apart add to exactly one.
    this.window = Float32Array.from(
      { length: this.size },
      (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / this.size)
    )
    this.held = new Held(channels)
    this.sum = Array.from(
      { length: channels },
      () => new Float32Array(this.size)
    )
  }

  /** Where frame `k` belongs in the input, before the search. */
  private ideal(k: number) {
    return Math.round(k * this.hop * this.tempo)
  }

  /** The next input; the output ready, one array per channel. */
  process(planes: readonly Float32Array[]): Float32Array[] {
    this.held.add(planes)
    return this.run()
  }

  /** The input has ended: the rest of the output, as if silence followed. */
  flush(): Float32Array[] {
    this.ended = true
    return this.run()
  }

  private run(): Float32Array[] {
    const out: Float32Array[][] = []
    while (this.ready()) out.push(this.make())
    if (this.ended) {
      // The last frame's second half has nothing after it to overlap.
      out.push(this.sum.map((plane) => plane.slice(0, this.hop)))
      this.sum.forEach((plane) => plane.fill(0))
    }
    return this.sum.map((_, channel) => {
      const length = out.reduce(
        (total, part) => total + part[channel].length,
        0
      )
      const joined = new Float32Array(length)
      let at = 0
      for (const part of out) {
        joined.set(part[channel], at)
        at += part[channel].length
      }
      return joined
    })
  }

  /** Whether the input needed for the next frame is held (or will never come). */
  private ready() {
    const start = this.ideal(this.frame)
    if (this.ended) return start < this.held.end
    return start + this.reach + this.size <= this.held.end
  }

  /** Add the next frame, and give out the hop that is now complete. */
  private make(): Float32Array[] {
    const k = this.frame++
    let from = 0
    if (k > 0) {
      const natural = this.last + this.hop
      from = this.best(natural, this.ideal(k))
    } else {
      // Before the first frame, the sound as it is: its first hop needs no fade in.
      for (let channel = 0; channel < this.channels; channel++)
        for (let index = 0; index < this.hop; index++)
          this.sum[channel][index] +=
            this.held.at(channel, index) * this.window[this.hop + index]
    }
    const window = this.window
    if (this.held.holds(from, from + this.size)) {
      const offset = from - this.held.base
      for (let channel = 0; channel < this.channels; channel++) {
        const sum = this.sum[channel]
        const plane = this.held.planes[channel]
        for (let index = 0; index < this.size; index++)
          sum[index] += plane[offset + index] * window[index]
      }
    } else
      for (let channel = 0; channel < this.channels; channel++) {
        const sum = this.sum[channel]
        for (let index = 0; index < this.size; index++)
          sum[index] += this.held.at(channel, from + index) * window[index]
      }
    this.last = from
    const ready = this.sum.map((plane) => plane.slice(0, this.hop))
    for (const plane of this.sum) {
      plane.copyWithin(0, this.hop)
      plane.fill(0, this.hop)
    }
    // What no later frame can need is let go of.
    this.held.dropBefore(
      Math.min(this.last + this.hop, this.ideal(k + 1) - this.reach)
    )
    return ready
  }

  /**
   * The start, within the reach of `ideal`, whose first hop best matches
   * the hop at `natural` (normalised cross-correlation of the channels
   * summed): first every fourth place on every fourth frame, then each
   * place around the best.
   */
  private best(natural: number, ideal: number) {
    const held = this.held
    const score = (start: number, step: number) => {
      let cross = 0
      let energy = 1e-12
      if (
        held.holds(start, start + this.hop) &&
        held.holds(natural, natural + this.hop)
      ) {
        const mono = held.mono
        const a = natural - held.base
        const b = start - held.base
        for (let index = 0; index < this.hop; index += step) {
          const candidate = mono[b + index]
          cross += mono[a + index] * candidate
          energy += candidate * candidate
        }
      } else
        for (let index = 0; index < this.hop; index += step) {
          const candidate = held.monoAt(start + index)
          cross += held.monoAt(natural + index) * candidate
          energy += candidate * candidate
        }
      return cross / Math.sqrt(energy)
    }
    const low = Math.max(0, ideal - this.reach)
    const high = ideal + this.reach
    let found = Math.max(low, Math.min(high, ideal))
    let top = -Infinity
    for (let start = low; start <= high; start += 4) {
      const value = score(start, 4)
      if (value > top) {
        top = value
        found = start
      }
    }
    const around = found
    top = -Infinity
    for (
      let start = Math.max(low, around - 3);
      start <= Math.min(high, around + 3);
      start++
    ) {
      const value = score(start, 1)
      if (value > top) {
        top = value
        found = start
      }
    }
    return found
  }
}
