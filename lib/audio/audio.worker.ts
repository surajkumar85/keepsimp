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
  JoinJob,
  ReadJob,
  SplitJob,
  Written,
} from "./protocol"
import { partStep } from "./split"
import type { Rnnoise } from "./repair"
import { RNNOISE_URL } from "./rnnoise-files"
import { needsRnnoise, type SoundSettings } from "./sound"
import { AiffProblem, wavFromAiff } from "./wav"
import { keepsKind, retag } from "./retag"

declare const self: DedicatedWorkerGlobalScope

const UNREADABLE =
  "This file could not be read. It may be damaged, or of a kind not read here."
const UNJOINED =
  "These files could not be joined. Try again, or choose another format."
const UNWRITTEN =
  "This file could not be written. Try again, or choose another format."

let generation = 0
/** The job running now, and how to stop it. */
let running: {
  id: string
  job: "read" | "convert" | "split" | "join"
  generation: number
  stop: AbortController
} | null = null

const post = (message: AudioResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

const engine = () => import("mediabunny")

/** RNNoise, loaded the first time noise is to be taken away, then kept. */
let rnnoise: Promise<Rnnoise> | null = null
const denoiser = (sound: SoundSettings) => {
  if (!needsRnnoise(sound)) return Promise.resolve(undefined)
  // The build checks it runs in a worker, which this is.
  // From the site's own address (see rnnoise-files.ts), never bundled.
  rnnoise ??= (
    import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ RNNOISE_URL
    ) as Promise<typeof import("@shiguredo/rnnoise-wasm")>
  ).then(({ Rnnoise }) => Rnnoise.load())
  return rnnoise
}
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
  const { readAudio, overviewOf } = await engineFiles()
  let facts
  let file = job.file
  try {
    const wav = await asWav(job)
    file = wav.file
    facts = await readAudio(mediabunny, file, job.container)
    if (wav.tags) {
      const { title, artist, comment } = wav.tags
      facts = { ...facts, tags: { ...facts.tags, title, artist, comment } }
      for (const field of ["title", "artist", "comment"] as const)
        if (!facts.tags[field]) delete facts.tags[field]
    }
  } catch (error) {
    send({ type: "open-error", id: job.id, message: said(error, UNREADABLE) })
    return
  }
  send({ type: "facts", id: job.id, facts })
  let overview = null
  if (facts.decodable)
    try {
      overview = await overviewOf(mediabunny, file, facts, stop.signal)
    } catch {
      overview = null
    }
  if (stop.signal.aborted) send({ type: "abandoned", id: job.id })
  else
    send({
      type: "done",
      id: job.id,
      job: "read",
      peaks: overview?.peaks ?? null,
      loudness: overview?.loudness ?? null,
    })
}

