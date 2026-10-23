/**
 * Speed and fades while encoding, as Mediabunny's per-sample hooks. They
 * see each frame and run of sound on the clock of what is kept (the trim's
 * start at 0, cut parts closed up) and put it on the result's clock: the
 * picture re-timed and faded from or to black, the sound changed by the
 * audio editor's own `Changer` (speed with its pitch kept) and faded with
 * it. Mediabunny's classes are handed in, so the same code runs in the
 * worker and in Node.
 */
import type * as Mediabunny from "mediabunny"
import { Changer, defaultChanges } from "@/lib/audio/change"
import { Limiter } from "@/lib/audio/limiter"
import { decibels } from "@/lib/audio/loudness"
import type { Fade } from "./settings"

/** How far up a fade is at a time of the result: 0 is black or silent, 1 untouched. */
export function fadeGain(time: number, length: number, fade: Fade) {
  let gain = 1
  if (fade.in > 0) gain = Math.min(gain, time / fade.in)
  if (fade.out > 0) gain = Math.min(gain, (length - time) / fade.out)
  return Math.max(0, Math.min(1, gain))
}

/** Where a time of what is kept lands in the result. */
export const sped = (time: number, speed: number) => time / speed

/**
 * The picture's hook: each frame moved to its time in the result and, in a
 * fade, drawn over with black. `length` is the result's in seconds;
 * `canvasOf` makes a canvas to draw on (an `OffscreenCanvas` in the
 * worker).
 */
export function shapePicture(
  speed: number,
  fade: Fade,
  length: number,
  canvasOf: (
    width: number,
    height: number
  ) => OffscreenCanvas | HTMLCanvasElement,
  /** Layers drawn over every frame: a logo always, text while it shows (seconds of the result). */
  layers: Layers | null = null
) {
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null
  return (sample: Mediabunny.VideoSample) => {
    if (speed !== 1) {
      sample.setTimestamp(sped(sample.timestamp, speed))
      sample.setDuration(sped(sample.duration, speed))
    }
    // Faded by the middle of the frame, so the first and last are not left whole.
    const middle = sample.timestamp + sample.duration / 2
    const gain = fadeGain(middle, length, fade)
    const text =
      layers?.caption &&
      middle >= (layers.caption.from ?? 0) &&
      middle < (layers.caption.until ?? Infinity)
        ? layers.caption.layer
        : null
    const logo = layers?.logo ?? null
    if (gain >= 1 && !text && !logo) return sample
    const width = sample.displayWidth
    const height = sample.displayHeight
    if (!canvas || canvas.width !== width || canvas.height !== height)
      canvas = canvasOf(width, height)
    const context = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    sample.draw(context, 0, 0, width, height)
    if (logo) context.drawImage(logo, 0, 0, width, height)
    if (text) context.drawImage(text, 0, 0, width, height)
    if (gain < 1) {
      context.fillStyle = `rgba(0, 0, 0, ${Number((1 - gain).toFixed(3))})`
      context.fillRect(0, 0, width, height)
    }
    // Mediabunny takes the frame's own time for a canvas.
    return canvas
  }
}

/**
 * The picture's hook for a crop: the frame (already turned) drawn whole,
 * then the rectangle drawn from that at the result's size. Mediabunny's own
 * crop draws a part of the frame straight from the decoder, which Safari
 * draws whole (squeezed into the size); a part of a canvas is drawn right
 * everywhere.
 */
export function cropPicture(
  VideoSample: typeof Mediabunny.VideoSample,
  crop: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
  canvasOf: (
    width: number,
    height: number
  ) => OffscreenCanvas | HTMLCanvasElement
) {
  let whole: OffscreenCanvas | HTMLCanvasElement | null = null
  const out = canvasOf(width, height)
  const drawn = out.getContext("2d") as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  return (sample: Mediabunny.VideoSample) => {
    const shownWidth = sample.displayWidth
    const shownHeight = sample.displayHeight
    if (!whole || whole.width !== shownWidth || whole.height !== shownHeight)
      whole = canvasOf(shownWidth, shownHeight)
    const context = whole.getContext("2d") as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    sample.draw(context, 0, 0, shownWidth, shownHeight)
    drawn.drawImage(
      whole as CanvasImageSource,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height
    )
    return new VideoSample(out as CanvasImageSource, {
      timestamp: sample.timestamp,
      duration: sample.duration,
    })
  }
}

