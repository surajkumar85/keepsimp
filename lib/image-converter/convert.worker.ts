/// <reference lib="webworker" />
import {
  resizePixels,
  setCodecLoadListener,
} from "@/lib/image-compressor/codecs"
import {
  decodeErrorMessage,
  decodeImageFile,
  previewBitmap,
  tooLarge,
  TOO_MANY_PIXELS,
} from "@/lib/image-compressor/decode"
import type { InputFormat } from "@/lib/image-compressor/formats"
import { hasTransparency } from "@/lib/image-compressor/pixels"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { toGreyscale } from "./greyscale"
import { createDeps } from "./deps"
import { convert } from "./pipeline"
import type {
  CompareRequest,
  CompareResponse,
  ConvertedOutput,
  ConverterRequest,
  ConverterResponse,
  ProcessRequest,
} from "./protocol"
import {
  activeTargets,
  limitedSize,
  settingsProblem,
  type ConverterSettings,
} from "./settings"
import { targets } from "./targets"

declare const self: DedicatedWorkerGlobalScope

/** The most recently decoded image; a batch decodes one image per worker at a time. */
let cached: { id: string; pixels: Pixels; transparent: boolean } | null = null
let generation = 0

class Abandoned extends Error {}

const post = (
  message: ConverterResponse | CompareResponse,
  transfer: Transferable[] = []
) => self.postMessage(message, transfer)

async function load(file: Blob, format: InputFormat, pixels?: Pixels) {
  const decoded = pixels ?? (await decodeImageFile(file, format))
  if (tooLarge(decoded.width, decoded.height)) throw new Error(TOO_MANY_PIXELS)
  return decoded
}

/** Apply the size limit and greyscale once, before any format is encoded. */
async function prepare(source: Pixels, settings: ConverterSettings) {
  const size = limitedSize(settings, source)
  const sized = await resizePixels(source, size, "lanczos3")
  return settings.greyscale ? toGreyscale(sized) : sized
}

async function process(job: ProcessRequest) {
  const checkpoint = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (job.generation < generation) throw new Abandoned()
  }
  const progress = (label: string) =>
    post({ type: "progress", id: job.id, label })
  setCodecLoadListener((label) => progress(`Loading the ${label}…`))

  if (cached?.id !== job.id) {
    cached = null
    try {
      progress("Reading…")
      const pixels = await load(job.file, job.format, job.pixels)
      cached = { id: job.id, pixels, transparent: hasTransparency(pixels) }
    } catch (error) {
      post({
        type: "open-error",
        id: job.id,
        message: decodeErrorMessage(error),
      })
      return
    }
  }
  const { pixels: source, transparent } = cached
  if (job.describe) {
    const thumbnail = await previewBitmap(source, 640)
    post(
      {
        type: "opened",
        id: job.id,
        width: source.width,
        height: source.height,
        transparent,
        thumbnail,
      },
      [thumbnail]
    )
  }

  try {
    await checkpoint()
    const problem = settingsProblem(job.settings)
    if (problem) throw new Error(problem)
    const prepared = await prepare(source, job.settings)
    const deps = createDeps(checkpoint, progress)
    const outputs: ConvertedOutput[] = []
    for (const target of activeTargets(job.settings)) {
      await checkpoint()
      progress(`Converting to ${targets[target].label}…`)
      const result = await convert(
        prepared,
        target,
        job.settings,
        deps,
        async (label) => {
          await checkpoint()
          progress(label)
        }
      )
      outputs.push({
        target,
        // Copy: encoders may return a view of their own memory.
        bytes: result.bytes.slice().buffer,
        width: result.width,
        height: result.height,
        similarity: result.similarity,
        page: result.page
          ? { ...result.page, data: result.page.data.slice() }
          : undefined,
      })
    }
    await checkpoint()
    post(
      { type: "done", id: job.id, key: job.key, outputs },
      outputs.flatMap((output) => [
        output.bytes,
        ...(output.page ? [output.page.data.buffer] : []),
      ])
    )
  } catch (error) {
    if (error instanceof Abandoned) {
      post({ type: "abandoned", id: job.id })
      return
    }
    post({
      type: "error",
      id: job.id,
      key: job.key,
      message:
        (error as Error).message ||
        "Something went wrong while converting. Try a smaller image.",
    })
  }
}

async function compare(job: CompareRequest) {
  const progress = (label: string) => post({ type: "compare-progress", label })
  setCodecLoadListener((label) => progress(`Loading the ${label}…`))
  try {
    const source = await load(job.file, job.format, job.pixels)
    const prepared = await prepare(source, job.settings)
    const deps = createDeps()
    const results = []
    for (const target of job.targets) {
      progress(`Trying ${targets[target].label}…`)
      const result = await convert(prepared, target, job.settings, deps)
      results.push({
        target,
        bytes: result.bytes.byteLength,
        similarity: result.similarity,
      })
    }
    post({ type: "compared", results })
  } catch (error) {
    post({ type: "compare-error", message: decodeErrorMessage(error) })
  }
}

self.onmessage = (event: MessageEvent<ConverterRequest>) => {
  const request = event.data
  if (request.type === "supersede") generation = request.generation
  else if (request.type === "forget") {
    if (cached?.id === request.id) cached = null
  } else if (request.type === "compare") void compare(request)
  else {
    generation = Math.max(generation, request.generation)
    void process(request)
  }
}
