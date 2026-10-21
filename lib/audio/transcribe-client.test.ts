import { afterEach, describe, expect, it, vi } from "vitest"
import { startTranscription } from "./transcribe-client"
import type { TranscribeMessage } from "./transcribe.worker"

/** A worker that does nothing by itself; the test makes it speak. */
class FakeWorker {
  static last: FakeWorker
  onmessage: ((event: { data: TranscribeMessage }) => void) | null = null
  onerror: (() => void) | null = null
  posted: unknown[] = []
  ended = false
  constructor() {
    FakeWorker.last = this
  }
  postMessage(data: unknown) {
    this.posted.push(data)
  }
  terminate() {
    this.ended = true
  }
}

const job = {
  file: new Blob(),
  kept: null,
  duration: 1,
  model: "base" as const,
  language: "",
  translate: false,
}

describe("starting and stopping a transcription", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("passes on what the worker says, and an error when it fails", () => {
    vi.stubGlobal("Worker", FakeWorker)
    const heard: TranscribeMessage[] = []
    startTranscription(job, (message) => heard.push(message))
    const worker = FakeWorker.last
    expect(worker.posted).toEqual([job])
    worker.onmessage!({ data: { type: "loading", fraction: 0.5 } })
    worker.onerror!()
    expect(heard).toEqual([
      { type: "loading", fraction: 0.5 },
      {
        type: "error",
        message: "The transcription could not run in this browser.",
      },
    ])
  })

  it("hears nothing more once stopped, not even the aborted load a stopped worker reports", () => {
    vi.stubGlobal("Worker", FakeWorker)
    const heard: TranscribeMessage[] = []
    const stop = startTranscription(job, (message) => heard.push(message))
    const worker = FakeWorker.last
    stop()
    expect(worker.ended).toBe(true)
    worker.onerror!()
    worker.onmessage!({ data: { type: "done" } })
    expect(heard).toEqual([])
  })
})
