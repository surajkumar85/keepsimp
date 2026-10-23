import type { Container } from "./formats"
import type { Plan, VideoFacts } from "./settings"
import type { Looks } from "./looks"

/** Read a file: its facts and a small picture. */
export interface ReadJob {
  job: "read"
  id: string
  file: Blob
  container: Container
}

/** Write a file by its plan. */
export interface ConvertJob {
  job: "convert"
  id: string
  file: Blob
  container: Container
  facts: VideoFacts
  plan: Plan
  /** Names the settings, so a late result can be told from a current one. */
  key: string
  /** The page's own folder for results being written (scratch.ts). */
  folder: string
}

export type VideoJob = ReadJob | ConvertJob

export type VideoRequest =
  | (VideoJob & { type: "process"; generation: number })
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

/** How the index of an MP4 or MOV ended up. */
export type IndexPlace =
  "front" | "already" | "unreadable" | "fragmented" | "large" | "offsets"

export type VideoResponse =
  | {
      type: "done"
      id: string
      job: "read"
      facts: VideoFacts
      poster: ImageBitmap | null
    }
  | { type: "open-error"; id: string; message: string }
  | {
      type: "progress"
      id: string
      key: string
      fraction: number
      /** Which pass, when a size limit may need more than one. */
      pass?: number
    }
  | {
      type: "done"
      id: string
      job: "convert"
      key: string
      file: Blob
      /** The file in the page's folder, to remove when the result goes; null when held in memory. */
      scratch: string | null
      written: VideoFacts
      problems: string[]
      /** Null for kinds without an index. */
      index: IndexPlace | null
      /** Passes written to reach a size limit (1 without one). */
      passes: number
      /** The size the picture was made, when the encoder's floor made it smaller than planned. */
      resized: { width: number; height: number } | null
      /** How close it looks to the original; null when not measured. */
      looks: Looks | null
    }
  | { type: "error"; id: string; key: string; message: string }
  | { type: "abandoned"; id: string }
  | { type: "retired"; id: string }
