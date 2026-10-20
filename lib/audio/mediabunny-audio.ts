/**
 * The only file that touches Mediabunny. It is handed the library, so the
 * same code runs in the worker and in Node: reading a file's facts, tags,
 * cover and waveform; writing a result by a plan, streaming, so a long
 * file is never held as samples; and hearing a result back for the check.
 */
import type * as Mediabunny from "mediabunny"
import type { Container } from "./formats"
import { lameTagged, mp3Gapless, mp3Kept } from "./gapless"
import { withEditList } from "./mp4-edit"
import { withOpusEnd } from "./ogg-end"
import { PeakBuilder, type Peaks } from "./peaks"
import { peakCount } from "./view"
import type { Plan, SourceFacts } from "./settings"
import type { Heard } from "./check"
import { editedBy, gainAt, lengthOf, type Edited, type Step } from "./edits"
import {
  dbLabel,
  defaultLevel,
  SAFE_CEILING,
  gainFor,
  MOST_RAISE,
  needsMeasure,
  takenOff,
  type Level,
  type LevelResult,
} from "./level"
import { holdsChapters, withMp3Chapters, withMp4Chapters } from "./chapters"
import { Joiner, joinsFor, startsOf, type Joining } from "./join"
import { Limiter } from "./limiter"
import { isPlain, SoundShaper, type SoundSettings } from "./sound"
import {
  integrated,
  LoudnessMeter,
  loudnessOf,
  SILENT,
  type Loudness,
  type LoudnessMap,
} from "./loudness"

type Engine = typeof Mediabunny

/** The tags shown and kept, as Mediabunny reads them. */
export interface TagSummary {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number
  trackNumber?: number
  comment?: string
}

export interface ReadFacts extends SourceFacts {
  /** The tags it has; cover art apart. */
  tags: TagSummary
  /** Its front cover, or first picture. */
  cover: { data: Uint8Array; mimeType: string } | null
  /** Whether this browser can decode its sound (otherwise the page decodes it). */
  decodable: boolean
  /** Which decoded samples are the sound, when an MP3 says (see `gapless.ts`). */
  kept: { start: number; length: number | null } | null
}

/** What is wrong with a file that cannot be used, in a sentence. */
export class AudioProblem extends Error {}

const input = (engine: Engine, file: Blob) =>
  new engine.Input({
    source: new engine.BlobSource(file),
    formats: engine.ALL_FORMATS,
  })

/** A decoder that gave no samples for this long has stopped answering. */
export const STALL_MS = 15_000

/** A decoder that stopped answering, in a sentence. */
export class Stalled extends AudioProblem {
  constructor() {
    super(
      "This browser's decoder stopped answering for this file. Try again, or try another browser."
    )
  }
}

/**
 * The samples of an iterator, each within `ms` of the one before: some
 * browsers' decoders stop answering without an error (WebKit on Linux),
 * which would leave a file waiting for ever.
 */
export async function* patiently<T>(
  samples: AsyncIterable<T>,
  ms = STALL_MS
): AsyncGenerator<T> {
  const iterator = samples[Symbol.asyncIterator]()
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const next = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Stalled()), ms)
      }),
    ]).finally(() => clearTimeout(timer))
    if (next.done) return
    yield next.value
  }
}

/**
 * Whether this browser really decodes a track: some say they can and then
 * fail on the first packet (Safari with FLAC), so its first second is
 * decoded to find out.
 */
async function decodes(engine: Engine, track: Mediabunny.InputAudioTrack) {
  if (!(await track.canDecode())) return false
  try {
    const start = await track.getFirstTimestamp()
    for await (const sample of patiently(
      new engine.AudioSampleSink(track).samples(start, start + 1)
    ))
      sample.close()
    return true
  } catch {
    return false
  }
}

/** The facts, tags and cover of a file. */
export async function readAudio(
  engine: Engine,
  file: Blob,
  container: Container
): Promise<ReadFacts> {
  let opened: Mediabunny.Input
  let track: Mediabunny.InputAudioTrack | null
  try {
    opened = input(engine, file)
    track = await opened.getPrimaryAudioTrack()
  } catch {
    throw new AudioProblem(
      "This file could not be read. It may be damaged, or of a kind not read here."
    )
  }
  try {
    const hasVideo = (await opened.getPrimaryVideoTrack()) !== null
    if (!track)
      throw new AudioProblem(
        hasVideo
          ? "This video has no sound to take out."
          : "This file has no sound in it."
      )
    const duration = await track.computeDuration()
    const read = await opened
      .getMetadataTags()
      .catch(() => ({}) as Mediabunny.MetadataTags)
    const image =
      read.images?.find((one) => one.kind === "coverFront") ?? read.images?.[0]
    let kept: ReadFacts["kept"] = null
    if (track.codec === "mp3") {
      const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
      const gapless = mp3Gapless(head)
      if (gapless) kept = mp3Kept(gapless)
    }
    return {
      container,
      codec: track.codec,
      sampleRate: track.sampleRate,
      channels: track.numberOfChannels,
      duration:
        kept?.length != null ? kept.length / track.sampleRate : duration,
      hasVideo,
      tags: {
        title: read.title,
        artist: read.artist,
        album: read.album,
        albumArtist: read.albumArtist,
        genre: read.genre,
        year: read.date?.getFullYear(),
        trackNumber: read.trackNumber,
        comment: read.comment,
      },
      cover: image ? { data: image.data, mimeType: image.mimeType } : null,
      decodable: await decodes(engine, track),
      kept,
    }
  } finally {
    opened.dispose()
  }
}

