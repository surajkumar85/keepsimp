import { describe, expect, it } from "vitest"
import { defaultSettings, processingKey } from "@/lib/animation/settings"
import { defaultGif, gifJob, gifName, gifSaid, gifSettings } from "./gif"

describe("a GIF from a video", () => {
  it("is the animation converter's own settings, at a size and frame rate", () => {
    expect(gifSettings(defaultGif)).toEqual({
      ...defaultSettings,
      target: "gif",
      fps: 15,
      resize: "longEdge",
      resizeValue: 480,
      enlarge: false,
    })
    expect(gifSettings({ target: "webp", side: null, fps: 10 })).toMatchObject({
      target: "webp",
      fps: 10,
      resize: "original",
    })
  })

  it("is asked of the animation worker for the whole of the video's result", () => {
    const file = new Blob(["video"])
    const job = gifJob("gif-1", file, defaultGif)
    expect(job).toEqual({
      id: "gif-1",
      input: { kind: "file", file },
      settings: gifSettings(defaultGif),
      trim: { start: 0, end: null },
      key: processingKey(gifSettings(defaultGif), { start: 0, end: null }),
      inputKey: "gif-1",
      describe: false,
      overlay: null,
    })
  })

  it("is named after the video and said in a line", () => {
    expect(gifName("holiday-trimmed.mp4", "gif")).toBe("holiday-trimmed.gif")
    expect(gifName("clip", "apng")).toBe("clip.png")
    expect(gifName("clip.webm", "webp")).toBe("clip.webp")
    const output = {
      target: "gif" as const,
      bytes: new ArrayBuffer(0),
      width: 480,
      height: 270,
      frames: 90,
      duration: 6000,
      plays: 0,
      note: null,
    }
    expect(gifSaid(output, 1_500_000)).toBe(
      "GIF · 480 × 270 · 15 frames a second · 0:06.00 · 1.4 MB"
    )
    expect(gifSaid({ ...output, target: "mp4", duration: 0 }, 900)).toBe(
      "mp4 · 480 × 270 · 0 frames a second · 0:00.00 · 1 KB"
    )
  })
})
