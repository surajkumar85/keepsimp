/**
 * How a result's sound is shaped before its level: repair (clicks, hum,
 * background noise), the equaliser, the compressor and the de-esser,
 * together as one setting run on every pass (the measuring one too, so a
 * file is normalised as it will sound).
 */

import { Compressor, COMPRESSORS, type CompressorPreset } from "./dynamics"
import {
  Declicker,
  Deesser,
  isUnrepaired,
  noRepair,
  repairKey,
  repairProblem,
  repairStages,
  through,
  type Repair,
  type Rnnoise,
} from "./repair"
import { Equaliser, flatTone, isFlat, toneProblem, type Tone } from "./tone"

export interface SoundSettings {
  tone: Tone
  compressor: CompressorPreset
  repair: Repair
}

export const defaultSound: SoundSettings = {
  tone: flatTone,
  compressor: "off",
  repair: noRepair,
}

/** Whether the sound is left as it is. */
export const isPlain = (sound: SoundSettings) =>
  isFlat(sound.tone) && sound.compressor === "off" && isUnrepaired(sound.repair)

/** Why these settings cannot be used; null when they can. */
export const soundProblem = (sound: SoundSettings) =>
  toneProblem(sound.tone) ?? repairProblem(sound.repair)

/** Names what changes a result. */
export const soundKey = (sound: SoundSettings) =>
  isPlain(sound)
    ? "plain"
    : JSON.stringify([sound.tone, sound.compressor, repairKey(sound.repair)])

/** Whether RNNoise must be loaded for these settings. */
export const needsRnnoise = (sound: SoundSettings) => sound.repair.denoise > 0

/**
 * The repair, equaliser, compressor and de-esser running on a sound. The
 * repair can hold frames back for a while, so the frames that come out of
 * a call are not always those that went in; by the last call, all have.
 */
export class SoundShaper {
  private readonly equaliser: Equaliser | null
  private readonly compressor: Compressor | null
  private readonly before: ReturnType<typeof repairStages>["before"]
  private readonly after: ReturnType<typeof repairStages>["after"]

  constructor(
    sound: SoundSettings,
    sampleRate: number,
    channels: number,
    rnnoise: Rnnoise | null = null
  ) {
    this.equaliser = isFlat(sound.tone)
      ? null
      : new Equaliser(sound.tone, sampleRate, channels)
    this.compressor =
      sound.compressor === "off"
        ? null
        : new Compressor(COMPRESSORS[sound.compressor], sampleRate)
    const stages = repairStages(sound.repair, sampleRate, channels, rnnoise)
    this.before = stages.before
    this.after = stages.after
  }

  /** Whether frames can be held back (so the last call must come). */
  get holds() {
    return this.before.length > 0
  }

  /** The most the compressor turned the sound down, in dB (0 or less). */
  get compressed() {
    return this.compressor?.most ?? 0
  }

  /** Clicks drawn over. */
  get clicks() {
    const declicker = this.before.find((stage) => stage instanceof Declicker)
    return declicker instanceof Declicker ? declicker.repaired : 0
  }

  /** The most the de-esser turned "s" sounds down, in dB (0 or less). */
  get deessed() {
    const deesser = this.after[0]
    return deesser instanceof Deesser ? deesser.most : 0
  }

  /** Shape the next frames, one array per channel; `last` when no more will come. */
  process(planes: Float32Array[], last = false) {
    const repaired = through(this.before, planes, last)
    this.equaliser?.process(repaired)
    this.compressor?.process(repaired)
    return through(this.after, repaired, last)
  }
}
