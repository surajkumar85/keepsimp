import { describe, expect, it } from "vitest"
import {
  itemState,
  nextJob,
  queueReducer,
  queueTotals,
  releasedUrls,
  type QueueAction,
  type QueueItem,
  type QueueOutput,
} from "./queue"

const file = (name: string, size = 1000) => {
  const value = new File(["x"], name)
  Object.defineProperty(value, "size", { value: size })
  return value
}
const output = (url: string, size = 100): QueueOutput => ({
  blob: new Blob([new Uint8Array(size)]),
  url,
  format: "jpeg",
  width: 10,
  height: 10,
  similarity: 1,
})
const run = (actions: QueueAction[], start: QueueItem[] = []) =>
  actions.reduce(queueReducer, start)
const opened = (id: string): QueueAction => ({
  type: "opened",
  id,
  format: "jpeg",
  animated: false,
  size: { width: 100, height: 50 },
  transparent: false,
})
const add = (...ids: string[]): QueueAction => ({
  type: "add",
  items: ids.map((id) => ({ id, file: file(`${id}.jpg`) })),
})

describe("queue reducer", () => {
  it("adds, opens and finishes images", () => {
    const items = run([
      add("a", "b"),
      opened("a"),
      {
        type: "done",
        id: "a",
        key: "k1",
        outputs: [output("u1")],
        usedFocus: { x: 0, y: 1 },
      },
    ])
    expect(items.map((item) => item.status)).toEqual(["ready", "reading"])
    expect(items[0]).toMatchObject({
      size: { width: 100, height: 50 },
      resultKey: "k1",
      usedFocus: { x: 0, y: 1 },
    })
    expect(itemState(items[0], "k1")).toBe("done")
    expect(itemState(items[0], "k2")).toBe("waiting")
    expect(itemState(items[0], null)).toBe("waiting")
    expect(itemState(items[1], null)).toBe("reading")
  })

  it("records read and job failures separately", () => {
    const items = run([
      add("a", "b"),
      { type: "failed", id: "a", message: "Unreadable" },
      opened("b"),
      {
        type: "done",
        id: "b",
        key: "k1",
        outputs: [output("u1")],
        usedFocus: { x: 0, y: 0 },
      },
      { type: "job-failed", id: "b", key: "k2", message: "Too large" },
    ])
    expect(itemState(items[0], null)).toBe("error")
    expect(items[0].error).toBe("Unreadable")
    expect(itemState(items[1], "k2")).toBe("failed")
    expect(items[1]).toMatchObject({
      jobError: "Too large",
      outputs: undefined,
    })
    const recovered = queueReducer(items, {
      type: "done",
      id: "b",
      key: "k3",
      outputs: [output("u2")],
      usedFocus: { x: 0, y: 0 },
    })
    expect(itemState(recovered[1], "k3")).toBe("done")
    expect(recovered[1].jobError).toBeUndefined()
  })

  it("sets, resets and clears focus overrides", () => {
    const items = run([
      add("a", "b"),
      { type: "focus", id: "a", focus: { x: 0.1, y: 0.2 } },
    ])
    expect(items[0].focus).toEqual({ x: 0.1, y: 0.2 })
    const reset = queueReducer(items, { type: "reset-focus" })
    expect(reset[0].focus).toBeUndefined()
    expect(reset[1]).toBe(items[1])
    expect(
      queueReducer(items, { type: "focus", id: "a", focus: undefined })[0].focus
    ).toBeUndefined()
  })

  it("removes and clears, reporting URLs to release", () => {
    const items = run([
      add("a", "b"),
      opened("a"),
      opened("b"),
      {
        type: "done",
        id: "a",
        key: "k",
        outputs: [output("u1"), output("u2")],
        usedFocus: { x: 0, y: 0 },
      },
      {
        type: "done",
        id: "b",
        key: "k",
        outputs: [output("u3")],
        usedFocus: { x: 0, y: 0 },
      },
    ])
    const removed = queueReducer(items, { type: "remove", id: "a" })
    expect(removed.map((item) => item.id)).toEqual(["b"])
    expect(releasedUrls(items, removed)).toEqual(["u1", "u2"])
    const replaced = queueReducer(items, {
      type: "done",
      id: "b",
      key: "k2",
      outputs: [output("u4")],
      usedFocus: { x: 0, y: 0 },
    })
    expect(releasedUrls(items, replaced)).toEqual(["u3"])
    expect(queueReducer(items, { type: "clear" })).toEqual([])
    expect(releasedUrls(items, [])).toEqual(["u1", "u2", "u3"])
    const unfinished = run([add("z")])
    expect(releasedUrls(unfinished, unfinished)).toEqual([])
    expect(releasedUrls([...items, ...unfinished], unfinished)).toEqual([
      "u1",
      "u2",
      "u3",
    ])
  })
})

describe("totals and scheduling", () => {
  const items = run([
    add("a", "b", "c", "d"),
    opened("a"),
    opened("b"),
    { type: "failed", id: "c", message: "bad" },
    {
      type: "done",
      id: "a",
      key: "k",
      outputs: [output("u1", 300), output("u2", 200)],
      usedFocus: { x: 0, y: 0 },
    },
  ])
  const keyOf = (item: QueueItem) => (item.status === "ready" ? "k" : null)

  it("sums finished work and knows when the batch has settled", () => {
    expect(queueTotals(items, keyOf)).toEqual({
      images: 4,
      done: 1,
      pending: 2,
      files: 2,
      originalBytes: 1000,
      outputBytes: 500,
      settled: false,
    })
    const finished = run(
      [
        {
          type: "done",
          id: "b",
          key: "k",
          outputs: [output("u3")],
          usedFocus: { x: 0, y: 0 },
        },
        { type: "remove", id: "d" },
      ],
      items
    )
    expect(queueTotals(finished, keyOf)).toMatchObject({
      done: 2,
      pending: 0,
      settled: true,
    })
    expect(queueTotals([], keyOf).settled).toBe(false)
    expect(
      queueTotals(
        run([add("x"), { type: "failed", id: "x", message: "bad" }]),
        keyOf
      ).settled
    ).toBe(false)
  })

  it("hands out the selected image first, then a cached one, then queue order", () => {
    const idle = new Set<string>()
    expect(nextJob(items, keyOf, idle, "d", "b")?.id).toBe("d")
    expect(nextJob(items, keyOf, idle, "a", "b")?.id).toBe("b")
    expect(nextJob(items, keyOf, idle, null, null)?.id).toBe("b")
    expect(nextJob(items, keyOf, new Set(["b"]), null, null)?.id).toBe("d")
    expect(nextJob(items, keyOf, new Set(["b", "d"]), null, null)).toBeNull()
    expect(nextJob(items, () => null, new Set(["d"]), null, null)).toBeNull()
  })
})