/**
 * Every decoded chunk of a file's sound that is the sound itself, in
 * order, each as one array per channel: the samples before time 0 and
 * after the end, or (for an MP3) its delay and padding, are left out.
 */
export async function* soundOf(
  engine: Engine,
  file: Blob,
  kept: ReadFacts["kept"],
  signal?: AbortSignal
): AsyncGenerator<{ planes: Float32Array[]; sampleRate: number }> {
  const opened = input(engine, file)
  try {
    const track = await opened.getPrimaryAudioTrack()
    if (!track) return
    const end = await track.computeDuration()
    let decoded = 0
    for await (const sample of patiently(
      new engine.AudioSampleSink(track).samples()
    )) {
      if (signal?.aborted) {
        sample.close()
        return
      }
      const frames = sample.numberOfFrames
      const rate = sample.sampleRate
      // Which frames of this chunk are kept: by count for an MP3, by time otherwise.
      let from: number
      let to: number
      if (kept) {
        const last = kept.length === null ? Infinity : kept.start + kept.length
        from = Math.max(0, kept.start - decoded)
        to = Math.min(frames, last - decoded)
      } else {
        from = Math.max(0, Math.round(-sample.timestamp * rate))
        to = Math.min(frames, Math.round((end - sample.timestamp) * rate))
      }
      decoded += frames
      if (to > from) {
        const planes = Array.from(
          { length: sample.numberOfChannels },
          (_, plane) => {
            const all = new Float32Array(frames)
            sample.copyTo(all, { planeIndex: plane, format: "f32-planar" })
            return from === 0 && to === frames ? all : all.slice(from, to)
          }
        )
        yield { planes, sampleRate: rate }
      }
      sample.close()
    }
  } finally {
    opened.dispose()
  }
}

/** A file's waveform and loudness, made by decoding it once. */
export async function overviewOf(
  engine: Engine,
  file: Blob,
  facts: Pick<ReadFacts, "duration" | "sampleRate" | "kept">,
  signal?: AbortSignal
): Promise<{ peaks: Peaks; loudness: LoudnessMap | null }> {
  const builder = new PeakBuilder(
    Math.round(facts.duration * facts.sampleRate),
    peakCount(facts.duration)
  )
  let meter: LoudnessMeter | null = null
  for await (const chunk of soundOf(engine, file, facts.kept, signal)) {
    builder.push(chunk.planes)
    meter ??= new LoudnessMeter(chunk.sampleRate, chunk.planes.length)
    meter.push(chunk.planes)
  }
  return { peaks: builder.result(), loudness: meter?.result() ?? null }
}

/** The format a plan is written in, as Mediabunny makes it. */
function outputFormat(engine: Engine, plan: Plan, longWav: boolean) {
  switch (plan.format) {
    case "mp3":
      return new engine.Mp3OutputFormat()
    case "m4a":
    case "m4r":
      return new engine.Mp4OutputFormat({ fastStart: "in-memory" })
    case "opus":
    case "ogg":
      return new engine.OggOutputFormat()
    case "flac":
      return new engine.FlacOutputFormat()
    case "wav":
      return new engine.WavOutputFormat({ large: longWav })
  }
}

/** The full scale of each integer sample format. */
const FULL_SCALE = { s16: 32768, s32: 2147483648 } as const

/**
 * A sample as whole numbers, for a lossless encoder: each value times the
 * full scale, rounded and kept in range. Decoders give floats as the whole
 * number over the full scale, so this is exact for every value they give;
 * the library's own conversion scales by one less and truncates, which
 * lowered every positive sample by one.
 */
export function asIntegers(
  engine: Engine,
  sample: Mediabunny.AudioSample,
  format: "s16" | "s32"
): Mediabunny.AudioSample {
  const frames = sample.numberOfFrames
  const channels = sample.numberOfChannels
  const scale = FULL_SCALE[format]
  const out =
    format === "s16"
      ? new Int16Array(frames * channels)
      : new Int32Array(frames * channels)
  const plane = new Float32Array(frames)
  for (let channel = 0; channel < channels; channel++) {
    sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" })
    for (let index = 0; index < frames; index++) {
      const value = Math.round(plane[index] * scale)
      out[index * channels + channel] =
        value >= scale ? scale - 1 : value < -scale ? -scale : value
    }
  }
  const made = new engine.AudioSample({
    data: out,
    format,
    numberOfChannels: channels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  })
  sample.close()
  return made
}

