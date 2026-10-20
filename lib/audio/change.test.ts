import { describe, expect, it } from "vitest"
import {
  Changer,
  changesKey,
  changesProblem,
  changesTime,
  defaultChanges,
  framesAfter,
  isUnchanged,
  ratioOf,
  type Changes,
} from "./change"
import { Resampler } from "./resample"
import { Stretcher } from "./stretch"

const RATE = 44100

const tone = (frequency: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / RATE)
  )

/** A tone's frequency, from its rising zero crossings in the middle half. */
function frequencyOf(plane: Float32Array) {
  const from = Math.floor(plane.length / 4)
  const to = Math.floor((plane.length * 3) / 4)
  const crossings: number[] = []
  for (let index = from + 1; index < to; index++)
    if (plane[index - 1] < 0 && plane[index] >= 0)
      crossings.push(index - plane[index] / (plane[index] - plane[index - 1]))
  return (
    ((crossings.length - 1) /
      (crossings[crossings.length - 1] - crossings[0])) *
    RATE
  )
}

const rms = (plane: Float32Array, from = 0, to = plane.length) => {
  let sum = 0
  for (let index = from; index < to; index++) sum += plane[index] * plane[index]
  return Math.sqrt(sum / (to - from))
}

/** A sound through a changer, in chunks of 1,000 frames. */
function changed(planes: Float32Array[], changes: Changes) {
  const changer = new Changer(changes, RATE, planes.length, planes[0].length)
  const parts: Float32Array[][] = []
  for (let at = 0; at < planes[0].length; at += 1000)
    parts.push(
      changer.process(planes.map((plane) => plane.slice(at, at + 1000)))
    )
  parts.push(changer.flush())
  return planes.map((_, channel) => {
    const out = new Float32Array(
      parts.reduce((sum, part) => sum + part[channel].length, 0)
    )
    let at = 0
    for (const part of parts) {
      out.set(part[channel], at)
      at += part[channel].length
    }
    return out
  })
}

const changes = (change: Partial<Changes>): Changes => ({
  ...defaultChanges,
  ...change,
})

describe("tempo, keeping the pitch", () => {
  it.each([0.5, 0.8, 1.25, 2])(
    "at %s times: the same note, exactly the length the tempo gives",
    (tempo) => {
      const input = tone(440, 2)
      const [out] = changed([input], changes({ tempo }))
      expect(out.length).toBe(framesAfter(input.length, changes({ tempo })))
      expect(frequencyOf(out)).toBeCloseTo(440, -0.5)
      // As loud as it was, away from the ends.
      expect(
        rms(out, Math.floor(out.length / 4), Math.floor(out.length / 2))
      ).toBeCloseTo(rms(input), 1)
    }
  )

  it("starts at full level, with no fade in", () => {
    const [out] = changed(
      [new Float32Array(RATE).fill(0.25)],
      changes({ tempo: 1.5 })
    )
    expect(out[0]).toBeCloseTo(0.25, 5)
    expect(out[100]).toBeCloseTo(0.25, 5)
  })
})

describe("pitch, keeping the length", () => {
  it("moves a note up an octave and down a fifth, as long as it was", () => {
    const input = tone(440, 2)
    const [up] = changed([input], changes({ pitch: 12 }))
    expect(up.length).toBe(input.length)
    expect(frequencyOf(up)).toBeCloseTo(880, -1)
    const [down] = changed([input], changes({ pitch: -7 }))
    expect(down.length).toBe(input.length)
    expect(frequencyOf(down)).toBeCloseTo(440 / ratioOf(7), -0.5)
  })

  it("does both at once", () => {
    const input = tone(440, 2)
    const [out] = changed([input], changes({ tempo: 1.5, pitch: 3 }))
    expect(out.length).toBe(framesAfter(input.length, changes({ tempo: 1.5 })))
    expect(frequencyOf(out)).toBeCloseTo(440 * ratioOf(3), -1)
  })
})

describe("tape speed", () => {
  it("plays faster and higher together, or slower and lower", () => {
    const input = tone(440, 2)
    const [fast] = changed([input], changes({ tempo: 2, keepPitch: false }))
    expect(fast.length).toBe(input.length / 2)
    expect(frequencyOf(fast)).toBeCloseTo(880, -0.5)
    const [slow] = changed(
      [input],
      changes({ tempo: 0.5, keepPitch: false, pitch: 5 })
    )
    expect(slow.length).toBe(input.length * 2)
    expect(frequencyOf(slow)).toBeCloseTo(220, -0.5)
  })

  it("leaves nothing over the new top: a tone over half the rate, sped up, is gone", () => {
    const resampler = new Resampler(1, 2)
    const out = [
      ...resampler.process([tone(15000, 1)])[0],
      ...resampler.flush()[0],
    ]
    expect(rms(Float32Array.from(out), 1000, 20000)).toBeLessThan(0.01)
  })
})

