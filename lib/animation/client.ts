"use client"

import { WorkerPool } from "@/lib/image-batch/pool"
import type {
  AnimationResponse,
  CompareRequest,
  CompareResponse,
  ProcessRequest,
  ViewRequest,
  ViewResponse,
} from "./protocol"
import type { Target } from "./settings"

type Job = Omit<ProcessRequest, "type" | "generation">

const createWorker = () =>
  new Worker(new URL("./animation.worker.ts", import.meta.url), {
    type: "module",
  })

/** Animations hold many frames at once, so at most two are converted side by side. */
export function animationPoolSize(cores: number | undefined) {
  return (cores ?? 2) >= 8 ? 2 : 1
}

/** The shared worker pool, running the animation worker. */
export class AnimationPool extends WorkerPool<Job, AnimationResponse> {
  constructor(
    size: number,
    listener: (message: AnimationResponse) => void,
    next: (cachedId: string | null) => Job | null
  ) {
    super(size, createWorker, listener, next)
  }
}

export type ViewedFrames = Partial<Record<"original" | "result", ImageBitmap>>

/**
 * A worker of its own for the paused preview, so stepping through frames
 * never waits behind a conversion. Only the newest request is answered.
 */
export class FrameViewer {
  private worker: Worker | null = null
  private latest = 0
  private last: ViewRequest["views"] | null = null
  /** Times the worker has been started again after failing to load. */
  private restarts = 0
  private answered = false

  constructor(
    private readonly onFrames: (frames: ViewedFrames) => void,
    private readonly onError: (message: string) => void
  ) {}

  show(views: ViewRequest["views"]) {
    this.last = views
    if (!this.worker) {
      this.worker = createWorker()
      this.worker.onmessage = (event: MessageEvent<ViewResponse>) => {
        this.answered = true
        const message = event.data
        if (message.type === "viewed") {
          if (message.request === this.latest) this.onFrames(message.frames)
          else for (const frame of Object.values(message.frames)) frame.close()
        } else if (message.request === this.latest)
          this.onError(message.message)
      }
      this.worker.onerror = () => {
        this.worker?.terminate()
        this.worker = null
        // A worker that never answered could not load; start it again (see WorkerPool).
        if (!this.answered && this.restarts < 2 && this.last) {
          this.restarts++
          this.show(this.last)
        } else
          this.onError(
            "The preview stopped unexpectedly. Press play to continue."
          )
      }
    }
    this.worker.postMessage({
      type: "view",
      request: ++this.latest,
      views,
    } satisfies ViewRequest)
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
  }
}

/**
 * Convert one animation to several formats in a worker of its own and report
 * the sizes. Returns a promise and a `cancel` that stops the work.
 */
export function compareFormats(
  request: Omit<CompareRequest, "type">,
  onProgress: (label: string) => void
) {
  const worker = createWorker()
  const promise = new Promise<{ target: Target; bytes: number }[]>(
    (resolve, reject) => {
      worker.onmessage = (event: MessageEvent<CompareResponse>) => {
        const message = event.data
        if (message.type === "compare-progress") onProgress(message.label)
        else if (message.type === "compared") resolve(message.results)
        else if (message.type === "compare-error")
          reject(new Error(message.message))
      }
      worker.onerror = () =>
        reject(new Error("The comparison stopped unexpectedly. Try again."))
      worker.postMessage({ ...request, type: "compare" })
    }
  ).finally(() => worker.terminate())
  return { promise, cancel: () => worker.terminate() }
}
