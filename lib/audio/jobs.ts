/**
 * The jobs the audio worker is given, and how what it wrote is held to what
 * was asked: one way, for the workspace's page and for the agent tools.
 * A file the page decoded itself is written from its WAV, with the file's
 * own tags; a copy is always made from the file as it came.
 */
import type { MetadataTags } from "mediabunny"
import { checkResult, type Heard } from "./check"
import { holdsChapters } from "./chapters"
import { editedBy, lengthOf, type Step } from "./edits"
import type { Container } from "./formats"
import { writtenFormats } from "./formats"
import type { Joining } from "./join"
import { SAFE_CEILING } from "./level"
import type { ReadFacts } from "./mediabunny-audio"
import type { ConvertJob, JoinJob, SplitJob } from "./protocol"
import { JOIN_ID } from "./protocol"
import {
  planFor,
  type AudioSettings,
  type Plan,
  type SourceFacts,
} from "./settings"
import { isPlain } from "./sound"
import type { PartTimes } from "./split"
import { noTagChange, withChange, type TagChange } from "./tags"
import type { LevelResult } from "./level"

/** The tags of a file, to be written into what the page decoded (whose WAV has none). */
export function tagsOf(facts: ReadFacts): MetadataTags {
  return withChange({}, { fields: facts.tags, cover: facts.cover ?? undefined })
}

/** One file to be written: as it came, or the WAV the page decoded it to, with its edits and tag changes. */
export interface Source {
  file: Blob
  container: Container
  facts: ReadFacts
  /** The WAV the page decoded a file to that the worker cannot decode. */
  decoded?: Blob
  edits: Step[]
  change?: TagChange
}

/** The job that writes one file, or its parts. */
export function writeJob(
  id: string,
  source: Source,
  settings: AudioSettings,
  key: string,
  parts?: PartTimes[]
): ConvertJob | SplitJob {
  const { facts, edits } = source
  const plan = planFor(
    settings,
    { ...facts, duration: lengthOf(editedBy(facts.duration, edits)) },
    edits.length > 0 || parts !== undefined
  )
  // A copy needs no decoding, so it is always taken from the file itself.
  const decoded = plan.copy ? undefined : source.decoded
  const common = {
    id,
    file: decoded ?? source.file,
    container: decoded ? ("wav" as const) : source.container,
    facts: decoded ? { ...facts, kept: null } : facts,
    plan,
    keepTags: settings.keepTags,
    level: settings.level,
    sound: settings.sound,
    changes: settings.changes,
    tags: decoded ? tagsOf(facts) : undefined,
    change: source.change ?? noTagChange,
    edits,
    key,
  }
  return parts
    ? { job: "split", ...common, parts }
    : { job: "convert", ...common }
}

/**
 * The plan for a joined file: as for the first file, with as many channels
 * as the file that has most, and its length; always encoded again.
 */
export function joinPlan(
  facts: readonly SourceFacts[],
  settings: AudioSettings,
  length: number
) {
  const first = facts[0]
  return planFor(
    settings,
    first
      ? {
          ...first,
          channels: Math.max(...facts.map((one) => one.channels)),
          hasVideo: false,
          duration: length,
        }
      : {
          container: "wav",
          codec: null,
          sampleRate: 44100,
          channels: 2,
          duration: length,
          hasVideo: false,
        },
    true
  )
}

/** What a joined file is asked to be. */
export interface JoinAsked {
  settings: AudioSettings
  joining: Joining
  chapters: boolean
  /** Seconds it should be. */
  length: number
  key: string
}

/** The job that joins files, in order, each with its edits; titled for chapters. */
export function joinJob(
  parts: (Source & { title: string })[],
  asked: JoinAsked
): JoinJob {
  const plan = joinPlan(
    parts.map((part) => part.facts),
    asked.settings,
    asked.length
  )
  return {
    job: "join",
    id: JOIN_ID,
    parts: parts.map((part) => ({
      file: part.decoded ?? part.file,
      container: part.decoded ? "wav" : part.container,
      facts: part.decoded ? { ...part.facts, kept: null } : part.facts,
      edits: part.edits,
      title: part.title,
    })),
    plan,
    level: asked.settings.level,
    sound: asked.settings.sound,
    changes: asked.settings.changes,
    joining: asked.joining,
    tags: asked.settings.keepTags
      ? withChange(tagsOf(parts[0].facts), parts[0].change ?? noTagChange)
      : undefined,
    chapters:
      asked.chapters &&
      !asked.settings.changes.reverse &&
      holdsChapters(plan.format),
    key: asked.key,
  }
}

/**
 * What is wrong with a written file, held against the length it should
 * have and the settings it was written with; nothing when the worker could
 * not listen to it in this browser.
 */
export function resultProblems(result: {
  plan: Plan
  written: { heard: Heard | null; level: LevelResult | null }
  bytes: number
  /** Seconds of the sound as edited, at its own speed. */
  duration: number
  settings: AudioSettings
  /** The source has sound in it, as its peaks show. */
  audible: boolean
  /** `duration` is already at the speed written (a joined file). */
  atSpeed?: boolean
}): string[] {
  const { plan, written, settings } = result
  if (!written.heard) return []
  const { level } = settings
  const lossless = writtenFormats[plan.format].lossless
  return checkResult(
    {
      // As long as the sound, at the speed it was written at.
      duration: result.atSpeed
        ? result.duration
        : result.duration / settings.changes.tempo,
      sampleRate: plan.sampleRate,
      channels: plan.channels,
      copy: plan.copy,
      audible: result.audible,
      bitrate: plan.codec === "mp3" ? plan.bitrate : null,
      bytes: result.bytes,
      // Held to its loudness unless the page said why not.
      loudness:
        level.mode === "loudness" && !written.level?.notes.length
          ? level.target
          : null,
      // Lossy encoders raise peaks a little: only lossless is held to the ceiling.
      ceiling: !lossless
        ? null
        : level.mode !== "same"
          ? level.ceiling
          : !isPlain(settings.sound)
            ? SAFE_CEILING
            : null,
    },
    written.heard
  )
}
