import { describe, expect, it } from "vitest"
import {
  appendSample,
  formatMemory,
  heapSample,
  highestSample,
  pageSample,
  trendPoints,
  type MemorySample,
} from "./memory"

const heap = {
  usedJSHeapSize: 512,
  totalJSHeapSize: 1024,
  jsHeapSizeLimit: 2048,
}
const sample = (bytes: number, takenAt = 10): MemorySample => ({
  bytes,
  kind: "javascript",
  takenAt,
})
const invalidBytes = [
  undefined,
  null,
  "100",
  -1,
  1.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
]

describe("browser memory results", () => {
  it("retains the heap's distinct used, allocated and limit values", () => {
    expect(heapSample(heap, 123.5)).toEqual({
      bytes: 512,
      kind: "javascript",
      takenAt: 123.5,
      allocatedBytes: 1024,
      limitBytes: 2048,
    })
    expect(heapSample({ ...heap, usedJSHeapSize: 0 }, 0)?.bytes).toBe(0)
    expect(
      heapSample({ ...heap, usedJSHeapSize: 1024, jsHeapSizeLimit: 1024 }, 10)
        ?.bytes
    ).toBe(1024)
  })

  it("rejects missing, malformed or impossible heap measurements", () => {
    for (const value of [undefined, null, true, 100, "heap", [], {}]) {
      expect(heapSample(value, 10)).toBeNull()
    }
    for (const key of Object.keys(heap)) {
      for (const value of invalidBytes) {
        expect(heapSample({ ...heap, [key]: value }, 10)).toBeNull()
      }
    }
    expect(heapSample({ ...heap, totalJSHeapSize: 0 }, 10)).toBeNull()
    expect(heapSample({ ...heap, jsHeapSizeLimit: 0 }, 10)).toBeNull()
    expect(heapSample({ ...heap, usedJSHeapSize: 1025 }, 10)).toBeNull()
    expect(heapSample({ ...heap, totalJSHeapSize: 2049 }, 10)).toBeNull()
  })

  it("reads the page estimate without summing ambiguous attribution", () => {
    expect(
      pageSample({ bytes: 3072, breakdown: [{ bytes: 99999 }] }, 25)
    ).toEqual({
      bytes: 3072,
      kind: "page",
      takenAt: 25,
    })
    expect(pageSample({ bytes: 0 }, 0)).toEqual({
      bytes: 0,
      kind: "page",
      takenAt: 0,
    })
    expect(pageSample({ bytes: Number.MAX_SAFE_INTEGER }, 10)?.bytes).toBe(
      Number.MAX_SAFE_INTEGER
    )
  })

  it("rejects unavailable page readings and invalid timestamps", () => {
    for (const value of [
      undefined,
      null,
      0,
      "page",
      [],
      {},
      ...invalidBytes.map((bytes) => ({ bytes })),
    ]) {
      expect(pageSample(value, 10)).toBeNull()
    }
    for (const time of [-1, NaN, Infinity]) {
      expect(pageSample({ bytes: 100 }, time)).toBeNull()
      expect(heapSample(heap, time)).toBeNull()
    }
  })
})

describe("readable memory sizes", () => {
  it("uses binary units and at most one decimal place", () => {
    expect(formatMemory(0)).toBe("0 B")
    expect(formatMemory(512)).toBe("512 B")
    expect(formatMemory(1023)).toBe("1023 B")
    expect(formatMemory(1024)).toBe("1 KiB")
    expect(formatMemory(1536)).toBe("1.5 KiB")
    expect(formatMemory(1024 ** 2)).toBe("1 MiB")
    expect(formatMemory(1342177)).toBe("1.3 MiB")
    expect(formatMemory(1024 ** 3)).toBe("1 GiB")
    expect(formatMemory(1024 ** 4)).toBe("1024 GiB")
  })

  it("does not turn malformed sizes into zero usage", () => {
    for (const bytes of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(formatMemory(bytes)).toBe("—")
    }
  })
})

describe("recent memory samples", () => {
  it("starts a history and appends without mutating an existing one", () => {
    const first = sample(50)
    expect(appendSample([], first)).toEqual([first])
    const history = Object.freeze([first])
    const next = sample(100, 20)
    expect(appendSample(history, next)).toEqual([first, next])
    expect(history).toEqual([first])
  })

  it("retains the latest 30 readings and discards an earlier peak", () => {
    const history = Array.from({ length: 30 }, (_, i) => sample(100 - i, i))
    const updated = appendSample(history, sample(20, 30))
    expect(updated).toHaveLength(30)
    expect(updated[0]).toBe(history[1])
    expect(updated.at(-1)?.bytes).toBe(20)
    expect(updated).not.toContain(history[0])
  })

  it("does not compare page estimates with JavaScript heap estimates", () => {
    const page: MemorySample = { bytes: 500, kind: "page", takenAt: 30 }
    expect(appendSample([sample(100)], page)).toEqual([page])
    expect(appendSample([page], sample(100))).toEqual([sample(100)])
  })

  it("retains a session peak after it leaves the chart, taking newer ties", () => {
    const peak = sample(1000, 0)
    let highest: MemorySample | null = null
    let history: readonly MemorySample[] = []
    for (const reading of [
      peak,
      ...Array.from({ length: 30 }, (_, i) => sample(i, i + 1)),
    ]) {
      highest = highestSample(highest, reading)
      history = appendSample(history, reading)
    }
    expect(highest).toBe(peak)
    expect(history).not.toContain(peak)
    const larger = sample(1500, 31)
    expect(highestSample(peak, larger)).toBe(larger)
    const tied = sample(1000, 32)
    expect(highestSample(peak, tied)).toBe(tied)
  })

  it("starts the peak again when the measurement kind changes", () => {
    const page: MemorySample = { bytes: 1, kind: "page", takenAt: 30 }
    expect(highestSample(sample(1000), page)).toBe(page)
    const heap = sample(0)
    expect(highestSample(page, heap)).toBe(heap)
  })
})

describe("memory trend", () => {
  it("handles missing, single and unchanged readings without an artificial slope", () => {
    expect(trendPoints([])).toBe("")
    expect(trendPoints([sample(120)])).toBe("140,24")
    expect(trendPoints([sample(0), sample(0)])).toBe("4,24 276,24")
    expect(trendPoints([sample(120), sample(120), sample(120)])).toBe(
      "4,24 140,24 276,24"
    )
  })

  it("shows increases and falls inside the padded view box", () => {
    expect(trendPoints([sample(100), sample(200), sample(150)])).toBe(
      "4,44 140,4 276,24"
    )
    expect(
      trendPoints([sample(100), sample(200), sample(300), sample(400)])
    ).toBe("4,44 94.67,30.67 185.33,17.33 276,4")
  })
})