async function convert(job: ConvertJob | SplitJob, stop: AbortController) {
  // Nothing is said of a job once it is stopped: the worker has said it retires.
  const send = (message: AudioResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  const mediabunny = await engine()
  const { convertAudio, hearAudio, STALL_MS, Stalled } = await engineFiles()
  // A conversion that makes no progress for a while has a decoder or an
  // encoder that stopped answering: it is reported, and this worker retires.
  let sign = Date.now()
  const watch = setInterval(() => {
    if (stop.signal.aborted) return clearInterval(watch)
    if (Date.now() - sign < STALL_MS * 2) return
    clearInterval(watch)
    send({
      type: "error",
      id: job.id,
      key: job.key,
      message: new Stalled().message,
    })
    if (running?.stop === stop) retire(running)
  }, 1000)
  try {
    // The sound copied into the same kind of file: only its tags are written.
    if (
      job.job === "convert" &&
      job.plan.copy &&
      !job.facts.hasVideo &&
      !job.edits.length &&
      keepsKind(job.container, job.plan.format)
    ) {
      const source = new Uint8Array(await job.file.arrayBuffer())
      const bytes = retag(source, job.container, job.change, job.keepTags)
      if (bytes) {
        sign = Date.now()
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
            level: null,
            inPlace: true,
          },
          [bytes.buffer as ArrayBuffer]
        )
        return
      }
    }
    const wav = await asWav(job)
    const facts =
      job.container === "aiff" || job.tags
        ? { ...job.facts, kept: null }
        : job.facts
    // A split writes the file once for every part, with a keep of it.
    const lists =
      job.job === "split"
        ? job.parts.map((part) => [...job.edits, partStep(part)])
        : [job.edits]
    const written: Written[] = []
    let last = 0
    for (const [index, edits] of lists.entries()) {
      const { bytes, level } = await convertAudio(
        mediabunny,
        wav.file,
        job.plan,
        facts,
        {
          keepTags: job.keepTags,
          change: job.change,
          edits,
          level: job.level,
          sound: job.sound,
          changes: job.changes,
          rnnoise: await denoiser(job.sound),
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
          onProgress: (part) => {
            sign = Date.now()
            const fraction = (index + part) / lists.length
            // A message for every whole percent is plenty.
            if (fraction - last < 0.01 && fraction < 1) return
            last = fraction
            send({ type: "progress", id: job.id, key: job.key, fraction })
          },
        }
      )
      if (stop.signal.aborted) {
        send({ type: "abandoned", id: job.id })
        return
      }
      sign = Date.now()
      const heard = await hearAudio(mediabunny, bytes, stop.signal)
      if (stop.signal.aborted) {
        send({ type: "abandoned", id: job.id })
        return
      }
      written.push({ bytes, heard, level })
    }
    const transfer = written.map(({ bytes }) => bytes.buffer as ArrayBuffer)
    if (job.job === "split")
      send(
        {
          type: "done",
          id: job.id,
          job: "split",
          key: job.key,
          plan: job.plan,
          parts: written,
        },
        transfer
      )
    else
      send(
        {
          type: "done",
          id: job.id,
          job: "convert",
          key: job.key,
          plan: job.plan,
          ...written[0],
          inPlace: false,
        },
        transfer
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
  } finally {
    clearInterval(watch)
  }
}

async function joined(job: JoinJob, stop: AbortController) {
  const send = (message: AudioResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  const mediabunny = await engine()
  const { joinAudio, hearAudio, STALL_MS, Stalled } = await engineFiles()
  let sign = Date.now()
  const watch = setInterval(() => {
    if (stop.signal.aborted) return clearInterval(watch)
    if (Date.now() - sign < STALL_MS * 2) return
    clearInterval(watch)
    send({
      type: "error",
      id: job.id,
      key: job.key,
      message: new Stalled().message,
    })
    if (running?.stop === stop) retire(running)
  }, 1000)
  try {
    const parts = await Promise.all(
      job.parts.map(async (part) => {
        const wav = await asWav(part)
        return {
          file: wav.file,
          facts:
            part.container === "aiff"
              ? { ...part.facts, kept: null }
              : part.facts,
          edits: part.edits,
          title: part.title,
        }
      })
    )
    let last = 0
    const { bytes, level, length } = await joinAudio(
      mediabunny,
      parts,
      job.plan,
      {
        joining: job.joining,
        level: job.level,
        sound: job.sound,
        changes: job.changes,
        rnnoise: await denoiser(job.sound),
        tags: job.tags,
        chapters: job.chapters,
        signal: stop.signal,
        onProgress: (fraction) => {
          sign = Date.now()
          if (fraction - last < 0.01 && fraction < 1) return
          last = fraction
          send({ type: "progress", id: job.id, key: job.key, fraction })
        },
      }
    )
    if (stop.signal.aborted) {
      send({ type: "abandoned", id: job.id })
      return
    }
    sign = Date.now()
    const heard = await hearAudio(mediabunny, bytes, stop.signal)
    if (stop.signal.aborted) {
      send({ type: "abandoned", id: job.id })
      return
    }
    send(
      {
        type: "done",
        id: job.id,
        job: "join",
        key: job.key,
        plan: job.plan,
        written: { bytes, heard, level },
        length,
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
        message: said(error, UNJOINED),
      })
  } finally {
    clearInterval(watch)
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
  } else if (message.job === "join") void joined(message, stop).finally(done)
  else void convert(message, stop).finally(done)
}
