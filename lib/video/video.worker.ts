/// <reference lib="webworker" />
/**
 * Reads and writes video files off the page. Results are written to the
 * page's folder on disk (scratch.ts) where the browser allows, opened again
 * and checked before they are handed over.
 */
import { writtenProblems } from "./check"
import { fastStart } from "./faststart"
import { outputInfo } from "./formats"
import { VideoProblem } from "./mediabunny-video"
import type {
  ConvertJob,
  IndexPlace,
  ReadJob,
  VideoRequest,
  VideoResponse,
} from "./protocol"
import { scratchFile } from "./scratch"
import { soundStart } from "./sound-start"

declare const self: DedicatedWorkerGlobalScope

const UNREADABLE =
  "This file could not be read. It may be damaged, or of a kind not read here."
const UNWRITTEN =
  "This video could not be written. Try again, or choose another format or codec."

let generation = 0
let written = 0
/** The job running now, and how to stop it. */
let running: {
  id: string
  job: "read" | "convert"
  generation: number
  stop: AbortController
} | null = null

const post = (message: VideoResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

const engine = () => import("mediabunny")
const engineFiles = () => import("./mediabunny-video")
const soundFiles = () => import("@/lib/audio/mediabunny-audio")

const said = (error: unknown, fallback: string) =>
  error instanceof VideoProblem ? error.message : fallback

async function read(job: ReadJob, stop: AbortController) {
  const send = (message: VideoResponse, transfer: Transferable[] = []) => {
    if (!stop.signal.aborted) post(message, transfer)
  }
  try {
    const mediabunny = await engine()
    const { readVideo } = await engineFiles()
    const { facts, poster } = await readVideo(
      mediabunny,
      job.file,
      job.container
    )
    send(
      { type: "done", id: job.id, job: "read", facts, poster },
      poster ? [poster] : []
    )
  } catch (error) {
    send({ type: "open-error", id: job.id, message: said(error, UNREADABLE) })
  }
}

async function convert(job: ConvertJob, stop: AbortController) {
  const send = (message: VideoResponse) => {
    if (!stop.signal.aborted) post(message)
  }
  const { plan } = job
  const name = `${job.id}-${++written}.${outputInfo[plan.container].extension}`
  let scratch: Awaited<ReturnType<typeof scratchFile>> = null
  try {
    const mediabunny = await engine()
    const { convertVideo, readBack } = await engineFiles()
    // Seconds the sound encoder puts before the sound, skipped by an edit list.
    let priming = 0
    if (plan.audio.action === "encode" && plan.audio.codec === "aac") {
      // An encoder that keeps all of the sound (the browser's, or ours), and its priming.
      const { aacEncoding } = await soundFiles()
      const samples = await aacEncoding(
        mediabunny,
        job.facts.audio!.sampleRate,
        job.facts.audio!.channels,
        plan.audio.bitrate
      )
      priming = samples / job.facts.audio!.sampleRate
    }
    scratch = await scratchFile(job.folder, name)
    const memory = scratch ? null : new mediabunny.BufferTarget()
    const target =
      memory ??
      new mediabunny.StreamTarget(scratch!.writable, { chunked: true })
    let last = 0
    await convertVideo(mediabunny, job.file, plan, target, {
      signal: stop.signal,
      onProgress: (fraction) => {
        const now = Date.now()
        if (now - last < 250) return
        last = now
        send({ type: "progress", id: job.id, key: job.key, fraction })
      },
    })
    if (stop.signal.aborted) return
    let file: Blob = scratch
      ? await scratch.file()
      : new Blob([memory!.buffer!], { type: outputInfo[plan.container].mime })
    file = new Blob([file], { type: outputInfo[plan.container].mime })
    let index: IndexPlace | null = null
    if (plan.container === "mp4" || plan.container === "mov") {
      const moved = await fastStart(file, {
        edit: priming ? (index) => soundStart(index, priming) : undefined,
      })
      file = moved.file
      index = moved.moved ? "front" : moved.reason
    }
    const back = await readBack(mediabunny, file, plan.container)
    const problems = writtenProblems(
      plan,
      back.facts,
      {
        duration: job.facts.duration,
        frameRate: job.facts.video?.frameRate ?? null,
      },
      back.decoded
    )
    send({
      type: "done",
      id: job.id,
      job: "convert",
      key: job.key,
      file,
      scratch: scratch ? name : null,
      written: back.facts,
      problems,
      index,
    })
  } catch (error) {
    scratch?.close()
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
 * Stop a job and ask to be replaced. Cancelling can wait for ever on an
 * encoder, so the job is not waited for: the page ends this worker.
 */
function retire(job: NonNullable<typeof running>) {
  job.stop.abort()
  running = null
  post({ type: "retired", id: job.id })
}

self.onmessage = (event: MessageEvent<VideoRequest>) => {
  const message = event.data
  if (message.type === "supersede") {
    generation = message.generation
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
