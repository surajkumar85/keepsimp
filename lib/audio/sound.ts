/**
 * How a result's sound is shaped before its level: the equaliser, then the
 * compressor, together as one setting run on every pass (the measuring one
 * too, so a file is normalised as it will sound).
 */

import { Compressor, COMPRESSORS, type CompressorPreset } from "./dynamics"
import { Equaliser, flatTone, isFlat, toneProblem, type Tone } from "./tone"

export interface SoundSettings {
  tone: Tone
  compressor: CompressorPreset
}

export const defaultSound: SoundSettings = {
  tone: flatTone,
  compressor: "off",
}

/** Whether the sound is left as it is. */
export const isPlain = (sound: SoundSettings) =>
  isFlat(sound.tone) && sound.compressor === "off"

/** Why these settings cannot be used; null when they can. */
export const soundProblem = (sound: SoundSettings) => toneProblem(sound.tone)

/** Names what changes a result. */
export const soundKey = (sound: SoundSettings) =>
  isPlain(sound) ? "plain" : JSON.stringify([sound.tone, sound.compressor])

/** The equaliser and compressor running on a sound. */
export class SoundShaper {
  private readonly equaliser: Equaliser | null
  private readonly compressor: Compressor | null

  constructor(sound: SoundSettings, sampleRate: number, channels: number) {
    this.equaliser = isFlat(sound.tone)
      ? null
      : new Equaliser(sound.tone, sampleRate, channels)
    this.compressor =
      sound.compressor === "off"
        ? null
        : new Compressor(COMPRESSORS[sound.compressor], sampleRate)
  }

  /** The most the compressor turned the sound down, in dB (0 or less). */
  get compressed() {
    return this.compressor?.most ?? 0
  }

  /** Shape the next frames in place, one array per channel, and give them back. */
  process(planes: Float32Array[]) {
    this.equaliser?.process(planes)
    this.compressor?.process(planes)
    return planes
  }
}
