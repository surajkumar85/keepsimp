/**
 * Loudness as ITU-R BS.1770-5 measures it, gathered while a sound is
 * decoded chunk by chunk: each channel K-weighted (a high shelf, then a
 * high-pass), squared and weighted, and summed in segments of 100 ms. From
 * those segments come the 400 ms blocks of integrated loudness (gated at
 * −70 LUFS and 10 LU under the ungated level), the 3 s windows of
 * short-term loudness and of the loudness range (EBU Tech 3342: gated at
 * −70 LUFS and 20 LU under, from the 10th to the 95th percentile), for all
 * of a file or any part of it. True peak is read by oversampling (four
 * times below 96 kHz), with an interpolating filter of 12 taps per phase.
 */

/** Segments of a second the map is kept in: 100 ms each, the hop of both block kinds. */
export const SEGMENTS_PER_SECOND = 10
/** The absolute gate, in LUFS. */
export const ABSOLUTE_GATE = -70
/** Silence and sound too short to measure. */
export const SILENT = -Infinity

/** Loudness of a weighted mean square, in LUFS (LKFS). */
export const lufsOf = (meanSquare: number) =>
  meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : SILENT

/** A level from 0 to 1 and over, in decibels. */
export const decibels = (level: number) =>
  level > 0 ? 20 * Math.log10(level) : SILENT

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/**
 * The two filters of K-weighting at any sample rate, made from their
 * analogue prototypes as libebur128 does; at 48 kHz they are the
 * coefficients printed in BS.1770.
 */
export function kWeighting(rate: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533
  const gain = 3.999843853973347
  let q = 0.7071752369554196
  let k = Math.tan((Math.PI * f0) / rate)
  const vh = 10 ** (gain / 20)
  const vb = vh ** 0.4996667741545416
  let a0 = 1 + k / q + k * k
  const shelf = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }
  f0 = 38.13547087602444
  q = 0.5003270373238773
  k = Math.tan((Math.PI * f0) / rate)
  a0 = 1 + k / q + k * k
  const highPass = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }
  return [shelf, highPass]
}

/**
 * How much each channel counts: 1 for the front three, 1.41 for the
 * surrounds and nothing for the LFE of a 5.1 or 7.1 file (in the order
 * L R C LFE Ls Rs [Lb Rb]); 1 for every channel of any other layout.
 */
export function channelWeights(channels: number): number[] {
  if (channels === 6) return [1, 1, 1, 0, 1.41, 1.41]
  if (channels === 8) return [1, 1, 1, 0, 1.41, 1.41, 1.41, 1.41]
  return Array.from({ length: channels }, () => 1)
}

/** How many times true peak oversamples at a rate. */
export const oversampling = (rate: number) =>
  rate < 96_000 ? 4 : rate < 192_000 ? 2 : 1

/** Interpolation reaches this many samples either side of a point. */
const REACH = 6

/**
 * The interpolating filter for each phase between two samples: a sinc
 * under a Blackman window, 12 taps, scaled to pass a constant unchanged.
 * Phase `p` (1 to factor − 1) gives the value `p / factor` of the way from
 * one sample to the next.
 */
export function interpolators(factor: number): Float32Array[] {
  const phases: Float32Array[] = []
  for (let phase = 1; phase < factor; phase++) {
    const taps = new Float32Array(2 * REACH)
    let sum = 0
    for (let tap = 0; tap < 2 * REACH; tap++) {
      // Sample j = tap - (REACH - 1), at distance `phase/factor - j`.
      const u = phase / factor - (tap - (REACH - 1))
      const sinc = Math.sin(Math.PI * u) / (Math.PI * u)
      const v = u / REACH
      const window =
        0.42 + 0.5 * Math.cos(Math.PI * v) + 0.08 * Math.cos(2 * Math.PI * v)
      taps[tap] = sinc * window
      sum += taps[tap]
    }
    for (let tap = 0; tap < taps.length; tap++) taps[tap] /= sum
    phases.push(taps)
  }
  return phases
}

/** What a sound measured, 100 ms at a time. */
export interface LoudnessMap {
  sampleRate: number
  /** Per segment: the weighted sum over channels of the K-weighted samples squared. */
  energy: Float64Array
  /** Per segment: how many frames it holds (the last may be short). */
  frames: Float64Array
  /** Per segment: its highest sample, and its true peak, as levels (1 is full scale). */
  peak: Float32Array
  truePeak: Float32Array
}

/** Arrays that grow as the segments come. */
class Growing {
  energy = new Float64Array(64)
  frames = new Float64Array(64)
  peak = new Float32Array(64)
  truePeak = new Float32Array(64)
  length = 0

