/**
 * Every written file is opened again before it is offered. This holds what
 * was read back to the plan: the kind, the picture's codec and size, the
 * sound, the length, the frame rate, and that the picture and sound decode.
 */
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

  const fps =
    (plan.video.action === "encode" ? plan.video.frameRate : null) ??
    expected.frameRate
  if (Math.abs(written.duration - expected.duration) > lengthTolerance(fps))
    problems.push(
      `The file written is ${seconds(written.duration)} long, not ${seconds(expected.duration)}.`
    )
  return problems
}
