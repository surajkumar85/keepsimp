/**
 * Every written file is opened again before it is offered. This holds what
 * was read back to the plan: the kind, the picture's codec and size, the
 * sound, the length, the frame rate, and that the picture and sound decode.
 */
import { LOUDNESS_TOLERANCE } from "@/lib/audio/check"
import { dbLabel, levelSaid as soundLevelSaid } from "@/lib/audio/level"
import { SILENT } from "@/lib/audio/loudness"
import type { VideoLevel } from "./protocol"
import {
  soundLabel,
  videoCodecLabels,
  type Plan,
  type VideoFacts,
} from "./settings"

/** What decoding the result found; null where there was nothing to decode. */
export interface Decoded {
  /** The first and the last frame. */
  picture: boolean | null
  sound: boolean | null
}

const A_KIND = {
  mp4: "an MP4",
  mov: "a MOV",
  webm: "a WebM",
  mkv: "an MKV",
} as const

/** Seconds a result's length may differ from the source's: at least 0.15 s or two and a half frames. */
export const lengthTolerance = (fps: number | null) =>
  Math.max(0.15, 2.5 / (fps ?? 30))

const megabytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString("en", { maximumFractionDigits: 2 })} MB`

const seconds = (value: number) =>
  `${value.toLocaleString("en", { maximumFractionDigits: 2 })} s`

/** What is wrong with a written file, in words; empty when it is as planned. */
export function writtenProblems(
  plan: Plan,
  written: VideoFacts,
  expected: { duration: number; frameRate: number | null },
  decoded: Decoded
): string[] {
  const problems: string[] = []
  if (
    written.container !== plan.container &&
    // An MP4 and a MOV are told apart by a brand that some writers share.
    !(plan.container === "mp4" && written.container === "mov")
  )
    problems.push(`The file written is not ${A_KIND[plan.container]}.`)

  const picture = written.video
  if (plan.video.action === "none") {
    if (picture) problems.push("The file written has a picture it should not.")
  } else if (!picture) problems.push("The file written has no picture.")
  else {
    if (plan.video.action === "encode" && picture.codec !== plan.video.codec)
      problems.push(
        `The picture was written as ${picture.codec ? videoCodecLabels[picture.codec] : "an unknown codec"}, not ${videoCodecLabels[plan.video.codec]}.`
      )
    if (picture.width !== plan.width || picture.height !== plan.height)
      problems.push(
        `The picture is ${picture.width} × ${picture.height}, not ${plan.width} × ${plan.height}.`
      )
    const fps = plan.video.action === "encode" ? plan.video.frameRate : null
    if (fps && picture.frameRate && Math.abs(picture.frameRate - fps) > 1)
      problems.push(
        `The picture has ${Math.round(picture.frameRate)} frames a second, not ${fps}.`
      )
    if (decoded.picture === false)
      problems.push("The picture written could not be played back.")
  }

  const sound = written.audio
  if (plan.audio.action === "none" || plan.audio.action === "drop") {
    if (sound) problems.push("The file written has sound it should not.")
  } else if (!sound) problems.push("The file written has no sound.")
  else {
    if (plan.audio.action === "encode" && sound.codec !== plan.audio.codec)
      problems.push(
        `The sound was written as ${soundLabel(sound.codec)}, not ${soundLabel(plan.audio.codec)}.`
      )
    if (decoded.sound === false)
      problems.push("The sound written could not be played back.")
  }

  const limit = plan.video.action === "encode" ? plan.video.target : null
  if (limit !== null && written.size > limit)
    problems.push(
      `The file written is ${megabytes(written.size)}, over the limit of ${megabytes(limit)}.`
    )

  const fps =
    (plan.video.action === "encode" ? plan.video.frameRate : null) ??
    expected.frameRate
  if (Math.abs(written.duration - expected.duration) > lengthTolerance(fps))
    problems.push(
      `The file written is ${seconds(written.duration)} long, not ${seconds(expected.duration)}.`
    )
  return problems
}

/**
 * What is wrong with a sound set to a loudness, measured as written: it
 * must be within the audio workspace's tolerance of the target, unless it
 * could not be reached (too quiet to measure, louder than is done here,
 * or held quieter by the limiter), which the result says. Lossy encoders add a little to peaks, so
 * they are not held to the ceiling, as in the audio workspace.
 */
export function levelProblems(level: VideoLevel): string[] {
  if (!level.after) return ["The sound written could not be measured."]
  // Not reached because it could not be, or because the limiter held its
  // peaks (a loud, uneven sound): said in the result's sentence.
  if (level.notes.length || level.after.integrated === SILENT) return []
  if (level.limited > 0.5 && level.after.integrated < level.target) return []
  return Math.abs(level.after.integrated - level.target) > LOUDNESS_TOLERANCE
    ? [
        `Its sound measures ${dbLabel(level.after.integrated)} LUFS, not ${dbLabel(level.target)}.`,
      ]
    : []
}

/** What was done to the sound's level, in a sentence. */
export function levelSaid(level: VideoLevel) {
  return [
    ...level.notes,
    soundLevelSaid({
      mode: "loudness",
      before: level.before,
      db: level.db,
      after: level.after ?? {
        integrated: SILENT,
        range: 0,
        truePeak: SILENT,
        peak: SILENT,
      },
      limited: level.limited,
      notes: [],
    }),
  ].join(" ")
}
