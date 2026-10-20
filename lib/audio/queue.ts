/**
 * The files of the workspace and where each stands: read, decoded by the
 * page when the worker could not, written with the current settings, or
 * refused with a reason. Results are kept with the settings that made them,
 * so a change of settings makes them out of date without losing them.
 */
import type { Heard } from "./check"
import { editsKey, type Step } from "./edits"
import type { PartTimes } from "./split"
import type { ReadFacts } from "./mediabunny-audio"
import type { LevelResult } from "./level"
import type { LoudnessMap } from "./loudness"
import type { Peaks } from "./peaks"
import type { Plan } from "./settings"
import {
  cleaned,
  noTagChange,
  tagKey,
  type Cover,
  type TagChange,
  type TagField,
} from "./tags"

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
  /** What was done to its level; null when it was left as it was. */
  level?: LevelResult | null
  /** Only its tags were written: every byte of sound is the file's own. */
  inPlace?: boolean
}

export interface AudioItem {
  id: string
  file: File
  status: "reading" | "ready" | "error"
  facts?: ReadFacts
  peaks?: Peaks | null
  /** Its loudness, 100 ms at a time; null when it could not be measured. */
  loudness?: LoudnessMap | null
  /** The sound as the page decoded it (a WAV), when the worker cannot decode the file. */
  decoded?: Blob
  error?: string
  result?: AudioResult
  /** The settings key of the last result or failure. */
  resultKey?: string
  jobError?: string
  /** How far the current job has come, from 0 to 1. */
  progress?: number
  /** The changes made to it, in order, each one or more steps undone together; and those undone that can be made again. */
  changes?: Step[][]
  redo?: Step[][]
  /** Markers, in the source's own seconds, so edits do not move them. */
  marks?: number[]
  /** The parts asked for, and the key they are to be written for. */
  splitWanted?: { key: string; parts: PartTimes[] }
  /** The parts written, for a key. */
  split?: { key: string; parts: AudioResult[] }
  splitProgress?: number
  splitError?: string
  /** The changes made to its tags. */
  tagChange?: TagChange
}

