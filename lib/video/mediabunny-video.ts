/**
 * The only video module that uses Mediabunny. It is handed the library,
 * so the same code runs in the worker and in Node. Reading, writing by a
 * plan, and reading a result back.
 */
import type * as Mediabunny from "mediabunny"
import type { Container, OutContainer } from "./formats"
import type { Decoded } from "./check"
import type { Plan, Turn, VideoCodec, VideoFacts } from "./settings"
import { lookSize, moments, type Looks } from "./looks"
import { similarity } from "@/lib/image-compressor/ssim"

type Engine = typeof Mediabunny

/** A sentence for the person; anything else thrown gets a plain one. */
export class VideoProblem extends Error {}

const CODECS: readonly VideoCodec[] = ["avc", "hevc", "vp8", "vp9", "av1"]
const asCodec = (codec: string | null): VideoCodec | null =>
  CODECS.includes(codec as VideoCodec) ? (codec as VideoCodec) : null

const POSTER_WIDTH = 240

function opened(engine: Engine, file: Blob) {
  return new engine.Input({
    source: new engine.BlobSource(file),
    formats: engine.ALL_FORMATS,
  })
}

async function factsOf(
  input: Mediabunny.Input,
  container: Container,
  size: number
): Promise<VideoFacts> {
  const [videoTrack, audioTrack] = await Promise.all([
    input.getPrimaryVideoTrack(),
    input.getPrimaryAudioTrack(),
  ])
  if (!videoTrack && !audioTrack)
    throw new VideoProblem("This file has neither a picture nor sound in it.")
  const duration = await input.computeDuration()
  let video: VideoFacts["video"] = null
  if (videoTrack) {
    const [codec, width, height, rotation, flip, hdr, decodable, rate] =
      await Promise.all([
        videoTrack.getCodec(),
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        videoTrack.getRotation(),
        videoTrack.getFlip(),
        videoTrack.hasHighDynamicRange(),
        videoTrack.canDecode(),
        videoTrack.computeFrameRateMetrics({ targetPacketCount: 256 }),
      ])
    const bitrate =
      (await videoTrack.getAverageBitrate()) ??
      (await videoTrack.computePacketStats(1000)).averageBitrate
    video = {
      codec: asCodec(codec),
      width,
      height,
      rotation: rotation as Turn,
      flip,
      frameRate: rate.bestGuessFrameRate || null,
      variableRate: rate.underlyingFrameRate === null,
      bitrate: bitrate || null,
      hdr,
      decodable,
    }
  }
  let audio: VideoFacts["audio"] = null
  if (audioTrack) {
    const [codec, sampleRate, channels, bitrate, decodable] = await Promise.all(
      [
        audioTrack.getCodec(),
        audioTrack.getSampleRate(),
        audioTrack.getNumberOfChannels(),
        audioTrack.getAverageBitrate(),
        audioTrack.canDecode(),
      ]
    )
    audio = { codec, sampleRate, channels, bitrate, decodable }
  }
  return { container, size, duration, video, audio }
}

/** A file's facts, and a small picture from near its start where it can be decoded. */
export async function readVideo(
  engine: Engine,
  file: Blob,
  container: Container
): Promise<{ facts: VideoFacts; poster: ImageBitmap | null }> {
  const input = opened(engine, file)
  try {
    let facts: VideoFacts
    try {
      facts = await factsOf(input, container, file.size)
    } catch (error) {
      if (error instanceof VideoProblem) throw error
      throw new VideoProblem(
        "This file could not be read. It may be damaged, or of a kind not read here."
      )
    }
    let poster: ImageBitmap | null = null
    const track = await input.getPrimaryVideoTrack()
    if (
      track &&
      facts.video?.decodable &&
      typeof createImageBitmap === "function"
    )
      try {
        const { width, height } = facts.video
        const sink = new engine.CanvasSink(track, {
          width: POSTER_WIDTH,
          height: Math.max(2, Math.round((POSTER_WIDTH * height) / width)),
          fit: "fill",
        })
        const start = await track.getFirstTimestamp()
        const frame = await sink.getCanvas(
          start + Math.min(1, facts.duration / 10)
        )
        if (frame) poster = await createImageBitmap(frame.canvas)
      } catch {
        poster = null
      }
    return { facts, poster }
  } finally {
    input.dispose()
  }
}

function formatFor(engine: Engine, container: OutContainer) {
  // The index is put in front afterwards (faststart.ts), so writing streams.
  if (container === "mp4")
    return new engine.Mp4OutputFormat({ fastStart: false })
  if (container === "mov")
    return new engine.MovOutputFormat({ fastStart: false })
  if (container === "webm") return new engine.WebMOutputFormat()
  return new engine.MkvOutputFormat()
}

const DISCARDED: Record<string, string> = {
  undecodable_source_codec: "this browser cannot play it",
  no_encodable_target_codec: "this browser cannot write it",
  unknown_source_codec: "its codec is not known here",
  cannot_copy: "it cannot be copied as it is",
}

function videoOptions(
  engine: Engine,
  plan: Plan,
  software: boolean
): Mediabunny.ConversionVideoOptions | undefined {
  const video = plan.video
  if (video.action === "none") return undefined
  if (video.action === "copy") return { rotate: plan.rotate, flip: plan.flip }
  return {
    codec: video.codec,
    width: video.width,
    height: video.height,
    fit: "fill",
    frameRate: video.frameRate ?? undefined,
    quality: new engine.Quality({ bitrate: video.bitrate }),
    keyFrameInterval: video.keyFrameInterval,
    rotate: plan.rotate,
    flip: plan.flip,
    // Turned as it is drawn, so players that ignore the setting show it upright too.
    allowTransformationMetadata: false,
    forceTranscode: true,
    // Hardware encoders have few sessions; another program may hold them.
    ...(software ? { hardwareAcceleration: "prefer-software" as const } : {}),
  }
}

