/**
 * Repairing a recording: background noise taken down by RNNoise (a small
 * neural network trained on speech, run on the device at 48 kHz), mains hum
 * notched out at 50 or 60 Hz and its harmonics, clicks found and drawn over,
 * and harsh "s" sounds turned down (a de-esser). Each stage streams and gives
 * back exactly as many frames as it is given.
 */

import { Resampler } from "./resample"
import { cookbook, type Biquad } from "./tone"

export type Sibilance = "off" | "gentle" | "strong"

export interface Repair {
  /** How much of RNNoise's result is heard, from 0 (off) to 1. */
  denoise: number
  /** The mains frequency to notch out, or none. */
  hum: 0 | 50 | 60
  declick: boolean
  deess: Sibilance
}

export const noRepair: Repair = {
  denoise: 0,
  hum: 0,
  declick: false,
  deess: "off",
}

export const isUnrepaired = (repair: Repair) =>
  repair.denoise === 0 &&
  repair.hum === 0 &&
  !repair.declick &&
  repair.deess === "off"

export function repairProblem(repair: Repair): string | null {
  if (!(repair.denoise >= 0 && repair.denoise <= 1))
    return "Choose how much noise to take away, from none to all."
  return null
}

export const repairKey = (repair: Repair) =>
  isUnrepaired(repair) ? "none" : JSON.stringify(repair)

/** What RNNoise is, as the WebAssembly build gives it. */
export interface Rnnoise {
  createDenoiseState(): {
    /** 480 samples at 48 kHz, in the range of 16-bit samples; changed in place. */
    processFrame(frame: Float32Array): number
    destroy(): void
  }
}

/** RNNoise's frames, rate, and how late its output comes. */
export const RNNOISE_FRAME = 480
export const RNNOISE_RATE = 48000
export const RNNOISE_DELAY = 960

/** A stage of the repair: it may hold some frames back, and gives them all by the end. */
interface Stage {
  process(planes: Float32Array[]): Float32Array[]
  flush(): Float32Array[]
}

const concat = (parts: Float32Array[]) => {
  const out = new Float32Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  )
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A biquad running over one channel. */
function run(filter: Biquad, state: Float64Array, plane: Float32Array) {
  const { b0, b1, b2, a1, a2 } = filter
  let s1 = state[0]
  let s2 = state[1]
  for (let index = 0; index < plane.length; index++) {
    const x = plane[index]
    const y = b0 * x + s1
    s1 = b1 * x - a1 * y + s2
    s2 = b2 * x - a2 * y
    plane[index] = y
  }
  state[0] = s1
  state[1] = s2
}

/** How wide each hum notch is, in Hz. */
export const HUM_WIDTH = 3

/** Notches at the mains frequency and its harmonics under 1 kHz, narrow enough to leave music. */
export class Hum implements Stage {
  private readonly filters: Biquad[]
  private readonly states: Float64Array[][]
  constructor(frequency: 50 | 60, sampleRate: number, channels: number) {
    this.filters = []
    // Each notch is 3 Hz wide, wider than the mains drifts and narrow
    // enough that a note beside a harmonic is hardly touched.
    for (let harmonic = 1; harmonic * frequency <= 1000; harmonic++)
      this.filters.push(
        notch(
          sampleRate,
          harmonic * frequency,
          (harmonic * frequency) / HUM_WIDTH
        )
      )
    this.states = Array.from({ length: channels }, () =>
      this.filters.map(() => new Float64Array(2))
    )
  }
  process(planes: Float32Array[]) {
    planes.forEach((plane, channel) =>
      this.filters.forEach((filter, index) =>
        run(filter, this.states[channel][index], plane)
      )
    )
    return planes
  }
  flush() {
    return this.states.map(() => new Float32Array(0))
  }
}

/** A notch biquad by the cookbook. */
export function notch(rate: number, frequency: number, q: number): Biquad {
  const w0 = (2 * Math.PI * frequency) / rate
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: 1 / a0,
    b1: (-2 * Math.cos(w0)) / a0,
    b2: 1 / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  }
}