/** The first `frames` frames of a sample, as floats. */
export function firstFrames(
  engine: Engine,
  sample: Mediabunny.AudioSample,
  frames: number
): Mediabunny.AudioSample {
  const channels = sample.numberOfChannels
  const data = new Float32Array(frames * channels)
  const plane = new Float32Array(sample.numberOfFrames)
  for (let channel = 0; channel < channels; channel++) {
    sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" })
    data.set(plane.subarray(0, frames), channel * frames)
  }
  const made = new engine.AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  })
  sample.close()
  return made
}

/**
 * The frames of a sample the edits keep, at the loudness they give them,
 * as one sample at `timestamp`; null when they keep none. `at` is the
 * source time of the sample's first frame.
 */
export function shaped(
  engine: Engine,
  sample: Mediabunny.AudioSample,
  edited: Edited,
  at: number,
  timestamp: number
): Mediabunny.AudioSample | null {
  const frames = sample.numberOfFrames
  const channels = sample.numberOfChannels
  const rate = sample.sampleRate
  if (!frames) {
    sample.close()
    return null
  }
  const planes = Array.from({ length: channels }, (_, channel) => {
    const plane = new Float32Array(frames)
    sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" })
    return plane
  })
  sample.close()
  const kept = planes.map(() => new Float32Array(frames))
  let count = 0
  for (let index = 0; index < frames; index++) {
    const source = at + index / rate
    if (!edited.segments.some(([from, to]) => source >= from && source < to))
      continue
    const gain = gainAt(edited, source)
    for (let channel = 0; channel < channels; channel++)
      kept[channel][count] = planes[channel][index] * gain
    count++
  }
  if (!count) return null
  const data = new Float32Array(count * channels)
  kept.forEach((plane, channel) =>
    data.set(plane.subarray(0, count), channel * count)
  )
  return new engine.AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: rate,
    timestamp,
  })
}

/** Our own encoders, once registered in this worker: Mediabunny prefers them to the browser's. */
const registered = new Set<string>()

/**
 * Load our encoders: LAME for MP3 and libFLAC for FLAC always (the main
 * browsers have none, and WebKit on Linux has its own that lose the end of
 * the sound), FFmpeg's AAC encoder when the browser's will not do (see
 * `aacEncoding`).
 */
export async function readyEncoder(engine: Engine, codec: string) {
  if (registered.has(codec)) return
  if (codec === "mp3")
    (await import("@mediabunny/mp3-encoder")).registerMp3Encoder()
  else if (codec === "flac")
    (await import("@mediabunny/flac-encoder")).registerFlacEncoder()
  else if (codec === "aac")
    (await import("@mediabunny/aac-encoder")).registerAacEncoder()
  else return
  registered.add(codec)
}

/** The samples FFmpeg's AAC encoder, ours, puts before the sound. */
export const OWN_AAC_PRIMING = 1024

