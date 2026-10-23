import { describe, expect, it } from "vitest"
import { browserPlan, convertJob, readJob, type Asker } from "./jobs"
import { planKey } from "./queue"
import { defaultSettings, type VideoFacts } from "./settings"

const facts: VideoFacts = {
  container: "mp4",
  size: 1_000_000,
  duration: 10,
  video: {
    codec: "avc",
    width: 1280,
    height: 720,
    rotation: 0,
    flip: false,
    frameRate: 30,
    variableRate: false,
    bitrate: 2_000_000,
    hdr: false,
    decodable: true,
  },
  audio: {
    codec: "aac",
    sampleRate: 48000,
    channels: 2,
    bitrate: 128_000,
    decodable: true,
  },
}

/** An asker that answers as told and remembers what it was asked. */
function asker(video: (codec: string) => boolean, sound = true) {
  const asked: string[] = []
  const ask: Asker = {
    video: async (codec, width, height) => {
      asked.push(`${codec}@${width}x${height}`)
      return video(codec)
    },
    sound: async (codec) => {
      asked.push(codec)
      return sound
    },
  }
  return { ask, asked }
}

describe("planning with what the browser can write", () => {
  it("asks only what the plan needs, first choice first", async () => {
    const { ask, asked } = asker(() => true)
    const plan = await browserPlan(
      facts,
      { ...defaultSettings, format: "webm" },
      ask
    )
    expect(plan.video).toMatchObject({ action: "encode", codec: "vp9" })
    expect(plan.audio).toMatchObject({ codec: "opus" })
    expect(asked).toEqual(["vp9@1280x720", "opus", "vorbis"])
  })

  it("goes down the list until a codec can be written", async () => {
    const { ask, asked } = asker((codec) => codec === "av1")
    const plan = await browserPlan(
      facts,
      { ...defaultSettings, quality: "small" },
      ask
    )
    expect(plan.video).toMatchObject({ codec: "av1" })
    expect(asked.filter((one) => one.includes("@"))).toEqual([
      "avc@1280x720",
      "hevc@1280x720",
      "av1@1280x720",
    ])
  })

  it("asks nothing for a copy, and says what cannot be written", async () => {
    const { ask, asked } = asker(() => false, false)
    const copy = await browserPlan(facts, defaultSettings, ask)
    expect(copy.video).toEqual({ action: "copy" })
    expect(asked.some((one) => one.includes("@"))).toBe(false)
    const refused = await browserPlan(
      facts,
      { ...defaultSettings, format: "webm" },
      ask
    )
    expect(refused.problem).toMatch(/cannot write/)
    const silent = await browserPlan(
      { ...facts, audio: null },
      defaultSettings,
      ask
    )
    expect(silent.audio).toEqual({ action: "none" })
  })

  it("remembers what it was told", async () => {
    const { ask, asked } = asker(() => true)
    const known = new Map([["vp9@1280x720", true]])
    await browserPlan(facts, { ...defaultSettings, format: "webm" }, ask, known)
    expect(asked.some((one) => one.includes("@"))).toBe(false)
  })

  it("stops asking after a dozen rounds", async () => {
    let count = 0
    const ask: Asker = {
      // Each answer leaves the plan waiting on another size it never settles.
      video: async () => {
        count++
        return true
      },
      sound: async () => true,
    }
    const forgetful = new Map<string, boolean>()
    forgetful.set = function (this: Map<string, boolean>) {
      return this
    }
    const plan = await browserPlan(
      facts,
      { ...defaultSettings, format: "webm" },
      ask,
      forgetful
    )
    expect(count).toBe(12)
    expect(plan.pending).toHaveLength(1)
  })
})

describe("jobs", () => {
  it("are built the same way for the page and for agents", async () => {
    const file = new Blob(["video"])
    expect(readJob(file, "mp4")).toEqual({
      job: "read",
      file,
      container: "mp4",
    })
    const plan = await browserPlan(
      facts,
      defaultSettings,
      asker(() => true).ask
    )
    expect(convertJob(file, "mp4", facts, plan, "page")).toEqual({
      job: "convert",
      file,
      container: "mp4",
      facts,
      plan,
      key: planKey(plan),
      folder: "page",
      track: null,
    })
  })
})
