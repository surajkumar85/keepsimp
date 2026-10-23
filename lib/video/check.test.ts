import { describe, expect, it } from "vitest"
import { lengthTolerance, writtenProblems } from "./check"
import {
  defaultSettings,
  planFor,
  type Plan,
  type VideoFacts,
} from "./settings"

const source: VideoFacts = {
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
    bitrate: 800_000,
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
const copy = planFor(source, defaultSettings, () => true)
const encode: Plan = planFor(
  source,
  { ...defaultSettings, format: "webm", frameRate: 24 },
  () => true
)
const ok = { picture: true, sound: true }
const expected = { duration: 10, frameRate: 30 }

describe("holding a written file to its plan", () => {
  it("finds nothing wrong with a file as planned", () => {
    expect(writtenProblems(copy, source, expected, ok)).toEqual([])
    const webm: VideoFacts = {
      ...source,
      container: "webm",
      video: { ...source.video!, codec: "vp9", frameRate: 24 },
      audio: { ...source.audio!, codec: "opus" },
    }
    expect(writtenProblems(encode, webm, expected, ok)).toEqual([])
    // Some writers mark an MP4 with QuickTime's brand.
    expect(
      writtenProblems(copy, { ...source, container: "mov" }, expected, ok)
    ).toEqual([])
  })

  it("names every way a result can differ", () => {
    const wrong: VideoFacts = {
      ...source,
      container: "mkv",
      duration: 9,
      video: { ...source.video!, codec: "av1", width: 640, frameRate: 30 },
      audio: { ...source.audio!, codec: "aac" },
    }
    expect(
      writtenProblems(encode, wrong, expected, {
        picture: false,
        sound: false,
      })
    ).toEqual([
      "The file written is not a WebM.",
      "The picture was written as AV1, not VP9.",
      "The picture is 640 × 720, not 1280 × 720.",
      "The picture has 30 frames a second, not 24.",
      "The picture written could not be played back.",
      "The sound was written as AAC, not Opus.",
      "The sound written could not be played back.",
      "The file written is 9 s long, not 10 s.",
    ])
    expect(
      writtenProblems(
        encode,
        {
          ...wrong,
          container: "webm",
          video: { ...wrong.video!, codec: null },
        },
        expected,
        ok
      )
    ).toContain("The picture was written as an unknown codec, not VP9.")
  })

  it("notices a picture or sound missing, or there when it should not be", () => {
    expect(
      writtenProblems(
        copy,
        { ...source, video: null, audio: null },
        expected,
        ok
      )
    ).toEqual([
      "The file written has no picture.",
      "The file written has no sound.",
    ])
    const nothing: Plan = {
      ...copy,
      video: { action: "none" },
      audio: { action: "drop" },
    }
    expect(writtenProblems(nothing, source, expected, ok)).toEqual([
      "The file written has a picture it should not.",
      "The file written has sound it should not.",
    ])
    expect(
      writtenProblems(
        { ...nothing, audio: { action: "none" } },
        { ...source, video: null, audio: null },
        expected,
        { picture: null, sound: null }
      )
    ).toEqual([])
  })

  it("holds a result to its size limit", () => {
    const limited: Plan = {
      ...encode,
      video: {
        ...(encode.video as Extract<Plan["video"], { action: "encode" }>),
        target: 1024 * 1024,
      },
    }
    const webm: VideoFacts = {
      ...source,
      container: "webm",
      size: 1.5 * 1024 * 1024,
      video: { ...source.video!, codec: "vp9", frameRate: 24 },
      audio: { ...source.audio!, codec: "opus" },
    }
    expect(writtenProblems(limited, webm, expected, ok)).toEqual([
      "The file written is 1.5 MB, over the limit of 1 MB.",
    ])
    expect(
      writtenProblems(limited, { ...webm, size: 1024 * 1024 }, expected, ok)
    ).toEqual([])
  })

  it("allows the length two and a half frames, or 0.15 s at least", () => {
    expect(lengthTolerance(30)).toBeCloseTo(0.15)
    expect(lengthTolerance(10)).toBe(0.25)
    expect(lengthTolerance(null)).toBeCloseTo(0.15)
    expect(
      writtenProblems(copy, { ...source, duration: 10.14 }, expected, ok)
    ).toEqual([])
    expect(
      writtenProblems(copy, { ...source, duration: 10.2 }, expected, ok)
    ).toEqual(["The file written is 10.2 s long, not 10 s."])
  })
})