/** Where `heard` lines up with `played`: how many samples later it starts. */
export function lagOf(played: Float32Array, heard: Float32Array, most: number) {
  let best = 0
  let bestScore = -Infinity
  const length = Math.min(played.length, heard.length - most)
  for (let lag = 0; lag <= most; lag++) {
    let score = 0
    for (let index = 0; index < length; index++)
      score += played[index] * heard[index + lag]
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  return best
}

/**
 * The browser's AAC encoder, tried: a short burst of noise is encoded and
 * decoded again. Where it comes back is the encoder's priming (Apple's puts
 * 2,112 samples, FFmpeg's 1,024), and all of it must come back; null when
 * this browser cannot decode what it wrote.
 */
async function tryAac(
  engine: Engine,
  sampleRate: number,
  channels: number,
  bitrate: number
): Promise<{ priming: number; complete: boolean } | null> {
  try {
    const frames = 8192
    const noise = new Float32Array(frames * channels)
    let seed = 12345
    for (let index = 0; index < noise.length; index++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      noise[index] = (seed / 2 ** 32 - 0.5) * 0.5
    }
    const target = new engine.BufferTarget()
    const output = new engine.Output({
      format: new engine.Mp4OutputFormat(),
      target,
    })
    const source = new engine.AudioSampleSource({
      codec: "aac",
      quality: new engine.Quality({ bitrate }),
    })
    output.addAudioTrack(source)
    await output.start()
    const sample = new engine.AudioSample({
      data: noise,
      format: "f32",
      numberOfChannels: channels,
      sampleRate,
      timestamp: 0,
    })
    await source.add(sample)
    sample.close()
    await output.finalize()
    const heard: Float32Array[] = []
    const opened = input(engine, new Blob([target.buffer!]))
    try {
      const track = await opened.getPrimaryAudioTrack()
      if (!track || !(await track.canDecode())) return null
      for await (const one of patiently(
        new engine.AudioSampleSink(track).samples()
      )) {
        const plane = new Float32Array(one.numberOfFrames)
        one.copyTo(plane, { planeIndex: 0, format: "f32-planar" })
        heard.push(plane)
        one.close()
      }
    } finally {
      opened.dispose()
    }
    const all = new Float32Array(
      heard.reduce((sum, one) => sum + one.length, 0)
    )
    let at = 0
    for (const one of heard) {
      all.set(one, at)
      at += one.length
    }
    const first = new Float32Array(frames)
    for (let index = 0; index < frames; index++)
      first[index] = noise[index * channels]
    const priming = lagOf(first.subarray(0, 4096), all, 4096)
    return { priming, complete: all.length - priming >= frames }
  } catch {
    return null
  }
}

/** The AAC encoder chosen for each rate and channels, by its priming. */
const aacChoices = new Map<string, Promise<number>>()

/**
 * Make sure AAC is written by an encoder that keeps all of the sound, and
 * say its priming: the browser's own when its trial gives every sample
 * back, measured; otherwise ours, whose priming is known.
 */
export function aacEncoding(
  engine: Engine,
  sampleRate: number,
  channels: number,
  bitrate: number
): Promise<number> {
  if (registered.has("aac")) return Promise.resolve(OWN_AAC_PRIMING)
  const key = `${sampleRate}/${channels}`
  let chosen = aacChoices.get(key)
  if (!chosen) {
    chosen = (async () => {
      const trial = (await engine.canEncodeAudio("aac", {
        numberOfChannels: channels,
        sampleRate,
        bitrate,
      }))
        ? await tryAac(engine, sampleRate, channels, bitrate)
        : null
      if (trial?.complete && trial.priming > 0) return trial.priming
      await readyEncoder(engine, "aac")
      return OWN_AAC_PRIMING
    })()
    aacChoices.set(key, chosen)
  }
  return chosen
}

/** The planes of a sample, as floats; the sample is closed. */
function planesOf(sample: Mediabunny.AudioSample) {
  const planes = Array.from({ length: sample.numberOfChannels }, (_, plane) => {
    const values = new Float32Array(sample.numberOfFrames)
    sample.copyTo(values, { planeIndex: plane, format: "f32-planar" })
    return values
  })
  sample.close()
  return planes
}

/** A sample made of planes of floats. */
function sampleOf(
  engine: Engine,
  planes: Float32Array[],
  sampleRate: number,
  timestamp: number
) {
  const frames = planes[0].length
  const data = new Float32Array(frames * planes.length)
  planes.forEach((plane, channel) => data.set(plane, channel * frames))
  return new engine.AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: planes.length,
    sampleRate,
    timestamp,
  })
}

/** Made louder or quieter by a gain, kept under a ceiling by the limiter, and measured. */
interface Shaping {
  gain: number
  limiter: Limiter | null
  meter: LoudnessMeter
  /** The most the compressor turned the sound down, in dB (0 or less), once written. */
  compressed?: number
}

/** A decoder gave fewer frames than the sound has: written again to that many. */
class EndedEarly extends Error {
  constructor(readonly frames: number) {
    super("ended early")
  }
}

/**
 * One pass over the sound as it will be written (trimmed, edited, at the
 * plan's rate and channels), into `output`. With `shaping`, each chunk is
 * made louder or quieter and limited, and what comes out is measured; with
 * `measure` only, it is measured as it is.
 */