function audioOptions(
  engine: Engine,
  plan: Plan
): Mediabunny.ConversionAudioOptions | undefined {
  const audio = plan.audio
  if (audio.action === "drop") return { discard: true }
  if (audio.action !== "encode") return undefined
  return {
    codec: audio.codec,
    quality: new engine.Quality({ bitrate: audio.bitrate }),
    sampleRate: audio.codec === "opus" ? 48000 : undefined,
    forceTranscode: true,
  }
}

/** Write a file by its plan into a target. */
export async function convertVideo(
  engine: Engine,
  file: Blob,
  plan: Plan,
  target: Mediabunny.Target,
  {
    signal,
    onProgress,
    software = false,
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    /** Encode the picture in software, after the hardware failed. */
    software?: boolean
  } = {}
) {
  const input = opened(engine, file)
  try {
    const output = new engine.Output({
      format: formatFor(engine, plan.container),
      target,
    })
    const conversion = await engine.Conversion.init({
      input,
      output,
      tracks: "primary",
      // Copies stay copies where a kind cannot start before zero (an AAC
      // encoder's priming, say): every track is shifted together, so the
      // picture and the sound stay in step.
      copy: { shiftTolerance: 1 },
      video: videoOptions(engine, plan, software),
      audio: audioOptions(engine, plan),
      tags: plan.keepTags ? undefined : {},
      showWarnings: false,
    })
    const lost = conversion.discardedTracks.find(
      (track) => track.reason !== "discarded_by_user"
    )
    if (lost || !conversion.isValid) {
      const kind = lost?.track.isVideoTrack() ? "picture" : "sound"
      throw new VideoProblem(
        `The ${kind} could not be written: ${DISCARDED[lost?.reason ?? "cannot_copy"] ?? "it is not supported here"}. Choose another format or codec.`
      )
    }
    if (onProgress) conversion.onProgress = (fraction) => onProgress(fraction)
    const stop = () => void conversion.cancel()
    signal?.addEventListener("abort", stop, { once: true })
    try {
      await conversion.execute()
    } finally {
      signal?.removeEventListener("abort", stop)
    }
  } finally {
    input.dispose()
  }
}

/** Read a written file back: its facts, and whether its first and last frames and its sound decode. */
export async function readBack(
  engine: Engine,
  file: Blob,
  container: OutContainer
): Promise<{ facts: VideoFacts; decoded: Decoded }> {
  const input = opened(engine, file)
  try {
    const facts = await factsOf(input, container, file.size)
    const decoded: Decoded = { picture: null, sound: null }
    const picture = await input.getPrimaryVideoTrack()
    if (picture && (await picture.canDecode())) {
      const sink = new engine.VideoSampleSink(picture)
      const start = await picture.getFirstTimestamp()
      const end = start + (await picture.computeDuration())
      try {
        const first = await sink.getSample(start)
        const last = await sink.getSample(Math.max(start, end - 0.001))
        decoded.picture = Boolean(first && last)
        first?.close()
        last?.close()
      } catch {
        decoded.picture = false
      }
    }
    const sound = await input.getPrimaryAudioTrack()
    if (sound && (await sound.canDecode())) {
      const sink = new engine.AudioSampleSink(sound)
      try {
        const sample = await sink.getSample(await sound.getFirstTimestamp())
        decoded.sound = Boolean(sample)
        sample?.close()
      } catch {
        decoded.sound = false
      }
    }
    return { facts, decoded }
  } finally {
    input.dispose()
  }
}

/** The frames of a file drawn at moments, all at one size. */
async function framesAt(
  engine: Engine,
  file: Blob,
  times: number[],
  size: { width: number; height: number }
) {
  const input = opened(engine, file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) return null
    const sink = new engine.CanvasSink(track, { ...size, fit: "fill" })
    const frames: ImageData[] = []
    for (const time of times) {
      const frame = await sink.getCanvas(time)
      if (!frame) return null
      const context = (frame.canvas as OffscreenCanvas).getContext("2d", {
        willReadFrequently: true,
      })!
      frames.push(context.getImageData(0, 0, size.width, size.height))
    }
    return frames
  } finally {
    input.dispose()
  }
}

/**
 * How close a result looks to its original, frame by frame at the same
 * moments; null where either cannot be decoded here.
 */
export async function looksAlike(
  engine: Engine,
  original: Blob,
  result: Blob,
  shown: { width: number; height: number; duration: number; start: number }
): Promise<Looks | null> {
  if (typeof OffscreenCanvas === "undefined") return null
  const size = lookSize(shown.width, shown.height)
  const times = moments(shown.start, shown.duration)
  const [before, after] = await Promise.all([
    framesAt(engine, original, times, size),
    framesAt(engine, result, times, size),
  ])
  if (!before || !after) return null
  const scores = before.map(
    (frame, index) =>
      similarity(
        frame as unknown as Parameters<typeof similarity>[0],
        after[index] as unknown as Parameters<typeof similarity>[0]
      ).mean
  )
  return {
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    least: Math.min(...scores),
    frames: scores.length,
  }
}
