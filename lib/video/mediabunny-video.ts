/**
 * The only video module that uses Mediabunny. It is handed the library,
 * so the same code runs in the worker and in Node. Reading, writing by a
 * plan, and reading a result back.
 */
import type * as Mediabunny from "mediabunny"
import type { Container, OutContainer } from "./formats"
import type { Decoded } from "./check"
import type { Plan, Turn, VideoCodec, VideoFacts } from "./settings"
import type { JoinPlan } from "./join"
import { lookSize, moments, type Looks } from "./looks"
import { cutPicture, cutSound } from "./cut"
import {
  cropPicture,
  fadeGain,
  shapePicture,
  shapeSound,
  type Layers,
  type SoundGain,
} from "./effects"
import {
  decibels,
  LoudnessMeter,
  loudnessOf,
  type Loudness,
} from "@/lib/audio/loudness"
import { Limiter } from "@/lib/audio/limiter"
import { Resampler } from "@/lib/audio/resample"
import { FrameQueue, matchChannels, mixed, type TrackFacts } from "./soundtrack"
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
/** As are text and a logo on the picture. */
const drawn = (plan: Plan) =>
  timed(plan) || plan.overlay !== null || plan.subtitles !== null

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
  software: boolean,
  layers: Layers | null
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
      drawn(plan)
        ? shapePicture(plan.speed, plan.fade, plan.length, canvasOf, layers)
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
    layers = null,
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    /** Encode the picture in software, after the hardware failed. */
    software?: boolean
    /** The sound's gain and ceiling, worked out from measuring it. */
    gain?: SoundGain | null
    /** Text and a logo drawn over the frames, made at the result's size. */
    layers?: Layers | null
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
      video: videoOptions(engine, plan, software, layers),
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

/** A sample's channels, as floats. */
function planesOfSample(sample: Mediabunny.AudioSample) {
  return Array.from({ length: sample.numberOfChannels }, (_, plane) => {
    const values = new Float32Array(sample.numberOfFrames)
    sample.copyTo(values, { planeIndex: plane, format: "f32-planar" })
    return values
  })
}

/**
 * A file's sound on the result's clock: with a plan, the parts kept through
 * the same hooks as it is written (cuts, speed, fades), before any gain;
 * without, as it is. Nothing when it has no sound this browser plays.
 */
async function* keptSound(
  engine: Engine,
  input: Mediabunny.Input,
  plan: Plan | null,
  signal?: AbortSignal
): AsyncGenerator<Mediabunny.AudioSample> {
  const track = await input.getPrimaryAudioTrack()
  if (!track || !(await track.canDecode())) return
  const parts = plan?.cut?.parts ?? null
  const start = parts?.[0].start ?? 0
  const end = parts?.at(-1)!.end ?? Infinity
  const hooks = plan ? soundHooks(engine, plan, null) : null
  const sink = new engine.AudioSampleSink(track)
  for await (const sample of sink.samples(start, end)) {
    if (signal?.aborted) {
      sample.close()
      return
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
    if (hooks) yield* hooks.process(inside)
    else yield inside
  }
}

/** How loud the samples are, as the audio workspace's meter reads them. */
async function measured(samples: AsyncIterable<Mediabunny.AudioSample>) {
  let meter: LoudnessMeter | null = null
  for await (const sample of samples) {
    meter ??= new LoudnessMeter(sample.sampleRate, sample.numberOfChannels)
    meter.push(planesOfSample(sample))
    sample.close()
  }
  const map = (meter as LoudnessMeter | null)?.result()
  return map ? loudnessOf(map) : null
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
    return await measured(keptSound(engine, input, plan, signal))
  } finally {
    input.dispose()
  }
}

/** What a soundtrack's file holds: its sound's length, rate, channels and codec, and whether this browser plays it. */
export async function readTrack(
  engine: Engine,
  file: Blob,
  name: string
): Promise<Omit<TrackFacts, "id">> {
  const input = opened(engine, file)
  try {
    const track = await input.getPrimaryAudioTrack().catch(() => null)
    if (!track)
      throw new VideoProblem(`${name} has no sound to use as a soundtrack.`)
    return {
      name,
      duration: await track.computeDuration(),
      sampleRate: track.sampleRate,
      channels: track.numberOfChannels,
      codec: track.codec,
      decodable: await track.canDecode(),
    }
  } catch (error) {
    if (error instanceof VideoProblem) throw error
    throw new VideoProblem(`${name} could not be read as sound.`)
  } finally {
    input.dispose()
  }
}

