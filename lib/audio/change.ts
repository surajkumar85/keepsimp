/**
 * Speed, pitch, direction and channels. Tempo (0.5 to 2 times) keeps the
 * pitch by WSOLA (`stretch.ts`); pitch (±12 semitones) keeps the length by
 * stretching by the pitch's ratio and then resampling by it
 * (`resample.ts`); "tape" speed resamples alone, so pitch follows speed.
 * The channels can be swapped, one side kept, balanced, or the middle of a
 * stereo mix cancelled ("karaoke", which keeps the bass). Reversing needs
 * the whole sound and is done where files are joined. The result is
 * always exactly the input's length over the tempo.
 */

import { Resampler } from "./resample"
import { Stretcher } from "./stretch"
import { cookbook, type Biquad } from "./tone"

export type ChannelChange = "same" | "swap" | "left" | "right" | "karaoke"

export interface Changes {
  /** How much faster: 0.5 to 2. */
  tempo: number
  /** Semitones up (or down, below 0), from −12 to 12; with `keepPitch` only. */
  pitch: number
  /** Keep the pitch when the tempo changes (otherwise, as a tape does, it follows). */
  keepPitch: boolean
  reverse: boolean
  channels: ChannelChange
  /** From −1 (left only) to 1 (right only). */
  balance: number
}

export const defaultChanges: Changes = {
  tempo: 1,
  pitch: 0,
  keepPitch: true,
  reverse: false,
  channels: "same",
  balance: 0,
}

export const TEMPOS = [0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2] as const
export const SLOWEST = 0.5
export const FASTEST = 2
export const MOST_PITCH = 12
/** Under this, karaoke keeps the middle of the mix, where the bass usually is. */
export const KARAOKE_BASS = 150

/** Whether time changes: tempo or pitch. */
export const changesTime = (changes: Changes) =>
  changes.tempo !== 1 || (changes.keepPitch && changes.pitch !== 0)

/** Whether nothing is changed at all. */
export const isUnchanged = (changes: Changes) =>
  !changesTime(changes) &&
  !changes.reverse &&
  changes.channels === "same" &&
  changes.balance === 0

/** Why these changes cannot be used; null when they can. */
export function changesProblem(changes: Changes): string | null {
  if (!(changes.tempo >= SLOWEST && changes.tempo <= FASTEST))
    return "Choose a speed from 0.5 to 2 times."
  if (!(Math.abs(changes.pitch) <= MOST_PITCH))
    return `Choose a pitch of at most ${MOST_PITCH} semitones up or down.`
  if (!(Math.abs(changes.balance) <= 1))
    return "Choose a balance from left to right."
  return null
}

/** Names what changes a result. */
export const changesKey = (changes: Changes) =>
  isUnchanged(changes)
    ? "same"
    : JSON.stringify([
        changes.tempo,
        changes.keepPitch ? changes.pitch : 0,
        changes.keepPitch,
        changes.reverse,
        changes.channels,
        changes.balance,
      ])

/** How many frames `frames` of input become. */
export const framesAfter = (frames: number, changes: Changes) =>
  Math.round(frames / changes.tempo)

/** The pitch ratio of semitones. */
export const ratioOf = (semitones: number) => 2 ** (semitones / 12)

/** Frames, one array per channel, put together. */
function joined(parts: Float32Array[][], channels: number) {
  return Array.from({ length: channels }, (_, channel) => {
    const length = parts.reduce((sum, part) => sum + part[channel].length, 0)
    const out = new Float32Array(length)
    let at = 0
    for (const part of parts) {
      out.set(part[channel], at)
      at += part[channel].length
    }
    return out
  })
}

/** A biquad's running state, for one channel. */
class Running {
  private s1 = 0
  private s2 = 0
  constructor(private readonly filter: Biquad) {}
  next(x: number) {
    const { b0, b1, b2, a1, a2 } = this.filter
    const y = b0 * x + this.s1
    this.s1 = b1 * x - a1 * y + this.s2
    this.s2 = b2 * x - a2 * y
    return y
  }
}

/** The changes running on a sound of `frames` frames (before them). */
export class Changer {
  private readonly stretcher: Stretcher | null
  private readonly resampler: Resampler | null
  private readonly target: number
  private given = 0
  private readonly bass: Running | null

  constructor(
    private readonly changes: Changes,
    sampleRate: number,
    private readonly channels: number,
    frames: number
  ) {
    this.target = framesAfter(frames, changes)
    if (changes.keepPitch) {
      const ratio = ratioOf(changes.pitch)
      const stretch = changes.tempo / ratio
      this.stretcher =
        Math.abs(stretch - 1) > 1e-9
          ? new Stretcher(sampleRate, channels, stretch)
          : null
      this.resampler =
        Math.abs(ratio - 1) > 1e-9 ? new Resampler(channels, ratio) : null
    } else {
      this.stretcher = null
      this.resampler =
        changes.tempo !== 1 ? new Resampler(channels, changes.tempo) : null
    }
    this.bass =
      changes.channels === "karaoke" && channels === 2
        ? new Running(cookbook("lowpass", sampleRate, KARAOKE_BASS))
        : null
  }

  /** The next frames (one array per channel, changed in place where they can be); those ready. */
  process(planes: Float32Array[]): Float32Array[] {
    this.mix(planes)
    let out = planes
    if (this.stretcher) out = this.stretcher.process(out)
    if (this.resampler) out = this.resampler.process(out)
    return this.give(out)
  }

  /** The input has ended: the rest, exactly to the length the tempo gives. */
  flush(): Float32Array[] {
    const parts: Float32Array[][] = []
    if (this.stretcher) {
      const tail = this.stretcher.flush()
      parts.push(this.resampler ? this.resampler.process(tail) : tail)
    }
    if (this.resampler) parts.push(this.resampler.flush())
    const rest = this.give(joined(parts, this.channels))
    // Short of the length by a frame or two: silence makes it up.
    const missing = this.target - this.given
    if (missing <= 0) return rest
    this.given += missing
    return rest.map((plane) => {
      const out = new Float32Array(plane.length + missing)
      out.set(plane)
      return out
    })
  }

  /** Never more than the length the tempo gives. */
  private give(planes: Float32Array[]) {
    const room = Math.max(0, this.target - this.given)
    const count = Math.min(room, planes[0].length)
    this.given += count
    return count === planes[0].length
      ? planes
      : planes.map((plane) => plane.slice(0, count))
  }

  /** The channels swapped, kept, balanced or their middle cancelled, in place. */
  private mix(planes: Float32Array[]) {
    const { channels: change, balance } = this.changes
    if (this.channels !== 2 || planes.length !== 2) return
    const [left, right] = planes
    const frames = left.length
    if (change === "swap") planes.reverse()
    else if (change === "left") right.set(left)
    else if (change === "right") left.set(right)
    else if (change === "karaoke") {
      for (let index = 0; index < frames; index++) {
        const side = (left[index] - right[index]) / 2
        const low = this.bass!.next((left[index] + right[index]) / 2)
        left[index] = side + low
        right[index] = -side + low
      }
    }
    if (balance !== 0) {
      const leftGain = Math.min(1, 1 - balance)
      const rightGain = Math.min(1, 1 + balance)
      for (let index = 0; index < frames; index++) {
        planes[0][index] *= leftGain
        planes[1][index] *= rightGain
      }
    }
  }
}