describe("channels", () => {
  const left = () => tone(440, 0.5, 0.5)
  const right = () => tone(660, 0.5, 0.25)

  it("swaps, keeps one side, and balances", () => {
    const [l, r] = changed([left(), right()], changes({ channels: "swap" }))
    expect(rms(l)).toBeCloseTo(rms(right()), 5)
    expect(rms(r)).toBeCloseTo(rms(left()), 5)
    const kept = changed([left(), right()], changes({ channels: "left" }))
    expect(kept[1]).toEqual(kept[0])
    const rightOnly = changed([left(), right()], changes({ channels: "right" }))
    expect(rms(rightOnly[0])).toBeCloseTo(rms(right()), 5)
    const balanced = changed([left(), right()], changes({ balance: 0.5 }))
    expect(rms(balanced[0])).toBeCloseTo(rms(left()) / 2, 5)
    expect(rms(balanced[1])).toBeCloseTo(rms(right()), 5)
    // A mono sound has no sides to change.
    const mono = changed([left()], changes({ channels: "swap", balance: 1 }))
    expect(mono[0]).toEqual(left())
  })

  it("karaoke cancels what is in the middle, keeping the bass and the sides", () => {
    const voice = tone(1000, 1, 0.4)
    const bass = tone(60, 1, 0.4)
    const guitar = tone(500, 1, 0.3)
    // Voice and bass in the middle, the guitar on the left only.
    const l = Float32Array.from(
      voice,
      (value, index) => value + bass[index] + guitar[index]
    )
    const r = Float32Array.from(voice, (value, index) => value + bass[index])
    const [outL] = changed([l, r], changes({ channels: "karaoke" }))
    // What is left: half the guitar, and most of the bass; the voice is gone.
    const voiceLeft = Float32Array.from(
      outL,
      (value, index) => value - guitar[index] / 2
    )
    expect(rms(voiceLeft, RATE / 2, RATE)).toBeGreaterThan(rms(bass) * 0.8)
    const highs = changed(
      [Float32Array.from(voice), Float32Array.from(voice)],
      changes({ channels: "karaoke" })
    )
    expect(rms(highs[0], RATE / 2, RATE)).toBeLessThan(rms(voice) * 0.05)
  })
})

describe("the setting", () => {
  it("knows what changes, refuses what is out of bounds, and names it", () => {
    expect(isUnchanged(defaultChanges)).toBe(true)
    expect(changesKey(defaultChanges)).toBe("same")
    expect(changesTime(changes({ pitch: 2 }))).toBe(true)
    expect(changesTime(changes({ pitch: 2, keepPitch: false }))).toBe(false)
    expect(isUnchanged(changes({ reverse: true }))).toBe(false)
    // On tape, the pitch follows the speed: the pitch asked does not matter.
    expect(
      changesKey(changes({ tempo: 1.5, pitch: 2, keepPitch: false }))
    ).toBe(changesKey(changes({ tempo: 1.5, pitch: 5, keepPitch: false })))
    expect(changesKey(changes({ pitch: 2 }))).not.toBe(
      changesKey(changes({ pitch: 3 }))
    )
    expect(changesProblem(defaultChanges)).toBeNull()
    expect(changesProblem(changes({ tempo: 3 }))).toBe(
      "Choose a speed from 0.5 to 2 times."
    )
    expect(changesProblem(changes({ pitch: 13 }))).toBe(
      "Choose a pitch of at most 12 semitones up or down."
    )
    expect(changesProblem(changes({ balance: 2 }))).toBe(
      "Choose a balance from left to right."
    )
  })

  it("makes up a frame or two of silence when the input is short of what it was said to be", () => {
    const changer = new Changer(
      changes({ keepPitch: false, balance: 0.5 }),
      RATE,
      2,
      1000
    )
    const out = changer.process([
      new Float32Array(500).fill(0.5),
      new Float32Array(500).fill(0.5),
    ])
    expect(out[0].length).toBe(500)
    const rest = changer.flush()
    expect(rest[0].length).toBe(500)
    expect(rest[1][499]).toBe(0)
  })

  it("streams the stretcher and resampler on their own, with nothing given", () => {
    const stretcher = new Stretcher(RATE, 1, 1.5)
    expect(stretcher.process([new Float32Array(10)])[0].length).toBe(0)
    expect(
      new Resampler(2, 1.5).process([new Float32Array(0), new Float32Array(0)])
    ).toHaveLength(2)
  })
})
