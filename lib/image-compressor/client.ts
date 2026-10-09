"use client"

import {
  MAX_INPUT_BYTES,
  isAnimated,
  sniffFormat,
  type InputFormat,
} from "./formats"
import type { CompressRequest, OpenRequest, WorkerResponse } from "./protocol"

export const unsupportedMessage =
  "Choose a JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, ICO, SVG or JPEG XL image."

export interface InspectedFile {
  format: InputFormat
  animated: boolean
}

/** Check size and identify the real format before any decoding work starts. */
export async function inspectFile(file: Blob): Promise<InspectedFile> {
  if (file.size === 0) throw new Error("That file is empty.")
  if (file.size > MAX_INPUT_BYTES)
    throw new Error("Choose an image smaller than 50 MB.")
  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())
  const format = sniffFormat(head)
  if (!format) throw new Error(unsupportedMessage)
  return { format, animated: isAnimated(head, format) }
}

/** SVG is vector art: draw it at a useful size (at least 1024 px on the long edge). */
export async function rasteriseSvg(file: Blob) {
  const url = URL.createObjectURL(
    new Blob([await file.arrayBuffer()], { type: "image/svg+xml" })
  )
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth || 1024
    const height = image.naturalHeight || 1024
    const scale = Math.min(
      8192 / Math.max(width, height),
      Math.max(1, 1024 / Math.max(width, height))
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("Your browser cannot draw this SVG.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    canvas.width = canvas.height = 0
    return { data: data.data, width: data.width, height: data.height }
  } catch {
    throw new Error(
      "We could not draw that SVG. Check that it is a complete, valid file."
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Owns the compression worker. Cancelling a long encode terminates the worker,
 * so the client starts a fresh one and reopens the current image.
 */
export class CompressorClient {
  private worker: Worker | null = null
  private lastOpen: OpenRequest | null = null

  constructor(private readonly listener: (message: WorkerResponse) => void) {}

  private spawn() {
    const worker = new Worker(
      new URL("./compress.worker.ts", import.meta.url),
      {
        type: "module",
      }
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
      this.listener(event.data)
    worker.onerror = () =>
      this.listener({
        type: "open-error",
        message:
          "The image engine stopped unexpectedly. Reload the page and try again.",
      })
    this.worker = worker
    return worker
  }

  open(request: OpenRequest) {
    this.lastOpen = request
    ;(this.worker ?? this.spawn()).postMessage(request)
  }

  compress(request: CompressRequest) {
    ;(this.worker ?? this.spawn()).postMessage(request)
  }

  /** Let the running job stop at its next checkpoint; its result will be ignored. */
  supersede(id: number) {
    this.worker?.postMessage({ type: "supersede", id })
  }

  /** Stop the running job immediately; the image is reopened in a new worker. */
  cancel() {
    this.worker?.terminate()
    this.worker = null
    if (this.lastOpen) this.spawn().postMessage(this.lastOpen)
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.lastOpen = null
  }
}
