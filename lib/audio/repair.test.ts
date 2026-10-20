import { describe, expect, it } from "vitest"
import {
  Declicker,
  Deesser,
  Denoiser,
  Hum,
  isUnrepaired,
  noRepair,
  notch,
  repairKey,
  repairProblem,
  repairStages,
  RNNOISE_DELAY,
  SIBILANCE,
  through,
  type Rnnoise,
} from "./repair"
import { responseAt } from "./tone"

const RATE = 44100

const tone = (
  frequency: number,
  seconds: number,
  amplitude: number,
  rate = RATE
) =>
  Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / rate)
  )
const add = (...planes: Float32Array[]) =>
  Float32Array.from(planes[0], (_, index) =>
    planes.reduce((sum, plane) => sum + plane[index], 0)
  )
/** A tone's level in a sound, by correlating with it (its own phase too). */
const levelOf = (
  plane: Float32Array,
  frequency: number,
  rate = RATE,
  from = 0
) => {
  let re = 0
  let im = 0
  for (let index = from; index < plane.length; index++) {
    const w = (2 * Math.PI * frequency * index) / rate
    re += plane[index] * Math.cos(w)
    im += plane[index] * Math.sin(w)
  }
  return (2 * Math.hypot(re, im)) / (plane.length - from)
}

