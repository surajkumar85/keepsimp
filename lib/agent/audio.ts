/**
 * The audio workspace's jobs as tools: every one reads the file with the
 * workspace's own worker, writes it with the jobs the page writes
 * (`lib/audio/jobs.ts`), and holds each result to what was asked
 * (`resultProblems`), as the page does. Sound the worker cannot decode is
 * decoded on the page, as the page does.
 */
import { sizeLabel } from "@/lib/image-compressor/formats"
import {
  RINGTONES,
  ringtonePart,
  ringtoneSteps,
  type RingtoneKind,
} from "@/lib/audio/ringtone"
import {
  editedBy,
  lengthOf,
  MOST_GAIN,
  stepProblem,
  type Step,
} from "@/lib/audio/edits"
import {
  containerLabels,
  sniffContainer,
  writtenFormats,
  type OutputFormat,
} from "@/lib/audio/formats"
import {
  joinJob,
  resultProblems,
  writeJob,
  type Source,
} from "@/lib/audio/jobs"
import { joiningProblem, joinsFor, startsOf } from "@/lib/audio/join"
import { channelsLabel, codecLabel, rateLabel } from "@/lib/audio/labels"
import {
  defaultLevel,
  levelSaid,
  loudnessSaid,
  LOUDEST_TARGET,
  LOWEST_CEILING,
  MOST_LOUDER,
  QUIETEST_TARGET,
  TARGETS,
  type Level,
} from "@/lib/audio/level"
import {
  loudnessOf,
  LoudnessMeter,
  type LoudnessMap,
} from "@/lib/audio/loudness"
import type { ReadFacts } from "@/lib/audio/mediabunny-audio"
import { PeakBuilder, peakLevel, type Peaks } from "@/lib/audio/peaks"
import type { AudioJob, AudioResponse, Written } from "@/lib/audio/protocol"
import { defaultChanges, type Changes } from "@/lib/audio/change"
import {
  defaultSettings,
  settingsProblem,
  type AudioSettings,
  type Plan,
} from "@/lib/audio/settings"
import { defaultSound, type SoundSettings } from "@/lib/audio/sound"
import { MOST_BAND, TONE_PRESETS, type TonePreset } from "@/lib/audio/tone"
import { noRepair } from "@/lib/audio/repair"
import { shortenPauses, silentRuns, trimEnds } from "@/lib/audio/silence"
import { partNames, partsOf, type SplitRule } from "@/lib/audio/split"
import {
  tagProblem,
  TAG_FIELDS,
  type TagChange,
  type TagField,
} from "@/lib/audio/tags"
import { peakCount } from "@/lib/audio/view"
import { wavFromPlanes } from "@/lib/audio/wav"
import {
  LANGUAGES,
  toSrt,
  toText,
  toVtt,
  type Segment,
} from "@/lib/audio/transcript"
import type {
  TranscribeJob,
  TranscribeMessage,
} from "@/lib/audio/transcribe.worker"
import type { WhisperId } from "@/lib/audio/whisper"
import {
  defaultLook,
  SHAPES,
  type VideoColours,
  type VideoShape,
} from "@/lib/audio/video"
import type { VideoJob, VideoMessage } from "@/lib/audio/video.worker"
import type { FileStore } from "./files"
import type { PoolJobs } from "./pool-jobs"
import {
  asTool,
  fileProperty,
  filesProperty,
  ToolError,
  type AgentTool,
  type FileRef,
  type JsonSchema,
  type ToolContext,
} from "./registry"

type Stop = () => void

export interface AudioEngines {
  pool: PoolJobs<AudioJob, AudioResponse>
  /** The page's own decoder, for sound the worker cannot decode. */
  decode(file: Blob): Promise<{ planes: Float32Array[]; sampleRate: number }>
  transcribe(
    job: TranscribeJob,
    onMessage: (message: TranscribeMessage) => void
  ): Stop
  video(job: VideoJob, onMessage: (message: VideoMessage) => void): Stop
  /** The theme's colours, for a video. */
  colours(): VideoColours
}

/** How long the file is to look for pauses in, and how quiet a pause is: the splitter's own. */
const PAUSE_LEVEL = -50
const SHORTEST_PAUSE = 0.2
/** The shortest silence the editor trims at an end, as the waveform editor looks for it. */
const ENDS_AT_LEAST = 0.2

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`
const seconds = (value: number) => `${value.toFixed(value < 10 ? 2 : 1)} s`
/** A file's name without its extension: names in the store never start with a dot. */
const baseOf = (name: string) => name.replace(/\.[^.]*$/, "")

/** A file read by the worker, with what the page needs to write it. */
interface Opened extends Source {
  name: string
  facts: ReadFacts
  peaks: Peaks | null
  loudness: LoudnessMap | null
}

const FORMATS: OutputFormat[] = [
  "same",
  "mp3",
  "m4a",
  "opus",
  "flac",
  "wav",
  "m4r",
]
const output = (first: OutputFormat): Record<string, JsonSchema> => ({
  format: {
    type: "string",
    enum: FORMATS,
    description: `same (the file's own, copied where it can be), mp3, m4a (AAC), opus, flac, wav or m4r (iPhone ringtone). ${first} by default.`,
  },
  preset: {
    type: "string",
    enum: ["small", "balanced", "high"],
    description: "The quality of a lossy format (balanced).",
  },
  bitrate: {
    type: "integer",
    minimum: 16,
    maximum: 320,
    description: "Instead of a preset: kbit/s.",
  },
  sampleRate: {
    type: "integer",
    enum: [8000, 16000, 22050, 32000, 44100, 48000, 96000],
  },
  channels: { type: "integer", enum: [1, 2] },
  depth: {
    type: "integer",
    enum: [16, 24, 32],
    description:
      "For WAV and FLAC: bits per sample (32 is floating point, WAV only).",
  },
  keepTags: {
    type: "boolean",
    description: "Keep the title, artist, album and cover (yes by default).",
  },
  maxKilobytes: {
    type: "number",
    minimum: 16,
    description: "Write a lossy file no larger than this.",
  },
})
interface Output {
  format?: OutputFormat
  preset?: "small" | "balanced" | "high"
  bitrate?: number
  sampleRate?: number
  channels?: 1 | 2
  depth?: 16 | 24 | 32
  keepTags?: boolean
  maxKilobytes?: number
}

