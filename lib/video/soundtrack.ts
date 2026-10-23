/**
 * A soundtrack: another file's sound put under a video, in place of its
 * own sound or mixed under it. Pure parts: the facts the plan needs, the
 * channels made to match, a queue that hands out exact runs of frames,
 * and the mix itself. The engine (`withSoundtrack` in
 * mediabunny-video.ts) reads the files and writes the result.
 */

/** What reading the soundtrack's file found. */
export interface TrackFacts {
  /** The page's own name for the file chosen, so another file is another result. */
  id: string
  name: string
  /** Seconds. */
  duration: number
  sampleRate: number
  channels: number
  codec: string | null
  decodable: boolean
}

export type TrackMode = "replace" | "mix"

/** The soundtrack as chosen on the page: how it is used, how loud, and whether it repeats. */
export interface Soundtrack {
  mode: TrackMode
  /** dB for the soundtrack against the video's own sound, when mixed (0 as it is, below 0 quieter). */
  volume: number
  /** Played again from its start until the video ends. */
  loop: boolean
}

export const defaultSoundtrack: Soundtrack = {
  mode: "replace",
  volume: -12,
  loop: true,
}

/** Volumes offered for a soundtrack under the video's own sound, in dB. */
export const TRACK_VOLUMES = [0, -6, -12, -18, -24] as const
export const QUIETEST_TRACK = -40

/** Seconds a soundtrack cut by the video's end fades out over. */
export const TRACK_TAIL = 1

/** Channels made to match: one copied to both, two averaged to one, more cut to those wanted. */
export function matchChannels(planes: Float32Array[], channels: number) {
  if (planes.length === channels) return planes
  if (planes.length === 1)
    return Array.from({ length: channels }, () => planes[0].slice())
  if (channels === 1) {
    const out = new Float32Array(planes[0].length)
    for (const plane of planes)
      for (let index = 0; index < out.length; index++)
        out[index] += plane[index] / planes.length
    return [out]
  }
  return Array.from(
    { length: channels },
    (_, channel) => planes[Math.min(channel, planes.length - 1)]
  )
}

/** Frames as they come, handed out in runs of the length asked for. */
export class FrameQueue {
  private readonly chunks: Float32Array[][] = []
  /** Frames of the first chunk already handed out. */
  private used = 0
  size = 0

  constructor(private readonly channels: number) {}

  push(planes: Float32Array[]) {
    if (!planes[0]?.length) return
    this.chunks.push(planes)
    this.size += planes[0].length
  }

  /** The next `frames` frames, made up with silence when fewer are held. */
  take(frames: number): Float32Array[] {
    const out = Array.from(
      { length: this.channels },
      () => new Float32Array(frames)
    )
    let at = 0
    while (at < frames && this.chunks.length) {
      const chunk = this.chunks[0]
      const count = Math.min(frames - at, chunk[0].length - this.used)
      for (let channel = 0; channel < this.channels; channel++)
        out[channel].set(
          chunk[channel].subarray(this.used, this.used + count),
          at
        )
      at += count
      this.used += count
      this.size -= count
      if (this.used === chunk[0].length) {
        this.chunks.shift()
        this.used = 0
      }
    }
    return out
  }
}

/** A decibel figure as a level. */
export const level = (db: number) => 10 ** (db / 20)

/**
 * The soundtrack's frames mixed with the video's own (when there is one to
 * keep), the soundtrack at its volume and faded out over `TRACK_TAIL` when
 * the video's end cuts it, from frame `start` of a result `total` frames
 * long. The arrays given are not changed.
 */
export function mixed(
  track: Float32Array[],
  own: Float32Array[] | null,
  {
    volume,
    start,
    total,
    rate,
    cutAtEnd,
  }: {
    volume: number
    start: number
    total: number
    rate: number
    /** Whether the soundtrack is still playing when the video ends. */
    cutAtEnd: boolean
  }
) {
  const gain = level(volume)
  const tail = Math.round(TRACK_TAIL * rate)
  return track.map((plane, channel) => {
    const out = new Float32Array(plane.length)
    for (let index = 0; index < plane.length; index++) {
      const left = total - (start + index)
      const fade = cutAtEnd && left < tail ? Math.max(0, left / tail) : 1
      out[index] = plane[index] * gain * fade + (own ? own[channel][index] : 0)
    }
    return out
  })
}

/** What the page says of a soundtrack. */
export function trackSaid(
  track: TrackFacts,
  soundtrack: Soundtrack,
  length: number,
  hasOwnSound: boolean
) {
  const repeats = soundtrack.loop && track.duration < length - 0.05
  const short = !soundtrack.loop && track.duration < length - 0.05
  const cut = track.duration > length + 0.05
  return [
    soundtrack.mode === "mix" && hasOwnSound
      ? `The sound of ${track.name} is mixed under the video's own${soundtrack.volume ? `, ${Math.abs(soundtrack.volume)} dB quieter` : ""}.`
      : `The sound is ${track.name}${hasOwnSound ? ", in place of the video's own" : ""}.`,
    repeats
      ? `It is ${track.duration.toFixed(1)} s long, so it plays again from its start until the video ends, fading out over ${TRACK_TAIL} s.`
      : short
        ? `It is ${track.duration.toFixed(1)} s long, so the rest is silent.`
        : cut
          ? `It fades out over ${TRACK_TAIL} s where the video ends.`
          : "",
  ]
    .filter(Boolean)
    .join(" ")
}
