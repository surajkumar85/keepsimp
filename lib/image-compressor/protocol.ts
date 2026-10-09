import type { InputFormat, OutputFormat } from "./formats"
import type { PipelinePlan, Size } from "./geometry"
import type { CompressionPreset, Effort } from "./quality"
import type { Resample } from "./settings"

export interface OpenRequest {
  type: "open"
  file: Blob
  format: InputFormat
  /** SVG is rasterised on the main thread, where an image element is available. */
  pixels?: {
    data: Uint8ClampedArray<ArrayBuffer>
    width: number
    height: number
  }
}

export interface CompressRequest {
  type: "compress"
  id: number
  plan: PipelinePlan
  candidates: OutputFormat[]
  compression: CompressionPreset
  quality: number
  targetBytes: number | null
  allowDownscale: boolean
  effort: Effort
  chroma444: boolean
  progressive: boolean
  pngColors: number
  dithering: boolean
  resample: Resample
  background: [number, number, number]
}

/** Abandon any running job without starting another. */
export interface SupersedeRequest {
  type: "supersede"
  id: number
}

export type WorkerRequest = OpenRequest | CompressRequest | SupersedeRequest

export type WorkerResponse =
  | {
      type: "opened"
      width: number
      height: number
      transparent: boolean
      preview: ImageBitmap
    }
  | { type: "open-error"; message: string }
  | { type: "progress"; id: number; label: string }
  | {
      type: "done"
      id: number
      format: OutputFormat
      bytes: ArrayBuffer
      size: Size
      reference: ImageBitmap
      similarity: number
      quality: number | null
      /** For target sizes: whether the file fits, and whether dimensions had to shrink. */
      fits: boolean | null
      downscaled: boolean
    }
  | { type: "error"; id: number; message: string }