/** The settings a tool writes with: the workspace's defaults, the door's first format, and what was asked. */
export function settingsOf(
  given: Output,
  first: OutputFormat,
  more: Partial<AudioSettings> = {}
): AudioSettings {
  const settings: AudioSettings = {
    ...defaultSettings,
    format: given.format ?? first,
    preset: given.bitrate ? "custom" : (given.preset ?? defaultSettings.preset),
    bitrate: given.bitrate ?? defaultSettings.bitrate,
    sampleRate: given.sampleRate ?? "same",
    channels: given.channels ?? "same",
    depth: given.depth ?? "same",
    keepTags: given.keepTags ?? true,
    targetBytes: given.maxKilobytes
      ? Math.round(given.maxKilobytes * 1024)
      : null,
    ...more,
  }
  const problem = settingsProblem(settings)
  if (problem) throw new ToolError(problem)
  return settings
}

export function audioTools(engines: AudioEngines): AgentTool[] {
  /** Reads a file as the workspace does: its facts, its peaks and loudness, and the page's own decoding where needed. */
  async function open(
    files: FileStore,
    id: string,
    signal: AbortSignal
  ): Promise<Opened> {
    const { blob, ref } = files.get(id)
    const container = sniffContainer(
      new Uint8Array(await blob.slice(0, 512).arrayBuffer())
    )
    if (!container)
      throw new ToolError(
        `${ref.name} is not a sound or video file that can be read here.`
      )
    let facts: ReadFacts | null = null
    const read = (await engines.pool.run(
      { job: "read", file: blob, container },
      {
        signal,
        onMessage: (message) => {
          if (message.type === "facts") facts = message.facts
        },
      }
    )) as Extract<AudioResponse, { type: "done"; job: "read" }>
    const known = facts as ReadFacts | null
    if (!known) throw new ToolError(`${ref.name} could not be read.`)
    const opened: Opened = {
      name: ref.name,
      file: blob,
      container,
      facts: known,
      edits: [],
      peaks: read.peaks,
      loudness: read.loudness,
    }
    if (known.decodable) return opened
    // The worker cannot decode it here: the page decodes it, as the workspace does.
    let decoded
    try {
      decoded = await engines.decode(blob)
    } catch {
      throw new ToolError(
        `This browser cannot decode the sound of ${ref.name}.`
      )
    }
    const { planes, sampleRate } = decoded
    const frames = planes[0].length
    const peaks = new PeakBuilder(frames, peakCount(frames / sampleRate))
    peaks.push(planes)
    const meter = new LoudnessMeter(sampleRate, planes.length)
    meter.push(planes)
    return {
      ...opened,
      decoded: new Blob([wavFromPlanes(planes, sampleRate) as BlobPart], {
        type: "audio/wav",
      }),
      peaks: peaks.result(),
      loudness: meter.result(),
    }
  }

  /** Says how far a job of the pool's is. */
  const told =
    (context: ToolContext, note: string) => (message: AudioResponse) => {
      if (message.type === "progress") context.progress(message.fraction, note)
    }

  const audible = (opened: Opened) =>
    opened.peaks ? peakLevel(opened.peaks) > 1e-4 : true

  /** A written file, held to what was asked, as a file of the agent's. */
  function keep(
    files: FileStore,
    written: Written,
    plan: Plan,
    name: string,
    held: {
      duration: number
      settings: AudioSettings
      audible: boolean
      atSpeed?: boolean
    }
  ) {
    const format = writtenFormats[plan.format]
    const problems = resultProblems({
      plan,
      written,
      bytes: written.bytes.length,
      ...held,
    })
    const ref = files.add(
      new Blob([written.bytes as BlobPart], { type: format.mime }),
      `${name}.${format.extension}`,
      "made"
    )
    return { ref, problems, format }
  }

  /** Writes one opened file with its edits and tag change; the result checked as the page checks it. */
  async function write(
    context: ToolContext,
    opened: Opened,
    settings: AudioSettings,
    name: string
  ) {
    const job = writeJob("agent", opened, settings, "agent")
    const done = (await engines.pool.run(job, {
      signal: context.signal,
      onMessage: told(context, "Writing"),
    })) as Extract<AudioResponse, { type: "done"; job: "convert" }>
    const kept = keep(context.files, done, done.plan, name, {
      duration: lengthOf(editedBy(opened.facts.duration, opened.edits)),
      settings,
      audible: audible(opened),
    })
    return { ...kept, done }
  }

  /** What a written file is, in words, with what the check found. */
  function said(
    done: {
      plan: Plan
      level: Written["level"]
      heard: Written["heard"]
      inPlace?: boolean
    },
    kept: { ref: FileRef; problems: string[]; format: { label: string } }
  ) {
    const parts = [
      done.inPlace
        ? `Written in place: only its tags changed; every byte of sound is the file's own.`
        : `${kept.format.label}${done.plan.copy ? ", the sound copied as it was" : ""}, ${sizeLabel(kept.ref.size)}${done.heard ? `, ${seconds(done.heard.duration)}` : ""}.`,
      // The sentences the page shows: the choices made, and what was done to the level.
      ...done.plan.notes,
      ...(done.level ? [levelSaid(done.level), ...done.level.notes] : []),
      kept.problems.length
        ? `The check found: ${kept.problems.join(" ")}`
        : done.heard
          ? "Checked: decoded again, as long as it should be, at the rate and channels asked."
          : "This browser cannot decode this format to check it.",
    ]
    return parts.filter(Boolean).join(" ")
  }

  const info: AgentTool<{ file: string }> = {
    name: "audio_info",
    title: "Read a sound file",
    description:
      "Tells what a sound or video file holds: its format, codec, length, sample rate, channels, tags and cover, and its loudness (integrated LUFS, loudness range, true peak), measured as BS.1770 says.",
    inputSchema: {
      type: "object",
      properties: { file: fileProperty("The sound or video file.") },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files, signal }) {
      const opened = await open(files, input.file, signal)
      const { facts } = opened
      const loudness = opened.loudness ? loudnessOf(opened.loudness) : null
      return {
        summary: `${opened.name}: ${codecLabel(facts.codec)} in ${containerLabels[facts.container]}, ${seconds(facts.duration)}, ${rateLabel(facts.sampleRate)}, ${channelsLabel(facts.channels).toLowerCase()}${facts.hasVideo ? ", with video" : ""}.${loudness ? ` ${loudnessSaid(loudness)}.` : ""}`,
        data: {
          container: facts.container,
          codec: facts.codec,
          seconds: facts.duration,
          sampleRate: facts.sampleRate,
          channels: facts.channels,
          hasVideo: facts.hasVideo,
          tags: facts.tags,
          cover: facts.cover ? facts.cover.mimeType : null,
          // Silence measures as no number at all.
          loudness: loudness && {
            integrated: Number.isFinite(loudness.integrated)
              ? loudness.integrated
              : null,
            range: loudness.range,
            truePeak: Number.isFinite(loudness.truePeak)
              ? loudness.truePeak
              : null,
          },
        },
      }
    },
  }

  const convert: AgentTool<Output & { file: string }> = {
    name: "convert_audio",
    title: "Convert sound, or take it out of a video",
    description:
      "Writes a sound or video file's sound as MP3, M4A (AAC), Opus, FLAC, WAV or M4R, gapless, with its tags. With format same, a video's sound is copied out without being encoded again where its codec allows. Every result is decoded again and checked.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        ...output("mp3"),
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const settings = settingsOf(input, "mp3")
      const opened = await open(context.files, input.file, context.signal)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        baseOf(opened.name)
      )
      return {
        summary: said(done, { ref, problems, format }),
        files: [ref],
        data: { problems, plan: done.plan },
      }
    },
  }

  const stepSchema: JsonSchema = {
    type: "object",
    properties: {
      do: { type: "string", enum: ["keep", "cut", "silence", "fade", "gain"] },
      from: {
        type: "number",
        minimum: 0,
        description: "Seconds, in the sound as the steps before have left it.",
      },
      to: { type: "number", minimum: 0 },
      direction: {
        type: "string",
        enum: ["in", "out"],
        description: "For fade.",
      },
      curve: {
        type: "string",
        enum: ["linear", "power", "s-curve"],
        description: "For fade (power by default).",
      },
      db: {
        type: "number",
        minimum: -MOST_GAIN,
        maximum: MOST_GAIN,
        description: "For gain.",
      },
    },
    required: ["do", "from", "to"],
    additionalProperties: false,
  }
  type StepInput = {
    do: Step["do"]
    from: number
    to: number
    direction?: "in" | "out"
    curve?: "linear" | "power" | "s-curve"
    db?: number
  }
  function stepsOf(given: StepInput[], duration: number): Step[] {
    const steps: Step[] = []
    given.forEach((one, index) => {
      const length = lengthOf(editedBy(duration, steps))
      const step: Step =
        one.do === "fade"
          ? {
              do: "fade",
              from: one.from,
              to: one.to,
              direction: one.direction ?? "in",
              curve: one.curve ?? "power",
            }
          : one.do === "gain"
            ? { do: "gain", from: one.from, to: one.to, db: one.db ?? 0 }
            : { do: one.do, from: one.from, to: one.to }
      const problem = stepProblem(step, length)
      if (problem)
        throw new ToolError(
          `Step ${index + 1} (${one.do}): ${problem} The sound is ${seconds(length)} long at that step.`
        )
      steps.push(step)
    })
    return steps
  }
  const soundSchema: Record<string, JsonSchema> = {
    tone: {
      type: "string",
      enum: Object.keys(TONE_PRESETS),
      description:
        "An equaliser preset: flat, voice (clarity), bass, telephone or rumble (cut).",
    },
    compressor: { type: "string", enum: ["off", "gentle", "voice", "music"] },
    equaliser: {
      type: "object",
      properties: {
        highPass: {
          type: "number",
          minimum: 20,
          maximum: 1000,
          description: "Cut under this many Hz.",
        },
        lowPass: {
          type: "number",
          minimum: 1000,
          maximum: 20000,
          description: "Cut over this many Hz.",
        },
        bass: {
          type: "number",
          minimum: -MOST_BAND,
          maximum: MOST_BAND,
          description: "dB under 120 Hz.",
        },
        mid: {
          type: "number",
          minimum: -MOST_BAND,
          maximum: MOST_BAND,
          description: "dB about 1 kHz.",
        },
        treble: {
          type: "number",
          minimum: -MOST_BAND,
          maximum: MOST_BAND,
          description: "dB over 8 kHz.",
        },
      },
      additionalProperties: false,
      description:
        "Instead of a preset: the equaliser's own settings, flat where left out.",
    },
  }
  type Equaliser = Partial<{
    highPass: number
    lowPass: number
    bass: number
    mid: number
    treble: number
  }>
  const soundOf = (given: {
    tone?: TonePreset
    compressor?: SoundSettings["compressor"]
    equaliser?: Equaliser
  }): SoundSettings => {
    if (given.tone && given.equaliser)
      throw new ToolError(
        'Give an equaliser preset ("tone") or its settings ("equaliser"), not both.'
      )
    return {
      ...defaultSound,
      tone: given.equaliser
        ? {
            highPass: given.equaliser.highPass ?? null,
            lowPass: given.equaliser.lowPass ?? null,
            bass: given.equaliser.bass ?? 0,
            mid: given.equaliser.mid ?? 0,
            treble: given.equaliser.treble ?? 0,
          }
        : given.tone
          ? TONE_PRESETS[given.tone].tone
          : defaultSound.tone,
      compressor: given.compressor ?? defaultSound.compressor,
    }
  }

  const edit: AgentTool<
    Output & {
      file: string
      steps?: StepInput[]
      trimSilence?: boolean
      shortenPauses?: number
      silentUnder?: number
      tone?: TonePreset
      compressor?: SoundSettings["compressor"]
      equaliser?: Equaliser
    }
  > = {
    name: "edit_audio",
    title: "Edit sound: trim, cut, silence, fade, volume",
    description:
      "Edits a sound as the waveform editor does, in steps: keep a part (trim), cut a part out, silence a part, fade in or out, or change a part's volume in dB; each step in the times of the sound as the steps before left it. Every cut fades over 4 ms so it never clicks. After the steps, it can trim the silence at both ends and shorten pauses longer than some seconds, found as the editor finds them. Can also shape the sound with an equaliser (a preset or its own settings) or a compressor. The file itself is never changed.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        steps: { type: "array", items: stepSchema, minItems: 1, maxItems: 100 },
        trimSilence: {
          type: "boolean",
          description: "Take the silence off both ends, leaving 0.1 s.",
        },
        shortenPauses: {
          type: "number",
          minimum: 0.5,
          maximum: 10,
          description:
            "Shorten every pause longer than this many seconds to 0.4 s.",
        },
        silentUnder: {
          type: "integer",
          enum: [-60, -50, -40],
          description: "What counts as silence, in dBFS (-50).",
        },
        ...soundSchema,
        ...output("same"),
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const settings = settingsOf(input, "same", { sound: soundOf(input) })
      if (!input.steps && !input.trimSilence && !input.shortenPauses)
        throw new ToolError('Give "steps", "trimSilence" or "shortenPauses".')
      const opened = await open(context.files, input.file, context.signal)
      const { duration } = opened.facts
      opened.edits = input.steps ? stepsOf(input.steps, duration) : []
      // Silence is found as the editor finds it, in the sound as the steps left it, and taken out with ordinary steps.
      const level = input.silentUnder ?? -50
      const runs = () =>
        opened.peaks
          ? silentRuns(
              opened.peaks,
              duration,
              editedBy(duration, opened.edits),
              level,
              ENDS_AT_LEAST
            )
          : []
      const silence: string[] = []
      if (input.trimSilence) {
        const step = trimEnds(
          runs(),
          lengthOf(editedBy(duration, opened.edits))
        )
        if (step) {
          opened.edits = [...opened.edits, step]
          silence.push("The silence at the ends was trimmed.")
        } else silence.push("There was no silence at the ends to trim.")
      }
      if (input.shortenPauses) {
        const { steps, removed } = shortenPauses(
          runs(),
          lengthOf(editedBy(duration, opened.edits)),
          input.shortenPauses
        )
        opened.edits = [...opened.edits, ...steps]
        silence.push(
          steps.length
            ? `${plural(steps.length, "pause")} shortened, ${seconds(removed)} taken out.`
            : `No pause was longer than ${input.shortenPauses} s.`
        )
      }
      if (!opened.edits.length)
        throw new ToolError(`${silence.join(" ")} Nothing was changed.`)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        `${baseOf(opened.name)}-edited`
      )
      return {
        summary: [...silence, said(done, { ref, problems, format })].join(" "),
        files: [ref],
        data: {
          problems,
          seconds: lengthOf(editedBy(opened.facts.duration, opened.edits)),
        },
      }
    },
  }

  const ringtone: AgentTool<{
    file: string
    kind: RingtoneKind
    start?: number
    end?: number
  }> = {
    name: "make_ringtone",
    title: "Make a ringtone",
    description:
      "Makes an iPhone ringtone (M4R, at most 40 s), an iPhone alert tone (M4R, at most 30 s) or an Android ringtone (MP3, 30 s), from a part of a sound, faded in and out.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        kind: { type: "string", enum: Object.keys(RINGTONES) },
        start: {
          type: "number",
          minimum: 0,
          description: "Seconds to start at (0).",
        },
        end: {
          type: "number",
          exclusiveMinimum: 0,
          description:
            "Seconds to end at; the longest the phone takes by default.",
        },
      },
      required: ["file", "kind"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const tone = RINGTONES[input.kind]
      const settings = settingsOf({}, tone.format)
      const opened = await open(context.files, input.file, context.signal)
      const length = opened.facts.duration
      const part = ringtonePart(
        input.kind,
        input.start ?? 0,
        input.end !== undefined
          ? { from: input.start ?? 0, to: Math.min(input.end, length) }
          : null,
        length
      )
      opened.edits = ringtoneSteps(part, length)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        `${baseOf(opened.name)}-ringtone`
      )
      return {
        summary: `${tone.label}: ${seconds(part.to - part.from)} from ${seconds(part.from)}. ${said(done, { ref, problems, format })}${input.kind === "android" ? "" : " On an iPhone, add it with Finder or iTunes, or with GarageBand."}`,
        files: [ref],
        data: { from: part.from, to: part.to, problems },
      }
    },
  }

  const normalize: AgentTool<
    Output & {
      file: string
      mode?: "loudness" | "peak" | "louder"
      target?: number
      ceiling?: number
      louder?: number
    }
  > = {
    name: "normalize_audio",
    title: "Normalise loudness, or make sound louder",
    description: `Brings a sound to a loudness measured as BS.1770 says (${TARGETS.map((target) => `${target.lufs} LUFS for ${target.for}`).join("; ")}), its peaks to a level, or makes it louder by some dB, with a true-peak limiter so it never clips (-1 dBTP by default).`,
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        mode: {
          type: "string",
          enum: ["loudness", "peak", "louder"],
          description: "loudness (the default), peak, or louder.",
        },
        target: {
          type: "number",
          minimum: QUIETEST_TARGET,
          maximum: LOUDEST_TARGET,
          description: "For loudness: LUFS (-14).",
        },
        ceiling: {
          type: "number",
          minimum: LOWEST_CEILING,
          maximum: 0,
          description:
            "The highest a true peak may reach, or the peak to reach (peak), in dBTP.",
        },
        louder: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: MOST_LOUDER,
          description: "For louder: dB (6).",
        },
        ...output("same"),
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const level: Level = {
        ...defaultLevel,
        mode: input.mode ?? "loudness",
        target: input.target ?? defaultLevel.target,
        ceiling: input.ceiling ?? defaultLevel.ceiling,
        louder: input.louder ?? defaultLevel.louder,
      }
      const settings = settingsOf(input, "same", { level })
      const opened = await open(context.files, input.file, context.signal)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        `${baseOf(opened.name)}-${level.mode === "louder" ? "louder" : "normalised"}`
      )
      const measured = done.level?.after
      return {
        summary: `${said(done, { ref, problems, format })}${measured ? ` It measures ${measured.integrated.toFixed(1)} LUFS, true peak ${measured.truePeak.toFixed(1)} dBTP.` : ""}`,
        files: [ref],
        data: { level: done.level, problems },
      }
    },
  }

  const speed: AgentTool<
    Output & {
      file: string
      tempo?: number
      pitch?: number
      keepPitch?: boolean
      reverse?: boolean
      channelChange?: Changes["channels"]
      balance?: number
    }
  > = {
    name: "change_audio_speed",
    title: "Change speed, pitch and channels",
    description:
      "Makes a sound faster or slower (0.5 to 2 times) keeping its pitch, or like tape; moves its pitch up or down to 12 semitones without changing its length; reverses it; and swaps, takes one side, balances or makes karaoke of its channels. Karaoke cancels what sits in the middle of a stereo mix; it is not a vocal remover and works only on some songs.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        tempo: { type: "number", minimum: 0.5, maximum: 2 },
        pitch: {
          type: "number",
          minimum: -12,
          maximum: 12,
          description: "Semitones.",
        },
        keepPitch: {
          type: "boolean",
          description:
            "Keep the pitch when the speed changes (yes by default); otherwise it follows, as a tape does.",
        },
        reverse: { type: "boolean" },
        channelChange: {
          type: "string",
          enum: ["same", "swap", "left", "right", "karaoke"],
          description: "What to do with the channels.",
        },
        balance: { type: "number", minimum: -1, maximum: 1 },
        ...output("same"),
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const changes: Changes = {
        ...defaultChanges,
        tempo: input.tempo ?? 1,
        pitch: input.pitch ?? 0,
        keepPitch: input.keepPitch ?? true,
        reverse: Boolean(input.reverse),
        channels: input.channelChange ?? "same",
        balance: input.balance ?? 0,
      }
      const settings = settingsOf(input, "same", { changes })
      const opened = await open(context.files, input.file, context.signal)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        `${baseOf(opened.name)}-changed`
      )
      return {
        summary: said(done, { ref, problems, format }),
        files: [ref],
        data: { problems },
      }
    },
  }

  const noise: AgentTool<
    Output & {
      file: string
      denoise?: number
      hum?: 0 | 50 | 60
      declick?: boolean
      deess?: "off" | "gentle" | "strong"
      equaliser?: Equaliser
      tone?: TonePreset
    }
  > = {
    name: "remove_background_noise",
    title: "Remove background noise",
    description:
      "Takes background noise out with RNNoise, made for voices (its model is loaded from KeepSimp the first time), and can take out mains hum (50 or 60 Hz and its harmonics), clicks and harsh s sounds, and rumble with an equaliser preset. Nothing about the sound is sent anywhere.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        denoise: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "How much of RNNoise's result is heard, 0 to 1 (1).",
        },
        hum: { type: "integer", enum: [0, 50, 60] },
        declick: { type: "boolean" },
        deess: { type: "string", enum: ["off", "gentle", "strong"] },
        tone: soundSchema.tone,
        equaliser: soundSchema.equaliser,
        ...output("same"),
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const sound: SoundSettings = {
        ...soundOf(input),
        repair: {
          ...noRepair,
          denoise: input.denoise ?? 1,
          hum: input.hum ?? 0,
          declick: Boolean(input.declick),
          deess: input.deess ?? "off",
        },
      }
      const settings = settingsOf(input, "same", { sound })
      const opened = await open(context.files, input.file, context.signal)
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        `${baseOf(opened.name)}-clean`
      )
      return {
        summary: said(done, { ref, problems, format }),
        files: [ref],
        data: { problems },
      }
    },
  }

  const tags: AgentTool<{
    file: string
    fields?: Partial<Record<TagField, string>>
    cover?: string
    removeCover?: boolean
  }> = {
    name: "edit_audio_tags",
    title: "Edit a sound file's tags",
    description:
      "Changes a sound file's title, artist, album, album artist, year, track and disc, genre, comment and lyrics, and adds, replaces or removes its cover. In MP3, M4A, FLAC, Ogg and WAV the tags are written in place: every byte of sound stays the file's own. An empty field is taken away.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound file."),
        fields: {
          type: "object",
          properties: Object.fromEntries(
            TAG_FIELDS.map((field) => [
              field,
              { type: "string", maxLength: 10000 },
            ])
          ),
          additionalProperties: false,
        },
        cover: fileProperty("A JPEG or PNG picture for its cover."),
        removeCover: { type: "boolean" },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      if (input.cover && input.removeCover)
        throw new ToolError('Give "cover" or "removeCover", not both.')
      let cover: TagChange["cover"]
      if (input.cover) {
        const { blob, ref } = context.files.get(input.cover)
        const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
        const mimeType =
          head[0] === 0xff && head[1] === 0xd8
            ? "image/jpeg"
            : head[0] === 0x89 && head[1] === 0x50
              ? "image/png"
              : null
        if (!mimeType)
          throw new ToolError(`${ref.name} is not a JPEG or PNG picture.`)
        cover = { data: new Uint8Array(await blob.arrayBuffer()), mimeType }
      } else if (input.removeCover) cover = null
      const change: TagChange = {
        fields: input.fields ?? {},
        ...(cover !== undefined ? { cover } : {}),
      }
      if (!Object.keys(change.fields).length && cover === undefined)
        throw new ToolError('Give "fields", "cover" or "removeCover".')
      const problem = tagProblem(change)
      if (problem) throw new ToolError(problem)
      const settings = settingsOf({}, "same")
      const opened = await open(context.files, input.file, context.signal)
      opened.change = change
      const { ref, problems, format, done } = await write(
        context,
        opened,
        settings,
        baseOf(opened.name)
      )
      return {
        summary: said(done, { ref, problems, format }),
        files: [ref],
        data: { inPlace: done.inPlace, problems },
      }
    },
  }

  const split: AgentTool<
    Output & {
      file: string
      by: "every" | "count" | "silence" | "times"
      at?: number[]
      minutes?: number
      parts?: number
      pause?: number
      dropPauses?: boolean
    }
  > = {
    name: "split_audio",
    title: "Split a sound into parts",
    description:
      "Splits a sound into parts every N minutes, into N equal parts, at its pauses (silences of at least some seconds), or at times given (as the editor's markers do), each part written and checked.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        by: { type: "string", enum: ["every", "count", "silence", "times"] },
        at: {
          type: "array",
          items: { type: "number", exclusiveMinimum: 0 },
          minItems: 1,
          maxItems: 499,
          description: "For times: the seconds to split at.",
        },
        minutes: { type: "number", minimum: 0.1, maximum: 600 },
        parts: { type: "integer", minimum: 2, maximum: 500 },
        pause: {
          type: "number",
          minimum: 0.2,
          maximum: 60,
          description:
            "For silence: the shortest pause to split at, in seconds (1).",
        },
        dropPauses: {
          type: "boolean",
          description: "For silence: leave the pauses out of the parts.",
        },
        ...output("same"),
      },
      required: ["file", "by"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const rule: SplitRule =
        input.by === "every"
          ? { by: "every", minutes: input.minutes ?? 5 }
          : input.by === "count"
            ? { by: "count", parts: input.parts ?? 2 }
            : input.by === "times"
              ? { by: "marks" }
              : {
                  by: "silence",
                  pause: input.pause ?? 1,
                  drop: Boolean(input.dropPauses),
                }
      if (input.by === "times" && !input.at)
        throw new ToolError('Give the times to split at as "at".')
      // The schema holds the rule to the splitter's own bounds.
      const settings = settingsOf(input, "same")
      const opened = await open(context.files, input.file, context.signal)
      const edited = editedBy(opened.facts.duration, opened.edits)
      const pauses =
        rule.by === "silence" && opened.peaks
          ? silentRuns(
              opened.peaks,
              opened.facts.duration,
              edited,
              PAUSE_LEVEL,
              SHORTEST_PAUSE
            )
          : []
      const parts = partsOf(rule, lengthOf(edited), input.at ?? [], pauses)
      if (parts.length < 2)
        throw new ToolError(
          "That rule gives this sound only one part; nothing to split."
        )
      const job = writeJob("split:agent", opened, settings, "agent", parts)
      const done = (await engines.pool.run(job, {
        signal: context.signal,
        onMessage: told(context, "Writing the parts"),
      })) as Extract<AudioResponse, { type: "done"; job: "split" }>
      const names = partNames(baseOf(opened.name), done.parts.length)
      const kept = done.parts.map((written, index) =>
        keep(context.files, written, done.plan, names[index], {
          duration: parts[index].to - parts[index].from,
          settings,
          audible: audible(opened),
        })
      )
      const problems = kept.flatMap((one, index) =>
        one.problems.map((problem_) => `Part ${index + 1}: ${problem_}`)
      )
      return {
        summary: `Split into ${plural(kept.length, "part")} of ${writtenFormats[done.plan.format].label}. ${problems.length ? `The check found: ${problems.join(" ")}` : "Each was decoded again and checked."}`,
        files: kept.map((one) => one.ref),
        data: {
          parts: parts.map((part, index) => ({
            name: kept[index].ref.name,
            from: part.from,
            to: part.to,
          })),
          problems,
        },
      }
    },
  }

  const join: AgentTool<
    Output & {
      files: string[]
      gap?: number
      crossfade?: number
      chapters?: boolean
    }
  > = {
    name: "join_audio",
    title: "Join sound files",
    description:
      "Joins sound files in order into one, with a gap of silence or a crossfade between them, matched in rate and channels, with chapters named after each file where the format holds them (MP3, M4A; Apple's own apps read another kind).",
    inputSchema: {
      type: "object",
      properties: {
        files: filesProperty("The sound or video files, in order.", 2, 50),
        gap: { type: "number", minimum: 0, maximum: 10 },
        crossfade: { type: "number", minimum: 0, maximum: 10 },
        chapters: {
          type: "boolean",
          description: "A chapter for each file (yes by default).",
        },
        ...output("mp3"),
      },
      required: ["files"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const joining = { gap: input.gap ?? 0, crossfade: input.crossfade ?? 0 }
      const problem = joiningProblem(joining)
      if (problem) throw new ToolError(problem)
      const settings = settingsOf(input, "mp3")
      const parts: Opened[] = []
      for (const id of input.files)
        parts.push(await open(context.files, id, context.signal))
      const lengths = parts.map(
        (part) => part.facts.duration / settings.changes.tempo
      )
      const length = startsOf(lengths, joinsFor(lengths, joining)).length
      const job = joinJob(
        parts.map((part) => ({
          ...part,
          title: part.facts.tags.title || baseOf(part.name),
        })),
        {
          settings,
          joining,
          chapters: input.chapters ?? true,
          length,
          key: "agent",
        }
      )
      const done = (await engines.pool.run(job, {
        signal: context.signal,
        onMessage: told(context, "Joining"),
      })) as Extract<AudioResponse, { type: "done"; job: "join" }>
      const kept = keep(
        context.files,
        done.written,
        done.plan,
        `${baseOf(parts[0].name)}-joined`,
        {
          duration: length,
          settings,
          audible: parts.some(audible),
          atSpeed: true,
        }
      )
      return {
        summary: `Joined ${plural(parts.length, "file")}${job.chapters ? ", with a chapter for each" : ""}. ${said({ ...done.written, plan: done.plan }, kept)}`,
        files: [kept.ref],
        data: { seconds: done.length, problems: kept.problems },
      }
    },
  }

  const CODES = LANGUAGES.map((language) => language.code)
  const transcribe: AgentTool<{
    file: string
    model?: WhisperId
    language?: string
    translate?: boolean
    times?: boolean
  }> = {
    name: "transcribe_audio",
    title: "Transcribe speech",
    description:
      "Writes down what is said in a sound or video with Whisper on this device: text, SRT and VTT subtitles. Its model is loaded from KeepSimp the first time (base about 80 MB, small about 250 MB, more accurate) and kept. It can mishear, and marks phrases it may have made up.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        model: { type: "string", enum: ["base", "small"] },
        language: {
          type: "string",
          enum: CODES,
          description: "The language spoken; found by Whisper when left out.",
        },
        translate: { type: "boolean", description: "Into English." },
        times: {
          type: "boolean",
          description: "Put the times in the text too.",
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, context) {
      const opened = await open(context.files, input.file, context.signal)
      const segments = await new Promise<Segment[]>((resolve, reject) => {
        let heard: Segment[] = []
        const stop = engines.transcribe(
          {
            file: opened.decoded ?? opened.file,
            kept: opened.decoded ? null : opened.facts.kept,
            duration: opened.facts.duration,
            model: input.model ?? "base",
            language: input.language ?? "",
            translate: Boolean(input.translate),
          },
          (message) => {
            if (message.type === "loading")
              context.progress(message.fraction * 0.2, "Loading Whisper")
            else if (message.type === "segments") {
              heard = message.segments
              context.progress(
                0.2 +
                  0.8 * (message.done / Math.max(opened.facts.duration, 0.001)),
                "Listening"
              )
            } else if (message.type === "done") {
              stop()
              resolve(heard)
            } else if (message.type === "error") {
              stop()
              reject(new ToolError(message.message))
            }
          }
        )
        context.signal.addEventListener("abort", () => {
          stop()
          reject(new DOMException("Stopped.", "AbortError"))
        })
      })
      const base = baseOf(opened.name)
      const text = toText(segments, Boolean(input.times))
      const made = [
        context.files.add(
          new Blob([text], { type: "text/plain" }),
          `${base}.txt`,
          "made"
        ),
        context.files.add(
          new Blob([toSrt(segments)], { type: "application/x-subrip" }),
          `${base}.srt`,
          "made"
        ),
        context.files.add(
          new Blob([toVtt(segments)], { type: "text/vtt" }),
          `${base}.vtt`,
          "made"
        ),
      ]
      return {
        summary: segments.length
          ? `Transcribed ${plural(segments.length, "phrase")}, as text, SRT and VTT. Whisper can mishear: check names and numbers.`
          : "No speech was heard.",
        files: made,
        data: {
          text: text.length <= 20_000 ? text : undefined,
          phrases: segments.length,
        },
      }
    },
  }

  const video: AgentTool<{
    file: string
    shape?: VideoShape
    waveform?: boolean
    title?: boolean
    picture?: string
    cover?: boolean
  }> = {
    name: "audio_to_video",
    title: "Turn sound into a video",
    description:
      "Makes a video of a sound to share where only video goes: its cover, a picture of your own or the theme's colour, with its title and artist and a waveform whose playhead moves. Square, landscape or portrait. MP4 with H.264 and AAC where the browser can write it, otherwise WebM, and it says which.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The sound or video file."),
        shape: { type: "string", enum: Object.keys(SHAPES) },
        waveform: {
          type: "boolean",
          description:
            "A waveform with a moving playhead (yes by default); without it, one still frame a second.",
        },
        title: {
          type: "boolean",
          description: "Write the title and artist (yes by default).",
        },
        picture: fileProperty(
          "A JPEG, PNG or WebP picture instead of the cover."
        ),
        cover: {
          type: "boolean",
          description:
            "Show the sound's own cover (yes by default); without it and without a picture, the theme's colour.",
        },
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const opened = await open(context.files, input.file, context.signal)
      const { facts } = opened
      const picture = input.picture
        ? context.files.get(input.picture).blob
        : facts.cover && input.cover !== false
          ? new Blob([facts.cover.data as BlobPart], {
              type: facts.cover.mimeType,
            })
          : null
      const look = {
        ...defaultLook,
        shape: input.shape ?? defaultLook.shape,
        waveform: input.waveform ?? true,
        title: input.title ?? true,
      }
      const colours = engines.colours()
      const make = (sound: Blob, decodedHere: boolean) =>
        new Promise<Extract<VideoMessage, { type: "done" }>>(
          (resolve, reject) => {
            const stop = engines.video(
              {
                file: sound,
                look,
                colours,
                picture,
                title: facts.tags.title ?? baseOf(opened.name),
                artist: facts.tags.artist ?? "",
              },
              (message) => {
                if (message.type === "progress")
                  context.progress(message.fraction, "Drawing the video")
                else {
                  stop()
                  if (message.type === "done") resolve(message)
                  else if (message.type === "error")
                    reject(new ToolError(message.message))
                  else if (decodedHere)
                    reject(
                      new ToolError(
                        "This browser cannot decode this sound to make a video."
                      )
                    )
                  // The worker cannot decode it: the page decodes it, as the video panel does, and asks once more.
                  else
                    engines
                      .decode(sound)
                      .then(({ planes, sampleRate }) =>
                        make(
                          new Blob(
                            [wavFromPlanes(planes, sampleRate) as BlobPart],
                            { type: "audio/wav" }
                          ),
                          true
                        )
                      )
                      .then(resolve, () =>
                        reject(
                          new ToolError(
                            "This browser cannot decode this sound to make a video."
                          )
                        )
                      )
                }
              }
            )
            context.signal.addEventListener("abort", () => {
              stop()
              reject(new DOMException("Stopped.", "AbortError"))
            })
          }
        )
      // As the video panel does: the sound written as the workspace writes it, then drawn.
      // It is only a step on the way, so it is not kept as a result.
      const sound = await write(
        context,
        opened,
        settingsOf({}, "same"),
        baseOf(opened.name)
      )
      const done = await make(
        context.files.get(sound.ref.id).blob,
        false
      ).finally(() => context.files.remove(sound.ref.id))
      if (!done.check.video || !done.check.audio)
        throw new ToolError(
          "The video was written without its picture or its sound, so it is not handed over."
        )
      if (Math.abs(done.check.seconds - done.video.seconds) > 0.1)
        throw new ToolError(
          `The video came out ${seconds(done.check.seconds)} long for ${seconds(done.video.seconds)} of sound, so it is not handed over.`
        )
      const ref = context.files.add(
        new Blob([done.video.bytes as BlobPart], {
          type: done.video.container === "mp4" ? "video/mp4" : "video/webm",
        }),
        `${baseOf(opened.name)}-video.${done.video.container}`,
        "made"
      )
      return {
        summary: `Checked: ${done.video.container === "mp4" ? "MP4 with H.264 and AAC" : "WebM with VP9 and Opus, as this browser cannot write H.264"}, ${seconds(done.video.seconds)}, ${sizeLabel(ref.size)}, ${SHAPES[look.shape].label}.`,
        files: [ref],
        data: { container: done.video.container, seconds: done.video.seconds },
      }
    },
  }

  return [
    info,
    convert,
    edit,
    ringtone,
    normalize,
    speed,
    noise,
    tags,
    split,
    join,
    transcribe,
    video,
  ].map((tool) => asTool(tool as AgentTool<never>))
}