  ensure(count: number) {
    if (count <= this.energy.length) return
    const size = Math.max(count, this.energy.length * 2)
    const grow = <T extends Float64Array | Float32Array>(old: T, made: T) => {
      made.set(old)
      return made
    }
    this.energy = grow(this.energy, new Float64Array(size))
    this.frames = grow(this.frames, new Float64Array(size))
    this.peak = grow(this.peak, new Float32Array(size))
    this.truePeak = grow(this.truePeak, new Float32Array(size))
  }
}

/** Measures a sound as it is decoded: `push` each chunk, then `result`. */
export class LoudnessMeter {
  private readonly filters: [Biquad, Biquad]
  /** Each channel's filter state: two for each of the two filters. */
  private readonly state: Float64Array[]
  private readonly weights: number[]
  private readonly phases: Float32Array[]
  /** The most a point between samples can be, over the loudest sample it is made from. */
  private readonly spread: number
  /** Each channel's last samples, before the chunk being read. */
  private readonly history: Float32Array[]
  private readonly segments = new Growing()
  /** Frames read so far. */
  private frame = 0
  private finished: LoudnessMap | null = null

  constructor(
    readonly sampleRate: number,
    readonly channels: number
  ) {
    this.filters = kWeighting(sampleRate)
    this.state = Array.from({ length: channels }, () => new Float64Array(4))
    this.weights = channelWeights(channels)
    this.phases = interpolators(oversampling(sampleRate))
    this.spread = Math.max(
      1,
      ...this.phases.map((taps) =>
        taps.reduce((sum, tap) => sum + Math.abs(tap), 0)
      )
    )
    this.history = Array.from(
      { length: channels },
      () => new Float32Array(2 * REACH - 1)
    )
  }

  /** The frame a segment starts at. */
  private startOf(segment: number) {
    return Math.round((segment * this.sampleRate) / SEGMENTS_PER_SECOND)
  }

  /** The next frames, one array per channel. */
  push(planes: readonly Float32Array[]) {
    const frames = planes[0]?.length ?? 0
    if (!frames) return
    const first = this.frame
    const lastSegment = this.segmentOf(first + frames - 1)
    this.segments.ensure(lastSegment + 1)
    const { energy, frames: counts, peak } = this.segments
    for (let segment = this.segmentOf(first); segment <= lastSegment; segment++)
      counts[segment] +=
        Math.min(first + frames, this.startOf(segment + 1)) -
        Math.max(first, this.startOf(segment))
    this.segments.length = lastSegment + 1
    const [shelf, highPass] = this.filters
    for (let channel = 0; channel < this.channels; channel++) {
      const plane = planes[channel]
      const weight = this.weights[channel]
      const state = this.state[channel]
      let s1 = state[0]
      let s2 = state[1]
      let h1 = state[2]
      let h2 = state[3]
      let segment = this.segmentOf(first)
      let boundary = this.startOf(segment + 1) - first
      let sum = 0
      let high = peak[segment]
      for (let index = 0; index < frames; index++) {
        if (index === boundary) {
          energy[segment] += sum * weight
          peak[segment] = high
          segment++
          boundary = this.startOf(segment + 1) - first
          sum = 0
          high = peak[segment]
        }
        const x = plane[index]
        // Transposed direct form II, the shelf then the high-pass.
        const y = shelf.b0 * x + s1
        s1 = shelf.b1 * x - shelf.a1 * y + s2
        s2 = shelf.b2 * x - shelf.a2 * y
        const z = highPass.b0 * y + h1
        h1 = highPass.b1 * y - highPass.a1 * z + h2
        h2 = highPass.b2 * y - highPass.a2 * z
        sum += z * z
        const level = x < 0 ? -x : x
        if (level > high) high = level
      }
      energy[segment] += sum * weight
      peak[segment] = high
      state[0] = s1
      state[1] = s2
      state[2] = h1
      state[3] = h2
      this.truePeaks(channel, plane, first)
    }
    this.frame += frames
  }

  /**
   * The segment a frame falls in. Segments start at rounded frames, so at
   * a rate that is not a multiple of ten a frame can already be in the next.
   */
  private segmentOf(frame: number) {
    let segment = Math.floor((frame * SEGMENTS_PER_SECOND) / this.sampleRate)
    while (this.startOf(segment + 1) <= frame) segment++
    return segment
  }

