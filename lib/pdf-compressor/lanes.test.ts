import { describe, expect, it } from "vitest"
import { inLanes } from "./lanes"

/** Work that waits until it is let go, and keeps count of what runs. */
function gate() {
  const open = new Map<number, () => void>()
  const started: number[] = []
  let running = 0
  let most = 0
  const work = (item: number) =>
    new Promise<void>((resolve) => {
      started.push(item)
      running++
      most = Math.max(most, running)
      open.set(item, () => {
        running--
        resolve()
      })
    })
  return {
    work,
    started,
    most: () => most,
    release: (item: number) => open.get(item)!(),
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("inLanes", () => {
  it("finishes at once when there is nothing to do", async () => {
    await expect(
      inLanes(
        [],
        () => 3,
        () => 1,
        10,
        async () => {}
      )
    ).resolves.toBeUndefined()
  })

  it("works on one item at a time in one lane, in order", async () => {
    const order: number[] = []
    await inLanes(
      [1, 2, 3],
      () => 1,
      () => 1,
      10,
      async (item) => {
        order.push(item)
        await tick()
        order.push(-item)
      }
    )
    expect(order).toEqual([1, -1, 2, -2, 3, -3])
  })

  it("keeps to the number of lanes", async () => {
    const { work, started, most, release } = gate()
    const done = inLanes(
      [1, 2, 3, 4, 5],
      () => 2,
      () => 1,
      100,
      work
    )
    await tick()
    expect(started).toEqual([1, 2])
    release(1)
    await tick()
    expect(started).toEqual([1, 2, 3])
    for (const item of [2, 3]) release(item)
    await tick()
    expect(started).toEqual([1, 2, 3, 4, 5])
    for (const item of [4, 5]) release(item)
    await done
    expect(most()).toBe(2)
  })

  it("treats no lanes as one", async () => {
    const { work, started, release } = gate()
    const done = inLanes(
      [1, 2],
      () => 0,
      () => 1,
      100,
      work
    )
    await tick()
    expect(started).toEqual([1])
    release(1)
    await tick()
    release(2)
    await done
  })

  it("uses lanes that open up while it works", async () => {
    const { work, started, release } = gate()
    let lanes = 1
    const done = inLanes(
      [1, 2, 3, 4],
      () => lanes,
      () => 1,
      100,
      work
    )
    await tick()
    expect(started).toEqual([1])
    lanes = 3
    release(1)
    await tick()
    expect(started).toEqual([1, 2, 3, 4])
    for (const item of [2, 3, 4]) release(item)
    await done
  })

  it("stays within the room, and waits for the next in line to fit", async () => {
    const { work, started, release } = gate()
    const weights = new Map([
      [1, 6],
      [2, 6],
      [3, 2],
      [4, 2],
    ])
    const done = inLanes(
      [1, 2, 3, 4],
      () => 4,
      (item) => weights.get(item)!,
      10,
      work
    )
    await tick()
    // The second does not fit beside the first, and the third does not jump the queue.
    expect(started).toEqual([1])
    release(1)
    await tick()
    expect(started).toEqual([1, 2, 3, 4])
    for (const item of [2, 3, 4]) release(item)
    await done
  })

  it("works on an item heavier than the room, alone", async () => {
    const { work, started, release } = gate()
    const done = inLanes(
      [1, 2],
      () => 4,
      (item) => (item === 1 ? 50 : 1),
      10,
      work
    )
    await tick()
    expect(started).toEqual([1])
    release(1)
    await tick()
    expect(started).toEqual([1, 2])
    release(2)
    await done
  })

  it("stops starting after a failure, waits for the rest and passes it on", async () => {
    const { work, started, release } = gate()
    const trouble = new Error("no")
    let settled = false
    const done = inLanes(
      [1, 2, 3, 4],
      () => 2,
      () => 1,
      100,
      (item) => (item === 2 ? Promise.reject(trouble) : work(item))
    ).finally(() => {
      settled = true
    })
    done.catch(() => {})
    await tick()
    expect(started).toEqual([1])
    expect(settled).toBe(false)
    release(1)
    await expect(done).rejects.toBe(trouble)
    expect(started).toEqual([1])
  })

  it("passes on the first of several failures, and one thrown before any pause", async () => {
    const first = new Error("first")
    await expect(
      inLanes(
        [1, 2],
        () => 2,
        () => 1,
        100,
        (item) => {
          if (item === 1) throw first
          return Promise.reject(new Error("second"))
        }
      )
    ).rejects.toBe(first)
  })

  it("takes any iterable", async () => {
    const seen: string[] = []
    await inLanes(
      new Map([
        [1, "a"],
        [2, "b"],
      ]).values(),
      () => 2,
      () => 1,
      10,
      async (item) => {
        seen.push(item)
      }
    )
    expect(seen).toEqual(["a", "b"])
  })
})
