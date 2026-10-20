/**
 * What a result is to be, and the plan for writing one file: the format,
 * the codec, whether the sound is copied as it is or encoded again, the
 * bitrate, the sample rate and the channels, with a sentence for every
 * choice the file or the format made instead of the person.
 */
import type { Container, OutputFormat, WrittenFormat } from "./formats"
import { writtenFormats } from "./formats"
import { defaultLevel, levelKey, levelProblem, type Level } from "./level"
import { bitrateForSize, fittedSaid } from "./target-size"

export type Preset = "small" | "balanced" | "high" | "custom"
export type Lossy = "mp3" | "aac" | "opus"

export interface AudioSettings {
  format: OutputFormat
  preset: Preset
  /** The bitrate chosen under Custom, in kbit/s (stereo). */
  bitrate: number
  /** Hz, or the file's own. */
  sampleRate: "same" | number
  channels: "same" | 1 | 2
  /** Bits per sample for WAV and FLAC (32 is floating point, WAV only), or the file's own. */
  depth: "same" | 16 | 24 | 32
  /** Keep the title, artist, album and cover art the file has. */
  keepTags: boolean
  /** Write lossy files no larger than this many bytes; null for no limit. */
  targetBytes: number | null
  /** How loud each result is to be. */
  level: Level
}

export const defaultSettings: AudioSettings = {
  format: "mp3",
  preset: "balanced",
  bitrate: 192,
  sampleRate: "same",
  channels: "same",
  depth: "same",
  keepTags: true,
  targetBytes: null,
  level: defaultLevel,
}

/** The bitrates (kbit/s) offered under Custom, per codec. */
export const BITRATES: Record<Lossy, readonly number[]> = {
  mp3: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  aac: [32, 48, 64, 96, 128, 160, 192, 256, 320],
  opus: [16, 24, 32, 48, 64, 96, 128, 160, 192, 256],
}

/** The bitrate of each preset for stereo, then mono, in kbit/s. KeepSimp's own choices. */
export const PRESET_BITRATES: Record<
  Lossy,
  Record<Exclude<Preset, "custom">, readonly [number, number]>
> = {
  mp3: { small: [96, 64], balanced: [192, 96], high: [320, 160] },
  aac: { small: [96, 64], balanced: [160, 96], high: [256, 128] },
  opus: { small: [48, 32], balanced: [96, 64], high: [160, 96] },
}

/** The sample rates each codec can be written at. */
export const RATES: Record<Lossy | "flac" | "pcm", readonly number[]> = {
  mp3: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000],
  aac: [
    8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 64000, 88200,
    96000,
  ],
  opus: [48000],
  flac: [
    8000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400,
    192000,
  ],
  pcm: [
    8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400,
    192000,
  ],
}

/** The sample rates offered, besides the file's own. */
export const RATE_CHOICES = [8000, 16000, 22050, 32000, 44100, 48000, 96000]

/** What is known of a file before it is written. */
export interface SourceFacts {
  container: Container
  /** Mediabunny's codec name: "aac", "mp3", "opus", "pcm-s16"…; null when there is no sound. */
  codec: string | null
  sampleRate: number
  channels: number
  /** Seconds. */
  duration: number
  hasVideo: boolean
}

/** How one file is to be written. */
export interface Plan {
  format: WrittenFormat
  /** The codec written, by Mediabunny's name. */
  codec: string
  /** The sound is copied as it is, not decoded and encoded again. */
  copy: boolean
  /** Bits per second; null for lossless and copied sound. */
  bitrate: number | null
  sampleRate: number
  channels: number
  /** What samples are handed to a lossless encoder; null to leave them. */
  sampleFormat: "s16" | "s32" | "f32" | null
  /** One sentence for each choice made for the person. */
  notes: string[]
}

/** Codecs whose sound can be kept as it is, and the format that holds it. */
const KEPT: Record<string, WrittenFormat> = {
  mp3: "mp3",
  aac: "m4a",
  opus: "opus",
  vorbis: "ogg",
  flac: "flac",
  "pcm-u8": "wav",
  "pcm-s16": "wav",
  "pcm-s24": "wav",
  "pcm-s32": "wav",
  "pcm-f32": "wav",
}

