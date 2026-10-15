/** Browser estimates, kept separate because page memory and a JS heap differ. */
export interface MemorySample {
  bytes: number
  kind: "page" | "javascript"
  takenAt: number
  allocatedBytes?: number
  limitBytes?: number
}

const isBytes = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isTime = (value: number) => Number.isFinite(value) && value >= 0

/** The legacy API reports a heap, not all of the page's memory. */
export function heapSample(
  value: unknown,
  takenAt: number
): MemorySample | null {
  if (!isRecord(value) || !isTime(takenAt)) return null
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = value
  if (
    !isBytes(usedJSHeapSize) ||
    !isBytes(totalJSHeapSize) ||
    !isBytes(jsHeapSizeLimit) ||
    totalJSHeapSize === 0 ||
    jsHeapSizeLimit === 0 ||
    usedJSHeapSize > totalJSHeapSize ||
    totalJSHeapSize > jsHeapSizeLimit
  )
    return null
  return {
    bytes: usedJSHeapSize,
    kind: "javascript",
    takenAt,
    allocatedBytes: totalJSHeapSize,
    limitBytes: jsHeapSizeLimit,
  }
}

/** Attribution is browser-specific; it cannot identify individual tools. */
export function pageSample(
  value: unknown,
  takenAt: number
): MemorySample | null {
  if (!isRecord(value) || !isTime(takenAt) || !isBytes(value.bytes)) return null
  return { bytes: value.bytes, kind: "page", takenAt }
}

/** Binary units, independent of the browser's locale; never invent a zero. */
export function formatMemory(bytes: number): string {
  if (!isBytes(bytes)) return "—"
  const units = ["B", "KiB", "MiB", "GiB"]
  let unit = 0
  let amount = bytes
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit++
  }
  return `${Math.round(amount * 10) / 10} ${units[unit]}`
}

/** A bounded history; switching measurement methods starts a new comparison. */
export function appendSample(
  history: readonly MemorySample[],
  sample: MemorySample
): readonly MemorySample[] {
  if (history.at(-1)?.kind !== sample.kind) return [sample]
  return [...history.slice(-29), sample]
}

/** Keep a session peak independently of the bounded chart history. */
export function highestSample(
  previous: MemorySample | null,
  sample: MemorySample
): MemorySample {
  if (previous?.kind === sample.kind && previous.bytes > sample.bytes)
    return previous
  return sample
}

/** Sample order on a 280 × 48 plot; constant readings sit on its centre line. */
export function trendPoints(history: readonly MemorySample[]): string {
  if (!history.length) return ""
  const values = history.map((sample) => sample.bytes)
  const low = Math.min(...values)
  const range = Math.max(...values) - low
  return history
    .map((sample, index) => {
      const x =
        history.length === 1 ? 140 : 4 + (index * 272) / (history.length - 1)
      const y = range === 0 ? 24 : 44 - ((sample.bytes - low) / range) * 40
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    })
    .join(" ")
}
