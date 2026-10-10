/// <reference lib="webworker" />
import {
  resizePixels,
  setCodecLoadListener,
} from "@/lib/image-compressor/codecs"
import {
  decodeImageFile,
  previewBitmap,
  tooLarge,
} from "@/lib/image-compressor/decode"
import { sniffFormat } from "@/lib/image-compressor/formats"
import { orientedSize } from "@/lib/image-compressor/geometry"
import { extractOriented } from "@/lib/image-compressor/pixels"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { createDeps } from "./deps"
import { convertAnimation } from "./pipeline"
import type {
  AnimationRequest,
  AnimationResponse,
  ProcessRequest,
  SourceInput,
  ViewRequest,
  ViewResponse,
} from "./protocol"
import { MAX_FRAMES, settingsProblem } from "./settings"
import {
  allFrames,
  isVideo,
  openAnimation,
  openStills,
  type Source,
} from "./source"
import { frameAt } from "./timeline"
import { encodeVideo, openVideo } from "./video"

declare const self: DedicatedWorkerGlobalScope

const STRIP_FRAMES = 16
const STRIP_HEIGHT = 96
const UNREADABLE =
  "We could not read this animation. It may be damaged; try another file."

/** The animation this worker last opened; a batch reads one per worker at a time. */
let cached: { id: string; inputKey: string; source: Source } | null = null
let generation = 0

class Abandoned extends Error {}

const post = (
  message: AnimationResponse | ViewResponse,
  transfer: Transferable[] = []
) => self.postMessage(message, transfer)

/** Messages we wrote for the page are passed on; anything else gets a plain one. */
const readable = (error: unknown) => {
  const message = error instanceof Error ? error.message : ""
  return /^[A-Z].*[.!]$/.test(message) && message.length < 200
    ? message
    : UNREADABLE
}

/** One still image of a set, decoded with the image tools' own readers. */
async function loadStill(file: Blob) {
  const head = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())
  const format = sniffFormat(head)
  if (!format)
    throw new Error("One of these files is not an image we can read.")
  // SVG needs the page to draw it, which a worker cannot ask for.
  if (format === "svg")
    throw new Error("SVG cannot be used as a frame. Convert it to PNG first.")
  const pixels = await decodeImageFile(file, format)
  if (tooLarge(pixels.width, pixels.height))
    throw new Error("Use images with at most 50 megapixels.")
  return pixels
}

/** Open whatever was added: a set of stills, a video, or an animated image. */
async function open(input: SourceInput): Promise<Source> {
  let source: Source
  if (input.kind === "stills")
    source = await openStills(input.durations, {
      load: (index) => loadStill(input.files[index]),
      resize: (pixels, size, kernel) => resizePixels(pixels, size, kernel),
    })
  else {
    const head = new Uint8Array(await input.file.slice(0, 16).arrayBuffer())
    if (isVideo(head)) {
      if (typeof VideoDecoder === "undefined")
        throw new Error(
          "This browser cannot read video. Use a current version of Chrome, Edge, Firefox or Safari."
        )
      source = await openVideo(input.file)
    } else {
      source = openAnimation(
        new Uint8Array(await input.file.arrayBuffer()),
        createDeps()
      )
      if (source.durations.length > MAX_FRAMES)
        throw new Error(
          `Use an animation with at most ${MAX_FRAMES.toLocaleString("en")} frames.`
        )
    }
  }
  if (tooLarge(source.width, source.height)) {
    source.close?.()
    throw new Error("Use an animation with at most 50 megapixels per frame.")
  }
  return source
}

const copy = (pixels: Pixels): Pixels => ({
  ...pixels,
  data: pixels.data.slice(),
})

/** The first frame as a thumbnail, and a strip of moments for the trim bar. */
async function describe(source: Source) {
  const count = source.durations.length
  const tiles: ImageBitmap[] = []
  let thumbnail: ImageBitmap | null = null
  let transparent = false
  // Evenly spread moments, always starting with the first frame.
  const moments = Array.from(
    { length: Math.min(STRIP_FRAMES, count) },
    (_, index) => Math.floor((index * count) / Math.min(STRIP_FRAMES, count))
  )
  for await (const frame of source.read(moments)) {
    const still = copy(frame)
    if (!thumbnail) {
      thumbnail = await previewBitmap(still, 640)
      for (let i = 3; i < still.data.length; i += 4)
        if (still.data[i] < 255) {
          transparent = true
          break
        }
    }
    tiles.push(await previewBitmap(still, STRIP_HEIGHT * 2))
  }
  if (!thumbnail) throw new Error(UNREADABLE)
  let strip: ImageBitmap | null = null
  if (typeof OffscreenCanvas !== "undefined" && tiles.length) {
    const width = Math.max(
      1,
      Math.round((STRIP_HEIGHT * source.width) / source.height)
    )
    const canvas = new OffscreenCanvas(width * tiles.length, STRIP_HEIGHT)
    const context = canvas.getContext("2d")
    if (context) {
      tiles.forEach((tile, position) =>
        context.drawImage(tile, position * width, 0, width, STRIP_HEIGHT)
      )
      strip = canvas.transferToImageBitmap()
    }
  }
  for (const tile of tiles) tile.close()
  return { thumbnail, strip, transparent }
}

