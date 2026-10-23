/**
 * Every choice made for a file, worked out in one place (`planFor`) and
 * said in words. The page shows the sentence; the worker follows the plan;
 * the check holds the result to it.
 */
import { fitToSize, MOST_PASSES } from "./target"
import {
  containerLabels,
  outputInfo,
  sameContainer,
  type Container,
  type OutContainer,
} from "./formats"

export type VideoCodec = "avc" | "hevc" | "vp8" | "vp9" | "av1"
export type SoundCodec = "aac" | "opus" | "vorbis"

export const videoCodecLabels: Record<VideoCodec, string> = {
  avc: "H.264",
  hevc: "HEVC",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
}

const soundLabels: Record<string, string> = {
  aac: "AAC",
  opus: "Opus",
  vorbis: "Vorbis",
  mp3: "MP3",
  flac: "FLAC",
  ac3: "AC-3",
  eac3: "E-AC-3",
  dts: "DTS",
}

/** A codec name for people, from Mediabunny's own name. */
export const soundLabel = (codec: string | null) =>
  codec === null
    ? "unknown"
    : (soundLabels[codec] ??
      (codec.startsWith("pcm") ? "PCM" : codec.toUpperCase()))

/** What each kind written here holds, as Mediabunny writes it and players play it. */
export const HOLDS: Record<
  OutContainer,
  { video: readonly VideoCodec[]; sound: readonly string[] }
> = {
  mp4: {
    video: ["avc", "hevc", "av1", "vp9"],
    sound: ["aac", "mp3", "opus", "flac", "ac3", "eac3"],
  },
  mov: {
    video: ["avc", "hevc"],
    sound: ["aac", "mp3", "pcm-s16", "pcm-s16be", "pcm-s24", "pcm-s24be"],
  },
  webm: { video: ["vp9", "av1", "vp8"], sound: ["opus", "vorbis"] },
  mkv: {
    video: ["avc", "hevc", "vp9", "av1", "vp8"],
    sound: [
      "aac",
      "mp3",
      "opus",
      "vorbis",
      "flac",
      "ac3",
      "eac3",
      "dts",
      "pcm-s16",
      "pcm-s24",
      "pcm-f32",
    ],
  },
}

/** Codecs to encode the picture with, best first for each kind. */
export const ENCODE_ORDER: Record<OutContainer, readonly VideoCodec[]> = {
  mp4: ["avc", "hevc", "av1", "vp9"],
  mov: ["avc", "hevc"],
  webm: ["vp9", "av1", "vp8"],
  mkv: ["avc", "hevc", "vp9", "av1", "vp8"],
}

/** Sound copied into an MP4 or MOV only when every player plays it there. */
const PLAYS_EVERYWHERE: Record<OutContainer, readonly string[]> = {
  mp4: ["aac", "mp3"],
  mov: HOLDS.mov.sound,
  webm: ["opus", "vorbis"],
  mkv: HOLDS.mkv.sound,
}

/** Pictures copied into a kind without being asked for: those its players all play. */
const PICTURE_PLAYS_EVERYWHERE: Record<OutContainer, readonly VideoCodec[]> = {
  mp4: ["avc", "hevc"],
  mov: ["avc", "hevc"],
  webm: HOLDS.webm.video,
  mkv: HOLDS.mkv.video,
}

/** Kinds that carry a turn or a mirror as a setting for players. */
const TURNS_AS_SETTING: readonly OutContainer[] = ["mp4", "mov"]

export type Quality = "original" | "high" | "balanced" | "small" | "custom"
export type ShortSide = 2160 | 1440 | 1080 | 720 | 480 | 360
export const SHORT_SIDES: readonly ShortSide[] = [
  2160, 1440, 1080, 720, 480, 360,
]
export type FrameRate = 60 | 50 | 30 | 25 | 24 | 15
export const FRAME_RATES: readonly FrameRate[] = [60, 50, 30, 25, 24, 15]
export type Turn = 0 | 90 | 180 | 270

