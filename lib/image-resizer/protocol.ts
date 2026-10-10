import type { InputFormat, OutputFormat } from "@/lib/image-compressor/formats"
import type { Focus } from "./focus"
import type { ResizerSettings } from "./settings"

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
  settings: ResizerSettings
  /** Focus chosen for this image, or null to use the shared setting. */
  focus: Focus | null
  key: string
  /** Ask for dimensions and a thumbnail the first time an image is seen. */
  describe: boolean
}

export type ResizerRequest =
  | ProcessRequest
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

export interface ResizedOutput {
  bytes: ArrayBuffer
  format: OutputFormat
  width: number
  height: number
  similarity: number
}

export type ResizerResponse =
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
  | {
      type: "done"
      id: string
      key: string
      outputs: ResizedOutput[]
      usedFocus: Focus
    }
  | { type: "error"; id: string; key: string; message: string }
  | { type: "abandoned"; id: string }
