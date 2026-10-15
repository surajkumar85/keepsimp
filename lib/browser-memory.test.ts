import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryReader, type MemoryPerformance } from "./browser-memory"

const heap = {
  usedJSHeapSize: 24_000_000,
  totalJSHeapSize: 32_000_000,
  jsHeapSizeLimit: 1_000_000_000,
}
const heapResult = {
  status: "ready",
  sample: {
    bytes: heap.usedJSHeapSize,
    kind: "javascript",
    takenAt: 1234,
    allocatedBytes: heap.totalJSHeapSize,
    limitBytes: heap.jsHeapSizeLimit,
  },
}
const now = () => 1234

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1234)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("browser memory reader", () => {
  it("reports an unsupported browser without making up a reading", async () => {
    expect(await createMemoryReader({}, false).read()).toEqual({
      status: "unsupported",
    })
    expect(await createMemoryReader({}, true, now).read()).toEqual({
      status: "unsupported",
    })
  })

  it("uses the heap in a browser without an isolated page measurement", async () => {
    const performance = {
      memory: heap,
      get measureUserAgentSpecificMemory(): () => Promise<unknown> {
        throw new Error("Must not inspect this API without isolation")
      },
    }
    expect(await createMemoryReader(performance, false).read()).toEqual(
      heapResult
    )
    expect(
      await createMemoryReader({ memory: heap }, true, now).read()
    ).toEqual(heapResult)
  })

  it("rejects invalid heap values and handles a throwing heap getter", async () => {
    expect(
      await createMemoryReader(
        { memory: { usedJSHeapSize: NaN } },
        false
      ).read()
    ).toEqual({ status: "unsupported" })
    expect(
      await createMemoryReader(
        {
          get memory() {
            throw new Error("Browser denied access")
          },
        },
        false
      ).read()
    ).toEqual({ status: "error" })
  })

  it("prefers the page measurement and binds the native API to performance", async () => {
    const performance: MemoryPerformance = {
      memory: heap,
      async measureUserAgentSpecificMemory() {
        expect(this).toBe(performance)
        return { bytes: 48_000_000 }
      },
    }
    expect(await createMemoryReader(performance, true, now).read()).toEqual({
      status: "ready",
      sample: { bytes: 48_000_000, kind: "page", takenAt: 1234 },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("shares an outstanding measurement and permits a new one after it settles", async () => {
    const native = deferred()
    const measure = vi.fn(() => native.promise)
    const reader = createMemoryReader(
      { measureUserAgentSpecificMemory: measure },
      true,
      now
    )
    const first = reader.read()
    expect(reader.read()).toBe(first)
    await vi.advanceTimersByTimeAsync(0)
    expect(measure).toHaveBeenCalledTimes(1)
    native.resolve({ bytes: 100 })
    expect(await first).toMatchObject({
      status: "ready",
      sample: { bytes: 100 },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(reader.read()).not.toBe(first)
    await vi.advanceTimersByTimeAsync(0)
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it.each([undefined, { bytes: -1 }, { bytes: Infinity }])(
    "falls back to a valid heap when the page measurement is invalid: %s",
    async (value) => {
      const reader = createMemoryReader(
        {
          memory: heap,
          measureUserAgentSpecificMemory: async () => value,
        },
        true,
        now
      )
      expect(await reader.read()).toEqual(heapResult)
      await vi.advanceTimersByTimeAsync(0)
      expect(await reader.read()).toEqual(heapResult)
    }
  )

  it("reports an error when an invalid page measurement has no valid fallback", async () => {
    const reader = createMemoryReader(
      { measureUserAgentSpecificMemory: async () => ({ bytes: "100" }) },
      true,
      now
    )
    expect(await reader.read()).toEqual({ status: "error" })
    await vi.advanceTimersByTimeAsync(0)
    expect(await reader.read()).toEqual({ status: "error" })
  })

  it.each([true, false])(
    "handles a rejected native request with heap fallback available: %s",
    async (hasHeap) => {
      const reader = createMemoryReader(
        {
          memory: hasHeap ? heap : undefined,
          measureUserAgentSpecificMemory: async () => {
            throw new Error("SecurityError")
          },
        },
        true,
        now
      )
      expect(await reader.read()).toEqual(
        hasHeap ? heapResult : { status: "error" }
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it("handles a native method that throws before returning a promise", async () => {
    const reader = createMemoryReader(
      {
        memory: heap,
        measureUserAgentSpecificMemory() {
          throw new Error("Unavailable")
        },
      },
      true,
      now
    )
    expect(await reader.read()).toEqual(heapResult)
  })

  it.each([true, false])(
    "handles a throwing API getter with heap fallback available: %s",
    async (hasHeap) => {
      const reader = createMemoryReader(
        {
          memory: hasHeap ? heap : undefined,
          get measureUserAgentSpecificMemory(): () => Promise<unknown> {
            throw new Error("Unavailable")
          },
        },
        true,
        now
      )
      expect(await reader.read()).toEqual(
        hasHeap ? heapResult : { status: "error" }
      )
    }
  )

  it.each([true, false])(
    "times out without starting another native request, with heap fallback: %s",
    async (hasHeap) => {
      const native = deferred()
      const measure = vi.fn(() => native.promise)
      const reader = createMemoryReader(
        {
          memory: hasHeap ? heap : undefined,
          measureUserAgentSpecificMemory: measure,
        },
        true,
        now
      )
      const reading = reader.read()
      await vi.advanceTimersByTimeAsync(25_000)
      expect(await reading).toEqual(hasHeap ? heapResult : { status: "error" })
      for (let attempt = 0; attempt < 5; attempt++) {
        expect(await reader.read()).toEqual(
          hasHeap ? heapResult : { status: "error" }
        )
        await vi.advanceTimersByTimeAsync(25_000)
      }
      expect(measure).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)

      native.resolve({ bytes: 100 })
      await vi.advanceTimersByTimeAsync(0)
      expect(reader.read()).not.toBe(reading)
      expect(await reader.read()).toEqual(
        hasHeap ? heapResult : { status: "error" }
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(measure).toHaveBeenCalledTimes(1)
    }
  )

  it("releases the request lock even if a timed-out request later rejects", async () => {
    const native = deferred()
    const measure = vi.fn(() => native.promise)
    const reader = createMemoryReader(
      { memory: heap, measureUserAgentSpecificMemory: measure },
      true,
      now
    )
    const reading = reader.read()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await reading).toEqual(heapResult)
    native.reject(new Error("Page measurement failed later"))
    await vi.advanceTimersByTimeAsync(0)
    expect(reader.read()).not.toBe(reading)
    await vi.advanceTimersByTimeAsync(0)
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it("keeps heap readings live when the native measurement never settles", async () => {
    const native = deferred()
    const measure = vi.fn(() => native.promise)
    const performance = {
      memory: { ...heap },
      measureUserAgentSpecificMemory: measure,
    }
    const reader = createMemoryReader(performance, true, now)
    const first = reader.read()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(await first).toEqual(heapResult)
    performance.memory.usedJSHeapSize += 100
    expect(await reader.read()).toEqual({
      ...heapResult,
      sample: { ...heapResult.sample, bytes: heap.usedJSHeapSize + 100 },
    })
    expect(measure).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("uses only cheap heap refreshes after a failed modern measurement", async () => {
    const measure = vi.fn(async () => {
      throw new Error("SecurityError")
    })
    const performance = {
      memory: { ...heap },
      measureUserAgentSpecificMemory: measure,
    }
    const reader = createMemoryReader(performance, true, now)
    expect(await reader.read()).toEqual(heapResult)
    await vi.advanceTimersByTimeAsync(0)
    performance.memory.usedJSHeapSize += 100
    expect(await reader.read()).toEqual({
      ...heapResult,
      sample: { ...heapResult.sample, bytes: heap.usedJSHeapSize + 100 },
    })
    expect(measure).toHaveBeenCalledTimes(1)
  })
})
