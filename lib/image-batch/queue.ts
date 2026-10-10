import type { InputFormat } from "@/lib/image-compressor/formats"
import type { Size } from "@/lib/image-compressor/geometry"
import type { Focus } from "@/lib/image-resizer/focus"

/** One finished file. `F` is the tool's own set of output formats. */
export interface QueueOutput<F extends string = string> {
  blob: Blob
  url: string
  format: F
  width: number
  height: number
  /** Mean SSIM against the source, or null when the tool did not measure it. */
  similarity: number | null
  /** Tool-specific payload kept with the file (for example a PDF page image). */
  extra?: unknown
}

export interface QueueItem<F extends string = string> {
  id: string
  file: File
  status: "reading" | "ready" | "error"
  format?: InputFormat
  animated?: boolean
  size?: Size
  transparent?: boolean
  error?: string
  /** A focus chosen for this image only; otherwise the shared setting applies. */
  focus?: Focus
  /** Result of the last finished job, and the settings key that produced it. */
  outputs?: QueueOutput<F>[]
  resultKey?: string
  /** Focus the engine used, so dragging can continue from a smart choice. */
  usedFocus?: Focus
  jobError?: string
}

export type QueueAction<F extends string = string> =
  | { type: "add"; items: { id: string; file: File }[] }
  | {
      type: "opened"
      id: string
      /** Left out by tools whose inputs are not still-image formats. */
      format?: InputFormat
      animated: boolean
      size: Size
      transparent: boolean
    }
  | { type: "failed"; id: string; message: string }
  /** The input itself changed, so it must be read again; its last result stays until then. */
  | { type: "reread"; id: string }
  | {
      type: "done"
      id: string
      key: string
      outputs: QueueOutput<F>[]
      usedFocus?: Focus
    }
  | { type: "job-failed"; id: string; key: string; message: string }
  | { type: "focus"; id: string; focus: Focus | undefined }
  | { type: "reset-focus" }
  | { type: "remove"; id: string }
  | { type: "clear" }

const patch = <F extends string>(
  items: QueueItem<F>[],
  id: string,
  change: (item: QueueItem<F>) => QueueItem<F>
) => items.map((item) => (item.id === id ? change(item) : item))

export function queueReducer<F extends string = string>(
  items: QueueItem<F>[],
  action: QueueAction<F>
): QueueItem<F>[] {
  switch (action.type) {
    case "add":
      return [
        ...items,
        ...action.items.map((item) => ({
          ...item,
          status: "reading" as const,
        })),
      ]
    case "opened":
      return patch(items, action.id, (item) => ({
        ...item,
        status: "ready",
        format: action.format,
        animated: action.animated,
        size: action.size,
        transparent: action.transparent,
      }))
    case "failed":
      return patch(items, action.id, (item) => ({
        ...item,
        status: "error",
        error: action.message,
      }))
    case "reread":
      return patch(items, action.id, (item) => ({
        ...item,
        status: "reading",
        error: undefined,
      }))
    case "done":
      return patch(items, action.id, (item) => ({
        ...item,
        outputs: action.outputs,
        resultKey: action.key,
        usedFocus: action.usedFocus,
        jobError: undefined,
      }))
    case "job-failed":
      return patch(items, action.id, (item) => ({
        ...item,
        outputs: undefined,
        resultKey: action.key,
        jobError: action.message,
      }))
    case "focus":
      return patch(items, action.id, (item) => ({
        ...item,
        focus: action.focus,
      }))
    case "reset-focus":
      return items.map((item) =>
        item.focus ? { ...item, focus: undefined } : item
      )
    case "remove":
      return items.filter((item) => item.id !== action.id)
    case "clear":
      return []
  }
}

export type ItemState = "reading" | "error" | "waiting" | "done" | "failed"

/** Where an item stands for the current settings (`key` is its expected result key). */
export function itemState<F extends string>(
  item: QueueItem<F>,
  key: string | null
): ItemState {
  if (item.status !== "ready") return item.status
  if (key === null || item.resultKey !== key) return "waiting"
  return item.jobError ? "failed" : "done"
}

export function queueTotals<F extends string>(
  items: QueueItem<F>[],
  keyOf: (item: QueueItem<F>) => string | null
) {
  let originalBytes = 0
  let outputBytes = 0
  let files = 0
  let done = 0
  let pending = 0
  for (const item of items) {
    const state = itemState(item, keyOf(item))
    if (state === "reading" || state === "waiting") pending++
    if (state !== "done") continue
    done++
    originalBytes += item.file.size
    for (const output of item.outputs!) {
      outputBytes += output.blob.size
      files++
    }
  }
  return {
    images: items.length,
    done,
    pending,
    files,
    originalBytes,
    outputBytes,
    /** Nothing left to read or process, and at least one usable result. */
    settled: pending === 0 && done > 0,
  }
}

/** Object URLs that a reducer step dropped and that should now be released. */
export function releasedUrls<F extends string>(
  before: QueueItem<F>[],
  after: QueueItem<F>[]
) {
  const kept = new Set(
    after.flatMap((item) => item.outputs?.map((output) => output.url) ?? [])
  )
  return before
    .flatMap((item) => item.outputs?.map((output) => output.url) ?? [])
    .filter((url) => !kept.has(url))
}

/**
 * Pick the next image for an idle worker: the selected image first, then one
 * the worker already has decoded, then queue order. Skips images in flight.
 */
export function nextJob<F extends string>(
  items: QueueItem<F>[],
  keyOf: (item: QueueItem<F>) => string | null,
  inFlight: ReadonlySet<string>,
  selectedId: string | null,
  cachedId: string | null
) {
  const waiting = items.filter((item) => {
    if (inFlight.has(item.id) || item.status === "error") return false
    if (item.status === "reading") return true
    const key = keyOf(item)
    return key !== null && item.resultKey !== key
  })
  return (
    waiting.find((item) => item.id === selectedId) ??
    waiting.find((item) => item.id === cachedId) ??
    waiting[0] ??
    null
  )
}
