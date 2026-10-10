import type { InputFormat } from "@/lib/image-compressor/formats"
import type { PdfImage } from "./encoders/pdf"
import type { ConverterSettings } from "./settings"
import type { Target } from "./targets"

export interface ProcessRequest {
  type: "process"
  /** Increases whenever settings change; older work is abandoned. */
  generation: number
  id: string
  file: Blob
  format: InputFormat
  /** SVG is rasterised on the main thread. */
  pixels?: {
    data: Uint8ClampedArray<ArrayBuffer>
    width: number
    height: number
  }
  settings: ConverterSettings
  key: string
  /** Ask for dimensions and a thumbnail the first time an image is seen. */
  describe: boolean
}

/** Encode one image in several formats to compare their sizes; nothing is kept. */
export interface CompareRequest {
  type: "compare"
  file: Blob
  format: InputFormat
  pixels?: ProcessRequest["pixels"]
  settings: ConverterSettings
  targets: Target[]
}

export type ConverterRequest =
  | ProcessRequest
  | CompareRequest
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

export interface ConvertedOutput {
  target: Target
  bytes: ArrayBuffer
  width: number
  height: number
  similarity: number | null
  page?: PdfImage
}

export type ConverterResponse =
  | {
      type: "opened"
      id: string
      width: number
      height: number
      transparent: boolean
      thumbnail: ImageBitmap
    }
  | { type: "open-error"; id: string; message: string }
  | { type: "progress"; id: string; label: string }
  | { type: "done"; id: string; key: string; outputs: ConvertedOutput[] }
  | { type: "error"; id: string; key: string; message: string }
  | { type: "abandoned"; id: string }

export type CompareResponse =
  | { type: "compare-progress"; label: string }
  | {
      type: "compared"
      results: { target: Target; bytes: number; similarity: number | null }[]
    }
  | { type: "compare-error"; message: string }
