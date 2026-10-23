/**
 * The video workspace's jobs as tools. They read and write through the
 * workspace's own worker (the agent's own pool of one), plan each file with
 * the workspace's own `planFor`, asking the browser what it can write as
 * the page does, and hand over a result only when it was opened again and
 * found as asked.
 */
import {
  containerProblem,
  sniffContainer,
  SNIFF_BYTES,
} from "@/lib/video/formats"
import { browserPlan, convertJob, readJob, type Asker } from "@/lib/video/jobs"
import type { VideoJob, VideoResponse } from "@/lib/video/protocol"
import { factsLine, outputName, partName, splitParts } from "@/lib/video/queue"
import {
  clock,
  cutOut,
  everyPoints,
  keepOnly,
  tidy,
  whole,
  type Part,
} from "@/lib/video/trim"
import { looksSaid } from "@/lib/video/looks"
import { floorSaid } from "@/lib/video/target"
import {
  defaultSettings,
  FRAME_RATES,
  LEAST_BITRATE,
  LEAST_LIMIT,
  MB,
  MOST_BITRATE,
  MOST_LIMIT,
  SHORT_SIDES,
  type Cut,
  type VideoFacts,
  type VideoSettings,
} from "@/lib/video/settings"
import type { PoolJobs } from "./pool-jobs"
import { asTool, fileProperty, ToolError, type AgentTool } from "./registry"
import type { FileStore } from "./files"

export interface VideoEngines {
  pool: PoolJobs<VideoJob, VideoResponse>
  ask: Asker
  /** The agent page's folder for results being written. */
  folder: string
  /** A frame of a file as a PNG, read as the workspace reads it (`frameAt`). */
  frame: (file: Blob, seconds: number) => Promise<Blob>
}

type Settings = Partial<
  Pick<
    VideoSettings,
    | "format"
    | "codec"
    | "quality"
    | "bitrate"
    | "size"
    | "frameRate"
    | "rotate"
    | "flip"
    | "sound"
    | "keepTags"
  >
>

const settingsSchema = {
  format: {
    type: "string",
    enum: ["mp4", "webm", "mov", "mkv", "same"],
    description:
      "mp4 (the default) plays everywhere; webm for the web; mov for Apple's apps; mkv keeps anything as it is; same keeps each file's own kind.",
  },
  codec: {
    type: "string",
    enum: ["auto", "avc", "hevc", "vp9", "av1", "vp8"],
    description:
      "The picture's codec when it is encoded again; auto is the most widely played one the format holds (H.264 for MP4).",
  },
  quality: {
    type: "string",
    enum: ["original", "high", "balanced", "small", "custom"],
    description:
      "original (the default) copies the picture wherever nothing has to change; high is YouTube's recommended bitrate, balanced half and small a quarter of it; custom takes bitrate.",
  },
  bitrate: {
    type: "integer",
    minimum: LEAST_BITRATE,
    maximum: MOST_BITRATE,
    description: "kbit/s for the picture, with quality custom.",
  },
  size: {
    type: ["string", "integer"],
    enum: ["same", ...SHORT_SIDES],
    description: "The shorter side at most, in pixels; never made larger.",
  },
  frameRate: {
    type: ["string", "integer"],
    enum: ["same", ...FRAME_RATES],
    description: "At most this many frames a second; never raised.",
  },
  rotate: {
    type: "integer",
    enum: [0, 90, 180, 270],
    description: "Degrees clockwise.",
  },
  flip: { type: "boolean", description: "Mirrored left to right." },
  sound: {
    type: "string",
    enum: ["keep", "convert", "none"],
    description:
      "keep copies the sound where the format plays it everywhere; convert always converts it (AAC, or Opus in WebM and MKV); none leaves it out.",
  },
  keepTags: {
    type: "boolean",
    description: "Keep the title and other details (yes by default).",
  },
} as const

