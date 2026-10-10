/// <reference lib="webworker" />
import {
  decodeOutput,
  encodeImage,
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
import { outputFormats } from "@/lib/image-compressor/formats"
import { hasTransparency } from "@/lib/image-compressor/pixels"
import { runPipeline } from "@/lib/image-compressor/pipeline"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { orientFocus } from "./focus"
import { applyDensity } from "./metadata"
import { render } from "./pipeline"
import type {
  ProcessRequest,
  ResizedOutput,
  ResizerRequest,
  ResizerResponse,
} from "./protocol"
import {
  backdrop,
  compression,
  cropAspect,
  embeddedDpi,
  matte,
  planOutputs,
  resolveFormat,
} from "./settings"
import { smartFocus } from "./smart-focus"

declare const self: DedicatedWorkerGlobalScope

/** The most recently decoded image; a batch decodes one image per worker at a time. */
let cached: { id: string; pixels: Pixels; transparent: boolean } | null = null
let generation = 0

class Abandoned extends Error {}

const post = (message: ResizerResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

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
      const pixels = job.pixels ?? (await decodeImageFile(job.file, job.format))
      if (tooLarge(pixels.width, pixels.height))
        throw new Error(TOO_MANY_PIXELS)
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
    const { settings } = job
    const size = { width: source.width, height: source.height }
    const aspect = cropAspect(settings, size)
    let focus = job.focus ?? settings.focus
    if (!job.focus && settings.focusMode === "smart" && aspect) {
      progress("Finding the focus…")
      const sideways = settings.rotation === 90 || settings.rotation === 270
      focus = orientFocus(
        smartFocus(source, sideways ? 1 / aspect : aspect),
        settings.rotation,
        settings.flipX,
        settings.flipY
      )
    }
    const { plans, error } = planOutputs(settings, { size, focus })
    if (error) throw new Error(error)
    const format = resolveFormat(settings, job.format, transparent)
    const { preset, quality } = compression(settings, format)
    const dpi = embeddedDpi(settings)
    const outputs: ResizedOutput[] = []
    for (const [index, plan] of plans.entries()) {
      await checkpoint()
      const suffix = plans.length > 1 ? ` ${index + 1} of ${plans.length}` : ""
      progress(`Resizing${suffix}…`)
      const pixels = await render(source, settings, plan, backdrop(settings), {
        resize: (image, target, kernel) => resizePixels(image, target, kernel),
      })
      const { candidate } = await runPipeline({
        job: {
          candidates: [format],
          compression: preset,
          quality,
          targetBytes: null,
          allowDownscale: false,
          effort: "balanced",
          chroma444: false,
          progressive: true,
          pngColors: 256,
          dithering: true,
          resample: "lanczos3",
          background: matte(settings),
        },
        output: plan.layout.output,
        transparent: outputFormats[format].alpha
          ? false
          : hasTransparency(pixels),
        pixelsAt: async () => pixels,
        codecs: { encode: encodeImage, decode: decodeOutput },
        checkpoint,
        progress: (label) => progress(`${label}${suffix}`),
      })
      const bytes = dpi
        ? applyDensity(format, new Uint8Array(candidate.bytes), dpi)
        : new Uint8Array(candidate.bytes)
      outputs.push({
        // Copy: encoders may return a view of their own memory.
        bytes: bytes.slice().buffer,
        format,
        width: plan.layout.output.width,
        height: plan.layout.output.height,
        similarity: candidate.similarity,
      })
    }
    await checkpoint()
    post(
      { type: "done", id: job.id, key: job.key, outputs, usedFocus: focus },
      outputs.map((output) => output.bytes)
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
        "Something went wrong while resizing. Try a smaller image.",
    })
  }
}

self.onmessage = (event: MessageEvent<ResizerRequest>) => {
  const request = event.data
  if (request.type === "supersede") generation = request.generation
  else if (request.type === "forget") {
    if (cached?.id === request.id) cached = null
  } else {
    generation = Math.max(generation, request.generation)
    void process(request)
  }
}
