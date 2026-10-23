import { describe, expect, it } from "vitest"
import {
  cutOf,
  partName,
  splitItem,
  splitParts,
  trimmed,
  undone,
  factsLine,
  itemMessage,
  itemState,
  nextVideoJob,
  outputName,
  planKey,
  videoTotals,
  writable,
  dropped,
  type VideoItem,
} from "./queue"
import {
  defaultSettings,
  planFor,
  type Plan,
  type VideoFacts,
} from "./settings"

const facts: VideoFacts = {
  container: "mp4",
  size: 2_000_000,
  duration: 83.4,
  video: {
    codec: "avc",
    width: 1920,
    height: 1080,
    rotation: 0,
    flip: false,
    frameRate: 29.97,
    variableRate: false,
    bitrate: 4_000_000,
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
const plan = planFor(facts, defaultSettings, () => true)
const file = (name: string, size = 10) => new File([new Uint8Array(size)], name)
const item = (change: Partial<VideoItem> = {}): VideoItem => ({
  id: "a",
  file: file("holiday.mp4", 2_000_000),
  name: "holiday.mp4",
  container: "mp4",
  status: "ready",
  facts,
  poster: null,
  message: null,
  trim: null,
  trimApplied: null,
  part: null,
  progress: null,
  result: null,
  ...change,
})
const result = (change: Partial<NonNullable<VideoItem["result"]>> = {}) => ({
  key: planKey(plan),
  file: new Blob([new Uint8Array(500_000)]),
  url: null,
  downloadUrl: null,
  scratch: null,
  written: facts,
  problems: [],
  index: "front" as const,
  passes: 1,
  resized: null,
  looks: null,
  error: null,
  ...change,
})

describe("where a file stands", () => {
  it("names a plan by what it does, not by its words", () => {
    expect(planKey({ ...plan, notes: ["other words"], estimate: 1 })).toBe(
      planKey(plan)
    )
    expect(planKey({ ...plan, container: "mkv" })).not.toBe(planKey(plan))
    expect(writable(plan)).toBe(plan)
    expect(writable(null)).toBeNull()
    expect(writable({ ...plan, problem: "No." })).toBeNull()
    expect(
      writable({ ...plan, pending: [{ codec: "avc", width: 2, height: 2 }] })
    ).toBeNull()
  })

  it("follows a file from reading to done", () => {
    expect(itemState(item({ status: "reading" }), null)).toBe("reading")
    expect(itemMessage(item({ status: "reading" }), null)).toBeNull()
    expect(itemState(item({ status: "error", message: "No." }), null)).toBe(
      "error"
    )
    expect(itemMessage(item({ status: "error", message: "No." }), null)).toBe(
      "No."
    )
    expect(itemState(item(), plan)).toBe("waiting")
    expect(itemMessage(item(), plan)).toBe("Waiting…")
    const writing = item({
      progress: { key: planKey(plan), fraction: 0.426 },
    })
    expect(itemMessage(writing, plan)).toBe("Writing… 43%")
    expect(
      itemMessage(
        item({ progress: { key: planKey(plan), fraction: 0.5, pass: 2 } }),
        plan
      )
    ).toBe("Writing… 50%, pass 2 of 3")
    expect(
      itemMessage(item({ progress: { key: "old", fraction: 0.9 } }), plan)
    ).toBe("Waiting…")
    const done = item({ result: result() })
    expect(itemState(done, plan)).toBe("done")
    expect(itemMessage(done, plan)).toBeNull()
  })

  it("says why a file cannot be written, or is waiting on the browser", () => {
    const refused = { ...plan, problem: "This browser cannot write it." }
    expect(itemState(item(), refused)).toBe("failed")
    expect(itemMessage(item(), refused)).toBe("This browser cannot write it.")
    const asking = {
      ...plan,
      pending: [{ codec: "av1" as const, width: 2, height: 2 }],
    }
    expect(itemState(item(), asking)).toBe("waiting")
    expect(itemMessage(item(), asking)).toBe(
      "Checking what this browser can write…"
    )
    expect(itemState(item(), null)).toBe("waiting")
  })

  it("marks a result that failed, or did not hold, and keeps an old one out of date", () => {
    const failed = item({ result: result({ error: "Could not write." }) })
    expect(itemState(failed, plan)).toBe("failed")
    expect(itemMessage(failed, plan)).toBe("Could not write.")
    const off = item({
      result: result({
        problems: ["The picture is 640 × 360, not 1920 × 1080."],
      }),
    })
    expect(itemState(off, plan)).toBe("failed")
    expect(itemMessage(off, plan)).toBe(
      "Written, but the picture is 640 × 360, not 1920 × 1080."
    )
    expect(itemState(item({ result: result({ key: "old" }) }), plan)).toBe(
      "waiting"
    )
  })
})

describe("the next job", () => {
  const planOf = () => plan
  it("reads files first, then writes the selected one, then the rest", () => {
    const unread = item({ id: "b", status: "reading", facts: null })
    const first = item({ id: "c" })
    const chosen = item({ id: "d" })
    expect(
      nextVideoJob([first, unread, chosen], planOf, new Set(), "d")
    ).toMatchObject({ item: { id: "b" }, job: "read", plan: null })
    expect(nextVideoJob([first, chosen], planOf, new Set(), "d")).toMatchObject(
      { item: { id: "d" }, job: "convert", plan }
    )
    expect(
      nextVideoJob([first, chosen], planOf, new Set(), null)
    ).toMatchObject({ item: { id: "c" }, job: "convert" })
  })

  it("leaves files being worked on, done, refused or broken", () => {
    const busy = item({ id: "b" })
    const done = item({ id: "c", result: result() })
    const broken = item({ id: "d", status: "error" })
    expect(
      nextVideoJob([busy, done, broken], planOf, new Set(["b"]), null)
    ).toBeNull()
    expect(
      nextVideoJob(
        [item()],
        () => ({ ...plan, problem: "No." }),
        new Set(),
        null
      )
    ).toBeNull()
  })
})

describe("words and names", () => {
  it("describes a file in one line", () => {
    expect(factsLine(facts)).toBe(
      "MP4 · H.264 · 1920 × 1080 · 29.97 fps · 1:23"
    )
    expect(
      factsLine({
        ...facts,
        duration: 3723,
        video: {
          ...facts.video!,
          codec: null,
          frameRate: 30,
          variableRate: true,
        },
      })
    ).toBe("MP4 · video · 1920 × 1080 · 30 fps (varies) · 1:02:03")
    expect(
      factsLine({ ...facts, video: { ...facts.video!, frameRate: null } })
    ).toBe("MP4 · H.264 · 1920 × 1080 · 1:23")
    expect(factsLine({ ...facts, container: "webm", video: null })).toBe(
      "WebM · sound only · 1:23"
    )
  })

  it("names a result after its file, marking one of the same kind", () => {
    const webm: Plan = { ...plan, container: "webm" }
    expect(outputName("holiday.mov", plan)).toBe("holiday.mp4")
    expect(outputName("holiday.MP4", plan)).toBe("holiday-converted.mp4")
    expect(outputName("holiday.mp4", webm)).toBe("holiday.webm")
    expect(outputName("clip", plan)).toBe("clip.mp4")
    expect(
      outputName("holiday.mp4", { ...plan, cut: { mode: "copy", parts: [] } })
    ).toBe("holiday-trimmed.mp4")
    expect(outputName(".hidden", plan)).toBe(".hidden.mp4")
  })

  it("adds up what is done for the summary", () => {
    const totals = videoTotals(
      [
        item({ id: "a", result: result() }),
        item({ id: "b" }),
        item({ id: "c", result: result({ error: "No." }) }),
        item({ id: "d", result: result({ file: null }) }),
      ],
      () => plan
    )
    expect(totals).toEqual({
      images: 4,
      done: 1,
      pending: 1,
      files: 1,
      originalBytes: 2_000_000,
      outputBytes: 500_000,
      settled: false,
    })
    expect(videoTotals([], () => plan).settled).toBe(true)
  })
})

describe("letting go", () => {
  it("names the links and stored files no file holds any more", () => {
    const old = item({
      id: "a",
      result: result({
        url: "blob:a",
        downloadUrl: "blob:a2",
        scratch: "a-1.mp4",
      }),
    })
    const replaced = item({
      id: "a",
      result: result({
        url: "blob:b",
        downloadUrl: "blob:b2",
        scratch: "a-2.mp4",
      }),
    })
    const other = item({
      id: "c",
      result: result({ url: "blob:c", downloadUrl: "blob:c2", scratch: null }),
    })
    expect(dropped([old, other], [replaced, other])).toEqual({
      urls: ["blob:a", "blob:a2"],
      scratch: ["a-1.mp4"],
    })
    expect(dropped([replaced, other], [])).toEqual({
      urls: ["blob:b", "blob:b2", "blob:c", "blob:c2"],
      scratch: ["a-2.mp4"],
    })
    expect(dropped([item()], [item()])).toEqual({ urls: [], scratch: [] })
  })
})

describe("the trim's edits", () => {
  const all = [{ start: 0, end: 10 }]
  it("are kept with what came before, to undo and do again", () => {
    expect(cutOf(null)).toBeNull()
    const first = trimmed(null, [{ start: 2, end: 8 }], all)
    expect(first).toEqual({
      parts: [{ start: 2, end: 8 }],
      exact: false,
      undo: [all],
      redo: [],
    })
    const second = trimmed(
      { ...first, exact: true },
      [{ start: 3, end: 8 }],
      all
    )
    expect(cutOf(second)).toEqual({
      parts: [{ start: 3, end: 8 }],
      exact: true,
    })
    const back = undone(second, true)
    expect(back.parts).toEqual([{ start: 2, end: 8 }])
    expect(back.redo).toEqual([[{ start: 3, end: 8 }]])
    const again = undone(back, false)
    expect(again).toEqual({ ...second, redo: [] })
    expect(undone(again, false)).toBe(again)
    // A new edit after an undo drops what could be done again.
    expect(trimmed(back, [{ start: 4, end: 5 }], all).redo).toEqual([])
  })
})

describe("splitting into files", () => {
  it("names each part, and does not call a part converted", () => {
    expect(partName("holiday.mp4", 2)).toBe("holiday-part-2.mp4")
    expect(partName("clip", 1)).toBe("clip-part-1")
    expect(outputName("holiday-part-2.mp4", plan, true)).toBe(
      "holiday-part-2.mp4"
    )
  })

  it("keeps what each piece holds of what is kept, and drops empty pieces", () => {
    expect(splitParts(null, [4, 8], 12)).toEqual([
      [{ start: 0, end: 4 }],
      [{ start: 4, end: 8 }],
      [{ start: 8, end: 12 }],
    ])
    expect(
      splitParts(
        [
          { start: 1, end: 3 },
          { start: 9, end: 11 },
        ],
        [4, 8],
        12
      )
    ).toEqual([[{ start: 1, end: 3 }], [{ start: 9, end: 11 }]])
  })

  it("turns a file into files of its own, each with its piece, ready to write", () => {
    let next = 0
    const made = splitItem(
      item({
        trim: {
          parts: [{ start: 0, end: 6 }],
          exact: true,
          undo: [[]],
          redo: [],
        },
      }),
      [2],
      () => `p${++next}`
    )!
    expect(made.map((one) => [one.id, one.name, one.part])).toEqual([
      ["p1", "holiday-part-1.mp4", 1],
      ["p2", "holiday-part-2.mp4", 2],
    ])
    expect(made[1].trim).toEqual({
      parts: [{ start: 2, end: 6 }],
      exact: true,
      undo: [],
      redo: [],
    })
    expect(made[1].trimApplied).toBe(made[1].trim)
    expect(made[0].result).toBeNull()
    // A whole file splits into pieces copied at keyframes.
    expect(splitItem(item(), [40], () => "w")!.map((one) => one.trim)).toEqual([
      { parts: [{ start: 0, end: 40 }], exact: false, undo: [], redo: [] },
      { parts: [{ start: 40, end: 83.4 }], exact: false, undo: [], redo: [] },
    ])
    // Nothing to split: one piece, or a file not yet read.
    expect(splitItem(item(), [], () => "x")).toBeNull()
    expect(splitItem(item({ facts: null }), [2], () => "x")).toBeNull()
  })
})
