/**
 * The equaliser: a high-pass for rumble, a low-pass, a bass shelf, a mid
 * bell and a treble shelf, each a biquad made by the formulas of Robert
 * Bristow-Johnson's "Audio EQ Cookbook", run on every channel as the sound
 * streams. Presets are KeepSimp's own choices.
 */

/** A biquad's coefficients, normalised so a0 is 1. */
export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export interface Tone {
  /** Cut below this many Hz (12 dB an octave); null for none. */
  highPass: number | null
  /** Cut above this many Hz; null for none. */
  lowPass: number | null
  /** In dB, from −12 to 12: a shelf under 120 Hz, a bell at 1 kHz, a shelf over 8 kHz. */
  bass: number
  mid: number
  treble: number
}

export const BASS_HZ = 120
export const MID_HZ = 1000
export const TREBLE_HZ = 8000
/** The most a band is raised or lowered, in dB. */
export const MOST_BAND = 12

export const flatTone: Tone = {
  highPass: null,
  lowPass: null,
  bass: 0,
  mid: 0,
  treble: 0,
}

export type TonePreset = "flat" | "voice" | "bass" | "telephone" | "rumble"

export const TONE_PRESETS: Record<
  TonePreset,
  { label: string; tone: Tone; says: string }
> = {
  flat: {
    label: "Flat",
    tone: flatTone,
    says: "The sound's own balance, unchanged.",
  },
  voice: {
    label: "Voice clarity",
    tone: { highPass: 80, lowPass: null, bass: -2, mid: 2, treble: 3 },
    says: "Rumble under 80 Hz cut, a little less boom, a little more presence and air.",
  },
  bass: {
    label: "More bass",
    tone: { highPass: null, lowPass: null, bass: 6, mid: 0, treble: 0 },
    says: "6 dB more under 120 Hz.",
  },
  rumble: {
    label: "Cut rumble",
    tone: { highPass: 80, lowPass: null, bass: 0, mid: 0, treble: 0 },
    says: "Everything under 80 Hz cut: wind, handling noise, traffic.",
  },
  telephone: {
    label: "Telephone",
    tone: { highPass: 300, lowPass: 3400, bass: 0, mid: 3, treble: 0 },
    says: "Only 300 Hz to 3.4 kHz, as a phone line carries.",
  },
}

/** The preset a tone is, or null for one of the person's own. */
export function presetOf(tone: Tone): TonePreset | null {
  for (const [name, preset] of Object.entries(TONE_PRESETS))
    if (sameTone(preset.tone, tone)) return name as TonePreset
  return null
}

const sameTone = (a: Tone, b: Tone) =>
  a.highPass === b.highPass &&
  a.lowPass === b.lowPass &&
  a.bass === b.bass &&
  a.mid === b.mid &&
  a.treble === b.treble

/** Whether a tone changes anything. */
export const isFlat = (tone: Tone) => sameTone(tone, flatTone)

/** Why a tone cannot be used; null when it can. */
export function toneProblem(tone: Tone): string | null {
  for (const band of [tone.bass, tone.mid, tone.treble])
    if (!(Math.abs(band) <= MOST_BAND))
      return `Choose a change of at most ${MOST_BAND} dB for each band.`
  if (tone.highPass !== null && !(tone.highPass >= 20 && tone.highPass <= 1000))
    return "Choose a high-pass from 20 Hz to 1 kHz."
  if (tone.lowPass !== null && !(tone.lowPass >= 1000 && tone.lowPass <= 20000))
    return "Choose a low-pass from 1 to 20 kHz."
  return null
}

const SLOPE = Math.SQRT1_2

