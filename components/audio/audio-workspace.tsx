"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import {
  IconAlertCircle,
  IconCircleCheck,
  IconCut,
  IconFileMusic,
  IconGauge,
  IconVolume,
  IconFilePlus,
  IconInfoCircle,
  IconLock,
  IconMovie,
  IconStack2,
  IconTransform,
} from "@tabler/icons-react"
import type { MetadataTags } from "mediabunny"
import { QueueList, type QueueRow } from "@/components/image-batch/queue-list"
import { SummaryBar } from "@/components/image-batch/summary-bar"
import {
  DropZone,
  type DropZoneCopy,
} from "@/components/image-compressor/drop-zone"
import { Button } from "@/components/ui/button"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { checkResult } from "@/lib/audio/check"
import { AudioPool, audioPoolSize, decodeOnPage } from "@/lib/audio/client"
import {
  ACCEPT,
  containerLabels,
  sniffContainer,
  writtenFormats,
  type Container,
} from "@/lib/audio/formats"
import {
  averageBitrate,
  bitrateLabel,
  channelsLabel,
  codecLabel,
  rateLabel,
  timeLabel,
} from "@/lib/audio/labels"
import { editedBy, lengthOf, type Step } from "@/lib/audio/edits"
import type { ReadFacts } from "@/lib/audio/mediabunny-audio"
import { PeakBuilder, peakLevel, type Peaks } from "@/lib/audio/peaks"
import type { AudioJob, AudioResponse } from "@/lib/audio/protocol"
import {
  audioReducer,
  audioState,
  audioTotals,
  droppedUrls,
  itemKey,
  nextAudioJob,
  stepsOf,
  type AudioItem,
  type AudioResult,
} from "@/lib/audio/queue"
import {
  defaultSettings,
  planFor,
  settingsKey,
  settingsProblem,
  type AudioSettings,
} from "@/lib/audio/settings"
import {
  dbLabel,
  levelSaid,
  loudnessSaid,
  type Level,
  type LevelResult,
} from "@/lib/audio/level"
import { LoudnessMeter, loudnessOf, SILENT } from "@/lib/audio/loudness"
import { peakCount } from "@/lib/audio/view"
import { wavFromPlanes } from "@/lib/audio/wav"
import { sizeLabel } from "@/lib/image-compressor/formats"
import { savingsPercent } from "@/lib/image-compressor/quality"
import { uniqueNames } from "@/lib/image-resizer/naming"
import { createZip } from "@/lib/image-resizer/zip"
import { SettingsPanel } from "./settings-panel"
import { SoundEditor, type EditorFocus } from "./sound-editor"
import { Waveform } from "./waveform"

/** What the workspace is opened for: everything, or one job through a door. */
export type AudioMode =
  | "editor"
  | "converter"
  | "extractor"
  | "trimmer"
  | "ringtone"
  | "normalize"
  | "booster"

/** What the waveform editor is opened for, in each mode; none where it waits to be asked for. */
const EDITING: Record<AudioMode, EditorFocus | null> = {
  editor: "edit",
  trimmer: "trim",
  ringtone: "ringtone",
  converter: null,
  extractor: null,
  normalize: null,
  booster: null,
}

const INPUT_ID = "audio-file"
/** One empty list, so a file with no edits hands the editor the same list each time. */
const NO_CHANGES: Step[][] = []
const DEBOUNCE_MS = 350
/** How many files may be added at once, and how large each may be. */
export const MAX_FILES = 50
export const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024

