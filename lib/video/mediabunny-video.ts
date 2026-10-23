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
import { cutPicture, cutSound } from "./cut"
import {
  cropPicture,
  shapePicture,
  shapeSound,
  type SoundGain,
} from "./effects"
import { LoudnessMeter, loudnessOf, type Loudness } from "@/lib/audio/loudness"
import { similarity } from "@/lib/image-compressor/ssim"

type Engine = typeof Mediabunny

/** A sentence for the person; anything else thrown gets a plain one. */
export class VideoProblem extends Error {
  name = "VideoProblem"
}

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

/** Keyframes listed at most, for cutting without encoding. */
export const MOST_KEYFRAMES = 50_000

/** The picture's keyframe times, read from the file's index without decoding; null past the limit. */
async function keyframesOf(engine: Engine, track: Mediabunny.InputVideoTrack) {
  const sink = new engine.EncodedPacketSink(track)
  const times: number[] = []
  let first = await sink.getFirstPacket({ metadataOnly: true })
  if (first && first.type !== "key")
    first = await sink.getNextKeyPacket(first, { metadataOnly: true })
  for (
    let packet = first;
    packet;
    packet = await sink.getNextKeyPacket(packet, { metadataOnly: true })
  ) {
    times.push(packet.timestamp)
    if (times.length > MOST_KEYFRAMES) return null
  }
  return times
}

