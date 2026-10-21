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
  inSound,
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
  /** The language Whisper found, when none was chosen. */
  | { type: "language"; code: string }
  | { type: "segments"; segments: Segment[]; done: number }
  | { type: "done" }
  | { type: "error"; message: string }

const post = (message: TranscribeMessage) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message)

/** What the pipeline holds, as far as finding the language needs. */
interface Whisper {
  (
    audio: Float32Array,
    options: Record<string, unknown>
  ): Promise<{
    text: string
    chunks?: Heard[]
  }>
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>
  model: ((
    inputs: Record<string, unknown>
  ) => Promise<
    Record<string, { data: Float32Array; dims: number[]; dispose?: () => void }>
  >) & {
    generation_config: {
      decoder_start_token_id: number
      lang_to_id: Record<string, number>
    }
  }
}

interface Engine {
  Tensor: new (type: string, data: BigInt64Array, dims: number[]) => unknown
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>
  ) => Promise<Whisper>
  env: {
    allowRemoteModels: boolean
    allowLocalModels: boolean
    localModelPath: string
    useBrowserCache: boolean
    backends: { onnx: { wasm: { wasmPaths: string } } }
  }
}

/**
 * Whisper's files are tens of megabytes, sent compressed and so without a
 * length: a browser that cannot write one into its HTTP cache (a private
 * window's is small) fails the whole request. They are fetched past that
 * cache; the site's service worker keeps its own copy once used.
 */
const plainFetch = self.fetch.bind(self)
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  return plainFetch(
    input,
    url.includes("/whisper/") ? { ...init, cache: "no-store" } : init
  )
}

async function transcribe(job: TranscribeJob) {
  const base = whisperBase()
  const model = whisperModel(job.model)
  const { pipeline, env, Tensor } = (await import(
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
  let language = job.language
  /**
   * The language of the first window, as Whisper finds it: the most likely
   * of its language tokens after <|startoftranscript|> (the library itself
   * only assumes English).
   */
  const detect = async (audio: Float32Array) => {
    const { input_features } = await whisper.processor(audio)
    const config = whisper.model.generation_config
    const start = new Tensor(
      "int64",
      BigInt64Array.of(BigInt(config.decoder_start_token_id)),
      [1, 1]
    )
    const outputs = await whisper.model({
      input_features,
      decoder_input_ids: start,
    })
    const { data, dims } = outputs.logits
    const row = data.subarray(data.length - dims[dims.length - 1])
    let best = "<|en|>"
    for (const [token, id] of Object.entries(config.lang_to_id))
      if (row[id] > row[config.lang_to_id[best]]) best = token
    for (const output of Object.values(outputs)) output.dispose?.()
    return best.slice(2, -2)
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
    const audio = last
      ? window.subarray(0, Math.max(count, WHISPER_RATE))
      : window
    if (!language) {
      language = await detect(audio)
      post({ type: "language", code: language })
    }
    // The engine may take the array it is given: the sound is measured from a copy.
    const measured = audio.slice()
    const result = await whisper(audio, {
      return_timestamps: true,
      task: job.translate ? "translate" : "transcribe",
      language,
    })
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
    // What lies in silence was made up; the next window still starts after it.
    const said = inSound(kept, measured, start)
    if (said.length) segments = withoutLoops([...segments, ...said])
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
