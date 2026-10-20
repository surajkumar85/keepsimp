/**
 * A compressor: above a threshold, the level rises by only 1/ratio of what
 * the sound does, with a soft knee. It follows the loudest channel (so a
 * stereo image never leans), its peak held and let fall over the release;
 * the sound is turned down over the attack and back up over the release, so
 * loud moments are lowered smoothly. It
 * gives nothing back by itself: a compressed sound is quieter, which the
 * loudness settings bring back up. Presets are KeepSimp's own choices.
 */

export type CompressorPreset = "off" | "gentle" | "voice" | "music"

export interface CompressorSettings {
  /** In dBFS. */
  threshold: number
  ratio: number
  /** In seconds. */
  attack: number
  release: number
  /** Width of the soft knee, in dB. */
  knee: number
}

export const COMPRESSORS: Record<
  Exclude<CompressorPreset, "off">,
  CompressorSettings & { label: string; says: string }
> = {
  gentle: {
    label: "Gentle",
    threshold: -18,
    ratio: 2,
    attack: 0.02,
    release: 0.25,
    knee: 6,
    says: "Evens out the loudest moments a little: 2:1 above −18 dBFS.",
  },
  voice: {
    label: "Voice",
    threshold: -24,
    ratio: 3,
    attack: 0.005,
    release: 0.15,
    knee: 6,
    says: "Keeps speech at one level, near and far from the microphone: 3:1 above −24 dBFS, quick to act.",
  },
  music: {
    label: "Music",
    threshold: -16,
    ratio: 2.5,
    attack: 0.025,
    release: 0.3,
    knee: 4,
    says: "Holds a mix together, letting drums through: 2.5:1 above −16 dBFS, slower to act.",
  },
}

/** How much a level (dBFS) is turned down, in dB (0 or less), by the curve. */
export function reductionAt(level: number, settings: CompressorSettings) {
  const { threshold, ratio, knee } = settings
  const over = level - threshold
  if (2 * over <= -knee) return 0
  const slope = 1 / ratio - 1
  if (2 * over < knee) return (slope * (over + knee / 2) ** 2) / (2 * knee)
  return slope * over
}

/** The compressor running on a sound. */
export class Compressor {
  /** The most it turned the sound down, in dB (0 or less). */
  most = 0
  /** The loudest channel's level, held and let fall over the release. */
  private peak = 0
  /** How much it turns the sound down now, in dB. */
  private reduction = 0
  private readonly attack: number
  private readonly release: number

  constructor(
    private readonly settings: CompressorSettings,
    sampleRate: number
  ) {
    this.attack = Math.exp(-1 / (settings.attack * sampleRate))
    this.release = Math.exp(-1 / (settings.release * sampleRate))
  }

  /** Compress the next frames in place, one array per channel. */
  process(planes: Float32Array[]) {
    const frames = planes[0]?.length ?? 0
    for (let at = 0; at < frames; at++) {
      let level = 0
      for (const plane of planes) {
        const value = plane[at] < 0 ? -plane[at] : plane[at]
        if (value > level) level = value
      }
      this.peak = Math.max(level, this.peak * this.release)
      const wanted =
        this.peak > 1e-6
          ? reductionAt(20 * Math.log10(this.peak), this.settings)
          : 0
      // Down over the attack, back up over the release.
      const coefficient = wanted < this.reduction ? this.attack : this.release
      this.reduction = coefficient * this.reduction + (1 - coefficient) * wanted
      if (this.reduction > -1e-4) continue
      if (this.reduction < this.most) this.most = this.reduction
      const gain = 10 ** (this.reduction / 20)
      for (const plane of planes) plane[at] *= gain
    }
  }
}