  /**
   * The values between samples, each counted in the segment of the sample
   * before it. A point between frames n and n+1 needs frames n−5 to n+6,
   * so the last six points of a chunk wait for the next (or for `result`).
   */
  private truePeaks(channel: number, plane: Float32Array, first: number) {
    const { truePeak, peak } = this.segments
    const history = this.history[channel]
    const kept = history.length
    const joined = new Float32Array(kept + plane.length)
    joined.set(history)
    joined.set(plane, kept)
    // joined[i] is frame first - kept + i; points start between frames
    // (first - REACH) and (first - REACH + 1), the first not yet read.
    this.interpolate(
      joined,
      first - kept,
      REACH - 1,
      joined.length - REACH,
      truePeak,
      peak
    )
    history.set(joined.subarray(joined.length - kept))
  }

  /**
   * Points between joined[i] and joined[i+1] for i from `from` to `to`
   * (exclusive), with joined[0] at frame `origin`.
   */
  private interpolate(
    joined: Float32Array,
    origin: number,
    from: number,
    to: number,
    truePeak: Float32Array,
    peak: Float32Array
  ) {
    let segment = this.segmentOf(Math.max(0, origin + from))
    let boundary = this.startOf(segment + 1) - origin
    let high = Math.max(truePeak[segment], peak[segment])
    // A point is at most `spread` times the loudest sample it is made from:
    // where no sample near it is that loud, it cannot be the peak, and is
    // not worked out. `loud` is the last sample that is.
    const spread = this.spread
    const phases = this.phases
    let loud = -Infinity
    const scan = (index: number) => {
      loud = -Infinity
      for (let at = index - (REACH - 1); at <= index + REACH; at++)
        if (Math.abs(joined[at]) * spread > high) loud = at
    }
    scan(from)
    for (let index = from; index < to; index++) {
      if (index >= boundary) {
        truePeak[segment] = high
        segment++
        boundary = this.startOf(segment + 1) - origin
        high = Math.max(truePeak[segment], peak[segment])
        scan(index)
      } else if (
        index > from &&
        Math.abs(joined[index + REACH]) * spread > high
      )
        loud = index + REACH
      const base = index - (REACH - 1)
      if (loud < base) continue
      // The twelve samples are read once for every phase.
      const x0 = joined[base]
      const x1 = joined[base + 1]
      const x2 = joined[base + 2]
      const x3 = joined[base + 3]
      const x4 = joined[base + 4]
      const x5 = joined[base + 5]
      const x6 = joined[base + 6]
      const x7 = joined[base + 7]
      const x8 = joined[base + 8]
      const x9 = joined[base + 9]
      const x10 = joined[base + 10]
      const x11 = joined[base + 11]
      for (let phase = 0; phase < phases.length; phase++) {
        const t = phases[phase]
        let value =
          t[0] * x0 +
          t[1] * x1 +
          t[2] * x2 +
          t[3] * x3 +
          t[4] * x4 +
          t[5] * x5 +
          t[6] * x6 +
          t[7] * x7 +
          t[8] * x8 +
          t[9] * x9 +
          t[10] * x10 +
          t[11] * x11
        if (value < 0) value = -value
        if (value > high) high = value
      }
    }
    truePeak[segment] = high
  }

  /** All that was measured. */
  result(): LoudnessMap {
    if (this.finished) return this.finished
    // The points the last chunk left waiting, with silence after the end.
    if (this.frame > 0)
      for (let channel = 0; channel < this.channels; channel++) {
        const history = this.history[channel]
        const joined = new Float32Array(history.length + REACH)
        joined.set(history)
        const origin = this.frame - history.length
        // Only points before the last frame belong to the sound.
        this.interpolate(
          joined,
          origin,
          REACH - 1,
          history.length - 1,
          this.segments.truePeak,
          this.segments.peak
        )
      }
    const { length } = this.segments
    const truePeak = this.segments.truePeak.slice(0, length)
    const peak = this.segments.peak.slice(0, length)
    for (let index = 0; index < length; index++)
      truePeak[index] = Math.max(truePeak[index], peak[index])
    this.finished = {
      sampleRate: this.sampleRate,
      energy: this.segments.energy.slice(0, length),
      frames: this.segments.frames.slice(0, length),
      peak,
      truePeak,
    }
    return this.finished
  }
}

/** The segments of a map from `from` to `to` seconds (all of it when left out). */
function range(map: LoudnessMap, from = 0, to = Infinity) {
  const count = map.energy.length
  return {
    first: Math.max(0, Math.round(from * SEGMENTS_PER_SECOND)),
    end: Math.min(count, Math.round(to * SEGMENTS_PER_SECOND)),
  }
}

/** A full segment holds this many frames, give or take one. */
const fullOf = (map: LoudnessMap) => map.sampleRate / SEGMENTS_PER_SECOND - 1

/**
 * The mean squares of the windows of `size` segments, one segment apart,
 * that lie wholly inside the range and are made of whole segments.
 */