const COPY: Record<AudioMode, DropZoneCopy> = {
  editor: {
    heading: "Drop sound or video files",
    dropping: "Drop to add these files",
    body: "Trim, fade and change the volume; convert them, or take the sound out of a video. Many at once, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose sound or video files",
    action: "Choose files",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
  converter: {
    heading: "Drop audio files to convert",
    dropping: "Drop to convert these files",
    body: "MP3, M4A, Opus, FLAC, WAV, AIFF and the sound of videos, many at once, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose audio files to convert",
    action: "Choose files",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
  trimmer: {
    heading: "Drop a sound to trim",
    dropping: "Drop to trim these files",
    body: "Choose the part to keep, or cut parts out, to the millisecond, with fades so nothing clicks. MP3, M4A, Opus, FLAC, WAV and videos, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose sound files to trim",
    action: "Choose files",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
  ringtone: {
    heading: "Drop a song to make a ringtone",
    dropping: "Drop to make a ringtone",
    body: "Choose the part you like and it becomes an iPhone ringtone (M4R) or an Android one (MP3), faded at its end. On your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose a song to make a ringtone of",
    action: "Choose a song",
    limits: "Stays on your device · no account",
  },
  normalize: {
    heading: "Drop audio files to normalize",
    dropping: "Drop to normalize these files",
    body: "Each file is measured and brought to the same loudness (−14 LUFS for Spotify, or another target), with peaks kept under −1 dBTP. Many at once, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose audio files to normalize",
    action: "Choose files",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
  booster: {
    heading: "Drop a quiet recording to make it louder",
    dropping: "Drop to make these louder",
    body: "Louder by as many decibels as you choose, with a limiter that keeps the loudest moments from clipping. MP3, M4A, WAV, the sound of videos and more, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose audio files to make louder",
    action: "Choose files",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
  extractor: {
    heading: "Drop a video to take its sound out",
    dropping: "Drop to take the sound out",
    body: "MP4, MOV, WebM or MKV. The sound comes out as it is, or as MP3 or another format, on your device. You can also paste with ⌘V or Ctrl+V.",
    inputLabel: "Choose videos to take the sound out of",
    action: "Choose videos",
    limits: `Stays on your device · up to ${MAX_FILES} files at once`,
  },
}

const ABILITIES = [
  {
    icon: IconCut,
    title: "Trim, fade and change the volume",
    text: "To the millisecond, on a waveform you can zoom; every edit can be undone, and your file is never changed.",
  },
  {
    icon: IconTransform,
    title: "Every common format",
    text: "MP3, M4A (AAC), Opus, FLAC, WAV and iPhone ringtones, from those and from AIFF, Ogg and the sound of videos.",
  },
  {
    icon: IconGauge,
    title: "Loudness to a standard",
    text: "Measured as ITU-R BS.1770 does, normalized to −14 LUFS or another target, with a true-peak limiter so nothing clips.",
  },
  {
    icon: IconMovie,
    title: "Sound out of video",
    text: "Kept exactly as it is, without being encoded again, whenever the format allows; or converted to the format you choose.",
  },
  {
    icon: IconCircleCheck,
    title: "Checked before you download",
    text: "Every file written is opened again and listened to: its length, rate and channels are held against what you asked.",
  },
  {
    icon: IconStack2,
    title: "Many files at once",
    text: "Tags and cover art kept, gapless MP3s, a size limit if you need one, and everything in one ZIP.",
  },
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    text: "Your files are read and written in this browser. No account, no limits.",
  },
]

/** What a page opened for one job says it is, with a way to the whole workspace. */
const FOCUSED: Partial<Record<AudioMode, string>> = {
  converter: "opened for converting audio",
  extractor: "opened for taking the sound out of videos",
  trimmer: "opened for trimming",
  ringtone: "opened for making ringtones",
  normalize: "opened for normalizing loudness",
  booster: "opened for making sound louder",
}

const SAMPLES: Record<AudioMode, { name: string; type: string }[]> = {
  editor: [
    { name: "keepsimp-tune.flac", type: "audio/flac" },
    { name: "keepsimp-clip.mp4", type: "video/mp4" },
  ],
  converter: [{ name: "keepsimp-tune.flac", type: "audio/flac" }],
  extractor: [{ name: "keepsimp-clip.mp4", type: "video/mp4" }],
  trimmer: [{ name: "keepsimp-tune.flac", type: "audio/flac" }],
  ringtone: [{ name: "keepsimp-tune.flac", type: "audio/flac" }],
  normalize: [
    { name: "keepsimp-tune.flac", type: "audio/flac" },
    { name: "keepsimp-clip.mp4", type: "video/mp4" },
  ],
  booster: [{ name: "keepsimp-tune.flac", type: "audio/flac" }],
}

/** The format each mode writes at first. */
const FIRST_FORMAT: Record<AudioMode, AudioSettings["format"]> = {
  editor: "mp3",
  converter: "mp3",
  extractor: "same",
  trimmer: "same",
  ringtone: "m4r",
  normalize: "same",
  booster: "same",
}

/** How loud results are at first in each mode. */
const FIRST_LEVEL: Partial<Record<AudioMode, Partial<Level>>> = {
  normalize: { mode: "loudness" },
  booster: { mode: "louder" },
}

/** The tags of a file, to be written into what the page decoded (whose WAV has none). */
function tagsOf(facts: ReadFacts): MetadataTags {
  const { tags, cover } = facts
  return {
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    albumArtist: tags.albumArtist,
    genre: tags.genre,
    trackNumber: tags.trackNumber,
    comment: tags.comment,
    date: tags.year ? new Date(Date.UTC(tags.year, 0, 1)) : undefined,
    images: cover
      ? [{ data: cover.data, mimeType: cover.mimeType, kind: "coverFront" }]
      : undefined,
  }
}

/** A small picture of a file for the list: its cover, or its waveform. */
async function thumbnailOf(facts: ReadFacts, peaks: Peaks | null) {
  try {
    if (facts.cover)
      return await createImageBitmap(
        new Blob([facts.cover.data as BlobPart], { type: facts.cover.mimeType })
      )
  } catch {
    // A cover that cannot be drawn: the waveform stands in.
  }
  if (!peaks || typeof OffscreenCanvas === "undefined") return null
  const canvas = new OffscreenCanvas(96, 96)
  const context = canvas.getContext("2d")
  if (!context) return null
  // The theme's own colour, as the full-size waveform uses.
  context.fillStyle =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim() || "currentColor"
  for (let x = 0; x < 96; x++) {
    const index = Math.floor((x / 96) * peaks.min.length)
    const high = peaks.max[index] ?? 0
    const low = peaks.min[index] ?? 0
    context.fillRect(x, 48 - high * 44, 1, Math.max(1, (high - low) * 44))
  }
  return canvas.transferToImageBitmap()
}

const baseName = (name: string) => name.replace(/\.[^.]*$/, "") || "audio"

/** The audio workspace: many files read, written by one set of settings, checked and downloaded. */
export function AudioWorkspace({ mode = "editor" }: { mode?: AudioMode }) {
  const [items, dispatchRaw] = useReducer(audioReducer, [])
  const [settings, setSettings] = useState<AudioSettings>(() => ({
    ...defaultSettings,
    format: FIRST_FORMAT[mode],
    level: { ...defaultSettings.level, ...FIRST_LEVEL[mode] },
  }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)
  const [thumbnails, setThumbnails] = useState<
    Record<string, ImageBitmap | null>
  >({})
  const [listening, setListening] = useState<"original" | "result">("original")
  const [played, setPlayed] = useState(0)
  // In the converter and extractor, the editor opens when asked for.
  const [asked, setAsked] = useState(false)
  const focus = EDITING[mode] ?? (asked ? "edit" : null)
  const player = useRef<HTMLAudioElement>(null)
  const containers = useRef(new Map<string, Container>())
  const pool = useRef<AudioPool | null>(null)
  const counter = useRef(0)

  const problem = settingsProblem(settings)
  const key = problem ? null : settingsKey(settings)
  // The newest state, for the pool's callbacks, which outlive renders.
  const live = useRef({ items, key, settings, selectedId })
  useEffect(() => {
    live.current = { items, key, settings, selectedId }
  })

  /** The key a file's result is current for, as things stand now. */
  const keyFor = useCallback((id: string) => {
    const item = live.current.items.find((one) => one.id === id)
    return item ? itemKey(live.current.key, item) : null
  }, [])

  // The pool asks for its next job as soon as a worker answers, before the
  // page has drawn again: it sees each change at once, or it would hand out
  // a file that was just finished.
  const dispatch = useCallback((action: Parameters<typeof audioReducer>[1]) => {
    live.current.items = audioReducer(live.current.items, action)
    dispatchRaw(action)
  }, [])

  // Results let go of are released.
  const previous = useRef(items)
  useEffect(() => {
    for (const url of droppedUrls(previous.current, items))
      URL.revokeObjectURL(url)
    previous.current = items
  }, [items])

  /** Sound the worker cannot decode is decoded here, by the browser's own decoder. */
  const decodeHere = useCallback(
    async (id: string, facts: ReadFacts) => {
      const item = live.current.items.find((one) => one.id === id)
      if (!item) return
      try {
        const { planes, sampleRate } = await decodeOnPage(item.file)
        const frames = planes[0]?.length ?? 0
        const builder = new PeakBuilder(frames, peakCount(frames / sampleRate))
        builder.push(planes)
        const meter = new LoudnessMeter(sampleRate, planes.length)
        meter.push(planes)
        dispatch({
          type: "decoded",
          id,
          decoded: new Blob([wavFromPlanes(planes, sampleRate) as BlobPart], {
            type: "audio/wav",
          }),
        })
        dispatch({
          type: "peaks",
          id,
          peaks: builder.result(),
          loudness: meter.result(),
        })
      } catch {
        dispatch({
          type: "failed",
          id,
          message: `This browser cannot decode this file's sound (${codecLabel(facts.codec)}). Try another browser, such as Chrome or Firefox.`,
        })
      }
    },
    [dispatch]
  )

  const listener = useCallback(
    (message: AudioResponse) => {
      if (message.type === "facts") {
        dispatch({ type: "facts", id: message.id, facts: message.facts })
        if (!message.facts.decodable) void decodeHere(message.id, message.facts)
      } else if (message.type === "progress") {
        if (message.key === keyFor(message.id))
          dispatch({
            type: "progress",
            id: message.id,
            fraction: message.fraction,
          })
      } else if (message.type === "done" && message.job === "read") {
        if (message.peaks)
          dispatch({
            type: "peaks",
            id: message.id,
            peaks: message.peaks,
            loudness: message.loudness,
          })
      } else if (message.type === "done") {
        const item = live.current.items.find((one) => one.id === message.id)
        if (!item?.facts || message.key !== keyFor(message.id)) return
        const { plan } = message
        const format = writtenFormats[plan.format]
        const blob = new Blob([message.bytes as BlobPart], {
          type: format.mime,
        })
        const url = URL.createObjectURL(blob)
        const audible = item.peaks ? peakLevel(item.peaks) > 1e-4 : true
        // The level these results were written at is the one in force.
        const level = live.current.settings.level
        const lossless = format.lossless
        dispatch({
          type: "done",
          id: message.id,
          key: message.key,
          result: {
            blob,
            url,
            // Untyped, so no browser renames it or opens it to play instead.
            downloadUrl: URL.createObjectURL(
              new Blob([blob], { type: "application/octet-stream" })
            ),
            name: `${baseName(item.file.name)}.${format.extension}`,
            plan,
            heard: message.heard,
            level: message.level,
            problems: message.heard
              ? checkResult(
                  {
                    duration: lengthOf(
                      editedBy(item.facts.duration, stepsOf(item))
                    ),
                    sampleRate: plan.sampleRate,
                    channels: plan.channels,
                    copy: plan.copy,
                    audible,
                    bitrate: plan.codec === "mp3" ? plan.bitrate : null,
                    bytes: blob.size,
                    // Held to its loudness unless the page said why not.
                    loudness:
                      level.mode === "loudness" && !message.level?.notes.length
                        ? level.target
                        : null,
                    // Lossy encoders raise peaks a little: only lossless is held to the ceiling.
                    ceiling:
                      lossless && level.mode !== "same" ? level.ceiling : null,
                  },
                  message.heard
                )
              : [],
          },
        })
      } else if (message.type === "open-error")
        dispatch({ type: "failed", id: message.id, message: message.message })
      else if (message.type === "error")
        dispatch({
          type: "job-failed",
          id: message.id,
          key: message.key,
          message: message.message,
        })
    },
    [decodeHere, dispatch, keyFor]
  )

  const next = useCallback((): AudioJob | null => {
    const current = live.current
    const found = nextAudioJob(
      current.items,
      (item) => itemKey(current.key, item),
      pool.current?.inFlight() ?? new Set(),
      current.selectedId
    )
    if (!found) return null
    const { item, job } = found
    const container = containers.current.get(item.id)!
    if (job === "read") return { job, id: item.id, file: item.file, container }
    const facts = item.facts!
    const edits = stepsOf(item)
    const plan = planFor(
      current.settings,
      { ...facts, duration: lengthOf(editedBy(facts.duration, edits)) },
      edits.length > 0
    )
    // Sound the page decoded is written from its WAV; a copy needs no
    // decoding, so it is always taken from the file itself.
    const decoded = plan.copy ? undefined : item.decoded
    return {
      job,
      id: item.id,
      file: decoded ?? item.file,
      container: decoded ? "wav" : container,
      facts: decoded ? { ...facts, kept: null } : facts,
      plan,
      keepTags: current.settings.keepTags,
      level: current.settings.level,
      tags: decoded ? tagsOf(facts) : undefined,
      edits,
      key: itemKey(current.key, item)!,
    }
  }, [])

  useEffect(() => {
    const made = new AudioPool(
      audioPoolSize(navigator.hardwareConcurrency),
      listener,
      next
    )
    pool.current = made
    return () => made.dispose()
  }, [listener, next])

  // Every change of items lets free workers take the next job.
  useEffect(() => {
    pool.current?.kick()
  }, [items])

  // A change of settings outdates the files being written; the newest wins after a pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      pool.current?.supersede()
      pool.current?.kick()
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [key])

  // Thumbnails: the cover, or the waveform once it is known.
  const thumbnailed = useRef(new Set<string>())
  useEffect(() => {
    for (const item of items)
      if (
        item.facts &&
        item.peaks !== undefined &&
        !thumbnailed.current.has(item.id)
      ) {
        const id = item.id
        thumbnailed.current.add(id)
        void thumbnailOf(item.facts, item.peaks).then((bitmap) =>
          setThumbnails((had) => ({ ...had, [id]: bitmap }))
        )
      }
  }, [items])

  const addFiles = useCallback(
    async (files: File[]) => {
      setNotice(null)
      const room = MAX_FILES - live.current.items.length
      if (room <= 0) {
        setNotice(`Up to ${MAX_FILES} files at once. Remove some to add more.`)
        return
      }
      const taken = files.slice(0, room)
      if (files.length > room)
        setNotice(
          `Only the first ${room} files were added: up to ${MAX_FILES} at once.`
        )
      const added: { id: string; file: File }[] = []
      const refused: { id: string; message: string }[] = []
      for (const file of taken) {
        const id = `audio-${++counter.current}`
        added.push({ id, file })
        const head = new Uint8Array(await file.slice(0, 512).arrayBuffer())
        const container = sniffContainer(head)
        if (file.size > MAX_FILE_BYTES)
          refused.push({ id, message: "This file is larger than 4 GB." })
        else if (!container)
          refused.push({
            id,
            message: "This is not a sound or video file that can be read here.",
          })
        else containers.current.set(id, container)
      }
      dispatch({ type: "add", items: added })
      for (const one of refused) dispatch({ type: "failed", ...one })
      if (!live.current.selectedId && added.length) setSelectedId(added[0].id)
    },
    [dispatch]
  )

  // Paste files from the clipboard anywhere on the page.
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const pasted = Array.from(event.clipboardData?.files ?? []).filter(
        (file) =>
          file.type.startsWith("audio/") || file.type.startsWith("video/")
      )
      if (!pasted.length) return
      event.preventDefault()
      void addFiles(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [addFiles])

  async function loadSamples() {
    try {
      const files = await Promise.all(
        SAMPLES[mode].map(async (sample) => {
          const response = await fetch(`/samples/${sample.name}`)
          if (!response.ok) throw new Error()
          return new File([await response.blob()], sample.name, {
            type: sample.type,
          })
        })
      )
      await addFiles(files)
    } catch {
      setNotice("The sample could not be loaded. Add a file of your own.")
    }
  }

  // An edit outdates the file being written; the newest edits win after a pause.
  const editTimers = useRef(new Map<string, number>())
  function edit(action: Parameters<typeof audioReducer>[1] & { id: string }) {
    dispatch(action)
    const timers = editTimers.current
    window.clearTimeout(timers.get(action.id))
    timers.set(
      action.id,
      window.setTimeout(() => {
        timers.delete(action.id)
        if (pool.current?.inFlight().has(action.id))
          pool.current.forget(action.id)
        pool.current?.kick()
      }, DEBOUNCE_MS)
    )
  }

  function remove(id: string) {
    pool.current?.forget(id)
    dispatch({ type: "remove", id })
    if (selectedId === id)
      setSelectedId(items.find((item) => item.id !== id)?.id ?? null)
  }

  function clearAll() {
    for (const item of items) pool.current?.forget(item.id)
    dispatch({ type: "clear" })
    setSelectedId(null)
    setNotice(null)
  }

  const totals = useMemo(
    () => audioTotals(items, (item) => itemKey(key, item)),
    [items, key]
  )
  // The selected original is played from an object URL, released when it changes.
  const shown = items.find((item) => item.id === selectedId) ?? items[0]
  const originalBlob =
    shown && shown.status !== "error" ? (shown.decoded ?? shown.file) : null
  const originalUrl = useMemo(
    () => (originalBlob ? URL.createObjectURL(originalBlob) : null),
    [originalBlob]
  )
  useEffect(
    () => () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
    },
    [originalUrl]
  )
  const finished = items.filter(
    (item) => audioState(item, itemKey(key, item)) === "done"
  )
  const names = uniqueNames(finished.map((item) => item.result!.name))

  async function downloadZip() {
    setZipping(true)
    try {
      const entries = await Promise.all(
        finished.map(async (item, index) => ({
          name: names[index],
          data: new Uint8Array(await item.result!.blob.arrayBuffer()),
        }))
      )
      const zip = createZip(entries)
      const url = URL.createObjectURL(
        new Blob([zip as BlobPart], { type: "application/zip" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = "keepsimp-audio.zip"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setNotice("The ZIP could not be made. Download the files one by one.")
    } finally {
      setZipping(false)
    }
  }

  const rows: QueueRow[] = items.map((item) => {
    const state = audioState(item, itemKey(key, item))
    const facts = item.facts
    const result = state === "done" ? item.result! : null
    const index = finished.indexOf(item)
    return {
      id: item.id,
      name: item.file.name,
      thumbnail: thumbnails[item.id] ?? null,
      state,
      details: facts
        ? [
            facts.hasVideo
              ? `Video, ${codecLabel(facts.codec)} sound`
              : codecLabel(facts.codec),
            timeLabel(facts.duration),
            sizeLabel(item.file.size),
          ].join(" · ")
        : sizeLabel(item.file.size),
      message:
        state === "error"
          ? (item.error ?? null)
          : state === "failed"
            ? (item.jobError ?? null)
            : result
              ? `${writtenFormats[result.plan.format].label} · ${sizeLabel(result.blob.size)}${result.problems.length ? " · see the check" : ""}`
              : state === "waiting" && item.progress !== undefined
                ? `Writing… ${Math.round(item.progress * 100)}%`
                : item.status === "reading" && item.facts
                  ? "Decoding…"
                  : null,
      outputs: result
        ? [
            {
              name: names[index],
              url: result.downloadUrl,
              width: 0,
              height: 0,
              bytes: result.blob.size,
              label: writtenFormats[result.plan.format].label,
            },
          ]
        : [],
    }
  })

  const focused = FOCUSED[mode]

  if (!items.length)
    return (
      <div className="grid gap-6 lg:grid-cols-5" data-testid="audio-workspace">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <DropZone
            onFiles={(added) => void addFiles(added)}
            onSample={() => void loadSamples()}
            busy={false}
            copy={COPY[mode]}
            inputId={INPUT_ID}
            formats={[
              "MP3",
              "M4A",
              "Opus",
              "FLAC",
              "WAV",
              "AIFF",
              "MP4",
              "MOV",
              "WebM",
            ]}
            accept={ACCEPT}
            icon={mode === "extractor" ? IconMovie : IconFileMusic}
          />
          {focused && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="audio-focused"
            >
              This page is the{" "}
              <Link
                href="/dashboard/audio-editor/"
                prefetch={false}
                className="underline"
              >
                Audio editor
              </Link>
              , {focused}.
            </p>
          )}
          {notice && (
            <p role="alert" className="text-sm text-destructive">
              {notice}
            </p>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="section-title">What you can do</h2>
            <ul className="space-y-3 text-sm">
              {ABILITIES.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )

  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const selectedState = audioState(selected, itemKey(key, selected))
  const facts = selected.facts
  const result = selectedState === "done" ? selected.result! : null
  const selectedSteps = stepsOf(selected)
  const plan =
    facts && !problem
      ? planFor(
          settings,
          {
            ...facts,
            duration: lengthOf(editedBy(facts.duration, selectedSteps)),
          },
          selectedSteps.length > 0
        )
      : null
  const playing = listening === "result" && result ? result.url : null
  const source =
    selected.status === "error" || !facts ? null : (playing ?? originalUrl)
  const saved = result
    ? savingsPercent(selected.file.size, result.blob.size)
    : 0
  const single =
    totals.settled && finished.length === 1
      ? { url: finished[0].result!.downloadUrl, name: names[0] }
      : null

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="audio-workspace"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        <section
          aria-label={`${selected.file.name}`}
          className="space-y-3 rounded-xl border bg-card p-4"
          data-testid="audio-selected"
        >
          <h2 className="truncate font-heading text-base font-medium">
            {selected.file.name}
          </h2>
          {selected.status === "error" ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-sm text-destructive"
            >
              <IconAlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {selected.error}
            </p>
          ) : !facts ? (
            <p role="status" className="text-sm text-muted-foreground">
              Reading the file…
            </p>
          ) : (
            <>
              <div className="flex gap-3">
                {facts.cover && thumbnails[selected.id] && (
                  <CoverArt facts={facts} />
                )}
                <dl
                  className="grid min-w-0 flex-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]"
                  data-testid="audio-facts"
                >
                  <dt className="font-medium">Original</dt>
                  <dd className="text-muted-foreground">
                    {[
                      facts.hasVideo
                        ? `${containerLabels[facts.container]} video with ${codecLabel(facts.codec)} sound`
                        : containerLabels[facts.container] ===
                            codecLabel(facts.codec)
                          ? codecLabel(facts.codec)
                          : `${containerLabels[facts.container]} · ${codecLabel(facts.codec)}`,
                      timeLabel(facts.duration, true),
                      rateLabel(facts.sampleRate),
                      channelsLabel(facts.channels),
                      facts.hasVideo
                        ? null
                        : bitrateLabel(
                            averageBitrate(
                              selected.file.size,
                              facts.duration
                            ) ?? 0
                          ),
                      sizeLabel(selected.file.size),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                  <dt className="font-medium">Result</dt>
                  <dd
                    className="text-muted-foreground"
                    data-testid="audio-result"
                  >
                    {result
                      ? [
                          writtenFormats[result.plan.format].label,
                          result.plan.copy ? "copied as it is" : null,
                          result.heard
                            ? timeLabel(result.heard.duration, true)
                            : null,
                          rateLabel(result.plan.sampleRate),
                          channelsLabel(result.plan.channels),
                          result.plan.bitrate
                            ? bitrateLabel(result.plan.bitrate)
                            : null,
                          sizeLabel(result.blob.size),
                          saved > 0
                            ? `${saved}% smaller`
                            : saved < 0
                              ? `${-saved}% larger`
                              : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : selectedState === "failed"
                        ? (selected.jobError ?? "Not written.")
                        : problem
                          ? "Waiting for settings"
                          : selected.progress !== undefined
                            ? `Writing… ${Math.round(selected.progress * 100)}%`
                            : "Waiting…"}
                  </dd>
                  {selected.loudness && (
                    <>
                      <dt className="font-medium">Loudness</dt>
                      <dd
                        className="text-muted-foreground"
                        data-testid="audio-loudness"
                      >
                        {loudnessSaid(loudnessOf(selected.loudness))}
                      </dd>
                    </>
                  )}
                  {Object.values(facts.tags).some(Boolean) && (
                    <>
                      <dt className="font-medium">Tags</dt>
                      <dd
                        className="text-muted-foreground"
                        data-testid="audio-tags"
                      >
                        {[
                          facts.tags.title,
                          facts.tags.artist,
                          facts.tags.album,
                          facts.tags.year,
                          facts.tags.genre,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Other tags only"}
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {focus ? (
                <>
                  <SoundEditor
                    key={selected.id}
                    name={selected.file.name}
                    duration={facts.duration}
                    peaks={selected.peaks ?? null}
                    loudness={selected.loudness ?? null}
                    url={originalUrl}
                    changes={selected.changes ?? NO_CHANGES}
                    canRedo={Boolean(selected.redo?.length)}
                    focus={focus}
                    onChange={(steps: Step[]) =>
                      edit({ type: "change", id: selected.id, steps })
                    }
                    onUndo={() => edit({ type: "undo", id: selected.id })}
                    onRedo={() => edit({ type: "redo", id: selected.id })}
                    onReset={() => edit({ type: "reset", id: selected.id })}
                    onFormat={(format) =>
                      setSettings((current) => ({ ...current, format }))
                    }
                  />
                  {result && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Listen to the result
                      </p>
                      <audio
                        key={result.url}
                        src={result.url}
                        controls
                        preload="metadata"
                        className="block h-14 w-full"
                        data-testid="audio-player"
                        aria-label="Result"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Waveform
                    peaks={selected.peaks ?? null}
                    progress={played}
                    label={`Waveform of ${selected.file.name}`}
                    onSeek={(fraction) => {
                      const element = player.current
                      if (element && Number.isFinite(element.duration))
                        element.currentTime = fraction * element.duration
                    }}
                  />
                  {result && (
                    <ChoiceChips
                      label="Listen to"
                      value={listening}
                      onValueChange={(value) => {
                        setListening(value)
                        setPlayed(0)
                      }}
                      options={[
                        { value: "original", label: "Original" },
                        { value: "result", label: "Result" },
                      ]}
                    />
                  )}
                  {source && (
                    <audio
                      ref={player}
                      key={source}
                      src={source}
                      controls
                      preload="metadata"
                      // A fixed height: the player grows when it has read the
                      // file, which would move everything under it.
                      className="block h-14 w-full"
                      data-testid="audio-player"
                      aria-label={
                        listening === "result" && result ? "Result" : "Original"
                      }
                      onTimeUpdate={(event) => {
                        const element = event.currentTarget
                        setPlayed(
                          Number.isFinite(element.duration) &&
                            element.duration > 0
                            ? element.currentTime / element.duration
                            : 0
                        )
                      }}
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAsked(true)}
                  >
                    <IconCut data-icon="inline-start" aria-hidden="true" />
                    Trim or edit the sound
                  </Button>
                </>
              )}
              {selected.progress !== undefined &&
                selectedState === "waiting" && (
                  <div
                    role="progressbar"
                    aria-label="Writing"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(selected.progress * 100)}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                      style={{
                        width: `${Math.round(selected.progress * 100)}%`,
                      }}
                    />
                  </div>
                )}
              {result && <Check result={result} />}
              {result?.level && <LevelDone level={result.level} />}
              {plan && plan.notes.length > 0 && (
                <ul
                  className="space-y-1 text-sm text-muted-foreground"
                  data-testid="audio-notes"
                >
                  {plan.notes.map((note) => (
                    <li key={note} className="flex items-start gap-2">
                      <IconInfoCircle
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                      />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        {notice && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <IconAlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {notice}
          </p>
        )}

        <SummaryBar
          totals={totals}
          single={single}
          singleLabel="Download file"
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={(added) => void addFiles(added)}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Converting"
          noun="file"
          accept={ACCEPT}
          addIcon={IconFilePlus}
        />

        <QueueList
          rows={rows}
          selectedId={selected.id}
          onSelect={(id) => {
            setSelectedId(id)
            setListening("original")
            setPlayed(0)
          }}
          onRemove={remove}
          label="Files"
        />
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <SettingsPanel
          settings={settings}
          update={(change) =>
            setSettings((current) => ({ ...current, ...change }))
          }
          problem={problem}
        />
      </div>
    </div>
  )
}

/** A file's cover art. */
function CoverArt({ facts }: { facts: ReadFacts }) {
  const url = useMemo(
    () =>
      facts.cover
        ? URL.createObjectURL(
            new Blob([facts.cover.data as BlobPart], {
              type: facts.cover.mimeType,
            })
          )
        : null,
    [facts.cover]
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a picture made on the device
    <img
      src={url}
      alt="Cover art"
      className="size-20 shrink-0 rounded-md border object-cover"
      data-testid="audio-cover"
    />
  )
}

/** What the check found when the result was heard back. */
function Check({ result }: { result: NonNullable<AudioItem["result"]> }) {
  if (!result.heard)
    return (
      <p
        className="flex items-start gap-2 text-sm text-muted-foreground"
        data-testid="audio-check"
      >
        <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Not listened to here: this browser cannot decode{" "}
        {writtenFormats[result.plan.format].label} to check it. Other programs
        play it.
      </p>
    )
  if (result.problems.length)
    return (
      <div
        role="alert"
        className="space-y-1 text-sm text-destructive"
        data-testid="audio-check"
      >
        <p className="flex items-start gap-2 font-medium">
          <IconAlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          The file written is not quite as asked:
        </p>
        <ul className="list-disc pl-10">
          {result.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    )
  return (
    <p className="flex items-start gap-2 text-sm" data-testid="audio-check">
      <IconCircleCheck
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      Checked: the file written was opened again and listened to. It is{" "}
      {timeLabel(result.heard.duration, true)} long,{" "}
      {rateLabel(result.heard.sampleRate)},{" "}
      {channelsLabel(result.heard.channels).toLowerCase()}, as asked.
      {measuredSaid(result.heard)}
    </p>
  )
}

/** What the check measured of a result's loudness, as a sentence after the check's. */
function measuredSaid(heard: NonNullable<AudioResult["heard"]>) {
  const loudness = heard.loudness
  if (!loudness || loudness.integrated === SILENT) return null
  return ` It measures ${dbLabel(loudness.integrated)} LUFS, with peaks up to ${dbLabel(loudness.truePeak)} dBTP.`
}

/** What was done to a result's level, and why not more. */
function LevelDone({ level }: { level: LevelResult }) {
  return (
    <div
      className="space-y-1 text-sm text-muted-foreground"
      data-testid="audio-level"
    >
      <p className="flex items-start gap-2">
        <IconVolume className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {levelSaid(level)}
      </p>
      {level.notes.map((note) => (
        <p key={note} className="pl-6">
          {note}
        </p>
      ))}
    </div>
  )
}