export type AudioAction =
  | { type: "add"; items: { id: string; file: File }[] }
  | { type: "facts"; id: string; facts: ReadFacts }
  | {
      type: "peaks"
      id: string
      peaks: Peaks | null
      loudness?: LoudnessMap | null
    }
  | { type: "decoded"; id: string; decoded: Blob }
  | { type: "failed"; id: string; message: string }
  | { type: "progress"; id: string; fraction: number }
  | { type: "done"; id: string; key: string; result: AudioResult }
  | { type: "job-failed"; id: string; key: string; message: string }
  | { type: "change"; id: string; steps: Step[] }
  | { type: "undo"; id: string }
  | { type: "redo"; id: string }
  | { type: "reset"; id: string }
  | { type: "mark"; id: string; at: number }
  | { type: "unmark"; id: string; at: number }
  | { type: "split-wanted"; id: string; key: string; parts: PartTimes[] }
  | { type: "split-progress"; id: string; fraction: number }
  | { type: "split-done"; id: string; key: string; parts: AudioResult[] }
  | { type: "split-failed"; id: string; key: string; message: string }
  | {
      type: "retag"
      ids: string[]
      fields?: Partial<Record<TagField, string>>
      cover?: Cover | null
    }
  | { type: "retag-reset"; ids: string[] }
  | { type: "move"; id: string; by: -1 | 1 }
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
        loudness: action.loudness ?? null,
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
    case "change":
      return patch(items, action.id, (item) => ({
        ...item,
        changes: [...(item.changes ?? []), action.steps],
        redo: [],
      }))
    case "undo":
      return patch(items, action.id, (item) => {
        const changes = item.changes ?? []
        if (!changes.length) return item
        return {
          ...item,
          changes: changes.slice(0, -1),
          redo: [...(item.redo ?? []), changes[changes.length - 1]],
        }
      })
    case "redo":
      return patch(items, action.id, (item) => {
        const redo = item.redo ?? []
        if (!redo.length) return item
        return {
          ...item,
          changes: [...(item.changes ?? []), redo[redo.length - 1]],
          redo: redo.slice(0, -1),
        }
      })
    case "reset":
      return patch(items, action.id, (item) => ({
        ...item,
        changes: [],
        redo: [],
      }))
    case "mark":
      return patch(items, action.id, (item) => ({
        ...item,
        marks: [...new Set([...(item.marks ?? []), action.at])].sort(
          (a, b) => a - b
        ),
      }))
    case "unmark":
      return patch(items, action.id, (item) => ({
        ...item,
        marks: (item.marks ?? []).filter((at) => at !== action.at),
      }))
    case "split-wanted":
      return patch(items, action.id, (item) => ({
        ...item,
        splitWanted: { key: action.key, parts: action.parts },
        splitError: undefined,
        splitProgress: undefined,
      }))
    case "split-progress":
      return patch(items, action.id, (item) => ({
        ...item,
        splitProgress: action.fraction,
      }))
    case "split-done":
      return patch(items, action.id, (item) =>
        item.splitWanted?.key === action.key
          ? {
              ...item,
              split: { key: action.key, parts: action.parts },
              splitProgress: undefined,
            }
          : item
      )
    case "split-failed":
      return patch(items, action.id, (item) =>
        item.splitWanted?.key === action.key
          ? {
              ...item,
              splitWanted: undefined,
              splitError: action.message,
              splitProgress: undefined,
            }
          : item
      )
    case "retag":
      return items.map((item) => {
        if (!action.ids.includes(item.id) || !item.facts) return item
        const own = item.facts.tags
        const fields = { ...item.tagChange?.fields }
        for (const [field, value] of Object.entries(action.fields ?? {}) as [
          TagField,
          string,
        ][])
          // A field set back to what the file has is no change.
          if (cleaned(field, value) === (own[field] ?? "")) delete fields[field]
          else fields[field] = value
        const change: TagChange = { fields }
        const cover = "cover" in action ? action.cover : item.tagChange?.cover
        if (cover !== undefined) change.cover = cover
        return { ...item, tagChange: change }
      })
    case "retag-reset":
      return items.map((item) =>
        action.ids.includes(item.id) ? { ...item, tagChange: undefined } : item
      )
    case "move": {
      const from = items.findIndex((item) => item.id === action.id)
      const to = from + action.by
      if (from < 0 || to < 0 || to >= items.length) return items
      const moved = [...items]
      ;[moved[from], moved[to]] = [moved[to], moved[from]]
      return moved
    }
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
      [
        ...(item.result ? [item.result] : []),
        ...(item.split?.parts ?? []),
      ].flatMap((result) => [...new Set([result.url, result.downloadUrl])])
    )
  const kept = new Set(urls(after))
  return urls(before).filter((url) => !kept.has(url))
}

/** Every step made to a file, in order. */
export const stepsOf = (item: AudioItem) => (item.changes ?? []).flat()

/** A file's result key: the settings' and its own edits'; null when the settings cannot be used. */
export const itemKey = (settings: string | null, item: AudioItem) =>
  settings === null
    ? null
    : `${settings}|${editsKey(stepsOf(item))}|${tagKey(item.tagChange ?? noTagChange)}`

/** What a free worker should do next: read a new file, else write the selected one, else the first waiting. */
export function nextAudioJob(
  items: AudioItem[],
  keyOf: (item: AudioItem) => string | null,
  inFlight: ReadonlySet<string>,
  selectedId: string | null
): { item: AudioItem; job: "read" | "convert" | "split" } | null {
  const free = items.filter((item) => !inFlight.has(item.id))
  const unread = free.find(
    (item) => item.status === "reading" && item.facts === undefined
  )
  if (unread) return { item: unread, job: "read" }
  const waiting = free.filter((item) => {
    const key = keyOf(item)
    return item.status === "ready" && key !== null && item.resultKey !== key
  })
  const selected = waiting.find((one) => one.id === selectedId)
  if (selected) return { item: selected, job: "convert" }
  // Parts asked for come before the files no one is looking at.
  const splitting = items.find(
    (one) =>
      one.status === "ready" &&
      one.splitWanted &&
      one.split?.key !== one.splitWanted.key &&
      !inFlight.has(splitId(one.id))
  )
  if (splitting) return { item: splitting, job: "split" }
  const item = waiting[0] ?? null
  return item ? { item, job: "convert" } : null
}

/** The pool's name for the job that splits a file. */
export const splitId = (id: string) => `split:${id}`

/** Totals for the summary bar. */
export function audioTotals(
  items: AudioItem[],
  keyOf: (item: AudioItem) => string | null
) {
  let originalBytes = 0
  let outputBytes = 0
  let done = 0
  let pending = 0
  for (const item of items) {
    const state = audioState(item, keyOf(item))
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
