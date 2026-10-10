"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  IconAlertCircle,
  IconClockPlay,
  IconCrop,
  IconInfoCircle,
  IconPlayerPlay,
  IconStack2,
  IconTransform,
} from "@tabler/icons-react"
import { QueueList, type QueueRow } from "@/components/image-batch/queue-list"
import { SummaryBar } from "@/components/image-batch/summary-bar"
import {
  DropZone,
  type DropZoneCopy,
} from "@/components/image-compressor/drop-zone"
import { videoEncodeSupport } from "@/lib/animation/capability"
import {
  AnimationPool,
  animationPoolSize,
  compareFormats,
} from "@/lib/animation/client"
import { rankSizes } from "@/lib/animation/compare"
import type { AnimationResponse, SourceInput } from "@/lib/animation/protocol"
import {
  defaultSettings,
  frameFormats,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_VIDEO_BYTES,
  noTrim,
  outputSize,
  processingKey,
  settingsProblem,
  targets,
  type AnimationSettings,
  type Target,
  type Trim,
} from "@/lib/animation/settings"
import {
  classify,
  sourceFormats,
  type SourceFormat,
} from "@/lib/animation/source"
import { describeTiming, planFrames, sum } from "@/lib/animation/timeline"
import {
  itemState,
  nextJob,
  queueReducer,
  queueTotals,
  releasedUrls,
  type QueueAction,
  type QueueItem,
} from "@/lib/image-batch/queue"
import { CropOverlay } from "@/components/image-compressor/crop-overlay"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Button } from "@/components/ui/button"
import { MAX_INPUT_BYTES, sizeLabel } from "@/lib/image-compressor/formats"
import {
  aspectPresets,
  aspectValue,
  flipCrop,
  initialCrop,
  orientedSize,
  rotateCrop,
  type AspectPreset,
} from "@/lib/image-compressor/geometry"
import { savingsPercent } from "@/lib/image-compressor/quality"
import { fileName, uniqueNames } from "@/lib/image-resizer/naming"
import { createZip } from "@/lib/image-resizer/zip"
import { DestinationPanel } from "./destination-panel"
import { FormatPanel, type ComparisonState } from "./format-panel"
import { FrameList, type StillFrame } from "./frame-list"
import { OptionsPanel } from "./options-panel"
import { Player, type Playable } from "./player"
import { TimingPanel } from "./timing-panel"

type Item = QueueItem<Target>

const INPUT_ID = "animation-file"
const DEBOUNCE_MS = 350
const ACCEPT =
  "image/*,video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm,.mkv,.apng,.heic,.heif,.jxl"
const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024))
/** Enough of a file to tell what it is; a GIF's second frame can sit well into it. */
const HEAD_BYTES = 8 * 1024 * 1024
/** How long each still shows when an animation is first built from images. */
const STILL_MS = 200
const STILLS_NAME = "animation"
/** Where a video starts when no size or frame rate has been chosen. */
const VIDEO_FPS = 15
const VIDEO_EDGE = 640

const copy: DropZoneCopy = {
  heading: "Drop animations, clips or images",
  dropping: "Drop to add these files",
  body: "Add animated GIF, APNG or WebP files, a short video, or several still images to build an animation. You can also paste with ⌘V or Ctrl+V.",
  inputLabel: "Choose animations, videos or images",
  action: "Choose files",
  limits: `Stays on your device · up to ${MAX_FILES} at once, ${megabytes(MAX_FILE_BYTES)} MB each (video ${megabytes(MAX_VIDEO_BYTES)} MB)`,
}

/** What the worker found when it read an animation. */
interface Facts {
  format: SourceFormat
  durations: number[]
  plays: number
  strip: ImageBitmap | null
}

/** Kept with each finished file. */
interface Extra {
  /** For exported frames: the image format inside the ZIP. */
  frameFormat: string
  frames: number
  duration: number
  plays: number
  note: string | null
}

const seconds = (milliseconds: number) =>
  `${(Math.round(milliseconds / 10) / 100).toFixed(2).replace(/\.?0+$/, "")} s`

const loops = (plays: number) =>
  plays === 0
    ? "loops forever"
    : plays === 1
      ? "plays once"
      : `plays ${plays} times`

