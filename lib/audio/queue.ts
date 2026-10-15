/**
 * The files of the workspace and where each stands: read, decoded by the
 * page when the worker could not, written with the current settings, or
 * refused with a reason. Results are kept with the settings that made them,
 * so a change of settings makes them out of date without losing them.
 */
import type { Heard } from "./check"
import type { ReadFacts } from "./mediabunny-audio"
import type { Peaks } from "./peaks"
import type { Plan } from "./settings"

export interface AudioResult {
  blob: Blob
  /** For playing it on the page. */
  url: string
  /**
   * For saving it: the same bytes without a type. With one, Firefox renames
   * an M4R to .mp4, and Safari on a phone opens sound to play instead.
   */
  downloadUrl: string
  name: string
  plan: Plan
  heard: Heard | null
  /** What the check found wrong; empty when the result is as asked. */
  problems: string[]
}

export interface AudioItem {
  id: string
  file: File
  status: "reading" | "ready" | "error"
  facts?: ReadFacts
  peaks?: Peaks | null
  /** The sound as the page decoded it (a WAV), when the worker cannot decode the file. */
  decoded?: Blob
  error?: string
  result?: AudioResult
  /** The settings key of the last result or failure. */
  resultKey?: string
  jobError?: string
  /** How far the current job has come, from 0 to 1. */
  progress?: number
}

export type AudioAction =
  | { type: "add"; items: { id: string; file: File }[] }
  | { type: "facts"; id: string; facts: ReadFacts }
  | { type: "peaks"; id: string; peaks: Peaks | null }
  | { type: "decoded"; id: string; decoded: Blob }
  | { type: "failed"; id: string; message: string }
  | { type: "progress"; id: string; fraction: number }
  | { type: "done"; id: string; key: string; result: AudioResult }
  | { type: "job-failed"; id: string; key: string; message: string }
  | { type: "remove"; id: string }
  | { type: "clear" }

const patch = (
  items: AudioItem[],
  id: string,
  change: (item: AudioItem) => AudioItem
) => items.map((item) => (item.id === id ? change(item) : item))

/** Whether a file is ready to be written: read, and decodable here or by the page. */
const usable = (item: AudioItem) =>
  item.facts !== undefined &&
  (item.facts.decodable || item.decoded !== undefined)

export function audioReducer(
  items: AudioItem[],
  action: AudioAction
): AudioItem[] {
  switch (action.type) {
    case "add":
      return [
        ...items,
        ...action.items.map((item) => ({
          ...item,
          status: "reading" as const,
        })),
      ]
    case "facts":
      return patch(items, action.id, (item) => {
        const next = { ...item, facts: action.facts }
        return { ...next, status: usable(next) ? "ready" : "reading" }
      })
    case "peaks":
      return patch(items, action.id, (item) => ({
        ...item,
        peaks: action.peaks,
      }))
    case "decoded":
      return patch(items, action.id, (item) => ({
        ...item,
        decoded: action.decoded,
        status: item.facts ? "ready" : item.status,
      }))
    case "failed":
      return patch(items, action.id, (item) => ({
        ...item,
        status: "error",
        error: action.message,
      }))
    case "progress":
      return patch(items, action.id, (item) => ({
        ...item,
        progress: action.fraction,
      }))
    case "done":
      return patch(items, action.id, (item) => ({
        ...item,
        result: action.result,
        resultKey: action.key,
        jobError: undefined,
        progress: undefined,
      }))
    case "job-failed":
      return patch(items, action.id, (item) => ({
        ...item,
        result: undefined,
        resultKey: action.key,
        jobError: action.message,
        progress: undefined,
      }))
    case "remove":
      return items.filter((item) => item.id !== action.id)
    case "clear":
      return []
  }
}

export type AudioState = "reading" | "error" | "waiting" | "done" | "failed"

/** Where a file stands for the current settings (`key`; null when they cannot be used). */
export function audioState(item: AudioItem, key: string | null): AudioState {
  if (item.status !== "ready") return item.status
  if (key === null || item.resultKey !== key) return "waiting"
  return item.jobError ? "failed" : "done"
}

/** The URLs of results a step dropped, to be released. */
export function droppedUrls(before: AudioItem[], after: AudioItem[]) {
  const urls = (items: AudioItem[]) =>
    items.flatMap((item) =>
      item.result
        ? [...new Set([item.result.url, item.result.downloadUrl])]
        : []
    )
  const kept = new Set(urls(after))
  return urls(before).filter((url) => !kept.has(url))
}

/** What a free worker should do next: read a new file, else write the selected one, else the first waiting. */
export function nextAudioJob(
  items: AudioItem[],
  key: string | null,
  inFlight: ReadonlySet<string>,
  selectedId: string | null
): { item: AudioItem; job: "read" | "convert" } | null {
  const free = items.filter((item) => !inFlight.has(item.id))
  const unread = free.find(
    (item) => item.status === "reading" && item.facts === undefined
  )
  if (unread) return { item: unread, job: "read" }
  if (key === null) return null
  const waiting = free.filter(
    (item) => item.status === "ready" && item.resultKey !== key
  )
  const item =
    waiting.find((one) => one.id === selectedId) ?? waiting[0] ?? null
  return item ? { item, job: "convert" } : null
}

/** Totals for the summary bar. */
export function audioTotals(items: AudioItem[], key: string | null) {
  let originalBytes = 0
  let outputBytes = 0
  let done = 0
  let pending = 0
  for (const item of items) {
    const state = audioState(item, key)
    if (state === "reading" || state === "waiting") pending++
    if (state !== "done") continue
    done++
    originalBytes += item.file.size
    outputBytes += item.result!.blob.size
  }
  return {
    images: items.length,
    done,
    pending,
    files: done,
    originalBytes,
    outputBytes,
    settled: pending === 0 && done > 0,
  }
}
