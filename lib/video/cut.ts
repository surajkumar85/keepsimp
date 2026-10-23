/**
 * Cutting to the frame while encoding: Mediabunny's per-sample hook sees
 * each frame and run of sound on the output's clock (the trim's start at
 * 0). Frames in a cut part are dropped and the rest closed up; sound is
 * split exactly at each cut, with a short fade at every join so a cut never
 * clicks (the audio editor's `JOIN_FADE`). Mediabunny's classes are handed
 * in, so the same code runs in the worker and in Node.
 */
import type * as Mediabunny from "mediabunny"
import { JOIN_FADE } from "@/lib/audio/edits"
import { retime, type Part } from "./trim"

/** The picture's hook: a frame dropped when it falls in a cut part, else moved to its place. */
export function cutPicture(parts: Part[]) {
  const start = parts[0]?.start ?? 0
  return (sample: Mediabunny.VideoSample) => {
    const at = retime(sample.timestamp + start, parts)
    if (at === null) return null
    sample.setTimestamp(at)
    return sample
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

/** The sound's hook: each run of samples split at the cuts, the kept pieces moved to their places and faded at the joins. */
export function cutSound(
  AudioSample: typeof Mediabunny.AudioSample,
  parts: Part[],
  fade = JOIN_FADE
) {
  const start = parts[0]?.start ?? 0
  const end = parts.at(-1)?.end ?? 0
  return (sample: Mediabunny.AudioSample) => {
    const rate = sample.sampleRate
    const from = sample.timestamp + start
    const frames = sample.numberOfFrames
    const pieces: Mediabunny.AudioSample[] = []
    let planes: Float32Array[] | null = null
    for (const part of parts) {
      // The frames of this sample inside the part, in the sample's own count.
      const first = Math.max(0, Math.ceil((part.start - from) * rate - 1e-6))
      const last = Math.min(frames, Math.ceil((part.end - from) * rate - 1e-6))
      if (last <= first) continue
      planes ??= planesOf(sample)
      const length = last - first
      const data = new Float32Array(length * planes.length)
      planes.forEach((plane, channel) =>
        data.set(plane.subarray(first, last), channel * length)
      )
      // Fade where the part meets a cut, never at the file's own start or end.
      const ramp = Math.max(1, Math.round(fade * rate))
      for (let index = 0; index < length; index++) {
        const time = from + (first + index) / rate
        let gain = 1
        if (part.start > start)
          gain = Math.min(gain, ((time - part.start) * rate) / ramp)
        if (part.end < end)
          gain = Math.min(gain, ((part.end - time) * rate) / ramp)
        if (gain >= 1) continue
        const g = Math.max(0, gain)
        for (let channel = 0; channel < planes.length; channel++)
          data[channel * length + index] *= g
      }
      pieces.push(
        new AudioSample({
          data,
          format: "f32-planar",
          numberOfChannels: planes.length,
          sampleRate: rate,
          // Inside a part, so it always has a place.
          timestamp: retime(from + first / rate, parts)!,
        })
      )
    }
    sample.close()
    return pieces
  }
}
