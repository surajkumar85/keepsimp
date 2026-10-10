"use client"

import { WorkerPool } from "@/lib/image-batch/pool"
import type { ProcessRequest, ResizerResponse } from "./protocol"

export { poolSize } from "@/lib/image-batch/pool"

type Job = Omit<ProcessRequest, "type" | "generation">

/** The shared worker pool, running the resize worker. */
export class ResizerPool extends WorkerPool<Job, ResizerResponse> {
  constructor(
    size: number,
    listener: (message: ResizerResponse) => void,
    next: (cachedId: string | null) => Job | null
  ) {
    super(
      size,
      () =>
        new Worker(new URL("./resize.worker.ts", import.meta.url), {
          type: "module",
        }),
      listener,
      next
    )
  }
}
