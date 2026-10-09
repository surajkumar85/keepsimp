/// <reference lib="webworker" />
import {
  decodeAvif,
  decodeHeic,
  decodeJxl,
  decodeOutput,
  decodeTiff,
  encodeImage,
  resizePixels,
  setCodecLoadListener,
} from "./codecs"
import type { InputFormat } from "./formats"
import { MAX_PIXELS, type Size } from "./geometry"
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

const tooLarge = (width: number, height: number) => width * height > MAX_PIXELS

async function nativeDecode(blob: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "default",
  })
  try {
    if (tooLarge(bitmap.width, bitmap.height))
      throw new Error("Use an image with at most 50 megapixels.")
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Your browser cannot read image pixels here.")
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    canvas.width = canvas.height = 0
    return { data: image.data, width: image.width, height: image.height }
  } finally {
    bitmap.close()
  }
}

async function decode(file: Blob, format: InputFormat): Promise<Pixels> {
  const bytes = () => file.arrayBuffer()
  if (format === "jxl") return decodeJxl(await bytes())
  try {
    return await nativeDecode(file)
  } catch (error) {
    if ((error as Error).message.includes("50 megapixels")) throw error
    if (format === "avif") return decodeAvif(await bytes())
    if (format === "heic") return decodeHeic(await bytes())
    if (format === "tiff") return decodeTiff(await bytes())
    throw error
  }
}

async function open(request: OpenRequest) {
  try {
    source = null
    const pixels =
      request.pixels ?? (await decode(request.file, request.format))
    if (tooLarge(pixels.width, pixels.height))
      throw new Error("Use an image with at most 50 megapixels.")
    source = pixels
    transparent = hasTransparency(pixels)
    const scale = Math.min(1, 1600 / Math.max(pixels.width, pixels.height))
    const preview = await createImageBitmap(
      new ImageData(pixels.data, pixels.width, pixels.height),
      {
        resizeWidth: Math.max(1, Math.round(pixels.width * scale)),
        resizeHeight: Math.max(1, Math.round(pixels.height * scale)),
        resizeQuality: "high",
        premultiplyAlpha: "none",
      }
    )
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
    const message = (error as Error).message
    post({
      type: "open-error",
      message: message.includes("megapixels")
        ? message
        : "We could not read that image. It may be damaged, or this browser cannot decode it.",
    })
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
