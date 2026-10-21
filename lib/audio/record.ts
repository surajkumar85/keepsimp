/**
 * A recording, kept as it comes in: the samples the browser hands over
 * (32-bit floats, as the microphone's sound is in the page, so nothing is
 * lost), interleaved and let go of as blobs a second at a time, which a
 * browser may keep on disk; an hour of stereo is never held as samples.
 * A pause fades the sound out over a few milliseconds and the next sound in,
 * so the join does not click. The take becomes a WAV of floats.
 */

/** How long the fades at a pause are, in seconds. */
export const PAUSE_FADE = 0.005
/** How much sound is gathered before it is let go of as a blob, in seconds. */
export const BLOCK = 1

/** A WAV header for floats (with the fact chunk floats need), for `frames` frames. */
export function floatWavHeader(
  frames: number,
  sampleRate: number,
  channels: number
) {
  const data = frames * channels * 4
  const header = new Uint8Array(58)
  const view = new DataView(header.buffer)
  const ascii = (at: number, text: string) =>
    header.set(
      Array.from(text, (char) => char.charCodeAt(0)),
      at
    )
  ascii(0, "RIFF")
  view.setUint32(4, 50 + data, true)
  ascii(8, "WAVE")
  ascii(12, "fmt ")
  view.setUint32(16, 18, true)
  view.setUint16(20, 3, true) // IEEE floating point
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 4, true)
  view.setUint16(32, channels * 4, true)
  view.setUint16(34, 32, true)
  view.setUint16(36, 0, true)
  ascii(38, "fact")
  view.setUint32(42, 4, true)
  view.setUint32(46, frames, true)
  ascii(50, "data")
  view.setUint32(54, data, true)
  return header
}

/** The most frames a WAV of floats can say it holds (its sizes are 32 bits). */
export const mostFrames = (channels: number) =>
  Math.floor((0xffffffff - 50) / (channels * 4))

/** How loud some sound is: its peak and its RMS, in dBFS (−Infinity for silence). */
export function levelOf(planes: readonly Float32Array[]) {
  let peak = 0
  let sum = 0
  let count = 0
  for (const plane of planes)
    for (const value of plane) {
      const size = Math.abs(value)
      if (size > peak) peak = size
      sum += value * value
      count++
    }
  const db = (value: number) => (value > 0 ? 20 * Math.log10(value) : -Infinity)
  return { peak: db(peak), rms: db(count ? Math.sqrt(sum / count) : 0) }
}

/** A recording's file name, from when it started: no spaces, so every browser keeps it. */
export function recordingName(started: Date) {
  const two = (value: number) => String(value).padStart(2, "0")
  return `recording-${started.getFullYear()}-${two(started.getMonth() + 1)}-${two(started.getDate())}-${two(started.getHours())}${two(started.getMinutes())}${two(started.getSeconds())}.wav`
}

export class Take {
  private readonly fade: number
  private readonly block: number
  /** Interleaved frames not yet let go of; the last `fade` of them may still be faded out. */
  private pending: Float32Array
  private filled = 0
  /** Frames of fade-in still to give the next sound. */
  private fadingIn = 0
  private readonly parts: Blob[] = []
  /** Frames kept. */
  frames = 0

  constructor(
    readonly sampleRate: number,
    readonly channels: number,
    /** Called with each blob let go of, as it is (for a draft). */
    private readonly onPart?: (part: Blob) => void
  ) {
    this.fade = Math.max(1, Math.round(PAUSE_FADE * sampleRate))
    this.block = Math.max(this.fade * 2, Math.round(BLOCK * sampleRate))
    this.pending = new Float32Array((this.block + this.fade) * channels)
  }

  /** Seconds kept. */
  get seconds() {
    return this.frames / this.sampleRate
  }

  /** The next sound, one array per channel (a mono source is copied to every channel). */
  push(planes: readonly Float32Array[]) {
    const length = planes[0]?.length ?? 0
    const room = mostFrames(this.channels) - this.frames
    const count = Math.min(length, room)
    for (let index = 0; index < count; index++) {
      if (this.filled === this.pending.length / this.channels)
        this.letGo(this.block)
      const gain = this.fadingIn > 0 ? 1 - this.fadingIn-- / (this.fade + 1) : 1
      for (let channel = 0; channel < this.channels; channel++)
        this.pending[this.filled * this.channels + channel] =
          (planes[channel] ?? planes[0])[index] * gain
      this.filled++
    }
    this.frames += count
    return count === length
  }

  /** Stop taking sound for now: what came last fades out, what comes next fades in. */
  pause() {
    const from = Math.max(0, this.filled - this.fade)
    const span = this.filled - from
    for (let frame = from; frame < this.filled; frame++) {
      const gain = (this.filled - frame) / (span + 1)
      for (let channel = 0; channel < this.channels; channel++)
        this.pending[frame * this.channels + channel] *= gain
    }
    this.fadingIn = this.fade
  }

  /** Let go of the first `frames` frames held, as a blob. */
  private letGo(frames: number) {
    if (!frames) return
    const part = new Blob([
      this.pending.slice(0, frames * this.channels).buffer as ArrayBuffer,
    ])
    this.parts.push(part)
    this.onPart?.(part)
    this.pending.copyWithin(
      0,
      frames * this.channels,
      this.filled * this.channels
    )
    this.filled -= frames
  }

  /** The take as a WAV of floats; more can be pushed after, and it is made again. */
  wav() {
    this.letGo(this.filled)
    return new Blob(
      [
        floatWavHeader(this.frames, this.sampleRate, this.channels) as BlobPart,
        ...this.parts,
      ],
      { type: "audio/wav" }
    )
  }
}
