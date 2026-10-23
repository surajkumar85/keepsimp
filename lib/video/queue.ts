/**
 * The workspace's list of files: what each one is, where it stands for the
 * current settings, and which job comes next. Pure, so the page and the
 * tests share it.
 */
import type { ItemState } from "@/lib/image-batch/queue"
import { containerLabels, outputInfo, type Container } from "./formats"
import type { IndexPlace, VideoLevel } from "./protocol"
import { videoCodecLabels, type Plan, type VideoFacts } from "./settings"
import { MOST_PASSES } from "./target"
import { keepOnly, splitAt, whole, type Part } from "./trim"
import type { Box } from "./frame"
import type { Cue } from "./subtitles"
import type { Looks } from "./looks"

/** What the trimmer keeps, with the edits that can be undone and done again. */
export interface Trim {
  parts: Part[]
  /** Cut to the frame by encoding, rather than copied from keyframes. */
  exact: boolean
  undo: Part[][]
  redo: Part[][]
}

/** The trim as the plan takes it. */
export const cutOf = (trim: Trim | null) =>
  trim ? { parts: trim.parts, exact: trim.exact } : null

/** A trim with one more change, which can be undone. */
export function trimmed(trim: Trim | null, parts: Part[], whole: Part[]): Trim {
  const before = trim?.parts ?? whole
  return {
    parts,
    exact: trim?.exact ?? false,
    undo: [...(trim?.undo ?? []), before],
    redo: [],
  }
}

/** The trim as it was before its last change, or after the change undone. */
export function undone(trim: Trim, back: boolean): Trim {
  const from = back ? trim.undo : trim.redo
  if (!from.length) return trim
  const parts = from.at(-1)!
  return back
    ? {
        ...trim,
        parts,
        undo: trim.undo.slice(0, -1),
        redo: [...trim.redo, trim.parts],
      }
    : {
        ...trim,
        parts,
        redo: trim.redo.slice(0, -1),
        undo: [...trim.undo, trim.parts],
      }
}

/** Videos open at once. Shared by the page and its help, which is drawn on the server. */
export const MAX_FILES = 20

export interface VideoResult {
  /** The plan it was written by (`planKey`). */
  key: string
  file: Blob | null
  /** For the page's player. */
  url: string | null
  /** Untyped, so no browser opens it instead of saving it. */
  downloadUrl: string | null
  /** The file in the page's folder, removed when the result goes. */
  scratch: string | null
  written: VideoFacts | null
  problems: string[]
  index: IndexPlace | null
  /** Passes written to reach a size limit. */
  passes: number
  /** The size the picture was made, when the encoder's floor made it smaller than planned. */
  resized: { width: number; height: number } | null
  /** How close it looks to the original; null when not measured. */
  looks: Looks | null
  /** The sound's level, when it was set to a loudness. */
  level: VideoLevel | null
  error: string | null
}

export interface VideoItem {
  id: string
  file: File
  name: string
  container: Container
  status: "reading" | "ready" | "error"
  facts: VideoFacts | null
  poster: ImageBitmap | null
  message: string | null
  /** What the trimmer keeps, as edited; null keeps the whole file. */
  trim: Trim | null
  /** The trim the plan follows: the edits, once they have settled. */
  trimApplied: Trim | null
  /** Which part of a split file this is (its name says so); null for a whole file. */
  part: number | null
  /** A crop box of one's own, over the picture as shown; null for none. */
  box: Box | null
  /** Subtitles read from a file for this video, in its own seconds; null for none. */
  subtitles: { name: string; cues: Cue[] } | null
  /** How far the job writing it is, for the plan named. */
  progress: { key: string; fraction: number; pass?: number } | null
  result: VideoResult | null
}

/** Names a plan: the same plan is the same result. Its words and estimate do not count. */
export function planKey(plan: Plan) {
  const {
    notes: _notes,
    estimate: _estimate,
    pending: _pending,
    ...rest
  } = plan
  void _notes
  void _estimate
  void _pending
  return JSON.stringify(rest)
}

/** A plan that can be written now, or null. */
export const writable = (plan: Plan | null) =>
  plan && !plan.problem && !plan.pending.length ? plan : null

/** Where a file stands for its current plan. */
export function itemState(item: VideoItem, plan: Plan | null): ItemState {
  if (item.status !== "ready") return item.status
  const ready = writable(plan)
  if (!ready || item.result?.key !== planKey(ready))
    return plan?.problem ? "failed" : "waiting"
  return item.result.error || item.result.problems.length ? "failed" : "done"
}

/** The words under a file's name in the list. */
export function itemMessage(item: VideoItem, plan: Plan | null) {
  if (item.status === "error") return item.message
  if (item.status === "reading") return null
  if (plan?.problem) return plan.problem
  const ready = writable(plan)
  if (!ready) return "Checking what this browser can write…"
  const key = planKey(ready)
  if (item.result?.key === key) {
    if (item.result.error) return item.result.error
    if (item.result.problems.length)
      return `Written, but ${item.result.problems[0].charAt(0).toLowerCase()}${item.result.problems[0].slice(1)}`
    return null
  }
  if (item.progress?.key === key)
    return `Writing… ${Math.round(item.progress.fraction * 100)}%${item.progress.pass && item.progress.pass > 1 ? `, pass ${item.progress.pass} of ${MOST_PASSES}` : ""}`
  return "Waiting…"
}

