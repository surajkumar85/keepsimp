/**
 * The animation converter's work as a tool, through its own pool and
 * settings: animated GIF, WebP and APNG, short videos, or still images in
 * order, to GIF, WebP, APNG, MP4, WebM, frames or a sprite sheet.
 */
import { sizeLabel } from "@/lib/image-compressor/formats"
import {
  defaultSettings,
  processingKey,
  settingsProblem,
  targets,
  type AnimationSettings,
  type Target,
} from "@/lib/animation/settings"
import { classify } from "@/lib/animation/source"
import type {
  AnimationResponse,
  ProcessRequest,
  SourceInput,
} from "@/lib/animation/protocol"
import { fileName } from "@/lib/image-resizer/naming"
import type { PoolJobs } from "./pool-jobs"
import { asTool, filesProperty, ToolError, type AgentTool } from "./registry"

export type AnimationJob = Omit<ProcessRequest, "type" | "generation">

/** How long each still is shown when an animation is built from images, as the page does. */
export const STILL_MS = 200
/** What a video is brought to when no frame rate or size is asked for, as the page does: at most. */
export const VIDEO_FPS = 15
export const VIDEO_EDGE = 640

const TARGETS = Object.keys(targets) as Target[]

export function animationTools(
  pool: PoolJobs<AnimationJob, AnimationResponse>
): AgentTool[] {
  const convert: AgentTool<{
    files: string[]
    to: Target
    quality?: AnimationSettings["quality"]
    customQuality?: number
    fps?: number
    speed?: number
    reverse?: boolean
    boomerang?: boolean
    loop?: "forever" | "once" | number
    width?: number
    height?: number
    longEdge?: number
    percent?: number
    start?: number
    end?: number
    maxSeconds?: number
    maxMegabytes?: number
    captionTop?: string
    captionBottom?: string
    fadeIn?: number
    fadeOut?: number
    frameMs?: number
  }> = {
    name: "convert_animation",
    title: "Convert an animation or video",
    description:
      "Converts an animated GIF, WebP or APNG, or a short video (MP4, WebM, MOV), to GIF, WebP, APNG, MP4, WebM, its frames (a ZIP) or a sprite sheet. Several still images become one animation, in order. Can trim, change speed and frame rate, reverse, play back and forth, resize, caption and fit a size. A video is brought to at most 15 frames a second and 640 pixels on its longest side unless asked otherwise.",
    inputSchema: {
      type: "object",
      properties: {
        files: filesProperty(
          "One animation or video, or several still images to play in order.",
          1,
          20
        ),
        to: { type: "string", enum: TARGETS },
        quality: {
          type: "string",
          enum: ["balanced", "high", "small", "lossless", "custom"],
        },
        customQuality: { type: "integer", minimum: 1, maximum: 100 },
        fps: {
          type: "number",
          minimum: 1,
          maximum: 60,
          description: "The most frames a second.",
        },
        speed: { type: "number", minimum: 0.1, maximum: 10 },
        reverse: { type: "boolean" },
        boomerang: {
          type: "boolean",
          description: "Play forwards then backwards.",
        },
        loop: {
          type: ["string", "integer"],
          description:
            '"forever" (the default), "once", or how many times (2 or more).',
        },
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        longEdge: { type: "integer", minimum: 1, maximum: 4096 },
        percent: { type: "number", minimum: 1, maximum: 400 },
        start: {
          type: "number",
          minimum: 0,
          description: "Seconds to start at.",
        },
        end: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Seconds to end at.",
        },
        maxSeconds: { type: "number", exclusiveMinimum: 0 },
        maxMegabytes: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: 500,
          description:
            "The largest the result may be; quality, frame rate and size give way to fit.",
        },
        captionTop: { type: "string", maxLength: 200 },
        captionBottom: { type: "string", maxLength: 200 },
        fadeIn: { type: "number", minimum: 0, maximum: 10 },
        fadeOut: { type: "number", minimum: 0, maximum: 10 },
        frameMs: {
          type: "integer",
          minimum: 20,
          maximum: 10000,
          description:
            "For still images: how long each is shown, in milliseconds (200).",
        },
      },
      required: ["files", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, { files, signal, progress }) {
      const given = input.files.map((id) => files.get(id))
      const kinds = await Promise.all(
        given.map(async ({ blob }) =>
          classify(
            new Uint8Array(await blob.slice(0, 8 * 1024 * 1024).arrayBuffer())
          )
        )
      )
      const unknown = kinds.findIndex(
        (kind) => kind === "unknown" || kind === "svg"
      )
      if (unknown >= 0)
        throw new ToolError(
          kinds[unknown] === "svg"
            ? `${given[unknown].ref.name} is an SVG, which cannot be a frame. Convert it to PNG first.`
            : `${given[unknown].ref.name} is not an animation, a video or an image.`
        )
      const stills = given.length > 1
      if (stills && kinds.some((kind) => kind !== "still"))
        throw new ToolError(
          "Several files are put together only when each is a still image. Give an animation or a video by itself."
        )
      const video = kinds[0] === "video"
      const sizes = [
        input.width !== undefined || input.height !== undefined,
        input.longEdge !== undefined,
        input.percent !== undefined,
      ].filter(Boolean)
      if (sizes.length > 1)
        throw new ToolError(
          "Give one way of sizing: width and height, longEdge or percent."
        )
      const resize: Pick<
        AnimationSettings,
        "resize" | "resizeValue" | "resizeHeight" | "enlarge"
      > =
        input.width !== undefined && input.height !== undefined
          ? {
              resize: "exact",
              resizeValue: input.width,
              resizeHeight: input.height,
              enlarge: true,
            }
          : input.width !== undefined
            ? {
                resize: "width",
                resizeValue: input.width,
                resizeHeight: defaultSettings.resizeHeight,
                enlarge: true,
              }
            : input.height !== undefined
              ? {
                  resize: "height",
                  resizeValue: input.height,
                  resizeHeight: defaultSettings.resizeHeight,
                  enlarge: true,
                }
              : input.longEdge !== undefined
                ? {
                    resize: "longEdge",
                    resizeValue: input.longEdge,
                    resizeHeight: defaultSettings.resizeHeight,
                    enlarge: true,
                  }
                : input.percent !== undefined
                  ? {
                      resize: "percent",
                      resizeValue: input.percent,
                      resizeHeight: defaultSettings.resizeHeight,
                      enlarge: true,
                    }
                  : video
                    ? {
                        resize: "longEdge",
                        resizeValue: VIDEO_EDGE,
                        resizeHeight: defaultSettings.resizeHeight,
                        enlarge: false,
                      }
                    : {
                        resize: "original",
                        resizeValue: defaultSettings.resizeValue,
                        resizeHeight: defaultSettings.resizeHeight,
                        enlarge: true,
                      }
      const loop =
        input.loop === undefined || input.loop === "forever"
          ? { loop: "forever" as const }
          : input.loop === "once"
            ? { loop: "once" as const }
            : typeof input.loop === "number"
              ? { loop: "count" as const, loopCount: input.loop }
              : null
      if (!loop)
        throw new ToolError('"loop" is "forever", "once" or a number of times.')
      const settings: AnimationSettings = {
        ...defaultSettings,
        target: input.to,
        quality:
          input.quality ??
          (input.customQuality !== undefined
            ? "custom"
            : defaultSettings.quality),
        customQuality: input.customQuality ?? defaultSettings.customQuality,
        fps: input.fps ?? (video ? VIDEO_FPS : defaultSettings.fps),
        speed: input.speed ?? defaultSettings.speed,
        reverse: Boolean(input.reverse),
        boomerang: Boolean(input.boomerang),
        ...loop,
        ...resize,
        maxSeconds: input.maxSeconds ?? null,
        sizeLimit: input.maxMegabytes
          ? Math.round(input.maxMegabytes * 1024 * 1024)
          : null,
        captionTop: input.captionTop ?? "",
        captionBottom: input.captionBottom ?? "",
        fadeIn: input.fadeIn ?? 0,
        fadeOut: input.fadeOut ?? 0,
      }
      const problem = settingsProblem(settings)
      if (problem) throw new ToolError(problem)
      if (input.end !== undefined && input.end <= (input.start ?? 0))
        throw new ToolError('"end" must come after "start".')
      const trim = {
        start: Math.round((input.start ?? 0) * 1000),
        end: input.end !== undefined ? Math.round(input.end * 1000) : null,
      }
      const source: SourceInput = stills
        ? {
            kind: "stills",
            files: given.map(({ blob }) => blob),
            durations: given.map(() => input.frameMs ?? STILL_MS),
          }
        : { kind: "file", file: given[0].blob }
      const done = (await pool.run(
        {
          input: source,
          settings,
          trim,
          key: processingKey(settings, trim, undefined),
          inputKey: given.map(({ ref }) => ref.id).join(","),
          describe: false,
          overlay: null,
        },
        {
          signal,
          onMessage: (message) => {
            if (message.type === "progress") progress(0.5, message.label)
          },
        }
      )) as Extract<AnimationResponse, { type: "done" }>
      const { output } = done
      const name = fileName(settings.pattern, {
        name: stills ? "animation" : given[0].ref.name,
        width: output.width,
        height: output.height,
        format: targets[output.target].extension,
        index: 1,
        preset: "",
      })
      const made = files.add(
        new Blob([output.bytes], { type: targets[output.target].mime }),
        name,
        "made"
      )
      return {
        summary: [
          `Made ${targets[output.target].label}: ${output.width} by ${output.height} pixels, ${output.frames.toLocaleString("en")} frames, ${(output.duration / 1000).toFixed(1)} s, ${sizeLabel(output.bytes.byteLength)}.`,
          output.note ?? "",
        ]
          .filter(Boolean)
          .join(" "),
        files: [made],
        data: {
          format: output.target,
          width: output.width,
          height: output.height,
          frames: output.frames,
          seconds: output.duration / 1000,
          plays: output.plays,
          bytes: output.bytes.byteLength,
        },
      }
    },
  }
  return [asTool(convert)]
}
