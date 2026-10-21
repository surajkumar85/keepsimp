/// <reference lib="webworker" />
/**
 * Transcribing a sound on the device. The sound is decoded as it is read,
 * mixed to one channel and resampled to the 16 kHz Whisper hears, and
 * handed to Whisper 30 seconds at a time; each window after the first
 * starts where the last segment it was sure of ended (`keptFrom`). The
 * engine (Transformers.js with ONNX Runtime's WebAssembly) and the model
 * are loaded from this site's own /whisper/<version>/ files, only when a
 * transcription starts, and never from anywhere else. The page stops a
 * transcription by ending this worker.
 */
import type * as Mediabunny from "mediabunny"
import type { ReadFacts } from "./mediabunny-audio"
import { Resampler } from "./resample"
import {
  keptFrom,
  WHISPER_RATE,
  WINDOW,
  withoutLoops,
  type Heard,
  type Segment,
} from "./transcript"
import { whisperBase, whisperModel, type WhisperId } from "./whisper"

export interface TranscribeJob {
  file: Blob
  kept: ReadFacts["kept"]
  /** Seconds of sound, for saying how far it has come. */
  duration: number
  model: WhisperId
  /** A language code, or "" for Whisper to find it. */
  language: string
  /** Into English, rather than in the language spoken. */
  translate: boolean
}

export type TranscribeMessage =
  | { type: "loading"; fraction: number }
  | { type: "segments"; segments: Segment[]; done: number }
  | { type: "done" }
  | { type: "error"; message: string }

const post = (message: TranscribeMessage) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message)

interface Engine {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>
  ) => Promise<
    (
      audio: Float32Array,
      options: Record<string, unknown>
    ) => Promise<{ text: string; chunks?: Heard[] }>
  >
  env: {
    allowRemoteModels: boolean
    allowLocalModels: boolean
    localModelPath: string
    useBrowserCache: boolean
    backends: { onnx: { wasm: { wasmPaths: string } } }
  }
}

async function transcribe(job: TranscribeJob) {
  const base = whisperBase()
  const model = whisperModel(job.model)
  const { pipeline, env } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}engine/transformers.min.js`
  )) as Engine
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = `${base}models/`
  // The site's service worker keeps the files once used; a second copy is not wanted.
  env.useBrowserCache = false
  env.backends.onnx.wasm.wasmPaths = `${base}engine/`
  const total = model.files.reduce((sum, file) => sum + file.bytes, 0)
  const loaded = new Map<string, number>()
  const whisper = await pipeline("automatic-speech-recognition", model.repo, {
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    device: "wasm",
    progress_callback: (event: { file?: string; loaded?: number }) => {
      if (!event.file || event.loaded === undefined) return
      loaded.set(event.file, event.loaded)
      let sum = 0
      for (const value of loaded.values()) sum += value
      post({ type: "loading", fraction: Math.min(1, sum / total) })
    },
  })
  const options = {
    return_timestamps: true,
    task: job.translate ? "translate" : "transcribe",
    ...(job.language ? { language: job.language } : {}),
  }

  const engine = (await import("mediabunny")) as typeof Mediabunny
  const { soundOf } = await import("./mediabunny-audio")
  const size = WINDOW * WHISPER_RATE
  // Sound at 16 kHz from `from` (in samples of the whole), not yet heard.
  let held = new Float32Array(size * 2)
  let length = 0
  let from = 0
  let resampler: Resampler | null = null
  let segments: Segment[] = []
  const add = (part: Float32Array) => {
    if (length + part.length > held.length) {
      const grown = new Float32Array(
        Math.max(held.length * 2, length + part.length)
      )
      grown.set(held.subarray(0, length))
      held = grown
    }
    held.set(part, length)
    length += part.length
  }
  /** Hear the window at the start of what is held; the next starts where it says. */
  const hear = async (last: boolean) => {
    const count = Math.min(size, length)
    const window = new Float32Array(size)
    window.set(held.subarray(0, count))
    const result = await whisper(
      last ? window.subarray(0, Math.max(count, WHISPER_RATE)) : window,
      options
    )
    const start = from / WHISPER_RATE
    const { kept, next } = keptFrom(
      start,
      count / WHISPER_RATE,
      result.chunks ?? [],
      last && count === length
    )
    const drop = Math.min(length, Math.round(next * WHISPER_RATE) - from)
    held.copyWithin(0, drop, length)
    length -= drop
    from += drop
    if (kept.length) segments = withoutLoops([...segments, ...kept])
    post({ type: "segments", segments, done: from / WHISPER_RATE })
  }

  for await (const { planes, sampleRate } of soundOf(
    engine,
    job.file,
    job.kept
  )) {
    const mono = new Float32Array(planes[0].length)
    for (const plane of planes)
      for (let index = 0; index < mono.length; index++)
        mono[index] += plane[index] / planes.length
    resampler ??=
      sampleRate === WHISPER_RATE
        ? null
        : new Resampler(1, sampleRate / WHISPER_RATE)
    add(resampler ? resampler.process([mono])[0] : mono)
    while (length >= size) await hear(false)
  }
  if (resampler) add(resampler.flush()[0])
  while (length > 0) await hear(true)
  post({ type: "done" })
}

self.onmessage = (event: MessageEvent<TranscribeJob>) => {
  transcribe(event.data).catch((error: unknown) => {
    // Said plainly on the page; the details are for whoever looks.
    console.error(error)
    post({
      type: "error",
      message:
        error instanceof Error && /memory|allocation/i.test(error.message)
          ? "This device ran out of memory for the model. Try the Base model, or close other tabs."
          : "The transcription could not run in this browser.",
    })
  })
}
