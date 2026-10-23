/**
 * The audio editor's settings in groups, and each group in a few words, for
 * the settings card: a folded group still says what will be done. The
 * equaliser, the compressor and repair share one setting (`sound`), so a
 * group is read and put back by its own parts rather than by whole keys.
 */
import { line } from "@/lib/settings-groups"
import { COMPRESSORS } from "./dynamics"
import { writtenFormats, type OutputFormat } from "./formats"
import { rateLabel } from "./labels"
import { dbLabel } from "./level"
import {
  PRESET_BITRATES,
  type AudioSettings,
  type Lossy,
  type Preset,
} from "./settings"
import { presetOf, TONE_PRESETS } from "./tone"

export type AudioGroup =
  | "format"
  | "quality"
  | "depth"
  | "level"
  | "changes"
  | "repair"
  | "tone"
  | "output"
  | "limit"

/** The groups in the order the card shows them. */
export const AUDIO_GROUPS: readonly AudioGroup[] = [
  "format",
  "quality",
  "depth",
  "level",
  "changes",
  "repair",
  "tone",
  "output",
  "limit",
]

const MB = 1024 * 1024

/** The lossy codec a format is written with; null for lossless and the file's own. */
export function lossyOf(format: OutputFormat): Lossy | null {
  return format === "mp3"
    ? "mp3"
    : format === "m4a" || format === "m4r"
      ? "aac"
      : format === "opus"
        ? "opus"
        : null
}

/** The groups shown for these settings: quality for lossy formats, bit depth for the others. */
export function shownGroups(settings: AudioSettings): AudioGroup[] {
  const lossy = lossyOf(settings.format) !== null
  return AUDIO_GROUPS.filter((group) =>
    group === "quality" ? lossy : group === "depth" ? !lossy : true
  )
}

/** What a group is made of, to be compared. */
function partsOf(group: AudioGroup, settings: AudioSettings): unknown {
  switch (group) {
    case "format":
      return settings.format
    case "quality":
      return [settings.preset, settings.bitrate]
    case "depth":
      return settings.depth
    case "level":
      return settings.level
    case "changes":
      return settings.changes
    case "repair":
      return settings.sound.repair
    case "tone":
      return [settings.sound.tone, settings.sound.compressor]
    case "output":
      return [settings.sampleRate, settings.channels, settings.keepTags]
    case "limit":
      return settings.targetBytes
  }
}

/** Whether a group differs from the usual. */
export function audioChanged(
  group: AudioGroup,
  settings: AudioSettings,
  usual: AudioSettings
): boolean {
  return (
    JSON.stringify(partsOf(group, settings)) !==
    JSON.stringify(partsOf(group, usual))
  )
}

/** The groups shown that differ from the usual, in their order. */
export function audioChangedGroups(
  settings: AudioSettings,
  usual: AudioSettings
): AudioGroup[] {
  return shownGroups(settings).filter((group) =>
    audioChanged(group, settings, usual)
  )
}

/** The change that puts a group back to the usual, leaving the rest. */
export function audioReset(
  group: AudioGroup,
  settings: AudioSettings,
  usual: AudioSettings
): Partial<AudioSettings> {
  switch (group) {
    case "format":
      return { format: usual.format }
    case "quality":
      return { preset: usual.preset, bitrate: usual.bitrate }
    case "depth":
      return { depth: usual.depth }
    case "level":
      return { level: usual.level }
    case "changes":
      return { changes: usual.changes }
    case "repair":
      return { sound: { ...settings.sound, repair: usual.sound.repair } }
    case "tone":
      return {
        sound: {
          ...settings.sound,
          tone: usual.sound.tone,
          compressor: usual.sound.compressor,
        },
      }
    case "output":
      return {
        sampleRate: usual.sampleRate,
        channels: usual.channels,
        keepTags: usual.keepTags,
      }
    case "limit":
      return { targetBytes: usual.targetBytes }
  }
}

const PRESETS: Record<Exclude<Preset, "custom">, string> = {
  small: "Small",
  balanced: "Balanced",
  high: "High",
}

const CHANNELS: Record<AudioSettings["changes"]["channels"], string> = {
  same: "",
  swap: "left and right swapped",
  left: "left only",
  right: "right only",
  karaoke: "karaoke",
}

/** A figure as the fields show it, or a word for one still being typed. */
const figure = (value: number) =>
  Number.isFinite(value) ? dbLabel(value) : "?"

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** How loud the results are to be, in a line. */
function levelLine(level: AudioSettings["level"]) {
  const ceiling = `peaks under ${figure(level.ceiling)} dBTP`
  if (level.mode === "loudness")
    return line(`Normalized to ${figure(level.target)} LUFS`, ceiling)
  if (level.mode === "peak")
    return `Peaks normalized to ${figure(level.ceiling)} dBTP`
  if (level.mode === "louder")
    return line(`${figure(level.louder)} dB louder`, ceiling)
  return "As it is"
}

/** What a group of the audio settings is, in a line. */
export function audioSummary(
  group: AudioGroup,
  settings: AudioSettings
): string {
  switch (group) {
    case "format":
      return settings.format === "same"
        ? "Same as the file"
        : writtenFormats[settings.format].label
    case "quality": {
      const codec = lossyOf(settings.format)
      if (settings.preset === "custom" || !codec)
        return `${settings.bitrate} kbit/s`
      return `${PRESETS[settings.preset]} · ${PRESET_BITRATES[codec][settings.preset][0]} kbit/s`
    }
    case "depth":
      return settings.depth === "same"
        ? "Same as the file"
        : settings.depth === 32
          ? "32-bit float"
          : `${settings.depth}-bit`
    case "level":
      return levelLine(settings.level)
    case "changes": {
      const changes = settings.changes
      const balance = Math.round(changes.balance * 100)
      return line(
        changes.tempo === 1
          ? "Normal speed"
          : `${Number.isFinite(changes.tempo) ? changes.tempo.toLocaleString("en", { maximumFractionDigits: 2 }) : "?"}× speed`,
        !changes.keepPitch
          ? "pitch follows"
          : changes.pitch !== 0 &&
              `pitch ${changes.pitch > 0 ? "+" : "−"}${Math.abs(changes.pitch)}`,
        CHANNELS[changes.channels],
        balance !== 0 &&
          (balance < 0
            ? `balance left ${-balance}%`
            : `balance right ${balance}%`),
        changes.reverse && "backwards"
      )
    }
    case "repair": {
      const repair = settings.sound.repair
      const said = line(
        repair.denoise > 0 && `noise ${Math.round(repair.denoise * 100)}%`,
        repair.hum > 0 && `${repair.hum} Hz hum`,
        repair.declick && "clicks",
        repair.deess !== "off" && `harsh “s” ${repair.deess}`
      )
      return said ? capital(said) : "Off"
    }
    case "tone": {
      const named = presetOf(settings.sound.tone)
      const compressor = settings.sound.compressor
      return line(
        named ? `${TONE_PRESETS[named].label} tone` : "Custom tone",
        compressor === "off"
          ? "no compressor"
          : `${COMPRESSORS[compressor].label.toLowerCase()} compressor`
      )
    }
    case "output":
      return line(
        settings.sampleRate === "same"
          ? "Same rate"
          : rateLabel(settings.sampleRate),
        settings.channels === "same"
          ? "same channels"
          : settings.channels === 1
            ? "mono"
            : "stereo",
        settings.keepTags ? "tags kept" : "no tags"
      )
    case "limit":
      return settings.targetBytes === null
        ? "No limit"
        : `Under ${+(settings.targetBytes / MB).toFixed(2)} MB`
  }
}
