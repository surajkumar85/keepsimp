/// <reference lib="webworker" />
import { setCodecLoadListener } from "@/lib/image-compressor/codecs"
import { previewBitmap, tooLarge } from "@/lib/image-compressor/decode"
import { orientedSize } from "@/lib/image-compressor/geometry"
import { extractOriented } from "@/lib/image-compressor/pixels"
import type { Pixels } from "@/lib/image-compressor/ssim"
import { createDeps } from "./deps"
import { convertAnimation } from "./pipeline"
import type {
  AnimationRequest,
  AnimationResponse,
  ProcessRequest,
  ViewRequest,
  ViewResponse,
} from "./protocol"
import { MAX_FRAMES, settingsProblem } from "./settings"
import { openAnimation, type Source } from "./source"
import { frameAt } from "./timeline"

declare const self: DedicatedWorkerGlobalScope

const STRIP_FRAMES = 16
const STRIP_HEIGHT = 96
const UNREADABLE =
  "We could not read this animation. It may be damaged; try another file."

/** The animation this worker last read; a batch reads one per worker at a time. */
let cached: { id: string; bytes: Uint8Array } | null = null
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

function open(bytes: Uint8Array) {
  const source = openAnimation(bytes, createDeps())
  if (tooLarge(source.width, source.height))
    throw new Error("Use an animation with at most 50 megapixels per frame.")
  if (source.durations.length > MAX_FRAMES)
    throw new Error(
      `Use an animation with at most ${MAX_FRAMES.toLocaleString("en")} frames.`
    )
  return source
}

const copy = (pixels: Pixels): Pixels => ({
  ...pixels,
  data: pixels.data.slice(),
})

/** The first frame as a thumbnail, and a strip of moments for the trim bar. */
async function describe(source: Source) {
  const count = source.durations.length
  const wanted = new Set(
    Array.from({ length: Math.min(STRIP_FRAMES, count) }, (_, index) =>
      Math.floor((index * count) / Math.min(STRIP_FRAMES, count))
    )
  )
  const tiles: ImageBitmap[] = []
  let thumbnail: ImageBitmap | null = null
  let transparent = false
  let index = 0
  for await (const frame of source.frames()) {
    if (wanted.has(index)) {
      const still = copy(frame)
      if (index === 0) {
        thumbnail = await previewBitmap(still, 640)
        for (let i = 3; i < still.data.length; i += 4)
          if (still.data[i] < 255) {
            transparent = true
            break
          }
      }
      tiles.push(await previewBitmap(still, STRIP_HEIGHT * 2))
    }
    index++
  }
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
  return { thumbnail: thumbnail!, strip, transparent }
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
    if (cached?.id !== job.id) {
      cached = null
      progress("Reading…")
      cached = {
        id: job.id,
        bytes: new Uint8Array(await job.file.arrayBuffer()),
      }
    }
    source = open(cached.bytes)
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
      createDeps(checkpoint, progress)
    )
    await checkpoint()
    // Copy: the bytes may be a view of an encoder's own memory.
    const bytes = result.bytes.slice().buffer
    post(
      {
        type: "done",
        id: job.id,
        key: job.key,
        output: { ...result, bytes },
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
  file: Blob
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
    for (const { slot, file, time, orientation } of job.views) {
      let viewer = viewers[slot]
      if (viewer?.file !== file) {
        const source = open(new Uint8Array(await file.arrayBuffer()))
        viewer = {
          file,
          source,
          frames: source.frames(),
          index: -1,
          frame: null,
        }
        viewers[slot] = viewer
      }
      const wanted = frameAt(viewer.source.durations, time)
      // Frames build on the ones before, so going back means starting again.
      if (wanted < viewer.index) {
        viewer.frames = viewer.source.frames()
        viewer.index = -1
      }
      while (viewer.index < wanted) {
        const next = await viewer.frames.next()
        if (next.done) break
        viewer.frame = next.value
        viewer.index++
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
    if (cached?.id === request.id) cached = null
  } else if (request.type === "view")
    viewing = viewing.then(() => view(request))
  else {
    generation = Math.max(generation, request.generation)
    void process(request)
  }
}
