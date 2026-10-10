import type { Rect, Rotation, Size } from "@/lib/image-compressor/geometry"
import type { AnimationSettings, Target, Trim } from "./settings"
import type { SourceFormat } from "./source"

/** What to open: one animated image or video file, or still images to play in order. */
export type SourceInput =
  | { kind: "file"; file: Blob }
  | {
      kind: "stills"
      files: Blob[]
      /** Milliseconds each image is shown. */
      durations: number[]
    }

export interface ProcessRequest {
  type: "process"
  /** Increases whenever settings change; older work is abandoned. */
  generation: number
  id: string
  input: SourceInput
  settings: AnimationSettings
  trim: Trim
  key: string
  /** Changes when the input itself does, such as a reordered set of stills. */
  inputKey: string
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
    input: SourceInput
    /** Changes when the input does; the worker keeps the file open until then. */
    inputKey: string
    /** Milliseconds from the start of that file. */
    time: number
    /** Turn, mirror, crop and pad the frame, so an original lines up with its result. */
    orientation?: {
      rotation: Rotation
      flipX: boolean
      flipY: boolean
      /** The part of the turned picture that is kept. */
      crop?: Rect | null
      /** The shape of the result, when the picture is centred in an exact size. */
      pad?: Size | null
    }
  }[]
}

/** Convert one animation to several formats to compare their sizes; nothing is kept. */
export interface CompareRequest {
  type: "compare"
  input: SourceInput
  settings: AnimationSettings
  trim: Trim
  targets: Target[]
}

export type CompareResponse =
  | { type: "compare-progress"; label: string }
  | { type: "compared"; results: { target: Target; bytes: number }[] }
  | { type: "compare-error"; message: string }

export type AnimationRequest =
  | ProcessRequest
  | CompareRequest
  | ViewRequest
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

export interface ConvertedOutput {
  /** The format the bytes were written in. */
  target: Target
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