async function pass(
  engine: Engine,
  file: Blob,
  plan: Plan,
  facts: Pick<ReadFacts, "duration" | "sampleRate" | "kept">,
  output: Mediabunny.Output,
  options: {
    keepTags: boolean
    tags?: Mediabunny.MetadataTags
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
    edits: readonly Step[]
    edited: Edited
    /** Frames the sound has at the plan's rate. */
    expected: number
    shaping?: Shaping
    measure?: LoudnessMeter
    /** The codec and sample format to write, when not the plan's (for measuring). */
    codec?: Mediabunny.AudioCodec
    /** The equaliser and compressor; none when left out. */
    sound?: SoundSettings
    /** Hand the frames on (made louder or quieter by `gain`) instead of writing them. */
    deliver?: (planes: Float32Array[]) => Promise<void>
    gain?: number
  }
) {
  const { edits, edited, expected, shaping } = options
  // Made anew for every pass: they keep state from frame to frame.
  const sound = options.sound
    ? new SoundShaper(options.sound, plan.sampleRate, plan.channels)
    : null
  const source = input(engine, file)
  try {
    // Where the sound starts in the decoder's time: an MP3's delay comes first.
    const soundStart = facts.kept ? facts.kept.start / facts.sampleRate : 0
    const first = edits.length ? (edited.segments[0]?.[0] ?? 0) : 0
    const last = edits.length
      ? (edited.segments[edited.segments.length - 1]?.[1] ?? 0)
      : null
    const trim = plan.copy
      ? undefined
      : {
          start: soundStart + first,
          end:
            last !== null
              ? soundStart + last
              : facts.kept
                ? facts.kept.length === null
                  ? undefined
                  : (facts.kept.start + facts.kept.length) / facts.sampleRate
                : facts.duration,
        }
    let made = 0
    /** Frames seen so far at the rate written, counted from the trim's start. */
    let seen = 0
    /** Frames given to the encoder, after the limiter's delay. */
    let given = 0
    const integers =
      !options.codec &&
      (plan.sampleFormat === "s16" || plan.sampleFormat === "s32")
        ? plan.sampleFormat
        : null
    const finish = (sample: Mediabunny.AudioSample) =>
      integers ? asIntegers(engine, sample, integers) : sample
    const conversion = await engine.Conversion.init({
      input: source,
      output,
      video: { discard: true },
      audio: plan.copy
        ? { forceTranscode: false }
        : {
            codec: options.codec ?? (plan.codec as Mediabunny.AudioCodec),
            sampleRate: plan.sampleRate,
            numberOfChannels: plan.channels,
            ...(plan.bitrate && !options.codec
              ? { quality: new engine.Quality({ bitrate: plan.bitrate }) }
              : {}),
            ...(plan.sampleFormat === "f32" && !options.codec
              ? { sampleFormat: "f32" }
              : {}),
            process: (incoming: Mediabunny.AudioSample) => {
              let sample: Mediabunny.AudioSample | null = incoming
              const rate = incoming.sampleRate
              if (edits.length) {
                // Frames are counted, so the source time of each is exact.
                const at = first + seen / rate
                seen += incoming.numberOfFrames
                sample = shaped(engine, incoming, edited, at, made / rate)
                if (!sample) return null
              }
              // Exactly as many samples as the sound has: a resampler can make one more.
              const room = expected - made
              if (room <= 0) {
                sample.close()
                return null
              }
              const kept =
                sample.numberOfFrames > room
                  ? firstFrames(engine, sample, room)
                  : sample
              made += kept.numberOfFrames
              // The equaliser and the compressor, before anything else.
              const shaped_ = sound
                ? sampleOf(
                    engine,
                    sound.process(planesOf(kept)),
                    rate,
                    kept.timestamp
                  )
                : kept
              if (options.deliver) {
                const planes = planesOf(shaped_)
                const gain = options.gain ?? 1
                if (gain !== 1)
                  for (const plane of planes)
                    for (let index = 0; index < plane.length; index++)
                      plane[index] *= gain
                // The null output still wants one sample, or it will not finish.
                const token = given++ === 0
                return options.deliver(planes).then(() =>
                  token
                    ? sampleOf(
                        engine,
                        planes.map((plane) => plane.subarray(0, 1)),
                        rate,
                        0
                      )
                    : null
                )
              }
              if (options.measure) {
                const planes = planesOf(shaped_)
                options.measure.push(planes)
                return sampleOf(
                  engine,
                  planes,
                  rate,
                  (made - planes[0].length) / rate
                )
              }
              if (!shaping) return finish(shaped_)
              // Louder or quieter, limited, and measured as it comes out.
              const planes = planesOf(shaped_)
              if (shaping.gain !== 1)
                for (const plane of planes)
                  for (let index = 0; index < plane.length; index++)
                    plane[index] *= shaping.gain
              const ready = shaping.limiter
                ? [shaping.limiter.process(planes)]
                : [planes]
              // The limiter's last frames come out once the sound is all in.
              if (shaping.limiter && made === expected)
                ready.push(shaping.limiter.flush())
              const out: Mediabunny.AudioSample[] = []
              for (const part of ready) {
                if (!part[0].length) continue
                shaping.meter.push(part)
                out.push(finish(sampleOf(engine, part, rate, given / rate)))
                given += part[0].length
              }
              return out.length ? out : null
            },
            forceTranscode: true,
          },
      trim,
      tags: !options.keepTags
        ? {}
        : options.tags
          ? options.tags
          : (tags) => tags,
    })
    if (!conversion.isValid)
      throw new AudioProblem(
        "This browser cannot write this file in that format. Choose another format."
      )
    if (options.onProgress) conversion.onProgress = options.onProgress
    const abort = () => void conversion.cancel()
    options.signal?.addEventListener("abort", abort)
    try {
      await conversion.execute()
    } finally {
      options.signal?.removeEventListener("abort", abort)
    }
    if (shaping?.limiter && made < expected && !options.signal?.aborted)
      throw new EndedEarly(made)
    if (shaping && sound) shaping.compressed = sound.compressed
  } finally {
    source.dispose()
  }
}

