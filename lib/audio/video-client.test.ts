import { afterEach, describe, expect, it, vi } from "vitest"
import { startVideo } from "./video-client"
import { defaultLook } from "./video"
import type { VideoMessage } from "./video.worker"

class FakeWorker {
  static last: FakeWorker
  onmessage: ((event: { data: VideoMessage }) => void) | null = null
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
  look: defaultLook,
  colours: { background: "a", foreground: "b", muted: "c", accent: "d" },
  picture: null,
  title: "",
  artist: "",
}

describe("making a video", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("passes on what the worker says, and an error when it fails", () => {
    vi.stubGlobal("Worker", FakeWorker)
    const heard: VideoMessage[] = []
    startVideo(job, (message) => heard.push(message))
    expect(FakeWorker.last.posted).toEqual([job])
    FakeWorker.last.onmessage!({ data: { type: "progress", fraction: 0.5 } })
    FakeWorker.last.onerror!()
    expect(heard).toEqual([
      { type: "progress", fraction: 0.5 },
      {
        type: "error",
        message: "The video could not be made in this browser.",
      },
    ])
  })

  it("hears nothing more once stopped", () => {
    vi.stubGlobal("Worker", FakeWorker)
    const heard: VideoMessage[] = []
    const stop = startVideo(job, (message) => heard.push(message))
    stop()
    expect(FakeWorker.last.ended).toBe(true)
    FakeWorker.last.onerror!()
    FakeWorker.last.onmessage!({ data: { type: "progress", fraction: 1 } })
    expect(heard).toEqual([])
  })
})
