/// <reference lib="webworker" />
/**
 * Reads and writes sound files off the page. Mediabunny and the encoders
 * a browser lacks are loaded only when a file needs them.
 */
import { AudioProblem } from "./mediabunny-audio"
import type {
  AudioRequest,
  AudioResponse,
  ConvertJob,
  ReadJob,
} from "./protocol"
import { AiffProblem, wavFromAiff } from "./wav"

declare const self: DedicatedWorkerGlobalScope

const UNREADABLE =
  "This file could not be read. It may be damaged, or of a kind not read here."
const UNWRITTEN =
  "This file could not be written. Try again, or choose another format."

let generation = 0
/** The job running now, and how to stop it. */
let running: {
  id: string
  job: "read" | "convert"
  generation: number
  stop: AbortController
} | null = null

const post = (message: AudioResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

const engine = () => import("mediabunny")
const engineFiles = () => import("./mediabunny-audio")

/** Our own sentences are passed on; anything else gets a plain one. */
const said = (error: unknown, fallback: string) =>
  error instanceof AudioProblem || error instanceof AiffProblem
    ? error.message
    : fallback

/** An AIFF is read as the WAV it equals, with the tags of its own chunks. */
async function asWav(job: { file: Blob; container: string }) {
  if (job.container !== "aiff") return { file: job.file, tags: null }
  const made = wavFromAiff(new Uint8Array(await job.file.arrayBuffer()))
  return { file: new Blob([made.wav as BlobPart]), tags: made.tags }
}

async function read(job: ReadJob, stop: AbortController) {
  // Nothing is said of a job once it is stopped: the worker has said it retires.
  const send = (message: AudioResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  const mediabunny = await engine()
  const { readAudio, peaksOf } = await engineFiles()
  let facts
  let file = job.file
  try {
    const wav = await asWav(job)
    file = wav.file
    facts = await readAudio(mediabunny, file, job.container)
    if (wav.tags) facts = { ...facts, tags: { ...facts.tags, ...wav.tags } }
  } catch (error) {
    send({ type: "open-error", id: job.id, message: said(error, UNREADABLE) })
    return
  }
  send({ type: "facts", id: job.id, facts })
  let peaks = null
  if (facts.decodable)
    try {
      peaks = await peaksOf(mediabunny, file, facts, stop.signal)
    } catch {
      peaks = null
    }
  if (stop.signal.aborted) send({ type: "abandoned", id: job.id })
  else send({ type: "done", id: job.id, job: "read", peaks })
}

async function convert(job: ConvertJob, stop: AbortController) {
  // Nothing is said of a job once it is stopped: the worker has said it retires.
  const send = (message: AudioResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  const mediabunny = await engine()
  const { convertAudio, hearAudio } = await engineFiles()
  try {
    const wav = await asWav(job)
    const facts =
      job.container === "aiff" || job.tags
        ? { ...job.facts, kept: null }
        : job.facts
    let last = 0
    const bytes = await convertAudio(mediabunny, wav.file, job.plan, facts, {
      keepTags: job.keepTags,
      tags:
        job.tags ??
        (wav.tags
          ? {
              title: wav.tags.title,
              artist: wav.tags.artist,
              comment: wav.tags.comment,
            }
          : undefined),
      signal: stop.signal,
      onProgress: (fraction) => {
        // A message for every whole percent is plenty.
        if (fraction - last < 0.01 && fraction < 1) return
        last = fraction
        send({ type: "progress", id: job.id, key: job.key, fraction })
      },
    })
    if (stop.signal.aborted) {
      send({ type: "abandoned", id: job.id })
      return
    }
    const heard = await hearAudio(mediabunny, bytes, stop.signal)
    if (stop.signal.aborted) {
      send({ type: "abandoned", id: job.id })
      return
    }
    send(
      {
        type: "done",
        id: job.id,
        job: "convert",
        key: job.key,
        plan: job.plan,
        bytes,
        heard,
      },
      [bytes.buffer as ArrayBuffer]
    )
  } catch (error) {
    if (stop.signal.aborted) send({ type: "abandoned", id: job.id })
    else
      send({
        type: "error",
        id: job.id,
        key: job.key,
        message: said(error, UNWRITTEN),
      })
  }
}

/**
 * Stop a job and ask to be replaced. The engine's own cancelling can wait
 * for ever on an encoder that runs in a worker of its own, so the job is
 * not waited for: the page ends this worker, and that encoder with it.
 */
function retire(job: NonNullable<typeof running>) {
  job.stop.abort()
  running = null
  post({ type: "retired", id: job.id })
}

self.onmessage = (event: MessageEvent<AudioRequest>) => {
  const message = event.data
  if (message.type === "supersede") {
    generation = message.generation
    // A new set of settings outdates a file being written, never one being read.
    if (running?.job === "convert" && running.generation < generation)
      retire(running)
    return
  }
  if (message.type === "forget") {
    if (running?.id === message.id) retire(running)
    return
  }
  const stop = new AbortController()
  running = {
    id: message.id,
    job: message.job,
    generation: message.generation,
    stop,
  }
  const done = () => {
    if (running?.stop === stop) running = null
  }
  if (message.job === "read") void read(message, stop).finally(done)
  else if (message.generation < generation) {
    post({ type: "abandoned", id: message.id })
    done()
  } else void convert(message, stop).finally(done)
}
