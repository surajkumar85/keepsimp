/// <reference lib="webworker" />
import {
  decodeOutput,
  encodeImage,
  resizePixels,
  setCodecLoadListener,
} from "./codecs"
import {
  decodeErrorMessage,
  decodeImageFile,
  previewBitmap,
  tooLarge,
  TOO_MANY_PIXELS,
} from "./decode"
import type { Size } from "./geometry"
import { extractOriented, hasTransparency } from "./pixels"
import { runPipeline } from "./pipeline"
import type { Pixels } from "./ssim"
import type {
  CompressRequest,
  OpenRequest,
  WorkerRequest,
  WorkerResponse,
} from "./protocol"

declare const self: DedicatedWorkerGlobalScope

let source: Pixels | null = null
let transparent = false
let latest = 0

class Superseded extends Error {}

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

async function open(request: OpenRequest) {
  try {
    source = null
    const pixels =
      request.pixels ?? (await decodeImageFile(request.file, request.format))
    if (tooLarge(pixels.width, pixels.height)) throw new Error(TOO_MANY_PIXELS)
    source = pixels
    transparent = hasTransparency(pixels)
    const preview = await previewBitmap(pixels, 1600)
    post(
      {
        type: "opened",
        width: pixels.width,
        height: pixels.height,
        transparent,
        preview,
      },
      [preview]
    )
  } catch (error) {
    post({ type: "open-error", message: decodeErrorMessage(error) })
  }
}

async function compress(job: CompressRequest) {
  const checkpoint = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (job.id !== latest) throw new Superseded()
  }
  const progress = (label: string) =>
    post({ type: "progress", id: job.id, label })
  setCodecLoadListener((label) => progress(`Loading the ${label}…`))
  try {
    if (!source) throw new Error("Choose an image first.")
    progress("Preparing pixels…")
    await checkpoint()
    const { plan } = job
    const region = extractOriented(
      source,
      plan.rotation,
      plan.flipX,
      plan.flipY,
      plan.sourceRect
    )
    const resized = new Map<string, Pixels>()
    const pixelsAt = async (size: Size) => {
      const key = `${size.width}x${size.height}`
      let pixels = resized.get(key)
      if (!pixels) {
        progress("Resampling…")
        pixels = await resizePixels(region, size, job.resample)
        resized.set(key, pixels)
      }
      return pixels
    }
    const { candidate: chosen, size } = await runPipeline({
      job,
      output: plan.output,
      transparent: transparent && hasTransparency(region),
      pixelsAt,
      codecs: { encode: encodeImage, decode: decodeOutput },
      checkpoint,
      progress,
    })

    await checkpoint()
    // Copy before transferring: an encoder may hand back a view of its own memory.
    const bytes = chosen.bytes.slice(0)
    const finalPixels = await pixelsAt(size)
    const reference = await createImageBitmap(
      new ImageData(
        new Uint8ClampedArray(finalPixels.data),
        finalPixels.width,
        finalPixels.height
      ),
      { premultiplyAlpha: "none" }
    )
    post(
      {
        type: "done",
        id: job.id,
        format: chosen.format,
        bytes,
        size,
        reference,
        similarity: chosen.similarity,
        quality: chosen.quality,
        fits: chosen.fits,
        downscaled:
          size.width !== plan.output.width ||
          size.height !== plan.output.height,
      },
      [bytes, reference]
    )
  } catch (error) {
    if (error instanceof Superseded) return
    post({
      type: "error",
      id: job.id,
      message:
        (error as Error).message ||
        "Something went wrong while compressing. Try a smaller image.",
    })
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === "open") void open(request)
  else if (request.type === "supersede") latest = request.id
  else {
    latest = request.id
    void compress(request)
  }
}
