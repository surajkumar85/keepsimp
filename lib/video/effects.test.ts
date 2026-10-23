// @vitest-environment node
import { describe, expect, it } from "vitest"
import { AudioSample, VideoSample } from "mediabunny"
import { fadeGain, shapePicture, shapeSound, sped } from "./effects"

const frame = (timestamp: number, duration = 0.1) =>
  new VideoSample(new Uint8Array(4 * 4), {
    format: "RGBX",
    codedWidth: 2,
    codedHeight: 2,
    timestamp,
    duration,
  })

/** A frame that records how it is drawn, for the fades. */
function drawn(timestamp: number) {
  const calls: unknown[] = []
  const sample = {
    timestamp,
    duration: 0.1,
    displayWidth: 4,
    displayHeight: 2,
    setTimestamp(value: number) {
      sample.timestamp = value
    },
    setDuration(value: number) {
      sample.duration = value
    },
    draw: (...args: unknown[]) => calls.push(["draw", ...args.slice(1)]),
  }
  return { sample, calls }
}

function canvases() {
  const made: { width: number; height: number; fills: string[] }[] = []
  const canvasOf = (width: number, height: number) => {
    const canvas = {
      width,
      height,
      fills: [] as string[],
      getContext: () => ({
        set fillStyle(value: string) {
          canvas.fills.push(value)
        },
        fillRect: () => undefined,
      }),
    }
    made.push(canvas)
    return canvas as unknown as OffscreenCanvas
  }
  return { made, canvasOf }
}

describe("fades", () => {
  it("rise from nothing at the start and fall to nothing at the end", () => {
    const fade = { in: 1, out: 2 }
    expect(fadeGain(0, 10, fade)).toBe(0)
    expect(fadeGain(0.5, 10, fade)).toBe(0.5)
    expect(fadeGain(5, 10, fade)).toBe(1)
    expect(fadeGain(9, 10, fade)).toBe(0.5)
    expect(fadeGain(10.5, 10, fade)).toBe(0)
    expect(fadeGain(3, 10, { in: 0, out: 0 })).toBe(1)
    expect(sped(6, 2)).toBe(3)
  })
})

describe("the picture", () => {
  it("is moved to its time at the new speed, and left whole outside a fade", () => {
    const hook = shapePicture(2, { in: 0, out: 0 }, 3, () => {
      throw new Error("No canvas is needed.")
    })
    const moved = hook(frame(4, 0.1)) as VideoSample
    expect(moved.timestamp).toBe(2)
    expect(moved.duration).toBe(0.05)
  })

  it("is drawn over with black in a fade, by the middle of the frame", () => {
    const { made, canvasOf } = canvases()
    const hook = shapePicture(1, { in: 1, out: 1 }, 10, canvasOf)
    const first = drawn(0)
    expect(hook(first.sample as never)).toBe(made[0])
    expect(first.calls).toEqual([["draw", 0, 0, 4, 2]])
    expect(made[0].fills).toEqual(["rgba(0, 0, 0, 0.95)"])
    // Untouched in the middle: the frame itself.
    const middle = drawn(5)
    expect(hook(middle.sample as never)).toBe(middle.sample)
    // The canvas is kept for frames of the same size.
    hook(drawn(9.5).sample as never)
    expect(made).toHaveLength(1)
    expect(made[0].fills[1]).toBe("rgba(0, 0, 0, 0.55)")
  })
})

const RATE = 8000
/** A tenth of a second of a tone, on the clock of what is kept. */
const tenth = (timestamp: number, channels = 2) =>
  new AudioSample({
    data: new Float32Array((RATE / 10) * channels).map((_, index) =>
      Math.sin((index * 2 * Math.PI * 440) / RATE)
    ),
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: RATE,
    timestamp,
  })

describe("the sound", () => {
  it("is sped up end to end, to exactly the length the speed gives", () => {
    const hook = shapeSound(AudioSample, 2, { in: 0, out: 0 }, 1)
    const out = Array.from({ length: 10 }, (_, index) =>
      hook(tenth(index / 10))
    ).flat()
    let at = 0
    for (const sample of out) {
      expect(sample.timestamp).toBeCloseTo(at, 9)
      at += sample.numberOfFrames / RATE
    }
    expect(out.reduce((sum, one) => sum + one.numberOfFrames, 0)).toBe(RATE / 2)
    // Anything after the end is let go.
    expect(hook(tenth(1))).toEqual([])
  })

  it("gives nothing for a run the stretcher holds on to", () => {
    const hook = shapeSound(AudioSample, 2, { in: 0, out: 0 }, 1)
    const short = new AudioSample({
      data: new Float32Array(8),
      format: "f32-planar",
      numberOfChannels: 1,
      sampleRate: RATE,
      timestamp: 0,
    })
    expect(hook(short)).toEqual([])
  })

  it("is slowed down too", () => {
    const hook = shapeSound(AudioSample, 0.5, { in: 0, out: 0 }, 0.5)
    const out = Array.from({ length: 5 }, (_, index) =>
      hook(tenth(index / 10, 1))
    ).flat()
    expect(out.reduce((sum, one) => sum + one.numberOfFrames, 0)).toBe(RATE)
  })

  it("fades in and out at its own speed, keeping its times", () => {
    const hook = shapeSound(AudioSample, 1, { in: 0.1, out: 0.1 }, 0.3)
    const [first] = hook(tenth(0, 1))
    const [middle] = hook(tenth(0.1, 1))
    const [last] = hook(tenth(0.2, 1))
    const of = (sample: AudioSample) => {
      const values = new Float32Array(sample.numberOfFrames)
      sample.copyTo(values, { planeIndex: 0, format: "f32-planar" })
      return values
    }
    const tone = (index: number) => Math.sin((index * 2 * Math.PI * 440) / RATE)
    expect(first.timestamp).toBe(0)
    expect(of(first)[0]).toBe(0)
    expect(of(first)[400]).toBeCloseTo(tone(400) * 0.5, 6)
    expect(middle.timestamp).toBe(0.1)
    expect(of(middle)[400]).toBeCloseTo(tone(400), 6)
    expect(of(last)[400]).toBeCloseTo(tone(400) * 0.5, 6)
  })
})
