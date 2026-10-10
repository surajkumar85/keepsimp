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
import { AnimationPool, animationPoolSize } from "@/lib/animation/client"
import type { AnimationResponse } from "@/lib/animation/protocol"
import {
  defaultSettings,
  MAX_FILE_BYTES,
  MAX_FILES,
  noTrim,
  outputSize,
  processingKey,
  settingsProblem,
  targets,
  type AnimationSettings,
  type Target,
  type Trim,
} from "@/lib/animation/settings"
import { sourceFormats, type SourceFormat } from "@/lib/animation/source"
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
import { sizeLabel } from "@/lib/image-compressor/formats"
import { savingsPercent } from "@/lib/image-compressor/quality"
import { fileName, uniqueNames } from "@/lib/image-resizer/naming"
import { createZip } from "@/lib/image-resizer/zip"
import { FormatPanel } from "./format-panel"
import { OptionsPanel } from "./options-panel"
import { Player } from "./player"
import { TimingPanel } from "./timing-panel"

type Item = QueueItem<Target>

const INPUT_ID = "animation-file"
const DEBOUNCE_MS = 350
const ACCEPT = "image/gif,image/png,image/apng,image/webp,.gif,.png,.apng,.webp"
const megabytes = Math.round(MAX_FILE_BYTES / (1024 * 1024))