/** A codec's bits per sample when it says; null for lossy codecs. */
export function depthOf(codec: string | null): number | null {
  const found = /^pcm-[suf](\d+)/.exec(codec ?? "")
  return found ? Number(found[1]) : null
}

/** The allowed value nearest to the one wanted; the higher one on a tie. */
export function nearest(allowed: readonly number[], wanted: number) {
  return allowed.reduce((best, one) =>
    Math.abs(one - wanted) < Math.abs(best - wanted) ||
    (Math.abs(one - wanted) === Math.abs(best - wanted) && one > best)
      ? one
      : best
  )
}

const kHz = (rate: number) =>
  `${(rate / 1000).toLocaleString("en", { maximumFractionDigits: 3 })} kHz`

/** A lossy codec's bitrate for these settings and channels, in kbit/s. */
export function bitrateOf(
  codec: Lossy,
  settings: Pick<AudioSettings, "preset" | "bitrate">,
  channels: number
) {
  if (settings.preset === "custom") {
    const chosen = nearest(BITRATES[codec], settings.bitrate)
    return channels === 1
      ? nearest(BITRATES[codec], Math.max(chosen * 0.6, BITRATES[codec][0]))
      : chosen
  }
  const [stereo, mono] = PRESET_BITRATES[codec][settings.preset]
  return channels === 1 ? mono : stereo
}