/** How many frames are made at a time for a soundtrack. */
const RUN = 4096

/**
 * The sound written under a video with a soundtrack: the soundtrack (its
 * channels matched, resampled to the result's rate, played again while
 * the video lasts when it loops, faded out where the video ends it), at
 * its volume under the video's own sound when they are mixed, faded as the
 * plan fades, and, with a gain, made louder or quieter and held under its
 * ceiling by the limiter. Exactly the result's length, on its clock.
 */
async function* soundtrackRuns(
  engine: Engine,
  source: Mediabunny.Input,
  music: Mediabunny.Input,
  plan: Plan,
  gain: SoundGain | null,
  report: { limited: number },
  signal?: AbortSignal
): AsyncGenerator<Mediabunny.AudioSample> {
  const track = plan.track!
  const musicTrack = (await music.getPrimaryAudioTrack())!
  const own = track.mixing ? await source.getPrimaryAudioTrack() : null
  const rate = own ? own.sampleRate : musicTrack.sampleRate
  const channels = own ? own.numberOfChannels : musicTrack.numberOfChannels
  const total = Math.round(plan.length * rate)
  const ownRuns = own ? keptSound(engine, source, plan, signal) : null
  const ownQueue = new FrameQueue(channels)
  const musicQueue = new FrameQueue(channels)
  const resampler =
    musicTrack.sampleRate === rate
      ? null
      : new Resampler(channels, musicTrack.sampleRate / rate)
  // From 0 s: what a sound file holds before it (an AAC encoder's priming)
  // is not sound, and fed to it first, WebKit's decoder on Linux decodes
  // every frame after it wrongly.
  let musicRuns = new engine.AudioSampleSink(musicTrack).samples(0)
  let musicEnded = false
  /** Fill the music queue to `frames`, playing it again while it loops. */
  async function fillMusic(frames: number) {
    while (musicQueue.size < frames && !musicEnded) {
      const next = await musicRuns.next()
      if (next.done) {
        if (track.loop) {
          musicRuns = new engine.AudioSampleSink(musicTrack).samples(0)
          continue
        }
        if (resampler) musicQueue.push(resampler.flush())
        musicEnded = true
        return
      }
      const planes = matchChannels(planesOfSample(next.value), channels)
      next.value.close()
      musicQueue.push(resampler ? resampler.process(planes) : planes)
    }
  }
  async function fillOwn(frames: number) {
    while (ownRuns && ownQueue.size < frames) {
      const next = await ownRuns.next()
      if (next.done) return
      ownQueue.push(matchChannels(planesOfSample(next.value), channels))
      next.value.close()
    }
  }
  const cutAtEnd = track.loop || track.duration > plan.length + 0.05
  const limiter = gain?.ceiling
    ? new Limiter(rate, channels, gain.ceiling)
    : null
  const level = gain ? 10 ** (gain.db / 20) : 1
  let given = 0
  try {
    for (let start = 0; start < total; start += RUN) {
      signal?.throwIfAborted()
      const frames = Math.min(RUN, total - start)
      await fillMusic(frames)
      await fillOwn(frames)
      const music = musicQueue.take(frames)
      // The plan's fades on the soundtrack too (the video's own is faded by its hooks).
      if (plan.fade.in > 0 || plan.fade.out > 0)
        for (let index = 0; index < frames; index++) {
          const value = fadeGain((start + index) / rate, plan.length, plan.fade)
          if (value < 1) for (const plane of music) plane[index] *= value
        }
      let planes: Float32Array[] = mixed(
        music,
        own ? ownQueue.take(frames) : null,
        {
          volume: own ? track.volume : 0,
          start,
          total,
          rate,
          cutAtEnd,
        }
      )
      if (level !== 1)
        planes = planes.map((plane) => plane.map((value) => value * level))
      if (limiter) {
        planes = limiter.process(planes)
        if (start + frames >= total) {
          const tail = limiter.flush()
          planes = planes.map((plane, channel) => {
            const out = new Float32Array(plane.length + tail[channel].length)
            out.set(plane)
            out.set(tail[channel], plane.length)
            return out
          })
        }
      }
      const count = planes[0].length
      if (!count) continue
      const data = new Float32Array(count * channels)
      planes.forEach((plane, channel) => data.set(plane, channel * count))
      yield new engine.AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: given / rate,
      })
      given += count
    }
  } finally {
    // The readers may hold decoded sound the video's end left unused.
    await musicRuns.return(undefined)
    await ownRuns?.return(undefined)
  }
  report.limited = limiter ? -decibels(limiter.lowest) : 0
}

