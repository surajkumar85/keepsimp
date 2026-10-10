import type { Rotation } from "@/lib/image-compressor/geometry"
import type { AnimationSettings, Trim } from "./settings"
import type { SourceFormat } from "./source"

export interface ProcessRequest {
  type: "process"
  /** Increases whenever settings change; older work is abandoned. */
  generation: number
  id: string
  file: Blob
  settings: AnimationSettings
  trim: Trim
  key: string
  /** Ask for the animation's facts and thumbnails the first time it is seen. */
  describe: boolean
}

/** Draw one moment of an animation, for the paused preview. */
export interface ViewRequest {
  type: "view"
  /** Echoed back, so late answers can be told from the current one. */
  request: number
  views: {
    /** "original" and "result" are kept open separately between requests. */
    slot: "original" | "result"
    file: Blob
    /** Milliseconds from the start of that file. */
    time: number
    /** Turn or mirror the frame, so an original lines up with its result. */
    orientation?: { rotation: Rotation; flipX: boolean; flipY: boolean }
  }[]
}

export type AnimationRequest =
  | ProcessRequest
  | ViewRequest
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

export interface ConvertedOutput {
  bytes: ArrayBuffer
  width: number
  height: number
  frames: number
  duration: number
  plays: number
  note: string | null
}

export type AnimationResponse =
  | {
      type: "opened"
      id: string
      format: SourceFormat
      width: number
      height: number
      plays: number
      /** Milliseconds each original frame is shown. */
      durations: number[]
      transparent: boolean
      thumbnail: ImageBitmap
      /** Up to 16 moments side by side, for the trim bar. */
      strip: ImageBitmap | null
    }
  | { type: "open-error"; id: string; message: string }
  | { type: "progress"; id: string; label: string }
  | { type: "done"; id: string; key: string; output: ConvertedOutput }
  | { type: "error"; id: string; key: string; message: string }
  | { type: "abandoned"; id: string }

export type ViewResponse =
  | {
      type: "viewed"
      request: number
      frames: Partial<Record<"original" | "result", ImageBitmap>>
    }
  | { type: "view-error"; request: number; message: string }