/**
 * Clicks: how much louder than the sound around it a jump must be (speech's
 * own jumps reach about 20), and how long it may last.
 */
export const CLICK_FACTOR = 30
export const LONGEST_CLICK = 0.002

/**
 * Clicks: a sample far from the line between its neighbours, many times
 * more than the sound around it is, in a run of at most 2 ms, is drawn over
 * with a smooth curve from the samples either side. It works on a stretch
 * at a time, holding back the last 20 ms until what follows them is known.
 */
export class Declicker implements Stage {
  private readonly margin: number
  private readonly longest: number
  private readonly context: number
  /** How far either side the sound around a sample reaches. */
  private readonly around: number
  /** Each channel's frames not yet given out, after `context` frames already given. */
  private held: Float32Array[]
  private fresh = 0
  /** Clicks drawn over, for the page to say. */
  repaired = 0

  constructor(
    sampleRate: number,
    private readonly channels: number
  ) {
    this.margin = Math.round(0.02 * sampleRate)
    this.context = this.margin
    this.around = Math.round(0.005 * sampleRate)
    this.longest = Math.max(1, Math.round(LONGEST_CLICK * sampleRate))
    this.held = Array.from({ length: channels }, () => new Float32Array(0))
  }

  process(planes: Float32Array[]) {
    this.held = this.held.map((plane, channel) =>
      concat([plane, planes[channel]])
    )
    this.fresh += planes[0].length
    return this.give(false)
  }

  flush() {
    return this.give(true)
  }

  /** Repair what is known, give out all but the margin (or everything, at the end). */
  private give(end: boolean) {
    const length = this.held[0].length
    const before = length - this.fresh
    const out = end ? this.fresh : Math.max(0, this.fresh - this.margin)
    for (const plane of this.held) this.repairs(plane, before, before + out)
    const given = this.held.map((plane) => plane.slice(before, before + out))
    this.fresh -= out
    // Keep the context before what is still to come, and that.
    const keep = Math.min(before + out, this.context)
    this.held = this.held.map((plane) => plane.slice(before + out - keep))
    return given
  }

  /** Draw over the clicks that start between `from` and `to`. */
  private repairs(plane: Float32Array, from: number, to: number) {
    const length = plane.length
    const residual = (index: number) =>
      index <= 0 || index >= length - 1
        ? 0
        : Math.abs(plane[index] - (plane[index - 1] + plane[index + 1]) / 2)
    // The sound around each sample: the mean jump within 5 ms either side.
    const sums = new Float64Array(length + 1)
    for (let index = 0; index < length; index++)
      sums[index + 1] = sums[index] + residual(index)
    const reach = this.around
    const limit = (index: number) => {
      const a = Math.max(0, index - reach)
      const b = Math.min(length, index + reach + 1)
      return Math.max(CLICK_FACTOR * ((sums[b] - sums[a]) / (b - a)), 1e-3)
    }
    for (let index = Math.max(1, from); index < to; index++) {
      const here = limit(index)
      if (residual(index) <= here) continue
      let stop = index
      while (
        stop + 1 < length - 1 &&
        stop - index < this.longest * 2 &&
        residual(stop + 1) > here
      )
        stop++
      // No run outlasts a click: a jump 30 times the mean of the 10 ms
      // around it can go on for at most a thirtieth of that.
      const left = Math.max(1, index - 2)
      const right = Math.min(length - 2, stop + 2)
      // The click must lie inside what is drawn: one at an edge is left.
      if (left >= index || right <= stop) continue
      this.draw(plane, left, right)
      this.repaired++
      index = right
    }
  }

  /** A cubic from `left` to `right` matching the samples and slopes either side. */
  private draw(plane: Float32Array, left: number, right: number) {
    const y0 = plane[left]
    const y1 = plane[right]
    const m0 = plane[left] - plane[left - 1]
    const m1 = plane[right + 1] - plane[right]
    const span = right - left
    for (let index = left + 1; index < right; index++) {
      const t = (index - left) / span
      const t2 = t * t
      const t3 = t2 * t
      plane[index] =
        (2 * t3 - 3 * t2 + 1) * y0 +
        (t3 - 2 * t2 + t) * m0 * span +
        (-2 * t3 + 3 * t2) * y1 +
        (t3 - t2) * m1 * span
    }
  }
}

