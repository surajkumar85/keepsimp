/**
 * Joining sounds one after another: straight on, with silence between, or
 * crossfaded (the end of one fading out as the next fades in, at equal
 * power, so the loudness does not dip). A crossfade is never longer than
 * half of either sound it joins. The joiner holds back only as much of a
 * sound's end as the crossfade after it needs, so files of any length are
 * joined without being held whole.
 */

export interface Joining {
  /** Seconds of silence between files. */
  gap: number
  /** Seconds the files overlap, crossfaded. */
  crossfade: number
}

export const straight: Joining = { gap: 0, crossfade: 0 }

/** The gaps and crossfades offered, in seconds; and the most of each. */
export const GAPS = [0.5, 1, 2] as const
export const CROSSFADES = [0.5, 1, 2, 4] as const
export const MOST_JOIN = 10

/** Why a joining cannot be used; null when it can. */
export function joiningProblem(joining: Joining): string | null {
  if (!(joining.gap >= 0 && joining.gap <= MOST_JOIN))
    return `Choose a gap of at most ${MOST_JOIN} seconds.`
  if (!(joining.crossfade >= 0 && joining.crossfade <= MOST_JOIN))
    return `Choose a crossfade of at most ${MOST_JOIN} seconds.`
  if (joining.gap > 0 && joining.crossfade > 0)
    return "Choose a gap or a crossfade, not both."
  return null
}

/** Each join, between file i − 1 and file i (the first is none), in seconds. */
export function joinsFor(
  lengths: readonly number[],
  joining: Joining
): Joining[] {
  return lengths.map((length, index) =>
    index === 0
      ? straight
      : {
          gap: joining.gap,
          crossfade: Math.min(
            joining.crossfade,
            lengths[index - 1] / 2,
            length / 2
          ),
        }
  )
}

/** Where each file starts in the joined sound, and how long it is, in seconds. */
export function startsOf(
  lengths: readonly number[],
  joins: readonly Joining[]
) {
  const starts: number[] = []
  let at = 0
  lengths.forEach((length, index) => {
    at += joins[index].gap - joins[index].crossfade
    starts.push(at)
    at += length
  })
  return { starts, length: at }
}

/** Frames, one array per channel, that grow as they come. */
class Frames {
  planes: Float32Array[]
  length = 0
  constructor(channels: number) {
    this.planes = Array.from({ length: channels }, () => new Float32Array(1024))
  }
  add(planes: readonly Float32Array[], from: number, to: number) {
    const count = to - from
    if (this.length + count > this.planes[0].length) {
      const size = Math.max(this.length + count, this.planes[0].length * 2)
      this.planes = this.planes.map((plane) => {
        const grown = new Float32Array(size)
        grown.set(plane.subarray(0, this.length))
        return grown
      })
    }
    this.planes.forEach((plane, channel) =>
      plane.set(planes[channel].subarray(from, to), this.length)
    )
    this.length += count
  }
  /** Take the first `count` frames out. */
  take(count: number) {
    const taken = this.planes.map((plane) => plane.slice(0, count))
    this.planes.forEach((plane) => plane.copyWithin(0, count, this.length))
    this.length -= count
    return taken
  }
}

/** Joins sounds pushed one after another, giving the joined frames to `emit` as they are ready. */
export class Joiner {
  private part = 0
  private readonly held: Frames
  /** The end of the last sound, fading out over the start of this one. */
  private fading: { tail: Float32Array[]; at: number } | null = null
  private readonly joins: { gap: number; crossfade: number }[]

  constructor(
    sampleRate: number,
    private readonly channels: number,
    joins: readonly Joining[],
    private readonly emit: (planes: Float32Array[]) => void
  ) {
    this.held = new Frames(channels)
    this.joins = joins.map((join) => ({
      gap: Math.round(join.gap * sampleRate),
      crossfade: Math.round(join.crossfade * sampleRate),
    }))
  }

  /** The next frames of the sound now being joined. */
  push(planes: readonly Float32Array[]) {
    const frames = planes[0]?.length ?? 0
    let from = 0
    if (this.fading) {
      const { tail } = this.fading
      const length = tail[0].length
      const count = Math.min(frames, length - this.fading.at)
      const mixed = tail.map((plane, channel) => {
        const out = new Float32Array(count)
        for (let index = 0; index < count; index++) {
          const progress = (this.fading!.at + index + 0.5) / length
          out[index] =
            plane[this.fading!.at + index] *
              Math.cos((progress * Math.PI) / 2) +
            planes[channel][index] * Math.sin((progress * Math.PI) / 2)
        }
        return out
      })
      this.fading.at += count
      if (this.fading.at >= length) this.fading = null
      this.hold(mixed, 0, count)
      from = count
    }
    this.hold(planes, from, frames)
  }

  /** The sound now being joined has ended; the next begins. */
  next() {
    const join = this.joins[this.part + 1]
    const tail = this.held.take(this.held.length)
    this.part++
    // Only a crossfade holds anything back.
    if (join && join.crossfade > 0) {
      this.fading = { tail, at: 0 }
      return
    }
    if (join && join.gap > 0)
      this.emit(
        Array.from({ length: this.channels }, () => new Float32Array(join.gap))
      )
  }

  /** The last sound has ended: everything still held. */
  finish() {
    if (this.fading) {
      // A crossfade into a sound shorter than itself: the rest fades out alone.
      const { tail, at } = this.fading
      const length = tail[0].length
      this.emit(
        tail.map((plane) =>
          Float32Array.from(
            plane.subarray(at),
            (value, index) =>
              value * Math.cos((((at + index + 0.5) / length) * Math.PI) / 2)
          )
        )
      )
      this.fading = null
    }
    if (this.held.length) this.emit(this.held.take(this.held.length))
  }

  /** Keep back what the crossfade after this sound needs; give out the rest. */
  private hold(planes: readonly Float32Array[], from: number, to: number) {
    if (to <= from) return
    this.held.add(planes, from, to)
    const keep = this.joins[this.part + 1]?.crossfade ?? 0
    if (this.held.length > keep)
      this.emit(this.held.take(this.held.length - keep))
  }
}
