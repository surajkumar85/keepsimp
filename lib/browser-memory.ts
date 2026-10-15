import { heapSample, pageSample, type MemorySample } from "./memory"

export interface MemoryPerformance {
  readonly memory?: unknown
  measureUserAgentSpecificMemory?: () => Promise<unknown>
}

export type MemoryReading =
  | { status: "ready"; sample: MemorySample }
  | { status: "unsupported" }
  | { status: "error" }

const MEASUREMENT_TIMEOUT = 25_000

/** Browser values are supplied by the caller so importing this is safe on the server. */
export function createMemoryReader(
  performance: MemoryPerformance,
  isolated: boolean,
  now = Date.now
) {
  let pending: Promise<MemoryReading> | null = null
  let modernFailed = false

  function heapReading(failed = false): MemoryReading {
    try {
      const sample = heapSample(performance.memory, now())
      return sample
        ? { status: "ready", sample }
        : { status: failed ? "error" : "unsupported" }
    } catch {
      return { status: "error" }
    }
  }

  function fallback(): MemoryReading {
    // A rejected or very slow measurement should not repeat expensive work on
    // each heap refresh. A new reader (a new page load) can try the API again.
    modernFailed = true
    return heapReading(true)
  }

  function read(): Promise<MemoryReading> {
    if (modernFailed) return Promise.resolve(heapReading(true))
    if (pending) return pending

    let measure: MemoryPerformance["measureUserAgentSpecificMemory"]
    try {
      measure = isolated
        ? performance.measureUserAgentSpecificMemory
        : undefined
    } catch {
      return Promise.resolve(fallback())
    }
    if (typeof measure !== "function") return Promise.resolve(heapReading())

    pending = new Promise<MemoryReading>((resolve) => {
      const timer = setTimeout(() => resolve(fallback()), MEASUREMENT_TIMEOUT)

      // The native measurement cannot be cancelled. Keep one request until it
      // settles. After timeout, only cheap heap refreshes can run alongside it.
      Promise.resolve()
        .then(() => measure.call(performance))
        .then((value) => {
          const sample = pageSample(value, now())
          resolve(sample ? { status: "ready", sample } : fallback())
        })
        .catch(() => resolve(fallback()))
        .finally(() => {
          clearTimeout(timer)
          pending = null
        })
    })
    return pending
  }

  return { read }
}
