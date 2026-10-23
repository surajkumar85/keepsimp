import { describe, expect, it } from "vitest"
import {
  FrameQueue,
  level,
  matchChannels,
  mixed,
  trackSaid,
  type TrackFacts,
} from "./soundtrack"

const facts: TrackFacts = {
  id: "track-1",
  name: "song.mp3",
  duration: 5,
  sampleRate: 44100,
  channels: 2,
  codec: "mp3",
  decodable: true,
}

describe("a soundtrack's channels", () => {
  it("are matched to the result's", () => {
    const mono = [Float32Array.of(1, 2)]
    const stereo = [Float32Array.of(1, 3), Float32Array.of(3, 5)]
    expect(matchChannels(stereo, 2)).toBe(stereo)
    expect(matchChannels(mono, 2)).toEqual([
      Float32Array.of(1, 2),
      Float32Array.of(1, 2),
    ])
    expect(matchChannels(stereo, 1)).toEqual([Float32Array.of(2, 4)])
    const four = [...stereo, ...stereo]
    expect(matchChannels(four, 3)).toEqual([stereo[0], stereo[1], stereo[0]])
    expect(matchChannels(stereo, 3)[2]).toBe(stereo[1])
  })
})

describe("the queue of frames", () => {
  it("hands out exact runs across what came in, and silence when short", () => {
    const queue = new FrameQueue(1)
    queue.push([Float32Array.of(1, 2, 3)])
    queue.push([new Float32Array(0)])
    queue.push([Float32Array.of(4, 5)])
    expect(queue.size).toBe(5)
    expect(queue.take(2)).toEqual([Float32Array.of(1, 2)])
    expect(queue.take(2)).toEqual([Float32Array.of(3, 4)])
    expect(queue.take(3)).toEqual([Float32Array.of(5, 0, 0)])
    expect(queue.size).toBe(0)
  })
})

describe("the mix", () => {
  it("puts the soundtrack at its volume over the video's own", () => {
    expect(level(-6)).toBeCloseTo(0.501, 3)
    const out = mixed([Float32Array.of(1, 1)], [Float32Array.of(0.5, 0.25)], {
      volume: -6,
      start: 0,
      total: 100,
      rate: 10,
      cutAtEnd: false,
    })
    expect(out[0][0]).toBeCloseTo(0.5 + level(-6), 6)
    expect(out[0][1]).toBeCloseTo(0.25 + level(-6), 6)
  })

  it("fades the soundtrack out where the video's end cuts it", () => {
    const run = [new Float32Array(10).fill(1)]
    const at = (cutAtEnd: boolean) =>
      mixed(run, null, { volume: 0, start: 90, total: 100, rate: 10, cutAtEnd })
    expect(Array.from(at(true)[0])).toEqual(
      [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((value) =>
        expect.closeTo(value, 6)
      )
    )
    expect(Array.from(at(false)[0])).toEqual(new Array(10).fill(1))
  })
})

describe("what the page says", () => {
  const replace = { mode: "replace" as const, volume: -12, loop: true }
  it("names the soundtrack and what is done with it", () => {
    expect(trackSaid(facts, replace, 12, true)).toBe(
      "The sound is song.mp3, in place of the video's own. It is 5.0 s long, so it plays again from its start until the video ends, fading out over 1 s."
    )
    expect(trackSaid(facts, { ...replace, loop: false }, 12, false)).toBe(
      "The sound is song.mp3. It is 5.0 s long, so the rest is silent."
    )
    expect(trackSaid(facts, { ...replace, mode: "mix" }, 3, true)).toBe(
      "The sound of song.mp3 is mixed under the video's own, 12 dB quieter. It fades out over 1 s where the video ends."
    )
    expect(
      trackSaid(facts, { ...replace, mode: "mix", volume: 0 }, 5, true)
    ).toBe("The sound of song.mp3 is mixed under the video's own.")
  })
})