async function factsOf(
  engine: Engine,
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
    const keyframes = await keyframesOf(engine, videoTrack).catch(() => null)
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
      keyframes,
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
      facts = await factsOf(engine, input, container, file.size)
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

/** Speed and fades are made by the hooks. */
const timed = (plan: Plan) =>
  plan.speed !== 1 || plan.fade.in > 0 || plan.fade.out > 0

/** Hooks one after the other: what one drops, the next never sees; the last may give a canvas. */
function chained<T>(
  steps: ((sample: T) => T | null)[],
  last: ((sample: T) => unknown) | null
) {
  if (!steps.length && !last) return {}
  return {
    process: (sample: T) => {
      let kept: T | null = sample
      for (const step of steps) {
        kept = step(kept)
        if (kept === null) return null
      }
      return last ? last(kept) : kept
    },
  }
}

/** Several parts cut to the frame need the hooks; one is a trim. */
const hooked = (plan: Plan) =>
  plan.cut?.mode === "exact" && plan.cut.parts.length > 1
    ? plan.cut.parts
    : null

function videoOptions(
  engine: Engine,
  plan: Plan,
  software: boolean
): Mediabunny.ConversionVideoOptions | undefined {
  const video = plan.video
  if (video.action === "none") return undefined
  if (video.action === "copy") return { rotate: plan.rotate, flip: plan.flip }
  const parts = hooked(plan)
  const canvasOf = (width: number, height: number) =>
    new OffscreenCanvas(width, height)
  // A crop is drawn by our own hook (see `cropPicture`), at the result's size.
  const steps = [
    ...(plan.crop
      ? [
          cropPicture(
            engine.VideoSample,
            plan.crop,
            video.width,
            video.height,
            canvasOf
          ),
        ]
      : []),
    ...(parts ? [cutPicture(parts)] : []),
  ]
  return {
    ...(chained(
      steps,
      timed(plan)
        ? shapePicture(plan.speed, plan.fade, plan.length, canvasOf)
        : null
    ) as Pick<Mediabunny.ConversionVideoOptions, "process">),
    ...(plan.crop
      ? { processedWidth: video.width, processedHeight: video.height }
      : { width: video.width, height: video.height, fit: "fill" as const }),
    codec: video.codec,
    // In the file's own time: the hook then moves frames to the result's.
    frameRate: video.frameRate ? video.frameRate / plan.speed : undefined,
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

/**
 * The sound's hooks for a plan: the parts cut to the frame, then speed,
 * fades, gain and limiter. Null when the sound passes as it is. The same
 * hooks measure a sound before its gain is chosen, so it is measured as it
 * will be written.
 */
function soundHooks(engine: Engine, plan: Plan, gain: SoundGain | null) {
  const parts = hooked(plan)
  const cut = parts ? cutSound(engine.AudioSample, parts) : null
  const shape =
    timed(plan) || gain
      ? shapeSound(
          engine.AudioSample,
          plan.speed,
          plan.fade,
          plan.length * plan.speed,
          gain
        )
      : null
  if (!cut && !shape) return null
  return {
    process: (sample: Mediabunny.AudioSample) =>
      shape ? (cut ? cut(sample) : [sample]).flatMap(shape) : cut!(sample),
    limited: () => shape?.limited() ?? 0,
  }
}

function audioOptions(
  engine: Engine,
  plan: Plan,
  hooks: ReturnType<typeof soundHooks>
): Mediabunny.ConversionAudioOptions | undefined {
  const audio = plan.audio
  if (audio.action === "drop") return { discard: true }
  if (audio.action !== "encode") return undefined
  return {
    ...(hooks ? { process: hooks.process } : {}),
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
    gain = null,
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    /** Encode the picture in software, after the hardware failed. */
    software?: boolean
    /** The sound's gain and ceiling, worked out from measuring it. */
    gain?: SoundGain | null
  } = {}
): Promise<{ limited: number }> {
  const input = opened(engine, file)
  const hooks =
    plan.audio.action === "encode" ? soundHooks(engine, plan, gain) : null
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
      copy: { shiftTolerance: 1, boundaryPolicy: "expand" },
      video: videoOptions(engine, plan, software),
      ...(plan.cut
        ? {
            trim: {
              start: plan.cut.parts[0].start,
              end: plan.cut.parts.at(-1)!.end,
            },
          }
        : {}),
      audio: audioOptions(engine, plan, hooks),
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
    return { limited: hooks?.limited() ?? 0 }
  } finally {
    input.dispose()
  }
}

/**
 * How loud a file's sound is. With a plan, measured as it will be written:
 * the parts kept, through the same hooks (speed, fades), before any gain;
 * without, the file's sound as it is (a result). Null with no sound to read.
 */
export async function measureSound(
  engine: Engine,
  file: Blob,
  plan: Plan | null,
  signal?: AbortSignal
): Promise<Loudness | null> {
  const input = opened(engine, file)
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) return null
    const parts = plan?.cut?.parts ?? null
    const start = parts?.[0].start ?? 0
    const end = parts?.at(-1)!.end ?? Infinity
    const hooks = plan ? soundHooks(engine, plan, null) : null
    let meter: LoudnessMeter | null = null
    const measure = (sample: Mediabunny.AudioSample) => {
      meter ??= new LoudnessMeter(sample.sampleRate, sample.numberOfChannels)
      meter.push(
        Array.from({ length: sample.numberOfChannels }, (_, plane) => {
          const values = new Float32Array(sample.numberOfFrames)
          sample.copyTo(values, { planeIndex: plane, format: "f32-planar" })
          return values
        })
      )
      sample.close()
    }
    const sink = new engine.AudioSampleSink(track)
    for await (const sample of sink.samples(start, end)) {
      if (signal?.aborted) {
        sample.close()
        break
      }
      // Only the frames inside what is kept, on its clock, as a trim gives them.
      const rate = sample.sampleRate
      const first = Math.max(0, Math.round((start - sample.timestamp) * rate))
      const last = Math.min(
        sample.numberOfFrames,
        Math.round((end - sample.timestamp) * rate)
      )
      if (last <= first) {
        sample.close()
        continue
      }
      const inside =
        first > 0 || last < sample.numberOfFrames
          ? sample.trim(first, last)
          : sample
      if (inside !== sample) sample.close()
      inside.setTimestamp(inside.timestamp - start)
      if (hooks) for (const out of hooks.process(inside)) measure(out)
      else measure(inside)
    }
    const map = (meter as LoudnessMeter | null)?.result()
    return map ? loudnessOf(map) : null
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
    const facts = await factsOf(engine, input, container, file.size)
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
  shown: { width: number; height: number; duration: number },
  /** Where a moment of the result comes from in the original: itself, unless parts were cut. */
  from: (time: number) => number = (time) => time
): Promise<Looks | null> {
  if (typeof OffscreenCanvas === "undefined") return null
  const size = lookSize(shown.width, shown.height)
  const times = moments(0, shown.duration)
  const [before, after] = await Promise.all([
    framesAt(engine, original, times.map(from), size),
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

/** The frame shown at a moment, as a PNG at the size it is shown, turned as players turn it. */
export async function frameAt(engine: Engine, file: Blob, time: number) {
  const input = opened(engine, file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode()))
      throw new VideoProblem("This browser cannot play this video's picture.")
    const sink = new engine.CanvasSink(track)
    const frame = await sink.getCanvas(time)
    if (!frame) throw new VideoProblem("There is no picture at that moment.")
    const canvas = frame.canvas
    return "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("No picture."))),
            "image/png"
          )
        )
  } finally {
    input.dispose()
  }
}

