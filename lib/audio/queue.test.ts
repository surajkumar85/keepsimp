import { describe, expect, it } from "vitest"
import type { ReadFacts } from "./mediabunny-audio"
import {
  audioReducer,
  audioState,
  audioTotals,
  droppedUrls,
  itemKey,
  nextAudioJob,
  stepsOf,
  type AudioItem,
  type AudioResult,
} from "./queue"

const file = (name: string, size = 100) =>
  new File([new Uint8Array(size)], name)
const facts = (decodable = true): ReadFacts => ({
  container: "mp3",
  codec: "mp3",
  sampleRate: 44100,
  channels: 2,
  duration: 1,
  hasVideo: false,
  tags: {},
  cover: null,
  decodable,
  kept: null,
})
const result = (url: string, size = 40): AudioResult => ({
  blob: new Blob([new Uint8Array(size)]),
  url,
  downloadUrl: url.endsWith("r") ? `${url}-download` : url,
  name: "a.mp3",
  plan: {
    format: "mp3",
    codec: "mp3",
    copy: false,
    bitrate: 192000,
    sampleRate: 44100,
    channels: 2,
    sampleFormat: null,
    notes: [],
  },
  heard: null,
  problems: [],
})
const added = () =>
  audioReducer([], {
    type: "add",
    items: [
      { id: "a", file: file("a.mp3") },
      { id: "b", file: file("b.flac") },
    ],
  })

describe("audioReducer", () => {
  it("reads files, then readies those that can be decoded", () => {
    let items = added()
    expect(items.map((item) => item.status)).toEqual(["reading", "reading"])
    items = audioReducer(items, { type: "facts", id: "a", facts: facts() })
    items = audioReducer(items, {
      type: "facts",
      id: "b",
      facts: facts(false),
    })
    // One the worker cannot decode waits for the page to decode it.
    expect(items.map((item) => item.status)).toEqual(["ready", "reading"])
    const decoded = new Blob(["wav"])
    items = audioReducer(items, { type: "decoded", id: "b", decoded })
    expect(items[1]).toMatchObject({ status: "ready", decoded })
    // Decoded before its facts came, it stays reading.
    const early = audioReducer(added(), { type: "decoded", id: "a", decoded })
    expect(early[0].status).toBe("reading")
    items = audioReducer(items, {
      type: "peaks",
      id: "a",
      peaks: { min: new Float32Array(1), max: new Float32Array(1) },
    })
    expect(items[0].peaks?.min.length).toBe(1)
  })

  it("keeps results with their settings, failures with theirs, and progress until then", () => {
    let items = audioReducer(added(), {
      type: "facts",
      id: "a",
      facts: facts(),
    })
    items = audioReducer(items, { type: "progress", id: "a", fraction: 0.5 })
    expect(items[0].progress).toBe(0.5)
    items = audioReducer(items, {
      type: "done",
      id: "a",
      key: "k1",
      result: result("blob:1"),
    })
    expect(items[0]).toMatchObject({ resultKey: "k1", progress: undefined })
    expect(audioState(items[0], "k1")).toBe("done")
    expect(audioState(items[0], "k2")).toBe("waiting")
    expect(audioState(items[0], null)).toBe("waiting")
    items = audioReducer(items, {
      type: "job-failed",
      id: "a",
      key: "k2",
      message: "No.",
    })
    expect(items[0]).toMatchObject({ jobError: "No.", result: undefined })
    expect(audioState(items[0], "k2")).toBe("failed")
    items = audioReducer(items, { type: "failed", id: "b", message: "Bad." })
    expect(audioState(items[1], "k2")).toBe("error")
    expect(audioReducer(items, { type: "remove", id: "a" })).toHaveLength(1)
    expect(audioReducer(items, { type: "clear" })).toEqual([])
  })
})