/**
 * Write a file by a plan. `tags` replaces the file's own when given (for
 * sound the page decoded, whose WAV has none); `keepTags` false writes none.
 * A level other than "same" measures the sound first where it must, then
 * writes it louder or quieter, limited and measured.
 */
export async function convertAudio(
  engine: Engine,
  file: Blob,
  plan: Plan,
  facts: Pick<ReadFacts, "duration" | "sampleRate" | "kept">,
  options: {
    keepTags: boolean
    tags?: Mediabunny.MetadataTags
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
    /** Edits to make while writing (see `edits.ts`); none when left out. */
    edits?: readonly Step[]
    /** How loud the result is to be; as it is when left out. */
    level?: Level
    /** The equaliser and compressor; none when left out. */
    sound?: SoundSettings
  }
): Promise<{ bytes: Uint8Array; level: LevelResult | null }> {
  const edits = options.edits ?? []
  const edited = editedBy(facts.duration, edits)
  const level = options.level ?? defaultLevel
  /** How long the sound written is, in seconds. */
  const length = edits.length ? lengthOf(edited) : facts.duration
  // AAC is written by an encoder chosen first; its priming is known after.
  const priming =
    !plan.copy && plan.codec === "aac"
      ? await aacEncoding(
          engine,
          plan.sampleRate,
          plan.channels,
          plan.bitrate ?? 128_000
        )
      : null
  if (!plan.copy && plan.codec !== "aac") await readyEncoder(engine, plan.codec)
  let expected = Math.round(length * plan.sampleRate)
  // The equaliser and compressor run on every pass, the measuring one too.
  const sound =
    !plan.copy && options.sound && !isPlain(options.sound)
      ? options.sound
      : undefined
  const common = {
    keepTags: options.keepTags,
    tags: options.tags,
    signal: options.signal,
    edits,
    edited,
    sound,
  }

  // Measured first, as it will be written, when the gain depends on it.
  let before: Loudness | null = null
  const measuring = !plan.copy && needsMeasure(level)
  if (measuring) {
    const meter = new LoudnessMeter(plan.sampleRate, plan.channels)
    await pass(
      engine,
      file,
      plan,
      facts,
      new engine.Output({
        format: new engine.WavOutputFormat(),
        target: new engine.NullTarget(),
      }),
      {
        ...common,
        keepTags: false,
        expected,
        measure: meter,
        codec: "pcm-f32",
        onProgress: (fraction) => options.onProgress?.(fraction / 2),
      }
    )
    before = loudnessOf(meter.result())
  }
  const chosen = gainFor(level, before)
  // A shaped sound left at its level is still kept from clipping, at −1 dBTP.
  const gain =
    level.mode === "same" && sound
      ? { ...chosen, ceiling: 10 ** (SAFE_CEILING / 20) }
      : chosen
  const shaped = !plan.copy && (level.mode !== "same" || sound !== undefined)

  /** One write at a gain; the bytes, and what came out. */
  const write = async (db: number) => {
    // A WAV over 4 GB needs the RF64 form.
    const longWav =
      plan.format === "wav" &&
      length * plan.sampleRate * plan.channels * 4 > 3.9e9
    const target = new engine.BufferTarget()
    const shaping: Shaping | undefined = shaped
      ? {
          gain: 10 ** (db / 20),
          limiter:
            gain.ceiling === null
              ? null
              : new Limiter(plan.sampleRate, plan.channels, gain.ceiling),
          meter: new LoudnessMeter(plan.sampleRate, plan.channels),
        }
      : undefined
    await pass(
      engine,
      file,
      plan,
      facts,
      new engine.Output({
        format: outputFormat(engine, plan, longWav),
        target,
      }),
      {
        ...common,
        expected,
        shaping,
        onProgress: (fraction) =>
          options.onProgress?.(measuring ? 0.5 + fraction / 2 : fraction),
      }
    )
    return { written: new Uint8Array(target.buffer!), shaping }
  }

  let done: Awaited<ReturnType<typeof write>>
  try {
    done = await write(gain.db)
  } catch (error) {
    // A decoder that gave fewer frames than the sound has: the limiter's
    // last frames never came out, so it is written again to that many.
    if (!(error instanceof EndedEarly)) throw error
    expected = error.frames
    done = await write(gain.db)
  }
  let { written, shaping } = done
  let db = gain.db
  const notes = [...gain.notes]
  // The limiter makes a loud file quieter than asked: the gain is put right
  // by what was measured (by the slope seen, after the first try) and the
  // file written again, at most twice more. More gain can also lift quiet
  // parts over the relative gate and so measure quieter: the try closest
  // to the target is kept.
  if (shaping && level.mode === "loudness" && gain.ceiling !== null && before) {
    let reached = integrated(shaping.meter.result())
    let best = { db, written, shaping, reached }
    let last: { db: number; reached: number } | null = null
    for (let tries = 0; tries < 2 && !options.signal?.aborted; tries++) {
      const short = level.target - reached
      if (reached === SILENT || short <= 0.3) break
      const slope = last ? (reached - last.reached) / (db - last.db) : 1
      // Hardly any louder for more gain: the ceiling is reached.
      if (slope < 0.1) break
      const next = Math.min(MOST_RAISE, db + short / slope)
      if (next <= db + 0.05) break
      last = { db, reached }
      db = next
      ;({ written, shaping } = await write(db))
      reached = integrated(shaping!.meter.result())
      if (
        Math.abs(level.target - reached) < Math.abs(level.target - best.reached)
      )
        best = { db, written, shaping: shaping!, reached }
    }
    ;({ db, written, shaping, reached } = best)
    if (level.target - reached > 0.5)
      notes.push(
        `Under a ${dbLabel(level.ceiling)} dBTP ceiling it reaches only ${dbLabel(reached)} LUFS; a higher ceiling lets it get louder.`
      )
  }
  // Say in the file how many samples are the sound, so it plays without gaps.
  const samples = expected
  const bytes = plan.copy
    ? written
    : plan.codec === "mp3"
      ? lameTagged(written, samples)
      : plan.codec === "opus"
        ? withOpusEnd(written, Math.round((samples / plan.sampleRate) * 48000))
        : priming
          ? withEditList(written, priming, samples)
          : written
  return {
    bytes,
    level: shaping
      ? {
          mode: level.mode,
          before,
          db,
          after: loudnessOf(shaping.meter.result()),
          limited: takenOff(shaping.limiter?.lowest ?? 1),
          compressed: -(shaping.compressed ?? 0),
          notes,
        }
      : null,
  }
}

