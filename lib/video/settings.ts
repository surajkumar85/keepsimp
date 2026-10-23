/**
 * Every choice made for a file, worked out in one place (`planFor`) and
 * said in words. The page shows the sentence; the worker follows the plan;
 * the check holds the result to it.
 */
import {
  dbLabel,
  LOUDEST_TARGET,
  QUIETEST_TARGET,
  SAFE_CEILING,
} from "@/lib/audio/level"
import { fitToSize, MOST_PASSES } from "./target"
import type { CaptionSize, Corner } from "@/lib/animation/effects"
import { trackSaid, type Soundtrack, type TrackFacts } from "./soundtrack"
import {
  placedCues,
  subtitlesSaid,
  type Cue,
  type SubtitleSize,
} from "./subtitles"
import { boxCrop, isWholeBox, type Box } from "./frame"
import {
  clock,
  isWhole,
  keptLength,
  snapOut,
  snapSaid,
  tidy,
  type Part,
} from "./trim"
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

/** Shapes the picture can be cut to, around its middle (common sharing shapes). */
export type Shape = "same" | "16:9" | "9:16" | "1:1" | "4:5" | "4:3"
export const SHAPES: readonly Exclude<Shape, "same">[] = [
  "16:9",
  "9:16",
  "1:1",
  "4:5",
  "4:3",
]
/** Speeds offered; the audio editor's range (its stretcher keeps the pitch from 0.5 to 2 times). */
export const SPEEDS = [0.5, 0.75, 1.25, 1.5, 2] as const
export const SLOWEST_SPEED = 0.5
export const FASTEST_SPEED = 2
/** Fades offered, in seconds. */
export const FADES = [0.5, 1, 2] as const
export const LONGEST_FADE = 10

export interface Fade {
  /** Seconds from black and silence at the start. */
  in: number
  /** Seconds to black and silence at the end. */
  out: number
}

/** A speed in words. */
export const speedSaid = (speed: number) =>
  speed === 2
    ? "twice as fast"
    : speed === 0.5
      ? "at half speed"
      : speed > 1
        ? `${speed} times as fast`
        : `at ${speed} times its speed`

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
  /** Cut to a shape around the middle of the picture, after the turn. */
  shape: Shape
  /** How much faster it plays: 0.5 to 2; the sound keeps its pitch. */
  speed: number
  /** Seconds it fades in from black and silence, and out to them. */
  fadeIn: number
  fadeOut: number
  /** The loudness the sound is made, in LUFS (its peaks held under −1 dBTP); null leaves its level. */
  loudness: number | null
  /** Text written along the top and the bottom of the picture (the animation converter's captions). */
  captionTop: string
  captionBottom: string
  captionSize: CaptionSize
  captionColour: "white" | "black"
  captionOutline: boolean
  /** Seconds of the result the text shows from and until; null for the start and the end. */
  captionFrom: number | null
  captionUntil: number | null
  /** Where a logo sits, how wide it is (percent of the picture) and how solid (percent). */
  logoCorner: Corner
  logoSize: number
  logoOpacity: number
  /** How large subtitles are written. */
  subtitleSize: SubtitleSize
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
  shape: "same",
  speed: 1,
  fadeIn: 0,
  fadeOut: 0,
  loudness: null,
  captionTop: "",
  captionBottom: "",
  captionSize: "medium",
  captionColour: "white",
  captionOutline: true,
  captionFrom: null,
  captionUntil: null,
  logoCorner: "bottom-right",
  logoSize: 15,
  logoOpacity: 100,
  subtitleSize: "medium",
}

/** A logo's file as read on the page: its name there and its size. */
export interface LogoFacts {
  id: string
  name: string
  width: number
  height: number
}

/** The longest caption, in letters (the animation converter's). */
export const LONGEST_CAPTION = 200
/** Logo widths offered and allowed, as percents of the picture. */
export const LOGO_SIZES = [10, 15, 20, 30] as const
export const SMALLEST_LOGO = 5
export const LARGEST_LOGO = 50
export const FAINTEST_LOGO = 10

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
    /** Keyframe times, for cutting without encoding; null or left out when not known. */
    keyframes?: number[] | null
  } | null
  audio: {
    codec: string | null
    sampleRate: number
    channels: number
    bitrate: number | null
    decodable: boolean
  } | null
}