describe("edits", () => {
  it("keeps each file's changes, undoes and redoes them whole, and keys its result by them", () => {
    let items = audioReducer(added(), {
      type: "facts",
      id: "a",
      facts: facts(),
    })
    const cut = { do: "cut", from: 1, to: 2 } as const
    const keep = { do: "keep", from: 0, to: 1 } as const
    const fade = {
      do: "fade",
      from: 0,
      to: 1,
      direction: "in",
      curve: "linear",
    } as const
    const plain = itemKey("s", items[0])
    items = audioReducer(items, { type: "change", id: "a", steps: [cut] })
    items = audioReducer(items, {
      type: "change",
      id: "a",
      steps: [keep, fade],
    })
    expect(stepsOf(items[0])).toEqual([cut, keep, fade])
    expect(stepsOf(items[1])).toEqual([])
    expect(itemKey("s", items[0])).not.toBe(plain)
    expect(itemKey("s", items[1])).toBe(plain)
    expect(itemKey(null, items[0])).toBeNull()
    // Two steps made as one change are undone as one.
    items = audioReducer(items, { type: "undo", id: "a" })
    expect(items[0]).toMatchObject({ changes: [[cut]], redo: [[keep, fade]] })
    items = audioReducer(items, { type: "redo", id: "a" })
    expect(stepsOf(items[0])).toEqual([cut, keep, fade])
    expect(items[0].redo).toEqual([])
    // Nothing to redo or undo: the file stays as it is.
    expect(audioReducer(items, { type: "redo", id: "a" })[0]).toBe(items[0])
    items = audioReducer(items, { type: "undo", id: "a" })
    // A new change forgets what was undone.
    items = audioReducer(items, { type: "change", id: "a", steps: [fade] })
    expect(items[0].redo).toEqual([])
    items = audioReducer(items, { type: "reset", id: "a" })
    expect(items[0]).toMatchObject({ changes: [], redo: [] })
    expect(itemKey("s", items[0])).toBe(plain)
    expect(audioReducer(items, { type: "undo", id: "a" })[0]).toBe(items[0])
    expect(audioReducer(items, { type: "undo", id: "b" })[1]).toBe(items[1])
    expect(audioReducer(items, { type: "redo", id: "b" })[1]).toBe(items[1])
    // Lists that were never made count as empty.
    const bare: AudioItem = { id: "c", file: file("c"), status: "ready" }
    expect(
      audioReducer([{ ...bare, changes: [[cut]] }], {
        type: "undo",
        id: "c",
      })[0]
    ).toMatchObject({ changes: [], redo: [[cut]] })
    expect(
      audioReducer([{ ...bare, redo: [[cut]] }], { type: "redo", id: "c" })[0]
    ).toMatchObject({ changes: [[cut]], redo: [] })
  })
})

describe("droppedUrls", () => {
  it("names the results a step let go of", () => {
    const before: AudioItem[] = [
      { id: "a", file: file("a"), status: "ready", result: result("blob:1r") },
      { id: "b", file: file("b"), status: "ready", result: result("blob:2") },
      { id: "c", file: file("c"), status: "reading" },
    ]
    const after = audioReducer(before, { type: "remove", id: "a" })
    expect(droppedUrls(before, after)).toEqual(["blob:1r", "blob:1r-download"])
  })
})

describe("nextAudioJob", () => {
  const ready = (id: string, resultKey?: string): AudioItem => ({
    id,
    file: file(id),
    status: "ready",
    facts: facts(),
    resultKey,
  })

  it("reads new files first, then writes the selected one, then the first waiting", () => {
    const unread: AudioItem = { id: "n", file: file("n"), status: "reading" }
    const items = [ready("a"), ready("b"), unread]
    expect(nextAudioJob(items, () => "k", new Set(), "b")).toMatchObject({
      item: { id: "n" },
      job: "read",
    })
    expect(nextAudioJob(items, () => "k", new Set(["n"]), "b")).toMatchObject({
      item: { id: "b" },
      job: "convert",
    })
    expect(nextAudioJob(items, () => "k", new Set(["n"]), null)).toMatchObject({
      item: { id: "a" },
    })
  })

  it("skips files in flight, written ones, and everything when settings cannot be used", () => {
    const items = [ready("a", "k"), ready("b")]
    expect(nextAudioJob(items, () => "k", new Set(["b"]), null)).toBeNull()
    expect(nextAudioJob(items, () => null, new Set(), null)).toBeNull()
    // Read but waiting for the page to decode it: nothing to do yet.
    const waiting: AudioItem = {
      id: "w",
      file: file("w"),
      status: "reading",
      facts: facts(false),
    }
    expect(nextAudioJob([waiting], () => "k", new Set(), null)).toBeNull()
  })
})

describe("audioTotals", () => {
  it("counts what is done and what waits", () => {
    const items: AudioItem[] = [
      {
        id: "a",
        file: file("a", 100),
        status: "ready",
        facts: facts(),
        resultKey: "k",
        result: result("blob:1", 40),
      },
      { id: "b", file: file("b"), status: "reading" },
      { id: "c", file: file("c"), status: "error" },
    ]
    expect(audioTotals(items, () => "k")).toEqual({
      images: 3,
      done: 1,
      pending: 1,
      files: 1,
      originalBytes: 100,
      outputBytes: 40,
      settled: false,
    })
    expect(audioTotals(items.slice(0, 1), () => "k").settled).toBe(true)
  })
})