/** A filter by the cookbook, at a sample rate. */
export function cookbook(
  kind: "highpass" | "lowpass" | "lowshelf" | "highshelf" | "peaking",
  rate: number,
  frequency: number,
  gainDb = 0,
  q = SLOPE
): Biquad {
  const w0 = (2 * Math.PI * Math.min(frequency, rate * 0.49)) / rate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * q)
  const a = 10 ** (gainDb / 40)
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
  switch (kind) {
    case "highpass":
      b0 = (1 + cos) / 2
      b1 = -(1 + cos)
      b2 = (1 + cos) / 2
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case "lowpass":
      b0 = (1 - cos) / 2
      b1 = 1 - cos
      b2 = (1 - cos) / 2
      a0 = 1 + alpha
      a1 = -2 * cos
      a2 = 1 - alpha
      break
    case "peaking":
      b0 = 1 + alpha * a
      b1 = -2 * cos
      b2 = 1 - alpha * a
      a0 = 1 + alpha / a
      a1 = -2 * cos
      a2 = 1 - alpha / a
      break
    case "lowshelf": {
      const root = 2 * Math.sqrt(a) * alpha
      b0 = a * (a + 1 - (a - 1) * cos + root)
      b1 = 2 * a * (a - 1 - (a + 1) * cos)
      b2 = a * (a + 1 - (a - 1) * cos - root)
      a0 = a + 1 + (a - 1) * cos + root
      a1 = -2 * (a - 1 + (a + 1) * cos)
      a2 = a + 1 + (a - 1) * cos - root
      break
    }
    case "highshelf": {
      const root = 2 * Math.sqrt(a) * alpha
      b0 = a * (a + 1 + (a - 1) * cos + root)
      b1 = -2 * a * (a - 1 + (a + 1) * cos)
      b2 = a * (a + 1 + (a - 1) * cos - root)
      a0 = a + 1 - (a - 1) * cos + root
      a1 = 2 * (a - 1 - (a + 1) * cos)
      a2 = a + 1 - (a - 1) * cos - root
      break
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/** The filters a tone needs at a rate, in order. */
export function filtersOf(tone: Tone, rate: number): Biquad[] {
  const filters: Biquad[] = []
  if (tone.highPass !== null)
    filters.push(cookbook("highpass", rate, tone.highPass))
  if (tone.lowPass !== null && tone.lowPass < rate / 2)
    filters.push(cookbook("lowpass", rate, tone.lowPass))
  if (tone.bass) filters.push(cookbook("lowshelf", rate, BASS_HZ, tone.bass))
  if (tone.mid) filters.push(cookbook("peaking", rate, MID_HZ, tone.mid, 0.8))
  if (tone.treble)
    filters.push(cookbook("highshelf", rate, TREBLE_HZ, tone.treble))
  return filters
}

/** How a chain of filters changes a frequency, in dB. */
export function responseAt(filters: Biquad[], rate: number, frequency: number) {
  const w = (2 * Math.PI * frequency) / rate
  let db = 0
  for (const { b0, b1, b2, a1, a2 } of filters) {
    // |H(e^jw)| from the numerator and denominator at e^-jw.
    const re = (c0: number, c1: number, c2: number) =>
      c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w)
    const im = (c1: number, c2: number) =>
      -(c1 * Math.sin(w) + c2 * Math.sin(2 * w))
    const top = Math.hypot(re(b0, b1, b2), im(b1, b2))
    const bottom = Math.hypot(re(1, a1, a2), im(a1, a2))
    db += 20 * Math.log10(top / bottom)
  }
  return db
}

/** The equaliser running on a sound, one channel's state per filter. */
export class Equaliser {
  private readonly filters: Biquad[]
  private readonly state: Float64Array[]

  constructor(tone: Tone, rate: number, channels: number) {
    this.filters = filtersOf(tone, rate)
    this.state = Array.from(
      { length: channels },
      () => new Float64Array(this.filters.length * 2)
    )
  }

  /** Filter the next frames in place, one array per channel. */
  process(planes: Float32Array[]) {
    for (let channel = 0; channel < planes.length; channel++) {
      const plane = planes[channel]
      const state = this.state[channel]
      this.filters.forEach(({ b0, b1, b2, a1, a2 }, index) => {
        let s1 = state[index * 2]
        let s2 = state[index * 2 + 1]
        for (let at = 0; at < plane.length; at++) {
          const x = plane[at]
          const y = b0 * x + s1
          s1 = b1 * x - a1 * y + s2
          s2 = b2 * x - a2 * y
          plane[at] = y
        }
        state[index * 2] = s1
        state[index * 2 + 1] = s2
      })
    }
  }
}