const copy: DropZoneCopy = {
  heading: "Drop animations to convert",
  dropping: "Drop to add these animations",
  body: "Add one animated GIF, APNG or WebP, or a whole batch. You can also paste one with ⌘V or Ctrl+V.",
  inputLabel: "Choose animations to convert",
  action: "Choose animations",
  limits: `Stays on your device · up to ${MAX_FILES} animations, ${megabytes} MB each`,
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
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState("")
  const [paused, setPaused] = useState(false)
  const [zipping, setZipping] = useState(false)

  const live = useRef({
    items: [] as Item[],
    settings: defaultSettings,
    trims: {} as Record<string, Trim>,
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
      dispatch({
        type: "opened",
        id: message.id,
        format: message.format === "apng" ? "png" : message.format,
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
      const { bytes, width, height, ...extra } = message.output
      // The key names the format the bytes were made for.
      const target = (JSON.parse(message.key) as AnimationSettings).target
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
            extra: extra satisfies Extra,
          },
        ],
      })
    }
  })

  const pickJob = useEffectEvent((cachedId: string | null) => {
    const state = live.current
    if (state.paused || settingsProblem(state.settings)) return null
    const keyFor = (id: string) =>
      processingKey(state.settings, state.trims[id] ?? noTrim)
    const item = nextJob(
      state.items,
      (entry) => (entry.status === "ready" ? keyFor(entry.id) : null),
      pool.current?.inFlight() ?? new Set<string>(),
      state.selectedId,
      cachedId
    )
    if (!item) return null
    return {
      id: item.id,
      file: item.file,
      settings: state.settings,
      trim: state.trims[item.id] ?? noTrim,
      key: keyFor(item.id),
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
    }
  }, [])

  // Release bitmaps and object URLs when the tool unmounts.
  const held = useRef({ thumbnails, facts, originals })
  useEffect(() => {
    held.current = { thumbnails, facts, originals }
  }, [thumbnails, facts, originals])
  useEffect(
    () => () => {
      for (const bitmap of Object.values(held.current.thumbnails))
        bitmap.close()
      for (const fact of Object.values(held.current.facts)) fact.strip?.close()
      for (const url of Object.values(held.current.originals))
        URL.revokeObjectURL(url)
      for (const url of releasedUrls(live.current.items, []))
        URL.revokeObjectURL(url)
    },
    []
  )

  // Convert again shortly after the settings or a trim settle.
  const problem = settingsProblem(settings)
  const settingsKey = processingKey(settings, noTrim)
  const trimsKey = JSON.stringify(trims)
  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => {
      pool.current?.supersede()
      pool.current?.kick()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settingsKey, trimsKey, paused])

  const addFiles = useCallback(
    (files: File[]) => {
      const room = MAX_FILES - live.current.items.length
      setNotice(
        files.length > room
          ? `Only ${Math.max(0, room)} more animation${room === 1 ? "" : "s"} fit in this batch of ${MAX_FILES}.`
          : ""
      )
      const added = files
        .slice(0, Math.max(0, room))
        .map((file) => ({ id: `animation-${++counter.current}`, file }))
      if (!added.length) return
      dispatch({ type: "add", items: added })
      if (!live.current.selectedId) select(added[0].id)
      setOriginals((current) => ({
        ...current,
        ...Object.fromEntries(
          added.map(({ id, file }) => [id, URL.createObjectURL(file)])
        ),
      }))
      for (const { id, file } of added)
        if (file.size === 0)
          dispatch({ type: "failed", id, message: "That file is empty." })
        else if (file.size > MAX_FILE_BYTES)
          dispatch({
            type: "failed",
            id,
            message: `Choose an animation smaller than ${megabytes} MB.`,
          })
      pool.current?.kick()
    },
    [dispatch, select]
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
      addFiles(samples)
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
  }

  function cancel() {
    pool.current?.cancel()
    live.current.paused = true
    setPaused(true)
    setLabels({})
  }

  function setTrim(id: string, trim: Trim) {
    const next = { ...live.current.trims, [id]: trim }
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
        (file) => file.type.startsWith("image/")
      )
      if (!pasted.length) return
      event.preventDefault()
      addFiles(pasted)
    }
    document.addEventListener("paste", paste)
    return () => document.removeEventListener("paste", paste)
  }, [addFiles])

  const keyOf = useMemo(
    () => (item: Item) =>
      item.status === "ready" && !problem
        ? processingKey(settings, trims[item.id] ?? noTrim)
        : null,
    [settings, trims, problem]
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
              name: item.file.name,
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
      return {
        id: item.id,
        name: item.file.name,
        thumbnail: thumbnails[item.id] ?? null,
        state,
        details: [
          fact ? sourceFormats[fact.format] : null,
          item.size ? `${item.size.width} × ${item.size.height}` : null,
          fact ? `${fact.durations.length} frames` : null,
          fact ? seconds(sum(fact.durations)) : null,
          sizeLabel(item.file.size),
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
                  : output
                    ? `${targets[output.format].label} · ${output.width} × ${output.height} · ${sizeLabel(output.blob.size)}`
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
    labels,
    paused,
    problem,
  ])

  const totals = useMemo(() => queueTotals(items, keyOf), [items, keyOf])

  // Which original frame each moment of the selected result shows.
  const steps = useMemo(
    () =>
      selectedFacts
        ? planFrames(selectedFacts.durations, {
            start: selectedTrim.start,
            end: selectedTrim.end,
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
      settings.speed,
      settings.fps,
      settings.reverse,
      settings.boomerang,
    ]
  )

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
            onFiles={addFiles}
            onSample={() => void loadSamples()}
            busy={false}
            copy={copy}
            inputId={INPUT_ID}
            formats={["GIF", "APNG", "WebP"]}
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
                  title: "GIF, WebP and APNG, both ways",
                  text: "Turn a heavy GIF into a small WebP, or anything into a GIF that plays everywhere. Every frame is kept moving.",
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
                  title: "Batches",
                  text: `Up to ${MAX_FILES} animations with the same settings, downloaded one by one or as a ZIP.`,
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
  const saved = selectedOutput
    ? savingsPercent(selected!.file.size, selectedOutput.blob.size)
    : 0

  return (
    <div
      className="grid gap-6 lg:grid-cols-5"
      data-testid="animation-converter"
      data-settled={(totals.settled && !zipping) || undefined}
    >
      <div className="min-w-0 space-y-4 lg:col-span-3">
        {selected?.size && selectedFacts && originals[selected.id] ? (
          <Player
            key={selected.id}
            original={{
              url: originals[selected.id],
              file: selected.file,
              size: selected.size,
              durations: selectedFacts.durations,
            }}
            result={
              selectedOutput && extra
                ? {
                    url: selectedOutput.url,
                    blob: selectedOutput.blob,
                    size: {
                      width: selectedOutput.width,
                      height: selectedOutput.height,
                    },
                    duration: extra.duration,
                  }
                : null
            }
            steps={steps}
            orientation={{
              rotation: settings.rotation,
              flipX: settings.flipX,
              flipY: settings.flipY,
            }}
            originalLabel={`Original · ${sizeLabel(selected.file.size)}`}
            resultLabel={
              selectedOutput
                ? `${targets[selectedOutput.format].label} · ${sizeLabel(selectedOutput.blob.size)}`
                : null
            }
            status={
              selectedState === "waiting" && !paused && !problem
                ? (labels[selected.id] ?? "Waiting…")
                : null
            }
            onCancel={cancel}
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
        {selected?.size && selectedFacts && originalTiming && (
          <dl
            className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]"
            data-testid="facts"
          >
            <dt className="font-medium">Original</dt>
            <dd className="text-muted-foreground">
              {[
                sourceFormats[selectedFacts.format],
                `${selected.size.width} × ${selected.size.height}`,
                `${originalTiming.frames} frames`,
                seconds(originalTiming.duration),
                `${Math.round(originalTiming.fps * 10) / 10} fps`,
                loops(selectedFacts.plays),
                sizeLabel(selected.file.size),
              ].join(" · ")}
            </dd>
            <dt className="font-medium">Result</dt>
            <dd className="text-muted-foreground">
              {selectedOutput && extra
                ? [
                    targets[selectedOutput.format].label,
                    `${selectedOutput.width} × ${selectedOutput.height}`,
                    `${extra.frames} frames`,
                    seconds(extra.duration),
                    `${Math.round(((extra.frames * 1000) / extra.duration) * 10) / 10} fps`,
                    loops(extra.plays),
                    sizeLabel(selectedOutput.blob.size),
                    saved > 0
                      ? `${saved}% smaller`
                      : saved < 0
                        ? `${-saved}% larger`
                        : "same size",
                  ].join(" · ")
                : selectedState === "failed"
                  ? "Not made. See the message in the list below."
                  : problem
                    ? "Waiting for settings"
                    : `About ${
                        outputSize(selected.size, settings).width
                      } × ${outputSize(selected.size, settings).height}, ${steps.length} frames`}
            </dd>
          </dl>
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
          singleLabel="Download animation"
          zipping={zipping}
          onZip={() => void downloadZip()}
          onFiles={addFiles}
          onClear={clearAll}
          inputId={INPUT_ID}
          verb="Converting"
          noun="animation"
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
        <FormatPanel settings={settings} update={update} problem={problem} />
        <TimingPanel
          settings={settings}
          update={update}
          selected={
            selected && selectedFacts
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
