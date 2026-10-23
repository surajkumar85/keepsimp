/**
 * Joining videos in order: the results the workspace wrote (each with its
 * own trims, crops and edits) put end to end in one file. Pure: what the
 * joined file is to be. The worker (`joinVideos`) copies the pictures'
 * packets when every one was written alike (the same codec, size and
 * decoder setup) and encodes them to the first one's size otherwise; the
 * sound is always written anew in one piece, each video's sound for
 * exactly as long as its picture, so joins are exact and in step.
 */
import {
  containerLabels,
  outputInfo,
  sameContainer,
  type OutContainer,
} from "./formats"
import {
  ENCODE_ORDER,
  HOLDS,
  highBitrate,
  soundFor,
  videoCodecLabels,
  type SoundCodec,
  type VideoCodec,
  type VideoFacts,
} from "./settings"
import { clock } from "./trim"
import { lengthTolerance, type Decoded } from "./check"

/** One video to join: its name and what reading its written file found. */
export interface JoinPiece {
  name: string
  facts: VideoFacts
}

export interface JoinPlan {
  container: OutContainer
  /** The joined picture's size, as shown: the first video's. */
  width: number
  height: number
  frameRate: number | null
  /** Codecs to try when the picture is encoded, the first first. */
  codecs: VideoCodec[]
  /** bit/s, when the picture is encoded. */
  bitrate: number
  /** Whether the pictures may be copied: the same codec, held by the kind, at the same size. The worker also holds them to the same decoder setup. */
  copyable: boolean
  sound: {
    codec: SoundCodec
    bitrate: number
    sampleRate: number
    channels: number
  } | null
  /** Seconds, all of them. */
  length: number
  notes: string[]
  problem: string | null
}

/** At most this many videos are joined at once: the workspace's own list. */
export const LEAST_TO_JOIN = 2

/** What the joined file is to be. */
export function joinPlan(pieces: JoinPiece[]): JoinPlan {
  const first = pieces[0]
  const container = sameContainer(first.facts.container)
  const notes: string[] = []
  let problem: string | null = null
  if (pieces.length < LEAST_TO_JOIN)
    problem = "Choose at least two videos to join."
  const blind = pieces.find((piece) => !piece.facts.video)
  if (blind) problem ??= `${blind.name} has no picture to join.`
  const picture = first.facts.video
  const width = picture?.width ?? 0
  const height = picture?.height ?? 0
  const frameRate = picture?.frameRate ?? null
  const codec = picture?.codec ?? null
  const copyable =
    !blind &&
    codec !== null &&
    HOLDS[container].video.includes(codec) &&
    pieces.every(
      (piece) =>
        piece.facts.video!.codec === codec &&
        piece.facts.video!.width === width &&
        piece.facts.video!.height === height
    )
  const most = Math.max(
    0,
    ...pieces.map((piece) => piece.facts.video?.bitrate ?? 0)
  )
  const high = highBitrate(width, height, frameRate ?? 30)
  const bitrate = most > 0 ? Math.min(high, most) : high
  const heard = pieces.find((piece) => piece.facts.audio)?.facts.audio ?? null
  const chosen = heard ? soundFor(container, heard.channels) : null
  const sound =
    heard && chosen
      ? {
          ...chosen,
          sampleRate: chosen.codec === "opus" ? 48000 : heard.sampleRate,
          channels: heard.channels,
        }
      : null
  const length = pieces.reduce((sum, piece) => sum + piece.facts.duration, 0)
  notes.push(
    `${pieces.length} videos joined in order, ${clock(length)} in all, as ${outputInfo[container].label}.`
  )
  notes.push(
    copyable
      ? `The pictures are copied as they are, without encoding them again, where every one was written alike (${videoCodecLabels[codec!]}, ${width} × ${height}); otherwise they are encoded again at that size.`
      : `The pictures are encoded again at ${width} × ${height}, the first video's size; others are fitted inside it with black bars.`
  )
  if (sound)
    notes.push(
      `The sound is written again in one piece, each video's sound for exactly as long as its picture${pieces.some((piece) => !piece.facts.audio) ? ", silent where a video has none" : ""}.`
    )
  const kinds = new Set(pieces.map((piece) => piece.facts.container))
  if (kinds.size > 1)
    notes.push(
      `They are of different kinds (${[...kinds].map((kind) => containerLabels[kind]).join(", ")}); the joined file is ${outputInfo[container].label}, as the first is.`
    )
  return {
    container,
    width,
    height,
    frameRate,
    codecs: [...ENCODE_ORDER[container]],
    bitrate,
    copyable,
    sound,
    length,
    notes,
    problem,
  }
}

/** The joined file's name. */
export function joinName(pieces: JoinPiece[], container: OutContainer) {
  const dot = pieces[0].name.lastIndexOf(".")
  const base = dot > 0 ? pieces[0].name.slice(0, dot) : pieces[0].name
  return `${base}-joined.${outputInfo[container].extension}`
}

/** A list in a new order: one item moved up or down a place. */
export function moved<T>(list: T[], index: number, by: -1 | 1) {
  const to = index + by
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** What is wrong with a joined file, opened again; empty when it is as planned. */
export function joinProblems(
  plan: JoinPlan,
  count: number,
  written: VideoFacts,
  decoded: Decoded
): string[] {
  const problems: string[] = []
  const picture = written.video
  if (!picture) problems.push("The file written has no picture.")
  else {
    if (picture.width !== plan.width || picture.height !== plan.height)
      problems.push(
        `The picture is ${picture.width} × ${picture.height}, not ${plan.width} × ${plan.height}.`
      )
    if (decoded.picture === false)
      problems.push("The picture written could not be played back.")
  }
  if (plan.sound && !written.audio)
    problems.push("The file written has no sound.")
  if (!plan.sound && written.audio)
    problems.push("The file written has sound it should not.")
  if (plan.sound && decoded.sound === false)
    problems.push("The sound written could not be played back.")
  // Each join may give or take a frame.
  const slack = lengthTolerance(plan.frameRate) + (count - 1) * 0.04
  if (Math.abs(written.duration - plan.length) > slack)
    problems.push(
      `The file written is ${written.duration.toFixed(2)} s long, not ${plan.length.toFixed(2)} s.`
    )
  return problems
}