/** What the worker should open for an item, and a key that changes when that does. */
function inputOf(
  item: Item,
  stills: StillFrame[] | undefined
): { input: SourceInput; inputKey: string } {
  return stills
    ? {
        input: {
          kind: "stills",
          files: stills.map((frame) => frame.file),
          durations: stills.map((frame) => frame.duration),
        },
        inputKey: JSON.stringify(
          stills.map((frame) => [frame.key, frame.duration])
        ),
      }
    : { input: { kind: "file", file: item.file }, inputKey: item.id }
}

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function AnimationConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [settings, setSettings] = useState<AnimationSettings>(defaultSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, ImageBitmap>>({})
  const [facts, setFacts] = useState<Record<string, Facts>>({})
  const [trims, setTrims] = useState<Record<string, Trim>>({})
  /** An object URL for each original, so the browser can play it. */
  const [originals, setOriginals] = useState<Record<string, string>>({})
  /** For animations built from stills: the images, in order. */
  const [sequences, setSequences] = useState<Record<string, StillFrame[]>>({})
  const [video, setVideo] = useState<{ mp4: boolean; webm: boolean } | null>(
    null
  )
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  /** Something worth knowing that is not an error. */
  const [tip, setTip] = useState("")
  const [cropping, setCropping] = useState(false)
  const [aspect, setAspect] = useState<AspectPreset>("free")
  const [compared, setCompared] = useState<{
    key: string
    state: ComparisonState
  } | null>(null)
  const comparing = useRef<(() => void) | null>(null)
  const [paused, setPaused] = useState(false)
  const [zipping, setZipping] = useState(false)

  const live = useRef({
    items: [] as Item[],
    settings: defaultSettings,
    trims: {} as Record<string, Trim>,
    sequences: {} as Record<string, StillFrame[]>,
    selectedId: null as string | null,
    paused: false,
  })
  const pool = useRef<AnimationPool | null>(null)
  const counter = useRef(0)

  const dispatch = useCallback((action: QueueAction<Target>) => {
    const previous = live.current.items
    const next = queueReducer(previous, action)
    live.current.items = next
    for (const url of releasedUrls(previous, next)) URL.revokeObjectURL(url)
    setItems(next)
  }, [])

  const select = useCallback((id: string | null) => {
    live.current.selectedId = id
    setSelectedId(id)
    // A crop belongs to one animation; choosing another leaves crop mode.
    setCropping(false)
    setAspect("free")
  }, [])

  const resume = () => {
    live.current.paused = false
    setPaused(false)
  }

  const update = useCallback(
    (
      change:
        | Partial<AnimationSettings>
        | ((current: AnimationSettings) => AnimationSettings)
    ) => {
      const current = live.current.settings
      const next =
        typeof change === "function"
          ? change(current)
          : { ...current, ...change }
      // Crops are drawn on the turned picture, so they turn and flip with it.
      const turned = (next.rotation - current.rotation + 360) % 360
      const flipped = {
        x: next.flipX !== current.flipX,
        y: next.flipY !== current.flipY,
      }
      if (turned || flipped.x || flipped.y) {
        const trims = { ...live.current.trims }
        for (const item of live.current.items) {
          const trim = trims[item.id]
          if (!trim?.crop || !item.size) continue
          let crop = trim.crop
          let bounds = orientedSize(item.size, current.rotation)
          for (let quarter = 0; quarter < turned / 90; quarter++) {
            crop = rotateCrop(crop, bounds, "right")
            bounds = { width: bounds.height, height: bounds.width }
          }
          if (flipped.x) crop = flipCrop(crop, bounds, "x")
          if (flipped.y) crop = flipCrop(crop, bounds, "y")
          trims[item.id] = { ...trim, crop }
        }
        live.current.trims = trims
        setTrims(trims)
      }
      live.current.settings = next
      live.current.paused = false
      setPaused(false)
      setSettings(next)
    },
    []
  )

  const handleMessage = useEffectEvent((message: AnimationResponse) => {
    const exists = live.current.items.some((item) => item.id === message.id)
    if (message.type === "opened") {
      if (!exists) {
        message.thumbnail.close()
        message.strip?.close()
        return
      }
      setThumbnails((current) => ({
        ...current,
        [message.id]: message.thumbnail,
      }))
      setFacts((current) => ({
        ...current,
        [message.id]: {
          format: message.format,
          durations: message.durations,
          plays: message.plays,
          strip: message.strip,
        },
      }))
      // Video frames are many and large. If nothing has been chosen yet, start
      // from settings that suit an animated image, without enlarging anything.
      const current = live.current.settings
      if (
        message.format === "video" &&
        current.fps === null &&
        current.resize === "original"
      ) {
        const rate = describeTiming(message.durations).fps
        const large = Math.max(message.width, message.height) > VIDEO_EDGE
        if (rate > VIDEO_FPS + 1 || large) {
          update({
            fps: rate > VIDEO_FPS + 1 ? VIDEO_FPS : null,
            ...(large
              ? { resize: "longEdge" as const, resizeValue: VIDEO_EDGE }
              : {}),
          })
          setTip(
            `For this video, ${[
              rate > VIDEO_FPS + 1
                ? `the frame rate is set to ${VIDEO_FPS}`
                : "",
              large ? `the longest side to ${VIDEO_EDGE} px` : "",
            ]
              .filter(Boolean)
              .join(" and ")}. Change this under Speed and frames, or Size.`
          )
        }
      }
      dispatch({
        type: "opened",
        id: message.id,
        animated: true,
        size: { width: message.width, height: message.height },
        transparent: message.transparent,
      })
      return
    }
    if (message.type === "progress") {
      if (exists)
        setLabels((current) => ({ ...current, [message.id]: message.label }))
      return
    }
    setLabels((current) => {
      const rest = { ...current }
      delete rest[message.id]
      return rest
    })
    if (!exists) return
    if (message.type === "open-error")
      dispatch({ type: "failed", id: message.id, message: message.message })
    else if (message.type === "error")
      dispatch({
        type: "job-failed",
        id: message.id,
        key: message.key,
        message: message.message,
      })
    else if (message.type === "done") {
      const { bytes, width, height, target, ...rest } = message.output
      const extra: Extra = {
        ...rest,
        frameFormat: frameFormats[live.current.settings.frameFormat].label,
      }
      const blob = new Blob([bytes], { type: targets[target].mime })
      dispatch({
        type: "done",
        id: message.id,
        key: message.key,
        outputs: [
          {
            blob,
            url: URL.createObjectURL(blob),
            format: target,
            width,
            height,
            similarity: null,
            extra,
          },
        ],
      })
    }
  })

  const pickJob = useEffectEvent((cachedId: string | null) => {
    const state = live.current
    if (state.paused || settingsProblem(state.settings)) return null
    const keyFor = (item: Item) =>
      JSON.stringify([
        processingKey(state.settings, state.trims[item.id] ?? noTrim),
        inputOf(item, state.sequences[item.id]).inputKey,
      ])
    const item = nextJob(
      state.items,
      (entry) => (entry.status === "ready" ? keyFor(entry) : null),
      pool.current?.inFlight() ?? new Set<string>(),
      state.selectedId,
      cachedId
    )
    if (!item) return null
    return {
      id: item.id,
      ...inputOf(item, state.sequences[item.id]),
      settings: state.settings,
      trim: state.trims[item.id] ?? noTrim,
      key: keyFor(item),
      describe: item.status === "reading",
    }
  })

  useEffect(() => {
    const instance = new AnimationPool(
      animationPoolSize(navigator.hardwareConcurrency),
      (message) => handleMessage(message),
      (cachedId) => pickJob(cachedId)
    )
    pool.current = instance
    return () => {
      instance.dispose()
      pool.current = null
      comparing.current?.()
    }
  }, [])

  // Offer only the video formats this browser can write.
  useEffect(() => {
    let alive = true
    void videoEncodeSupport().then((support) => {
      if (alive) setVideo(support)
    })
    return () => {
      alive = false
    }
  }, [])

  // Release bitmaps and object URLs when the tool unmounts.
  const held = useRef({ thumbnails, facts, originals, sequences })
  useEffect(() => {
    held.current = { thumbnails, facts, originals, sequences }
  }, [thumbnails, facts, originals, sequences])
  useEffect(
    () => () => {
      for (const bitmap of Object.values(held.current.thumbnails))
        bitmap.close()
      for (const fact of Object.values(held.current.facts)) fact.strip?.close()
      for (const url of Object.values(held.current.originals))
        URL.revokeObjectURL(url)
      for (const frames of Object.values(held.current.sequences))
        for (const frame of frames) URL.revokeObjectURL(frame.url)
      for (const url of releasedUrls(live.current.items, []))
        URL.revokeObjectURL(url)
    },
    []
  )

  // Convert again shortly after the settings or a trim settle.
  const problem = settingsProblem(settings)
  const settingsKey = processingKey(settings, noTrim)
  const trimsKey = JSON.stringify(trims)
  const sequencesKey = JSON.stringify(
    Object.entries(sequences).map(([id, frames]) => [
      id,
      frames.map((frame) => [frame.key, frame.duration]),
    ])
  )
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => {
      pool.current?.supersede()
      pool.current?.kick()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settingsKey, trimsKey, sequencesKey, paused])

  /** Replace an animation's stills; the worker reads the new set. */
  const setFrames = useCallback(
    (id: string, frames: StillFrame[]) => {
      const before = live.current.sequences[id] ?? []
      const kept = new Set(frames.map((frame) => frame.url))
      for (const frame of before)
        if (!kept.has(frame.url)) URL.revokeObjectURL(frame.url)
      const next = { ...live.current.sequences, [id]: frames }
      live.current.sequences = next
      setSequences(next)
      // Times in the old order mean nothing in the new one.
      const trims = { ...live.current.trims }
      delete trims[id]
      live.current.trims = trims
      setTrims(trims)
      dispatch({ type: "reread", id })
      live.current.paused = false
      setPaused(false)
    },
    [dispatch]
  )

  const addFiles = useCallback(
    async (files: File[]) => {
      setNotice("")
      setTip("")
      const kinds = await Promise.all(
        files.map(async (file) =>
          classify(
            new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
          )
        )
      )
      const stills = files
        .filter(
          (file, index) =>
            kinds[index] === "still" && file.size <= MAX_INPUT_BYTES
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true })
        )
        .map((file, index) => ({
          key: `still-${++counter.current}-${index}`,
          file,
          duration: STILL_MS,
          url: URL.createObjectURL(file),
        }))
      const selected = live.current.selectedId
      // One image added to an animation that is being built joins it.
      if (
        stills.length &&
        selected &&
        live.current.sequences[selected] &&
        files.length === stills.length
      ) {
        setFrames(selected, [...live.current.sequences[selected], ...stills])
        return
      }
      const added: { id: string; file: File; problem?: string }[] = []
      files.forEach((file, index) => {
        const kind = kinds[index]
        if (kind === "still") return
        const limit = kind === "video" ? MAX_VIDEO_BYTES : MAX_FILE_BYTES
        added.push({
          id: `animation-${++counter.current}`,
          file,
          problem:
            file.size === 0
              ? "That file is empty."
              : kind === "svg"
                ? "SVG is a drawing, not an animation this tool can read."
                : kind === "unknown"
                  ? "Choose an animated GIF, APNG or WebP, a video, or still images."
                  : file.size > limit
                    ? `Choose a file smaller than ${megabytes(limit)} MB.`
                    : undefined,
        })
      })
      const sequenceId =
        stills.length >= 2 ? `animation-${++counter.current}` : null
      if (sequenceId)
        added.push({
          id: sequenceId,
          file: new File([], `${stills.length} images`),
        })
      else if (stills.length === 1) {
        // A single still cannot move on its own.
        URL.revokeObjectURL(stills[0].url)
        added.push({
          id: `animation-${++counter.current}`,
          file: stills[0].file,
          problem:
            "This picture does not move. Add two or more images together to build an animation, or use the image converter for a still image.",
        })
      }
      const room = MAX_FILES - live.current.items.length
      if (added.length > room)
        setNotice(
          `Only ${Math.max(0, room)} more fit in this batch of ${MAX_FILES}.`
        )
      const kept = added.slice(0, Math.max(0, room))
      if (sequenceId && !kept.some((item) => item.id === sequenceId))
        for (const frame of stills) URL.revokeObjectURL(frame.url)
      if (!kept.length) return
      if (sequenceId && kept.some((item) => item.id === sequenceId)) {
        const next = { ...live.current.sequences, [sequenceId]: stills }
        live.current.sequences = next
        setSequences(next)
      }
      dispatch({ type: "add", items: kept })
      if (!live.current.selectedId) select(kept[0].id)
      setOriginals((current) => ({
        ...current,
        ...Object.fromEntries(
          kept
            .filter((item) => item.id !== sequenceId && !item.problem)
            .map(({ id, file }) => [id, URL.createObjectURL(file)])
        ),
      }))
      for (const item of kept)
        if (item.problem)
          dispatch({ type: "failed", id: item.id, message: item.problem })
      pool.current?.kick()
    },
    [dispatch, select, setFrames]
  )

  async function loadSamples() {
    setNotice("")
    try {
      const samples = await Promise.all(
        [
          [
            "/images/samples/coastline-pan.gif",
            "coastline-pan.gif",
            "image/gif",
          ],
          [
            "/images/samples/keepsimp-pulse.webp",
            "keepsimp-pulse.webp",
            "image/webp",
          ],
        ].map(async ([url, name, type]) => {
          const response = await fetch(url)
          if (!response.ok) throw new Error()
          return new File([await response.blob()], name, { type })
        })
      )
      void addFiles(samples)
    } catch {
      setNotice(
        "The samples could not load. Check your connection and try again."
      )
    }
  }

  function forget(id: string) {
    pool.current?.forget(id)
    setThumbnails((current) => {
      current[id]?.close()
      const rest = { ...current }
      delete rest[id]
      return rest
    })
    setFacts((current) => {
      current[id]?.strip?.close()
      const rest = { ...current }
      delete rest[id]
      return rest
    })
    setOriginals((current) => {
      if (current[id]) URL.revokeObjectURL(current[id])
      const rest = { ...current }
      delete rest[id]
      return rest
    })
    setTrims((current) => {
      const rest = { ...current }
      delete rest[id]
      live.current.trims = rest
      return rest
    })
    for (const frame of live.current.sequences[id] ?? [])
      URL.revokeObjectURL(frame.url)
    const rest = { ...live.current.sequences }
    delete rest[id]
    live.current.sequences = rest
    setSequences(rest)
  }

  function remove(id: string) {
    forget(id)
    dispatch({ type: "remove", id })
    if (live.current.selectedId === id)
      select(live.current.items[0]?.id ?? null)
  }

  function clearAll() {
    for (const item of live.current.items) forget(item.id)
    dispatch({ type: "clear" })
    select(null)
    setLabels({})
    setNotice("")
    setTip("")
  }

  function cancel() {
    pool.current?.cancel()
    live.current.paused = true
    setPaused(true)
    setLabels({})
  }

  /** Change when an animation starts and ends, or how it is cropped, keeping the other. */
  function setTrim(id: string, change: Partial<Trim>) {
    const next = {
      ...live.current.trims,
      [id]: { ...noTrim, ...live.current.trims[id], ...change },
    }
    live.current.trims = next
    setTrims(next)
    resume()
  }

  // Paste animations from the clipboard anywhere on the page.
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      const pasted = Array.from(event.clipboardData?.files ?? []).filter(
        (file) =>
          file.type.startsWith("image/") || file.type.startsWith("video/")
      )
      if (!pasted.length) return
      event.preventDefault()
      void addFiles(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [addFiles])

  const keyOf = useMemo(
    () => (item: Item) =>
      item.status === "ready" && !problem
        ? JSON.stringify([
            processingKey(settings, trims[item.id] ?? noTrim),
            inputOf(item, sequences[item.id]).inputKey,
          ])
        : null,
    [settings, trims, sequences, problem]
  )
  /** Bytes that went in: the file, or every still of a built animation. */
  const sizeOf = useMemo(
    () => (item: Item) =>
      sequences[item.id]
        ? sequences[item.id].reduce(
            (total, frame) => total + frame.file.size,
            0
          )
        : item.file.size,
    [sequences]
  )
  const selected = items.find((item) => item.id === selectedId) ?? null
  const selectedState = selected ? itemState(selected, keyOf(selected)) : null
  const selectedOutput =
    selected && selectedState === "done" ? selected.outputs![0] : null
  const selectedFacts = selected ? (facts[selected.id] ?? null) : null
  const selectedTrim = selected ? (trims[selected.id] ?? noTrim) : noTrim

  const { rows, files } = useMemo(() => {
    const done = items.map((item) =>
      itemState(item, keyOf(item)) === "done" ? item.outputs![0] : null
    )
    const names = uniqueNames(
      items.map((item, index) =>
        done[index]
          ? fileName(settings.pattern, {
              // A ZIP of frames or a sprite sheet says so in its name.
              name:
                (sequences[item.id]
                  ? STILLS_NAME
                  : item.file.name.replace(/\.[^.]*$/, "")) +
                (targets[done[index].format].kind === "bundle"
                  ? `-${done[index].format}`
                  : ""),
              width: done[index].width,
              height: done[index].height,
              format: targets[done[index].format].extension,
              index: index + 1,
              preset: "",
            })
          : ""
      )
    )
    const queueRows: QueueRow[] = items.map((item, index) => {
      const state = itemState(item, keyOf(item))
      const output = done[index]
      const fact = facts[item.id]
      const extra = output?.extra as Extra | undefined
      return {
        id: item.id,
        name: item.file.name,
        thumbnail: thumbnails[item.id] ?? null,
        state,
        details: [
          fact && fact.format !== "stills" ? sourceFormats[fact.format] : null,
          item.size ? `${item.size.width} × ${item.size.height}` : null,
          fact && fact.format !== "stills"
            ? `${fact.durations.length} frames`
            : null,
          fact ? seconds(sum(fact.durations)) : null,
          sizeLabel(sizeOf(item)),
        ]
          .filter(Boolean)
          .join(" · "),
        message:
          state === "error"
            ? (item.error ?? null)
            : state === "failed"
              ? (item.jobError ?? null)
              : state === "waiting" && paused
                ? "Paused"
                : state === "waiting" && problem
                  ? "Waiting for settings"
                  : output && extra
                    ? targets[output.format].kind === "bundle"
                      ? `${targets[output.format].label} · ${
                          output.format === "frames"
                            ? `${extra.frames} ${extra.frameFormat} images`
                            : `${extra.frames} frames on ${output.width} × ${output.height}`
                        } · ${sizeLabel(output.blob.size)}`
                      : `${targets[output.format].label} · ${output.width} × ${output.height} · ${sizeLabel(output.blob.size)}`
                    : (labels[item.id] ?? null),
        outputs: output
          ? [
              {
                name: names[index],
                url: output.url,
                width: output.width,
                height: output.height,
                bytes: output.blob.size,
              },
            ]
          : [],
      }
    })
    return {
      rows: queueRows,
      files: items.flatMap((item, index) =>
        done[index]
          ? [{ id: item.id, name: names[index], output: done[index] }]
          : []
      ),
    }
  }, [
    items,
    keyOf,
    settings.pattern,
    thumbnails,
    facts,
    sequences,
    sizeOf,
    labels,
    paused,
    problem,
  ])

  const totals = useMemo(() => {
    const base = queueTotals(items, keyOf)
    // An animation built from stills weighs what its images weigh.
    return {
      ...base,
      originalBytes: items.reduce(
        (total, item) =>
          itemState(item, keyOf(item)) === "done"
            ? total + sizeOf(item)
            : total,
        0
      ),
    }
  }, [items, keyOf, sizeOf])

  // Which original frame each moment of the selected result shows.
  const steps = useMemo(
    () =>
      selectedFacts
        ? planFrames(selectedFacts.durations, {
            start: selectedTrim.start,
            end: selectedTrim.end,
            longest:
              problem || settings.maxSeconds === null
                ? null
                : settings.maxSeconds * 1000,
            // While a setting is invalid, the preview keeps the original timing.
            speed: problem ? 1 : settings.speed,
            fps: problem ? null : settings.fps,
            reverse: settings.reverse,
            boomerang: settings.boomerang,
          })
        : [],
    [
      selectedFacts,
      selectedTrim,
      problem,
      settings.maxSeconds,
      settings.speed,
      settings.fps,
      settings.reverse,
      settings.boomerang,
    ]
  )

  /** Everything a comparison depends on: the animation, its trim and the settings, bar the format. */
  const comparisonKey = selected
    ? JSON.stringify([
        selected.id,
        processingKey(
          { ...settings, target: "gif", sizeLimit: null },
          selectedTrim
        ),
      ])
    : ""

  function runComparison() {
    if (!selected || selected.status !== "ready") return
    const forKey = comparisonKey
    const originalBytes = sizeOf(selected)
    comparing.current?.()
    setCompared({
      key: forKey,
      state: { status: "running", label: "Starting…" },
    })
    const { promise, cancel: stop } = compareFormats(
      {
        input: inputOf(selected, sequences[selected.id]).input,
        settings,
        trim: selectedTrim,
        targets: (["gif", "webp", "apng", "mp4", "webm"] as const).filter(
          (target) =>
            targets[target].kind !== "video" ||
            video?.[target as "mp4" | "webm"]
        ),
      },
      (label) =>
        setCompared((current) =>
          current?.key === forKey
            ? { key: forKey, state: { status: "running", label } }
            : current
        )
    )
    comparing.current = stop
    promise
      .then((results) =>
        setCompared({
          key: forKey,
          state: { status: "done", rows: rankSizes(results, originalBytes) },
        })
      )
      .catch((failure: Error) =>
        setCompared((current) =>
          current?.key === forKey
            ? {
                key: forKey,
                state: { status: "error", message: failure.message },
              }
            : current
        )
      )
  }

  function cancelComparison() {
    comparing.current?.()
    comparing.current = null
    setCompared(null)
  }

  const comparison: ComparisonState =
    selected && compared?.key === comparisonKey
      ? compared.state
      : { status: "idle" }

  async function downloadZip() {
    setZipping(true)
    try {
      const entries = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          data: new Uint8Array(await file.output.blob.arrayBuffer()),
        }))
      )
      download(createZip(entries), "keepsimp-animations.zip", "application/zip")
    } catch {
      setNotice(
        "The ZIP could not be created. Download the animations one by one."
      )
    } finally {
      setZipping(false)
    }
  }

  if (!items.length)
    return (
      <div
        className="grid gap-6 lg:grid-cols-5"
        data-testid="animation-converter"
      >
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <DropZone
            onFiles={(added) => void addFiles(added)}
            onSample={() => void loadSamples()}
            busy={false}
            copy={copy}
            inputId={INPUT_ID}
            formats={[
              "GIF",
              "APNG",
              "WebP",
              "MP4",
              "WebM",
              "MOV",
              "Still images",
            ]}
            accept={ACCEPT}
          />
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
              {[
                {
                  icon: IconTransform,
                  title: "Animations, video and frames",
                  text: "Convert between GIF, WebP and APNG, turn a clip into a GIF or a GIF into a tiny MP4, or export every frame.",
                },
                {
                  icon: IconClockPlay,
                  title: "Trim, speed and direction",
                  text: "Keep the part you want, speed it up or slow it down, lower the frame rate, reverse it or make it a boomerang.",
                },
                {
                  icon: IconPlayerPlay,
                  title: "Compare before you download",
                  text: "Play the result, pause on any frame and drag a slider across the original and the new file.",
                },
                {
                  icon: IconStack2,
                  title: "Build from images, convert in batches",
                  text: `Drop several still images to make an animation from them, or up to ${MAX_FILES} files to convert together.`,
                },
              ].map((item) => (
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

  const extra = (selectedOutput?.extra as Extra | undefined) ?? null
  const single =
    totals.settled && files.length === 1
      ? { url: files[0].output.url, name: files[0].name }
      : null
  const originalTiming = selectedFacts
    ? describeTiming(selectedFacts.durations)
    : null
  const selectedStills = selected ? (sequences[selected.id] ?? null) : null
  const selectedBytes = selected ? sizeOf(selected) : 0
  const saved = selectedOutput
    ? savingsPercent(selectedBytes, selectedOutput.blob.size)
    : 0
  const selectedInput = selected
    ? inputOf(selected, sequences[selected.id])
    : null
  const outputKind = selectedOutput ? targets[selectedOutput.format].kind : null
  const originalKind: Playable = selectedStills
    ? "none"
    : selectedFacts?.format === "video"
      ? "video"
      : "image"
  const baseName = selected
    ? selectedStills
      ? STILLS_NAME
      : selected.file.name.replace(/\.[^.]*$/, "")
    : ""

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="animation-converter"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {cropping && selected?.size && thumbnails[selected.id] ? (
          <div className="space-y-3" data-testid="crop-mode">
            <ChoiceChips
              label="Shape"
              value={aspect}
              onValueChange={(preset: AspectPreset) => {
                setAspect(preset)
                const bounds = orientedSize(selected.size!, settings.rotation)
                const ratio = aspectValue(preset, bounds)
                if (ratio)
                  setTrim(selected.id, { crop: initialCrop(bounds, ratio) })
              }}
              options={aspectPresets.map((preset) => ({
                value: preset,
                label:
                  preset === "free"
                    ? "Free"
                    : preset === "original"
                      ? "Original"
                      : preset,
              }))}
            />
            <CropOverlay
              preview={thumbnails[selected.id]}
              bounds={orientedSize(selected.size, settings.rotation)}
              rotation={settings.rotation}
              flipX={settings.flipX}
              flipY={settings.flipY}
              crop={selectedTrim.crop ?? null}
              aspect={aspectValue(
                aspect,
                orientedSize(selected.size, settings.rotation)
              )}
              onChange={(crop) => setTrim(selected.id, { crop })}
              onReset={() => {
                setAspect("free")
                setTrim(selected.id, { crop: null })
              }}
              onDone={() => setCropping(false)}
            />
          </div>
        ) : selected?.status !== "error" &&
          selected?.size &&
          selectedFacts &&
          selectedInput ? (
          <Player
            key={selected.id}
            original={{
              kind: originalKind,
              url: originals[selected.id] ?? null,
              ...selectedInput,
              size: selected.size,
              durations: selectedFacts.durations,
            }}
            result={
              selectedOutput && outputKind
                ? {
                    kind:
                      outputKind === "video"
                        ? "video"
                        : outputKind === "bundle"
                          ? "none"
                          : "image",
                    url: selectedOutput.url,
                    blob: selectedOutput.blob,
                    size: {
                      width: selectedOutput.width,
                      height: selectedOutput.height,
                    },
                  }
                : null
            }
            steps={steps}
            orientation={{
              rotation: settings.rotation,
              flipX: settings.flipX,
              flipY: settings.flipY,
              crop: selectedTrim.crop ?? null,
              pad:
                settings.resize === "exact" && !problem
                  ? outputSize(selected.size, settings, selectedTrim.crop)
                  : null,
            }}
            originalLabel={`Original · ${sizeLabel(selectedBytes)}`}
            resultLabel={
              selectedOutput
                ? `${targets[selectedOutput.format].label} · ${sizeLabel(selectedOutput.blob.size)}`
                : null
            }
            status={
              (selectedState === "waiting" || selectedState === "reading") &&
              !paused &&
              !problem
                ? (labels[selected.id] ?? "Waiting…")
                : null
            }
            onCancel={cancel}
            frameName={(frame) =>
              `${baseName}-frame-${String(frame).padStart(3, "0")}.png`
            }
          />
        ) : (
          <div
            className="flex h-80 items-center justify-center rounded-xl border bg-muted p-6 text-center text-sm text-muted-foreground sm:h-96"
            role="status"
          >
            {selected?.status === "error"
              ? (selected.error ??
                "This file could not be read. Choose another from the list.")
              : "Reading your animation…"}
          </div>
        )}
        {selected?.status !== "error" &&
          selected?.size &&
          selectedFacts &&
          originalTiming && (
            <dl
              className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]"
              data-testid="facts"
            >
              <dt className="font-medium">Original</dt>
              <dd className="text-muted-foreground">
                {[
                  selectedStills
                    ? `${selectedStills.length} images`
                    : sourceFormats[selectedFacts.format],
                  `${selected.size.width} × ${selected.size.height}`,
                  selectedStills ? null : `${originalTiming.frames} frames`,
                  seconds(originalTiming.duration),
                  `${Math.round(originalTiming.fps * 10) / 10} fps`,
                  // Only animated images say how often they play.
                  originalKind === "image" ? loops(selectedFacts.plays) : null,
                  sizeLabel(selectedBytes),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
              <dt className="font-medium">Result</dt>
              <dd className="text-muted-foreground">
                {selectedOutput && extra
                  ? [
                      targets[selectedOutput.format].label,
                      selectedOutput.format === "frames"
                        ? `${extra.frames} ${extra.frameFormat} images of ${selectedOutput.width} × ${selectedOutput.height}`
                        : `${selectedOutput.width} × ${selectedOutput.height}`,
                      selectedOutput.format === "frames"
                        ? null
                        : `${extra.frames} frames`,
                      seconds(extra.duration),
                      outputKind === "bundle"
                        ? null
                        : `${Math.round(((extra.frames * 1000) / extra.duration) * 10) / 10} fps`,
                      outputKind === "animation" ||
                      selectedOutput.format === "sprite"
                        ? loops(extra.plays)
                        : null,
                      sizeLabel(selectedOutput.blob.size),
                      saved > 0
                        ? `${saved}% smaller`
                        : saved < 0
                          ? `${-saved}% larger`
                          : "same size",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : selectedState === "failed"
                    ? "Not made. See the message in the list below."
                    : problem
                      ? "Waiting for settings"
                      : `About ${
                          outputSize(selected.size, settings, selectedTrim.crop)
                            .width
                        } × ${
                          outputSize(selected.size, settings, selectedTrim.crop)
                            .height
                        }, ${steps.length} frames`}
              </dd>
            </dl>
          )}
        {selected?.status === "ready" && selected.size && !cropping && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setCropping(true)}>
              <IconCrop aria-hidden="true" />
              {selectedTrim.crop ? "Change the crop" : "Crop"}
            </Button>
            {selectedTrim.crop && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="crop-note"
              >
                Cropped to {selectedTrim.crop.width} ×{" "}
                {selectedTrim.crop.height} px. This applies to this animation
                only.
              </p>
            )}
          </div>
        )}
        {selected && selectedStills && (
          <FrameList
            frames={selectedStills}
            onChange={(frames) => setFrames(selected.id, frames)}
            onAdd={(added) => void addFiles(added)}
            accept="image/*,.heic,.heif,.jxl"
          />
        )}
        {extra?.note && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {extra.note}
          </p>
        )}
        {tip && (
          <p
            className="flex items-start gap-2 text-sm text-muted-foreground"
            role="status"
            data-testid="tip"
          >
            <IconInfoCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {tip}
          </p>
        )}
        {paused && (
          <p className="text-sm text-muted-foreground">
            Converting cancelled. Change a setting to start again.
          </p>
        )}
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
          singleLabel={
            files.length === 1 &&
            targets[files[0].output.format].kind === "bundle"
              ? "Download ZIP"
              : files.length === 1 &&
                  targets[files[0].output.format].kind === "video"
                ? "Download video"
                : "Download animation"
          }
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={(added) => void addFiles(added)}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Converting"
          noun="file"
          accept={ACCEPT}
        />

        <QueueList
          rows={rows}
          selectedId={selected?.id ?? null}
          onSelect={select}
          onRemove={remove}
          label="Animations"
        />
      </div>

      <div className="min-w-0 space-y-4 lg:col-span-2">
        <DestinationPanel settings={settings} update={update} />
        <FormatPanel
          settings={settings}
          update={update}
          problem={problem}
          video={video}
          comparison={comparison}
          canCompare={selected?.status === "ready" && !problem}
          onCompare={runComparison}
          onCancelCompare={cancelComparison}
        />
        <TimingPanel
          settings={settings}
          update={update}
          selected={
            selected && selectedFacts && selected.status === "ready"
              ? {
                  name: selected.file.name,
                  strip: selectedFacts.strip,
                  duration: sum(selectedFacts.durations),
                  trim: selectedTrim,
                }
              : null
          }
          onTrim={(trim) => selected && setTrim(selected.id, trim)}
        />
        <OptionsPanel
          settings={settings}
          update={update}
          transparent={items.some((item) => item.transparent)}
          exampleName={
            files.find((file) => file.id === selected?.id)?.name ?? null
          }
        />
      </div>
    </div>
  )
}