/** What a trim keeps, and whether it is to be cut to the frame. */
export interface Cut {
  parts: Part[]
  exact: boolean
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
  /** The part of the picture kept, after the turn, in its pixels; null keeps it all. */
  crop: { left: number; top: number; width: number; height: number } | null
  /** How much faster it plays. */
  speed: number
  /** Seconds it fades in and out, picture and sound. */
  fade: Fade
  /** Text and a logo drawn on every frame (or while the text shows); null for none. */
  overlay: {
    caption: {
      top: string
      bottom: string
      size: CaptionSize
      colour: [number, number, number]
      outline: boolean
      from: number | null
      until: number | null
    } | null
    logo: {
      id: string
      name: string
      width: number
      height: number
      corner: Corner
      size: number
      opacity: number
    } | null
  } | null
  /** Subtitles written on the picture, on the result's clock; null for none. */
  subtitles: {
    name: string
    cues: Cue[]
    size: SubtitleSize
  } | null
  /** Another file's sound under the video, and how; null for none. */
  track:
    | (Soundtrack & {
        id: string
        name: string
        /** Whether the video's own sound is mixed under it. */
        mixing: boolean
        /** The sound written: the video's own rate and channels when mixed, the soundtrack's otherwise. */
        sampleRate: number
        channels: number
        duration: number
      })
    | null
  /** As shown, after every turn; 0 with no picture. */
  width: number
  height: number
  audio:
    | { action: "none" }
    | { action: "drop" }
    | { action: "copy" }
    | {
        action: "encode"
        codec: SoundCodec
        bitrate: number
        /** LUFS to reach, measured first; null leaves the level. */
        loudness: number | null
      }
  keepTags: boolean
  /** What was chosen and why, in order. */
  notes: string[]
  /** Why it cannot be written as asked; null when it can. */
  problem: string | null
  /**
   * The parts written, in the file's seconds: one copied with a trim (an
   * MP4's edit list hides the lead-in to its keyframe), several joined by
   * copying their packets (each from a keyframe), or cut to the frame while
   * encoding. null keeps the whole file.
   */
  cut: null | { mode: "copy" | "join" | "exact"; parts: Part[] }
  /** Seconds the result lasts. */
  length: number
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

/** The ratio of a shape, width over height. */
export const shapeRatio = (shape: Exclude<Shape, "same">) => {
  const [width, height] = shape.split(":").map(Number)
  return width / height
}

/**
 * The size as shown after the turn, the shape and the shorter-side limit,
 * and the part of the turned picture the shape keeps (around its middle).
 */
export function shownSize(
  video: NonNullable<VideoFacts["video"]>,
  settings: Pick<VideoSettings, "rotate" | "size"> &
    Partial<Pick<VideoSettings, "shape" | "flip">>,
  /** A crop box of one's own, which takes the place of the shape. */
  box: Box | null = null
) {
  let [width, height] =
    settings.rotate % 180 === 0
      ? [video.width, video.height]
      : [video.height, video.width]
  let crop: Plan["crop"] = null
  const shape = settings.shape ?? "same"
  if (box && !isWholeBox(box)) {
    crop = boxCrop(
      box,
      video.width,
      video.height,
      settings.rotate,
      settings.flip ?? false
    )
    width = crop.width
    height = crop.height
  } else if (shape !== "same") {
    const ratio = shapeRatio(shape)
    // Within a hundredth of the shape already: left as it is.
    if (Math.abs(width / height / ratio - 1) > 0.01) {
      const [w, h] =
        width / height > ratio
          ? [even(height * ratio), height]
          : [width, even(width / ratio)]
      crop = {
        left: Math.floor((width - w) / 2),
        top: Math.floor((height - h) / 2),
        width: Math.min(w, width),
        height: Math.min(h, height),
      }
      width = crop.width
      height = crop.height
    }
  }
  const short = Math.min(width, height)
  const scaled = settings.size !== "same" && short > settings.size
  if (scaled) {
    const ratio = (settings.size as number) / short
    width = even(width * ratio)
    height = even(height * ratio)
  }
  return { width, height, scaled, crop }
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
export function soundFor(container: OutContainer, channels: number) {
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
  canEncodeSound: (codec: SoundCodec) => boolean | null = () => true,
  /** The parts kept, and whether they are to be cut to the frame. */
  cut: Cut | null = null,
  /** A crop box of one's own for this file. */
  box: Box | null = null,
  /** Another file's sound to put under the video, and how. */
  track: (TrackFacts & Soundtrack) | null = null,
  /** A picture to draw on every frame: the page's name for it and its size. */
  logo: LogoFacts | null = null,
  /** Subtitles read from a file, in the source's own seconds. */
  subtitles: { name: string; cues: Cue[] } | null = null
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

  // What is kept: the whole file, or parts of it.
  const kept = cut ? tidy(cut.parts, facts.duration) : null
  if (kept && !kept.length) fail("Everything is cut out. Keep at least a part.")
  const cutting = kept?.length && !isWhole(kept, facts.duration) ? kept : null
  let length = cutting ? keptLength(cutting) : facts.duration
  const share = length / Math.max(facts.duration, 0.001)
  // Text and a logo are drawn on the picture, which is then encoded.
  const caption =
    settings.captionTop.trim() || settings.captionBottom.trim()
      ? {
          top: settings.captionTop.trim(),
          bottom: settings.captionBottom.trim(),
          size: settings.captionSize,
          colour: (settings.captionColour === "white"
            ? [255, 255, 255]
            : [0, 0, 0]) as [number, number, number],
          outline: settings.captionOutline,
          from: settings.captionFrom,
          until: settings.captionUntil,
        }
      : null
  // Speed and fades change both picture and sound, so both are encoded.
  const changesTime = settings.speed !== 1
  const fades = settings.fadeIn > 0 || settings.fadeOut > 0
  length = length / settings.speed
  const totalBits = target ? (target * 8) / Math.max(length, 0.001) : 0
  if (settings.fadeIn + settings.fadeOut > length + 1e-6)
    fail(
      `The fades (${settings.fadeIn + settings.fadeOut} s) are longer than the video (${length.toFixed(1)} s). Choose shorter ones.`
    )

  if (settings.format === "same" && container !== facts.container)
    notes.push(
      `${containerLabels[facts.container]} is read here but not written, so it becomes an MP4.`
    )

  // The picture's reasons to be encoded again, before the sound: they decide how it is cut.
  const source = facts.video
  const why = source
    ? (() => {
        const shown = shownSize(source, settings, box)
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
        const over = target !== null && facts.size * share > target
        const reasons = [
          settings.quality !== "original" && "the quality was chosen",
          over && `it is to fit under ${sizeSaid(target!)}`,
          caption && "text is written on it",
          subtitles && "subtitles are written on it",
          logo && "a logo is drawn on it",
          shown.crop &&
            (box && !isWholeBox(box)
              ? `it is cropped to ${shown.crop.width} × ${shown.crop.height}`
              : `it is cut to ${settings.shape}`),
          shown.scaled && `it is made ${shown.width} × ${shown.height}`,
          changesTime && `it plays ${speedSaid(settings.speed)}`,
          fades && "it fades",
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
        return {
          shown,
          sourceRate,
          slower,
          asked,
          turns,
          ownTurn,
          over,
          reasons,
        }
      })()
    : null

  // How it is cut: copied where it can be (a part starts on a keyframe,
  // or an MP4's edit list hides the lead-in), to the frame otherwise.
  const keyframes = source?.keyframes ?? null
  const soundCopies = (sound: NonNullable<VideoFacts["audio"]>) =>
    settings.sound === "keep" &&
    sound.codec !== null &&
    PLAYS_EVERYWHERE[container].includes(sound.codec) &&
    // Under a limit, sound that would take a fifth of it is converted smaller.
    (!target || (sound.bitrate ?? 128_000) <= totalBits * 0.2)
  let exactCut = Boolean(
    cutting && (cut!.exact || (why !== null && why.reasons.length > 0))
  )
  const lossless = TURNS_AS_SETTING.includes(container)
  if (cutting && !exactCut) {
    const soundJoins =
      !facts.audio ||
      settings.sound === "none" ||
      (soundCopies(facts.audio) && settings.loudness === null && !track)
    if (!keyframes || !keyframes.length) exactCut = true
    if (cutting.length > 1 && !soundJoins) exactCut = true
  }
  if (exactCut && why && !why.reasons.length)
    why.reasons.push(
      cut!.exact
        ? "it is cut exactly where asked"
        : "it can be cut only by encoding here"
    )
  // A copy ends on a keyframe, so no frame it needs is left behind; an
  // MP4 or MOV starts where asked, its edit list hiding the lead-in.
  const parts: Part[] | null = !cutting
    ? null
    : exactCut
      ? cutting
      : cutting.length === 1 && lossless
        ? [
            {
              start: cutting[0].start,
              end: snapOut(cutting, keyframes!, facts.duration)[0].end,
            },
          ]
        : snapOut(cutting, keyframes!, facts.duration)
  if (parts) length = keptLength(parts) / settings.speed

  // The sound first: a size limit shares its bits between the two.
  let audio: Plan["audio"] = { action: "none" }
  let soundBits = 0
  // With a soundtrack, the sound written is the soundtrack, or the mix of
  // it and the video's own; "Leave out" leaves out the video's own.
  const mixing =
    track?.mode === "mix" && facts.audio !== null && settings.sound !== "none"
  const sound: VideoFacts["audio"] = track
    ? {
        codec: track.codec,
        sampleRate: mixing ? facts.audio!.sampleRate : track.sampleRate,
        channels: mixing ? facts.audio!.channels : track.channels,
        bitrate: null,
        decodable: track.decodable && (!mixing || facts.audio!.decodable),
      }
    : facts.audio
  if (track) {
    if (!facts.video)
      fail("This file has no picture to put a soundtrack under.")
    if (!track.decodable)
      fail(
        `This browser cannot play the sound of ${track.name}. Choose another soundtrack.`
      )
    soundNotes.push(
      trackSaid(
        track,
        track,
        length,
        facts.audio !== null && settings.sound !== "none"
      )
    )
  }
  if (sound) {
    if (settings.sound === "none" && !track) {
      audio = { action: "drop" }
      soundNotes.push("The sound is left out.")
    } else {
      // Sound cut to the frame is cut to the sample, which needs encoding.
      const copies =
        soundCopies(sound) &&
        !exactCut &&
        !changesTime &&
        !fades &&
        settings.loudness === null &&
        !track
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
        audio = { action: "encode", ...chosen, loudness: settings.loudness }
        soundBits = chosen.bitrate
        soundNotes.push(
          `The sound is converted to ${soundLabel(chosen.codec)} at ${Math.round(chosen.bitrate / 1000)} kbit/s${squeezed ? ", to leave room for the picture" : soundCapped ? ", no more than the file holds" : ""}${settings.sound === "keep" && !track && sound.codec && !PLAYS_EVERYWHERE[container].includes(sound.codec) ? `, as ${label} would not play ${soundLabel(sound.codec)} everywhere` : ""}.`
        )
        if (settings.loudness !== null)
          soundNotes.push(
            `It is measured as it will be written and made louder or quieter to ${dbLabel(settings.loudness)} LUFS (BS.1770), its peaks held under ${dbLabel(SAFE_CEILING)} dBTP by a limiter.`
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
  if (source && why) {
    const { shown, sourceRate, slower, asked, turns, ownTurn, over, reasons } =
      why
    width = shown.width
    height = shown.height
    if (!reasons.length) {
      video = { action: "copy" }
      notes.push(
        `The picture (${videoCodecLabels[source.codec!]}) is copied as it is, without encoding it again: nothing is lost and it is quick.`
      )
      if (target !== null)
        notes.push(
          `It is already under ${sizeSaid(target)}, so nothing is taken from it.`
        )
      if (parts && cutting) {
        const more = (parts[0].end - cutting[0].end).toFixed(1)
        notes.push(
          parts.length === 1 && parts[0].start === cutting[0].start
            ? Number(more) > 0
              ? `It is cut without encoding: the file says where to start playing, and a copy ends where the video holds a whole picture (a keyframe), so ${more} s more is kept at the end. Choose Exact to cut to the frame.`
              : "It is cut without encoding: the file says where to start playing, so nothing is lost."
            : (snapSaid(cutting, parts) ??
                "Its parts are joined without encoding, so nothing is lost.")
        )
      }
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
      // Faster keeps the frame rate (frames are left out); slower has as many frames as there are.
      if (changesTime)
        fps = Math.min(
          fps ?? sourceRate,
          Math.round(sourceRate * settings.speed * 100) / 100
        )
      const fitFor = (codec: VideoCodec) =>
        over
          ? fitToSize({
              target: target!,
              duration: length,
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
          `If the browser's encoder overshoots, the file is written again with less, or smaller if it will not come down (${MOST_PASSES} times at most), and it is never handed over larger than ${sizeSaid(target!)}.`
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
  if (changesTime)
    notes.push(
      `It plays ${speedSaid(settings.speed)}: ${clock(length * settings.speed)} becomes ${clock(length)}${sound && settings.sound !== "none" ? ", the sound keeping its pitch" : ""}.`
    )
  if (fades)
    notes.push(
      `It fades ${[
        settings.fadeIn > 0 && `in from black over ${settings.fadeIn} s`,
        settings.fadeOut > 0 && `out to black over ${settings.fadeOut} s`,
      ]
        .filter(Boolean)
        .join(
          " and "
        )}${sound && settings.sound !== "none" ? ", the sound with it" : ""}.`
    )

  // Subtitles on the result's clock: through the parts kept and the speed.
  const placed =
    subtitles && facts.video
      ? placedCues(subtitles.cues, parts, settings.speed)
      : null
  if (subtitles && placed)
    notes.push(
      subtitlesSaid(subtitles.name, subtitles.cues.length, placed.length)
    )
  if (!source && !sound)
    fail("This file has neither a picture nor sound in it.")
  if (!settings.keepTags)
    notes.push("The title and other details are left out.")

  const copying = video.action === "copy" && audio.action !== "encode"
  const estimate = copying
    ? Math.round(facts.size * (length / Math.max(facts.duration, 0.001)))
    : video.action === "encode" && video.target
      ? video.target
      : Math.round((((videoBits + soundBits) * length) / 8) * 1.01)

  return {
    container,
    video,
    rotate: settings.rotate,
    flip: settings.flip,
    crop: why?.shown.crop ?? null,
    speed: settings.speed,
    fade: { in: settings.fadeIn, out: settings.fadeOut },
    subtitles:
      subtitles && placed
        ? {
            name: subtitles.name,
            cues: placed,
            size: settings.subtitleSize,
          }
        : null,
    overlay:
      (caption || logo) && facts.video
        ? {
            caption,
            logo: logo && {
              ...logo,
              corner: settings.logoCorner,
              size: settings.logoSize,
              opacity: settings.logoOpacity,
            },
          }
        : null,
    track: track
      ? {
          id: track.id,
          name: track.name,
          mode: track.mode,
          volume: track.volume,
          loop: track.loop,
          mixing,
          duration: track.duration,
          sampleRate: sound!.sampleRate,
          channels: sound!.channels,
        }
      : null,
    width,
    height,
    audio,
    keepTags: settings.keepTags,
    notes,
    problem,
    pending,
    estimate,
    cut: parts
      ? {
          mode: exactCut ? "exact" : parts.length === 1 ? "copy" : "join",
          parts,
        }
      : null,
    length,
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
  if (!(settings.speed >= SLOWEST_SPEED && settings.speed <= FASTEST_SPEED))
    return `Choose a speed from ${SLOWEST_SPEED} to ${FASTEST_SPEED} times.`
  if (
    settings.loudness !== null &&
    !(
      settings.loudness >= QUIETEST_TARGET &&
      settings.loudness <= LOUDEST_TARGET
    )
  )
    return `Choose a loudness from ${dbLabel(QUIETEST_TARGET)} to ${dbLabel(LOUDEST_TARGET)} LUFS.`
  if (
    settings.captionTop.length > LONGEST_CAPTION ||
    settings.captionBottom.length > LONGEST_CAPTION
  )
    return `Keep each caption under ${LONGEST_CAPTION} letters.`
  const { captionFrom: from, captionUntil: until } = settings
  if (
    (from !== null && !(from >= 0)) ||
    (until !== null && !(until > 0)) ||
    (from !== null && until !== null && from >= until)
  )
    return "Give the text's times in seconds, the start before the end."
  if (!(
    settings.logoSize >= SMALLEST_LOGO && settings.logoSize <= LARGEST_LOGO
  ))
    return `Choose a logo width from ${SMALLEST_LOGO}% to ${LARGEST_LOGO}%.`
  if (!(settings.logoOpacity >= FAINTEST_LOGO && settings.logoOpacity <= 100))
    return `Choose how solid the logo is, from ${FAINTEST_LOGO}% to 100%.`
  for (const fade of [settings.fadeIn, settings.fadeOut])
    if (!(fade >= 0 && fade <= LONGEST_FADE))
      return `Choose a fade of at most ${LONGEST_FADE} s.`
  return null
}
