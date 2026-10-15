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
import type { Plan, SourceFacts } from "./settings"
import type { Heard } from "./check"

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

/** How many peaks a file's overview waveform has. */
export const OVERVIEW_PEAKS = 2000

const input = (engine: Engine, file: Blob) =>
  new engine.Input({
    source: new engine.BlobSource(file),
    formats: engine.ALL_FORMATS,
  })

/**
 * Whether this browser really decodes a track: some say they can and then
 * fail on the first packet (Safari with FLAC), so its first second is
 * decoded to find out.
 */
async function decodes(engine: Engine, track: Mediabunny.InputAudioTrack) {
  if (!(await track.canDecode())) return false
  try {
    const start = await track.getFirstTimestamp()
    for await (const sample of new engine.AudioSampleSink(track).samples(
      start,
      start + 1
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
    for await (const sample of new engine.AudioSampleSink(track).samples()) {
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
    OVERVIEW_PEAKS
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

/** Load the encoders this browser lacks, once each, only when a plan needs one. */
export async function readyEncoder(engine: Engine, codec: string) {
  if (codec !== "mp3" && codec !== "aac" && codec !== "flac") return
  if (await engine.canEncodeAudio(codec)) return
  if (codec === "mp3")
    (await import("@mediabunny/mp3-encoder")).registerMp3Encoder()
  else if (codec === "flac")
    (await import("@mediabunny/flac-encoder")).registerFlacEncoder()
  else (await import("@mediabunny/aac-encoder")).registerAacEncoder()
}

/** How many samples of priming this browser's AAC encoder puts first, by rate and channels. */
const primings = new Map<string, Promise<number | null>>()

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
 * The priming of this browser's AAC encoder, measured: a short burst of
 * noise is encoded and decoded again, and where it comes back is how many
 * samples the encoder put first. Encoders differ (Apple's puts 2,112,
 * FFmpeg's 1,024), so it is measured rather than assumed; null when this
 * browser cannot decode what it wrote.
 */
export function aacPriming(
  engine: Engine,
  sampleRate: number,
  channels: number,
  bitrate: number
): Promise<number | null> {
  const key = `${sampleRate}/${channels}`
  let measured = primings.get(key)
  if (!measured) {
    measured = (async () => {
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
          for await (const one of new engine.AudioSampleSink(track).samples()) {
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
        return lagOf(first.subarray(0, 4096), all, 4096)
      } catch {
        return null
      }
    })()
    primings.set(key, measured)
  }
  return measured
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
  }
): Promise<Uint8Array> {
  if (!plan.copy) await readyEncoder(engine, plan.codec)
  const source = input(engine, file)
  const target = new engine.BufferTarget()
  // A WAV over 4 GB needs the RF64 form.
  const longWav =
    plan.format === "wav" &&
    facts.duration * plan.sampleRate * plan.channels * 4 > 3.9e9
  const output = new engine.Output({
    format: outputFormat(engine, plan, longWav),
    target,
  })
  try {
    const trim = plan.copy
      ? undefined
      : facts.kept
        ? {
            start: facts.kept.start / facts.sampleRate,
            end:
              facts.kept.length === null
                ? undefined
                : (facts.kept.start + facts.kept.length) / facts.sampleRate,
          }
        : { start: 0, end: facts.duration }
    const expected = Math.round(facts.duration * plan.sampleRate)
    let made = 0
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
            process: (sample: Mediabunny.AudioSample) => {
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
    const samples = Math.round(facts.duration * plan.sampleRate)
    if (plan.copy) return written
    if (plan.codec === "mp3") return lameTagged(written, samples)
    if (plan.codec === "opus")
      return withOpusEnd(written, Math.round(facts.duration * 48000))
    if (plan.codec === "aac") {
      const priming = await aacPriming(
        engine,
        plan.sampleRate,
        plan.channels,
        plan.bitrate ?? 128_000
      )
      if (priming) return withEditList(written, priming, samples)
    }
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
