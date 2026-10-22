"use client"

import { WorkerPool } from "@/lib/image-batch/pool"
import type { VideoJob, VideoResponse } from "./protocol"

const createWorker = () =>
  new Worker(new URL("./video.worker.ts", import.meta.url), { type: "module" })

/** The workers that read and write video. One: encoders use the device's hardware, which has few sessions. */
export class VideoPool extends WorkerPool<VideoJob, VideoResponse> {
  constructor(
    listener: (message: VideoResponse) => void,
    next: (cachedId: string | null) => VideoJob | null,
    size = 1
  ) {
    super(size, createWorker, listener, next)
  }
}
