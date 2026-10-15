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

/** A file's overview waveform, made by decoding it once. */
export async function peaksOf(
  engine: Engine,
  file: Blob,
  facts: Pick<ReadFacts, "duration" | "sampleRate" | "kept">,
  signal?: AbortSignal
): Promise<Peaks> {
  const builder = new PeakBuilder(
    Math.round(facts.duration * facts.sampleRate),
    peakCount(facts.duration)
  )
  for await (const chunk of soundOf(engine, file, facts.kept, signal))
    builder.push(chunk.planes)
  return builder.result()
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

/**
 * Write a file by a plan. `tags` replaces the file's own when given (for
 * sound the page decoded, whose WAV has none); `keepTags` false writes none.
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
  }
): Promise<Uint8Array> {
  const edits = options.edits ?? []
  const edited = editedBy(facts.duration, edits)
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
  const source = input(engine, file)
  const target = new engine.BufferTarget()
  // A WAV over 4 GB needs the RF64 form.
  const longWav =
    plan.format === "wav" &&
    length * plan.sampleRate * plan.channels * 4 > 3.9e9
  const output = new engine.Output({
    format: outputFormat(engine, plan, longWav),
    target,
  })
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
    const expected = Math.round(length * plan.sampleRate)
    let made = 0
    /** Frames seen so far at the rate written, counted from the trim's start. */
    let seen = 0
    const conversion = await engine.Conversion.init({
      input: source,
      output,
      video: { discard: true },
      audio: plan.copy
        ? { forceTranscode: false }
        : {
            codec: plan.codec as Mediabunny.AudioCodec,
            sampleRate: plan.sampleRate,
            numberOfChannels: plan.channels,
            ...(plan.bitrate
              ? { quality: new engine.Quality({ bitrate: plan.bitrate }) }
              : {}),
            ...(plan.sampleFormat === "f32" ? { sampleFormat: "f32" } : {}),
            process: (incoming: Mediabunny.AudioSample) => {
              let sample: Mediabunny.AudioSample | null = incoming
              if (edits.length) {
                // Frames are counted, so the source time of each is exact.
                const rate = incoming.sampleRate
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
              // Whole-number samples are made here, exactly (see `asIntegers`),
              // from the decoder's own floats: the library's conversion comes first.
              return plan.sampleFormat === "s16" || plan.sampleFormat === "s32"
                ? asIntegers(engine, kept, plan.sampleFormat)
                : kept
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
    const written = new Uint8Array(target.buffer!)
    // Say in the file how many samples are the sound, so it plays without gaps.
    const samples = Math.round(length * plan.sampleRate)
    if (plan.copy) return written
    if (plan.codec === "mp3") return lameTagged(written, samples)
    if (plan.codec === "opus")
      return withOpusEnd(written, Math.round(length * 48000))
    if (priming) return withEditList(written, priming, samples)
    return written
  } finally {
    source.dispose()
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
  try {
    for await (const chunk of soundOf(engine, file, kept, signal)) {
      frames += chunk.planes[0].length
      for (const plane of chunk.planes)
        for (const value of plane)
          if (Math.abs(value) > peak) peak = Math.abs(value)
    }
  } catch {
    // Said to be decodable, but not (Safari with FLAC): not heard here.
    return null
  }
  return { duration: frames / sampleRate, sampleRate, channels, peak }
}
