/**
 * Video in and out, through the browser's own decoders and encoders
 * (WebCodecs) with Mediabunny reading and writing the files. Runs in the
 * animation worker; nothing here works where WebCodecs is missing, and the
 * page checks that before offering video.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
} from "mediabunny"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { MAX_VIDEO_FRAMES } from "./settings"
import type { Source } from "./source"
import type { Frame } from "./types"

export const NO_VIDEO = "This file has no video in it."
export const CANNOT_DECODE =
  "This browser cannot play this video's format. Try an MP4 (H.264) or WebM file."
export const CANNOT_ENCODE =
  "This browser cannot write that video format. Choose another format."
export const UNPLAYABLE =
  "This browser wrote a video that could not be read back, which happens at very small sizes. Try the other video format or a larger size."
export const TOO_LONG = `Use a clip with at most ${MAX_VIDEO_FRAMES.toLocaleString("en")} frames, about ten minutes at 30 frames a second.`

/** Open a video file as a source of frames. Only the parts that are needed are read. */
export async function openVideo(file: Blob): Promise<Source> {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  })
  let track
  try {
    track = await input.getPrimaryVideoTrack()
  } catch {
    throw new Error(CANNOT_DECODE)
  }
  if (!track) throw new Error(NO_VIDEO)
  if (!(await track.canDecode())) throw new Error(CANNOT_DECODE)

  // Frame times come from the file's index, without decoding any picture.
  const packets = new EncodedPacketSink(track)
  const stamps: { time: number; duration: number }[] = []
  for (
    let packet = await packets.getFirstPacket({ metadataOnly: true });
    packet;
    packet = await packets.getNextPacket(packet, { metadataOnly: true })
  ) {
    stamps.push({ time: packet.timestamp, duration: packet.duration })
    if (stamps.length > MAX_VIDEO_FRAMES) throw new Error(TOO_LONG)
  }
  if (!stamps.length) throw new Error(NO_VIDEO)
  // Files store frames in decoding order, which is not always the order they are shown in.
  stamps.sort((a, b) => a.time - b.time)
  const times = stamps.map((stamp) => stamp.time)
  // The last frame has no next one to measure against. Some files store its
  // length, some only the length of the whole track; failing both, it lasts
  // as long as the frame before it.
  const end = await track.computeDuration().catch(() => 0)
  const durations: number[] = []
  stamps.forEach((stamp, index) => {
    const next = stamps[index + 1]
    const seconds = next
      ? next.time - stamp.time
      : stamp.duration > 0
        ? stamp.duration
        : end - stamp.time
    durations.push(
      seconds > 0 ? seconds * 1000 : (durations[index - 1] ?? 1000 / 30)
    )
  })

  const width = track.displayWidth
  const height = track.displayHeight
  const sink = new VideoSampleSink(track)
  let canvas: OffscreenCanvas | null = null
  return {
    format: "video",
    width,
    height,
    // A video file does not say how often it loops.
    plays: 0,
    durations,
    seekable: true,
    close: () => input.dispose(),
    async *read(indices) {
      canvas ??= new OffscreenCanvas(width, height)
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error(CANNOT_DECODE)
      const samples = sink.samplesAtTimestamps(
        indices.map((index) => times[index])
      )
      for (;;) {
        let sample
        try {
          const next = await samples.next()
          if (next.done) return
          sample = next.value
        } catch {
          // The browser's own message here names internals, not what to do.
          throw new Error(CANNOT_DECODE)
        }
        if (!sample) continue
        context.clearRect(0, 0, width, height)
        sample.draw(context, 0, 0, width, height)
        sample.close()
        const image = context.getImageData(0, 0, width, height)
        const pixels: Pixels = { data: image.data, width, height }
        yield pixels
      }
    },
  }
}

/** Bits per pixel in each frame; enough for clean motion at "high", lean at "small". */
const LEVELS = { small: 0.05, balanced: 0.1, high: 0.2 }

/**
 * Encode solid frames as a silent MP4 (H.264) or WebM (VP9, or VP8 where VP9
 * is missing). The result is opened again before it is handed back, because
 * some browsers write files at small sizes that they cannot then read.
 * @returns The file, and how many frames the encoder actually kept.
 */
export async function encodeVideo(
  frames: Frame[],
  container: "mp4" | "webm",
  level: "small" | "balanced" | "high" | number
): Promise<{ bytes: Uint8Array; frames: number }> {
  const { width, height } = frames[0]
  const total = frames.reduce((sum, frame) => sum + frame.duration, 0) / 1000
  const rate = Math.min(60, Math.max(1, frames.length / Math.max(total, 0.001)))
  const bitrate = Math.max(
    150_000,
    Math.round(
      width *
        height *
        rate *
        (typeof level === "number" ? level : LEVELS[level])
    )
  )
  const codec = await getFirstEncodableVideoCodec(
    container === "mp4" ? ["avc"] : ["vp9", "vp8"],
    { width, height, bitrate }
  )
  if (!codec) throw new Error(CANNOT_ENCODE)

  const target = new BufferTarget()
  const output = new Output({
    format:
      container === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat(),
    target,
  })
  let kept = 0
  const source = new VideoSampleSource({
    codec,
    bitrate,
    keyFrameInterval: 2,
    // Quality over speed: a real-time encoder is allowed to drop frames.
    latencyMode: "quality",
    bitrateMode: "variable",
    onEncodedPacket: () => void kept++,
  })
  output.addVideoTrack(source)
  await output.start()
  let time = 0
  for (const frame of frames) {
    const sample = new VideoSample(frame.data, {
      format: "RGBA",
      codedWidth: width,
      codedHeight: height,
      timestamp: time / 1000,
      duration: frame.duration / 1000,
    })
    await source.add(sample)
    sample.close()
    time += frame.duration
  }
  await output.finalize()
  if (!target.buffer) throw new Error(CANNOT_ENCODE)
  const bytes = new Uint8Array(target.buffer)
  let check: Source | null = null
  try {
    check = await openVideo(new Blob([bytes]))
    let read = 0
    for await (const pixels of check.read([0])) read += pixels.width
    if (!read) throw new Error(UNPLAYABLE)
  } catch {
    throw new Error(UNPLAYABLE)
  } finally {
    check?.close?.()
  }
  return { bytes, frames: kept }
}
