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
import { factsLine, outputName } from "@/lib/video/queue"
import {
  defaultSettings,
  FRAME_RATES,
  LEAST_BITRATE,
  MOST_BITRATE,
  SHORT_SIDES,
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
    async run(input, context) {
      const { file: _file, ...asked } = input
      void _file
      const settings: VideoSettings = { ...defaultSettings, ...asked }
      if (settings.quality === "custom" && asked.bitrate === undefined)
        throw new ToolError(`Give the picture's "bitrate" with quality custom.`)
      const opened = await open(context.files, input.file, context.signal)
      const plan = await browserPlan(opened.facts, settings, engines.ask)
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
              context.progress(message.fraction, "Writing the video")
          },
        }
      )) as Extract<VideoResponse, { type: "done"; job: "convert" }>
      if (done.problems.length)
        throw new ToolError(
          `The video was written but not as asked, so it is not handed over: ${done.problems.join(" ")}`
        )
      const ref = context.files.add(
        done.file,
        outputName(opened.ref.name, plan),
        "made"
      )
      return {
        summary: `${[...plan.notes, `Written and checked: ${factsLine(done.written)}, ${bytes(done.file.size)}.`].join(" ")}`,
        files: [ref],
        data: {
          plan: {
            container: plan.container,
            video: plan.video,
            audio: plan.audio,
            width: plan.width,
            height: plan.height,
          },
          written: done.written,
        },
      }
    },
  }

  return [info, convert].map((tool) => asTool(tool as AgentTool<never>))
}
