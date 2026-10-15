"use client"

import { WorkerPool } from "@/lib/image-batch/pool"
import type { AudioJob, AudioResponse } from "./protocol"

const createWorker = () =>
  new Worker(new URL("./audio.worker.ts", import.meta.url), { type: "module" })

/** Decoding and encoding are heavy, and the encoders start workers of their own: two at most. */
export function audioPoolSize(cores: number | undefined) {
  return (cores ?? 2) >= 6 ? 2 : 1
}

/** The workers that read and write sound files. */
export class AudioPool extends WorkerPool<AudioJob, AudioResponse> {
  constructor(
    size: number,
    listener: (message: AudioResponse) => void,
    next: (cachedId: string | null) => AudioJob | null
  ) {
    super(size, createWorker, listener, next)
  }
}

/**
 * Decode a file on the page, for sound the worker's decoders cannot read
 * (FLAC in Safari, for one): the browser's own decoder, which plays what
 * an <audio> element plays. One array of samples per channel.
 */
export async function decodeOnPage(
  file: Blob
): Promise<{ planes: Float32Array[]; sampleRate: number }> {
  const context = new OfflineAudioContext(1, 1, 44100)
  const buffer = await context.decodeAudioData(await file.arrayBuffer())
  return {
    planes: Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel)
    ),
    sampleRate: buffer.sampleRate,
  }
}