/** The de-esser's presets: the level over which "s" sounds are turned down, the ratio, the most taken off. */
export const SIBILANCE: Record<
  Exclude<Sibilance, "off">,
  { threshold: number; ratio: number; most: number }
> = {
  gentle: { threshold: -30, ratio: 3, most: -6 },
  strong: { threshold: -36, ratio: 4, most: -12 },
}
export const SIBILANCE_FROM = 5000

/**
 * Harsh "s" sounds: the sound over 5 kHz is split off; when it is louder
 * than the threshold, it alone is turned down by the ratio, quickly, and
 * let back up over 60 ms. Under 5 kHz nothing changes.
 */
export class Deesser implements Stage {
  private readonly split: Biquad
  private readonly states: Float64Array[]
  private readonly attack: number
  private readonly release: number
  private envelope = 0
  private gain = 1
  /** The most it turned the "s" down, in dB. */
  most = 0

  constructor(
    private readonly preset: (typeof SIBILANCE)[keyof typeof SIBILANCE],
    sampleRate: number,
    channels: number
  ) {
    this.split = cookbook("lowpass", sampleRate, SIBILANCE_FROM)
    this.states = Array.from({ length: channels }, () => new Float64Array(2))
    this.attack = Math.exp(-1 / (0.001 * sampleRate))
    this.release = Math.exp(-1 / (0.06 * sampleRate))
  }

  process(planes: Float32Array[]) {
    const frames = planes[0].length
    const lows = planes.map((plane, channel) => {
      const low = plane.slice()
      run(this.split, this.states[channel], low)
      return low
    })
    const limit = 10 ** (this.preset.threshold / 20)
    const floor = 10 ** (this.preset.most / 20)
    for (let index = 0; index < frames; index++) {
      let level = 0
      planes.forEach((plane, channel) => {
        const high = plane[index] - lows[channel][index]
        const value = high < 0 ? -high : high
        if (value > level) level = value
      })
      const coefficient = level > this.envelope ? this.attack : this.release
      this.envelope = coefficient * this.envelope + (1 - coefficient) * level
      const wanted =
        this.envelope > limit
          ? Math.max(
              floor,
              (limit / this.envelope) ** (1 - 1 / this.preset.ratio)
            )
          : 1
      this.gain =
        wanted < this.gain
          ? wanted
          : this.release * this.gain + (1 - this.release) * wanted
      if (this.gain < 0.999) {
        const db = 20 * Math.log10(this.gain)
        if (db < this.most) this.most = db
      }
      planes.forEach((plane, channel) => {
        const low = lows[channel][index]
        plane[index] = low + (plane[index] - low) * this.gain
      })
    }
    return planes
  }

  flush() {
    return this.states.map(() => new Float32Array(0))
  }
}

/**
 * Background noise taken down by RNNoise. Each channel is resampled to
 * 48 kHz, put through RNNoise 480 samples at a time, its 960 samples of
 * delay taken off, mixed with the sound as it was by `strength`, and
 * resampled back: exactly as many frames come out as went in.
 */
export class Denoiser implements Stage {
  private readonly lanes: {
    state: ReturnType<Rnnoise["createDenoiseState"]>
    up: Resampler | null
    down: Resampler | null
    /** At 48 kHz: what waits to fill a frame, the sound as it was waiting for its denoised self, and how much of the delay is still to drop. */
    pending: Float32Array
    dry: Float32Array
    dropping: number
  }[]
  private taken = 0
  private given = 0

  constructor(
    rnnoise: Rnnoise,
    private readonly sampleRate: number,
    private readonly channels: number,
    private readonly strength: number
  ) {
    const same = sampleRate === RNNOISE_RATE
    this.lanes = Array.from({ length: channels }, () => ({
      state: rnnoise.createDenoiseState(),
      up: same ? null : new Resampler(1, sampleRate / RNNOISE_RATE),
      down: same ? null : new Resampler(1, RNNOISE_RATE / sampleRate),
      pending: new Float32Array(0),
      dry: new Float32Array(0),
      dropping: RNNOISE_DELAY,
    }))
  }

