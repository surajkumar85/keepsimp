/// <reference lib="webworker" />
/**
 * Making a video of a sound: the sound read again (for its waveform when
 * one is drawn), the frames drawn on an OffscreenCanvas as the sound is
 * encoded, and the file opened again before it is offered: both tracks
 * there, as long as the sound. The page stops it by ending this worker.
 */
import { AudioProblem, type SoundVideo } from "./mediabunny-audio"
import { sniffContainer } from "./formats"
import {
  barsOf,
  drawFrame,
  framesPerSecond,
  layoutOf,
  type Painter,
  type VideoColours,
  type VideoLook,
} from "./video"

export interface VideoJob {
  /** The sound, as written with the workspace's settings. */
  file: Blob
  look: VideoLook
  colours: VideoColours
  /** The picture to show, or none. */
  picture: Blob | null
  title: string
  artist: string
}

export type VideoMessage =
  | { type: "progress"; fraction: number }
  /** This browser cannot decode the sound here: the page decodes it and asks again. */
  | { type: "undecodable" }
  | {
      type: "done"
      video: SoundVideo
      /** What opening it again found. */
      check: { video: boolean; audio: boolean; seconds: number }
    }
  | { type: "error"; message: string }

const post = (message: VideoMessage, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer)

async function make(job: VideoJob) {
  const engine = await import("mediabunny")
  const { readAudio, overviewOf, soundToVideo } =
    await import("./mediabunny-audio")
  const head = new Uint8Array(await job.file.slice(0, 512).arrayBuffer())
  const container = sniffContainer(head)
  if (!container) throw new Error("not sound")
  const facts = await readAudio(engine, job.file, container)
  if (!facts.decodable) {
    post({ type: "undecodable" })
    return
  }
  // The waveform drawn is the sound's own, read first.
  const bars = job.look.waveform
    ? barsOf((await overviewOf(engine, job.file, facts)).peaks, 96)
    : null
  post({ type: "progress", fraction: 0.1 })
  const picture = job.picture ? await createImageBitmap(job.picture) : null
  const layout = layoutOf(job.look, Boolean(job.title))
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const context = canvas.getContext("2d")!
  const video = await soundToVideo(
    engine,
    job.file,
    facts,
    {
      canvas,
      fps: framesPerSecond(job.look),
      draw: (time) =>
        drawFrame(context as unknown as Painter, layout, {
          time,
          duration: facts.duration,
          colours: job.colours,
          picture: picture
            ? { image: picture, width: picture.width, height: picture.height }
            : null,
          bars,
          title: job.look.title ? job.title : "",
          artist: job.look.title ? job.artist : "",
        }),
    },
    {
      onProgress: (fraction) =>
        post({ type: "progress", fraction: 0.1 + fraction * 0.9 }),
    }
  )
  // Opened again: both tracks, as long as the sound.
  const input = new engine.Input({
    source: new engine.BlobSource(new Blob([video.bytes as BlobPart])),
    formats: engine.ALL_FORMATS,
  })
  try {
    const check = {
      video: (await input.getPrimaryVideoTrack()) !== null,
      audio: (await input.getPrimaryAudioTrack()) !== null,
      seconds: await input.computeDuration(),
    }
    post({ type: "done", video, check }, [video.bytes.buffer as ArrayBuffer])
  } finally {
    input.dispose()
  }
}

self.onmessage = (event: MessageEvent<VideoJob>) => {
  make(event.data).catch((error: unknown) => {
    console.error(error)
    post({
      type: "error",
      message:
        error instanceof AudioProblem
          ? error.message
          : "The video could not be made in this browser.",
    })
  })
}