/** One file to join: its sound, its facts and its edits, and the title of its chapter. */
export interface JoinPart {
  file: Blob
  facts: Pick<ReadFacts, "duration" | "sampleRate" | "kept">
  edits: readonly Step[]
  title: string
}

/**
 * Join files into one, in order, by a plan: each as edited, shaped and
 * made louder or quieter by itself (so files normalised together match),
 * with gaps or crossfades between, one limiter and one meter over all of
 * it, and a chapter for each file where the format holds chapters.
 */
export async function joinAudio(
  engine: Engine,
  parts: readonly JoinPart[],
  plan: Plan,
  options: {
    joining: Joining
    level: Level
    sound?: SoundSettings
    tags?: Mediabunny.MetadataTags
    chapters: boolean
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
  }
): Promise<{ bytes: Uint8Array; level: LevelResult | null; length: number }> {
  const { level } = options
  const sound =
    options.sound && !isPlain(options.sound) ? options.sound : undefined
  const prepared = parts.map((part) => {
    const edited = editedBy(part.facts.duration, part.edits)
    const length = part.edits.length ? lengthOf(edited) : part.facts.duration
    return {
      ...part,
      edited,
      length,
      expected: Math.round(length * plan.sampleRate),
    }
  })
  const joins = joinsFor(
    prepared.map((part) => part.length),
    options.joining
  )
  const { starts } = startsOf(
    prepared.map((part) => part.length),
    joins
  )
  const priming =
    plan.codec === "aac"
      ? await aacEncoding(
          engine,
          plan.sampleRate,
          plan.channels,
          plan.bitrate ?? 128_000
        )
      : null
  if (plan.codec !== "aac") await readyEncoder(engine, plan.codec)
  const measuring = needsMeasure(level)
  const steps = prepared.length * (measuring ? 2 : 1)
  let done = 0
  const progress = (fraction: number) =>
    options.onProgress?.(Math.min(1, (done + fraction) / steps))
  const common = (part: (typeof prepared)[number]) => ({
    keepTags: false,
    signal: options.signal,
    edits: part.edits,
    edited: part.edited,
    expected: part.expected,
    sound,
    codec: "pcm-f32" as const,
    onProgress: progress,
  })
  const nothing = () =>
    new engine.Output({
      format: new engine.WavOutputFormat(),
      target: new engine.NullTarget(),
    })

  // Each file measured first when its gain depends on it.
  const gains = []
  for (const part of prepared) {
    let before: Loudness | null = null
    if (measuring) {
      const meter = new LoudnessMeter(plan.sampleRate, plan.channels)
      await pass(engine, part.file, plan, part.facts, nothing(), {
        ...common(part),
        measure: meter,
      })
      before = loudnessOf(meter.result())
      done++
    }
    gains.push(gainFor(level, before))
  }
  const ceiling =
    gains.find((gain) => gain.ceiling !== null)?.ceiling ??
    (sound ? 10 ** (SAFE_CEILING / 20) : null)
  const shapedLevel = level.mode !== "same" || sound !== undefined

  const target = new engine.BufferTarget()
  const longWav =
    plan.format === "wav" &&
    prepared.reduce((sum, part) => sum + part.length, 0) *
      plan.sampleRate *
      plan.channels *
      4 >
      3.9e9
  const output = new engine.Output({
    format: outputFormat(engine, plan, longWav),
    target,
  })
  const source = new engine.AudioSampleSource({
    codec: plan.codec as Mediabunny.AudioCodec,
    ...(plan.bitrate
      ? { quality: new engine.Quality({ bitrate: plan.bitrate }) }
      : {}),
  })
  output.addAudioTrack(source)
  if (options.tags) output.setMetadataTags(options.tags)
  await output.start()

  const limiter =
    ceiling === null
      ? null
      : new Limiter(plan.sampleRate, plan.channels, ceiling)
  const meter = new LoudnessMeter(plan.sampleRate, plan.channels)
  const integers =
    plan.sampleFormat === "s16" || plan.sampleFormat === "s32"
      ? plan.sampleFormat
      : null
  let written = 0
  const waiting: Float32Array[][] = []
  const joiner = new Joiner(plan.sampleRate, plan.channels, joins, (planes) => {
    waiting.push(planes)
  })
  /** Everything the joiner has let out, through the limiter, to the encoder. */
  const drain = async (last = false) => {
    const ready = waiting.splice(0)
    const out = ready.map((planes) =>
      limiter ? limiter.process(planes) : planes
    )
    if (last && limiter) out.push(limiter.flush())
    for (const planes of out) {
      if (!planes[0].length) continue
      meter.push(planes)
      let sample = sampleOf(
        engine,
        planes,
        plan.sampleRate,
        written / plan.sampleRate
      )
      if (integers) sample = asIntegers(engine, sample, integers)
      await source.add(sample)
      written += planes[0].length
    }
  }
  try {
    for (const [index, part] of prepared.entries()) {
      await pass(engine, part.file, plan, part.facts, nothing(), {
        ...common(part),
        gain: 10 ** (gains[index].db / 20),
        deliver: async (planes) => {
          joiner.push(planes)
          await drain()
        },
      })
      done++
      if (index < prepared.length - 1) joiner.next()
      await drain()
    }
    joiner.finish()
    await drain(true)
    source.close()
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => undefined)
    throw error
  }
  let bytes: Uint8Array = new Uint8Array(target.buffer!)
  // Say in the file how many samples are the sound, so it plays without gaps.
  if (plan.codec === "mp3") bytes = lameTagged(bytes, written)
  else if (plan.codec === "opus")
    bytes = withOpusEnd(bytes, Math.round((written / plan.sampleRate) * 48000))
  else if (priming) bytes = withEditList(bytes, priming, written)
  const length = written / plan.sampleRate
  if (options.chapters && holdsChapters(plan.format)) {
    const chapters = prepared.map((part, index) => ({
      title: part.title,
      start: starts[index],
    }))
    bytes =
      plan.format === "mp3"
        ? withMp3Chapters(bytes, chapters, length)
        : withMp4Chapters(bytes, chapters)
  }
  const dbs = gains.map((gain) => gain.db)
  return {
    bytes,
    length,
    level: shapedLevel
      ? {
          mode: level.mode,
          before: null,
          db: dbs[0],
          each: dbs,
          after: loudnessOf(meter.result()),
          limited: takenOff(limiter?.lowest ?? 1),
          notes: [...new Set(gains.flatMap((gain) => gain.notes))],
        }
      : null,
  }
}