/** Planes through a stage in chunks, and the rest at the end. */
function stream(
  stage: {
    process(p: Float32Array[]): Float32Array[]
    flush(): Float32Array[]
  },
  planes: Float32Array[],
  size = 1000
) {
  const parts: Float32Array[][] = []
  for (let at = 0; at < planes[0].length; at += size)
    parts.push(stage.process(planes.map((plane) => plane.slice(at, at + size))))
  parts.push(stage.flush())
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

/** RNNoise's stand-in: 960 samples late and half as loud, as a real model is late. */
const fake: Rnnoise = {
  createDenoiseState() {
    const delay = new Float32Array(RNNOISE_DELAY)
    let at = 0
    return {
      processFrame(frame: Float32Array) {
        for (let index = 0; index < frame.length; index++) {
          const late = delay[at]
          delay[at] = frame[index]
          frame[index] = late * 0.5
          at = (at + 1) % RNNOISE_DELAY
        }
        return 1
      },
      destroy() {},
    }
  },
}

describe("Hum", () => {
  it("takes out 50 Hz and its harmonics and leaves a tone between", () => {
    const hum = add(tone(50, 2, 0.1), tone(100, 2, 0.05), tone(150, 2, 0.05))
    const music = tone(440, 2, 0.3)
    const [out] = stream(new Hum(50, RATE, 1), [add(hum, music)])
    expect(levelOf(out, 50, RATE, RATE)).toBeLessThan(0.1 * 0.03)
    expect(levelOf(out, 150, RATE, RATE)).toBeLessThan(0.05 * 0.03)
    expect(levelOf(out, 440, RATE, RATE)).toBeCloseTo(0.3, 2)
    // Narrow: 10 Hz off a notch is hardly touched.
    expect(responseAt([notch(RATE, 450, 150)], RATE, 450)).toBeLessThan(-40)
    expect(responseAt([notch(RATE, 450, 150)], RATE, 440)).toBeGreaterThan(-0.2)
  })
})

describe("Declicker", () => {
  it("draws over clicks and leaves the rest sample for sample", () => {
    const clean = tone(440, 1, 0.3)
    const clicked = clean.slice()
    const at = [4410, 9000, 20000, 30001]
    for (const where of at) clicked[where] += 0.6
    const declicker = new Declicker(RATE, 1)
    const [out] = stream(declicker, [clicked], 777)
    expect(out.length).toBe(clean.length)
    expect(declicker.repaired).toBe(at.length)
    let worst = 0
    for (let index = 0; index < out.length; index++)
      worst = Math.max(worst, Math.abs(out[index] - clean[index]))
    expect(worst).toBeLessThan(0.01)
    // Far from any click, nothing changed.
    expect(out.slice(12000, 18000)).toEqual(clean.slice(12000, 18000))
  })

  it("leaves a drum hit alone: longer than a click, and loud around", () => {
    const drum = new Float32Array(RATE)
    for (let index = 0; index < 2000; index++)
      drum[10000 + index] = Math.exp(-index / 300) * Math.sin(index * 0.9)
    const declicker = new Declicker(RATE, 1)
    const [out] = stream(declicker, [drum.slice()])
    expect(declicker.repaired).toBe(0)
    expect(out).toEqual(drum)
    // Clicks at the very start and the very end are drawn over too.
    const late = tone(440, 0.1, 0.3)
    late[late.length - 6] += 0.7
    late[2] += 0.7
    const end = new Declicker(RATE, 1)
    stream(end, [late], 100000)
    expect(end.repaired).toBe(2)
    // One on the last sample has nothing after it to draw to: left.
    const last = tone(440, 0.1, 0.3)
    last[last.length - 2] += 0.7
    const edge = new Declicker(RATE, 1)
    stream(edge, [last], 100000)
    expect(edge.repaired).toBe(0)
  })
})

describe("Deesser", () => {
  it("turns down harsh highs and not the voice under them", () => {
    const voice = tone(300, 1, 0.3)
    const hiss = tone(7000, 1, 0.3)
    for (let index = 0; index < hiss.length; index++)
      if (index < RATE / 2) hiss[index] = 0
    const deesser = new Deesser(SIBILANCE.gentle, RATE, 1)
    const [out] = stream(deesser, [add(voice, hiss)])
    expect(levelOf(out.slice(0, RATE / 2), 300)).toBeCloseTo(0.3, 2)
    expect(levelOf(out.slice(RATE * 0.6), 7000)).toBeLessThan(0.3 * 0.6)
    expect(deesser.most).toBeLessThan(-4)
    expect(deesser.flush()[0].length).toBe(0)
  })
})

describe("Denoiser", () => {
  it("takes off RNNoise's delay exactly and mixes by strength, at 48 kHz", () => {
    const input = tone(440, 1, 0.3, 48000)
    const [full] = stream(new Denoiser(fake, 48000, 1, 1), [input])
    expect(full.length).toBe(input.length)
    for (const index of [0, 100, 20000, 47999])
      expect(full[index]).toBeCloseTo(input[index] * 0.5, 5)
    const [half] = stream(new Denoiser(fake, 48000, 1, 0.5), [input])
    expect(half[30000]).toBeCloseTo(input[30000] * 0.75, 5)
  })

  it("at 44.1 kHz through 48, still aligned and as long as it was, in stereo", () => {
    const left = tone(440, 1, 0.3)
    const right = tone(660, 1, 0.2)
    const [l, r] = stream(new Denoiser(fake, RATE, 2, 1), [left, right], 4096)
    expect(l.length).toBe(left.length)
    expect(r.length).toBe(right.length)
    let worst = 0
    for (let index = 1000; index < l.length - 1000; index++)
      worst = Math.max(worst, Math.abs(l[index] - left[index] * 0.5))
    expect(worst).toBeLessThan(0.002)
    // A few frames only: as many come out.
    expect(
      stream(new Denoiser(fake, RATE, 1, 1), [
        Float32Array.of(0.1, 0.2, 0.3),
      ])[0]
    ).toHaveLength(3)
  })
})

describe("the setting and the stages", () => {
  it("knows when nothing is repaired, names it, and refuses a strength out of bounds", () => {
    expect(isUnrepaired(noRepair)).toBe(true)
    expect(repairKey(noRepair)).toBe("none")
    expect(repairKey({ ...noRepair, hum: 60 })).not.toBe("none")
    expect(repairProblem(noRepair)).toBeNull()
    expect(repairProblem({ ...noRepair, denoise: 2 })).toBe(
      "Choose how much noise to take away, from none to all."
    )
  })

  it("puts clicks, hum and noise before, and the de-esser after, and runs them in turn", () => {
    const { before, after } = repairStages(
      { denoise: 1, hum: 60, declick: true, deess: "strong" },
      48000,
      1,
      fake
    )
    expect(before.map((stage) => stage.constructor.name)).toEqual([
      "Declicker",
      "Hum",
      "Denoiser",
    ])
    expect(after).toHaveLength(1)
    // Without RNNoise loaded, no noise is taken away.
    expect(
      repairStages({ ...noRepair, denoise: 1 }, 48000, 1, null).before
    ).toEqual([])
    const input = tone(440, 0.5, 0.3, 48000)
    const first = through(before, [input.slice(0, 12000)], false)
    const rest = through(before, [input.slice(12000)], true)
    expect(first[0].length + rest[0].length).toBe(input.length)
  })
})