/** How loud a video's sound with its soundtrack will be, before any gain. */
export async function measureSoundtrack(
  engine: Engine,
  file: Blob,
  music: Blob,
  plan: Plan,
  signal?: AbortSignal
) {
  const source = opened(engine, file)
  const musicInput = opened(engine, music)
  try {
    return await measured(
      soundtrackRuns(
        engine,
        source,
        musicInput,
        plan,
        null,
        { limited: 0 },
        signal
      )
    )
  } finally {
    source.dispose()
    musicInput.dispose()
  }
}

/**
 * A written picture put together with a soundtrack: the picture's packets
 * copied as they are, its turn kept, and the sound (`soundtrackRuns`)
 * encoded beside it, the two given to the file in order of time.
 */
export async function withSoundtrack(
  engine: Engine,
  picture: Blob,
  file: Blob,
  music: Blob,
  plan: Plan,
  target: Mediabunny.Target,
  {
    signal,
    onProgress,
    gain = null,
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    gain?: SoundGain | null
  } = {}
): Promise<{ limited: number }> {
  const written = opened(engine, picture)
  const source = opened(engine, file)
  const musicInput = opened(engine, music)
  try {
    const audio = plan.audio
    if (audio.action !== "encode")
      throw new VideoProblem("A soundtrack needs its sound encoded.")
    const pictureTrack = (await written.getPrimaryVideoTrack())!
    const output = new engine.Output({
      format: formatFor(engine, plan.container),
      target,
    })
    const pictureSource = new engine.EncodedVideoPacketSource(
      (await pictureTrack.getCodec())!
    )
    output.addVideoTrack(pictureSource, {
      rotation: (await pictureTrack.getRotation()) as Turn,
      flip: await pictureTrack.getFlip(),
    })
    const soundSource = new engine.AudioSampleSource({
      codec: audio.codec,
      quality: new engine.Quality({ bitrate: audio.bitrate }),
      ...(audio.codec === "opus" ? { transform: { sampleRate: 48000 } } : {}),
    })
    output.addAudioTrack(soundSource)
    if (plan.keepTags) output.setMetadataTags(await source.getMetadataTags())
    await output.start()
    const report = { limited: 0 }
    const sound = soundtrackRuns(
      engine,
      source,
      musicInput,
      plan,
      gain,
      report,
      signal
    )
    const packets = new engine.EncodedPacketSink(pictureTrack).packets()
    let config = await pictureTrack.getDecoderConfig()
    let nextPacket = await packets.next()
    let nextSound = await sound.next()
    // In order of time, so the file is written as it goes.
    while (!nextPacket.done || !nextSound.done) {
      signal?.throwIfAborted()
      const soundFirst =
        nextPacket.done ||
        (!nextSound.done &&
          nextSound.value.timestamp < nextPacket.value.timestamp)
      if (soundFirst && !nextSound.done) {
        await soundSource.add(nextSound.value)
        nextSound.value.close()
        nextSound = await sound.next()
      } else if (!nextPacket.done) {
        await pictureSource.add(
          nextPacket.value,
          config ? { decoderConfig: config } : undefined
        )
        config = null
        onProgress?.(Math.min(1, nextPacket.value.timestamp / plan.length))
        nextPacket = await packets.next()
      }
    }
    pictureSource.close()
    soundSource.close()
    await output.finalize()
    return report
  } finally {
    written.dispose()
    source.dispose()
    musicInput.dispose()
  }
}

/**
 * Whether every frame of a picture decodes, counted against its packets:
 * WebKit's decoder on Linux gives the frames after a keyframe before zero
 * (an edit list's lead-in) the last time before zero, so a frame cannot
 * be found by its time there. Returns the last frame decoded, or null.
 */
