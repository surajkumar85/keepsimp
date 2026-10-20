import type { MetadataTags } from "mediabunny"
import type { Heard } from "./check"
import type { Step } from "./edits"
import type { Level, LevelResult } from "./level"
import type { LoudnessMap } from "./loudness"
import type { SoundSettings } from "./sound"
import type { Container } from "./formats"
import type { ReadFacts } from "./mediabunny-audio"
import type { Peaks } from "./peaks"
import type { Plan } from "./settings"

/** Read a file: its facts first, then its overview waveform. */
export interface ReadJob {
  job: "read"
  id: string
  file: Blob
  container: Container
}

/** Write a file by a plan. */
export interface ConvertJob {
  job: "convert"
  id: string
  /** The file, or the WAV the page decoded it to. */
  file: Blob
  container: Container
  facts: ReadFacts
  plan: Plan
  keepTags: boolean
  /** Tags to write in place of the file's own, for a decoded file. */
  tags?: MetadataTags
  /** The edits made to the sound, in order. */
  edits: Step[]
  /** How loud the result is to be. */
  level: Level
  /** The equaliser and compressor. */
  sound: SoundSettings
  /** Names the settings and edits, so a late result can be told from a current one. */
  key: string
}

export type AudioJob = ReadJob | ConvertJob

export type AudioRequest =
  | (AudioJob & { type: "process"; generation: number })
  | { type: "supersede"; generation: number }
  | { type: "forget"; id: string }

export type AudioResponse =
  | { type: "facts"; id: string; facts: ReadFacts }
  | { type: "progress"; id: string; key: string; fraction: number }
  | {
      type: "done"
      id: string
      job: "read"
      peaks: Peaks | null
      /** The file's loudness, 100 ms at a time. */
      loudness: LoudnessMap | null
    }
  | {
      type: "done"
      id: string
      job: "convert"
      key: string
      /** The plan the file was written by. */
      plan: Plan
      bytes: Uint8Array
      heard: Heard | null
      /** What was done to its level, and what it measured. */
      level: LevelResult | null
    }
  | { type: "open-error"; id: string; message: string }
  | { type: "error"; id: string; key: string; message: string }
  | { type: "abandoned"; id: string }
  /** A job was stopped while it ran: the worker is to be replaced, since what it waited on may never answer. */
  | { type: "retired"; id: string }
