import { describe, expect, it } from "vitest"
import { joinName, joinPlan, joinProblems, moved, type JoinPiece } from "./join"
import type { VideoFacts } from "./settings"

const facts: VideoFacts = {
  container: "mp4",
  size: 1_000_000,
  duration: 4,
  video: {
    codec: "avc",
    width: 1280,
    height: 720,
    rotation: 0,
    flip: false,
    frameRate: 30,
    variableRate: false,
    bitrate: 3_000_000,
    hdr: false,
    decodable: true,
  },
  audio: {
    codec: "aac",
    sampleRate: 44100,
    channels: 2,
    bitrate: 128_000,
    decodable: true,
  },
}
const piece = (name: string, change: Partial<VideoFacts> = {}): JoinPiece => ({
  name,
  facts: { ...facts, ...change },
})
const sized = (width: number, height: number) => ({
  video: { ...facts.video!, width, height },
})

describe("joining videos", () => {
  it("copies pictures written alike, and writes the sound anew", () => {
    const plan = joinPlan([piece("a.mp4"), piece("b.mp4", { duration: 2.5 })])
    expect(plan).toMatchObject({
      container: "mp4",
      width: 1280,
      height: 720,
      frameRate: 30,
      copyable: true,
      bitrate: 3_000_000,
      sound: { codec: "aac", bitrate: 160_000, sampleRate: 44100, channels: 2 },
      length: 6.5,
      problem: null,
    })
    expect(plan.codecs[0]).toBe("avc")
    expect(plan.notes).toEqual([
      "2 videos joined in order, 0:06.50 in all, as MP4.",
      "The pictures are copied as they are, without encoding them again, where every one was written alike (H.264, 1280 × 720); otherwise they are encoded again at that size.",
      "The sound is written again in one piece, each video's sound for exactly as long as its picture.",
    ])
  })

  it("encodes pictures of other sizes or codecs at the first's size", () => {
    const plan = joinPlan([piece("a.mp4"), piece("b.mp4", sized(720, 1280))])
    expect(plan.copyable).toBe(false)
    expect(plan.notes[1]).toBe(
      "The pictures are encoded again at 1280 × 720, the first video's size; others are fitted inside it with black bars."
    )
    expect(
      joinPlan([
        piece("a.mp4"),
        piece("b.mp4", { video: { ...facts.video!, codec: "hevc" } }),
      ]).copyable
    ).toBe(false)
    // A picture whose bitrate is not known gets YouTube's high bitrate for its size.
    expect(
      joinPlan([
        piece("a.mp4", { video: { ...facts.video!, bitrate: null } }),
        piece("b.mp4", { video: { ...facts.video!, bitrate: null } }),
      ]).bitrate
    ).toBe(5_000_000)
  })

  it("says what is silent, what kind it becomes, and Opus for WebM", () => {
    const plan = joinPlan([
      piece("a.webm", { container: "webm", audio: null }),
      piece("b.mkv", { container: "mkv" }),
    ])
    expect(plan.container).toBe("webm")
    expect(plan.sound).toEqual({
      codec: "opus",
      bitrate: 128_000,
      sampleRate: 48000,
      channels: 2,
    })
    expect(plan.notes).toContain(
      "The sound is written again in one piece, each video's sound for exactly as long as its picture, silent where a video has none."
    )
    expect(plan.notes).toContain(
      "They are of different kinds (WebM, MKV); the joined file is WebM, as the first is."
    )
    expect(
      joinPlan([
        piece("a.mp4", { audio: null }),
        piece("b.mp4", { audio: null }),
      ]).sound
    ).toBeNull()
  })

  it("asks for two videos with pictures", () => {
    expect(joinPlan([piece("a.mp4")]).problem).toBe(
      "Choose at least two videos to join."
    )
    expect(
      joinPlan([piece("a.mp4"), piece("song.mp4", { video: null })]).problem
    ).toBe("song.mp4 has no picture to join.")
    expect(
      joinPlan([piece("song.mp4", { video: null }), piece("a.mp4")])
    ).toMatchObject({ width: 0, height: 0, frameRate: null, copyable: false })
  })

  it("is named after the first, and moves a video a place", () => {
    expect(joinName([piece("holiday.mov")], "mp4")).toBe("holiday-joined.mp4")
    expect(joinName([piece("clip")], "webm")).toBe("clip-joined.webm")
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"])
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"])
    const list = ["a", "b"]
    expect(moved(list, 0, -1)).toBe(list)
    expect(moved(list, 1, 1)).toBe(list)
  })
})

describe("a joined file, opened again", () => {
  const plan = joinPlan([piece("a.mp4"), piece("b.mp4")])
  const fine = { picture: true, sound: true }
  it("holds its size, sound and length", () => {
    expect(joinProblems(plan, 2, { ...facts, duration: 8 }, fine)).toEqual([])
    expect(
      joinProblems(
        plan,
        2,
        { ...facts, ...sized(640, 360), audio: null, duration: 7 },
        { picture: false, sound: null }
      )
    ).toEqual([
      "The picture is 640 × 360, not 1280 × 720.",
      "The picture written could not be played back.",
      "The file written has no sound.",
      "The file written is 7.00 s long, not 8.00 s.",
    ])
    expect(
      joinProblems(
        plan,
        2,
        { ...facts, video: null, duration: 8 },
        {
          picture: null,
          sound: false,
        }
      )
    ).toEqual([
      "The file written has no picture.",
      "The sound written could not be played back.",
    ])
    const silent = joinPlan([
      piece("a.mp4", { audio: null }),
      piece("b.mp4", { audio: null }),
    ])
    expect(joinProblems(silent, 2, { ...facts, duration: 8 }, fine)).toEqual([
      "The file written has sound it should not.",
    ])
  })
})