async function everyFrame(
  engine: Engine,
  picture: Mediabunny.InputVideoTrack,
  sink: Mediabunny.VideoSampleSink
) {
  let packets = 0
  for await (const packet of new engine.EncodedPacketSink(picture).packets(
    undefined,
    undefined,
    { metadataOnly: true }
  )) {
    void packet
    packets++
  }
  let frames = 0
  let last: Mediabunny.VideoSample | null = null
  for await (const sample of sink.samples()) {
    frames++
    last?.close()
    last = sample
  }
  if (frames === packets) return last
  last?.close()
  return null
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
      // What is shown starts at 0: an edit list keeps earlier frames only to decode from.
      const start = Math.max(0, await picture.getFirstTimestamp())
      // Where the picture ends: its own time, not a length after its start,
      // which an edit list can put before zero.
      const end = await picture.computeDuration()
      try {
        const first = await sink.getSample(start)
        let last = await sink.getSample(Math.max(start, end - 0.001))
        if (first && !last) last = await everyFrame(engine, picture, sink)
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

/** Whether two decoder setups are the same: codec, size and their bytes. */
function sameSetup(a: VideoDecoderConfig | null, b: VideoDecoderConfig | null) {
  if (!a || !b) return false
  if (a.codec !== b.codec || a.codedWidth !== b.codedWidth) return false
  if (a.codedHeight !== b.codedHeight) return false
  const bytes = (config: VideoDecoderConfig) =>
    config.description
      ? new Uint8Array(
          ArrayBuffer.isView(config.description)
            ? config.description.buffer.slice(
                config.description.byteOffset,
                config.description.byteOffset + config.description.byteLength
              )
            : config.description
        )
      : new Uint8Array(0)
  const left = bytes(a)
  const right = bytes(b)
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

/**
 * One video's sound for a joined file: decoded, its channels matched,
 * resampled to the joined rate, and exactly `frames` long (silence where
 * it is shorter or has none), on the joined clock from `start` frames.
 */
async function* segmentSound(
  engine: Engine,
  input: Mediabunny.Input,
  sound: NonNullable<JoinPlan["sound"]>,
  start: number,
  frames: number,
  signal?: AbortSignal
): AsyncGenerator<Mediabunny.AudioSample> {
  const { sampleRate: rate, channels } = sound
  const track = await input.getPrimaryAudioTrack()
  const playable = track && (await track.canDecode()) ? track : null
  const queue = new FrameQueue(channels)
  const resampler =
    playable && playable.sampleRate !== rate
      ? new Resampler(channels, playable.sampleRate / rate)
      : null
  // From 0 s, as for a soundtrack (`soundtrackRuns`).
  const runs = playable ? new engine.AudioSampleSink(playable).samples(0) : null
  let ended = !runs
  let given = 0
  try {
    while (given < frames) {
      signal?.throwIfAborted()
      const wanted = Math.min(RUN, frames - given)
      while (!ended && queue.size < wanted) {
        const next = await runs!.next()
        if (next.done) {
          if (resampler) queue.push(resampler.flush())
          ended = true
          break
        }
        const planes = matchChannels(planesOfSample(next.value), channels)
        next.value.close()
        queue.push(resampler ? resampler.process(planes) : planes)
      }
      const planes = queue.take(wanted)
      const data = new Float32Array(wanted * channels)
      planes.forEach((plane, channel) => data.set(plane, channel * wanted))
      yield new engine.AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: channels,
        sampleRate: rate,
        timestamp: (start + given) / rate,
      })
      given += wanted
    }
  } finally {
    await runs?.return(undefined)
  }
}

/**
 * Videos joined in order into one file (`joinPlan`): the pictures' packets
 * copied when every one was written alike (the codec, size, turn and
 * decoder setup), each frame drawn at the joined size and encoded
 * otherwise; the sound written anew. Says which was done.
 */
export async function joinVideos(
  engine: Engine,
  files: Blob[],
  plan: JoinPlan,
  target: Mediabunny.Target,
  {
    signal,
    onProgress,
    software = false,
  }: {
    signal?: AbortSignal
    onProgress?: (fraction: number) => void
    software?: boolean
  } = {}
): Promise<{ copied: boolean }> {
  const inputs = files.map((file) => opened(engine, file))
  try {
    const pictures = await Promise.all(
      inputs.map(async (input) => (await input.getPrimaryVideoTrack())!)
    )
    const setups = await Promise.all(
      pictures.map((picture) => picture.getDecoderConfig())
    )
    const turns = await Promise.all(
      pictures.map(async (picture) => ({
        rotation: await picture.getRotation(),
        flip: await picture.getFlip(),
      }))
    )
    const copied =
      plan.copyable &&
      setups.every((setup) => sameSetup(setup, setups[0])) &&
      turns.every(
        (turn) =>
          turn.rotation === turns[0].rotation && turn.flip === turns[0].flip
      )
    const output = new engine.Output({
      format: formatFor(engine, plan.container),
      target,
    })
    let packetSource: Mediabunny.EncodedVideoPacketSource | null = null
    let frameSource: Mediabunny.VideoSampleSource | null = null
    if (copied) {
      packetSource = new engine.EncodedVideoPacketSource(
        (await pictures[0].getCodec())!
      )
      output.addVideoTrack(packetSource, {
        rotation: turns[0].rotation as Turn,
        flip: turns[0].flip,
      })
    } else {
      let codec: VideoCodec | null = null
      for (const candidate of plan.codecs)
        if (
          await engine.canEncodeVideo(candidate, {
            width: plan.width,
            height: plan.height,
            bitrate: plan.bitrate,
          })
        ) {
          codec = candidate
          break
        }
      if (!codec)
        throw new VideoProblem(
          `This browser cannot write a picture ${plan.container.toUpperCase()} holds at ${plan.width} × ${plan.height}.`
        )
      frameSource = new engine.VideoSampleSource({
        codec,
        quality: new engine.Quality({ bitrate: plan.bitrate }),
        keyFrameInterval: 2,
        ...(software
          ? { hardwareAcceleration: "prefer-software" as const }
          : {}),
      })
      output.addVideoTrack(frameSource)
    }
    const soundSource = plan.sound
      ? new engine.AudioSampleSource({
          codec: plan.sound.codec,
          quality: new engine.Quality({ bitrate: plan.sound.bitrate }),
        })
      : null
    if (soundSource) output.addAudioTrack(soundSource)
    await output.start()
    const canvas = copied ? null : new OffscreenCanvas(plan.width, plan.height)
    const context = canvas?.getContext("2d") ?? null
    let offset = 0
    let soundFrames = 0
    let config: VideoDecoderConfig | null = setups[0]
    for (const [index, picture] of pictures.entries()) {
      const length = await picture.computeDuration()
      const start = await picture.getFirstTimestamp()
      // The picture's frames or packets, and the sound for as long as it.
      const frames: AsyncGenerator<
        Mediabunny.EncodedPacket | Mediabunny.VideoSample
      > = copied
        ? new engine.EncodedPacketSink(picture).packets()
        : new engine.VideoSampleSink(picture).samples()
      const until = plan.sound
        ? Math.round((offset + length - start) * plan.sound.sampleRate)
        : 0
      const sound =
        plan.sound && soundSource
          ? segmentSound(
              engine,
              inputs[index],
              plan.sound,
              soundFrames,
              until - soundFrames,
              signal
            )
          : null
      soundFrames = until
      let nextFrame = await frames.next()
      let nextSound = sound
        ? await sound.next()
        : { done: true as const, value: undefined }
      while (!nextFrame.done || !nextSound.done) {
        signal?.throwIfAborted()
        const at = nextFrame.done
          ? Infinity
          : offset + nextFrame.value.timestamp - start
        if (!nextSound.done && nextSound.value.timestamp < at) {
          await soundSource!.add(nextSound.value)
          nextSound.value.close()
          nextSound = await sound!.next()
          continue
        }
        if (nextFrame.done) break
        const frame = nextFrame.value
        if (copied) {
          await packetSource!.add(
            (frame as Mediabunny.EncodedPacket).clone({ timestamp: at }),
            config ? { decoderConfig: config } : undefined
          )
          config = null
        } else {
          const sample = frame as Mediabunny.VideoSample
          context!.fillStyle = "black"
          context!.fillRect(0, 0, plan.width, plan.height)
          sample.drawWithFit(context!, { fit: "contain" })
          const drawn = new engine.VideoSample(canvas!, {
            timestamp: at,
            duration: sample.duration,
          })
          await frameSource!.add(drawn)
          drawn.close()
          sample.close()
        }
        onProgress?.(Math.min(1, at / plan.length))
        nextFrame = await frames.next()
      }
      offset += length - start
    }
    packetSource?.close()
    frameSource?.close()
    soundSource?.close()
    await output.finalize()
    return { copied }
  } finally {
    for (const input of inputs) input.dispose()
  }
}