function windows(map: LoudnessMap, size: number, from?: number, to?: number) {
  const { first, end } = range(map, from, to)
  const full = fullOf(map)
  const found: number[] = []
  for (let start = first; start + size <= end; start++) {
    let energy = 0
    let frames = 0
    let whole = true
    for (let segment = start; segment < start + size; segment++) {
      if (map.frames[segment] < full) whole = false
      energy += map.energy[segment]
      frames += map.frames[segment]
    }
    if (whole) found.push(energy / frames)
  }
  return found
}

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/** Integrated loudness of blocks' mean squares, gated at −70 LUFS and 10 LU under. */
function gatedIntegrated(found: number[]) {
  const blocks = found.filter((power) => lufsOf(power) > ABSOLUTE_GATE)
  if (!blocks.length) return SILENT
  const relative = lufsOf(mean(blocks)) - 10
  const gated = blocks.filter((power) => lufsOf(power) > relative)
  return lufsOf(mean(gated))
}

/** Integrated loudness in LUFS, gated; SILENT when nothing passes the gates or it is under 400 ms. */
export const integrated = (map: LoudnessMap, from?: number, to?: number) =>
  gatedIntegrated(windows(map, 4, from, to))

/** Loudness range of 3 s windows' mean squares, gated at −70 LUFS and 20 LU under. */
function gatedRange(found: number[]) {
  const short = found.filter((power) => lufsOf(power) > ABSOLUTE_GATE)
  if (!short.length) return 0
  const relative = lufsOf(mean(short)) - 20
  const gated = short
    .filter((power) => lufsOf(power) > relative)
    .map(lufsOf)
    .sort((a, b) => a - b)
  const at = (fraction: number) =>
    gated[Math.min(gated.length - 1, Math.round((gated.length - 1) * fraction))]
  return at(0.95) - at(0.1)
}

/** Loudness range in LU (EBU Tech 3342); 0 when too little passes its gates. */
export const loudnessRange = (map: LoudnessMap, from?: number, to?: number) =>
  gatedRange(windows(map, 30, from, to))

/** The highest true peak and sample peak in a range, as levels. */
export function peaksIn(map: LoudnessMap, from?: number, to?: number) {
  const { first, end } = range(map, from, to)
  let truePeak = 0
  let peak = 0
  for (let segment = first; segment < end; segment++) {
    truePeak = Math.max(truePeak, map.truePeak[segment])
    peak = Math.max(peak, map.peak[segment])
  }
  return { truePeak, peak }
}

/**
 * Short-term loudness at the end of each segment, over the 3 s before it
 * (less at the start), for drawing; SILENT where nothing sounds.
 */
export function shortTerm(map: LoudnessMap): Float32Array {
  const count = map.energy.length
  const series = new Float32Array(count)
  let energy = 0
  let frames = 0
  for (let segment = 0; segment < count; segment++) {
    energy += map.energy[segment]
    frames += map.frames[segment]
    if (segment >= 30) {
      energy -= map.energy[segment - 30]
      frames -= map.frames[segment - 30]
    }
    series[segment] = lufsOf(Math.max(0, energy) / frames)
  }
  return series
}

/** The figures of a whole sound or a part, as the page shows them. */
export interface Loudness {
  /** LUFS, or SILENT. */
  integrated: number
  /** LU. */
  range: number
  /** dBTP and dBFS, or SILENT. */
  truePeak: number
  peak: number
}

export function loudnessOf(
  map: LoudnessMap,
  from?: number,
  to?: number
): Loudness {
  const peaks = peaksIn(map, from, to)
  return {
    integrated: integrated(map, from, to),
    range: loudnessRange(map, from, to),
    truePeak: decibels(peaks.truePeak),
    peak: decibels(peaks.peak),
  }
}

/**
 * The figures of several parts of a sound taken as one (the parts of the
 * source an edited selection plays): blocks and windows from each part,
 * gated together, and the highest peaks of all.
 */
export function loudnessOfParts(
  map: LoudnessMap,
  parts: readonly (readonly [number, number])[]
): Loudness {
  const blocks = parts.flatMap(([from, to]) => windows(map, 4, from, to))
  const short = parts.flatMap(([from, to]) => windows(map, 30, from, to))
  let truePeak = 0
  let peak = 0
  for (const [from, to] of parts) {
    const found = peaksIn(map, from, to)
    truePeak = Math.max(truePeak, found.truePeak)
    peak = Math.max(peak, found.peak)
  }
  return {
    integrated: gatedIntegrated(blocks),
    range: gatedRange(short),
    truePeak: decibels(truePeak),
    peak: decibels(peak),
  }
}