const clock = (seconds: number) => {
  const whole = Math.round(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, "0")
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`
}

/** For example "MP4 · H.264 · 1920 × 1080 · 30 fps · 1:23". */
export function factsLine(facts: VideoFacts) {
  const parts = [containerLabels[facts.container]]
  if (facts.video) {
    parts.push(
      facts.video.codec ? videoCodecLabels[facts.video.codec] : "video",
      `${facts.video.width} × ${facts.video.height}`
    )
    if (facts.video.frameRate)
      parts.push(
        `${Math.round(facts.video.frameRate * 100) / 100} fps${facts.video.variableRate ? " (varies)" : ""}`
      )
  } else parts.push("sound only")
  parts.push(clock(facts.duration))
  return parts.join(" · ")
}

/** The name a result is saved under; a part's name already says what it is. */
export function outputName(name: string, plan: Plan, part = false) {
  const dot = name.lastIndexOf(".")
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = outputInfo[plan.container].extension
  const same =
    !part && dot > 0 && name.slice(dot + 1).toLowerCase() === extension
  const said = plan.cut ? "-trimmed" : "-converted"
  return `${base}${same ? said : ""}.${extension}`
}

/** A name for one part of a file: `holiday-part-2.mp4`. */
export function partName(name: string, part: number) {
  const dot = name.lastIndexOf(".")
  return dot > 0
    ? `${name.slice(0, dot)}-part-${part}${name.slice(dot)}`
    : `${name}-part-${part}`
}

/**
 * What is kept of a file, split at points: one list of parts for each
 * piece that keeps something. A split part is the file with one more keep
 * step, so it is written, cut and checked like any trim.
 */
export function splitParts(
  kept: Part[] | null,
  points: number[],
  duration: number
) {
  return splitAt(points, duration)
    .map((piece) =>
      keepOnly(kept ?? whole(duration), piece.start, piece.end, duration)
    )
    .filter((parts) => parts.length > 0)
}

/** A file split into files of its own, each keeping its piece; null when there is one piece. */
export function splitItem(
  item: VideoItem,
  points: number[],
  makeId: () => string
): VideoItem[] | null {
  if (!item.facts) return null
  const pieces = splitParts(
    item.trim?.parts ?? null,
    points,
    item.facts.duration
  )
  if (pieces.length < 2) return null
  return pieces.map((parts, index) => {
    const trim: Trim = {
      parts,
      exact: item.trim?.exact ?? false,
      undo: [],
      redo: [],
    }
    return {
      ...item,
      id: makeId(),
      name: partName(item.name, index + 1),
      trim,
      trimApplied: trim,
      part: index + 1,
      progress: null,
      result: null,
    }
  })
}

/** The next job for an idle worker: files to read first, then the selected file, then the rest in order. */
export function nextVideoJob(
  items: VideoItem[],
  planOf: (item: VideoItem) => Plan | null,
  inFlight: ReadonlySet<string>,
  selectedId: string | null
): { item: VideoItem; job: "read" | "convert"; plan: Plan | null } | null {
  const free = items.filter((item) => !inFlight.has(item.id))
  const unread = free.find(
    (item) => item.status === "reading" && item.facts === null
  )
  if (unread) return { item: unread, job: "read", plan: null }
  const waiting = free.flatMap((item) => {
    const plan = writable(item.status === "ready" ? planOf(item) : null)
    return plan && item.result?.key !== planKey(plan) ? [{ item, plan }] : []
  })
  const next =
    waiting.find((one) => one.item.id === selectedId) ?? waiting[0] ?? null
  return next ? { ...next, job: "convert" } : null
}

/** Totals for the summary bar. */
export function videoTotals(
  items: VideoItem[],
  planOf: (item: VideoItem) => Plan | null
) {
  let done = 0
  let pending = 0
  let originalBytes = 0
  let outputBytes = 0
  for (const item of items) {
    const plan = planOf(item)
    const state = itemState(item, plan)
    if (state === "reading" || state === "waiting") pending++
    if (state !== "done" || !item.result?.file) continue
    done++
    originalBytes += item.file.size
    outputBytes += item.result.file.size
  }
  return {
    images: items.length,
    done,
    pending,
    files: done,
    originalBytes,
    outputBytes,
    settled: pending === 0,
  }
}

/** Links and stored files that `previous` held and `current` no longer does, to let go of. */
export function dropped(previous: VideoItem[], current: VideoItem[]) {
  const kept = new Set<string>()
  for (const item of current)
    for (const held of [
      item.result?.url,
      item.result?.downloadUrl,
      item.result?.scratch,
    ])
      if (held) kept.add(held)
  const urls: string[] = []
  const scratch: string[] = []
  for (const item of previous) {
    for (const url of [item.result?.url, item.result?.downloadUrl])
      if (url && !kept.has(url)) urls.push(url)
    if (item.result?.scratch && !kept.has(item.result.scratch))
      scratch.push(item.result.scratch)
  }
  return { urls, scratch }
}