async function process(job: ProcessRequest) {
  const checkpoint = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (job.generation < generation) throw new Abandoned()
  }
  const progress = (label: string) =>
    post({ type: "progress", id: job.id, label })
  setCodecLoadListener((label) => progress(`Loading the ${label}…`))

  let source: Source
  try {
    if (cached?.id !== job.id || cached.inputKey !== job.inputKey) {
      cached?.source.close?.()
      cached = null
      progress("Reading…")
      cached = {
        id: job.id,
        inputKey: job.inputKey,
        source: await open(job.input),
      }
    }
    source = cached.source
    if (job.describe) {
      const { thumbnail, strip, transparent } = await describe(source)
      post(
        {
          type: "opened",
          id: job.id,
          format: source.format,
          width: source.width,
          height: source.height,
          plays: source.plays,
          durations: source.durations,
          transparent,
          thumbnail,
          strip,
        },
        strip ? [thumbnail, strip] : [thumbnail]
      )
    }
  } catch (error) {
    cached?.source.close?.()
    cached = null
    post({ type: "open-error", id: job.id, message: readable(error) })
    return
  }

  try {
    await checkpoint()
    const problem = settingsProblem(job.settings)
    if (problem) throw new Error(problem)
    const result = await convertAnimation(
      source,
      job.settings,
      job.trim,
      createDeps(checkpoint, progress, encodeVideo)
    )
    await checkpoint()
    // Copy: the bytes may be a view of an encoder's own memory.
    const bytes = result.bytes.slice().buffer
    post(
      {
        type: "done",
        id: job.id,
        key: job.key,
        output: { ...result, bytes, target: job.settings.target },
      },
      [bytes]
    )
  } catch (error) {
    if (error instanceof Abandoned) {
      post({ type: "abandoned", id: job.id })
      return
    }
    post({ type: "error", id: job.id, key: job.key, message: readable(error) })
  }
}

/** An opened file being stepped through for the paused preview. */
interface Viewer {
  inputKey: string
  source: Source
  frames: AsyncGenerator<Pixels>
  /** The frame the generator last produced, and its number. */
  index: number
  frame: Pixels | null
}
const viewers: Partial<Record<"original" | "result", Viewer>> = {}

async function view(job: ViewRequest) {
  try {
    const frames: Partial<Record<"original" | "result", ImageBitmap>> = {}
    for (const { slot, input, inputKey, time, orientation } of job.views) {
      let viewer = viewers[slot]
      if (viewer?.inputKey !== inputKey) {
        viewer?.source.close?.()
        const source = await open(input)
        viewer = {
          inputKey,
          source,
          frames: source.read(allFrames(source)),
          index: -1,
          frame: null,
        }
        viewers[slot] = viewer
      }
      const wanted = frameAt(viewer.source.durations, time)
      if (viewer.source.seekable) {
        for await (const frame of viewer.source.read([wanted]))
          viewer.frame = frame
        viewer.index = wanted
      } else {
        // Frames build on the ones before, so going back means starting again.
        if (wanted < viewer.index) {
          viewer.frames = viewer.source.read(allFrames(viewer.source))
          viewer.index = -1
        }
        while (viewer.index < wanted) {
          const next = await viewer.frames.next()
          if (next.done) break
          viewer.frame = next.value
          viewer.index++
        }
      }
      if (viewer.frame) {
        // Either way this copies the frame off the shared canvas.
        const still = orientation
          ? extractOriented(
              viewer.frame,
              orientation.rotation,
              orientation.flipX,
              orientation.flipY,
              {
                x: 0,
                y: 0,
                ...orientedSize(viewer.frame, orientation.rotation),
              }
            )
          : copy(viewer.frame)
        frames[slot] = await previewBitmap(
          still,
          Math.max(still.width, still.height)
        )
      }
    }
    post(
      { type: "viewed", request: job.request, frames },
      Object.values(frames)
    )
  } catch (error) {
    post({ type: "view-error", request: job.request, message: readable(error) })
  }
}

// Views are answered one at a time, so a stepped-through file is never read twice at once.
let viewing: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<AnimationRequest>) => {
  const request = event.data
  if (request.type === "supersede") generation = request.generation
  else if (request.type === "forget") {
    if (cached?.id === request.id) {
      cached.source.close?.()
      cached = null
    }
  } else if (request.type === "view")
    viewing = viewing.then(() => view(request))
  else {
    generation = Math.max(generation, request.generation)
    void process(request)
  }
}