/** A sample's channels, as floats. */
function planesOf(sample: Mediabunny.AudioSample) {
  return Array.from({ length: sample.numberOfChannels }, (_, plane) => {
    const values = new Float32Array(sample.numberOfFrames)
    sample.copyTo(values, { planeIndex: plane, format: "f32-planar" })
    return values
  })
}

/** Pictures the size of a frame, drawn over it: a logo, and text with the seconds it shows. */
export interface Layers {
  logo: CanvasImageSource | null
  caption: {
    layer: CanvasImageSource
    from: number | null
    until: number | null
  } | null
}

/** A gain for the sound, and the ceiling its true peaks are held under (a level), or none. */
export interface SoundGain {
  db: number
  ceiling: number | null
}

/** A sound hook, with how much its limiter took off (in dB, 0 when it did nothing). */
export type SoundHook = ((
  sample: Mediabunny.AudioSample
) => Mediabunny.AudioSample[]) & { limited: () => number }

/**
 * The sound's hook: each run of samples sped up or slowed down with its
 * pitch kept, faded, made louder or quieter and held under a ceiling by the
 * audio editor's true-peak limiter, in order and without a gap. `kept` is
 * the length of what is kept, in seconds, before the speed: the run that
 * reaches its end lets out what the stretcher and the limiter still hold,
 * so the sound lasts as long as the picture.
 */
export function shapeSound(
  AudioSample: typeof Mediabunny.AudioSample,
  speed: number,
  fade: Fade,
  kept: number,
  gain: SoundGain | null = null
): SoundHook {
  let changer: Changer | null = null
  let limiter: Limiter | null = null
  /** Frames out of the stretcher (where fades are judged) and out of the hook. */
  let made = 0
  let given = 0
  let origin: number | null = null
  let done = false
  const length = sped(kept, speed)
  const level = gain ? 10 ** (gain.db / 20) : 1
  const hook = (sample: Mediabunny.AudioSample) => {
    const rate = sample.sampleRate
    const channels = sample.numberOfChannels
    const from = sample.timestamp
    const last = from + sample.duration >= kept - 1 / rate
    if (done) {
      sample.close()
      return []
    }
    origin ??= speed !== 1 ? 0 : from
    let planes: Float32Array[] = planesOf(sample)
    sample.close()
    if (speed !== 1) {
      changer ??= new Changer(
        { ...defaultChanges, tempo: speed },
        rate,
        channels,
        Math.round(kept * rate)
      )
      planes = changer.process(planes)
      if (last) planes = joined([planes, changer.flush()])
    }
    // Fades on the result's clock, then the gain.
    const start = origin + made / rate
    made += planes[0].length
    if (level !== 1 || fade.in > 0 || fade.out > 0)
      // New arrays: what the stretcher gives may be its own.
      planes = planes.map((plane) =>
        plane.map(
          (value, index) =>
            value * fadeGain(start + index / rate, length, fade) * level
        )
      )
    if (gain?.ceiling) {
      limiter ??= new Limiter(rate, channels, gain.ceiling)
      planes = limiter.process(planes)
      if (last) planes = joined([planes, limiter.flush()])
    }
    if (last) done = true
    const frames = planes[0].length
    const at = origin + given / rate
    given += frames
    if (!frames) return []
    const data = new Float32Array(frames * channels)
    planes.forEach((plane, channel) => data.set(plane, channel * frames))
    return [
      new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: at,
      }),
    ]
  }
  return Object.assign(hook, {
    limited: () => (limiter ? -decibels(limiter.lowest) : 0),
  })
}

/** Runs of channels, end to end. */
function joined(runs: Float32Array[][]) {
  return runs[0].map((_, channel) => {
    const out = new Float32Array(
      runs.reduce((sum, run) => sum + run[channel].length, 0)
    )
    let at = 0
    for (const run of runs) {
      out.set(run[channel], at)
      at += run[channel].length
    }
    return out
  })
}