export interface VideoSettings {
  format: "same" | OutContainer
  codec: "auto" | VideoCodec
  quality: Quality
  /** kbit/s for the picture, for "custom". */
  bitrate: number
  /** The shorter side at most, in pixels; never made larger. */
  size: "same" | ShortSide
  /** At most this many frames a second; never more than the file has. */
  frameRate: "same" | FrameRate
  rotate: Turn
  /** Mirrored left to right. */
  flip: boolean
  sound: "keep" | "convert" | "none"
  keepTags: boolean
  /** A size the file must fit under: bytes, or a share of the file's own size. */
  limit: Limit
}

export type Limit = null | { bytes: number } | { share: number }

/** Limits offered as chips, in MB (KeepSimp's own choice of common ones). */
export const LIMIT_SIZES = [8, 10, 25, 50, 100] as const
/** Shares of the file's own size offered as chips. */
export const LIMIT_SHARES = [0.5, 0.25] as const
export const MB = 1024 * 1024
/** A limit of one's own, in MB. */
export const LEAST_LIMIT = 0.25
export const MOST_LIMIT = 100_000

export const defaultSettings: VideoSettings = {
  format: "mp4",
  codec: "auto",
  quality: "original",
  bitrate: 4000,
  size: "same",
  frameRate: "same",
  rotate: 0,
  flip: false,
  sound: "keep",
  keepTags: true,
  limit: null,
}

export const LEAST_BITRATE = 100
export const MOST_BITRATE = 200_000

/** What reading a file found, as the plan needs it. */
export interface VideoFacts {
  container: Container
  /** Bytes. */
  size: number
  /** Seconds, the longest track. */
  duration: number
  video: {
    codec: VideoCodec | null
    /** As shown: after the file's own turn. */
    width: number
    height: number
    /** The file's own turn and mirror, which players apply. */
    rotation: Turn
    flip: boolean
    /** Frames a second, on average; null when unknown. */
    frameRate: number | null
    variableRate: boolean
    /** bit/s; null when unknown. */
    bitrate: number | null
    hdr: boolean
    decodable: boolean
  } | null
  audio: {
    codec: string | null
    sampleRate: number
    channels: number
    bitrate: number | null
    decodable: boolean
  } | null
}

/** Whether this browser can write a codec at a size: null while it is being asked. */
export type CanEncode = (
  codec: VideoCodec,
  width: number,
  height: number
) => boolean | null

export interface Plan {
  container: OutContainer
  video:
    | { action: "none" }
    | { action: "copy" }
    | {
        action: "encode"
        codec: VideoCodec
        width: number
        height: number
        /** null keeps the file's own timing. */
        frameRate: number | null
        /** bit/s. */
        bitrate: number
        /** Seconds between keyframes. */
        keyFrameInterval: number
        /** The size the file must fit under, in bytes; null with no limit. */
        target: number | null
      }
  /** Turn and mirror asked for, on top of the file's own. */
  rotate: Turn
  flip: boolean
  /** As shown, after every turn; 0 with no picture. */
  width: number
  height: number
  audio:
    | { action: "none" }
    | { action: "drop" }
    | { action: "copy" }
    | { action: "encode"; codec: SoundCodec; bitrate: number }
  keepTags: boolean
  /** What was chosen and why, in order. */
  notes: string[]
  /** Why it cannot be written as asked; null when it can. */
  problem: string | null
  /** Codecs and sizes still being asked of the browser. */
  pending: { codec: VideoCodec; width: number; height: number }[]
  /** Bytes, roughly. */
  estimate: number
}

/** Seconds between keyframes when the picture is encoded (Apple's HLS authoring guide). */
export const KEYFRAME_SECONDS = 2

/**
 * H.264 bitrates for "high" (kbit/s, up to 30 and over 30 frames a second),
 * by the shorter side: YouTube's recommended upload bitrates for SDR video.
 */