const partsSchema = (description: string) =>
  ({
    type: "array",
    minItems: 1,
    items: {
      type: "object",
      properties: {
        start: { type: "number", minimum: 0, description: "Seconds." },
        end: { type: "number", minimum: 0, description: "Seconds." },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    description,
  }) as const

/** What is kept: the parts asked for (or the whole), less the parts cut. */
export function kept(duration: number, keep?: Part[], cut?: Part[]) {
  let parts = whole(duration)
  for (const part of keep ?? [])
    if (part.start >= duration)
      throw new ToolError(
        `The video is ${clock(duration)} long, so a part cannot start at ${clock(part.start)}.`
      )
  if (keep?.length)
    parts = tidy(
      keep.flatMap((part) =>
        keepOnly(whole(duration), part.start, part.end, duration)
      ),
      duration
    )
  for (const part of cut ?? [])
    parts = cutOut(parts, part.start, part.end, duration)
  return parts
}

/** A PNG's size, from its header; null when it is not a PNG. */
export function pngSize(head: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length < 24 || signature.some((byte, at) => head[at] !== byte))
    return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const bytes = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`

export function videoTools(engines: VideoEngines): AgentTool[] {
  async function open(files: FileStore, id: string, signal: AbortSignal) {
    const { blob, ref } = files.get(id)
    const container = sniffContainer(
      new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer())
    )
    const problem = containerProblem(container)
    if (problem) throw new ToolError(`${ref.name}: ${problem}`)
    const read = (await engines.pool.run(readJob(blob, container!), {
      signal,
    })) as Extract<VideoResponse, { type: "done"; job: "read" }>
    read.poster?.close()
    return { blob, ref, container: container!, facts: read.facts }
  }

  const info: AgentTool<{ file: string }> = {
    name: "video_info",
    title: "Read a video file",
    description:
      "Tells what a video file holds: its format, the picture's codec, size as shown, turn, frame rate (and whether it varies), bitrate and whether it is HDR, the sound's codec, rate and channels, and its length; and whether this browser can play each.",
    inputSchema: {
      type: "object",
      properties: { file: fileProperty("The video file.") },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(input, { files, signal }) {
      const { ref, facts } = await open(files, input.file, signal)
      return {
        summary: `${ref.name}: ${factsLine(facts)}, ${bytes(facts.size)}${facts.audio ? "" : ", no sound"}.`,
        data: facts,
      }
    },
  }

  /** Write a file by settings, as the workspace does, and hand over the checked result. */
  async function write(
    file: string,
    settings: VideoSettings,
    context: Parameters<AgentTool["run"]>[1],
    cutFor: (facts: VideoFacts) => Cut | null = () => null,
    /** A part's own name, which says what it is. */
    name?: string
  ) {
    const opened = await open(context.files, file, context.signal)
    const plan = await browserPlan(
      opened.facts,
      settings,
      engines.ask,
      undefined,
      cutFor(opened.facts)
    )
    if (plan.problem) throw new ToolError(plan.problem)
    const done = (await engines.pool.run(
      convertJob(
        opened.blob,
        opened.container,
        opened.facts,
        plan,
        engines.folder
      ),
      {
        signal: context.signal,
        onMessage: (message) => {
          if (message.type === "progress")
            context.progress(
              message.fraction,
              message.pass && message.pass > 1
                ? `Writing the video again (pass ${message.pass})`
                : "Writing the video"
            )
        },
      }
    )) as Extract<VideoResponse, { type: "done"; job: "convert" }>
    if (done.problems.length)
      throw new ToolError(
        `The video was written but not as asked, so it is not handed over: ${done.problems.join(" ")}`
      )
    const ref = context.files.add(
      done.file,
      outputName(name ?? opened.ref.name, plan, name !== undefined),
      "made"
    )
    return {
      summary: [
        ...plan.notes,
        ...(done.resized ? [floorSaid(done.resized)] : []),
        `Written and checked: ${factsLine(done.written)}, ${bytes(done.file.size)}${done.passes > 1 ? `, in ${done.passes} passes` : ""}.`,
        ...(done.looks ? [looksSaid(done.looks)] : []),
      ].join(" "),
      files: [ref],
      data: {
        plan: {
          container: plan.container,
          video: plan.video,
          audio: plan.audio,
          width: plan.width,
          height: plan.height,
          cut: plan.cut,
        },
        written: done.written,
        passes: done.passes,
        resized: done.resized,
        looks: done.looks,
      },
    }
  }

  /** The settings asked for, laid over the workspace's. */
  function settingsOf(asked: Settings): VideoSettings {
    if (asked.quality === "custom" && asked.bitrate === undefined)
      throw new ToolError(`Give the picture's "bitrate" with quality custom.`)
    return { ...defaultSettings, ...asked }
  }

  const convert: AgentTool<Settings & { file: string }> = {
    name: "convert_video",
    title: "Convert a video",
    description:
      "Writes a video as MP4, WebM, MOV or MKV, as the video editor does: the picture is copied as it is wherever nothing has to change, and encoded again by the browser for a quality, a smaller size, a lower frame rate, another codec, or a turn a format cannot carry. Sound converted stays in step with the picture. The result is opened again and its codec, size, frame rate, sound, length and first and last frames checked before it is handed over.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The video file."),
        ...settingsSchema,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ file, ...asked }, context) {
      return write(file, settingsOf(asked), context)
    },
  }

  const compress: AgentTool<
    Settings & { file: string; megabytes?: number; share?: number }
  > = {
    name: "compress_video",
    title: "Make a video smaller, to a size",
    description:
      "Writes a video to fit under a size (megabytes) or a share of its own size, as the video compressor does: the sound gets its share, the picture the rest as its bitrate, and more than 30 frames a second become 30, then the size steps down, when that leaves too few bits for the picture. The file is written again with a corrected bitrate when the browser's encoder misses (three passes at most), at a smaller size when the encoder will not come down to its bitrate,, and is never handed over larger than the limit. A file already under it is copied. Says how close the result looks (SSIM on frames through the clip).",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The video file."),
        megabytes: {
          type: "number",
          minimum: LEAST_LIMIT,
          maximum: MOST_LIMIT,
          description: "The size to fit under, in MB (1 MB = 1,048,576 bytes).",
        },
        share: {
          type: "number",
          exclusiveMinimum: 0,
          exclusiveMaximum: 1,
          description: "Or a share of the file's own size: 0.5 for half.",
        },
        ...settingsSchema,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ file, megabytes, share, ...asked }, context) {
      if ((megabytes === undefined) === (share === undefined))
        throw new ToolError('Give either "megabytes" or "share".')
      return write(
        file,
        {
          ...settingsOf(asked),
          limit:
            megabytes !== undefined
              ? { bytes: Math.round(megabytes * MB) }
              : { share: share! },
        },
        context
      )
    },
  }

  const trim: AgentTool<
    Settings & { file: string; keep?: Part[]; cut?: Part[]; exact?: boolean }
  > = {
    name: "trim_video",
    title: "Trim a video",
    description:
      "Keeps parts of a video and cuts the rest, as the video trimmer does, in seconds of the original: keep lists the parts to keep (the whole video when left out), cut the parts to take away from them. Without exact, the picture is copied as it is, so nothing is lost: a part begins and ends at the keyframes around it (a single part of an MP4 or MOV still starts exactly, by the file's edit list), and the summary says how much more that keeps. With exact, it is cut to the frame and the sound to the sample by encoding the picture again. Several parts are joined into one file. The result is opened again and its length held to the parts kept. The format stays the file's own unless one is given.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The video file."),
        keep: partsSchema(
          "Parts to keep, in seconds of the original; the whole video when left out."
        ),
        cut: partsSchema("Parts to cut out, in seconds of the original."),
        exact: {
          type: "boolean",
          description:
            "Cut to the frame by encoding the picture again (no by default: copied, cut at keyframes).",
        },
        ...settingsSchema,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ file, keep, cut, exact = false, ...asked }, context) {
      if (!keep?.length && !cut?.length)
        throw new ToolError('Give the parts to "keep" or to "cut", or both.')
      return write(
        file,
        settingsOf({ format: "same", ...asked }),
        context,
        (facts) => ({ parts: kept(facts.duration, keep, cut), exact })
      )
    },
  }

  const split: AgentTool<
    Settings & {
      file: string
      at?: number[]
      every?: number
      keep?: Part[]
      cut?: Part[]
      exact?: boolean
    }
  > = {
    name: "split_video",
    title: "Split a video into files",
    description:
      "Splits a video into files of its own at points (at, in seconds of the original) or every so many seconds (every), as the video trimmer's Split into files does: each file is the video with one more part kept, written, cut and checked as trim_video does it, copied at keyframes unless exact. keep and cut, as in trim_video, choose what is kept before it is split; a piece with nothing kept is left out. The format stays the file's own unless one is given. Files are named name-part-1, name-part-2 and so on.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The video file."),
        at: {
          type: "array",
          minItems: 1,
          items: { type: "number", exclusiveMinimum: 0 },
          description: "Where to split, in seconds of the original.",
        },
        every: {
          type: "number",
          minimum: 1,
          description: "Or split every so many seconds.",
        },
        keep: partsSchema(
          "Parts to keep before splitting, in seconds of the original."
        ),
        cut: partsSchema("Parts to cut out before splitting."),
        exact: {
          type: "boolean",
          description:
            "Cut to the frame by encoding the picture again (no by default: copied, cut at keyframes).",
        },
        ...settingsSchema,
      },
      required: ["file"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(
      { file, at, every, keep, cut, exact = false, ...asked },
      context
    ) {
      if ((at === undefined) === (every === undefined))
        throw new ToolError('Give either "at" or "every".')
      const { ref, facts } = await open(context.files, file, context.signal)
      const duration = facts.duration
      const points = at ?? everyPoints(every!, duration)
      const pieces = splitParts(
        keep?.length || cut?.length ? kept(duration, keep, cut) : null,
        points,
        duration
      )
      if (pieces.length < 2)
        throw new ToolError(
          `Splitting ${ref.name} (${clock(duration)}) there leaves one piece with something kept, so there is nothing to split.`
        )
      const settings = settingsOf({ format: "same", ...asked })
      const made = []
      for (const [index, parts] of pieces.entries())
        made.push(
          await write(
            file,
            settings,
            {
              ...context,
              progress: (fraction, note) =>
                context.progress(
                  (index + fraction) / pieces.length,
                  `Part ${index + 1} of ${pieces.length}: ${note}`
                ),
            },
            () => ({ parts, exact }),
            partName(ref.name, index + 1)
          )
        )
      return {
        summary: [
          `Split into ${pieces.length} files.`,
          ...made.map(
            (one, index) =>
              `Part ${index + 1} (${pieces[index]
                .map((part) => `${clock(part.start)} to ${clock(part.end)}`)
                .join(", ")}): ${one.summary}`
          ),
        ].join("\n"),
        files: made.flatMap((one) => one.files),
        data: { parts: pieces, files: made.map((one) => one.data) },
      }
    },
  }

  const frame: AgentTool<{ file: string; seconds: number }> = {
    name: "video_frame",
    title: "Save a frame of a video",
    description:
      "Saves the frame shown at a moment of a video as a PNG, read from the file at the video's full size and turned as it is shown, as the video trimmer's Save this frame does.",
    inputSchema: {
      type: "object",
      properties: {
        file: fileProperty("The video file."),
        seconds: {
          type: "number",
          minimum: 0,
          description: "The moment, in seconds from the start.",
        },
      },
      required: ["file", "seconds"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run({ file, seconds }, { files, signal }) {
      const { blob, ref, facts } = await open(files, file, signal)
      if (!facts.video) throw new ToolError(`${ref.name} has no picture.`)
      if (seconds > facts.duration)
        throw new ToolError(
          `${ref.name} is ${clock(facts.duration)} long, so there is no frame at ${clock(seconds)}.`
        )
      const picture = await engines.frame(blob, seconds)
      const size = pngSize(
        new Uint8Array(await picture.slice(0, 24).arrayBuffer())
      )
      if (
        !size ||
        size.width !== facts.video.width ||
        size.height !== facts.video.height
      )
        throw new ToolError(
          "The frame was read but is not the video's picture, so it is not handed over."
        )
      const made = files.add(
        picture,
        `${ref.name.replace(/\.[^.]+$/, "")} ${clock(seconds).replaceAll(":", "-")}.png`,
        "made"
      )
      return {
        summary: `The frame at ${clock(seconds)}: ${size.width} × ${size.height} PNG, ${bytes(picture.size)}.`,
        files: [made],
        data: size,
      }
    },
  }

  return [info, convert, compress, trim, split, frame].map((tool) =>
    asTool(tool as AgentTool<never>)
  )
}