/** The plan for writing one file with these settings. */
export function planFor(
  settings: AudioSettings,
  facts: SourceFacts,
  /** The sound was edited: it must be encoded again. `facts.duration` is then the edited length. */
  edited = false
): Plan {
  const notes: string[] = []
  let format: WrittenFormat
  let copy = false
  const sourceCodec = facts.codec ?? ""
  const kept = KEPT[sourceCodec]
  if (settings.format === "same") {
    if (kept) {
      format = kept
      const lossless = writtenFormats[kept].lossless
      const leveled = settings.level.mode !== "same"
      copy =
        !edited &&
        !leveled &&
        settings.sampleRate === "same" &&
        settings.channels === "same" &&
        (settings.depth === "same" || !lossless) &&
        (settings.targetBytes === null || lossless)
      if (!copy)
        notes.push(
          edited
            ? "The sound is encoded again in its own format, to make the edits."
            : leveled
              ? "The sound is encoded again in its own format, to change its loudness."
              : "The sound is encoded again in its own format, to meet what was chosen."
        )
    } else {
      format = "m4a"
      notes.push(
        `This file's sound (${sourceCodec || "of an unknown kind"}) cannot be kept as it is, so it is written as AAC in an M4A file.`
      )
    }
  } else format = settings.format
  if (format === "ogg" && !copy) {
    // Only Firefox can encode Vorbis; Opus plays wherever Vorbis does.
    format = "opus"
    notes.push(
      "Vorbis cannot be written here, so the sound is written as Opus, which plays wherever Vorbis does."
    )
  }

  const codec =
    copy && kept
      ? sourceCodec
      : format === "mp3"
        ? "mp3"
        : format === "m4a" || format === "m4r"
          ? "aac"
          : format === "opus"
            ? "opus"
            : format === "flac"
              ? "flac"
              : wavCodec(settings, facts)

  // Channels: lossy formats here are mono or stereo.
  const lossless = writtenFormats[format].lossless
  let channels =
    settings.channels === "same" ? facts.channels : settings.channels
  if (!copy && !lossless && channels > 2) {
    channels = 2
    notes.push(
      `The ${facts.channels} channels are mixed down to stereo: ${writtenFormats[format].label} is written in mono or stereo here.`
    )
  }

  // Sample rate: what the codec can hold, nearest to what was asked.
  const wantedRate =
    settings.sampleRate === "same" ? facts.sampleRate : settings.sampleRate
  let sampleRate = wantedRate
  if (!copy) {
    const allowed =
      codec === "mp3" || codec === "aac" || codec === "opus"
        ? RATES[codec]
        : codec === "flac"
          ? RATES.flac
          : RATES.pcm
    sampleRate = nearest(allowed, wantedRate)
    if (codec === "opus" && wantedRate !== 48000)
      notes.push("Opus is always written at 48 kHz.")
    else if (sampleRate !== wantedRate)
      notes.push(
        `${writtenFormats[format].label} cannot be written at ${kHz(wantedRate)}, so ${kHz(sampleRate)} is used.`
      )
  }

  let bitrate: number | null = null
  let sampleFormat: Plan["sampleFormat"] = null
  if (!copy && (codec === "mp3" || codec === "aac" || codec === "opus")) {
    let kbits = bitrateOf(codec, settings, channels)
    if (settings.targetBytes !== null) {
      const fit = bitrateForSize(
        settings.targetBytes,
        facts.duration,
        BITRATES[codec]
      )
      if (fit === null || fit < kbits) {
        kbits = fit ?? BITRATES[codec][0]
        notes.push(fittedSaid(settings.targetBytes, fit, BITRATES[codec][0]))
      }
    }
    // Below 32 kHz an MP3 is MPEG-2, which holds at most 160 kbit/s.
    if (codec === "mp3" && sampleRate < 32000 && kbits > 160) {
      kbits = 160
      notes.push(
        `At ${kHz(sampleRate)}, an MP3 holds at most 160 kbit/s, so it is written at that.`
      )
    }
    bitrate = kbits * 1000
  }
  if (settings.targetBytes !== null && lossless)
    notes.push(
      `${writtenFormats[format].label} keeps every sample, so it cannot be made to fit a size; choose MP3, M4A or Opus for that.`
    )
  if (!copy && codec === "flac") {
    const depth =
      settings.depth === "same" ? (depthOf(sourceCodec) ?? 16) : settings.depth
    sampleFormat = depth > 16 ? "s32" : "s16"
    if (settings.depth === 32)
      notes.push("FLAC holds at most 24 bits, so 24 are written.")
  }
  if (!copy && codec.startsWith("pcm-"))
    sampleFormat =
      codec === "pcm-f32" ? "f32" : codec === "pcm-s16" ? "s16" : "s32"

  if (format === "m4r" && facts.duration > 40)
    notes.push(
      "An iPhone ringtone can be at most 40 seconds long (an alert tone 30); this one is longer, so the iPhone will not offer it until it is trimmed."
    )
  if (facts.hasVideo)
    notes.push(
      copy
        ? "The sound is taken out of the video as it is, without being encoded again."
        : "The sound is taken out of the video; the picture is left behind."
    )
  return {
    format,
    codec,
    copy,
    bitrate,
    sampleRate,
    channels,
    sampleFormat,
    notes,
  }
}

/** The PCM codec a WAV is written with. */
function wavCodec(settings: AudioSettings, facts: SourceFacts) {
  const depth =
    settings.depth === "same" ? (depthOf(facts.codec) ?? 16) : settings.depth
  return depth >= 32 ? "pcm-f32" : depth > 16 ? "pcm-s24" : "pcm-s16"
}

/** Why these settings cannot be used; null when they can. */
export function settingsProblem(settings: AudioSettings): string | null {
  const level = levelProblem(settings.level)
  if (level) return level
  if (settings.targetBytes !== null && !(settings.targetBytes >= 16 * 1024))
    return "Choose a file size limit of at least 16 KB."
  if (
    settings.sampleRate !== "same" &&
    !(settings.sampleRate >= 8000 && settings.sampleRate <= 192000)
  )
    return "Choose a sample rate between 8 and 192 kHz."
  return null
}

/** Names the settings that change a result, so a result made with others is out of date. */
export const settingsKey = (settings: AudioSettings) =>
  JSON.stringify([
    settings.format,
    settings.preset,
    settings.preset === "custom" ? settings.bitrate : 0,
    settings.sampleRate,
    settings.channels,
    settings.depth,
    settings.keepTags,
    settings.targetBytes,
    levelKey(settings.level),
  ])
