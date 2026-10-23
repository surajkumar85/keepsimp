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
  ) => OffscreenCanvas | HTMLCanvasElement
) {
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null
  return (sample: Mediabunny.VideoSample) => {
    if (speed !== 1) {
      sample.setTimestamp(sped(sample.timestamp, speed))
      sample.setDuration(sped(sample.duration, speed))
    }
    // Faded by the middle of the frame, so the first and last are not left whole.
    const gain = fadeGain(sample.timestamp + sample.duration / 2, length, fade)
    if (gain >= 1) return sample
    const width = sample.displayWidth
    const height = sample.displayHeight
    if (!canvas || canvas.width !== width || canvas.height !== height)
      canvas = canvasOf(width, height)
    const context = canvas.getContext("2d") as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    sample.draw(context, 0, 0, width, height)
    context.fillStyle = `rgba(0, 0, 0, ${Number((1 - gain).toFixed(3))})`
    context.fillRect(0, 0, width, height)
    // Mediabunny takes the frame's own time for a canvas.
    return canvas
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

/**
 * The sound's hook: each run of samples sped up or slowed down with its
 * pitch kept and faded, in order and without a gap. `kept` is the length
 * of what is kept, in seconds, before the speed: the run that reaches its
 * end lets out what the stretcher still holds, so the sound lasts as long
 * as the picture.
 */
export function shapeSound(
  AudioSample: typeof Mediabunny.AudioSample,
  speed: number,
  fade: Fade,
  kept: number
) {
  let changer: Changer | null = null
  let given = 0
  let done = false
  const length = sped(kept, speed)
  return (sample: Mediabunny.AudioSample) => {
    const rate = sample.sampleRate
    const channels = sample.numberOfChannels
    const from = sample.timestamp
    const last = from + sample.duration >= kept - 1 / rate
    if (done) {
      sample.close()
      return []
    }
    let planes: Float32Array[] = planesOf(sample)
    sample.close()
    let start = from
    if (speed !== 1) {
      changer ??= new Changer(
        { ...defaultChanges, tempo: speed },
        rate,
        channels,
        Math.round(kept * rate)
      )
      planes = changer.process(planes)
      if (last) {
        const tail = changer.flush()
        planes = planes.map((plane, channel) => {
          const out = new Float32Array(plane.length + tail[channel].length)
          out.set(plane)
          out.set(tail[channel], plane.length)
          return out
        })
        done = true
      }
      start = given / rate
    }
    const frames = planes[0].length
    given += frames
    if (!frames) return []
    const data = new Float32Array(frames * channels)
    planes.forEach((plane, channel) => data.set(plane, channel * frames))
    if (fade.in > 0 || fade.out > 0)
      for (let index = 0; index < frames; index++) {
        const gain = fadeGain(start + index / rate, length, fade)
        if (gain >= 1) continue
        for (let channel = 0; channel < channels; channel++)
          data[channel * frames + index] *= gain
      }
    return [
      new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: start,
      }),
    ]
  }
}