/** Small pictures of frames spread along a file, for a timeline; none when its picture cannot be read. */
export async function stripOf(
  engine: Engine,
  file: Blob,
  count: number,
  height = 48
) {
  const input = opened(engine, file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) return []
    const start = await track.getFirstTimestamp()
    const length = (await track.computeDuration()) - start
    const sink = new engine.CanvasSink(track, { height, poolSize: 1 })
    const pictures: Blob[] = []
    const times = Array.from(
      { length: count },
      (_, index) => start + ((index + 0.5) * length) / count
    )
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      if (!frame) continue
      const canvas = frame.canvas
      pictures.push(
        "convertToBlob" in canvas
          ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 })
          : await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(
                (blob) =>
                  blob ? resolve(blob) : reject(new Error("No picture.")),
                "image/jpeg",
                0.7
              )
            )
      )
    }
    return pictures
  } finally {
    input.dispose()
  }
}

/** A turn and mirror on top of another: a turn after a mirror runs the other way. */
export function composeTurn(
  first: { rotation: number; flip: boolean },
  then: { rotation: number; flip: boolean }
) {
  return first.flip
    ? {
        rotation: (first.rotation - then.rotation + 360) % 360,
        flip: !then.flip,
      }
    : { rotation: (first.rotation + then.rotation) % 360, flip: then.flip }
}

/**
 * Several parts joined without encoding: each part's packets, the picture
 * from the keyframe the part starts on to the one the next part of the
 * stream starts on, the sound alongside, copied with their times closed
 * up. The parts are planned on keyframes (`snapOut`).
 */
export async function joinParts(
  engine: Engine,
  file: Blob,
  plan: Plan,
  target: Mediabunny.Target,
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}
) {
  const parts = plan.cut!.parts
  const input = opened(engine, file)
  try {
    const output = new engine.Output({
      format: formatFor(engine, plan.container),
      target,
    })
    const picture = await input.getPrimaryVideoTrack()
    const sound =
      plan.audio.action === "copy" ? await input.getPrimaryAudioTrack() : null
    const turn = picture
      ? composeTurn(
          {
            rotation: await picture.getRotation(),
            flip: await picture.getFlip(),
          },
          { rotation: plan.rotate, flip: plan.flip }
        )
      : null
    const pictureSource = picture
      ? new engine.EncodedVideoPacketSource((await picture.getCodec())!)
      : null
    const soundSource = sound
      ? new engine.EncodedAudioPacketSource((await sound.getCodec())!)
      : null
    if (pictureSource)
      output.addVideoTrack(pictureSource, {
        rotation: turn!.rotation as Turn,
        flip: turn!.flip,
      })
    if (soundSource) output.addAudioTrack(soundSource)
    if (plan.keepTags) output.setMetadataTags(await input.getMetadataTags())
    await output.start()
    const total = parts.reduce((sum, part) => sum + part.end - part.start, 0)
    let offset = 0
    let pictureConfig = picture ? await picture.getDecoderConfig() : null
    let soundConfig = sound ? await sound.getDecoderConfig() : null
    for (const part of parts) {
      if (picture && pictureSource) {
        const sink = new engine.EncodedPacketSink(picture)
        const first = await sink.getKeyPacket(part.start)
        const last = await sink.getKeyPacket(part.end)
        // A part ends on a keyframe, unless it runs to the end of the file.
        const end =
          last &&
          Math.abs(last.timestamp - part.end) < 1e-6 &&
          last.timestamp > (first?.timestamp ?? 0) + 1e-6
            ? last
            : undefined
        for await (const packet of sink.packets(first ?? undefined, end)) {
          signal?.throwIfAborted()
          if (packet.timestamp >= part.end - 1e-6 && !end) break
          await pictureSource.add(
            packet.clone({ timestamp: packet.timestamp - part.start + offset }),
            pictureConfig ? { decoderConfig: pictureConfig } : undefined
          )
          pictureConfig = null
          onProgress?.(
            Math.min(1, (offset + packet.timestamp - part.start) / total)
          )
        }
      }
      if (sound && soundSource) {
        const sink = new engine.EncodedPacketSink(sound)
        let packet = await sink.getPacket(part.start)
        if (packet && packet.timestamp < part.start - 1e-6)
          packet = await sink.getNextPacket(packet)
        for (
          ;
          packet && packet.timestamp < part.end - 1e-6;
          packet = await sink.getNextPacket(packet)
        ) {
          signal?.throwIfAborted()
          await soundSource.add(
            packet.clone({ timestamp: packet.timestamp - part.start + offset }),
            soundConfig ? { decoderConfig: soundConfig } : undefined
          )
          soundConfig = null
        }
      }
      offset += part.end - part.start
    }
    pictureSource?.close()
    soundSource?.close()
    await output.finalize()
  } finally {
    input.dispose()
  }
}