/** A result heard back: its length, rate, channels and loudest sample, from decoding all of it. */
export async function hearAudio(
  engine: Engine,
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<Heard | null> {
  const file = new Blob([bytes as BlobPart])
  let kept: ReadFacts["kept"] = null
  const opened = input(engine, file)
  let sampleRate: number
  let channels: number
  try {
    const track = await opened.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) return null
    sampleRate = track.sampleRate
    channels = track.numberOfChannels
    if (track.codec === "mp3") {
      const gapless = mp3Gapless(bytes.subarray(0, 64 * 1024))
      if (gapless) kept = mp3Kept(gapless)
    }
  } catch {
    return null
  } finally {
    opened.dispose()
  }
  let frames = 0
  let peak = 0
  const meter = new LoudnessMeter(sampleRate, channels)
  try {
    for await (const chunk of soundOf(engine, file, kept, signal)) {
      frames += chunk.planes[0].length
      for (const plane of chunk.planes)
        for (const value of plane)
          if (Math.abs(value) > peak) peak = Math.abs(value)
      meter.push(chunk.planes)
    }
  } catch {
    // Said to be decodable, but not (Safari with FLAC): not heard here.
    return null
  }
  const { integrated, truePeak } = loudnessOf(meter.result())
  return {
    duration: frames / sampleRate,
    sampleRate,
    channels,
    peak,
    loudness: { integrated, truePeak },
  }
}