  process(planes: Float32Array[]) {
    this.taken += planes[0].length
    return this.limit(
      planes.map((plane, channel) => {
        const lane = this.lanes[channel]
        const at48 = lane.up ? lane.up.process([plane])[0] : plane
        const mixed = this.through(channel, at48)
        return lane.down ? lane.down.process([mixed])[0] : mixed
      })
    )
  }

  flush() {
    const out = this.lanes.map((lane, channel) => {
      const parts: Float32Array[] = []
      const tail = lane.up ? lane.up.flush()[0] : new Float32Array(0)
      // Silence after the sound, to bring out what RNNoise still holds.
      const padding = new Float32Array(RNNOISE_DELAY + RNNOISE_FRAME)
      const mixed = this.through(channel, concat([tail, padding]))
      if (lane.down) {
        parts.push(lane.down.process([mixed])[0], lane.down.flush()[0])
      } else parts.push(mixed)
      lane.state.destroy()
      return concat(parts)
    })
    // The silence after the sound brings out at least every frame that went in.
    return this.limit(out)
  }

  /** Never more than went in. */
  private limit(planes: Float32Array[]) {
    const room = Math.max(0, this.taken - this.given)
    const count = Math.min(room, ...planes.map((plane) => plane.length))
    this.given += count
    return planes.map((plane) => plane.slice(0, count))
  }

  /** Frames at 48 kHz through RNNoise, mixed with themselves as they were. */
  private through(channel: number, at48: Float32Array) {
    const lane = this.lanes[channel]
    lane.pending = concat([lane.pending, at48])
    lane.dry = concat([lane.dry, at48])
    const wet: Float32Array[] = []
    let at = 0
    for (; at + RNNOISE_FRAME <= lane.pending.length; at += RNNOISE_FRAME) {
      const frame = lane.pending.slice(at, at + RNNOISE_FRAME)
      for (let index = 0; index < frame.length; index++) frame[index] *= 32768
      lane.state.processFrame(frame)
      for (let index = 0; index < frame.length; index++) frame[index] /= 32768
      wet.push(frame)
    }
    lane.pending = lane.pending.slice(at)
    let denoised = concat(wet)
    // RNNoise's output is late: its first 960 samples come before the sound.
    const drop = Math.min(lane.dropping, denoised.length)
    lane.dropping -= drop
    denoised = denoised.slice(drop)
    const count = Math.min(denoised.length, lane.dry.length)
    const mixed = new Float32Array(count)
    for (let index = 0; index < count; index++)
      mixed[index] =
        lane.dry[index] * (1 - this.strength) + denoised[index] * this.strength
    lane.dry = lane.dry.slice(count)
    return mixed
  }
}

/** The repair's stages for a sound, in order: clicks, hum, noise, then "s" (after the equaliser). */
export function repairStages(
  repair: Repair,
  sampleRate: number,
  channels: number,
  rnnoise: Rnnoise | null
) {
  const before: Stage[] = []
  if (repair.declick) before.push(new Declicker(sampleRate, channels))
  if (repair.hum) before.push(new Hum(repair.hum, sampleRate, channels))
  if (repair.denoise > 0 && rnnoise)
    before.push(new Denoiser(rnnoise, sampleRate, channels, repair.denoise))
  const after: Stage[] =
    repair.deess === "off"
      ? []
      : [new Deesser(SIBILANCE[repair.deess], sampleRate, channels)]
  return { before, after }
}

/** Frames through stages in turn, and at the end everything they still hold. */
export function through(
  stages: readonly Stage[],
  planes: Float32Array[],
  last: boolean
) {
  let out = planes
  for (const stage of stages) {
    out = stage.process(out)
    if (last) {
      // What this stage held goes on through the rest.
      const rest = stage.flush()
      out = out.map((plane, channel) => concat([plane, rest[channel]]))
    }
  }
  return out
}