export const HIGH_BITRATES: readonly {
  side: number
  normal: number
  fast: number
}[] = [
  { side: 360, normal: 1000, fast: 1500 },
  { side: 480, normal: 2500, fast: 4000 },
  { side: 720, normal: 5000, fast: 7500 },
  { side: 1080, normal: 8000, fast: 12000 },
  { side: 1440, normal: 16000, fast: 24000 },
  { side: 2160, normal: 40000, fast: 60000 },
]

/** Share of "high" for the other presets: KeepSimp's own choice. */
export const PRESET_SHARE: Record<"high" | "balanced" | "small", number> = {
  high: 1,
  balanced: 0.5,
  small: 0.25,
}

/** Bits a codec needs for the same look as H.264 (Mediabunny's own estimates). */
export const CODEC_EFFICIENCY: Record<VideoCodec, number> = {
  avc: 1,
  vp8: 1.1,
  hevc: 0.6,
  vp9: 0.6,
  av1: 0.4,
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)

/** bit/s for H.264 at "high", for a picture of this size and rate. */
export function highBitrate(width: number, height: number, fps: number) {
  const pixels = width * height
  const fast = fps > 30
  const points = HIGH_BITRATES.map((row) => ({
    pixels: ((row.side * 16) / 9) * row.side,
    rate: fast ? row.fast : row.normal,
  }))
  if (pixels <= points[0].pixels)
    return Math.round(points[0].rate * (pixels / points[0].pixels) * 1000)
  for (let index = 1; index < points.length; index++) {
    const low = points[index - 1]
    const high = points[index]
    if (pixels <= high.pixels)
      return Math.round(
        (low.rate +
          ((pixels - low.pixels) / (high.pixels - low.pixels)) *
            (high.rate - low.rate)) *
          1000
      )
  }
  const last = points.at(-1)!
  return Math.round(last.rate * (pixels / last.pixels) * 1000)
}

/** The size as shown after the turn and the shorter-side limit. */
export function shownSize(
  video: NonNullable<VideoFacts["video"]>,
  settings: Pick<VideoSettings, "rotate" | "size">
) {
  let [width, height] =
    settings.rotate % 180 === 0
      ? [video.width, video.height]
      : [video.height, video.width]
  const short = Math.min(width, height)
  const scaled = settings.size !== "same" && short > settings.size
  if (scaled) {
    const ratio = (settings.size as number) / short
    width = even(width * ratio)
    height = even(height * ratio)
  }
  return { width, height, scaled }
}

const mbps = (bits: number) =>
  bits >= 1_000_000
    ? `${(bits / 1_000_000).toLocaleString("en", { maximumFractionDigits: 1 })} Mbit/s`
    : `${Math.round(bits / 1000).toLocaleString("en")} kbit/s`

/**
 * The sound's codec and bitrate when it is encoded for a kind. WebM and MKV get Opus: its own header says how much of its start to skip.
 * An AAC encoder's start can only be skipped by an MP4's edit list, so AAC
 * in MKV would play a few hundredths of a second late (measured: 21 ms for
 * FFmpeg's encoder, 44 ms for Apple's).
 */
function soundFor(container: OutContainer, channels: number) {
  return container === "webm" || container === "mkv"
    ? { codec: "opus" as const, bitrate: channels === 1 ? 64_000 : 128_000 }
    : { codec: "aac" as const, bitrate: channels === 1 ? 96_000 : 160_000 }
}

