"use client"

import { WorkerPool } from "@/lib/image-batch/pool"
import type { Comparison } from "./compare"
import type {
  CompareRequest,
  CompareResponse,
  ConverterResponse,
  ProcessRequest,
} from "./protocol"

export { poolSize } from "@/lib/image-batch/pool"

type Job = Omit<ProcessRequest, "type" | "generation">

const createWorker = () =>
  new Worker(new URL("./convert.worker.ts", import.meta.url), {
    type: "module",
  })

/** The shared worker pool, running the conversion worker. */
export class ConverterPool extends WorkerPool<Job, ConverterResponse> {
  constructor(
    size: number,
    listener: (message: ConverterResponse) => void,
    next: (cachedId: string | null) => Job | null
  ) {
    super(size, createWorker, listener, next)
  }
}

/**
 * Encode one image in several formats in its own worker and report the sizes.
 * Returns a promise and a `cancel` that stops the work.
 */
export function compareFormats(
  request: Omit<CompareRequest, "type">,
  onProgress: (label: string) => void
) {
  const worker = createWorker()
  const promise = new Promise<Comparison[]>((resolve, reject) => {
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
  }).finally(() => worker.terminate())
  return { promise, cancel: () => worker.terminate() }
}
