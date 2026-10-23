// @vitest-environment node
import { describe, expect, it } from "vitest"
import { AudioSample, VideoSample } from "mediabunny"
import { cutPicture, cutSound } from "./cut"

const parts = [
  { start: 1, end: 2 },
  { start: 3, end: 4 },
]

const frame = (timestamp: number) =>
  new VideoSample(new Uint8Array(4 * 4), {
    format: "RGBX",
    codedWidth: 2,
    codedHeight: 2,
    timestamp,
    duration: 0.1,
  })

/** A second of sound at 1,000 samples a second, every sample 1, on the output's clock. */
const second = (timestamp: number, channels = 2) =>
  new AudioSample({
    data: new Float32Array(1000 * channels).fill(1),
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: 1000,
    timestamp,
  })

const values = (sample: AudioSample, plane = 0) => {
  const out = new Float32Array(sample.numberOfFrames)
  sample.copyTo(out, { planeIndex: plane, format: "f32-planar" })
  return out
}

describe("cutting the picture", () => {
  it("drops frames in a cut and closes the rest up", () => {
    const hook = cutPicture(parts)
    // The output's clock starts at the first part: 1 s in the file.
    expect(hook(frame(0.5))?.timestamp).toBe(0.5)
    expect(hook(frame(1.5))).toBeNull()
    expect(hook(frame(2.25))?.timestamp).toBe(1.25)
    expect(hook(frame(3.5))).toBeNull()
    expect(cutPicture([])(frame(0))).toBeNull()
  })
})

describe("cutting the sound", () => {
  it("keeps exactly the parts, end to end, and fades only at the joins", () => {
    const hook = cutSound(AudioSample, parts, 0.004)
    // Output 0..1 s is file 1..2 s: kept whole, its end fades into the cut.
    const [first] = hook(second(0))
    expect(first.timestamp).toBe(0)
    expect(first.numberOfFrames).toBe(1000)
    const firstValues = values(first)
    expect(firstValues[0]).toBe(1)
    expect(firstValues[995]).toBe(1)
    expect(firstValues[999]).toBeCloseTo(0.25)
    // Output 1..2 s is file 2..3 s: all cut.
    expect(hook(second(1))).toEqual([])
    // Output 2..3 s is file 3..4 s: kept, faded in from the cut, both channels.
    const [last] = hook(second(2))
    expect(last.timestamp).toBe(1)
    expect(values(last, 1)[0]).toBe(0)
    expect(values(last, 1)[2]).toBeCloseTo(0.5)
    expect(values(last, 1)[999]).toBe(1)
  })

  it("splits a run that straddles a cut", () => {
    const hook = cutSound(AudioSample, parts, 0.004)
    // File 1.5..2.5 s: the first half is kept, the second cut.
    const pieces = hook(second(0.5, 1))
    expect(pieces).toHaveLength(1)
    expect(pieces[0].numberOfFrames).toBe(500)
    expect(pieces[0].timestamp).toBe(0.5)
    // File 2.5..3.5 s: only the end, from 3 s.
    const later = hook(second(1.5, 1))
    expect(later[0].numberOfFrames).toBe(500)
    expect(later[0].timestamp).toBe(1)
    expect(cutSound(AudioSample, [])(second(0))).toEqual([])
    // File 1.5..3.5 s in one run: the end of one part and the start of the next.
    const across = new AudioSample({
      data: new Float32Array(2000).fill(1),
      format: "f32-planar",
      numberOfChannels: 1,
      sampleRate: 1000,
      timestamp: 0.5,
    })
    const both = cutSound(AudioSample, parts, 0.004)(across)
    expect(both.map((one) => [one.timestamp, one.numberOfFrames])).toEqual([
      [0.5, 500],
      [1, 500],
    ])
  })
})