const sizeSaid = (bytes: number) =>
  bytes >= MB
    ? `${(bytes / MB).toLocaleString("en", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

/** The bytes a file must fit under, or null. */
export const targetOf = (limit: Limit, size: number) =>
  limit === null
    ? null
    : "bytes" in limit
      ? limit.bytes
      : Math.floor(size * limit.share)

/** Work out how a file is written. */
export function planFor(
  facts: VideoFacts,
  settings: VideoSettings,
  canEncode: CanEncode,
  canEncodeSound: (codec: SoundCodec) => boolean | null = () => true
): Plan {
  const container =
    settings.format === "same"
      ? sameContainer(facts.container)
      : settings.format
  const label = outputInfo[container].label
  const notes: string[] = []
  const soundNotes: string[] = []
  const pending: Plan["pending"] = []
  let problem: string | null = null
  const fail = (reason: string) => (problem ??= reason)
  const target = targetOf(settings.limit, facts.size)
  const totalBits = target ? (target * 8) / Math.max(facts.duration, 0.001) : 0

  if (settings.format === "same" && container !== facts.container)
    notes.push(
      `${containerLabels[facts.container]} is read here but not written, so it becomes an MP4.`
    )

  // The sound first: a size limit shares its bits between the two.
  let audio: Plan["audio"] = { action: "none" }
  let soundBits = 0
  const sound = facts.audio
  if (sound) {
    if (settings.sound === "none") {
      audio = { action: "drop" }
      soundNotes.push("The sound is left out.")
    } else {
      const copies =
        settings.sound === "keep" &&
        sound.codec !== null &&
        PLAYS_EVERYWHERE[container].includes(sound.codec) &&
        // Under a limit, sound that would take a fifth of it is converted smaller.
        (!target || (sound.bitrate ?? 128_000) <= totalBits * 0.2)
      if (copies) {
        audio = { action: "copy" }
        soundBits = sound.bitrate ?? 128_000
        soundNotes.push(
          `The sound (${soundLabel(sound.codec)}) is copied as it is.`
        )
      } else {
        let chosen: { codec: SoundCodec; bitrate: number } = soundFor(
          container,
          sound.channels
        )
        const can = canEncodeSound(chosen.codec)
        let late = false
        if (
          can === false &&
          chosen.codec === "opus" &&
          canEncodeSound("vorbis")
        )
          chosen = { codec: "vorbis", bitrate: chosen.bitrate }
        else if (can === false && container === "mkv") {
          chosen = soundFor("mp4", sound.channels)
          late = true
        } else if (can === false)
          fail(
            `This browser cannot write ${soundLabel(chosen.codec)} sound for ${label}. Choose another format, or leave the sound out.`
          )
        if (!sound.decodable)
          fail(
            `This browser cannot play this video's sound (${soundLabel(sound.codec)}), so it cannot be converted. Choose MKV, which keeps it as it is, or leave the sound out.`
          )
        const least = chosen.codec === "aac" ? 48_000 : 32_000
        // Never more than the file's own sound holds, to the next 8 kbit/s.
        const soundCapped =
          sound.bitrate !== null && sound.bitrate < chosen.bitrate
        if (soundCapped)
          chosen = {
            ...chosen,
            bitrate: Math.max(least, Math.ceil(sound.bitrate! / 8000) * 8000),
          }
        // Under a limit, a tenth of it at most, to the next 8 kbit/s below.
        const roomy = target ? Math.floor((totalBits * 0.1) / 8000) * 8000 : 0
        const squeezed =
          target !== null && chosen.bitrate > Math.max(least, roomy)
        if (squeezed) chosen = { ...chosen, bitrate: Math.max(least, roomy) }
        audio = { action: "encode", ...chosen }
        soundBits = chosen.bitrate
        soundNotes.push(
          `The sound is converted to ${soundLabel(chosen.codec)} at ${Math.round(chosen.bitrate / 1000)} kbit/s${squeezed ? ", to leave room for the picture" : soundCapped ? ", no more than the file holds" : ""}${settings.sound === "keep" && sound.codec && !PLAYS_EVERYWHERE[container].includes(sound.codec) ? `, as ${label} would not play ${soundLabel(sound.codec)} everywhere` : ""}.`
        )
        if (late)
          soundNotes.push(
            "This browser cannot write Opus, so the sound is AAC, which in MKV starts a few hundredths of a second late. Choose MP4 to keep it in step."
          )
      }
    }
  }

  // The picture.
  let video: Plan["video"] = { action: "none" }
  let width = 0
  let height = 0
  let videoBits = 0
  const source = facts.video
  if (source) {
    const shown = shownSize(source, settings)
    width = shown.width
    height = shown.height
    const sourceRate = source.frameRate ?? 30
    const slower =
      settings.frameRate !== "same" && settings.frameRate < sourceRate - 0.5
    const asked =
      settings.codec !== "auto" && settings.codec !== source.codec
        ? settings.codec
        : null
    const turns = settings.rotate !== 0 || settings.flip
    const ownTurn = source.rotation !== 0 || source.flip
    const turnsByRedrawing =
      (turns || ownTurn) && !TURNS_AS_SETTING.includes(container)
    const held =
      source.codec !== null && HOLDS[container].video.includes(source.codec)
    // A codec chosen on purpose is copied wherever the kind holds it.
    const plays =
      source.codec !== null &&
      (settings.codec === source.codec ||
        PICTURE_PLAYS_EVERYWHERE[container].includes(source.codec))
    // A file already under its limit needs nothing for it.
    const over = target !== null && facts.size > target
    const reasons = [
      settings.quality !== "original" && "the quality was chosen",
      over && `it is to fit under ${sizeSaid(target!)}`,
      shown.scaled && `it is made ${width} × ${height}`,
      slower && `it is made ${settings.frameRate} frames a second`,
      asked && `${videoCodecLabels[asked]} was chosen`,
      !held &&
        `${label} does not hold ${source.codec ? videoCodecLabels[source.codec] : "this picture's codec"}`,
      held &&
        !plays &&
        `${videoCodecLabels[source.codec!]} in ${label} does not play everywhere`,
      turnsByRedrawing &&
        `${label} cannot carry a turn as a setting, so the picture is turned as it is drawn`,
    ].filter((reason): reason is string => Boolean(reason))

    if (!reasons.length) {
      video = { action: "copy" }
      notes.push(
        `The picture (${videoCodecLabels[source.codec!]}) is copied as it is, without encoding it again: nothing is lost and it is quick.`
      )
      if (target !== null)
        notes.push(
          `It is already under ${sizeSaid(target)}, so nothing is taken from it.`
        )
      if (turns)
        notes.push(
          `The turn is written as a setting that players follow; the picture itself is not redrawn.`
        )
      videoBits =
        source.bitrate ??
        Math.round((facts.size * 8) / Math.max(facts.duration, 0.001))
    } else {
      if (!source.decodable)
        fail(
          `This browser cannot play this video's picture${source.codec ? ` (${videoCodecLabels[source.codec]})` : ""}, so it cannot be encoded again. Choose a format that holds it as it is (MKV holds most), or try another browser.`
        )
      if (asked && !HOLDS[container].video.includes(asked))
        fail(
          `${label} cannot hold ${videoCodecLabels[asked]}. It holds ${HOLDS[container].video.map((codec) => videoCodecLabels[codec]).join(", ")}.`
        )
      let fps = slower ? (settings.frameRate as number) : null
      const fitFor = (codec: VideoCodec) =>
        over
          ? fitToSize({
              target: target!,
              duration: facts.duration,
              soundBits,
              width: shown.width,
              height: shown.height,
              frameRate: fps ?? sourceRate,
              efficiency: CODEC_EFFICIENCY[codec],
            })
          : null
      // Without a choice, the most widely played codec the kind holds,
      // asked of the browser at the size it would be written.
      const tried =
        settings.codec !== "auto"
          ? [settings.codec]
          : [...ENCODE_ORDER[container]]
      let codec: VideoCodec | null = null
      for (const candidate of tried) {
        const fit = fitFor(candidate)
        const [w, h] = fit ? [fit.width, fit.height] : [width, height]
        const can = canEncode(candidate, w, h)
        if (can === null) {
          pending.push({ codec: candidate, width: w, height: h })
          break
        }
        if (can) {
          codec = candidate
          break
        }
      }
      if (!codec && !pending.length)
        fail(
          tried.length === 1
            ? `This browser cannot write ${videoCodecLabels[tried[0]]} at ${width} × ${height}. Choose another codec or a smaller size.`
            : `This browser cannot write a picture ${label} holds at ${width} × ${height}. Choose another format or a smaller size.`
        )
      const chosen = codec ?? tried[0]
      const fit = fitFor(chosen)
      let bits: number
      let capped = false
      if (fit) {
        width = fit.width
        height = fit.height
        fps = fit.frameRate ?? fps
        bits = fit.bitrate
        if (fit.short)
          fail(
            `This video cannot be made smaller than about ${sizeSaid(fit.short.least)}, even at ${fit.width} × ${fit.height}. Choose a limit of at least that, or leave the sound out.`
          )
      } else if (settings.quality === "custom") {
        bits =
          Math.min(MOST_BITRATE, Math.max(LEAST_BITRATE, settings.bitrate)) *
          1000
      } else {
        const share =
          PRESET_SHARE[
            settings.quality === "original" ? "high" : settings.quality
          ]
        const rate = fps ?? sourceRate
        bits = Math.round(
          highBitrate(width, height, rate) * share * CODEC_EFFICIENCY[chosen]
        )
        // Never more than the source holds, for its size and codec.
        if (source.bitrate && source.codec) {
          const most = Math.round(
            source.bitrate *
              (CODEC_EFFICIENCY[chosen] / CODEC_EFFICIENCY[source.codec]) *
              ((width * height) / (source.width * source.height)) *
              ((fps ?? sourceRate) / sourceRate)
          )
          if (most < bits) {
            bits = Math.max(LEAST_BITRATE * 1000, most)
            capped = true
          }
        }
      }
      videoBits = bits
      video = {
        action: "encode",
        codec: chosen,
        width,
        height,
        frameRate: fps,
        bitrate: bits,
        keyFrameInterval: KEYFRAME_SECONDS,
        target: over ? target : null,
      }
      notes.push(
        `The picture is encoded again as ${videoCodecLabels[chosen]}, ${width} × ${height}${fps ? ` at ${fps} frames a second` : ""}, at ${mbps(bits)}${capped ? ", no more than the file holds" : ""}, because ${reasons.join(" and ")}.`
      )
      if (over)
        notes.push(
          `If the browser's encoder overshoots, the file is written again with less (${MOST_PASSES} times at most), and it is never handed over larger than ${sizeSaid(target!)}.`
        )
      if (turns || ownTurn)
        notes.push(
          "The picture is turned as it is drawn, so every player shows it upright."
        )
      if (source.hdr)
        notes.push(
          "This video is HDR. It is written without tone mapping, so its colours may look flat or bright in some players."
        )
      if (source.variableRate && !fps)
        notes.push("Its frames keep their own times, which vary.")
    }
  }
  notes.push(...soundNotes)

  if (!source && !sound)
    fail("This file has neither a picture nor sound in it.")
  if (!settings.keepTags)
    notes.push("The title and other details are left out.")

  const copying = video.action === "copy" && audio.action !== "encode"
  const estimate = copying
    ? facts.size
    : video.action === "encode" && video.target
      ? video.target
      : Math.round((((videoBits + soundBits) * facts.duration) / 8) * 1.01)

  return {
    container,
    video,
    rotate: settings.rotate,
    flip: settings.flip,
    width,
    height,
    audio,
    keepTags: settings.keepTags,
    notes,
    problem,
    pending,
    estimate,
  }
}

/** Names the settings, so a late result can be told from a current one. */
export const settingsKey = (settings: VideoSettings) => JSON.stringify(settings)

/** Why the settings cannot be used, or null. */
export function settingsProblem(settings: VideoSettings): string | null {
  if (
    settings.quality === "custom" &&
    (!Number.isFinite(settings.bitrate) ||
      settings.bitrate < LEAST_BITRATE ||
      settings.bitrate > MOST_BITRATE)
  )
    return `Give a bitrate from ${LEAST_BITRATE} to ${MOST_BITRATE.toLocaleString("en")} kbit/s.`
  const limit = settings.limit
  if (
    limit &&
    "bytes" in limit &&
    (!Number.isFinite(limit.bytes) ||
      limit.bytes < LEAST_LIMIT * MB ||
      limit.bytes > MOST_LIMIT * MB)
  )
    return `Give a size from ${LEAST_LIMIT} to ${MOST_LIMIT.toLocaleString("en")} MB.`
  return null
}
